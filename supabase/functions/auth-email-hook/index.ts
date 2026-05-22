// Self-hosted Supabase Auth "Send Email Hook" handler.
// Renders branded React Email templates and sends via SMTP.
//
// Replaces the prior Lovable-managed hook that depended on
// @lovable.dev/email-js + @lovable.dev/webhooks-js.
//
// Configure in self-hosted Supabase (Auth > Hooks > Send Email Hook):
//   - URL: https://<your-functions-host>/functions/v1/auth-email-hook
//   - Secret: set as AUTH_HOOK_SECRET env var (Standard Webhooks, base64 whsec_...)
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (for logging only — optional)
//   AUTH_HOOK_SECRET                         (Standard Webhooks signing secret)
//   SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD / SMTP_FROM

import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { Webhook } from 'npm:standardwebhooks@1.0.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'
import { sendSmtpEmail } from '../_shared/smtp.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature',
}

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

const SITE_NAME = 'routemarket.io'
const ROOT_DOMAIN = Deno.env.get('PUBLIC_SITE_DOMAIN') ?? 'routemarket.io'

function buildConfirmationUrl(emailData: any): string {
  // Self-hosted Supabase sends token_hash + email_action_type + redirect_to.
  // Construct the verification URL pointing at the project Supabase /auth/v1/verify endpoint.
  if (emailData?.url) return emailData.url as string
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const params = new URLSearchParams({
    token_hash: emailData?.token_hash ?? '',
    type: emailData?.email_action_type ?? 'signup',
    redirect_to: emailData?.redirect_to ?? `https://${ROOT_DOMAIN}/auth/callback`,
  })
  return `${supabaseUrl}/auth/v1/verify?${params.toString()}`
}

async function logAttempt(
  status: 'sent' | 'failed',
  emailType: string,
  recipient: string,
  errorMessage?: string,
) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return
    const supabase = createClient(supabaseUrl, serviceKey)
    await supabase.from('email_send_log').insert({
      message_id: crypto.randomUUID(),
      template_name: emailType,
      recipient_email: recipient,
      status,
      error_message: errorMessage?.slice(0, 1000),
    })
  } catch (e) {
    console.error('email_send_log insert failed', e)
  }
}

async function handleWebhook(req: Request): Promise<Response> {
  const secret = Deno.env.get('AUTH_HOOK_SECRET')
  const rawBody = await req.text()

  // Verify Standard Webhooks signature (Supabase Auth uses this format).
  // If AUTH_HOOK_SECRET is not configured, fall back to bearer-token check.
  let payload: any
  if (secret) {
    try {
      const wh = new Webhook(secret)
      payload = wh.verify(rawBody, {
        'webhook-id': req.headers.get('webhook-id') ?? '',
        'webhook-timestamp': req.headers.get('webhook-timestamp') ?? '',
        'webhook-signature': req.headers.get('webhook-signature') ?? '',
      })
    } catch (err) {
      console.error('Webhook verification failed', err)
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } else {
    payload = JSON.parse(rawBody)
  }

  // Self-hosted Supabase send-email-hook payload shape:
  // { user: { email, ... }, email_data: { token, token_hash, redirect_to, email_action_type, ... } }
  const user = payload.user ?? {}
  const emailData = payload.email_data ?? {}
  const recipient = user.email ?? emailData.email
  const emailType = emailData.email_action_type ?? 'signup'

  if (!recipient) {
    return new Response(JSON.stringify({ error: 'Missing recipient email' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[emailType] ?? EMAIL_TEMPLATES.signup

  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: `https://${ROOT_DOMAIN}`,
    recipient,
    confirmationUrl: buildConfirmationUrl(emailData),
    token: emailData.token,
    email: recipient,
    newEmail: emailData.new_email,
  }

  const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
  const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
    plainText: true,
  })

  try {
    await sendSmtpEmail({
      to: recipient,
      subject: EMAIL_SUBJECTS[emailType] ?? 'Notification',
      html,
      text,
    })
    await logAttempt('sent', emailType, recipient)
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Auth email send failed', { emailType, recipient, error: msg })
    await logAttempt('failed', emailType, recipient, msg)
    return new Response(JSON.stringify({ error: 'Email send failed', detail: msg }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  try {
    return await handleWebhook(req)
  } catch (error) {
    console.error('Webhook handler error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})