# NXS Streamers Setup

## 1. Configure `config.js`

Open `config.js` and replace these placeholders:

- `YOUR_SUPABASE_URL`
- `YOUR_SUPABASE_PUBLIC_KEY`
- `YOUR_SUPABASE_REST_OR_ANON_KEY`
- `https://your-backend.example.com`

Notes:

- `publicKey` is used by `config.js` and `background.js`.
- `restKey` is used by popup/offline tools for direct table access.
- If Supabase gives you one anon key that already works with REST, you can reuse it for both fields.
- `backdoorOwnerIds` should contain only your own Discord IDs if you want owner-only hidden tools.
- `support.discordInviteUrl` is the invite opened by the `NEED HELP` button.

## 2. Create Supabase tables

Run `supabase-setup.sql` inside the Supabase SQL Editor.

This creates:

- `backend_config`
- `otp_requests`

Then update row `id = 1` in `backend_config.current_url` with your backend URL.

## 3. Backend is still required

This extension is not Supabase-only. It still calls a separate backend API for:

- `/api/check-admin`
- `/api/check-user-whitelist`
- `/api/request-otp`
- `/api/request-user-otp`
- `/api/verify-otp`
- `/api/check-whitelist`
- `/api/notify-whitelist-error`
- `/api/global-schedule`
- `/api/heartbeat`
- `/api/dashboard/*`
- `/api/admin/*`
- `/api/announcement/*`
- `/api/sse/moderation`

Without your own backend, login, admin tools, moderation, dashboard sync, announcements, and whitelist checks will not fully work.

## 4. Local backend quick start

The workspace now includes a local backend at `../NXS_Backend`.

Fastest way on Windows PowerShell:

```powershell
cd ..\NXS_Backend
.\start-local.ps1
```

With the default `.env`, the first Discord ID that the extension checks through `/api/check-admin` will be auto-bootstrapped as an admin.

### Discord OTP delivery

Inside `../NXS_Backend/.env` you can configure either:

- `DISCORD_BOT_TOKEN` to send OTP codes as direct messages
- `DISCORD_OTP_WEBHOOK_URL` to post OTP codes into a Discord channel

Delivery priority is:

1. Bot DM
2. Webhook
3. Console debug fallback when `OTP_DEBUG=true`

## 4.5 Public run for full access

If you want the extension to work from any device instead of only your own `localhost`, use:

```powershell
cd ..\NXS_Backend
.\start-public.ps1
```

This will:

- start the backend if it is not already running
- create a temporary public URL
- sync that URL to Supabase automatically
- keep the public session alive while that PowerShell window stays open

Required in `../NXS_Backend/.env`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Recommended before public use:

- add the bot to a Discord server shared with your users
- keep `ALLOW_ALL_USERS=false`
- keep `OWNER_IDS` set to your own Discord ID
- use `start-public.ps1` instead of the local script so `OTP_DEBUG` is not exposed

## 4.6 24/7 hosting with a custom domain

If you want this running permanently instead of from your own PC, deploy the backend to Render.

This project already includes a ready Blueprint file:

- [`render.yaml`](/a:/Downloads/Extension_Client%20(2)/render.yaml)

It is set up for the current backend architecture:

- `NXS_Backend` as the service root
- `/api/health` as the health check
- persistent disk storage for `data/db.json`
- `OTP_DEBUG=false`

After deployment:

1. Copy the Render backend URL
2. Update `backend_config.current_url` in Supabase
3. Reload the extension
4. Optionally add your own custom domain in Render and then update Supabase again to that domain

Important:

- For this codebase, Render is a better fit than Vercel because the backend is a long-running Express service with SSE and local file storage.
- If you insist on Vercel, the backend should first be rewritten to use serverless functions plus an external database instead of the local JSON store.

## 5. Reload extension

After editing config and creating the tables:

1. Reload the extension from the browser extensions page.
2. Open the popup.
3. Check DevTools console for any failed API requests.

## 6. Optional cleanups

- Replace `icons/icon.png` with your own logo.
- Update `manifest.json` description/version when you are ready to ship.
