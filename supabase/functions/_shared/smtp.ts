// Minimal SMTP adapter for self-hosted deployments.
// Replaces @lovable.dev/email-js with a plain SMTP transport (denomailer).
//
// Required environment variables:
//   SMTP_HOST           e.g. smtp.eu.mailgun.org / smtp.sendgrid.net / your VPS relay
//   SMTP_PORT           e.g. 465 (TLS) or 587 (STARTTLS)
//   SMTP_USERNAME       SMTP auth username
//   SMTP_PASSWORD       SMTP auth password
//   SMTP_FROM           Default From address, e.g. "RouteMarket <noreply@routemarket.io>"
//   SMTP_TLS            "true" (default) for implicit TLS on 465, set "false" for STARTTLS on 587
//
// Usage:
//   import { sendSmtpEmail } from '../_shared/smtp.ts'
//   await sendSmtpEmail({ to, subject, html, text, from? })

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
}

let cachedClient: SMTPClient | null = null

function getClient(): SMTPClient {
  if (cachedClient) return cachedClient

  const host = Deno.env.get('SMTP_HOST')
  const portStr = Deno.env.get('SMTP_PORT') ?? '465'
  const username = Deno.env.get('SMTP_USERNAME')
  const password = Deno.env.get('SMTP_PASSWORD')
  const tlsEnv = (Deno.env.get('SMTP_TLS') ?? 'true').toLowerCase()

  if (!host || !username || !password) {
    throw new Error(
      'SMTP not configured: set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD',
    )
  }

  const port = Number(portStr)
  const tls = tlsEnv === 'true' || port === 465

  cachedClient = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls,
      auth: { username, password },
    },
  })

  return cachedClient
}

export async function sendSmtpEmail(input: SendEmailInput): Promise<void> {
  const client = getClient()
  const from = input.from ?? Deno.env.get('SMTP_FROM')
  if (!from) {
    throw new Error('SMTP_FROM not configured and no `from` provided')
  }

  await client.send({
    from,
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    content: input.text ?? 'This email requires an HTML-capable client.',
    html: input.html,
  })
}

// Transient error detection — used by the queue dispatcher to decide whether
// to retry. SMTP 4xx codes are transient; 5xx are permanent.
export function isTransientSmtpError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /\b4\d{2}\b/.test(msg) || /timeout|ECONN|ETIMEDOUT|ENOTFOUND/i.test(msg)
}