# NXS Streamers Render Deployment

## Before you deploy

Rotate these secrets first because they were exposed during local setup:

- Discord bot token
- Supabase database password

The extension only needs the public Supabase key in the client. Do not place any `service_role` key in the extension.

## 1. Create a GitHub repository

From the project root:

```powershell
git init
git add .
git commit -m "Initial NXS Streamers release"
```

Then create a new empty GitHub repo and push:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

The root `.gitignore` already excludes `.env`, logs, and local JSON data.

## 2. Deploy to Render

This project includes a ready Blueprint file:

- `render.yaml`

In Render:

1. Click `New +`
2. Choose `Blueprint`
3. Connect your GitHub repo
4. Select this repository
5. Render will detect `render.yaml`
6. Add your real `DISCORD_BOT_TOKEN` when prompted
7. Deploy

Render should create a web service named `nxs-streamers-backend`.

## 3. Get the public backend URL

After deployment, copy the Render URL, for example:

```text
https://nxs-streamers-backend.onrender.com
```

## 4. Update Supabase to use the Render backend

Fastest way from your machine:

```powershell
cd .\NXS_Backend
.\sync-backend-url.ps1 -BackendUrl "https://nxs-streamers-backend.onrender.com"
```

Or run SQL manually:

```sql
update public.backend_config
set current_url = 'https://nxs-streamers-backend.onrender.com'
where id = 1;
```

## 5. Reload the extension

After Supabase is updated:

1. Open `chrome://extensions`
2. Reload the extension
3. Open `NXS Streamers`
4. Test login and OTP

## 6. Add your custom domain

You can buy a domain from any registrar, such as:

- Namecheap
- Cloudflare Registrar
- GoDaddy

Recommended structure:

- `api.yourdomain.com` for the backend

In Render:

1. Open your backend service
2. Go to `Settings`
3. Open `Custom Domains`
4. Add `api.yourdomain.com`
5. Copy the DNS record Render gives you
6. Add that record at your domain registrar
7. Wait for SSL and verification to complete

Then update Supabase again:

```powershell
.\sync-backend-url.ps1 -BackendUrl "https://api.yourdomain.com"
```

## 7. Production checklist

- `OTP_DEBUG=false`
- `ALLOW_ALL_USERS=false`
- `OWNER_IDS` contains only your Discord ID
- bot is in a mutual Discord server with your users
- Supabase `backend_config.current_url` points to the live backend
- extension reloaded after backend URL changes

## Notes

- For this codebase, Render is a better fit than Vercel because the backend is a long-running Express service with SSE and local file storage.
- If you later migrate storage from `data/db.json` to Postgres/Supabase and remove long-lived SSE usage, then a Vercel-style serverless refactor becomes more realistic.
