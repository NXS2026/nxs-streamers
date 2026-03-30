# NXS Streamers Backend

Minimal Express backend scaffold compatible with the current browser extension.

## Quick start

1. Copy `.env.example` to `.env`
2. Set your Discord ID in `OWNER_IDS` and keep `AUTO_BOOTSTRAP_FIRST_ADMIN=false` for a safer default
3. Install packages:

```bash
npm install
```

4. Start the server:

```bash
npm run start
```

If you ever want to clear local test users or OTPs and start fresh again:

```powershell
.\reset-local-data.ps1
```

5. Put this backend URL in `Extension_Client/config.js`:

```js
fallbackUrl: "http://localhost:3000"
```

## Public run

If you want the extension to work from other devices or accounts without `localhost`, use:

```powershell
.\start-public.ps1
```

What it does:

- starts the backend locally if needed
- forces `OTP_DEBUG=false` for that public session
- opens a temporary public URL using `localtunnel`
- updates `backend_config.current_url` in Supabase automatically

For this to work, set these values in `.env`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Optional:

- `PUBLIC_BACKEND_URL` if you already deployed the backend somewhere else
- `TUNNEL_SUBDOMAIN` if you want to request a fixed localtunnel subdomain

Keep the tunnel window open while people are using the extension.

## 24/7 production hosting

For this backend as it exists today, Render is a better fit than Vercel.

Why:

- the backend is a long-running Express service
- it exposes an SSE endpoint at `/api/sse/moderation`
- it currently stores data in a local JSON file under `data/db.json`

This repository now includes a root-level [`render.yaml`](../render.yaml) Blueprint that is ready for Render:

- service type: `web`
- root directory: `NXS_Backend`
- health check: `/api/health`
- persistent disk enabled for the JSON data store
- `OTP_DEBUG=false` for production

### Render deployment flow

1. Push this project to GitHub.
2. Create a new Blueprint in Render from that repo.
3. Render will detect `render.yaml`.
4. During setup, paste your real `DISCORD_BOT_TOKEN`.
5. Wait for the deploy to finish.
6. Copy the generated `onrender.com` backend URL.
7. Update `backend_config.current_url` in Supabase to that URL.
8. Reload the extension.

Helper script for step 7:

```powershell
.\sync-backend-url.ps1 -BackendUrl "https://your-service.onrender.com"
```

### Custom domain

After the service is live, add your custom domain from the Render service settings:

1. Open the service in Render.
2. Go to `Settings` -> `Custom Domains`.
3. Add your domain or subdomain.
4. Copy the DNS record Render gives you into your domain registrar.
5. After verification, point `backend_config.current_url` in Supabase to the custom domain URL.

## What this backend covers

- OTP request / verify flow
- Admin and user whitelist checks
- Health checks
- Global schedule storage
- Heartbeat tracking
- Dashboard sync/update
- Active users and user list endpoints
- Ban / timeout / kick state
- Announcement send / confirm / logs
- SSE moderation stream

## Important notes

- OTP delivery order is:
  1. Discord DM via `DISCORD_BOT_TOKEN`
  2. Discord webhook via `DISCORD_OTP_WEBHOOK_URL`
  3. Console fallback when `OTP_DEBUG=true`
- `DISCORD_BOT_TOKEN` is the best option if you want OTP codes to reach users privately in Discord DMs.
- `DISCORD_OTP_WEBHOOK_URL` is useful if you want OTP codes posted into a private staff/support channel instead.
- OTP codes are logged to the backend console when `OTP_DEBUG=true`.
- If Discord DM delivery fails, the backend now logs the exact Discord reason before falling back to local/debug OTP.
- `start-public.ps1` overrides `OTP_DEBUG=false` for the backend process it launches.
- This scaffold uses a JSON file database at `data/db.json`.
- It is intentionally simple so you can replace the storage later with Supabase, Postgres, or another database.
- Keep `ALLOW_ALL_USERS=false` if you want login access to stay under your control.
- Use the owner tools to decide who becomes an `admin` and who becomes a regular `user`.
- `AUTO_BOOTSTRAP_FIRST_ADMIN` is best kept `false` once `OWNER_IDS` is configured.
