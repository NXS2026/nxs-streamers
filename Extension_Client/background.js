try {
  importScripts('config.js');
} catch (error) {
  console.error('[Config] Failed to load shared config in background worker:', error);
}

// ============================================================
// SUPABASE REALTIME LISTENER FOR BACKEND URL UPDATES
// ============================================================
let supabaseRealtimeChannel = null;
const BG_SUPABASE_URL = globalThis.APP_CONFIG?.supabase?.url || "YOUR_SUPABASE_URL";
const BG_CONFIG_API_URL = globalThis.APP_CONFIG?.api?.fallbackUrl || "http://localhost:3000";
const ENABLE_INTEGRITY_MONITORING = globalThis.APP_CONFIG?.security?.enableIntegrityMonitoring !== false;
const INTEGRITY_CHECK_INTERVAL_MINUTES = Math.max(
  1,
  Number(globalThis.APP_CONFIG?.security?.integrityCheckIntervalMinutes || 10)
);

function normalizeBackendUrl(url = "") {
  return String(url || "").trim().replace(/\/+$/, "");
}

// Initialize Supabase realtime listener
async function initSupabaseRealtimeListener() {
  if (!BG_SUPABASE_URL || BG_SUPABASE_URL === "YOUR_SUPABASE_URL") {
    console.log('[Supabase] Realtime listener not configured (using fallback)');
    return;
  }

  try {
    // Fetch initial URL and update storage
    const response = await fetch(
      `${BG_SUPABASE_URL}/rest/v1/backend_config?select=current_url&limit=1`,
      {
        headers: {
          ...(typeof getSupabaseHeaders === 'function'
            ? getSupabaseHeaders({ useRestKey: false })
            : {
                apikey: globalThis.APP_CONFIG?.supabase?.publicKey || "",
                Authorization: `Bearer ${globalThis.APP_CONFIG?.supabase?.publicKey || ""}`,
                "Content-Type": "application/json"
              })
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0 && data[0].current_url) {
        const newUrl = normalizeBackendUrl(data[0].current_url);
        const st = await chrome.storage.local.get(['API_BASE_URL', 'userDiscordId', 'isUserLoggedIn']);
        const currentUrl = normalizeBackendUrl(st.API_BASE_URL || BG_CONFIG_API_URL);

        if (!newUrl) return;

        if (newUrl !== currentUrl) {
          chrome.storage.local.set({ API_BASE_URL: newUrl });
          console.log('[Supabase] Backend URL changed:', newUrl);

          // Reconnect SSE only when the backend URL actually changes
          if (st.userDiscordId && st.isUserLoggedIn) {
            stopModerationSSE();
            setTimeout(() => startModerationSSE(st.userDiscordId), 1000);
          }
        }
      }
    }
  } catch (error) {
    console.error('[Supabase] Realtime listener error:', error);
  }
}

// Poll Supabase every 30 seconds for URL changes (fallback for realtime)
setInterval(initSupabaseRealtimeListener, 30000);

const ALARM_NAME = 'kick-pro-check';
const INTEGRITY_ALARM_NAME = 'nxs-integrity-check';

function bytesToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(content) {
  const encoded = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(digest);
}

async function loadIntegrityManifest() {
  const response = await fetch(chrome.runtime.getURL('INTEGRITY.json'), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load INTEGRITY.json (${response.status})`);
  }
  return response.json();
}

async function inspectExtensionIntegrity() {
  const integrity = await loadIntegrityManifest();
  const entries = Object.entries(integrity.files || {});
  const mismatches = [];

  for (const [relativePath, expectedHash] of entries) {
    try {
      const response = await fetch(chrome.runtime.getURL(relativePath), { cache: 'no-store' });
      if (!response.ok) {
        mismatches.push({ path: relativePath, expectedHash, actualHash: 'unreadable' });
        continue;
      }

      const content = await response.text();
      const actualHash = await sha256Hex(content);
      if (actualHash !== expectedHash) {
        mismatches.push({ path: relativePath, expectedHash, actualHash });
      }
    } catch (error) {
      mismatches.push({
        path: relativePath,
        expectedHash,
        actualHash: `error:${error.message}`
      });
    }
  }

  return {
    integrity,
    mismatches,
    signature: mismatches.length ? await sha256Hex(JSON.stringify(mismatches)) : ''
  };
}

async function notifyTamperAlert(result, trigger = 'startup') {
  if (!result?.mismatches?.length) {
    await chrome.storage.local.remove(['lastTamperAlertSignature', 'lastTamperAlertAt']).catch(() => {});
    return;
  }

  const storage = await chrome.storage.local.get(['lastTamperAlertSignature', 'userDiscordId']);
  if (storage.lastTamperAlertSignature === result.signature) {
    return;
  }

  try {
    const baseUrl = await getBackgroundApiUrl();
    await fetch(`${baseUrl}/api/security/tamper-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        extensionId: chrome.runtime.id,
        extensionName: chrome.runtime.getManifest().name,
        version: chrome.runtime.getManifest().version,
        buildType: result.integrity?.buildType || 'unknown',
        userDiscordId: storage.userDiscordId || '',
        reason: `Integrity mismatch detected during ${trigger}`,
        detectedAt: new Date().toISOString(),
        signature: result.signature,
        files: result.mismatches
      })
    });

    await chrome.storage.local.set({
      lastTamperAlertSignature: result.signature,
      lastTamperAlertAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Integrity] Failed to send tamper alert:', error);
  }
}

async function runIntegrityCheck(trigger = 'startup') {
  if (!ENABLE_INTEGRITY_MONITORING) return;

  try {
    const result = await inspectExtensionIntegrity();
    if (result.mismatches.length > 0) {
      console.error('[Integrity] Tampering detected:', result.mismatches);
      await notifyTamperAlert(result, trigger);
    }
  } catch (error) {
    console.warn('[Integrity] Check skipped:', error.message || error);
  }
}

// SSE connection for realtime moderation events
let sseConnection = null;
let sseDiscordId = null;
let sseReconnectTimer = null;

// Start SSE connection for a specific user
async function startModerationSSE(discordId) {
  if (sseConnection) {
    sseConnection.close();
    sseConnection = null;
  }
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }

  sseDiscordId = discordId;
  const baseUrl = await getBackgroundApiUrl();

  try {
    sseConnection = new EventSource(`${baseUrl}/api/sse/moderation?id=${discordId}`);

    sseConnection.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        await handleModerationEvent(data, discordId);
      } catch(e) { console.error('[SSE] Parse error:', e); }
    };

    sseConnection.onerror = () => {
      console.warn('[SSE] Connection lost — reconnecting in 5s');
      sseConnection.close();
      sseConnection = null;
      // Reconnect after 5s if user still logged in
      sseReconnectTimer = setTimeout(async () => {
        const st = await chrome.storage.local.get(['userDiscordId', 'isUserLoggedIn']);
        if (st.userDiscordId && st.isUserLoggedIn) {
          startModerationSSE(st.userDiscordId);
        }
      }, 5000);
    };

    console.log('[SSE] Connected for', discordId);
  } catch(e) {
    console.error('[SSE] Failed to connect:', e);
  }
}

// Stop SSE connection
function stopModerationSSE() {
  if (sseConnection) {
    sseConnection.close();
    sseConnection = null;
  }
  if (sseReconnectTimer) {
    clearTimeout(sseReconnectTimer);
    sseReconnectTimer = null;
  }
  sseDiscordId = null;
}

// Handle moderation event from SSE
async function handleModerationEvent(data, discordId) {
  if (data.type === 'clear') {
    // Admin removed ban/timeout — clear storage, user can access again
    await chrome.storage.local.set({ isBanned: false, banData: null, isKicked: false, kickData: null });
    return;
  }

  if (data.type === 'announcement') {
    // Store announcement so popup shows it when opened
    await chrome.storage.local.set({
      pendingAnnouncement: { message: data.message, timestamp: data.timestamp, senderName: data.senderName || 'Admin' }
    });
    // Notify popup if it's already open
    chrome.runtime.sendMessage({ action: 'showAnnouncement', message: data.message, senderName: data.senderName || 'Admin' }).catch(() => {});
    return;
  }

  if (data.type === 'ban' || data.type === 'timeout') {
    await chrome.storage.local.set({
      isBanned: true,
      banData: { ...data, moderationType: data.type },
      isUserLoggedIn: false,
      isAdminVerified: false,
      isUserVerified: false
    });
    await closeAllKickTabs();
    return;
  }
}

// Always sync API_BASE_URL from config into storage so popup.js can access it
// First, try to fetch from Supabase, fallback to default
chrome.storage.local.set({ API_BASE_URL: BG_CONFIG_API_URL });
chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
if (ENABLE_INTEGRITY_MONITORING) {
  chrome.alarms.create(INTEGRITY_ALARM_NAME, { periodInMinutes: INTEGRITY_CHECK_INTERVAL_MINUTES });
}
// Initialize Supabase listener on startup
initSupabaseRealtimeListener().catch(err => console.error('[Supabase] Init error:', err));
runIntegrityCheck('startup').catch(err => console.error('[Integrity] Init error:', err));

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 });
  if (ENABLE_INTEGRITY_MONITORING) {
    chrome.alarms.create(INTEGRITY_ALARM_NAME, { periodInMinutes: INTEGRITY_CHECK_INTERVAL_MINUTES });
  }
  // Persist API URL on install
  chrome.storage.local.set({ API_BASE_URL: BG_CONFIG_API_URL });
  chrome.storage.local.get(['channels', 'masterAutoMode', 'stats', 'globalMute'], (result) => {
    if (!result.channels) chrome.storage.local.set({ channels: [] });
    if (result.masterAutoMode === undefined) chrome.storage.local.set({ masterAutoMode: true });
    // Force Global Mute to ON by default
    if (result.globalMute === undefined || result.globalMute === null) {
      chrome.storage.local.set({ globalMute: true });
    }
    if (!result.stats) chrome.storage.local.set({ stats: {} });
  });
  runIntegrityCheck('install').catch(err => console.error('[Integrity] Install check failed:', err));
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    // SSE handles moderation — alarm only for channels + heartbeat
    const storage = await chrome.storage.local.get(['userDiscordId', 'isUserLoggedIn', 'isAdminVerified', 'isUserVerified']);
    
    // Check if user is logged in (either as admin or regular user)
    const isLoggedIn = storage.isUserLoggedIn || storage.isAdminVerified || storage.isUserVerified;
    
    // Reconnect SSE if user logged in but no connection
    if (storage.userDiscordId && isLoggedIn && !sseConnection) {
      startModerationSSE(storage.userDiscordId);
    }
    
    if (isLoggedIn) {
      await checkAllChannels();
      await sendHeartbeat('idle');

      // ── Poll fallback: catch announcement for users who missed SSE ──
      try {
        const baseUrl = await getBackgroundApiUrl();
        const annRes = await fetch(`${baseUrl}/api/announcement/latest`);
        if (annRes.ok) {
          const ann = await annRes.json();
          const stored = await chrome.storage.local.get(['lastSeenAnnouncement', 'pendingAnnouncement']);
          // Check target + skip if I'm the sender
          const annTarget = ann.target || 'users';
          const iAmAdmin = !!storage.isAdminVerified;
          const iAmSender = ann.sentBy && ann.sentBy === storage.userDiscordId;
          let targetedAtMe = false;
          if (!iAmSender) {
            if (annTarget === 'everyone') targetedAtMe = true;
            else if (annTarget === 'users' && !iAmAdmin) targetedAtMe = true;
            else if (annTarget === 'admins' && iAmAdmin) targetedAtMe = true;
          }
          // Only show if targeted + new + not already seen/pending
          if (targetedAtMe && ann.message && ann.timestamp && ann.timestamp !== stored.lastSeenAnnouncement) {
            if (!stored.pendingAnnouncement) {
              await chrome.storage.local.set({ pendingAnnouncement: { message: ann.message, timestamp: ann.timestamp, senderName: ann.senderName || 'Admin' } });
              chrome.runtime.sendMessage({ action: 'showAnnouncement', message: ann.message, senderName: ann.senderName || 'Admin' }).catch(() => {});
            }
          }
        }
      } catch (e) { /* server offline — skip */ }
    }
  }

  if (alarm.name === INTEGRITY_ALARM_NAME) {
    await runIntegrityCheck('alarm');
  }
});


async function sendHeartbeat(action, channel = null, comment = null, duration = 0) {
  try {
    const data = await chrome.storage.local.get(["userDiscordId", "userDiscordUsername", "isBanned"]);
    if (data.isBanned) return;

    const baseUrl = await getBackgroundApiUrl();
    
    // Always set status to 'Active' - no Idle status
    let userStatus = 'Active';

    await fetch(`${baseUrl}/api/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discordId: data.userDiscordId || 'guest',
        username: data.userDiscordUsername || 'Guest',
        action,
        channel,
        comment,
        duration,
        status: userStatus
      })
    });

    // Update dashboard.json with watch/comment data
    if (data.userDiscordId && data.userDiscordId !== 'guest' && channel) {
      const dashPayload = {
        discordId: data.userDiscordId,
        username: data.userDiscordUsername || 'Guest',
        channel
      };
      if (action === 'comment') dashPayload.comments = 1;
      if (action === 'watch' && duration > 0) dashPayload.watchTime = duration;

      if (dashPayload.comments || dashPayload.watchTime) {
        fetch(`${baseUrl}/api/dashboard/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dashPayload)
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error("Failed to send heartbeat", e);
  }
}

// Listen for startSSE message from popup after login
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startSSE' && msg.discordId) {
    startModerationSSE(msg.discordId);
    sendResponse({ ok: true });
  }
  if (msg.action === 'stopSSE') {
    stopModerationSSE();
    sendResponse({ ok: true });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkNow') {
    checkAllChannels().then(() => sendResponse({ status: 'done' }));
    return true;
  } else if (message.action === 'panic') {
    closeAllKickTabs().then(() => sendResponse({ status: 'closed' }));
    return true;
  } else if (message.action === 'recordComment') {
    recordCommentSent(message.channelId).then(async () => {
      // Get slug from channels for dashboard
      const chData = await chrome.storage.local.get(['channels']);
      const ch = (chData.channels || []).find(c => c.id === message.channelId);
      const slug = ch ? ch.slug : message.channelId;
      sendHeartbeat('comment', slug, message.comment);
      sendResponse({ status: 'recorded' });
    });
    return true;
  } else if (message.action === 'recordWatch') {
    recordWatchTime(message.channelId, message.duration).then(async () => {
      // Get slug from channels for dashboard
      const chData = await chrome.storage.local.get(['channels']);
      const ch = (chData.channels || []).find(c => c.id === message.channelId);
      const slug = ch ? ch.slug : message.channelId;
      sendHeartbeat('watch', slug, null, message.duration || 0);
      sendResponse({ status: 'recorded' });
    });
    return true;
  }
});

async function isWithinSchedule() {
  const data = await chrome.storage.local.get(['scheduleEnabled', 'scheduleStart', 'scheduleEnd', 'multischeduleEnabled', 'scheduleRules']);
  
  const now = new Date();
  const currentDay = now.getDay();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  // If Multi-Schedule is enabled, check all rules
  if (data.multischeduleEnabled && data.scheduleRules && data.scheduleRules.length > 0) {
    for (const rule of data.scheduleRules) {
      if (rule.days.includes(currentDay)) {
        const [startH, startM] = (rule.start || "00:00").split(':').map(Number);
        const [endH, endM] = (rule.end || "23:59").split(':').map(Number);
        const startTime = startH * 60 + startM;
        const endTime = endH * 60 + endM;

        if (startTime <= endTime) {
          if (currentTime >= startTime && currentTime <= endTime) return true;
        } else {
          if (currentTime >= startTime || currentTime <= endTime) return true;
        }
      }
    }
    return false; // None of the rules matched
  }

  // Fallback to legacy single schedule if Multi-Schedule is off
  if (!data.scheduleEnabled) return true;
  
  const [startH, startM] = (data.scheduleStart || "00:00").split(':').map(Number);
  const [endH, endM] = (data.scheduleEnd || "23:59").split(':').map(Number);
  
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;
  
  if (startTime <= endTime) {
    return currentTime >= startTime && currentTime <= endTime;
  } else {
    return currentTime >= startTime || currentTime <= endTime;
  }
}

async function checkAllChannels() {
  const inSchedule = await isWithinSchedule();
  const data = await chrome.storage.local.get(['channels', 'masterAutoMode', 'globalMute']);
  if (!data.channels || data.channels.length === 0) return;

  const channels = [...data.channels];
  const masterAutoMode = data.masterAutoMode;
  const globalMute = data.globalMute !== false;

  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i];
    const isAutoEnabled = inSchedule && (masterAutoMode || channel.autoMode);
    try {
      await syncChannelStatus(channel, i, channels, isAutoEnabled, globalMute);
      
      // Live Watch Time Tracking: only if tab is open AND channel is live
      if (channel.openedTabId && channel.isLive) {
        const stats = await getStats(channel.id);
        const now = Date.now();

        // Use lastSessionStart to calculate real elapsed time
        if (!stats.lastSessionStart) {
          stats.lastSessionStart = now;
        }

        // Calculate real seconds elapsed since last alarm tick
        const lastTick = stats.lastAlarmTick || stats.lastSessionStart;
        const elapsed = Math.round((now - lastTick) / 1000);
        stats.lastAlarmTick = now;

        // Only add if elapsed is reasonable (between 5s and 60s to avoid drift)
        if (elapsed >= 5 && elapsed <= 60) {
          stats.totalWatchTime = (stats.totalWatchTime || 0) + elapsed;

          const statsData = await chrome.storage.local.get(['stats']);
          const allStats = statsData.stats || {};
          allStats[channel.id] = stats;
          await chrome.storage.local.set({ stats: allStats });

          // Update userDashboard in storage (read by admin popup directly)
          await updateUserDashboardStorage(channel.slug, elapsed, 0);

          await sendHeartbeat('watch', channel.slug, null, elapsed);
        }
      } else if (!channel.isLive || !channel.openedTabId) {
        // Reset tick when not live so next session starts fresh
        const stats = await getStats(channel.id);
        if (stats.lastAlarmTick) {
          stats.lastAlarmTick = null;
          stats.lastSessionStart = null;
          const statsData = await chrome.storage.local.get(['stats']);
          const allStats = statsData.stats || {};
          allStats[channel.id] = stats;
          await chrome.storage.local.set({ stats: allStats });
        }
      }

      if (i < channels.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`Error processing channel ${i}:`, error);
    }
  }
  
  await chrome.storage.local.set({ channels });
}

async function getBackgroundApiUrl() {
  const data = await chrome.storage.local.get(["API_BASE_URL"]);
  return data.API_BASE_URL || BG_CONFIG_API_URL;
}

async function checkUrlWhitelist(url) {
  try {
    const baseUrl = await getBackgroundApiUrl();
    const res = await fetch(`${baseUrl}/api/check-whitelist?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    
    if (!data.allowed) {
      console.warn(`URL ${url} is not whitelisted. Access denied.`);
      // If not whitelisted, notify the user via Discord
      const userData = await chrome.storage.local.get(["userDiscordId"]);
      if (userData.userDiscordId) {
        fetch(`${baseUrl}/api/notify-whitelist-error?id=${userData.userDiscordId}&url=${encodeURIComponent(url)}`)
          .catch(err => console.error("Failed to notify whitelist error", err));
      }
      return false;
    }
    
    return true;
  } catch (e) {
    console.error("Failed to check URL whitelist", e);
    // If server is down, we allow to avoid blocking legitimate users, 
    // but we log it.
    return true; 
  }
}

async function syncChannelStatus(channel, index, allChannels, isAutoEnabled, globalMute) {
  try {
    let response = null;
    let retries = 2;
    
    while (retries >= 0) {
      try {
        response = await fetch(`https://kick.com/api/v1/channels/${channel.slug}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
        });
        break; 
      } catch (fetchError) {
        retries--;
        if (retries >= 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          throw fetchError;
        }
      }
    }

    if (response && response.status === 200) {
      const result = await response.json();
      const isLive = !!result.livestream;
      const wasLive = allChannels[index].isLive;
      allChannels[index].isLive = isLive;

      // STREAM START TIME — source of truth for starting-soon phase
      // Use API start_time directly — works even if extension started mid-stream
      const streamStartKey = `streamStart_${channel.id}`;
      if (isLive && result.livestream) {
        // Kick API returns start_time or created_at as ISO string
        const apiStartStr = result.livestream.start_time || result.livestream.created_at;
        const apiStartMs  = apiStartStr ? new Date(apiStartStr).getTime() : null;

        if (apiStartMs && !isNaN(apiStartMs)) {
          // Always update with the real API value
          await chrome.storage.local.set({ [streamStartKey]: apiStartMs });
        } else {
          // API didn't return a time — fallback: save now only on first detection
          const existing = await chrome.storage.local.get([streamStartKey]);
          if (!existing[streamStartKey]) {
            await chrome.storage.local.set({ [streamStartKey]: Date.now() });
            console.warn(`[StreamStart] ${channel.slug} — no start_time in API, using now as fallback.`);
          }
        }
      } else if (!isLive) {
        // Stream ended — clear start time
        await chrome.storage.local.remove(streamStartKey);
        if (wasLive) console.log(`[StreamStart] ${channel.slug} went offline — start time cleared.`);
      }
      
      const tabs = await chrome.tabs.query({ url: `*://*.kick.com/${channel.slug.toLowerCase()}*` });
      const existingTab = tabs.length > 0 ? tabs[0] : null;
      allChannels[index].openedTabId = existingTab ? existingTab.id : null;

      if (isAutoEnabled) {
        if (isLive && !existingTab) {
          // Check whitelist before opening tab
          const isWhitelisted = await checkUrlWhitelist(`kick.com/${channel.slug}`);
          if (!isWhitelisted) {
            console.warn(`Channel ${channel.slug} is not whitelisted. Skipping.`);
            chrome.runtime.sendMessage({ action: "showWhitelistError" }).catch(() => {});
            return;
          }

          try {
            const tab = await chrome.tabs.create({ url: `https://kick.com/${channel.slug}`, active: true });
            allChannels[index].openedTabId = tab.id;
            
            if (globalMute || channel.mute) {
              chrome.tabs.update(tab.id, { muted: true }).catch(err => console.warn(`Failed to mute tab ${tab.id}:`, err));
            } else {
              chrome.tabs.update(tab.id, { muted: false }).catch(err => console.warn(`Failed to unmute tab ${tab.id}:`, err));
            }
            
            const stats = await getStats(channel.id);
            stats.lastSessionStart = Date.now();
            await saveStats(channel.id, stats);
            
            await new Promise(resolve => setTimeout(resolve, 150));
          } catch (tabError) {
            console.error(`Failed to create tab for ${channel.slug}:`, tabError);
            allChannels[index].openedTabId = null;
          }
        } else if (!isLive && existingTab) {
          try {
            await chrome.tabs.remove(existingTab.id);
            allChannels[index].openedTabId = null;
            await finalizeWatchTime(channel.id);
          } catch (removeError) {
            console.warn(`Failed to remove tab for ${channel.slug}:`, removeError);
          }
        } else if (existingTab) {
          // Check whitelist for existing tab (e.g. if someone changed channel manually)
          const isWhitelisted = await checkUrlWhitelist(`kick.com/${channel.slug}`);
          if (!isWhitelisted) {
            console.warn(`Existing tab for ${channel.slug} is no longer whitelisted. Closing.`);
            chrome.tabs.remove(existingTab.id).catch(() => {});
            allChannels[index].openedTabId = null;
            chrome.runtime.sendMessage({ action: "showWhitelistError" }).catch(() => {});
            return;
          }

          if (globalMute || channel.mute) {
            if (!existingTab.mutedInfo || !existingTab.mutedInfo.muted) {
              chrome.tabs.update(existingTab.id, { muted: true }).catch(err => console.warn(`Failed to mute tab ${existingTab.id}:`, err));
            }
          } else {
            if (existingTab.mutedInfo && existingTab.mutedInfo.muted) {
              chrome.tabs.update(existingTab.id, { muted: false }).catch(err => console.warn(`Failed to unmute tab ${existingTab.id}:`, err));
            }
          }
        }
      } else if (existingTab && !inSchedule) {
        try {
          await chrome.tabs.remove(existingTab.id);
          allChannels[index].openedTabId = null;
          await finalizeWatchTime(channel.id);
        } catch (removeError) {
          console.warn(`Failed to remove tab for ${channel.slug}:`, removeError);
        }
      }
    }
  } catch (error) {
    console.error(`Error syncing ${channel.slug}:`, error);
  }
}

async function finalizeWatchTime(channelId) {
  // Logic replaced by continuous tracking in checkAllChannels
}

async function closeAllKickTabs() {
  const data = await chrome.storage.local.get(['channels']);
  const channels = data.channels || [];
  const allTabs = await chrome.tabs.query({});
  const tabIdsToClose = [];

  for (const tab of allTabs) {
    if (!tab.url) continue;
    const isOurChannel = channels.some(c => tab.url.toLowerCase().includes(`kick.com/${c.slug.toLowerCase()}`));
    if (isOurChannel) tabIdsToClose.push(tab.id);
  }

  if (tabIdsToClose.length > 0) await chrome.tabs.remove(tabIdsToClose);
  const updatedChannels = channels.map(c => ({ ...c, openedTabId: null }));
  await chrome.storage.local.set({ channels: updatedChannels });
}

async function recordCommentSent(channelId) {
  const stats = await getStats(channelId);
  stats.totalComments = (stats.totalComments || 0) + 1;
  await saveStats(channelId, stats);
  // Save to local activity log
  await saveLocalActivityLog('comment', channelId);
  // Update userDashboard storage
  const chData = await chrome.storage.local.get(['channels']);
  const ch = (chData.channels || []).find(c => c.id === channelId);
  if (ch) await updateUserDashboardStorage(ch.slug, 0, 1);
}

async function recordWatchTime(channelId, duration) {
  const stats = await getStats(channelId);
  stats.totalWatchTime = (stats.totalWatchTime || 0) + duration;
  await saveStats(channelId, stats);
}

// Convert seconds to formatted time string (h m s)
function formatWatchTime(seconds) {
  if (!seconds || seconds < 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

async function saveLocalActivityLog(action, channel, comment = null) {
  try {
    const data = await chrome.storage.local.get(['activityLogs', 'channels']);
    const logs = data.activityLogs || [];
    // Get slug if channel is an ID
    const ch = (data.channels || []).find(c => c.id === channel);
    const channelName = ch ? ch.slug : channel;
    logs.unshift({ action, channel: channelName, comment, timestamp: new Date().toISOString() });
    if (logs.length > 200) logs.length = 200;
    await chrome.storage.local.set({ activityLogs: logs });
  } catch(e) {}
}

// Update userDashboard in chrome.storage — read directly by admin popup (no server needed)
async function updateUserDashboardStorage(channelSlug, watchSeconds, comments) {
  try {
    const baseData = await chrome.storage.local.get(['userDiscordId', 'userDiscordUsername']);
    if (!baseData.userDiscordId) return;
    const dashKey = `dash_${baseData.userDiscordId}`;
    const stored = await chrome.storage.local.get([dashKey]);
    const data = { ...baseData, userDashboard: stored[dashKey] };

    const dashboard = data.userDashboard || {
      discordId: data.userDiscordId,
      username: data.userDiscordUsername || 'Unknown',
      totalWatchTime: 0,
      totalComments: 0,
      channels: {},
      lastUpdated: null
    };

    if (!dashboard.channels[channelSlug]) {
      dashboard.channels[channelSlug] = { watchTime: 0, comments: 0, lastSeen: null };
    }

    if (watchSeconds > 0) {
      dashboard.channels[channelSlug].watchTime += watchSeconds;
      dashboard.totalWatchTime = (dashboard.totalWatchTime || 0) + watchSeconds;
    }
    if (comments > 0) {
      dashboard.channels[channelSlug].comments += comments;
      dashboard.totalComments = (dashboard.totalComments || 0) + comments;
    }
    dashboard.channels[channelSlug].lastSeen = new Date().toISOString();
    dashboard.lastUpdated = new Date().toISOString();
    dashboard.discordId = data.userDiscordId;
    dashboard.username = data.userDiscordUsername || 'Unknown';

    await chrome.storage.local.set({ [`dash_${data.userDiscordId}`]: dashboard });
  } catch(e) {
    console.error('[Dashboard] Failed to update storage:', e);
  }
}

async function getStats(channelId) {
  const data = await chrome.storage.local.get(['stats']);
  const stats = data.stats || {};
  if (!stats[channelId]) {
    stats[channelId] = { totalComments: 0, totalWatchTime: 0 };
  }
  return stats[channelId];
}

async function saveStats(channelId, stats) {
  const data = await chrome.storage.local.get(['stats']);
  const allStats = data.stats || {};
  allStats[channelId] = stats;
  await chrome.storage.local.set({ stats: allStats });
}

// Admin popup requests dashboard for a specific user by discordId
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getDashboard' && msg.discordId) {
    const dashKey = `dash_${msg.discordId}`;
    chrome.storage.local.get([dashKey], (result) => {
      sendResponse({ dashboard: result[dashKey] || null });
    });
    return true; // async
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(['channels'], (result) => {
    const channels = result.channels || [];
    let changed = false;
    for (let i = 0; i < channels.length; i++) {
      if (channels[i].openedTabId === tabId) {
        channels[i].openedTabId = null;
        changed = true;
        break;
      }
    }
    if (changed) chrome.storage.local.set({ channels });
  });
});

setInterval(async () => {
  const data = await chrome.storage.local.get(['moderatedUsers', 'channels']);
  const moderatedUsers = data.moderatedUsers || {};
  const channels = data.channels || [];
  let updated = false;
  let channelsUpdated = false;
  
  Object.keys(moderatedUsers).forEach(userId => {
    const user = moderatedUsers[userId];
    if (user.timeout && user.timeoutExpires) {
      if (new Date(user.timeoutExpires) < new Date()) {
        user.timeout = false;
        delete user.timeoutExpires;
        updated = true;
        
        const chIndex = channels.findIndex(c => c.id === userId);
        if (chIndex !== -1 && !user.banned) {
          channels[chIndex].autoMode = true;
          channelsUpdated = true;
        }
      }
    }
  });
  
  if (updated) {
    await chrome.storage.local.set({ moderatedUsers });
  }
  if (channelsUpdated) {
    await chrome.storage.local.set({ channels });
    chrome.runtime.sendMessage({ action: "checkNow" }).catch(() => {});
  }
}, 30000);

async function setCurrentlyViewing(channelId) {
  const data = await chrome.storage.local.get(['stats']);
  const stats = data.stats || {};
  
  Object.keys(stats).forEach(id => {
    stats[id].currentlyViewing = false;
  });
  
  if (!stats[channelId]) stats[channelId] = { totalComments: 0, totalWatchTime: 0 };
  stats[channelId].currentlyViewing = true;
  stats[channelId].currentlyViewingTime = new Date().toISOString();
  
  await chrome.storage.local.set({ stats });
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url && tab.url.includes('kick.com')) {
    const data = await chrome.storage.local.get(['channels']);
    const channels = data.channels || [];
    
    for (const channel of channels) {
      if (tab.url.toLowerCase().includes(`kick.com/${channel.slug.toLowerCase()}`)) {
        await setCurrentlyViewing(channel.id);
        break;
      }
    }
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('kick.com')) {
    const data = await chrome.storage.local.get(['channels']);
    const channels = data.channels || [];
    
    for (const channel of channels) {
      if (tab.url.toLowerCase().includes(`kick.com/${channel.slug.toLowerCase()}`)) {
        await setCurrentlyViewing(channel.id);
        break;
      }
    }
  }
});
