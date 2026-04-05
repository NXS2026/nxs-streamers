
// ============================================================
// AK STREAMERS - SHARED APP / SUPABASE CONFIGURATION
// Edit this file only when moving the extension to your own brand
// or your own Supabase / backend infrastructure.
// ============================================================

const APP_CONFIG = globalThis.APP_CONFIG || {
  brand: {
    name: "AK Streamers",
    primary: "AK",
    secondary: "STREAMERS"
  },
  support: {
    discordInviteUrl: "https://discord.gg/CrqMzzUE7k"
  },
  supabase: {
    // Replace with your own Supabase project URL.
    url: "https://efwfxifmbbdwfvjdfnsw.supabase.co",
    // Public / publishable key used by config/background fetches.
    publicKey: "sb_publishable_bYo6Y9c3quDriSl090eQqQ_I6KnKWYH",
    // REST/anon JWT used by popup/features direct table access.
    // If your project only exposes one anon key, you can use the same value here.
    restKey: "sb_publishable_bYo6Y9c3quDriSl090eQqQ_I6KnKWYH"
  },
  api: {
    // Replace with your own backend base URL.
    fallbackUrl: "http://localhost:3000"
  },
  security: {
    // Keep internal developer surfaces disabled in release builds.
    enableDeveloperTools: false,
    enableOfflineRecovery: false,
    enableIntegrityMonitoring: true,
    integrityCheckIntervalMinutes: 10
  },
  access: {
    // Optional owner IDs used by the hidden offline unlock flow.
    // Leave empty unless you explicitly want this developer shortcut.
    backdoorOwnerIds: []
  }
};

globalThis.APP_CONFIG = APP_CONFIG;

const CONFIG_SUPABASE_URL = APP_CONFIG.supabase.url;
const CONFIG_SUPABASE_PUBLIC_KEY = APP_CONFIG.supabase.publicKey;
const CONFIG_SUPABASE_REST_KEY = APP_CONFIG.supabase.restKey || CONFIG_SUPABASE_PUBLIC_KEY;
const CONFIG_FALLBACK_API_URL = APP_CONFIG.api.fallbackUrl;

function getSupabaseHeaders(options = {}) {
  const {
    includeJson = true,
    prefer = null,
    useRestKey = true
  } = options;

  const token = useRestKey
    ? (CONFIG_SUPABASE_REST_KEY || CONFIG_SUPABASE_PUBLIC_KEY)
    : (CONFIG_SUPABASE_PUBLIC_KEY || CONFIG_SUPABASE_REST_KEY);
  const headers = {
    apikey: token,
    Authorization: `Bearer ${token}`
  };

  if (includeJson) headers["Content-Type"] = "application/json";
  if (prefer) headers["Prefer"] = prefer;
  return headers;
}

globalThis.getSupabaseHeaders = getSupabaseHeaders;

// In-memory cache for the API URL (to avoid excessive requests)
let cachedApiUrl = CONFIG_FALLBACK_API_URL;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // Cache for 5 minutes

// ============================================================
// FETCH BACKEND URL FROM SUPABASE (REALTIME)
// ============================================================
async function fetchConfigBackendUrlFromSupabase() {
  try {
    // Check cache first
    const now = Date.now();
    if (now - lastFetchTime < CACHE_DURATION && cachedApiUrl !== CONFIG_FALLBACK_API_URL) {
      return cachedApiUrl;
    }

    // Fetch from Supabase
    const response = await fetch(
      `${CONFIG_SUPABASE_URL}/rest/v1/backend_config?select=current_url&limit=1`,
      {
        headers: {
          ...getSupabaseHeaders({ useRestKey: false })
        }
      }
    );

    if (!response.ok) {
      console.warn("[Config] Supabase fetch failed, using fallback URL");
      return CONFIG_FALLBACK_API_URL;
    }

    const data = await response.json();
    if (data && data.length > 0 && data[0].current_url) {
      cachedApiUrl = data[0].current_url;
      lastFetchTime = now;
      console.log("[Config] Backend URL updated from Supabase:", cachedApiUrl);
      return cachedApiUrl;
    }

    return CONFIG_FALLBACK_API_URL;
  } catch (error) {
    console.error("[Config] Error fetching from Supabase:", error);
    return CONFIG_FALLBACK_API_URL;
  }
}

// ============================================================
// GET API URL (WITH FALLBACK)
// ============================================================
async function getConfigApiUrl() {
  // If Supabase is not configured, use fallback
  if (!CONFIG_SUPABASE_URL || CONFIG_SUPABASE_URL === "YOUR_SUPABASE_URL") {
    return CONFIG_FALLBACK_API_URL;
  }
  
  return await fetchConfigBackendUrlFromSupabase();
}

// ============================================================
// INITIALIZE API URL ON EXTENSION LOAD
// ============================================================
async function initializeConfigApiUrl() {
  const url = await getConfigApiUrl();
  // Store in Chrome storage for background.js and popup.js to access
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ API_BASE_URL: url });
  }
  return url;
}

// Initialize on load
if (typeof document !== 'undefined') {
  initializeConfigApiUrl().catch(err => console.error("[Config] Init error:", err));
}

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = { 
    APP_CONFIG,
    API_BASE_URL: CONFIG_FALLBACK_API_URL, 
    getApiUrl: getConfigApiUrl,
    fetchBackendUrlFromSupabase: fetchConfigBackendUrlFromSupabase,
    initializeApiUrl: initializeConfigApiUrl,
    SUPABASE_URL: CONFIG_SUPABASE_URL,
    SUPABASE_PUBLIC_KEY: CONFIG_SUPABASE_PUBLIC_KEY,
    SUPABASE_REST_KEY: CONFIG_SUPABASE_REST_KEY,
    getSupabaseHeaders
  };
}
