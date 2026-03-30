# NXS Streamers Release

## 1. Backend first

Before distributing the extension, make sure your backend is already live on Render and that Supabase points to it.

Update Supabase from your machine:

```powershell
cd ..\NXS_Backend
.\sync-backend-url.ps1 -BackendUrl "https://your-backend-domain.com"
```

## 2. Build the extension package

This project already contains a protected build in:

- `dist/NXS_Streamers_Protected`

To create a zip package:

```powershell
cd .\Extension_Client
.\package-release.ps1
```

This creates:

- `release/NXS_Streamers_v1.0.zip` (or the current manifest version)

## 3. Use the package

You can:

- keep it as your release archive
- upload it to a browser store later
- extract it and load it manually in Chromium browsers for testing

## 4. Final release checklist

- backend deployed 24/7
- Supabase `backend_config.current_url` updated
- `DISCORD_BOT_TOKEN` rotated and working
- Supabase database password rotated
- extension version confirmed in `manifest.json`
- release zip generated from the protected build
