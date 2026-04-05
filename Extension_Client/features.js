// ============================================================
// AK STREAMERS — features.js
// Dark/Light Theme · Language (EN/FR/AR) · Drag&Drop · Ann History
// ============================================================

// ── TRANSLATIONS ────────────────────────────────────────────
const BRAND_PRIMARY = globalThis.APP_CONFIG?.brand?.primary || "AK";
const BRAND_SECONDARY = globalThis.APP_CONFIG?.brand?.secondary || "STREAMERS";
const FEATURES_DEFAULT_API_BASE_URL = globalThis.APP_CONFIG?.api?.fallbackUrl || "http://localhost:3000";
const FEATURES_DEV_TOOLS_ENABLED = globalThis.APP_CONFIG?.security?.enableDeveloperTools === true;

const I18N = {
  en: {
    channels_tab:    "CHANNELS",
    admin_tab:       "ADMIN",
    settings_tab:    "SETTINGS",
    dashboard_tab:   "DASHBOARD",
    app_title:       BRAND_PRIMARY,
    app_title_dim:   BRAND_SECONDARY,
    add_channel:     "ADD CHANNEL",
    active_mon:      "ACTIVE MONITORING",
    total:           "TOTAL",
    live:            "LIVE",
    language:        "LANGUAGE",
    global_settings: "GLOBAL SETTINGS",
    global_mute:     "Global Mute",
    humanization:    "Humanization",
    typing_delay:    "TYPING DELAY",
    typo_chance:     "TYPO CHANCE",
    stream_opt:      "STREAM OPTIMIZATION",
    auto_quality:    "AUTO QUALITY",
    volume_boost:    "VOLUME BOOST",
    volume_hint:     "Boost volume up to 500% (Requires user interaction on page)",
    session_activity:"SESSION ACTIVITY",
    total_watch:     "TOTAL WATCH TIME",
    total_msgs:      "TOTAL MESSAGES",
    watch_history:   "WATCH HISTORY",
    activity_logs:   "ACTIVITY LOGS",
    ann_history:     "Announcement History",
    ann_history_sub: "All sent announcements with stats",
    no_announcements:"No announcements yet",
    clear_all:       "CLEAR ALL",
    confirmed:       "confirmed",
    pending:         "pending",
  },
  fr: {
    channels_tab:    "CHAÎNES",
    admin_tab:       "ADMIN",
    settings_tab:    "PARAMÈTRES",
    dashboard_tab:   "TABLEAU",
    app_title:       BRAND_PRIMARY,
    app_title_dim:   BRAND_SECONDARY,
    add_channel:     "AJOUTER",
    active_mon:      "SURVEILLANCE",
    total:           "TOTAL",
    live:            "EN DIRECT",
    language:        "LANGUE",
    global_settings: "PARAMÈTRES GLOBAUX",
    global_mute:     "Muet Global",
    humanization:    "Humanisation",
    typing_delay:    "DÉLAI DE FRAPPE",
    typo_chance:     "CHANCE DE FAUTE",
    stream_opt:      "OPTIMISATION STREAM",
    auto_quality:    "QUALITÉ AUTO",
    volume_boost:    "AMPLIFICATION",
    volume_hint:     "Amplifier jusqu'à 500% (Nécessite une interaction sur la page)",
    session_activity:"ACTIVITÉ SESSION",
    total_watch:     "TEMPS DE VISIONNAGE",
    total_msgs:      "MESSAGES TOTAUX",
    watch_history:   "HISTORIQUE",
    activity_logs:   "JOURNAUX",
    ann_history:     "Historique Annonces",
    ann_history_sub: "Toutes les annonces envoyées",
    no_announcements:"Aucune annonce",
    clear_all:       "TOUT EFFACER",
    confirmed:       "confirmé",
    pending:         "en attente",
  },
  es: {
    channels_tab:    "CANALES",
    admin_tab:       "ADMIN",
    settings_tab:    "AJUSTES",
    dashboard_tab:   "PANEL",
    app_title:       BRAND_PRIMARY,
    app_title_dim:   BRAND_SECONDARY,
    add_channel:     "AÑADIR CANAL",
    active_mon:      "MONITOREO ACTIVO",
    total:           "TOTAL",
    live:            "EN VIVO",
    language:        "IDIOMA",
    global_settings: "AJUSTES GLOBALES",
    global_mute:     "Silencio Global",
    humanization:    "Humanización",
    typing_delay:    "RETRASO ESCRITURA",
    typo_chance:     "PROB. DE ERROR",
    stream_opt:      "OPTIMIZACIÓN STREAM",
    auto_quality:    "CALIDAD AUTO",
    volume_boost:    "AMPLIFICACIÓN",
    volume_hint:     "Amplificar hasta 500% (Requiere interacción en la página)",
    session_activity:"ACTIVIDAD SESIÓN",
    total_watch:     "TIEMPO VISUALIZACIÓN",
    total_msgs:      "MENSAJES TOTALES",
    watch_history:   "HISTORIAL",
    activity_logs:   "REGISTROS",
    ann_history:     "Historial de Anuncios",
    ann_history_sub: "Todos los anuncios enviados",
    no_announcements:"Sin anuncios aún",
    clear_all:       "BORRAR TODO",
    confirmed:       "confirmado",
    pending:         "pendiente",
  },
  ar: {
    channels_tab:    "القنوات",
    admin_tab:       "الإدارة",
    settings_tab:    "الإعدادات",
    dashboard_tab:   "لوحة القيادة",
    app_title:       BRAND_PRIMARY,
    app_title_dim:   BRAND_SECONDARY,
    add_channel:     "إضافة قناة",
    active_mon:      "المراقبة النشطة",
    total:           "الإجمالي",
    live:            "مباشر",
    language:        "اللغة",
    global_settings: "الإعدادات العامة",
    global_mute:     "كتم الصوت الشامل",
    humanization:    "محاكاة إنسانية",
    typing_delay:    "تأخير الكتابة",
    typo_chance:     "نسبة الأخطاء",
    stream_opt:      "تحسين البث",
    auto_quality:    "جودة تلقائية",
    volume_boost:    "تعزيز الصوت",
    volume_hint:     "تعزيز حتى 500% (يتطلب تفاعلاً مع الصفحة)",
    session_activity:"نشاط الجلسة",
    total_watch:     "وقت المشاهدة",
    total_msgs:      "إجمالي الرسائل",
    watch_history:   "سجل المشاهدة",
    activity_logs:   "سجل النشاط",
    ann_history:     "سجل الإعلانات",
    ann_history_sub: "جميع الإعلانات المرسلة",
    no_announcements:"لا توجد إعلانات بعد",
    clear_all:       "مسح الكل",
    confirmed:       "مؤكد",
    pending:         "قيد الانتظار",
  }
};

// Full UI translation map: CSS selector → i18n key (for textContent)
const UI_MAP = [
  // Tab buttons
  { sel: '.tab-btn[data-tab="channels"]',  key: 'channels_tab'    },
  { sel: '.tab-btn[data-tab="admin"]',     key: 'admin_tab'       },
  { sel: '.tab-btn[data-tab="settings"]',  key: 'settings_tab'    },
  { sel: '.tab-btn[data-tab="dashboard"]', key: 'dashboard_tab'   },
  // Header title
  { sel: '#app-title',                     key: 'app_title',      after: ' <span class="header-title-dim">{app_title_dim}</span>' },
  // Add channel button — partial, only update text node
  // Section titles — using data-i18n
];

function applyLang(lang) {
  const dict = I18N[lang] || I18N.en;

  // 1. Tab buttons — always retranslate
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    const tab = btn.getAttribute('data-tab');
    const keyMap = {
      channels: 'channels_tab',
      admin:    'admin_tab',
      settings: 'settings_tab',
      dashboard:'dashboard_tab',
    };
    if (keyMap[tab] && dict[keyMap[tab]]) {
      btn.textContent = dict[keyMap[tab]];
    }
  });

  // 2. Header app title
  const titleEl = document.getElementById('app-title');
  if (titleEl) {
    titleEl.innerHTML = `${dict.app_title || BRAND_PRIMARY} <span class="header-title-dim">${dict.app_title_dim || BRAND_SECONDARY}</span>`;
  }

  // 3. All data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });

  // 4. Section titles with data-i18n-section
  document.querySelectorAll('[data-i18n-section]').forEach(el => {
    const key = el.getAttribute('data-i18n-section');
    if (dict[key]) el.textContent = dict[key];
  });

  // 5. RTL for Arabic
  document.body.classList.toggle('lang-ar', lang === 'ar');
  document.documentElement.lang = lang;
}

function initLanguage() {
  chrome.storage.local.get(['appLang'], data => {
    const lang = data.appLang || 'en';
    // Highlight correct button
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
    });
    applyLang(lang);
  });

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.onclick = () => {
      const lang = btn.getAttribute('data-lang');
      chrome.storage.local.set({ appLang: lang });
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyLang(lang);
    };
  });
}

// ── THEME TOGGLE ─────────────────────────────────────────────
function initTheme() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;

  chrome.storage.local.get(['appTheme'], data => {
    const theme = data.appTheme || 'dark';
    applyTheme(theme);
  });

  if (!FEATURES_DEV_TOOLS_ENABLED) {
    btn.onclick = () => {
      const isLight = document.body.classList.contains('light-theme');
      const newTheme = isLight ? 'dark' : 'light';
      chrome.storage.local.set({ appTheme: newTheme });
      applyTheme(newTheme);
    };
    return;
  }

  // Normal click = toggle theme
  // Hold 5s = unlock developer tab (secret)
  let holdTimer = null;
  let holdProgress = null;
  let isHolding = false;

  const startHold = () => {
    isHolding = true;
    let elapsed = 0;
    // Show subtle progress on button
    btn.style.transition = 'box-shadow 0.1s';
    holdProgress = setInterval(() => {
      elapsed += 100;
      const pct = Math.min(elapsed / 5000, 1);
      btn.style.boxShadow = `0 0 ${Math.round(pct * 12)}px rgba(83,252,24,${(pct * 0.8).toFixed(2)})`;
    }, 100);

    holdTimer = setTimeout(() => {
      clearInterval(holdProgress);
      btn.style.boxShadow = '';
      isHolding = false;
      unlockDevTab();
    }, 5000);
  };

  const cancelHold = () => {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (holdProgress) { clearInterval(holdProgress); holdProgress = null; }
    btn.style.boxShadow = '';
    if (isHolding) {
      isHolding = false;
      // Normal click — toggle theme
      const isLight = document.body.classList.contains('light-theme');
      const newTheme = isLight ? 'dark' : 'light';
      chrome.storage.local.set({ appTheme: newTheme });
      applyTheme(newTheme);
    }
  };

  btn.addEventListener('mousedown', startHold);
  btn.addEventListener('touchstart', startHold, { passive: true });
  btn.addEventListener('mouseup', cancelHold);
  btn.addEventListener('mouseleave', cancelHold);
  btn.addEventListener('touchend', cancelHold);
  // Remove old onclick to avoid double-trigger
  btn.onclick = null;
}

function unlockDevTab() {
  if (!FEATURES_DEV_TOOLS_ENABLED) return;

  const devBtn = document.getElementById('dev-tab-btn');
  if (!devBtn) return;

  // Check if already visible
  if (devBtn.style.display !== 'none') {
    // Hide it again (toggle)
    devBtn.style.display = 'none';
    // Switch away from dev tab if active
    const devTab = document.getElementById('developer-tab');
    if (devTab && devTab.classList.contains('active')) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="channels"]').classList.add('active');
      document.getElementById('channels-tab').classList.add('active');
    }
    return;
  }

  // Show dev tab with animation
  devBtn.style.display = '';
  devBtn.style.animation = 'none';
  devBtn.style.color = 'var(--primary)';
  devBtn.style.borderColor = 'var(--primary)';

  // Flash button to indicate unlock
  let flashes = 0;
  const flash = setInterval(() => {
    devBtn.style.background = flashes % 2 === 0 ? 'rgba(83,252,24,0.15)' : 'transparent';
    flashes++;
    if (flashes >= 6) { clearInterval(flash); devBtn.style.background = ''; }
  }, 120);

  initDevTab();
}

function initDevTab() {
  if (!FEATURES_DEV_TOOLS_ENABLED) return;

  // READ ALL storage
  const readBtn = document.getElementById('dev-read-storage');
  const output = document.getElementById('dev-storage-output');
  if (readBtn && output) {
    readBtn.onclick = () => {
      chrome.storage.local.get(null, data => {
        // Hide sensitive keys
        const safe = { ...data };
        delete safe.userDiscordId;
        output.textContent = JSON.stringify(safe, null, 2);
      });
    };
  }

  // CLEAR CHANNELS
  const clearCh = document.getElementById('dev-clear-channels');
  if (clearCh) {
    clearCh.onclick = () => {
      if (!confirm('Clear all channels?')) return;
      chrome.storage.local.set({ channels: [] }, () => {
        devResult('✅ Channels cleared');
      });
    };
  }

  // CLEAR STATS
  const clearSt = document.getElementById('dev-clear-stats');
  if (clearSt) {
    clearSt.onclick = () => {
      if (!confirm('Clear all stats?')) return;
      chrome.storage.local.set({ stats: {} }, () => {
        devResult('✅ Stats cleared');
      });
    };
  }

  // NUKE ALL
  const nukeBtn = document.getElementById('dev-clear-all-storage');
  if (nukeBtn) {
    nukeBtn.onclick = () => {
      if (!confirm('⚠️ NUKE ALL storage? This cannot be undone.')) return;
      if (!confirm('Are you sure? All data will be lost.')) return;
      chrome.storage.local.clear(() => {
        devResult('💥 All storage cleared. Reload required.');
      });
    };
  }

  // API URL — read from Supabase + write to Supabase
  const apiInput = document.getElementById('dev-api-url-input');
  const apiSave = document.getElementById('dev-api-url-save');
  const apiCurrent = document.getElementById('dev-api-current');

  const SUPA_URL = globalThis.APP_CONFIG?.supabase?.url || 'YOUR_SUPABASE_URL';
  const SUPA_HEADERS = (typeof getSupabaseHeaders === 'function')
    ? getSupabaseHeaders({ prefer: 'return=minimal' })
    : {
        apikey: globalThis.APP_CONFIG?.supabase?.restKey || '',
        Authorization: `Bearer ${globalThis.APP_CONFIG?.supabase?.restKey || ''}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      };

  if (apiInput && apiSave && apiCurrent) {
    // Read current URL from Supabase
    apiCurrent.textContent = 'Loading from Supabase...';
    fetch(`${SUPA_URL}/rest/v1/backend_config?select=current_url&limit=1`, { headers: SUPA_HEADERS })
      .then(r => r.json())
      .then(data => {
        const url = data?.[0]?.current_url || 'not set';
        apiCurrent.textContent = `☁️ Supabase: ${url}`;
        apiInput.value = url !== 'not set' ? url : '';
      })
      .catch(() => {
        apiCurrent.textContent = '❌ Failed to load from Supabase';
      });

    // Save new URL to Supabase → updates all users automatically
    apiSave.onclick = async () => {
      const url = apiInput.value.trim();
      if (!url) return devResult('❌ URL is empty');

      apiSave.textContent = 'SAVING...';
      apiSave.disabled = true;

      try {
        // Try PATCH first (update existing row)
        const patchRes = await fetch(`${SUPA_URL}/rest/v1/backend_config?id=eq.1`, {
          method: 'PATCH',
          headers: SUPA_HEADERS,
          body: JSON.stringify({ current_url: url })
        });

        if (!patchRes.ok) throw new Error('PATCH failed');

        apiCurrent.textContent = `☁️ Supabase: ${url}`;
        devResult('✅ URL updated in Supabase — all users will switch automatically');
      } catch {
        // Try POST if PATCH failed (no rows exist)
        try {
          const postRes = await fetch(`${SUPA_URL}/rest/v1/backend_config`, {
            method: 'POST',
            headers: SUPA_HEADERS,
            body: JSON.stringify({ current_url: url })
          });
          if (!postRes.ok) throw new Error('POST failed');
          apiCurrent.textContent = `☁️ Supabase: ${url}`;
          devResult('✅ URL created in Supabase — all users will switch automatically');
        } catch {
          devResult('❌ Failed to update Supabase — check connection');
        }
      } finally {
        apiSave.textContent = 'SAVE';
        apiSave.disabled = false;
      }
    };
  }

  // Extension info
  const infoDiv = document.getElementById('dev-ext-info');
  if (infoDiv) {
    const manifest = chrome.runtime.getManifest();
    chrome.storage.local.get(['userDiscordId', 'isAdminVerified', 'isUserLoggedIn', 'isUserVerified'], data => {
      infoDiv.innerHTML = `
        Version: <b style="color:var(--primary)">${manifest.version}</b><br>
        Extension ID: <b style="color:var(--primary)">${chrome.runtime.id}</b><br>
        Logged in: <b style="color:var(--primary)">${data.isUserLoggedIn || data.isAdminVerified ? 'Yes' : 'No'}</b><br>
        Admin: <b style="color:var(--primary)">${data.isAdminVerified ? 'Yes' : 'No'}</b><br>
        User: <b style="color:var(--primary)">${data.isUserVerified ? 'Yes' : 'No'}</b>
      `;
    });
  }

  // FORCE CHECK CHANNELS
  const forceCheck = document.getElementById('dev-force-check');
  if (forceCheck) {
    forceCheck.onclick = () => {
      chrome.runtime.sendMessage({ action: 'checkNow' }, () => {
        devResult('✅ Channel check triggered');
      });
    };
  }

  // RELOAD EXTENSION
  const reloadBtn = document.getElementById('dev-reload-ext');
  if (reloadBtn) {
    reloadBtn.onclick = () => {
      chrome.runtime.reload();
    };
  }

  // CLOSE ALL KICK TABS
  const closeTabsBtn = document.getElementById('dev-close-all-tabs');
  if (closeTabsBtn) {
    closeTabsBtn.onclick = () => {
      chrome.runtime.sendMessage({ action: 'panic' }, () => {
        devResult('✅ All Kick tabs closed');
      });
    };
  }
}

function devResult(msg) {
  const el = document.getElementById('dev-action-result');
  if (el) {
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 3000);
  }
}

function applyTheme(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    if (btn) btn.textContent = '☀️';
  } else {
    document.body.classList.remove('light-theme');
    if (btn) btn.textContent = '🌙';
  }
}

// ── DRAG & DROP CHANNEL REORDER ──────────────────────────────
let _dragSrc = null;

function enableDragDrop(list) {
  const items = list.querySelectorAll('.channel-item');

  items.forEach(item => {
    item.setAttribute('draggable', 'true');

    // Add drag handle icon at start of channel-info
    if (!item.querySelector('.drag-handle')) {
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.innerHTML = '⠿';
      handle.title = 'Drag to reorder';
      item.insertBefore(handle, item.firstChild);
    }

    item.ondragstart = e => {
      _dragSrc = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    };

    item.ondragend = () => {
      item.classList.remove('dragging');
      list.querySelectorAll('.channel-item').forEach(i => i.classList.remove('drag-over'));
      _dragSrc = null;
      _saveDragOrder(list);
    };

    item.ondragover = e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (item !== _dragSrc) {
        list.querySelectorAll('.channel-item').forEach(i => i.classList.remove('drag-over'));
        item.classList.add('drag-over');
      }
    };

    item.ondrop = e => {
      e.preventDefault();
      if (_dragSrc && _dragSrc !== item) {
        const allItems = Array.from(list.querySelectorAll('.channel-item'));
        const srcIdx = allItems.indexOf(_dragSrc);
        const tgtIdx = allItems.indexOf(item);
        if (srcIdx < tgtIdx) {
          list.insertBefore(_dragSrc, item.nextSibling);
        } else {
          list.insertBefore(_dragSrc, item);
        }
      }
    };
  });
}

async function _saveDragOrder(list) {
  const data = await chrome.storage.local.get(['channels']);
  const channels = data.channels || [];
  const newOrder = [];
  list.querySelectorAll('.channel-item').forEach(item => {
    const idx = parseInt(item.getAttribute('data-index'));
    if (!isNaN(idx) && channels[idx]) newOrder.push(channels[idx]);
  });
  if (newOrder.length === channels.length) {
    await chrome.storage.local.set({ channels: newOrder });
  }
}

// Hook into existing renderChannels to add drag after render
const _origRenderChannels = window.renderChannels;
if (typeof _origRenderChannels === 'function') {
  window.renderChannels = function(channels) {
    _origRenderChannels(channels);
    const list = document.getElementById('channels-list');
    if (list) enableDragDrop(list);
  };
}

// Wait for renderChannels to be available if not yet
document.addEventListener('DOMContentLoaded', () => {
  // Patch renderChannels after popup.js has loaded
  setTimeout(() => {
    if (typeof window.renderChannels === 'function' && !window._dragPatched) {
      window._dragPatched = true;
      const orig = window.renderChannels;
      window.renderChannels = function(channels) {
        orig(channels);
        const list = document.getElementById('channels-list');
        if (list) enableDragDrop(list);
      };
    }
  }, 200);
});

// ── ANNOUNCEMENT HISTORY ─────────────────────────────────────

// Save announcement to local history when admin sends one
// Hooked via chrome.runtime message from background or direct call
async function saveAnnouncementToHistory(entry) {
  // entry: { message, senderName, target, timestamp, confirmations, pending }
  const data = await chrome.storage.local.get(['annHistory']);
  const history = data.annHistory || [];
  // Avoid duplicate by timestamp
  if (!history.find(h => h.timestamp === entry.timestamp)) {
    history.unshift(entry); // newest first
    if (history.length > 50) history.pop(); // keep last 50
    await chrome.storage.local.set({ annHistory: history });
  }
}

// Load and render history panel
async function loadAnnHistory() {
  const listEl = document.getElementById('ann-history-list');
  if (!listEl) return;

  const [data, langData] = await Promise.all([
    chrome.storage.local.get(['annHistory']),
    chrome.storage.local.get(['appLang'])
  ]);
  const history = data.annHistory || [];
  const lang = langData.appLang || 'en';
  const dict = I18N[lang] || I18N.en;

  listEl.innerHTML = '';

  if (history.length === 0) {
    listEl.innerHTML = `<div class="ann-history-empty">${dict.no_announcements}</div>`;
    return;
  }

  history.forEach(entry => {
    const date = new Date(entry.timestamp);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const confirmed = entry.confirmations || 0;
    const total = (entry.confirmations || 0) + (entry.pending || 0);
    const pct = total > 0 ? Math.round(confirmed / total * 100) : 0;

    const targetColors = { users: '#3b82f6', admins: '#53fc18', everyone: '#f59e0b' };
    const targetColor = targetColors[entry.target] || '#3b82f6';

    const item = document.createElement('div');
    item.className = 'ann-history-item';
    item.innerHTML = `
      <div class="ann-history-meta">
        <div class="ann-history-sender">
          <div style="width:18px;height:18px;border-radius:5px;background:rgba(83,252,24,0.15);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:var(--primary);">${(entry.senderName || 'A')[0].toUpperCase()}</div>
          @${entry.senderName || 'Admin'}
        </div>
        <div class="ann-history-time">${dateStr} · ${timeStr}</div>
      </div>
      <div class="ann-history-msg">${entry.message}</div>
      <div class="ann-history-footer">
        <span class="ann-history-target" style="background:${targetColor}18;border-color:${targetColor}33;color:${targetColor};">
          ${entry.target || 'users'}
        </span>
        ${total > 0 ? `
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="ann-history-confirmed">✅ ${confirmed}</span>
          <span style="color:var(--text-dim);">/ ${total}</span>
          <span style="color:var(--primary);font-weight:700;">(${pct}%)</span>
        </div>` : ''}
      </div>
    `;
    listEl.appendChild(item);
  });
}

function initAnnHistory() {
  const openBtn = document.getElementById('open-ann-history-btn');
  const panel = document.getElementById('ann-history-panel');
  const arrow = document.getElementById('ann-history-arrow');
  const clearBtn = document.getElementById('clear-ann-history-btn');

  if (!openBtn || !panel) return;

  openBtn.onclick = () => {
    const isOpen = panel.style.maxHeight && panel.style.maxHeight !== '0px';
    if (isOpen) {
      panel.style.maxHeight = '0px';
      arrow.style.transform = 'rotate(0deg)';
    } else {
      panel.style.maxHeight = '450px';
      arrow.style.transform = 'rotate(90deg)';
      loadAnnHistory();
    }
  };

  if (clearBtn) {
    clearBtn.onclick = async (e) => {
      e.stopPropagation();
      if (await ASCDialog.danger('Clear all announcement history?', { confirmLabel: 'CLEAR', cancelLabel: 'Cancel' })) {
        await chrome.storage.local.set({ annHistory: [] });
        loadAnnHistory();
      }
    };
  }

  // Hook into the send confirmation flow to save to history
  // Intercept the confirm button click
  const confirmBtn = document.getElementById('confirm-announcement-btn');
  if (confirmBtn) {
    const origOnClick = confirmBtn.onclick;
    confirmBtn.addEventListener('click', async () => {
      // After a short delay (let original handler run first), check last sent
      setTimeout(async () => {
        try {
          const data = await chrome.storage.local.get(['userDiscordId', 'userDiscordUsername', 'API_BASE_URL']);
          const baseUrl = data.API_BASE_URL || FEATURES_DEFAULT_API_BASE_URL;
          const res = await fetch(`${baseUrl}/api/announcement/latest`);
          if (res.ok) {
            const ann = await res.json();
            if (ann && ann.message && ann.sentBy === data.userDiscordId) {
              const [confRes] = await Promise.all([
                fetch(`${baseUrl}/api/announcement/confirmations?adminId=${data.userDiscordId}`)
              ]);
              const confData = confRes.ok ? await confRes.json() : {};
              await saveAnnouncementToHistory({
                message: ann.message,
                senderName: data.userDiscordUsername || 'Admin',
                target: ann.target || 'users',
                timestamp: ann.timestamp,
                confirmations: (confData.confirmations || []).length,
                pending: (confData.pending || []).length,
              });
            }
          }
        } catch(e) { /* silent */ }
      }, 2000);
    }, { capture: false });
  }
}

// ── INIT ALL FEATURES ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initLanguage();
  initAnnHistory();

  // Drag & drop: patch renderChannels once popup.js has run
  setTimeout(() => {
    if (typeof window.renderChannels === 'function' && !window._dragPatched) {
      window._dragPatched = true;
      const orig = window.renderChannels;
      window.renderChannels = function(channels) {
        orig(channels);
        const list = document.getElementById('channels-list');
        if (list) enableDragDrop(list);
      };
    }
  }, 300);
});

// Expose for external use
window.ASCFeatures = { saveAnnouncementToHistory, loadAnnHistory, applyTheme, applyLang };
