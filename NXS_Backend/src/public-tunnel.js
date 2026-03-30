import 'dotenv/config';

import localtunnel from 'localtunnel';

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '').trim();
const PUBLIC_BACKEND_URL = String(process.env.PUBLIC_BACKEND_URL || '').trim().replace(/\/+$/, '');
const TUNNEL_SUBDOMAIN = String(process.env.TUNNEL_SUBDOMAIN || '').trim();

let activeTunnel = null;

function printHeader(message) {
  console.log(`\n[NXS Tunnel] ${message}`);
}

async function syncBackendUrlToSupabase(publicUrl) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    printHeader('Supabase sync skipped because SUPABASE_URL or SUPABASE_ANON_KEY is missing.');
    return false;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/backend_config?id=eq.1`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      current_url: publicUrl
    })
  });

  if (!response.ok) {
    throw new Error(`Supabase update failed (${response.status}): ${await response.text()}`);
  }

  printHeader(`Supabase backend_config.current_url synced to ${publicUrl}`);
  return true;
}

async function openTunnel() {
  if (PUBLIC_BACKEND_URL) {
    printHeader(`Using PUBLIC_BACKEND_URL from .env: ${PUBLIC_BACKEND_URL}`);
    return {
      url: PUBLIC_BACKEND_URL,
      close: async () => {}
    };
  }

  activeTunnel = await localtunnel({
    port: PORT,
    ...(TUNNEL_SUBDOMAIN ? { subdomain: TUNNEL_SUBDOMAIN } : {})
  });

  activeTunnel.on('close', () => {
    printHeader('Tunnel closed.');
  });

  return activeTunnel;
}

async function main() {
  if (process.argv.includes('--check')) {
    printHeader('Configuration script is valid.');
    return;
  }

  const tunnel = await openTunnel();
  const publicUrl = String(tunnel.url || '').trim().replace(/\/+$/, '');

  if (!publicUrl) {
    throw new Error('Tunnel did not return a public URL.');
  }

  printHeader(`Public backend URL: ${publicUrl}`);
  await syncBackendUrlToSupabase(publicUrl);

  console.log('\nKeep this window open while users are using the extension.');
  console.log('When you stop this tunnel, the public backend URL will stop working.\n');

  const shutdown = async () => {
    if (activeTunnel) {
      try {
        await activeTunnel.close();
      } catch (error) {
        console.error('[NXS Tunnel] Failed to close tunnel cleanly:', error.message);
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[NXS Tunnel] Fatal error:', error.message);
  process.exit(1);
});
