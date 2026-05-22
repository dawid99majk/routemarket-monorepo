// pgmq queue dispatcher — drains auth_emails + transactional_emails and
// delivers through the self-hosted SMTP adapter.
//
// Replaces the previous Lovable Email API client.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD / SMTP_FROM

import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendSmtpEmail, isTransientSmtpError } from '../_shared/smtp.ts'

const MAX_RETRIES = 5
const DEFAULT_BATCH_SIZE = 10
const DEFAULT_SEND_DELAY_MS = 200
const DEFAULT_AUTH_TTL_MINUTES = 15
const DEFAULT_TRANSACTIONAL_TTL_MINUTES = 60

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1]
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    return JSON.parse(atob(payload)) as Record<string, unknown>
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Defense in depth: only service-role callers may drain the queue.
  const token = authHeader.slice('Bearer '.length).trim()
  const claims = parseJwtClaims(token)
  if (claims?.role !== 'service_role') {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: state } = await supabase
    .from('email_send_state')
    .select(
      'retry_after_until, batch_size, send_delay_ms, auth_email_ttl_minutes, transactional_email_ttl_minutes',
    )
    .single()

  if (state?.retry_after_until && new Date(state.retry_after_until) > new Date()) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'rate_limited' }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  const batchSize = state?.batch_size ?? DEFAULT_BATCH_SIZE
  const sendDelayMs = state?.send_delay_ms ?? DEFAULT_SEND_DELAY_MS
  const ttlMinutes: Record<string, number> = {
    auth_emails: state?.auth_email_ttl_minutes ?? DEFAULT_AUTH_TTL_MINUTES,
    transactional_emails:
      state?.transactional_email_ttl_minutes ?? DEFAULT_TRANSACTIONAL_TTL_MINUTES,
  }

  let totalProcessed = 0

  for (const queue of ['auth_emails', 'transactional_emails']) {
    const dlq = `${queue}_dlq`
    const { data: messages, error: readError } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: batchSize,
      vt: 30,
    })

    if (readError) {
      console.error('Failed to read email batch', { queue, error: readError })
      continue
    }
    if (!messages?.length) continue

    // Track failed-attempt counts per message_id from email_send_log.
    const messageIds = Array.from(
      new Set(
        messages
          .map((m: any) =>
            typeof m?.message?.message_id === 'string' ? m.message.message_id : null,
          )
          .filter((id: string | null): id is string => Boolean(id)),
      ),
    )
    const failedAttempts = new Map<string, number>()
    if (messageIds.length > 0) {
      const { data: rows } = await supabase
        .from('email_send_log')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('status', 'failed')
      for (const row of rows ?? []) {
        const id = row?.message_id
        if (typeof id === 'string') failedAttempts.set(id, (failedAttempts.get(id) ?? 0) + 1)
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const payload = msg.message
      const fails = typeof payload?.message_id === 'string'
        ? (failedAttempts.get(payload.message_id) ?? 0)
        : 0

      // TTL expiry → DLQ
      if (payload.queued_at) {
        const ageMs = Date.now() - new Date(payload.queued_at).getTime()
        const maxAgeMs = ttlMinutes[queue] * 60 * 1000
        if (ageMs > maxAgeMs) {
          await supabase.from('email_send_log').insert({
            message_id: payload.message_id,
            template_name: payload.label || queue,
            recipient_email: payload.to,
            status: 'dlq',
            error_message: `TTL exceeded (${ttlMinutes[queue]} minutes)`,
          })
          await supabase.rpc('move_to_dlq', {
            source_queue: queue,
            dlq_name: dlq,
            message_id: msg.msg_id,
            payload,
          })
          continue
        }
      }

      // Max retries → DLQ
      if (fails >= MAX_RETRIES) {
        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'dlq',
          error_message: `Max retries (${MAX_RETRIES}) exceeded`,
        })
        await supabase.rpc('move_to_dlq', {
          source_queue: queue,
          dlq_name: dlq,
          message_id: msg.msg_id,
          payload,
        })
        continue
      }

      // Skip if already sent (race)
      if (payload.message_id) {
        const { data: dup } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', payload.message_id)
          .eq('status', 'sent')
          .maybeSingle()
        if (dup) {
          await supabase.rpc('delete_email', { queue_name: queue, message_id: msg.msg_id })
          continue
        }
      }

      try {
        await sendSmtpEmail({
          to: payload.to,
          from: payload.from,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        })

        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'sent',
        })
        await supabase.rpc('delete_email', { queue_name: queue, message_id: msg.msg_id })
        totalProcessed++
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error('SMTP send failed', { queue, msg_id: msg.msg_id, error: errorMsg })

        await supabase.from('email_send_log').insert({
          message_id: payload.message_id,
          template_name: payload.label || queue,
          recipient_email: payload.to,
          status: 'failed',
          error_message: errorMsg.slice(0, 1000),
        })

        if (!isTransientSmtpError(error)) {
          // Permanent failure → don't retry, send to DLQ on next pass via fail counter.
          // Leave message visible-after-VT so retry budget increments naturally.
        }
        // Non-fatal: message stays invisible until VT expires, then retried.
      }

      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }
  }

  return new Response(
    JSON.stringify({ processed: totalProcessed }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})