# Self-Hosting Gap Report

Status snapshot of what is required to run RouteMarket fully outside
Lovable Cloud on a self-hosted VPS + self-hosted Supabase + own SMTP.

## ✅ Already migrated off Lovable

| Area | Before | Now |
|------|--------|-----|
| OAuth / Auth client | `@lovable.dev/cloud-auth-js` wrapper | Native `supabase.auth.signInWithOAuth` (`src/integrations/lovable/index.ts`) |
| AI generation (6 edge fns) | Lovable AI Gateway + `LOVABLE_API_KEY` | Direct OpenAI API (`OPENAI_API_KEY`) |
| Auth emails | `@lovable.dev/email-js` + `@lovable.dev/webhooks-js` via Lovable Email API | Standard Webhooks signature + SMTP (`supabase/functions/auth-email-hook`) |
| Transactional / queued emails | `sendLovableEmail` against `api.lovable.dev` | SMTP via shared adapter (`supabase/functions/process-email-queue`) |
| Vite tagger | `lovable-tagger` plugin | Removed from `vite.config.ts` and `package.json` |
| Hard-coded fallback URLs | `*.lovable.app` defaults in Stripe edge fns | `routemarket.io` + `SITE_URL` env override |
| New SMTP adapter | — | `supabase/functions/_shared/smtp.ts` (denomailer) |

## 🔴 Critical blockers (must be resolved before production cutover)

1. **Self-hosted Supabase stack must be provisioned.** Schema, RLS policies,
   storage buckets, pgmq queues, `email_send_log`, `email_send_state`,
   `email_unsubscribe_tokens`, `suppressed_emails`, and the
   `process-email-queue` cron job currently live in Lovable-managed Supabase
   (`yzisjpkesqwwzonvlfzb`). Run a `pg_dump` and storage export from the
   Lovable project and restore into your own Supabase before pointing the
   frontend at the new URL.
2. **Storage buckets.** Five buckets must be re-created with matching
   visibility/RLS: `route-covers` (public), `gpx-files` (private),
   `pdf-guides` (private), `poi-images` (public), `marketing-assets`
   (public). Restore object contents from a Storage export.
3. **Auth Send-Email Hook configuration.** In self-hosted Supabase set
   *Auth → Hooks → Send Email Hook* to
   `https://<functions-host>/functions/v1/auth-email-hook` with the
   Standard Webhooks secret matching `AUTH_HOOK_SECRET`.
4. **OAuth credentials.** Re-create Google OAuth client and configure
   `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID/SECRET` (and the redirect URL
   `https://<your-domain>/auth/callback`) in self-hosted Supabase.
5. **Stripe webhook endpoint.** Re-create the Stripe webhook against the
   new functions URL and update `STRIPE_WEBHOOK_SECRET`.
6. **Cron scheduling for `process-email-queue`.** Lovable previously created
   a `pg_cron` job calling the function with the service-role JWT. After
   migrating, recreate it manually:
   ```sql
   select cron.schedule(
     'process-email-queue',
     '*/1 * * * *',
     $$select net.http_post(
        url:='https://<functions-host>/functions/v1/process-email-queue',
        headers:=jsonb_build_object('Authorization','Bearer '||current_setting('app.service_role_key'))
     )$$
   );
   ```

## 🟡 Optional dependencies still tied to Lovable infra

- `LOVABLE_API_KEY` secret is still listed in Supabase secrets but **no
  code reads it any more**. Safe to delete after the next deploy.
- `MIGRATION_TO_VPS.md` / `DEPLOY_VPS.md` reference older Lovable-Email
  steps; superseded by this report.
- `src/integrations/lovable/index.ts` is now a thin Supabase wrapper. You
  may inline `supabase.auth.signInWithOAuth(...)` and delete the folder
  for full nominal cleanliness — left in place to avoid touching every
  call site in this migration.
- `playwright-fixture.ts` / `playwright.config.ts` import
  `lovable-agent-playwright-config`. This package is only used by the
  Lovable test runner; ignore it (or remove the test files) when running
  Playwright on your own CI.
- `lovable-tagger` build plugin: removed.

## 🛠 Manual configuration required on the VPS

1. **DNS** — point `routemarket.io`, `www.routemarket.io`,
   `notify.routemarket.io`, and the Supabase subdomain at the VPS. Remove
   the Lovable NS records on the `notify` subdomain at your registrar.
2. **TLS** — Caddy (in `Caddyfile`) auto-provisions Let's Encrypt
   certificates; ensure ports 80/443 are open.
3. **Environment variables** — populate `.env` from `.env.example`:
   - SMTP_*: pick a provider (Mailgun, SES, SendGrid, Postmark) and grab
     SMTP credentials. Verify the sending domain (SPF/DKIM/DMARC).
   - `AUTH_HOOK_SECRET`: generate `openssl rand -base64 32` and prefix
     with `v1,whsec_`.
   - `OPENAI_API_KEY`: provision a project key on platform.openai.com.
   - `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`: from Stripe dashboard.
   - `SUPABASE_*`: emit from your self-hosted Supabase install.
4. **Edge function deploy** — `supabase functions deploy` for every
   function under `supabase/functions/` against the self-hosted instance.
5. **Email domain authentication** — set SPF/DKIM/DMARC on
   `notify.routemarket.io` per your SMTP provider's instructions.
6. **`PUBLIC_SITE_DOMAIN` env var** on the auth-email-hook function so
   confirmation links use the correct host.

## 🧪 Manual tests after first deploy

- [ ] Sign up with email → confirmation email arrives, link verifies.
- [ ] Sign in with Google OAuth → redirects through `/auth/callback`.
- [ ] Password reset → email arrives with working link.
- [ ] Purchase a route via Stripe Checkout → webhook fires, purchase row
      inserted, GPX/PDF accessible from `/my-purchases`.
- [ ] Stripe Connect onboarding for a creator → returns to `/profile`.
- [ ] AI suggestion in the route wizard (OpenAI) → returns generated
      content within ~5 s.
- [ ] Translate a route via `translate-route` edge function.
- [ ] PDF guide generation (`generate-pdf`) → file written to
      `pdf-guides` bucket and signed URL works.
- [ ] `process-email-queue` invoked manually → drains both
      `auth_emails` and `transactional_emails`, rows in `email_send_log`
      flip to `sent`.
- [ ] Bounced/invalid recipient → row marked `failed`, retried up to 5x,
      then DLQ.
- [ ] MCP server endpoint reachable with `API_READONLY_KEY`.
- [ ] Sitemap edge function returns 200 with correct route list.

## ✅ Final verdict

After these changes the project **can run fully without Lovable Cloud**,
given:

- **Own VPS** running Docker (frontend container + Caddy reverse proxy —
  see `docker-compose.yml`, `Caddyfile`).
- **Own reverse proxy** (Caddy already configured; nginx works too with
  the bundled `nginx.conf`).
- **Own self-hosted Supabase** (Postgres + GoTrue + PostgREST + Storage +
  Edge Runtime), schema/data/storage migrated from Lovable Supabase.
- **Own SMTP** provider with SPF/DKIM/DMARC on `notify.routemarket.io`.
- **Own secrets** populated from `.env.example` (no managed
  `LOVABLE_API_KEY` required).

No remaining runtime code path imports `@lovable.dev/*` packages or
touches `ai.gateway.lovable.dev` / `api.lovable.dev`.