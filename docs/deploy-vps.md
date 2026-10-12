# RoomQC deployment on a VPS

## Recommended architecture

Run the Vite build as a small Nginx container on the VPS and keep PostgreSQL,
Auth, Storage, Realtime, and Edge Functions in a managed Supabase project.
This avoids exposing a database port and keeps backups, TLS, and Auth upgrades
in the managed service. The VPS only serves the frontend on `127.0.0.1:8082`.

The local `.env` points at the bundled Supabase instance on `localhost:54321`.
For production, create or recover a working Supabase project and verify its URL
before building the bundle; never copy a stale project URL into `.env.vps`.

## 1. Prepare a Supabase project

1. Create a new project in the Supabase dashboard, or recover the old project if
   its dashboard still shows the project as paused.
2. Copy the project ref, project URL, and **publishable/anon** key from the
   project API settings. Never put a `service_role` key in `.env.vps` or in the
   frontend bundle.
3. From this project directory, authenticate the CLI and link the new project:

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref <new-project-ref>
npx supabase@latest db push --linked
```

`db push` applies all migrations in order. It does not restore business
rows, Auth users, Storage objects, or Edge Function secrets.

4. Deploy the Edge Functions when the app needs them:

```powershell
$functions = @(
  "auth-email-hook", "check-subscription-status", "cleanup-sessions",
  "execute-workflow", "expire-pending-payments", "mobile-scan-upload",
  "notify-new-message", "notify-chargeable", "process-email-queue",
  "reset-password-with-otp", "scan-guest-document", "send-password-reset",
  "send-push-notification", "send-telegram-notification", "sepay-webhook",
  "sync-sepay-transactions", "tbltkbtt-submit", "telegram-webhook", "verify-otp"
)
foreach ($function in $functions) {
  npx supabase@latest functions deploy $function --project-ref <new-project-ref> --use-api
}
```

Set only the external secrets that are actually used by the enabled features,
for example `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`SEPAY_API_KEY`, `SEPAY_ALLOWED_IPS`, `BEEKNOEE_API_KEY`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `LOVABLE_API_KEY`, `LOVABLE_SEND_URL`, and `CRON_SECRET`:

Generate one VAPID pair per environment. Use the same public key for the
frontend and Edge Function; keep the private key only in Supabase secrets:

```powershell
npm run vapid:generate
```

Copy `VITE_VAPID_PUBLIC_KEY` into `.env.vps`. Set the matching
`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` values on the Supabase project:

```powershell
npx supabase@latest secrets set --project-ref <new-project-ref> `
  ROOMQC_INTERNAL_FUNCTION_SECRET=<long-random-value> `
  ROOMQC_ALLOWED_ORIGINS=https://roomqc.example.com `
  ROOMQC_PUBLIC_URL=https://roomqc.example.com `
  VAPID_PUBLIC_KEY=<generated-public-key> `
  VAPID_PRIVATE_KEY=<generated-private-key>
```

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to Edge Functions; the last one must stay server
side.

The chat trigger is intentionally fail-closed. If chat notifications are
enabled, store the same internal secret in Supabase Vault and configure the
database URL setting (do not put either value in the frontend):

```sql
select vault.create_secret('<long-random-value>', 'ROOMQC_INTERNAL_FUNCTION_SECRET');
alter database postgres set "app.settings.supabase_url" = 'https://<new-project-ref>.supabase.co';
```

## 2. Build and run RoomQC on the VPS

Install Docker Engine and Compose on an Ubuntu VPS, upload this directory, and
run:

```bash
cp .env.vps.example .env.vps
nano .env.vps
node scripts/validate-env.mjs
docker compose --env-file .env.vps -f docker-compose.roomqc.yml up -d --build
docker compose --env-file .env.vps -f docker-compose.roomqc.yml ps
ROOMQC_BASE_URL=http://127.0.0.1:8082 npm run verify:container
```

The service intentionally binds to `127.0.0.1:8082`, leaving ports 8080 and
8081 available for CRM-JolieFam and Hotel Data Engine. Put the site behind the
VPS's existing Nginx/Caddy reverse proxy for a domain and HTTPS; proxy the
domain to `http://127.0.0.1:8082` and preserve the `Host` and `X-Forwarded-*`
headers.

For `roomqc.com`, use `docker/nginx-vps.conf.example` as the outer Nginx site.
It redirects HTTP and `www.roomqc.com` to the canonical HTTPS origin, forwards
requests only to the loopback-bound RoomQC container, and enables HSTS. Validate
and reload Nginx after installing the site:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

When Cloudflare is enabled, keep the VPS origin certificate valid, set SSL/TLS
mode to **Full (strict)**, proxy the apex and `www` DNS records, and create an
edge redirect from `www.roomqc.com/*` to `https://roomqc.com/$1`. Do not cache
HTML, `/sw.js`, Auth requests, Supabase API responses, or authenticated pages;
the hashed `/assets/*` files are already immutable and safe to cache.

`VITE_ENABLE_DEMO_DATA` is set to `false` in the VPS template and is rejected
by the build validator when enabled, so demo-data tools cannot be exposed by
mistake on a production build.

Web Push also requires the public RoomQC domain to use HTTPS. Plain HTTP is
supported only for loopback development hosts such as `localhost`.

## 3. Smoke test

- Open `/auth/login` through the domain and verify the browser Network tab
  shows requests to the new Supabase URL, not the old `ehjtoajnlnuvuiwkpmbp` ref.
- Register a test account and complete onboarding. A fresh schema has no
  business tenant until the first registration creates one.
- Verify one read and one write in each enabled module, then check Supabase
  Auth, Storage, and Edge Function logs.

## Data restore choices

Choose one explicitly before touching production data:

- **Schema only:** apply migrations to an empty project, then register users and
  import hotel data through the app.
- **Full restore:** export the old database first (including Auth users and
  Storage objects), take a backup, and restore into the new project with a
  planned cutover. A missing/DNS-dead project cannot be exported from the CLI
  until access is restored.

Never run `supabase db reset --linked`, `DROP DATABASE`, or a bulk delete against
the production project as part of deployment.
