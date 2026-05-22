# Deployment RouteMarket na VPS (Docker Compose + Caddy)

Krótka, praktyczna instrukcja zero-to-prod. Zakładamy świeży VPS z Ubuntu 24.04 LTS, dostęp przez SSH jako root lub user z sudo.

## 0. Wymagania

- VPS: 4 vCPU, 4–8 GB RAM, 60 GB SSD (Hetzner CX22/CX32, DO 4GB, Vultr 4GB).
- Domena z DNS pod Twoją kontrolą (np. `routemarket.io`).
- Konto GitHub z repo projektu.
- Konta: Stripe, Google Cloud (OAuth), dostawca SMTP.

## 1. Przygotowanie serwera

```bash
# jako root
apt update && apt -y upgrade
apt -y install ca-certificates curl gnupg ufw git

# Docker + compose
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Useful
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
```

## 2. DNS

Ustaw dwa A-records (TTL 300):
- `routemarket.io` → IP VPS
- `www.routemarket.io` → IP VPS
- `supabase.routemarket.io` → IP VPS

## 3. Self-hosted Supabase

```bash
su - deploy
cd ~
git clone --depth 1 https://github.com/supabase/supabase
cp -R supabase/docker ./supabase-self-hosted
cd supabase-self-hosted
cp .env.example .env
# edytuj .env:
# - POSTGRES_PASSWORD, JWT_SECRET (32+ znaki), ANON_KEY, SERVICE_ROLE_KEY (wygeneruj zgodnie z README Supabase)
# - SITE_URL=https://routemarket.io
# - ADDITIONAL_REDIRECT_URLS=https://routemarket.io/auth/callback
# - SMTP_* (Twój dostawca)
# - GOTRUE_EXTERNAL_GOOGLE_ENABLED=true + GOOGLE_CLIENT_ID/SECRET
docker compose up -d
# panel: http://VPS_IP:8000  (login z DASHBOARD_USERNAME/PASSWORD)
```

Wgraj migracje:
```bash
cd ~
git clone git@github.com:<you>/routemarket.git
cd routemarket
# psql przez wystawiony port 5432 lub przez sieć dockera
for f in supabase/migrations/*.sql; do
  docker exec -i supabase-db psql -U postgres -d postgres < "$f"
done
```

Stwórz buckety w panelu (Storage):
- `route-covers` (public)
- `gpx-files` (private)
- `pdf-guides` (private)
- `poi-images` (public)
- `marketing-assets` (public)

Deploy edge functions (z hosta z Supabase CLI):
```bash
npx supabase functions deploy --project-ref local --no-verify-jwt
# lub każda osobno: npx supabase functions deploy mcp-server atlas-admin --no-verify-jwt
```

Ustaw sekrety edge functions:
```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx STRIPE_WEBHOOK_SECRET=whsec_xxx \
  OPENAI_API_KEY=sk-xxx API_READONLY_KEY=xxx MCP_CREATOR_USER_ID=uuid \
  ATLAS_API_BASE_URL=http://host.docker.internal:8787 ATLAS_API_TOKEN=<atlas_internal_token>
```

`atlas-admin` jest wewnetrznym bridge do Atlas API. Frontend RouteMarket wywoluje Supabase Edge Function, a dopiero ona laczy sie z Atlas po prywatnym adresie.

## 4. Frontend + Caddy

```bash
cd ~/routemarket
cp .env.example .env
# uzupełnij VITE_SUPABASE_URL=https://supabase.routemarket.io
#         VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY z panelu Supabase>
#         VITE_SUPABASE_PROJECT_ID=self-hosted

# Edytuj Caddyfile — podmień your-domain.tld na routemarket.io
sed -i 's/your-domain.tld/routemarket.io/g' Caddyfile

docker compose up -d --build
```

Caddy automatycznie pobierze certyfikaty Let's Encrypt dla `routemarket.io` i `supabase.routemarket.io`.

Jeśli na VPS siedzÄ… juĹĽ inne serwisy na `80/443`, moĹĽesz najpierw wystartowaÄ‡ staging na wysokich portach bez ruszania reverse proxy:

```bash
cat > .env <<'EOF'
VITE_SUPABASE_URL=http://<VPS_IP>:8001
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY z self-hosted Supabase>
VITE_SUPABASE_PROJECT_ID=self-hosted
VITE_APP_ENV=production
APP_DOMAIN=routemarket.io
APP_HTTP_PORT=8089
APP_HTTPS_PORT=8449
SUPABASE_UPSTREAM=host.docker.internal:8001
EOF

docker compose build frontend
docker rm -f routemarket-frontend-staging || true
docker run -d --name routemarket-frontend-staging --restart unless-stopped -p 8089:80 routemarket-frontend:latest
```

To daje szybki smoke test pod `http://<VPS_IP>:8089`, zanim przeĹ‚Ä…czysz DNS i finalny reverse proxy.

Uwaga: `docker-compose.yml` dodaje mapowanie `host.docker.internal:host-gateway`, żeby Caddy mógł proxyfikować ruch do osobno uruchomionego stacku self-hosted Supabase na porcie `8000` także na Linuksowym VPS.

## 5. Webhook Stripe

W [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks) zmień endpoint na:
`https://supabase.routemarket.io/functions/v1/stripe-webhook`
Skopiuj nowy `whsec_*` i wgraj jako sekret edge functions (krok 3).

## 6. Cron / kolejka emaili

`process-email-queue` powinien być wywoływany co 1 min. Najprościej przez `pg_cron` (instaluje się w self-hosted Supabase):

```sql
SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$ SELECT net.http_post(
       'https://supabase.routemarket.io/functions/v1/process-email-queue',
       '{}'::jsonb,
       '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
     ) $$
);
```

Alternatywnie systemd timer na VPS odpalający `curl`.

## 7. CI/CD z GitHub

Minimalny `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on: { push: { branches: [main] } }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: deploy
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd ~/routemarket
            git pull
            docker compose up -d --build
```

## 8. Monitoring i backupy

- **Backup Postgres**: codziennie `docker exec supabase-db pg_dump -U postgres postgres | gzip > /backup/db-$(date +%F).sql.gz`. Trzymaj 14 dni. Replikuj na S3-kompatybilny storage (Backblaze B2, Wasabi).
- **Backup Storage**: `rclone sync` katalogu `volumes/storage` na zewnętrzny bucket.
- **Logi**: `docker compose logs -f --tail=200`. Dla produkcji rozważ `loki + grafana` lub po prostu `journald`.
- **Healthcheck**: UptimeRobot na `https://routemarket.io` i `https://supabase.routemarket.io/auth/v1/health`.

## 9. Rollback

```bash
cd ~/routemarket && git checkout <previous-sha> && docker compose up -d --build
```

## 10. Czego NIE robić

- Nie commituj `.env` do repo.
- Nie wystawiaj portu 5432 (Postgres) publicznie. Caddy proxuje tylko HTTP/HTTPS.
- Nie używaj tego samego `JWT_SECRET` na staging i prod.
- Nie usuwaj `gpx-files` / `pdf-guides` z private — to są płatne treści.
