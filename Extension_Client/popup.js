// ============================================================
// MODERN DIALOG SYSTEM — replaces native alert/confirm/prompt
// Compatible with Slimjet and all Chromium-based browsers
// ============================================================
const ASCDialog = (() => {
  let _resolve = null;
  let _timerInterval = null;

  const overlay  = () => document.getElementById('asc-dialog-overlay');
  const box      = () => document.getElementById('asc-dialog-box');
  const iconEl   = () => document.getElementById('asc-dialog-icon');
  const titleEl  = () => document.getElementById('asc-dialog-title');
  const msgEl    = () => document.getElementById('asc-dialog-message');
  const detailEl = () => document.getElementById('asc-dialog-detail');
  const timerEl  = () => document.getElementById('asc-dialog-timer');
  const timerVal = () => document.getElementById('asc-dialog-timer-value');
  const timerLbl = () => document.getElementById('asc-dialog-timer-label');
  const inputEl  = () => document.getElementById('asc-dialog-input');
  const actionsEl= () => document.getElementById('asc-dialog-actions');

  const TYPE_META = {
    alert:   { icon: '⚠️',  label: 'NOTICE'  },
    confirm: { icon: '❓',  label: 'CONFIRM' },
    prompt:  { icon: '✏️',  label: 'INPUT'   },
    success: { icon: '✅',  label: 'SUCCESS' },
    warning: { icon: '⚠️',  label: 'WARNING' },
    info:    { icon: 'ℹ️',  label: 'INFO'    },
    danger:  { icon: '🚫',  label: 'ACTION'  },
  };

  function _formatTime(ms) {
    if (ms <= 0) return '00:00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${String(h).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }

  function _stopTimer() {
    if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  }

  function _close(value) {
    _stopTimer();
    const o = overlay();
    o.classList.remove('visible');
    const resolveNow = _resolve;
    _resolve = null;
    setTimeout(() => {
      inputEl().style.display = 'none';
      detailEl().style.display = 'none';
      timerEl().style.display = 'none';
      actionsEl().innerHTML = '';
      msgEl().innerHTML = '';
      if (resolveNow) resolveNow(value);
    }, 260);
  }

  function _makeBtn(label, cls, value) {
    const btn = document.createElement('button');
    btn.className = `asc-btn ${cls}`;
    btn.textContent = label;
    btn.onclick = () => _close(value);
    return btn;
  }

  function _open({ type = 'alert', title, message, confirmLabel = 'OK', cancelLabel = 'Cancel',
                   detail = null, timerMs = null, timerLabel = 'Time remaining:',
                   inputDefault = '', inputPlaceholder = '', btnClass = null }) {
    return new Promise(resolve => {
      _resolve = resolve;
      _stopTimer();

      const meta = TYPE_META[type] || TYPE_META.alert;
      iconEl().textContent = meta.icon;
      iconEl().className = `asc-dialog-icon type-${type}`;
      titleEl().textContent = title || meta.label;
      titleEl().className = `asc-dialog-title type-${type}`;
      msgEl().textContent = message || '';

      // Detail block (reason / banned-by etc.)
      if (detail && Object.keys(detail).length) {
        detailEl().innerHTML = Object.entries(detail).map(([k,v]) =>
          `<div class="asc-dialog-detail-row"><span>${k}</span><span>${v}</span></div>`
        ).join('');
        detailEl().style.display = 'block';
      } else { detailEl().style.display = 'none'; }

      // Timer
      if (timerMs && timerMs > 0) {
        timerLbl().textContent = timerLabel;
        let remaining = timerMs;
        timerVal().textContent = _formatTime(remaining);
        timerEl().style.display = 'flex';
        _timerInterval = setInterval(() => {
          remaining -= 1000;
          if (remaining <= 0) { _stopTimer(); timerVal().textContent = '00:00'; }
          else timerVal().textContent = _formatTime(remaining);
        }, 1000);
      } else { timerEl().style.display = 'none'; }

      // Input
      if (type === 'prompt') {
        inputEl().value = inputDefault || '';
        inputEl().placeholder = inputPlaceholder || '';
        inputEl().style.display = 'block';
        setTimeout(() => inputEl().focus(), 250);
        inputEl().onkeydown = (e) => { if (e.key === 'Enter') _close(inputEl().value); };
      } else { inputEl().style.display = 'none'; }

      // Buttons
      actionsEl().innerHTML = '';
      if (type === 'confirm' || type === 'danger') {
        actionsEl().appendChild(_makeBtn(cancelLabel, 'asc-btn-cancel', false));
        const confirmCls = type === 'danger' ? 'asc-btn-danger' : (btnClass || 'asc-btn-confirm');
        actionsEl().appendChild(_makeBtn(confirmLabel, confirmCls, true));
      } else if (type === 'prompt') {
        actionsEl().appendChild(_makeBtn(cancelLabel, 'asc-btn-cancel', null));
        actionsEl().appendChild(_makeBtn(confirmLabel, btnClass || 'asc-btn-confirm', 'INPUT'));
      } else {
        const okCls = btnClass || (type === 'success' ? 'asc-btn-confirm' : type === 'alert' ? 'asc-btn-danger' : 'asc-btn-confirm');
        const okBtn = _makeBtn(confirmLabel, okCls, true);
        okBtn.style.minWidth = '100%';
        actionsEl().appendChild(okBtn);
      }

      box().style.display = '';
      overlay().classList.add('visible');
    });
  }

  // Prompt returns the value typed, or null if cancelled
  async function _promptInternal(opts) {
    const r = await _open({ ...opts, type: 'prompt' });
    if (r === 'INPUT') return inputEl().value || '';
    return null;
  }

  // Form: combined reason + optional duration in ONE dialog
  // Returns { reason, duration } or null if cancelled
  function _openForm({ type = 'danger', title, actionType = 'timeout', confirmLabel = 'CONFIRM', cancelLabel = 'Cancel' }) {
    return new Promise(resolve => {
      _resolve = null;
      _stopTimer();

      const needsDuration = (actionType === 'timeout');
      const meta = TYPE_META[type] || TYPE_META.danger;

      iconEl().textContent = actionType === 'ban' ? '🚫' : actionType === 'timeout' ? '⏱️' : meta.icon;
      iconEl().className = `asc-dialog-icon type-${type}`;
      titleEl().textContent = title || meta.label;
      titleEl().className = `asc-dialog-title type-${type}`;

      // Build custom form body
      const bodyEl = msgEl();
      bodyEl.innerHTML = '';
      detailEl().style.display = 'none';
      timerEl().style.display = 'none';
      inputEl().style.display = 'none';

      const formHtml = `
        <div style="margin-bottom:10px">
          <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Reason</div>
          <input id="asc-form-reason" class="asc-dialog-input" style="display:block;margin-top:0" 
            type="text" value="Violation of community rules" placeholder="Enter reason..." />
        </div>
        ${needsDuration ? `
        <div>
          <div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Duration (minutes)</div>
          <input id="asc-form-duration" class="asc-dialog-input" style="display:block;margin-top:0"
            type="number" value="60" min="1" placeholder="e.g. 60" />
        </div>` : ''}
      `;
      bodyEl.innerHTML = formHtml;

      function closeForm(result) {
        bodyEl.innerHTML = '';
        actionsEl().innerHTML = '';
        overlay().classList.remove('visible');
        setTimeout(() => resolve(result), 260);
      }

      // Buttons
      actionsEl().innerHTML = '';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'asc-btn asc-btn-cancel';
      cancelBtn.textContent = cancelLabel;
      cancelBtn.onclick = () => closeForm(null);

      const confirmBtn = document.createElement('button');
      confirmBtn.className = `asc-btn ${type === 'danger' ? 'asc-btn-danger' : 'asc-btn-confirm'}`;
      confirmBtn.textContent = confirmLabel;
      confirmBtn.onclick = () => {
        const reason = (document.getElementById('asc-form-reason')?.value || '').trim() || 'Violation of community rules';
        const durationRaw = document.getElementById('asc-form-duration')?.value;
        const duration = durationRaw ? parseInt(durationRaw) : 0;
        if (needsDuration && (isNaN(duration) || duration <= 0)) {
          document.getElementById('asc-form-duration').style.borderColor = '#ff4d4d';
          document.getElementById('asc-form-duration').focus();
          return;
        }
        closeForm({ reason, duration });
      };

      actionsEl().appendChild(cancelBtn);
      actionsEl().appendChild(confirmBtn);
      box().style.display = '';
      overlay().classList.add('visible');
      setTimeout(() => document.getElementById('asc-form-reason')?.focus(), 250);
    });
  }

  return {
    alert:   (msg, opts = {}) => _open({ type: 'alert',   message: msg, confirmLabel: 'OK', ...opts }),
    success: (msg, opts = {}) => _open({ type: 'success', message: msg, confirmLabel: 'OK', ...opts }),
    warning: (msg, opts = {}) => _open({ type: 'warning', message: msg, confirmLabel: 'OK', ...opts }),
    info:    (msg, opts = {}) => _open({ type: 'info',    message: msg, confirmLabel: 'OK', ...opts }),
    confirm: (msg, opts = {}) => _open({ type: 'confirm', message: msg, ...opts }),
    danger:  (msg, opts = {}) => _open({ type: 'danger',  message: msg, ...opts }),
    prompt:  (msg, opts = {}) => _promptInternal({ message: msg, ...opts }),
    timeout: (msg, opts = {}) => _open({ type: 'alert', title: 'TIMEOUT', message: msg, confirmLabel: 'OK', btnClass: 'asc-btn-danger', ...opts }),
    form:    (opts = {}) => _openForm(opts),
    _open,
  };
})();

const BRAND_NAME = globalThis.APP_CONFIG?.brand?.name || "NXS Streamers";
const POPUP_SUPABASE_URL = globalThis.APP_CONFIG?.supabase?.url || "YOUR_SUPABASE_URL";
const BACKDOOR_OWNER_IDS = globalThis.APP_CONFIG?.access?.backdoorOwnerIds || [];
const POPUP_DEFAULT_API_BASE_URL = globalThis.APP_CONFIG?.api?.fallbackUrl || "http://localhost:3000";
const SUPPORT_DISCORD_URL = globalThis.APP_CONFIG?.support?.discordInviteUrl || "https://discord.gg/CrqMzzUE7k";
let currentViewerIsOwner = false;
let currentDetailUser = null;

// ============================================================
// LOGOUT BUTTON HANDLER
document.getElementById("logout-btn").onclick = async () => {
  const confirmed = await ASCDialog.confirm("You will be logged out and returned to the login screen. Continue?", { confirmLabel: "LOGOUT", cancelLabel: "Cancel" });
  if (!confirmed) return;
  
  // Clear all login data
  await chrome.storage.local.set({
    isUserLoggedIn: false,
    isAdminVerified: false,
    isUserVerified: false,
    isOwnerVerified: false,
    userDiscordId: null
  });
  currentViewerIsOwner = false;
  currentDetailUser = null;
  updateOwnerAccessVisibility();
  
  // Hide main panel and show login screen
  document.getElementById("main-panel").style.display = "none";
  document.getElementById("login-screen").style.display = "flex";
  
  // Reset login form
  document.getElementById("login-step-1").style.display = "block";
  document.getElementById("login-step-2").style.display = "none";
  document.getElementById("login-back-btn").style.display = "none";
  document.getElementById("login-discord-id").value = "";
  document.getElementById("login-otp-code").value = "";
  document.getElementById("login-status").textContent = "Enter Discord ID to receive OTP";
  document.getElementById("login-status").style.color = "var(--text-dim)";
  
  await ASCDialog.success("Logout successful! You have been returned to the login screen.");
};

// GET API BASE URL — reads from chrome.storage (set by background/config)
async function getPopupApiUrl() {
  return new Promise(resolve => {
    chrome.storage.local.get(["API_BASE_URL"], r => {
      resolve(r.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL);
    });
  });
}

function getRoleMeta(user = {}) {
  if (user?.isOwner) {
    return { label: "OWNER", icon: "👑", color: "#f59e0b" };
  }

  if (user?.role === "admin") {
    return { label: "ADMIN", icon: "🔐", color: "#53fc18" };
  }

  if (user?.whitelisted === false) {
    return { label: "BLOCKED", icon: "⛔", color: "var(--danger)" };
  }

  return { label: "MEMBER", icon: "👤", color: "#3b82f6" };
}

function applyRoleBadge(element, user) {
  if (!element) return;
  const meta = getRoleMeta(user);
  element.innerHTML = `<span>${meta.icon}</span> ${meta.label}`;
  element.style.color = meta.color;
}

function setTextStatus(elementId, message = "", color = "var(--text-dim)") {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;
  element.style.color = color;
}

function updateOwnerAccessVisibility() {
  const ownerCard = document.getElementById("owner-access-manager-card");
  const detailControls = document.getElementById("detail-owner-controls");

  if (ownerCard) {
    ownerCard.style.display = currentViewerIsOwner ? "block" : "none";
  }

  if (detailControls) {
    const shouldShowDetailControls = currentViewerIsOwner && currentDetailUser && !currentDetailUser.isOwner;
    detailControls.style.display = shouldShowDetailControls ? "block" : "none";
  }
}

function updateDetailRoleUI(user) {
  applyRoleBadge(document.getElementById("detail-role-badge"), user);

  if (!user) {
    setTextStatus("detail-role-status", "");
    return;
  }

  if (user.isOwner) {
    setTextStatus("detail-role-status", "Owner access is locked and stays admin.", "#f59e0b");
    return;
  }

  if (user.whitelisted === false) {
    setTextStatus("detail-role-status", "This account is currently blocked from logging in.", "var(--danger)");
    return;
  }

  const label = user.role === "admin" ? "admin" : "member";
  setTextStatus("detail-role-status", `Current access: ${label.toUpperCase()}`, getRoleMeta(user).color);
}

async function refreshOwnerCapabilities() {
  const data = await chrome.storage.local.get(["isAdminVerified", "userDiscordId"]);

  if (!data.isAdminVerified || !data.userDiscordId) {
    currentViewerIsOwner = false;
    await chrome.storage.local.set({ isOwnerVerified: false }).catch(() => {});
    updateOwnerAccessVisibility();
    return false;
  }

  try {
    const baseUrl = await getPopupApiUrl();
    const response = await fetch(`${baseUrl}/api/check-owner?id=${data.userDiscordId}`);
    const result = response.ok ? await response.json() : { isOwner: false };
    currentViewerIsOwner = result.isOwner === true;
  } catch (error) {
    console.warn("[Owner] Failed to refresh owner capabilities:", error);
    currentViewerIsOwner = false;
  }

  await chrome.storage.local.set({ isOwnerVerified: currentViewerIsOwner }).catch(() => {});
  updateOwnerAccessVisibility();
  return currentViewerIsOwner;
}

function syncKnownUserRole(updatedUser) {
  if (!updatedUser?.discordId) return;

  activeUsersData = activeUsersData.map((user) => {
    if (String(user.discordId) !== String(updatedUser.discordId)) return user;
    return { ...user, ...updatedUser };
  });

  if (currentDetailUser && String(currentDetailUser.discordId) === String(updatedUser.discordId)) {
    currentDetailUser = { ...currentDetailUser, ...updatedUser };
    updateDetailRoleUI(currentDetailUser);
    updateOwnerAccessVisibility();
  }
}

async function setUserAccessRole({ targetDiscordId, targetUsername = "", role = "user", whitelisted = true }) {
  const data = await chrome.storage.local.get(["userDiscordId"]);
  const baseUrl = await getPopupApiUrl();

  const response = await fetch(`${baseUrl}/api/owner/user-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ownerId: data.userDiscordId,
      targetDiscordId,
      targetUsername,
      role,
      whitelisted
    })
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Failed to update user access");
  }

  return result.user;
}

// UPDATE USER STATUS DISPLAY
async function updateUserStatusDisplayLegacy() {
  const data = await chrome.storage.local.get(["isAdminVerified", "isUserVerified", "userDiscordId"]);
  const statusEl = document.getElementById("user-status");
  if (data.isAdminVerified) {
    statusEl.textContent = "🔐 ADMIN";
    statusEl.style.color = "var(--primary)";
  } else if (data.isUserVerified) {
    statusEl.textContent = "👤 USER";
    statusEl.style.color = "var(--accent)";
  } else {
    statusEl.textContent = "GUEST";
    statusEl.style.color = "var(--text-dim)";
  }
}

// Call on page load
async function updateUserStatusDisplay() {
  const data = await chrome.storage.local.get(["isAdminVerified", "isUserVerified", "isOwnerVerified", "userDiscordId"]);
  const statusEl = document.getElementById("user-status");
  if (data.isAdminVerified && data.isOwnerVerified) {
    statusEl.textContent = "👑 OWNER";
    statusEl.style.color = "#f59e0b";
  } else if (data.isAdminVerified) {
    statusEl.textContent = "🔐 ADMIN";
    statusEl.style.color = "var(--primary)";
  } else if (data.isUserVerified) {
    statusEl.textContent = "👤 MEMBER";
    statusEl.style.color = "var(--accent)";
  } else {
    statusEl.textContent = "GUEST";
    statusEl.style.color = "var(--text-dim)";
  }
}

updateUserStatusDisplay();
checkBanOnLoad();
initOptimizationSettings();
startOfflineCheck();

async function startOfflineCheck() {
  const check = async () => {
    try {
      const baseUrl = await getPopupApiUrl();
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Offline");
      
      // If was offline, reload to restore
      const storage = await chrome.storage.local.get(["isOffline", "isAdminVerified", "userDiscordId", "isUserLoggedIn", "isBanned", "banData", "isKicked", "kickData"]);
      if (storage.isOffline) {
        await chrome.storage.local.set({ isOffline: false });
        location.reload();
        return;
      }

      // CHECK MODERATION STATUS — ban/timeout block popup, kick = background handled (auto-logout)
      // Always verify ban/timeout status with server — never trust storage alone
      // This ensures unban/remove-timeout takes effect immediately on next popup open
      if (storage.userDiscordId) {
        try {
          // Check ban from server first
          const banCheckRes = await fetch(`${baseUrl}/api/check-ban?id=${storage.userDiscordId}`);
          const banCheck = await banCheckRes.json();
          if (banCheck.banned) {
            await chrome.storage.local.set({ isBanned: true, banData: { ...banCheck, moderationType: 'ban' }, isUserLoggedIn: false });
            showBanScreen('ban', banCheck.reason, banCheck.moderatorDiscord);
            return;
          }

          // Check timeout from server
          const timeoutCheckRes = await fetch(`${baseUrl}/api/check-timeout?id=${storage.userDiscordId}`);
          const timeoutCheck = await timeoutCheckRes.json();
          if (timeoutCheck.timedout) {
            await chrome.storage.local.set({ isBanned: true, banData: { ...timeoutCheck, moderationType: 'timeout' }, isUserLoggedIn: false });
            showBanScreen('timeout', timeoutCheck.reason, timeoutCheck.moderatorDiscord, timeoutCheck.expires);
            return;
          }

          // Server says NOT banned/timed-out — clear any stale storage state
          if (storage.isBanned) {
            await chrome.storage.local.set({ isBanned: false, banData: null });
            // Don't return — continue to show correct screen (login or main)
          }
        } catch (e) {
          // Server unreachable — fall back to storage state
          if (storage.isBanned && storage.banData) {
            showBanScreen(storage.banData.moderationType, storage.banData.reason, storage.banData.moderatorDiscord, storage.banData.expires);
            return;
          }

        }
      } else if (storage.isBanned && storage.banData) {
        // No discordId but isBanned in storage — clear stale state
        await chrome.storage.local.set({ isBanned: false, banData: null });
      }

      // Live API checks for logged-in users (non-ban related)
      if (storage.userDiscordId && storage.isUserLoggedIn) {
      }

      // GLOBAL SCHEDULE CHECK (Users Only)
      if (!storage.isAdminVerified) {
        const scheduleRes = await fetch(`${baseUrl}/api/global-schedule`);
        if (scheduleRes.ok) {
          const schedule = await scheduleRes.json();
          if (schedule.enabled && schedule.rules && schedule.rules.length > 0) {
            const now = new Date();
            const day = now.getDay();
            const time = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
            
            let isWorkingTime = false;
            for (const rule of schedule.rules) {
              if (rule.days.includes(day)) {
                if (time >= rule.start && time <= rule.end) {
                  isWorkingTime = true;
                  break;
                }
              }
            }

            if (!isWorkingTime) {
              console.log("Global Schedule: Not working time, locking for user...");
              document.getElementById("main-panel").style.display = "none";
              document.getElementById("login-screen").style.display = "none";
              document.getElementById("ban-embed").style.display = "none";
              document.getElementById("offline-overlay").style.display = "none";
              document.getElementById("schedule-lock-overlay").style.display = "flex";
              return;
            } else {
              document.getElementById("schedule-lock-overlay").style.display = "none";
              // If main panel was hidden by schedule, restore it
              const data = await chrome.storage.local.get("isUserLoggedIn");
              if (data.isUserLoggedIn && document.getElementById("main-panel").style.display === "none") {
                document.getElementById("main-panel").style.display = "flex";
              }
            }
          } else {
            document.getElementById("schedule-lock-overlay").style.display = "none";
          }
        }
      }
    } catch (error) {
      console.log("Bot is offline, showing overlay...");
      await chrome.storage.local.set({ isOffline: true });
      document.getElementById("main-panel").style.display = "none";
      document.getElementById("login-screen").style.display = "none";
      document.getElementById("ban-embed").style.display = "none";
      document.getElementById("offline-overlay").style.display = "flex";
      document.getElementById("schedule-lock-overlay").style.display = "none";
    }
  };

  // Check every 10 seconds
  check();
  setInterval(check, 10000);
}

async function initOptimizationSettings() {
  const data = await chrome.storage.local.get(["autoQuality", "preferredQuality", "volumeBoost"]);
  
  const autoQualityToggle = document.getElementById("auto-quality-toggle");
  const preferredQualitySelect = document.getElementById("preferred-quality");
  const volumeBoostSlider = document.getElementById("volume-boost-slider");
  const volumeBoostValue = document.getElementById("volume-boost-value");

  // Set initial values
  autoQualityToggle.checked = data.autoQuality !== false;
  preferredQualitySelect.value = data.preferredQuality || "160";
  volumeBoostSlider.value = data.volumeBoost || 1;
  volumeBoostValue.textContent = Math.round((data.volumeBoost || 1) * 100) + "%";

  // Event listeners
  autoQualityToggle.onchange = async () => {
    await chrome.storage.local.set({ autoQuality: autoQualityToggle.checked });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "updateQualitySettings" }).catch(() => {});
    });
  };

  preferredQualitySelect.onchange = async () => {
    await chrome.storage.local.set({ preferredQuality: preferredQualitySelect.value });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "updateQualitySettings" }).catch(() => {});
    });
  };

  volumeBoostSlider.oninput = async () => {
    const val = parseFloat(volumeBoostSlider.value);
    volumeBoostValue.textContent = Math.round(val * 100) + "%";
    await chrome.storage.local.set({ volumeBoost: val });
  };
}


// Set ban/timeout screen content dynamically
function showBanScreen(moderationType, reason, moderatorDiscord, expires) {
  const titleEl = document.getElementById('ban-embed-title');
  const iconEl = document.getElementById('ban-embed-icon');
  const byLabelEl = document.getElementById('ban-by-label');

  if (moderationType === 'timeout') {
    titleEl.textContent = "YOU'RE TIMED OUT";
    titleEl.style.color = '#ffc107';
    iconEl.textContent = '⏰';
    iconEl.style.color = '#ffc107';
    byLabelEl.textContent = 'TIMED OUT BY:';
    document.getElementById('ban-embed').querySelector('.error-content').style.borderColor = '#ffc107';
    const expiresAt = new Date(expires);
    document.getElementById('ban-reason').textContent = `${reason || 'Timeout'} — Expires: ${expiresAt.toLocaleString()}`;
  } else {
    titleEl.textContent = "YOU'RE BANNED";
    titleEl.style.color = 'var(--danger)';
    iconEl.textContent = '🚫';
    iconEl.style.color = 'var(--danger)';
    byLabelEl.textContent = 'BANNED BY:';
    document.getElementById('ban-embed').querySelector('.error-content').style.borderColor = 'var(--danger)';
    document.getElementById('ban-reason').textContent = reason || 'Violation of community rules';
  }
  document.getElementById('banned-by-mod').textContent = moderatorDiscord || 'Admin';
  document.getElementById('main-panel').style.display = 'none';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('ban-embed').style.display = 'flex';
}

async function checkBanOnLoad() {
  const data = await chrome.storage.local.get(["isBanned", "banData", "isKicked", "isOffline"]);

  if (data.isOffline) {
    document.getElementById("main-panel").style.display = "none";
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("ban-embed").style.display = "none";
    document.getElementById("offline-overlay").style.display = "flex";
    return;
  }

  // BAN or TIMEOUT — always verify with server before showing block screen
  if (data.userDiscordId) {
    try {
      const baseUrl2 = await new Promise(resolve => {
        chrome.storage.local.get(["API_BASE_URL"], r => resolve(r.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL));
      });
      const [banRes2, toRes2] = await Promise.all([
        fetch(`${baseUrl2}/api/check-ban?id=${data.userDiscordId}`),
        fetch(`${baseUrl2}/api/check-timeout?id=${data.userDiscordId}`)
      ]);
      const banCheck2 = await banRes2.json();
      const toCheck2 = await toRes2.json();

      if (banCheck2.banned) {
        await chrome.storage.local.set({ isBanned: true, banData: { ...banCheck2, moderationType: 'ban' } });
        showBanScreen('ban', banCheck2.reason, banCheck2.moderatorDiscord);
        return;
      } else if (toCheck2.timedout) {
        await chrome.storage.local.set({ isBanned: true, banData: { ...toCheck2, moderationType: 'timeout' } });
        showBanScreen('timeout', toCheck2.reason, toCheck2.moderatorDiscord, toCheck2.expires);
        return;
      } else {
        // Server confirmed NOT banned/timed-out — clear storage
        await chrome.storage.local.set({ isBanned: false, banData: null });
      }
    } catch (e) {
      // Server unreachable — fallback to storage
      if (data.isBanned && data.banData) {
        showBanScreen(data.banData.moderationType, data.banData.reason, data.banData.moderatorDiscord, data.banData.expires);
        return;
      }
    }
  }

}

// Kick fully handled by background.js
function showKickOverlay() {}


document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabName = btn.getAttribute("data-tab");
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`${tabName}-tab`).classList.add("active");
  });
});

let currentEditingIndex = null;
const modal = document.getElementById("channel-modal");


document.getElementById("close-modal").onclick = closeModal;
document.getElementById("cancel-channel-btn").onclick = closeModal;
document.getElementById("close-error-btn").onclick = () => {
  document.getElementById("whitelist-error-embed").style.display = "none";
};
document.getElementById("add-channel-trigger").onclick = () => {
  currentEditingIndex = null;
  document.getElementById("modal-title").textContent = "ADD CHANNEL";
  document.getElementById("url-input-group").style.display = "block";
  resetModalFields();
  modal.classList.add("active");
};

function closeModal() { modal.classList.remove("active"); }

function resetModalFields() {
  document.getElementById("channel-slug-input").value = "";
  document.getElementById("channel-mute-toggle").checked = false;
  document.getElementById("channel-follow-toggle").checked = true;
  document.getElementById("channel-max-comments").value = 0;
  document.getElementById("starting-enabled").checked = false;
  document.getElementById("starting-messages").value = "";
  document.getElementById("starting-cooldowns").innerHTML = "";
  createCooldownInput("starting-cooldowns", 30);
  document.getElementById("emoji-enabled").checked = true;
  document.getElementById("emoji-list").value = "";
  document.getElementById("emoji-cooldowns").innerHTML = "";
  createCooldownInput("emoji-cooldowns", 30);
  document.getElementById("normal-enabled").checked = true;
  document.getElementById("normal-messages").value = "";
  document.getElementById("normal-cooldown-type").value = "normal";
  document.getElementById("normal-cooldowns").innerHTML = "";
  createCooldownInput("normal-cooldowns", 60);
  document.getElementById("special-msg-count").value = 100;
  document.getElementById("special-time-value").value = 5;
  document.getElementById("special-time-unit").value = "min";
  updateNormalCooldownDisplay();
}

function updateNormalCooldownDisplay() {
  const type = document.getElementById("normal-cooldown-type").value;
  document.getElementById("normal-cooldown-section").style.display = type === "normal" ? "block" : "none";
  document.getElementById("normal-special-cooldown-section").style.display = type === "special" ? "block" : "none";
}

document.getElementById("normal-cooldown-type").onchange = updateNormalCooldownDisplay;


function createCooldownInput(containerId, value = 30) {
  const container = document.getElementById(containerId);
  const div = document.createElement("div");
  div.style.display = "flex";
  div.style.alignItems = "center";
  div.style.gap = "5px";
  div.innerHTML = `
    <input type="number" class="cd-val" value="${value}" min="1" style="width: 55px; padding: 6px; font-size: 11px;">
    <button class="btn-icon remove-cd" style="width: 24px; height: 24px; font-size: 14px;">&times;</button>
  `;
  div.querySelector(".remove-cd").onclick = () => {
    if (container.querySelectorAll(".cd-val").length > 1) div.remove();
  };
  container.appendChild(div);
}

document.getElementById("add-starting-cd").onclick = () => createCooldownInput("starting-cooldowns");
document.getElementById("add-emoji-cd").onclick = () => createCooldownInput("emoji-cooldowns");
document.getElementById("add-normal-cd").onclick = () => createCooldownInput("normal-cooldowns");


function createScheduleRule(containerId, rule = null) {
  const container = document.getElementById(containerId);
  const div = document.createElement("div");
  div.className = "schedule-rule";
  
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const activeDays = rule ? rule.days : [1, 2, 3, 4, 5];
  const startTime = rule ? rule.start : "09:00";
  const endTime = rule ? rule.end : "17:00";

  let dayButtons = days.map((day, i) => `
    <button class="day-btn ${activeDays.includes(i) ? 'active' : ''}" data-day="${i}">${day}</button>
  `).join("");

  div.innerHTML = `
    <div class="day-picker">${dayButtons}</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
      <input type="time" class="rule-start" value="${startTime}">
      <input type="time" class="rule-end" value="${endTime}">
    </div>
    <button class="btn btn-outline remove-rule" style="width: 100%; padding: 6px; font-size: 10px; color: var(--danger); border-color: rgba(255,77,77,0.2);">REMOVE RULE</button>
  `;

  div.querySelectorAll(".day-btn").forEach(btn => {
    btn.onclick = () => {
      btn.classList.toggle("active");
      saveScheduleRules(containerId);
    };
  });

  div.querySelector(".rule-start").onchange = () => saveScheduleRules(containerId);
  div.querySelector(".rule-end").onchange = () => saveScheduleRules(containerId);

  div.querySelector(".remove-rule").onclick = () => {
    if (container.querySelectorAll(".schedule-rule").length > 1) {
      div.remove();
      saveScheduleRules(containerId);
    }
  };

  container.appendChild(div);
}

async function saveScheduleRules(containerId) {
  const container = document.getElementById(containerId);
  const rules = [];
  
  container.querySelectorAll(".schedule-rule").forEach(ruleDiv => {
    const activeDays = [];
    ruleDiv.querySelectorAll(".day-btn.active").forEach(btn => {
      activeDays.push(parseInt(btn.getAttribute("data-day")));
    });
    
    const start = ruleDiv.querySelector(".rule-start").value;
    const end = ruleDiv.querySelector(".rule-end").value;
    
    if (activeDays.length > 0 && start && end) {
      rules.push({ days: activeDays, start, end });
    }
  });
  
  const data = await chrome.storage.local.get(["userDiscordId", "isAdminVerified"]);
  const isOwner = await refreshOwnerCapabilities();
  
  if (isOwner) {
    const baseUrl = await getPopupApiUrl();
    const enabled = document.getElementById("admin-multischedule-enabled").checked;
    await fetch(`${baseUrl}/api/owner/update-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId: data.userDiscordId, enabled, rules })
    });
  }
}

// This will be initialized in loadInitialData


document.getElementById("save-channel-btn").onclick = async () => {
  const slugInput = document.getElementById("channel-slug-input");
  let slug = slugInput.value.trim();
  if (currentEditingIndex === null && !slug) { await ASCDialog.warning("Please enter a channel name."); return; }

  if (slug) {
    try {
      const url = new URL(slug);
      if (url.hostname.includes("kick.com")) {
        const parts = url.pathname.split("/").filter(p => p);
        if (parts.length > 0) slug = parts[0];
      }
    } catch (e) {}
    slug = slug.toLowerCase();
  }

  // WHITELIST CHECK BEFORE SAVING
  const saveBtn = document.getElementById("save-channel-btn");
  const originalText = saveBtn.textContent;
  saveBtn.textContent = "CHECKING WHITELIST...";
  saveBtn.disabled = true;

  try {
    const baseUrl = await getPopupApiUrl();
    const checkUrl = `kick.com/${slug}`;
    const response = await fetch(`${baseUrl}/api/check-whitelist?url=${encodeURIComponent(checkUrl)}`);
    const result = await response.json();

    if (!result.allowed) {
      // Show styled error embed
      document.getElementById("whitelist-error-embed").style.display = "flex";
      
      // Notify bot to send Discord notification
      const userData = await chrome.storage.local.get(["userDiscordId"]);
      if (userData.userDiscordId) {
        fetch(`${baseUrl}/api/notify-whitelist-error?id=${userData.userDiscordId}&url=${encodeURIComponent(checkUrl)}`)
          .catch(err => console.error("Failed to notify whitelist error", err));
      }

      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
      return;
    }
  } catch (error) {
    console.error("Whitelist check failed:", error);
    // If server is down, we allow saving to avoid blocking users, 
    // but the background script will still check later.
  }

  saveBtn.textContent = originalText;
  saveBtn.disabled = false;

  const data = await chrome.storage.local.get(["channels"]);
  const channels = data.channels || [];

  
  if (currentEditingIndex === null) {
    const isDuplicate = channels.some(ch => ch.slug.toLowerCase() === slug.toLowerCase());
    if (isDuplicate) {
      { await ASCDialog.warning(`Channel "${slug}" already exists in your list. Please choose a different name.`); return; }
    }
  }

  const config = {
    slug: currentEditingIndex !== null ? channels[currentEditingIndex].slug : slug,
    id: currentEditingIndex !== null ? channels[currentEditingIndex].id : `ch_${Date.now()}`,
    autoMode: currentEditingIndex !== null ? channels[currentEditingIndex].autoMode : false,
    isLive: currentEditingIndex !== null ? channels[currentEditingIndex].isLive : false,
    mute: document.getElementById("channel-mute-toggle").checked,
    autoFollow: document.getElementById("channel-follow-toggle").checked,
    maxComments: parseInt(document.getElementById("channel-max-comments").value) || 0,
    starting: {
      enabled: document.getElementById("starting-enabled").checked,
      list: document.getElementById("starting-messages").value.split("\n").filter(x => x.trim()),
      cooldowns: Array.from(document.querySelectorAll("#starting-cooldowns .cd-val")).map(i => parseInt(i.value) || 30),
    },
    emoji: {
      enabled: document.getElementById("emoji-enabled").checked,
      list: document.getElementById("emoji-list").value.split("\n").filter(x => x.trim()),
      cooldowns: Array.from(document.querySelectorAll("#emoji-cooldowns .cd-val")).map(i => parseInt(i.value) || 30),
    },
    normal: {
      enabled: document.getElementById("normal-enabled").checked,
      list: document.getElementById("normal-messages").value.split("\n").filter(x => x.trim()),
      cooldownType: document.getElementById("normal-cooldown-type").value,
      cooldowns: Array.from(document.querySelectorAll("#normal-cooldowns .cd-val")).map(i => parseInt(i.value) || 60),
      specialCooldown: {
        enabled: document.getElementById("normal-cooldown-type").value === "special",
        messageCount: parseInt(document.getElementById("special-msg-count").value) || 100,
        timeValue: parseInt(document.getElementById("special-time-value").value) || 5,
        timeUnit: document.getElementById("special-time-unit").value || "min"
      }
    }
  };

  if (currentEditingIndex !== null) channels[currentEditingIndex] = config;
  else channels.push(config);

  await chrome.storage.local.set({ channels });
  closeModal();
  renderChannels(channels);
  chrome.runtime.sendMessage({ action: "checkNow" });
};


async function saveGlobalSettings() {
  await chrome.storage.local.set({
    globalMute: document.getElementById("global-mute-toggle").checked,
    humanizationEnabled: document.getElementById("humanization-enabled").checked,
    typingDelay: parseInt(document.getElementById("typing-delay-slider").value),
    typoChance: parseInt(document.getElementById("typo-chance-slider").value)
  });
}

document.querySelectorAll("input, select").forEach(el => {
  if (el.id && !el.id.startsWith("channel-") && !el.id.startsWith("emoji-") && !el.id.startsWith("normal-") && !el.id.startsWith("special-") && !el.id.startsWith("admin-") && !el.id.startsWith("login-")) {
    el.onchange = saveGlobalSettings;
  }
});



document.getElementById("humanization-enabled").onchange = (e) => {
  document.getElementById("humanization-settings").style.display = e.target.checked ? "block" : "none";
  saveGlobalSettings();
};

document.getElementById("typing-delay-slider").oninput = (e) => {
  document.getElementById("typing-delay-value").textContent = e.target.value + "ms";
};
document.getElementById("typo-chance-slider").oninput = (e) => {
  document.getElementById("typo-chance-value").textContent = e.target.value + "%";
};


// --- UNIFIED LOGIN LOGIC ---
async function initLoginScreen() {
  const loginScreen = document.getElementById("login-screen");
  const mainPanel = document.getElementById("main-panel");
  const loginStatus = document.getElementById("login-status");
  const adminTabBtn = document.getElementById("admin-tab-btn");
  const backBtn = document.getElementById("login-back-btn");

  const idInput = document.getElementById("login-discord-id");
  const otpInput = document.getElementById("login-otp-code");
  const sendOtpBtn = document.getElementById("send-otp-btn");
  const verifyOtpBtn = document.getElementById("verify-otp-btn");
  const step1 = document.getElementById("login-step-1");
  const step2 = document.getElementById("login-step-2");

  // Check if already logged in
  const data = await chrome.storage.local.get(["isUserLoggedIn", "isAdminVerified", "isUserVerified", "userDiscordId"]);
  
  if (data.isUserLoggedIn) {
    loginScreen.style.display = "none";
    mainPanel.style.display = "flex";
    
    if (data.isAdminVerified) {
      adminTabBtn.style.display = "block";
    }
    
    await loadInitialData();
    await updateUserStatusDisplay();
    return;
  }

  // BACK BUTTON
  backBtn.onclick = () => {
    step1.style.display = "block";
    step2.style.display = "none";
    backBtn.style.display = "none";
    loginStatus.textContent = "Enter Discord ID to receive OTP";
    loginStatus.style.color = "var(--text-dim)";
    otpInput.value = "";
  };

  // SEND OTP
  sendOtpBtn.onclick = async () => {
    const discordId = idInput.value.trim();
    if (!discordId) { await ASCDialog.warning("Please enter your Discord ID."); return; }

    loginStatus.textContent = "Checking access...";
    loginStatus.style.color = "var(--text-dim)";
    sendOtpBtn.disabled = true;

    try {
      const baseUrl = await getPopupApiUrl();
      
      // Check Admin Status first
      const adminCheck = await fetch(`${baseUrl}/api/check-admin?id=${discordId}`);
      const adminResult = await adminCheck.json();
      
      let endpoint = "";
      if (adminResult.isAdmin) {
        endpoint = "/api/request-otp";
      } else {
        // Check User Whitelist
        const userCheck = await fetch(`${baseUrl}/api/check-user-whitelist?id=${discordId}`);
        const userResult = await userCheck.json();
        
        if (userResult.whitelisted) {
          endpoint = "/api/request-user-otp";
        } else {
          loginStatus.textContent = "❌ Access Denied: Not in whitelist";
          loginStatus.style.color = "var(--danger)";
          sendOtpBtn.disabled = false;
          return;
        }
      }

      // Request OTP
      const otpReq = await fetch(`${baseUrl}${endpoint}?id=${discordId}`);
      const otpRes = await otpReq.json();

      if (otpReq.ok && otpRes.success) {
        step1.style.display = "none";
        step2.style.display = "block";
        backBtn.style.display = "block";

        if (otpRes.deliveryMethod === "debug_console" && otpRes.debugCode) {
          loginStatus.textContent = `✅ Local OTP ready: ${otpRes.debugCode}`;
          loginStatus.style.color = "var(--primary)";
          await ASCDialog.info(`Use this temporary local OTP: ${otpRes.debugCode}`, {
            title: "LOCAL OTP",
            confirmLabel: "CONTINUE"
          });
        } else if (otpRes.deliveryMethod === "webhook") {
          loginStatus.textContent = "✅ OTP sent to the configured Discord channel.";
          loginStatus.style.color = "var(--primary)";
        } else {
          loginStatus.textContent = "✅ OTP sent to your Discord DM!";
          loginStatus.style.color = "var(--primary)";
        }
      } else {
        loginStatus.textContent = "❌ " + (otpRes.error || "Error sending OTP");
        loginStatus.style.color = "var(--danger)";
        sendOtpBtn.disabled = false;
      }
    } catch (error) {
      loginStatus.textContent = "❌ Connection error";
      loginStatus.style.color = "var(--danger)";
      sendOtpBtn.disabled = false;
    }
  };

  // VERIFY OTP
  verifyOtpBtn.onclick = async () => {
    const discordId = idInput.value.trim();
    const code = otpInput.value.trim();
    if (!code) { await ASCDialog.warning("Please enter the verification code."); return; }

    loginStatus.textContent = "Verifying code...";
    loginStatus.style.color = "var(--text-dim)";
    verifyOtpBtn.disabled = true;

    try {
      const baseUrl = await getPopupApiUrl();
      const response = await fetch(`${baseUrl}/api/verify-otp?id=${discordId}&code=${code}`);
      const result = await response.json();

      if (response.ok && result.success) {
        const isAdmin = result.role === "admin";
        
        await chrome.storage.local.set({ 
          userDiscordId: discordId, 
          userDiscordUsername: result.username || "Unknown",
          isAdminVerified: isAdmin,
          isUserVerified: true,
          isUserLoggedIn: true,
          isOwnerVerified: false
        });
        // Start realtime SSE moderation connection
        chrome.runtime.sendMessage({ action: 'startSSE', discordId: discordId });
        
        loginStatus.textContent = "✅ Verified! Unlocking...";
        loginStatus.style.color = "var(--primary)";
        if (isAdmin) adminTabBtn.style.display = "block";
        
        setTimeout(() => {
          loginScreen.style.display = "none";
          mainPanel.style.display = "flex";
          loadInitialData();
          updateUserStatusDisplay();
        }, 1500);
      } else {
        loginStatus.textContent = "❌ " + (result.error || "Invalid Code");
        loginStatus.style.color = "var(--danger)";
        verifyOtpBtn.disabled = false;
      }
    } catch (error) {
      loginStatus.textContent = "❌ Connection error";
      loginStatus.style.color = "var(--danger)";
      verifyOtpBtn.disabled = false;
    }
  };
}

// Sync local stats to server dashboard so admin can see user data
async function syncDashboardToServer() {
  try {
    const data = await chrome.storage.local.get(['userDiscordId', 'userDiscordUsername', 'isAdminVerified', 'isUserVerified', 'channels', 'stats', 'isBanned']);
    if (data.isBanned) return;
    const isLoggedIn = data.isAdminVerified || data.isUserVerified;
    if (!isLoggedIn || !data.userDiscordId) return;

    const channels = data.channels || [];
    const allStats = data.stats || {};
    const baseUrl = await getPopupApiUrl();

    for (const ch of channels) {
      const st = allStats[ch.id] || {};
      const watchTime = st.totalWatchTime || 0;
      const comments = st.totalComments || 0;
      if (watchTime <= 0 && comments <= 0) continue;

      // Send to server — server will merge (not overwrite) with existing data
      await fetch(`${baseUrl}/api/dashboard/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordId: data.userDiscordId,
          username: data.userDiscordUsername || 'Unknown',
          channel: ch.slug,
          watchTime,
          comments
        })
      }).catch(() => {});
    }
  } catch(e) {
    console.warn('Dashboard sync failed:', e);
  }
}

async function loadInitialData() {
  const data = await chrome.storage.local.get(null);
  await refreshOwnerCapabilities();
  await updateUserStatusDisplay();
  
  if (data.channels) renderChannels(data.channels);
  updateDashboard(data);

  // Sync local stats to server so admin dashboard is up to date
  syncDashboardToServer();
  // Re-sync every 60 seconds while popup is open
  if (!window._dashSyncInterval) {
    window._dashSyncInterval = setInterval(syncDashboardToServer, 60000);
  }
  
  const adminMasterAuto = document.getElementById("admin-master-auto-toggle");
  const adminMultiEnabled = document.getElementById("admin-multischedule-enabled");
  
  if (adminMasterAuto) {
    adminMasterAuto.checked = data.masterAutoMode !== false;
    adminMasterAuto.onchange = async (e) => {
      await chrome.storage.local.set({ masterAutoMode: e.target.checked });
      chrome.runtime.sendMessage({ action: "checkNow" }).catch(() => {});
    };
  }
  
  if (adminMultiEnabled) {
    const isOwner = currentViewerIsOwner;
    const addRuleBtn = document.getElementById("admin-add-schedule-rule");
    
    // Fetch global schedule from server
    const baseUrl = await getPopupApiUrl();
    try {
      const res = await fetch(`${baseUrl}/api/global-schedule`);
      if (res.ok) {
        const globalSchedule = await res.json();
        adminMultiEnabled.checked = globalSchedule.enabled;
        document.getElementById("admin-multischedule-container").style.display = globalSchedule.enabled ? "block" : "none";
        
        if (isOwner) {
          adminMultiEnabled.disabled = false;
          if (addRuleBtn) addRuleBtn.style.display = "inline-flex";
          adminMultiEnabled.onchange = async (e) => {
            const enabled = e.target.checked;
            const currentRules = [];
            document.querySelectorAll("#admin-schedule-rules-container .schedule-rule").forEach(ruleDiv => {
              const activeDays = [];
              ruleDiv.querySelectorAll(".day-btn.active").forEach(btn => activeDays.push(parseInt(btn.getAttribute("data-day"))));
              const start = ruleDiv.querySelector(".rule-start").value;
              const end = ruleDiv.querySelector(".rule-end").value;
              if (activeDays.length > 0 && start && end) currentRules.push({ days: activeDays, start, end });
            });

            await fetch(`${baseUrl}/api/owner/update-schedule`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ownerId: data.userDiscordId, enabled, rules: currentRules })
            });
            document.getElementById("admin-multischedule-container").style.display = enabled ? "block" : "none";
          };
        } else {
          adminMultiEnabled.disabled = true;
          if (addRuleBtn) addRuleBtn.style.display = "none";
        }
      }
    } catch (e) {}
  }
  
  const rulesContainer = document.getElementById("admin-schedule-rules-container");
  if (rulesContainer) {
    rulesContainer.innerHTML = "";
    if (data.scheduleRules && data.scheduleRules.length > 0) {
      data.scheduleRules.forEach(r => createScheduleRule("admin-schedule-rules-container", r));
    } else {
      createScheduleRule("admin-schedule-rules-container");
    }
  }
  
  const addScheduleBtn = document.getElementById("admin-add-schedule-rule");
  if (addScheduleBtn) {
    addScheduleBtn.onclick = () => createScheduleRule("admin-schedule-rules-container");
  }
  
  // Global Mute Toggle
  const globalMuteToggle = document.getElementById("global-mute-toggle");
  if (globalMuteToggle) {
    globalMuteToggle.checked = data.globalMute !== false;
    if (data.globalMute === undefined) {
      globalMuteToggle.checked = true;
      chrome.storage.local.set({ globalMute: true });
    }
    globalMuteToggle.onchange = async (e) => {
      await chrome.storage.local.set({ globalMute: e.target.checked });
      chrome.runtime.sendMessage({ action: "checkNow" }).catch(() => {});
      console.log("Global Mute saved:", e.target.checked);
    };
  }
  
  // Humanization Settings
  const humanizationToggle = document.getElementById("humanization-enabled");
  if (humanizationToggle) {
    if (data.humanizationEnabled !== undefined) humanizationToggle.checked = data.humanizationEnabled;
    humanizationToggle.onchange = async (e) => {
      await chrome.storage.local.set({ humanizationEnabled: e.target.checked });
      console.log("Humanization enabled:", e.target.checked);
    };
  }
  
  // Typing Delay Slider
  const typingDelaySlider = document.getElementById("typing-delay-slider");
  if (typingDelaySlider) {
    if (data.typingDelay !== undefined) typingDelaySlider.value = data.typingDelay;
    typingDelaySlider.oninput = async () => {
      const value = parseInt(typingDelaySlider.value);
      document.getElementById("typing-delay-value").textContent = value + "ms";
      await chrome.storage.local.set({ typingDelay: value });
    };
  }
  
  // Typo Chance Slider
  const typoChanceSlider = document.getElementById("typo-chance-slider");
  if (typoChanceSlider) {
    if (data.typoChance !== undefined) typoChanceSlider.value = data.typoChance;
    typoChanceSlider.oninput = async () => {
      const value = parseInt(typoChanceSlider.value);
      document.getElementById("typo-chance-value").textContent = value + "%";
      await chrome.storage.local.set({ typoChance: value });
    };
  }
}

// WHITELIST ERROR EMBED HANDLER
document.getElementById("close-error-btn").onclick = () => {
  document.getElementById("whitelist-error-embed").style.display = "none";
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "showWhitelistError") {
    document.getElementById("whitelist-error-embed").style.display = "flex";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  initOwnerAccessManager();
  initLoginScreen();
});


function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

async function updateDashboard(data) {
  const stats = data.stats || {};
  const channels = data.channels || [];
  const historyBody = document.getElementById("dash-history-body");
  const totalTimeEl = document.getElementById("dash-total-time");
  const totalMsgsEl = document.getElementById("dash-total-msgs");
  const activityLog = document.getElementById("activity-log");

  let totalSeconds = 0;
  let totalMsgs = 0;
  if (!historyBody) return;
  historyBody.innerHTML = "";
  
  const baseUrl = await getPopupApiUrl();
  const adminId = data.userDiscordId;
  const channelStats = {};
  
  // Initialize channel stats from local storage
  channels.forEach(ch => {
    const chStats = stats[ch.id] || { totalWatchTime: 0, totalComments: 0 };
    channelStats[ch.slug] = { time: chStats.totalWatchTime, messages: chStats.totalComments };
  });
  
  // Try to fetch server-side statistics
  if (adminId) {
    try {
      const response = await fetch(`${baseUrl}/api/admin/user-logs?adminId=${adminId}`);
      if (response.ok) {
        const logs = await response.json();
        const serverStats = {};
        
        // Also fetch active users to get real-time duration
        let activeUserDuration = {};
        try {
          const activeRes = await fetch(`${baseUrl}/api/admin/active-users?adminId=${adminId}`);
          if (activeRes.ok) {
            const activeUsers = await activeRes.json();
            const me = activeUsers.find(u => u.discordId === adminId);
            if (me && me.channelStats) {
              me.channelStats.forEach(cs => {
                activeUserDuration[cs.channel] = Math.floor(cs.duration / 1000);
              });
            }
          }
        } catch (e) {}

        logs.forEach(log => {
          if (log.channel) {
            if (!serverStats[log.channel]) {
              serverStats[log.channel] = { messages: 0, time: 0 };
            }
            if (log.action === 'comment') {
              serverStats[log.channel].messages++;
            }
          }
        });
        
        // Merge server stats with local stats
        Object.entries(serverStats).forEach(([channel, stats]) => {
          if (channelStats[channel]) {
            channelStats[channel].messages = stats.messages;
            // Use server duration if available (prioritize active user data)
            if (activeUserDuration[channel]) {
              channelStats[channel].time = activeUserDuration[channel];
            }
          }
        });
      }
    } catch (e) {
      console.error("Failed to fetch server stats", e);
    }
  }
  
  channels.forEach(ch => {
    const chStats = channelStats[ch.slug] || { time: 0, messages: 0 };
    totalSeconds += chStats.time;
    totalMsgs += chStats.messages;

    const row = document.createElement("tr");
    row.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
    row.innerHTML = `
      <td style="padding: 8px 5px; font-weight: 700; color: var(--primary);">${ch.slug}</td>
      <td style="padding: 8px 5px;">${formatTime(chStats.time)}</td>
      <td style="padding: 8px 5px;">${chStats.messages}</td>
    `;
    historyBody.appendChild(row);
  });

  totalTimeEl.textContent = formatTime(totalSeconds);
  totalMsgsEl.textContent = totalMsgs;

  // Render activity log from previously fetched logs
  if (adminId) {
    try {
      const response = await fetch(`${baseUrl}/api/admin/user-logs?adminId=${adminId}`);
      if (response.ok) {
        const logs = await response.json();
        activityLog.innerHTML = "";
        logs.slice(0, 50).forEach(log => {
          const div = document.createElement("div");
          div.style.marginBottom = "5px";
          const time = new Date(log.timestamp).toLocaleTimeString();
          let actionText = log.action.toUpperCase();
          let color = "var(--text-dim)";
          
          if (log.action === "comment") color = "var(--primary)";
          if (log.action === "watch") color = "var(--accent)";
          
          div.innerHTML = `<span style="color: #666">[${time}]</span> <span style="color: ${color}">[${actionText}]</span> ${log.channel || ""}: ${log.comment || ""}`;
          activityLog.appendChild(div);
        });
      }
    } catch (e) {
      console.error("Failed to fetch activity logs", e);
    }
  }
}

function renderChannels(channels) {
  const list = document.getElementById("channels-list");
  list.innerHTML = "";
  
  let liveCount = 0;
  
  channels.forEach((ch, index) => {
    if (ch.isLive) liveCount++;
    
    const item = document.createElement("div");
    item.className = "channel-item";
    item.innerHTML = `
      <div class="channel-info">
        <div class="channel-name">
          <div class="status-dot ${ch.isLive ? 'live' : ''}"></div>
          ${ch.slug}
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <label class="switch" title="Auto Mode">
          <input type="checkbox" class="auto-mode-toggle" data-index="${index}" ${ch.autoMode ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        <button class="btn-icon edit-channel" data-index="${index}" style="width: 28px; height: 28px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="btn-icon delete-channel" data-index="${index}" style="width: 28px; height: 28px; color: var(--danger);">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>
    `;
    
    item.querySelector(".auto-mode-toggle").onchange = async (e) => {
      const data = await chrome.storage.local.get(["channels"]);
      data.channels[index].autoMode = e.target.checked;
      await chrome.storage.local.set({ channels: data.channels });
      chrome.runtime.sendMessage({ action: "checkNow" });
    };
    
    item.querySelector(".edit-channel").onclick = () => {
      currentEditingIndex = index;
      const config = channels[index];
      document.getElementById("modal-title").textContent = "EDIT CHANNEL";
      document.getElementById("channel-slug-input").value = config.slug;
      document.getElementById("url-input-group").style.display = "none";
      
      document.getElementById("channel-mute-toggle").checked = config.mute;
      document.getElementById("channel-follow-toggle").checked = config.autoFollow;
      document.getElementById("channel-max-comments").value = config.maxComments;
      
      if (config.starting) {
        document.getElementById("starting-enabled").checked = config.starting.enabled;
        document.getElementById("starting-messages").value = config.starting.list.join("\n");
        document.getElementById("starting-cooldowns").innerHTML = "";
        config.starting.cooldowns.forEach(cd => createCooldownInput("starting-cooldowns", cd));
      } else {
        document.getElementById("starting-enabled").checked = false;
        document.getElementById("starting-messages").value = "";
        document.getElementById("starting-cooldowns").innerHTML = "";
        createCooldownInput("starting-cooldowns", 30);
      }

      document.getElementById("emoji-enabled").checked = config.emoji.enabled;
      document.getElementById("emoji-list").value = config.emoji.list.join("\n");
      
      document.getElementById("emoji-cooldowns").innerHTML = "";
      config.emoji.cooldowns.forEach(cd => createCooldownInput("emoji-cooldowns", cd));
      
      document.getElementById("normal-enabled").checked = config.normal.enabled;
      document.getElementById("normal-messages").value = config.normal.list.join("\n");
      document.getElementById("normal-cooldown-type").value = config.normal.cooldownType;
      
      document.getElementById("normal-cooldowns").innerHTML = "";
      config.normal.cooldowns.forEach(cd => createCooldownInput("normal-cooldowns", cd));
      
      if (config.normal.specialCooldown) {
        document.getElementById("special-msg-count").value = config.normal.specialCooldown.messageCount;
        document.getElementById("special-time-value").value = config.normal.specialCooldown.timeValue;
        document.getElementById("special-time-unit").value = config.normal.specialCooldown.timeUnit;
      }
      
      updateNormalCooldownDisplay();
      modal.classList.add("active");
    };
    
    item.querySelector(".delete-channel").onclick = async () => {
      if (await ASCDialog.danger(`Are you sure you want to delete "${ch.slug}"?`, { confirmLabel: "DELETE", cancelLabel: "Cancel" })) {
        const data = await chrome.storage.local.get(["channels"]);
        data.channels.splice(index, 1);
        await chrome.storage.local.set({ channels: data.channels });
        renderChannels(data.channels);
      }
    };

    list.appendChild(item);
  });

  updateChannelStats(channels);
}

function updateChannelStats(channels) {
  const liveCount = channels.filter(ch => ch.isLive).length;
  document.getElementById("count-total").textContent = channels.length;
  document.getElementById("count-live").textContent = liveCount;
}

/* --- ADMIN PANEL LOGIC --- */

let activeUsersData = [];
let bannedUsersData = {};
let currentView = 'active'; // 'active' or 'banned'

// Tab Switching within Admin
document.getElementById('admin-view-active').onclick = () => {
  currentView = 'active';
  document.getElementById('admin-view-active').classList.add('active');
  document.getElementById('admin-view-banned').classList.remove('active');
  document.getElementById('admin-active-users-container').style.display = 'block';
  document.getElementById('admin-banned-users-container').style.display = 'none';
  refreshAdminData();
};

document.getElementById('admin-view-banned').onclick = () => {
  currentView = 'banned';
  document.getElementById('admin-view-banned').classList.add('active');
  document.getElementById('admin-view-active').classList.remove('active');
  document.getElementById('admin-banned-users-container').style.display = 'block';
  document.getElementById('admin-active-users-container').style.display = 'none';
  refreshAdminData();
};

async function refreshAdminData() {
  const data = await chrome.storage.local.get(["userDiscordId", "API_BASE_URL"]);
  const adminId = data.userDiscordId;
  const baseUrl = data.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL;
  await refreshOwnerCapabilities();

  if (currentView === 'active') {
    try {
      const res = await fetch(`${baseUrl}/api/admin/active-users?adminId=${adminId}`);
      activeUsersData = await res.json();
      displayUserList(activeUsersData);
    } catch (e) { console.error("Failed to fetch active users", e); }
  } else {
    try {
      const [bansRes, timeoutsRes] = await Promise.all([
        fetch(`${baseUrl}/api/admin/bans?adminId=${adminId}`),
        fetch(`${baseUrl}/api/admin/timeouts?adminId=${adminId}`)
      ]);
      const bans = await bansRes.json();
      const timeouts = await timeoutsRes.json();
      // Merge bans and active timeouts together
      const now = new Date();
      const activeTimeouts = {};
      Object.entries(timeouts).forEach(([id, t]) => {
        if (new Date(t.expires) > now) activeTimeouts[id] = t;
      });
      bannedUsersData = { ...bans, ...activeTimeouts };
      renderBannedUsers(bannedUsersData);
    } catch (e) { console.error("Failed to fetch banned users", e); }
  }
}



function renderBannedUsers(bans) {
  const list = document.getElementById('admin-banned-list');
  list.innerHTML = '';

  Object.entries(bans).forEach(([discordId, data]) => {
    // Determine the type from data.type or check if it's a timeout (has expires field)
    const isTimeout = data.type === 'timeout' || data.expires !== undefined;
    const type = isTimeout ? 'timeout' : 'ban';
    
    const card = document.createElement('div');
    card.className = 'user-card';
    card.style.borderColor = type === 'ban' ? 'var(--danger)' : 'var(--warning)';
    card.innerHTML = `
      <div class="info">
        <span class="username" style="color: ${type === 'ban' ? 'var(--danger)' : 'var(--warning)'}">${type.toUpperCase()}</span>
        <span style="font-size:10px;color:var(--text-dim);display:block;">${discordId}</span>
        <span style="font-size:10px;color:var(--text-dim)">${data.reason || ''}</span>
      </div>
      <button class="btn btn-outline unban-btn" style="padding: 4px 8px; font-size: 9px;">${type === 'timeout' ? 'REMOVE' : 'UNBAN'}</button>
    `;
    card.querySelector('.unban-btn').onclick = (e) => {
      e.stopPropagation();
      unbanUser(discordId, type);
    };
    list.appendChild(card);
  });
}

async function submitOwnerAccess(role, whitelisted = true) {
  const targetDiscordId = document.getElementById('owner-manage-discord-id')?.value.trim();
  const targetUsername = document.getElementById('owner-manage-username')?.value.trim() || '';

  if (!targetDiscordId) {
    setTextStatus('owner-manage-status', 'Enter a Discord ID first.', 'var(--danger)');
    return;
  }

  setTextStatus('owner-manage-status', 'Saving access...', 'var(--text-dim)');

  try {
    const updatedUser = await setUserAccessRole({
      targetDiscordId,
      targetUsername,
      role,
      whitelisted
    });

    syncKnownUserRole(updatedUser);
    const successMessage = whitelisted
      ? `${updatedUser.username} is now ${getRoleMeta(updatedUser).label}.`
      : `${updatedUser.username} access was removed.`;
    const successColor = whitelisted ? getRoleMeta(updatedUser).color : 'var(--danger)';
    setTextStatus('owner-manage-status', successMessage, successColor);
    document.getElementById('owner-manage-discord-id').value = '';
    document.getElementById('owner-manage-username').value = '';
    await refreshAdminData();
  } catch (error) {
    setTextStatus('owner-manage-status', error.message || 'Failed to update access.', 'var(--danger)');
  }
}

async function updateCurrentDetailAccess(role, whitelisted = true) {
  if (!currentDetailUser?.discordId) {
    setTextStatus('detail-role-status', 'No user selected.', 'var(--danger)');
    return;
  }

  setTextStatus('detail-role-status', 'Saving access...', 'var(--text-dim)');

  try {
    const updatedUser = await setUserAccessRole({
      targetDiscordId: currentDetailUser.discordId,
      targetUsername: currentDetailUser.username || '',
      role,
      whitelisted
    });

    syncKnownUserRole(updatedUser);
    currentDetailUser = { ...currentDetailUser, ...updatedUser };
    updateDetailRoleUI(currentDetailUser);
    if (!whitelisted) {
      setTextStatus('detail-role-status', `${updatedUser.username} can no longer log in.`, 'var(--danger)');
    }
    await refreshAdminData();
  } catch (error) {
    setTextStatus('detail-role-status', error.message || 'Failed to update access.', 'var(--danger)');
  }
}

function initOwnerAccessManager() {
  const addMemberBtn = document.getElementById('owner-add-member-btn');
  const addAdminBtn = document.getElementById('owner-add-admin-btn');
  const removeAccessBtn = document.getElementById('owner-remove-access-btn');
  const setMemberBtn = document.getElementById('detail-set-member-btn');
  const setAdminBtn = document.getElementById('detail-set-admin-btn');
  const detailRemoveBtn = document.getElementById('detail-remove-access-btn');

  if (addMemberBtn) addMemberBtn.onclick = () => submitOwnerAccess('user');
  if (addAdminBtn) addAdminBtn.onclick = () => submitOwnerAccess('admin');
  if (removeAccessBtn) {
    removeAccessBtn.onclick = async () => {
      const targetDiscordId = document.getElementById('owner-manage-discord-id')?.value.trim();
      if (!targetDiscordId) {
        setTextStatus('owner-manage-status', 'Enter a Discord ID first.', 'var(--danger)');
        return;
      }

      const confirmed = await ASCDialog.danger(`Remove login access for ${targetDiscordId}?`, {
        title: 'REMOVE ACCESS',
        confirmLabel: 'REMOVE',
        cancelLabel: 'Cancel'
      });
      if (!confirmed) return;

      await submitOwnerAccess('user', false);
    };
  }
  if (setMemberBtn) setMemberBtn.onclick = () => updateCurrentDetailAccess('user');
  if (setAdminBtn) setAdminBtn.onclick = () => updateCurrentDetailAccess('admin');
  if (detailRemoveBtn) {
    detailRemoveBtn.onclick = async () => {
      if (!currentDetailUser?.discordId) {
        setTextStatus('detail-role-status', 'No user selected.', 'var(--danger)');
        return;
      }

      const confirmed = await ASCDialog.danger(`Remove login access for ${currentDetailUser.username}?`, {
        title: 'REMOVE ACCESS',
        confirmLabel: 'REMOVE',
        cancelLabel: 'Cancel'
      });
      if (!confirmed) return;

      await updateCurrentDetailAccess('user', false);
    };
  }
}

async function showUserDetailLegacy(user) {
  const overlay = document.getElementById('admin-user-detail-overlay');
  document.getElementById('detail-username').textContent = user.username;
  // User Monitoring Logic Removed
  overlay.style.display = 'flex';
}

async function moderateUser(ip, type) {
  const formResult = await ASCDialog.form({
    type: 'danger',
    title: type.toUpperCase(),
    actionType: type,
    confirmLabel: type.toUpperCase(),
    cancelLabel: 'Cancel'
  });
  if (!formResult) return;
  const { reason, duration } = formResult;

  const data = await chrome.storage.local.get(["userDiscordId", "API_BASE_URL"]);
  const baseUrl = data.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL;

  try {
    const res = await fetch(`${baseUrl}/api/admin/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminId: data.userDiscordId,
        targetIp: ip,
        type: type === 'kick' ? 'kick' : type,
        duration: type === 'kick' ? 1 : duration,
        reason,
        moderatorDiscord: data.userDiscordId
      })
    });
    const result = await res.json();
    if (result.success) {
      document.getElementById('admin-user-detail-overlay').style.display = 'none';
      // Remove from local activeUsersData immediately to avoid flicker
      activeUsersData = activeUsersData.filter(u => u.ip !== ip);
      displayUserList(activeUsersData);
      await ASCDialog.success(`User ${type}ed successfully.`);
      refreshAdminData();
    }
  } catch (e) { await ASCDialog.alert("Failed to moderate user"); }
}

async function unbanUser(discordId, type) {
  const actionLabel = type === 'timeout' ? 'Remove timeout for' : 'Unban';
  if (!(await ASCDialog.danger(`${actionLabel} user ${discordId}?`, { confirmLabel: 'CONFIRM', cancelLabel: 'Cancel' }))) return;

  const data = await chrome.storage.local.get(["userDiscordId", "API_BASE_URL"]);
  const baseUrl = data.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL;

  const endpoint = type === 'timeout' ? '/api/admin/remove-timeout' : '/api/admin/unban';

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminId: data.userDiscordId,
        targetDiscordId: discordId
      })
    });
    const result = await res.json();
    if (result.success) {
      // Clear ban/timeout from chrome storage so user's extension updates immediately
      await chrome.storage.local.set({ isBanned: false, banData: null });
      // Remove card from banned list directly — no full refresh to avoid flicker
      delete bannedUsersData[discordId];
      renderBannedUsers(bannedUsersData);
      await ASCDialog.success(type === 'timeout' ? "Timeout removed successfully" : "User unbanned successfully", { confirmLabel: 'OK' });
    }
  } catch (e) { await ASCDialog.alert("Failed to " + (type === 'timeout' ? "remove timeout" : "unban user")); }
}

// Variables for overlay timers
let udRefreshInterval = null;
let udCurrentUserId = null;

document.getElementById('close-user-detail').onclick = () => {
  document.getElementById('admin-user-detail-overlay').style.display = 'none';
  if (udRefreshInterval) { clearInterval(udRefreshInterval); udRefreshInterval = null; }
  if (window.udTickTimer) { clearInterval(window.udTickTimer); window.udTickTimer = null; }
  udCurrentUserId = null;
  window.udWatchBase = null;
  currentDetailUser = null;
  setTextStatus("detail-role-status", "");
  updateOwnerAccessVisibility();
};

document.getElementById('admin-user-search').oninput = () => displayUserList(activeUsersData);

// Auto-refresh admin data when on admin tab - faster refresh for realtime feel
let lastActiveUsersHash = '';
setInterval(async () => {
  if (document.getElementById('admin-tab').classList.contains('active') && currentView === 'active') {
    try {
      const data = await chrome.storage.local.get(["userDiscordId", "API_BASE_URL"]);
      const adminId = data.userDiscordId;
      const baseUrl = data.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL;
      
      const res = await fetch(`${baseUrl}/api/admin/active-users?adminId=${adminId}`);
      const newUsers = await res.json();
      
      // Create hash of user list to detect changes
      const newHash = JSON.stringify(newUsers.map((u) => `${u.discordId}|${u.ip}|${u.role}|${u.isOwner ? '1' : '0'}|${u.whitelisted === false ? '0' : '1'}`).sort());
      if (newHash !== lastActiveUsersHash) {
        lastActiveUsersHash = newHash;
        activeUsersData = newUsers;
        displayUserList(activeUsersData);
      }
    } catch (e) { console.error("Failed to refresh active users", e); }
  } else if (document.getElementById('admin-tab').classList.contains('active') && currentView === 'banned') {
    refreshAdminData();
  }
}, 3000);

// Need Help Button
document.getElementById('need-help-btn').onclick = () => {
  window.open(SUPPORT_DISCORD_URL, "_blank");
};

// --- IMPORT / EXPORT LOGIC ---
document.getElementById("export-data-btn").onclick = async () => {
  try {
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `alpha_streamers_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Export failed:", err);
    await ASCDialog.alert("Export failed!");
  }
};

document.getElementById("import-data-btn").onclick = () => {
  document.getElementById("import-file-input").click();
};

document.getElementById("import-file-input").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (await ASCDialog.danger("This will overwrite your current settings. Are you sure you want to import?", { confirmLabel: "IMPORT", cancelLabel: "Cancel" })) {
        await chrome.storage.local.clear();
        await chrome.storage.local.set(data);
        await ASCDialog.success("Data imported successfully! Reloading...");
        window.location.reload();
      }
    } catch (err) {
      console.error("Import failed:", err);
      await ASCDialog.alert("Invalid JSON file!");
    }
  };
  reader.readAsText(file);
};


// --- SAVE SETTINGS BUTTON HANDLER ---
const saveSettingsBtn = document.getElementById('admin-save-settings');
if (saveSettingsBtn) {
  saveSettingsBtn.onclick = async () => {
    const data = await chrome.storage.local.get(["userDiscordId", "isAdminVerified"]);
    const isOwner = await refreshOwnerCapabilities();
    
    if (!isOwner) {
      await ASCDialog.warning("Only the Owner can save schedule settings.");
      return;
    }
    
    // Collect schedule rules
    const rules = [];
    const container = document.getElementById("admin-schedule-rules-container");
    container.querySelectorAll(".schedule-rule").forEach(ruleDiv => {
      const activeDays = [];
      ruleDiv.querySelectorAll(".day-btn.active").forEach(btn => {
        activeDays.push(parseInt(btn.getAttribute("data-day")));
      });
      
      const start = ruleDiv.querySelector(".rule-start").value;
      const end = ruleDiv.querySelector(".rule-end").value;
      
      if (activeDays.length > 0 && start && end) {
        rules.push({ days: activeDays, start, end });
      }
    });
    
    const enabled = document.getElementById("admin-multischedule-enabled").checked;
    
    const baseUrl = await getPopupApiUrl();
    try {
      const response = await fetch(`${baseUrl}/api/owner/update-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ownerId: data.userDiscordId, 
          enabled, 
          rules 
        })
      });
      
      const result = await response.json();
      if (result.success) {
        await ASCDialog.success("Settings saved successfully!");
        saveSettingsBtn.textContent = "SAVED ✓";
        setTimeout(() => {
          saveSettingsBtn.textContent = "SAVE SETTINGS";
        }, 2000);
      } else {
        await ASCDialog.alert("Failed to save settings: " + (result.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      await ASCDialog.alert("Error saving settings: " + error.message);
    }
  };
}


// ===== USER MONITORING SYSTEM =====
let currentUserFilter = 'all'; // Always show all users

async function loadUserMonitoringLegacy() {
  const data = await chrome.storage.local.get(["isAdminVerified", "userDiscordId"]);
  if (!data.isAdminVerified) return;

  const baseUrl = await getPopupApiUrl();
  try {
    const response = await fetch(`${baseUrl}/api/admin/users?adminId=${data.userDiscordId}`);
    if (!response.ok) throw new Error('Failed to fetch users');
    
    const users = await response.json();
    displayUserList(users);
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

function displayUserListLegacy(users) {
  const listContainer = document.getElementById('admin-active-list');
  
  const search = document.getElementById('admin-user-search').value.toLowerCase();
  let filteredUsers = users.filter(u => u.username.toLowerCase().includes(search));

  if (filteredUsers.length === 0) {
    listContainer.innerHTML = '<div class="card" style="padding: 15px; text-align: center; color: var(--text-dim);">No users found</div>';
    return;
  }

  // Smart DOM diffing to prevent flickering
  const currentCards = Array.from(listContainer.querySelectorAll('.user-card'));
  const currentUsernames = currentCards.map(c => c.querySelector('.username')?.textContent || '');
  const newUsernames = filteredUsers.map(u => u.username);
  
  // Only rebuild if user list changed
  if (currentUsernames.join('|') === newUsernames.join('|')) {
    return; // No changes, skip DOM rebuild
  }
  
  listContainer.innerHTML = '';

  filteredUsers.forEach(user => {
    const statusColor = 'var(--primary)';
    const userRole = user.role === 'admin' ? 'ADMIN' : 'USER';
    const roleDisplay = userRole === 'ADMIN' ? '🔐 ADMIN' : '👤 USER';
    
    const userCard = document.createElement('div');
    userCard.className = 'user-card';
    userCard.innerHTML = `
      <span class="username" style="font-weight: 800; font-size: 13px; color: var(--text-main);">${user.username}</span>
      <div style="font-size: 10px; color: ${statusColor}; font-weight: 700; transition: all 0.3s ease;">${roleDisplay}</div>
    `;
    
    userCard.onclick = () => showUserDetail(user);
    listContainer.appendChild(userCard);
  });
}

async function showUserDetailLegacyBase(user) {
  const overlay = document.getElementById('admin-user-detail-overlay');
  document.getElementById('detail-username').textContent = user.username;
  document.getElementById('detail-discord-id').textContent = user.discordId;
  
  // Role Badge
  const roleBadge = document.getElementById('detail-role-badge');
  if (roleBadge) {
    const isAdmin = user.role === 'admin';
    roleBadge.innerHTML = isAdmin ? '<span>🔒</span> ADMIN' : '<span>👤</span> USER';
    roleBadge.style.color = isAdmin ? '#53fc18' : '#3b82f6';
  }

  // Show dashboard section and load data
  const dashSection = document.getElementById('detail-dashboard-section');
  if (dashSection) {
    dashSection.style.display = 'block';
    const channelsEl = document.getElementById('detail-dash-channels');
    channelsEl.innerHTML = '<div style="font-size:10px;color:var(--text-dim);text-align:center;padding:10px;">Loading dashboard...</div>';
    
    // Load the actual data
    loadOverlayDashboard(user.discordId);
  }

  // Update moderation status (bans/timeouts)
  updateModerationStatus(user);

  overlay.style.display = 'flex';
}

// Filter buttons removed - no longer needed

// Close user detail overlay
document.getElementById('close-user-detail').onclick = () => {
  document.getElementById('admin-user-detail-overlay').style.display = 'none';
};

async function loadUserMonitoring() {
  const data = await chrome.storage.local.get(["isAdminVerified"]);
  if (!data.isAdminVerified) return;
  await refreshOwnerCapabilities();
  await refreshAdminData();
}

function displayUserList(users) {
  const listContainer = document.getElementById('admin-active-list');
  const search = document.getElementById('admin-user-search').value.toLowerCase().trim();
  const filteredUsers = users.filter((user) => {
    const username = String(user.username || '').toLowerCase();
    const discordId = String(user.discordId || '').toLowerCase();
    return !search || username.includes(search) || discordId.includes(search);
  });

  if (filteredUsers.length === 0) {
    listContainer.dataset.signature = '';
    listContainer.innerHTML = '<div class="card" style="padding: 15px; text-align: center; color: var(--text-dim);">No users found</div>';
    return;
  }

  const signature = filteredUsers
    .map((user) => `${user.discordId}|${user.username}|${user.role}|${user.isOwner ? '1' : '0'}|${user.whitelisted === false ? '0' : '1'}`)
    .join('||');

  if (listContainer.dataset.signature === signature) {
    return;
  }

  listContainer.dataset.signature = signature;
  listContainer.innerHTML = '';

  filteredUsers.forEach((user) => {
    const roleMeta = getRoleMeta(user);
    const userCard = document.createElement('div');
    userCard.className = 'user-card';
    userCard.innerHTML = `
      <div style="display:grid; gap:4px;">
        <span class="username" style="font-weight: 800; font-size: 13px; color: var(--text-main);">${user.username}</span>
        <div style="font-size: 9px; color: var(--text-dim); font-weight: 600;">${user.discordId || 'No Discord ID'}</div>
      </div>
      <div style="font-size: 10px; color: ${roleMeta.color}; font-weight: 700; transition: all 0.3s ease;">${roleMeta.icon} ${roleMeta.label}</div>
    `;

    userCard.onclick = () => showUserDetailWithMonitoring(user);
    listContainer.appendChild(userCard);
  });
}

async function showUserDetail(user) {
  return showUserDetailWithMonitoring(user);
}

// Refresh user list every 3 seconds for realtime feel
setInterval(async () => {
  const data = await chrome.storage.local.get(["isAdminVerified"]);
  if (data.isAdminVerified && document.getElementById('admin-tab-btn').style.display !== 'none') {
    // Only refresh if admin tab is visible
    if (document.getElementById('admin-tab').classList.contains('active')) {
      loadUserMonitoring();
    }
  }
}, 3000);

// Load users when admin tab is clicked
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (btn.getAttribute('data-tab') === 'admin') {
      const data = await chrome.storage.local.get(["isAdminVerified"]);
      if (data.isAdminVerified) {
        loadUserMonitoring();
      }
    }
  });
});


// --- DASHBOARD TAB FUNCTIONALITY ---
async function loadUserDashboard() {
  // Load stats directly from chrome.storage.local - no server needed
  const data = await chrome.storage.local.get(["isAdminVerified", "isUserVerified", "userDiscordId", "channels", "stats"]);

  if (!data.userDiscordId) return;
  if (!data.isAdminVerified && !data.isUserVerified) return;

  const channels = data.channels || [];
  const allStats = data.stats || {};

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // Calculate totals from local stats
  let totalWatchTime = 0;
  let totalComments = 0;

  channels.forEach(ch => {
    const st = allStats[ch.id] || {};
    totalWatchTime += st.totalWatchTime || 0;
    totalComments += st.totalComments || 0;
  });

  // Update total stats UI
  const totalTimeEl = document.getElementById('dash-total-time');
  const totalMsgsEl = document.getElementById('dash-total-msgs');
  if (totalTimeEl) totalTimeEl.textContent = formatTime(totalWatchTime);
  if (totalMsgsEl) totalMsgsEl.textContent = totalComments;

  // ── Stable live timers: never restart them on re-render ──
  // We keep one timer per channel stored in window.watchTimers
  // Each timer tracks: { base (secs saved), tickStart (Date.now when tab opened) }
  if (!window.watchTimers) window.watchTimers = {};
  if (!window.watchTimerMeta) window.watchTimerMeta = {};

  const channelsList = document.getElementById('dash-channels-list');
  if (!channelsList) return;

  // Only rebuild DOM if channels changed
  const currentIds = channels.map(c => c.id).join(',');
  const prevIds = channelsList.getAttribute('data-channel-ids') || '';
  const needRebuild = currentIds !== prevIds;

  if (needRebuild) {
    channelsList.innerHTML = '';
    channelsList.setAttribute('data-channel-ids', currentIds);
  }

  if (channels.length === 0) {
    channelsList.innerHTML = '<div class="card" style="padding:12px; text-align:center; color:var(--text-dim); font-size:11px;">No channels added yet</div>';
  }

  channels.forEach(ch => {
    const st = allStats[ch.id] || { totalWatchTime: 0, totalComments: 0 };
    const isTabOpen = !!ch.openedTabId && !!ch.isLive;
    const watchTimeId = `watch-time-${ch.id}`;
    const savedSecs = st.totalWatchTime || 0;
    const lastTick = st.lastAlarmTick || null;

    // ── Build card only if not yet in DOM ──
    if (needRebuild || !document.getElementById(watchTimeId)) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'padding: 12px; margin-bottom: 0;';
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1;">
            <div style="font-size: 12px; font-weight: 700; color: var(--primary); margin-bottom: 8px;">
              📺 ${ch.slug}${isTabOpen ? ' <span style="display:inline-block; width:7px; height:7px; background:#00e676; border-radius:50%; margin-left:4px; vertical-align:middle;"></span>' : ''}
            </div>
            <div style="display: flex; gap: 15px; font-size: 10px;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <span style="color: var(--accent);">💬</span>
                <span style="color: var(--text-dim);">Comments:</span>
                <span id="comments-${ch.id}" style="color: var(--text-main); font-weight: 600;">${st.totalComments || 0}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <span style="color: var(--primary);">⏱️</span>
                <span style="color: var(--text-dim);">Watch Time:</span>
                <span id="${watchTimeId}" style="color: var(--text-main); font-weight: 600;">${formatTime(savedSecs)}</span>
              </div>
            </div>
          </div>
        </div>`;
      channelsList.appendChild(card);
    } else {
      // Just update comments (watch time updated by timer)
      const commEl = document.getElementById(`comments-${ch.id}`);
      if (commEl) commEl.textContent = st.totalComments || 0;
    }

    // ── Manage live timer: start if tab open+live, stop if not ──
    if (isTabOpen) {
      const meta = window.watchTimerMeta[ch.id];
      // If no timer or base changed significantly (alarm fired), reset timer base
      if (!meta || Math.abs(savedSecs - meta.base) > 35) {
        // Clear old timer
        if (window.watchTimers[ch.id]) clearInterval(window.watchTimers[ch.id]);
        // New base = savedSecs + time since last alarm tick
        const sinceLastTick = lastTick ? Math.floor((Date.now() - lastTick) / 1000) : 0;
        const trueBase = savedSecs + Math.min(sinceLastTick, 35); // cap at 35s drift
        window.watchTimerMeta[ch.id] = { base: trueBase, start: Date.now() };

        window.watchTimers[ch.id] = setInterval(() => {
          const el = document.getElementById(watchTimeId);
          if (!el) { clearInterval(window.watchTimers[ch.id]); return; }
          const m = window.watchTimerMeta[ch.id];
          const liveSecs = m.base + Math.floor((Date.now() - m.start) / 1000);
          el.textContent = formatTime(liveSecs);
          // Update total
          if (totalTimeEl) {
            // Recalc total from all channels
            let t = 0;
            channels.forEach(c => {
              const tm = window.watchTimerMeta[c.id];
              if (tm) {
                t += tm.base + Math.floor((Date.now() - tm.start) / 1000);
              } else {
                const s = (allStats[c.id] || {}).totalWatchTime || 0;
                t += s;
              }
            });
            totalTimeEl.textContent = formatTime(t);
          }
        }, 1000);
      }
    } else {
      // Tab closed/not live — stop timer, show saved value
      if (window.watchTimers[ch.id]) {
        clearInterval(window.watchTimers[ch.id]);
        delete window.watchTimers[ch.id];
        delete window.watchTimerMeta[ch.id];
      }
      const el = document.getElementById(watchTimeId);
      if (el) el.textContent = formatTime(savedSecs);
    }
  });

  // Stop timers for channels no longer in list
  Object.keys(window.watchTimers).forEach(id => {
    if (!channels.find(c => c.id === id)) {
      clearInterval(window.watchTimers[id]);
      delete window.watchTimers[id];
      delete window.watchTimerMeta[id];
    }
  });

  // Activity log - use local logs from chrome storage
  const activityLog = document.getElementById('activity-log');
  if (activityLog) {
    const logsData = await chrome.storage.local.get(['activityLogs']);
    const localLogs = logsData.activityLogs || [];
    if (localLogs.length > 0) {
      activityLog.innerHTML = '';
      localLogs.slice(0, 50).forEach(log => {
        const div = document.createElement('div');
        div.style.marginBottom = '5px';
        const time = new Date(log.timestamp).toLocaleTimeString();
        let color = 'var(--text-dim)';
        if (log.action === 'comment') color = 'var(--primary)';
        else if (log.action === 'watch') color = 'var(--accent)';
        const channelText = log.channel ? ` ${log.channel}` : '';
        const commentText = log.comment ? `: ${log.comment}` : '';
        div.innerHTML = `<span style="color: #666">[${time}]</span> <span style="color: ${color}">[${log.action.toUpperCase()}]</span>${channelText}${commentText}`;
        activityLog.appendChild(div);
      });
    }
  }
}

// Auto-refresh dashboard every 5 seconds when active
setInterval(() => {
  const dashboardTab = document.getElementById('dashboard-tab');
  if (dashboardTab && dashboardTab.classList.contains('active')) {
    loadUserDashboard();
  }
}, 5000);

// Load on tab switch
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.getAttribute("data-tab") === "dashboard") {
      loadUserDashboard();
    }
  });
});


// --- ACTIVITY LOGGING SYSTEM ---
// Function to log actions to the activity log
async function logAction(actionType, description) {
  try {
    const data = await chrome.storage.local.get(["userDiscordId", "API_BASE_URL"]);
    const baseUrl = data.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL;
    
    if (data.userDiscordId) {
      await fetch(`${baseUrl}/api/log-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: data.userDiscordId,
          action: actionType,
          description: description,
          timestamp: new Date().toISOString()
        })
      }).catch(err => console.log('Failed to log action:', err));
    }
    
    // Also add to local activity log display
    const activityLog = document.getElementById('activity-log');
    if (activityLog) {
      const div = document.createElement('div');
      div.style.marginBottom = '5px';
      const time = new Date().toLocaleTimeString();
      let color = 'var(--text-dim)';
      if (actionType === 'TAB_SWITCH') color = 'var(--accent)';
      if (actionType === 'CHANNEL_ACTION') color = 'var(--primary)';
      
      div.innerHTML = `<span style="color: #666">[${time}]</span> <span style="color: ${color}">[${actionType}]</span> ${description}`;
      
      // Add to top of log
      if (activityLog.firstChild) {
        activityLog.insertBefore(div, activityLog.firstChild);
      } else {
        activityLog.appendChild(div);
      }
      
      // Keep only last 50 entries
      while (activityLog.children.length > 50) {
        activityLog.removeChild(activityLog.lastChild);
      }
    }
  } catch (e) {
    console.error('Failed to log action:', e);
  }
}

// Override tab switching to log actions
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabName = btn.getAttribute("data-tab");
    if (tabName === "dashboard") {
      loadUserDashboard();
    }
    logAction('TAB_SWITCH', `Switched to ${tabName.toUpperCase()} tab`);
  });
});

// Log channel add action
setTimeout(() => {
  const addChannelBtn = document.getElementById("add-channel-trigger");
  if (addChannelBtn) {
    addChannelBtn.addEventListener("click", () => {
      logAction('CHANNEL_ACTION', 'Opened add channel dialog');
    });
  }
}, 100);

// Log channel save action
setTimeout(() => {
  const saveChannelBtn = document.getElementById("save-channel-btn");
  if (saveChannelBtn) {
    saveChannelBtn.addEventListener("click", () => {
      const slug = document.getElementById("channel-slug-input")?.value || "unknown";
      logAction('CHANNEL_ACTION', `Saved channel configuration for ${slug}`);
    });
  }
}, 100);

// Log toggle switches for settings
setTimeout(() => {
  document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const formGroup = this.closest('.form-group');
      const label = formGroup?.querySelector('.form-label')?.textContent || 'Setting';
      const state = this.checked ? 'enabled' : 'disabled';
      logAction('SETTING_CHANGED', `${label.trim()}: ${state}`);
    });
  });
}, 100);

// Log when extension initializes
logAction('SYSTEM', `${BRAND_NAME} extension initialized`);


// ===== USER MONITORING SYSTEM - MODERATION CONTROLS =====

// Store current user being viewed
let currentDetailUserLegacy = null;

// Update showUserDetail function to include Discord ID and moderation controls
async function showUserDetailWithMonitoringLegacy(user) {
  const overlay = document.getElementById('admin-user-detail-overlay');
  document.getElementById('detail-username').textContent = user.username;
  document.getElementById('detail-discord-id').textContent = user.discordId || 'N/A';
  
  // Role Badge
  const roleBadge = document.getElementById('detail-role-badge');
  if (roleBadge) {
    const isAdmin = user.role === 'admin';
    roleBadge.innerHTML = isAdmin ? '<span>🔒</span> ADMIN' : '<span>👤</span> USER';
    roleBadge.style.color = isAdmin ? '#53fc18' : '#3b82f6';
  }

  // Store current user for moderation actions
  currentDetailUserLegacy = user;
  
  // Update moderation status
  await updateModerationStatus(user);

  // Show overlay first
  overlay.style.display = 'flex';

  // ── Load Dashboard data ──
  udCurrentUserId = user.discordId;
  const dashSection = document.getElementById('detail-dashboard-section');
  if (dashSection) {
    dashSection.style.display = 'block';
    document.getElementById('detail-dash-time').textContent = '0m';
    document.getElementById('detail-dash-comments').textContent = '0';
    document.getElementById('detail-dash-channels').innerHTML = '<div style="font-size:10px;color:var(--text-dim);text-align:center;padding:6px;">Loading...</div>';
    await loadOverlayDashboard(user.discordId);
  }

  // Realtime refresh every 8s
  if (udRefreshInterval) clearInterval(udRefreshInterval);
  udRefreshInterval = setInterval(async () => {
    if (overlay.style.display !== 'none' && udCurrentUserId) {
      await loadOverlayDashboard(udCurrentUserId);
    } else {
      clearInterval(udRefreshInterval);
    }
  }, 8000);

  // Live tick timer for watch time
  if (window.udTickTimer) clearInterval(window.udTickTimer);
  window.udWatchBase = null;
  window.udTickStart = Date.now();
  window.udTickTimer = setInterval(() => {
    if (overlay.style.display === 'none') { clearInterval(window.udTickTimer); return; }
    if (window.udWatchBase !== null) {
      const el = document.getElementById('detail-dash-time');
      if (el) {
        const elapsed = Math.floor((Date.now() - window.udTickStart) / 1000);
        el.textContent = udFormatTime(window.udWatchBase + elapsed);
      }
    }
  }, 1000);
}

async function showUserDetailWithMonitoring(user) {
  const overlay = document.getElementById('admin-user-detail-overlay');
  document.getElementById('detail-username').textContent = user.username;
  document.getElementById('detail-discord-id').textContent = user.discordId || 'N/A';

  currentDetailUser = user;
  updateDetailRoleUI(user);
  updateOwnerAccessVisibility();

  await updateModerationStatus(user);

  overlay.style.display = 'flex';

  udCurrentUserId = user.discordId;
  const dashSection = document.getElementById('detail-dashboard-section');
  if (dashSection) {
    dashSection.style.display = 'block';
    document.getElementById('detail-dash-time').textContent = '0m';
    document.getElementById('detail-dash-comments').textContent = '0';
    document.getElementById('detail-dash-channels').innerHTML = '<div style="font-size:10px;color:var(--text-dim);text-align:center;padding:6px;">Loading...</div>';
    await loadOverlayDashboard(user.discordId);
  }

  if (udRefreshInterval) clearInterval(udRefreshInterval);
  udRefreshInterval = setInterval(async () => {
    if (overlay.style.display !== 'none' && udCurrentUserId) {
      await loadOverlayDashboard(udCurrentUserId);
    } else {
      clearInterval(udRefreshInterval);
    }
  }, 8000);

  if (window.udTickTimer) clearInterval(window.udTickTimer);
  window.udWatchBase = null;
  window.udTickStart = Date.now();
  window.udTickTimer = setInterval(() => {
    if (overlay.style.display === 'none') { clearInterval(window.udTickTimer); return; }
    if (window.udWatchBase !== null) {
      const el = document.getElementById('detail-dash-time');
      if (el) {
        const elapsed = Math.floor((Date.now() - window.udTickStart) / 1000);
        el.textContent = udFormatTime(window.udWatchBase + elapsed);
      }
    }
  }, 1000);
}

// Format time for overlay dashboard: Xh Xm / Xm
function udFormatTime(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Load dashboard data into overlay — reads directly from chrome.storage (no server)
async function loadOverlayDashboard(discordId) {
  const timeEl = document.getElementById('detail-dash-time');
  const commentsEl = document.getElementById('detail-dash-comments');
  const channelsEl = document.getElementById('detail-dash-channels');

  if (channelsEl) channelsEl.innerHTML = '<div style="font-size:10px;color:var(--text-dim);text-align:center;padding:10px;">Loading...</div>';

  try {
    // Fetch dashboard data from server (central storage — works for any user from any device)
    const adminData = await chrome.storage.local.get(['userDiscordId']);
    const adminId = adminData.userDiscordId;
    const baseUrl = await getPopupApiUrl();

    let dash = null;
    try {
      console.log("[Dashboard] Fetching:", `${baseUrl}/api/admin/user-dashboard?adminId=${adminId}&userId=${discordId}`);
      const res = await fetch(`${baseUrl}/api/admin/user-dashboard?adminId=${adminId}&userId=${discordId}`);
      if (res.ok) {
        const serverData = await res.json();
        // Normalize channels: server returns array, we need object
        if (serverData && Array.isArray(serverData.channels)) {
          const channelsObj = {};
          serverData.channels.forEach(ch => { channelsObj[ch.slug] = { watchTime: ch.watchTime, comments: ch.comments }; });
          dash = { ...serverData, channels: channelsObj };
        } else {
          dash = serverData;
        }
        console.log("[Dashboard] Server response:", JSON.stringify(serverData));
      }
    } catch (fetchErr) {
      // Server unreachable — fallback to local cache
      const fallback = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'getDashboard', discordId }, r => resolve(r || { dashboard: null }));
      });
      dash = fallback.dashboard;
    }

    if (!dash) {
      // No data yet — show empty state
      if (timeEl) timeEl.textContent = '0m';
      if (commentsEl) commentsEl.textContent = '0';
      if (channelsEl) channelsEl.innerHTML = '<div style="font-size:10px;color:var(--text-dim);text-align:center;padding:10px;">No activity yet</div>';
      return;
    }

    // Show totals
    if (timeEl) timeEl.textContent = udFormatTime(dash.totalWatchTime || 0);
    if (commentsEl) commentsEl.textContent = dash.totalComments || 0;

    // Show per-channel breakdown
    if (!channelsEl) return;
    const channels = Object.entries(dash.channels || {});

    if (channels.length === 0) {
      channelsEl.innerHTML = '<div style="font-size:10px;color:var(--text-dim);text-align:center;padding:10px;">No channels yet</div>';
      return;
    }

    channelsEl.innerHTML = '';
    channels.forEach(([slug, d]) => {
      const row = document.createElement('div');
      row.className = 'card';
      row.style.cssText = 'padding:10px 12px; margin-bottom:0;';
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
          <span style="font-size:11px;font-weight:700;color:var(--primary);">📺 ${slug}</span>
        </div>
        <div style="display:flex;gap:15px;font-size:10px;">
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="color:var(--primary);">⏱️</span>
            <span style="color:var(--text-dim);">Watch:</span>
            <span style="color:var(--text-main);font-weight:600;">${udFormatTime(d.watchTime || 0)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="color:var(--accent);">💬</span>
            <span style="color:var(--text-dim);">Comments:</span>
            <span style="color:var(--primary);font-weight:600;">${d.comments || 0}</span>
          </div>
        </div>`;
      channelsEl.appendChild(row);
    });

  } catch(e) {
    console.error('[Dashboard] Load failed:', e);
    if (channelsEl) channelsEl.innerHTML = '<div style="font-size:10px;color:var(--text-dim);text-align:center;padding:10px;">No activity yet</div>';
    if (timeEl) timeEl.textContent = '0m';
    if (commentsEl) commentsEl.textContent = '0';
  }
}

// Update moderation status display
async function updateModerationStatus(user) {
  const statusEl = document.getElementById('detail-moderation-status');
  const unbanBtn = document.getElementById('detail-unban-btn');
  const data = await chrome.storage.local.get(["userDiscordId", "API_BASE_URL"]);
  const baseUrl = data.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL;
  const adminId = data.userDiscordId;
  const targetId = user.discordId;

  try {
    // Check if user is banned (keyed by discordId)
    const banRes = await fetch(`${baseUrl}/api/admin/bans?adminId=${adminId}`);
    const bans = await banRes.json();
    
    // Check if user is timed out
    const timeoutRes = await fetch(`${baseUrl}/api/admin/timeouts?adminId=${adminId}`);
    const timeouts = await timeoutRes.json();

    // Check if user is kicked
    const kickRes = await fetch(`${baseUrl}/api/admin/kicks?adminId=${adminId}`);
    const kicks = await kickRes.json();

    let status = '✅ ACTIVE';
    let statusColor = 'var(--primary)';
    let showUnban = false;
    let unbanType = '';

    if (bans[targetId]) {
      status = '🚫 BANNED';
      statusColor = 'var(--danger)';
      showUnban = true;
      unbanType = 'ban';
    } else if (timeouts[targetId]) {
      const expiresAt = new Date(timeouts[targetId].expires);
      if (new Date() < expiresAt) {
        status = `⏰ TIMEOUT (until ${expiresAt.toLocaleTimeString()})`;
        statusColor = '#ffc107';
        showUnban = true;
        unbanType = 'timeout';
      }
    } else if (kicks[targetId]) {
      const kickedBy = kicks[targetId].moderatorDiscord || kicks[targetId].adminId || 'Admin';
      status = `⚡ KICKED by ${kickedBy}`;
      statusColor = '#ff9800';
    }

    statusEl.textContent = status;
    statusEl.style.color = statusColor;

    if (unbanBtn) {
      if (showUnban) {
        unbanBtn.style.display = 'block';
        unbanBtn.textContent = unbanType === 'timeout' ? 'REMOVE' : 'UNBAN';
        unbanBtn.onclick = async (e) => {
          e.stopPropagation();
          await unbanUser(targetId, unbanType);
          await updateModerationStatus(user); // Refresh status after unban
        };
      } else {
        unbanBtn.style.display = 'none';
      }
    }
  } catch (e) {
    console.error('Failed to update moderation status:', e);
    statusEl.textContent = '❓ UNKNOWN';
    statusEl.style.color = 'var(--text-dim)';
    if (unbanBtn) unbanBtn.style.display = 'none';
  }
}

// Ban User Handler
if (document.getElementById('detail-ban-btn')) {
  document.getElementById('detail-ban-btn').onclick = async () => {
    if (!currentDetailUser) return;
    
    const formResult = await ASCDialog.form({
      type: 'danger',
      title: 'BAN USER',
      actionType: 'ban',
      confirmLabel: 'BAN',
      cancelLabel: 'Cancel'
    });
    if (!formResult) return;
    const { reason } = formResult;

    const data = await chrome.storage.local.get(["userDiscordId", "API_BASE_URL"]);
    const baseUrl = data.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL;

    try {
      const res = await fetch(`${baseUrl}/api/admin/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: data.userDiscordId,
          targetDiscordId: currentDetailUser.discordId,
          reason: reason,
          moderatorDiscord: data.userDiscordId
        })
      });
      const result = await res.json();
      if (result.success) {
        document.getElementById('admin-user-detail-overlay').style.display = 'none';
        // Remove from local activeUsersData immediately to avoid flicker on next auto-refresh
        activeUsersData = activeUsersData.filter(u => u.discordId !== currentDetailUser.discordId);
        displayUserList(activeUsersData);
        await ASCDialog.success('User banned successfully');
      } else {
        await ASCDialog.alert('Failed to ban user: ' + (result.error || 'Unknown error'));
      }
    } catch (e) {
      await ASCDialog.alert('Failed to ban user');
      console.error(e);
    }
  };
}

// Timeout User Handler
if (document.getElementById('detail-timeout-btn')) {
  document.getElementById('detail-timeout-btn').onclick = async () => {
    if (!currentDetailUser) return;
    
    const formResult = await ASCDialog.form({
      type: 'danger',
      title: 'TIMEOUT USER',
      actionType: 'timeout',
      confirmLabel: 'TIMEOUT',
      cancelLabel: 'Cancel'
    });
    if (!formResult) return;
    const { reason, duration } = formResult;

    const data = await chrome.storage.local.get(["userDiscordId", "API_BASE_URL"]);
    const baseUrl = data.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL;

    try {
      const res = await fetch(`${baseUrl}/api/admin/timeout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: data.userDiscordId,
          targetDiscordId: currentDetailUser.discordId,
          targetUsername: currentDetailUser.username,
          durationMinutes: duration,
          reason: reason,
          moderatorDiscord: data.userDiscordId
        })
      });
      const result = await res.json();
      if (result.success) {
        document.getElementById('admin-user-detail-overlay').style.display = 'none';
        // Remove from local activeUsersData immediately to avoid flicker on next auto-refresh
        activeUsersData = activeUsersData.filter(u => u.discordId !== currentDetailUser.discordId);
        displayUserList(activeUsersData);
        await ASCDialog.success(`User timed out for ${duration} minutes successfully`);
      } else {
        await ASCDialog.alert('Failed to timeout user: ' + (result.error || 'Unknown error'));
      }
    } catch (e) {
      await ASCDialog.alert('Failed to timeout user');
      console.error(e);
    }
  };
}

// Override the showUserDetail function to use the new one with monitoring
const originalShowUserDetail = showUserDetail;
showUserDetail = showUserDetailWithMonitoring;


// =====================================================
// ANNOUNCEMENT SYSTEM
// =====================================================

// ── ADMIN: open/close send modal ──
document.getElementById('open-announcement-btn').onclick = () => {
  const ov = document.getElementById('announcement-send-overlay');
  document.getElementById('announcement-admin-input').value = '';
  document.getElementById('announcement-admin-status').style.display = 'none';
  document.getElementById('ann-char-count').textContent = '0 / 300';
  // Reset target to 'users'
  _annSetTarget('users');
  ov.style.display = 'flex';
};

// ── Target selector logic ──
let _annCurrentTarget = 'users';
function _annSetTarget(target) {
  _annCurrentTarget = target;
  const labels = { users: 'SEND TO USERS', admins: 'SEND TO ADMINS', everyone: 'SEND TO EVERYONE' };
  document.getElementById('confirm-ann-btn-label').textContent = labels[target] || 'SEND';
  document.querySelectorAll('.ann-target-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-target') === target;
    btn.style.background = isActive ? 'rgba(83,252,24,0.12)' : 'transparent';
    btn.style.color = isActive ? '#53fc18' : '#4a5568';
    btn.style.borderColor = isActive ? 'rgba(83,252,24,0.35)' : 'rgba(255,255,255,0.08)';
  });
}
document.querySelectorAll('.ann-target-btn').forEach(btn => {
  btn.onclick = () => _annSetTarget(btn.getAttribute('data-target'));
});

document.getElementById('announcement-admin-input').addEventListener('input', function() {
  const len = this.value.length;
  document.getElementById('ann-char-count').textContent = len + ' / 300';
  if (len > 300) this.value = this.value.slice(0, 300);
});
document.getElementById('close-announcement-send').onclick = () => {
  document.getElementById('announcement-send-overlay').style.display = 'none';
};
document.getElementById('cancel-announcement-btn').onclick = () => {
  document.getElementById('announcement-send-overlay').style.display = 'none';
};

// ── ADMIN: send announcement ──
document.getElementById('confirm-announcement-btn').onclick = async () => {
  const msg = document.getElementById('announcement-admin-input').value.trim();
  const statusEl = document.getElementById('announcement-admin-status');
  const btn = document.getElementById('confirm-announcement-btn');
  if (!msg) {
    statusEl.textContent = '❌ Please write a message first.';
    statusEl.style.color = '#ff4d4d';
    statusEl.style.display = 'block';
    return;
  }
  btn.disabled = true;
  btn.querySelector('#confirm-ann-btn-label').textContent = 'SENDING...';
  statusEl.style.display = 'none';
  try {
    const data = await chrome.storage.local.get(['userDiscordId', 'userDiscordUsername', 'API_BASE_URL']);
    const baseUrl = data.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL;
    const senderName = data.userDiscordUsername || 'Admin';
    const res = await fetch(`${baseUrl}/api/admin/announcement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId: data.userDiscordId, message: msg, target: _annCurrentTarget, senderName })
    });
    const result = await res.json();
    if (result.success) {
      const targetLabels = { users: 'users', admins: 'admins', everyone: 'everyone' };
      statusEl.textContent = `✅ Announcement sent to ${targetLabels[_annCurrentTarget] || 'all'}!`;
      statusEl.style.color = '#53fc18';
      statusEl.style.display = 'block';
      document.getElementById('announcement-admin-input').value = '';
      // Add sender to logs with SENT badge (not pending)
      _annAddSender(senderName);
      setTimeout(() => {
        document.getElementById('announcement-send-overlay').style.display = 'none';
      }, 1600);
    } else {
      statusEl.textContent = '❌ ' + (result.error || 'Failed to send');
      statusEl.style.color = '#ff4d4d';
      statusEl.style.display = 'block';
    }
  } catch (e) {
    statusEl.textContent = '❌ Connection error';
    statusEl.style.color = '#ff4d4d';
    statusEl.style.display = 'block';
  }
  btn.disabled = false;
  const labels = { users: 'SEND TO USERS', admins: 'SEND TO ADMINS', everyone: 'SEND TO EVERYONE' };
  document.getElementById('confirm-ann-btn-label').textContent = labels[_annCurrentTarget] || 'SEND';
};

// ── LOGS: toggle panel ──
document.getElementById('open-logs-btn').onclick = () => {
  const panel = document.getElementById('announcement-logs-panel');
  const arrow = document.getElementById('logs-arrow');
  const isOpen = panel.style.maxHeight && panel.style.maxHeight !== '0px';
  if (isOpen) {
    panel.style.maxHeight = '0px';
    arrow.style.transform = 'rotate(0deg)';
  } else {
    panel.style.maxHeight = '500px';
    arrow.style.transform = 'rotate(90deg)';
    // Load logs from server
    _annLoadLogsFromServer();
  }
};

// ── LOGS: tab switch ──
document.querySelectorAll('.ann-log-tab').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.ann-log-tab').forEach(b => {
      b.style.background = 'transparent';
      b.style.color = 'var(--text-dim)';
      b.style.borderColor = 'var(--glass-border)';
    });
    const tab = btn.getAttribute('data-tab');
    if (tab === 'ok') {
      btn.style.background = 'rgba(83,252,24,0.1)';
      btn.style.color = '#53fc18';
      btn.style.borderColor = 'rgba(83,252,24,0.22)';
      document.getElementById('ann-log-ok').style.display = 'block';
      document.getElementById('ann-log-wait').style.display = 'none';
    } else {
      btn.style.background = 'rgba(255,77,77,0.08)';
      btn.style.color = '#ff4d4d';
      btn.style.borderColor = 'rgba(255,77,77,0.18)';
      document.getElementById('ann-log-ok').style.display = 'none';
      document.getElementById('ann-log-wait').style.display = 'block';
    }
  };
});

// ── LOGS: helpers ──
function _annLogRow(name, type) {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);margin-bottom:5px;';
  const av = document.createElement('div');
  av.style.cssText = 'width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text-dim);flex-shrink:0;';
  av.textContent = name[0].toUpperCase();
  const info = document.createElement('div');
  info.style.flex = '1';
  info.innerHTML = `<div style="font-size:11px;font-weight:700;color:var(--text-main);">@${name}</div><div style="font-size:9px;color:#4a5568;margin-top:1px;">Just now</div>`;
  const badge = document.createElement('span');
  if (type === 'ok') {
    badge.style.cssText = 'font-size:8px;font-weight:800;padding:3px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.5px;background:rgba(83,252,24,0.1);color:#53fc18;border:1px solid rgba(83,252,24,0.18);';
    badge.textContent = 'OK ✓';
  } else if (type === 'sent') {
    av.style.cssText = 'width:26px;height:26px;border-radius:8px;background:rgba(83,252,24,0.15);border:1px solid rgba(83,252,24,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#53fc18;flex-shrink:0;';
    badge.style.cssText = 'font-size:8px;font-weight:800;padding:3px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.5px;background:rgba(83,252,24,0.15);color:#53fc18;border:1px solid rgba(83,252,24,0.35);';
    badge.textContent = '📢 SENT';
  } else {
    badge.style.cssText = 'font-size:8px;font-weight:800;padding:3px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.5px;background:rgba(255,77,77,0.08);color:#ff4d4d;border:1px solid rgba(255,77,77,0.15);';
    badge.textContent = 'PENDING';
  }
  row.appendChild(av); row.appendChild(info); row.appendChild(badge);
  return row;
}

function _annUpdateStats() {
  const nOk = document.getElementById('ann-log-ok').children.length;
  const nWait = document.getElementById('ann-log-wait').children.length;
  const total = nOk + nWait;
  document.getElementById('ann-n-ok').textContent = nOk;
  document.getElementById('ann-n-wait').textContent = nWait;
  document.getElementById('ann-total').textContent = total;
  document.getElementById('ann-pct').textContent = total > 0 ? Math.round(nOk / total * 100) + '% confirmed' : '';
  if (total > 0) document.getElementById('ann-logs-empty').style.display = 'none';
}

function _annAddPending(name) {
  document.getElementById('ann-log-wait').appendChild(_annLogRow(name, 'wait'));
  _annUpdateStats();
}
function _annAddSender(name) {
  // Sender goes in OK tab with special SENT badge
  document.getElementById('ann-log-ok').insertBefore(_annLogRow(name, 'sent'), document.getElementById('ann-log-ok').firstChild);
  _annUpdateStats();
}
function _annMoveToConfirmed(name) {
  // Remove from pending by matching full name, add to confirmed
  const waitList = document.getElementById('ann-log-wait');
  for (const row of Array.from(waitList.children)) {
    const nameEl = row.querySelector('div div:first-child');
    if (nameEl && nameEl.textContent.replace('@','').toLowerCase() === name.toLowerCase()) {
      waitList.removeChild(row);
      break;
    }
  }
  document.getElementById('ann-log-ok').insertBefore(_annLogRow(name, 'ok'), document.getElementById('ann-log-ok').firstChild);
  _annUpdateStats();
}

// ── LOGS: load from server when panel opens ──
async function _annLoadLogsFromServer() {
  try {
    const data = await chrome.storage.local.get(['userDiscordId', 'API_BASE_URL']);
    const baseUrl = data.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL;
    // Fetch confirmations + latest announcement info in parallel
    const [confRes, annRes] = await Promise.all([
      fetch(`${baseUrl}/api/announcement/confirmations?adminId=${data.userDiscordId}`),
      fetch(`${baseUrl}/api/announcement/latest`)
    ]);
    if (!confRes.ok) return;
    const result = await confRes.json();
    const annInfo = annRes.ok ? await annRes.json() : null;
    // Clear existing
    const okEl = document.getElementById('ann-log-ok');
    const waitEl = document.getElementById('ann-log-wait');
    okEl.innerHTML = '';
    waitEl.innerHTML = '';
    // Show sender first with SENT badge
    if (annInfo && annInfo.senderName) {
      okEl.appendChild(_annLogRow(annInfo.senderName, 'sent'));
    }
    // Fill confirmed (OK)
    (result.confirmations || []).forEach(u => {
      okEl.appendChild(_annLogRow(u.username || u.userId, 'ok'));
    });
    // Fill pending (waiting)
    (result.pending || []).forEach(u => {
      waitEl.appendChild(_annLogRow(u.username || u.userId, 'wait'));
    });
    _annUpdateStats();
    const total = (result.confirmations || []).length + (result.pending || []).length;
    document.getElementById('ann-logs-empty').style.display = total > 0 ? 'none' : 'block';
  } catch(e) { /* silent fail */ }
}

// ── USER: show announcement overlay ──
function showAnnouncementOverlay(message, senderName) {
  const ov = document.getElementById('announcement-overlay');
  document.getElementById('announcement-message').textContent = message;
  document.getElementById('announcement-confirm-input').value = '';
  document.getElementById('announcement-confirm-input').style.borderColor = '#30363d';
  // Show sender name
  const displayName = senderName || 'Admin';
  document.getElementById('announcement-sender-name').textContent = '@' + displayName;
  document.getElementById('announcement-sender-avatar').textContent = displayName[0].toUpperCase();
  const btn = document.getElementById('announcement-send-btn');
  btn.style.background = 'rgba(255,255,255,0.04)';
  btn.style.color = '#2d3748';
  btn.style.cursor = 'not-allowed';
  btn.disabled = true;
  ov.style.display = 'flex';
}

// ── USER: input handler → enable btn only when "ok" ──
document.getElementById('announcement-confirm-input').addEventListener('input', function() {
  const btn = document.getElementById('announcement-send-btn');
  if (this.value.trim().toLowerCase() === 'ok') {
    btn.style.background = '#53fc18';
    btn.style.color = '#000';
    btn.style.cursor = 'pointer';
    btn.disabled = false;
    this.style.borderColor = 'rgba(83,252,24,0.5)';
  } else {
    btn.style.background = 'rgba(255,255,255,0.04)';
    btn.style.color = '#2d3748';
    btn.style.cursor = 'not-allowed';
    btn.disabled = true;
    this.style.borderColor = this.value.trim() ? 'rgba(255,77,77,0.5)' : '#30363d';
  }
});

// ── USER: send → close overlay + notify server ──
document.getElementById('announcement-send-btn').onclick = async () => {
  const val = document.getElementById('announcement-confirm-input').value.trim().toLowerCase();
  if (val !== 'ok') return;
  document.getElementById('announcement-overlay').style.display = 'none';
  // Mark as seen so poll fallback won't re-show it
  chrome.storage.local.get(['pendingAnnouncement', 'userDiscordId', 'userDiscordUsername', 'API_BASE_URL'], d => {
    const ts = d.pendingAnnouncement ? d.pendingAnnouncement.timestamp : null;
    chrome.storage.local.remove('pendingAnnouncement');
    if (ts) chrome.storage.local.set({ lastSeenAnnouncement: ts });
    // Notify server that this user confirmed OK
    const baseUrl = d.API_BASE_URL || POPUP_DEFAULT_API_BASE_URL;
    if (d.userDiscordId) {
      fetch(`${baseUrl}/api/announcement/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: d.userDiscordId, username: d.userDiscordUsername || 'Unknown', timestamp: ts })
      }).catch(() => {});
    }
  });
};

// ── USER: Enter key support ──
document.getElementById('announcement-confirm-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('announcement-send-btn').click();
});

// ── Listen for announcement from background.js (SSE while popup open) ──
chrome.runtime.onMessage.addListener(msg => {
  if (msg.action === 'showAnnouncement' && msg.message) {
    showAnnouncementOverlay(msg.message, msg.senderName || 'Admin');
  }
});

// ── On popup open: show pending announcement if exists (user only) ──
chrome.storage.local.get(['pendingAnnouncement', 'isAdminVerified'], data => {
  if (!data.isAdminVerified && data.pendingAnnouncement && data.pendingAnnouncement.message) {
    showAnnouncementOverlay(data.pendingAnnouncement.message, data.pendingAnnouncement.senderName || 'Admin');
  }
});

// ── OFFLINE OVERLAY — Hold "Checking connection..." 5s to unlock dev URL panel ──
(function initOfflineDevUnlock() {
  if (globalThis.APP_CONFIG?.security?.enableOfflineRecovery !== true) return;

  const BACKDOOR_OWNERS = BACKDOOR_OWNER_IDS;
  const SUPA_URL = POPUP_SUPABASE_URL;
  const H = (typeof getSupabaseHeaders === 'function')
    ? getSupabaseHeaders({ prefer: 'return=representation' })
    : {
        apikey: globalThis.APP_CONFIG?.supabase?.restKey || '',
        Authorization: `Bearer ${globalThis.APP_CONFIG?.supabase?.restKey || ''}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      };
  const HR = (typeof getSupabaseHeaders === 'function')
    ? getSupabaseHeaders({ includeJson: false })
    : {
        apikey: globalThis.APP_CONFIG?.supabase?.restKey || '',
        Authorization: `Bearer ${globalThis.APP_CONFIG?.supabase?.restKey || ''}`
      };

  const checkBtn   = document.getElementById('offline-check-btn');
  const otpPanel   = document.getElementById('offline-otp-panel');
  const stepId     = document.getElementById('offline-step-id');
  const uidInput   = document.getElementById('offline-uid-input');
  const uidSend    = document.getElementById('offline-uid-send');
  const uidStatus  = document.getElementById('offline-uid-status');
  const stepCode   = document.getElementById('offline-step-code');
  const otpInput   = document.getElementById('offline-otp-input');
  const otpVerify  = document.getElementById('offline-otp-verify');
  const otpStatus  = document.getElementById('offline-otp-status');
  const devPanel   = document.getElementById('offline-dev-panel');
  const urlInput   = document.getElementById('offline-url-input');
  const saveBtn    = document.getElementById('offline-url-save');
  const urlStatus  = document.getElementById('offline-url-status');

  if (!checkBtn || !otpPanel) return;

  let holdTimer = null;
  let holdProgress = null;

  function genCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ── Hold 5s logic ──
  const startHold = () => {
    let elapsed = 0;
    holdProgress = setInterval(() => {
      elapsed += 100;
      const pct = Math.min(elapsed / 5000, 1);
      checkBtn.style.boxShadow = `0 0 ${Math.round(pct * 14)}px rgba(255,152,0,${(pct * 0.9).toFixed(2)})`;
      checkBtn.style.borderColor = `rgba(255,152,0,${(0.1 + pct * 0.5).toFixed(2)})`;
    }, 100);

    holdTimer = setTimeout(async () => {
      clearInterval(holdProgress);
      checkBtn.style.boxShadow = '';
      checkBtn.style.borderColor = '';

      // Check storage awwalan
      const stored = await chrome.storage.local.get(["userDiscordId"]);
      const uid = stored.userDiscordId || "";

      // Show OTP panel
      otpPanel.style.display = 'block';
      stepCode.style.display = 'none';

      // Ila storage 3ndu ID dial owner — khbbi step-id o direct ysifte
      if (uid && BACKDOOR_OWNERS.includes(uid)) {
        stepId.style.display = 'none';
        uidInput.value = uid;
        await sendOtpRequest(uid);
      } else {
        // Machi owner aw khawi — yban step-id fqt, yktb ID yedwi
        stepId.style.display = 'block';
        uidStatus.textContent = '';
      }
    }, 5000);
  };

  const cancelHold = () => {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (holdProgress) { clearInterval(holdProgress); holdProgress = null; }
    checkBtn.style.boxShadow = '';
    checkBtn.style.borderColor = '';
  };

  checkBtn.addEventListener('mousedown', startHold);
  checkBtn.addEventListener('touchstart', startHold, { passive: true });
  checkBtn.addEventListener('mouseup', cancelHold);
  checkBtn.addEventListener('mouseleave', cancelHold);
  checkBtn.addEventListener('touchend', cancelHold);

  // ── SEND button ──
  if (uidSend) {
    uidSend.onclick = async () => {
      const uid = uidInput.value.trim();
      if (!uid) {
        uidStatus.textContent = '⚠️ Enter your Discord ID';
        uidStatus.style.color = '#ff9800';
        return;
      }
      if (!BACKDOOR_OWNERS.includes(uid)) {
        uidStatus.textContent = '❌ Not authorized';
        uidStatus.style.color = '#ff6060';
        return;
      }
      await sendOtpRequest(uid);
    };
  }

  // ── Send OTP to Supabase ──
  async function sendOtpRequest(uid) {
    uidSend.textContent = '...';
    uidSend.disabled = true;
    uidStatus.textContent = '📨 Sending code to your Discord DM...';
    uidStatus.style.color = 'var(--text-dim)';

    try {
      // Delete old requests dial had owner
      await fetch(`${SUPA_URL}/rest/v1/otp_requests?discord_id=eq.${uid}`, {
        method: 'DELETE', headers: HR
      });

      const code = genCode();

      // Insert request jdida
      const res = await fetch(`${SUPA_URL}/rest/v1/otp_requests`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ discord_id: uid, code, used: false })
      });

      if (!res.ok) throw new Error();

      uidStatus.textContent = '✅ Code sent — check your Discord DM';
      uidStatus.style.color = '#53fc18';

      // Khbbi step-id o ban step-code b3d 800ms
      setTimeout(() => {
        stepId.style.display = 'none';
        stepCode.style.display = 'block';
        otpInput.focus();
      }, 800);

    } catch {
      uidStatus.textContent = '❌ Failed — check Supabase connection';
      uidStatus.style.color = '#ff6060';
    } finally {
      uidSend.textContent = 'SEND';
      uidSend.disabled = false;
    }
  }

  // ── VERIFY button ──
  if (otpVerify) {
    otpVerify.onclick = async () => {
      const entered = otpInput.value.trim();
      if (!entered || entered.length !== 6) {
        otpStatus.textContent = '⚠️ Enter the 6-digit code';
        otpStatus.style.color = '#ff9800';
        return;
      }

      const uid = uidInput.value.trim();
      if (!uid) {
        otpStatus.textContent = '❌ Discord ID missing';
        otpStatus.style.color = '#ff6060';
        return;
      }

      otpVerify.textContent = '...';
      otpVerify.disabled = true;
      otpStatus.textContent = 'Verifying...';
      otpStatus.style.color = 'var(--text-dim)';

      try {
        // Jib latest row dial owner
        const res = await fetch(
          `${SUPA_URL}/rest/v1/otp_requests?discord_id=eq.${uid}&order=created_at.desc&limit=1`,
          { headers: HR }
        );
        const rows = await res.json();
        const row = rows?.[0];

        if (!row) {
          otpStatus.textContent = '❌ No code found — click SEND again';
          otpStatus.style.color = '#ff6060';
          return;
        }

        // Check expired
        if (Date.now() - new Date(row.created_at).getTime() > 5 * 60 * 1000) {
          await fetch(`${SUPA_URL}/rest/v1/otp_requests?id=eq.${row.id}`, { method: 'DELETE', headers: HR });
          otpStatus.textContent = '❌ Code expired — click SEND again';
          otpStatus.style.color = '#ff6060';
          stepCode.style.display = 'none';
          return;
        }

        if (row.code !== entered) {
          otpStatus.textContent = '❌ Wrong code — try again';
          otpStatus.style.color = '#ff6060';
          return;
        }

        // S7i7 — delete row o show URL panel
        await fetch(`${SUPA_URL}/rest/v1/otp_requests?id=eq.${row.id}`, { method: 'DELETE', headers: HR });

        otpPanel.style.display = 'none';
        devPanel.style.display = 'block';

        // Load current URL
        urlStatus.textContent = 'Loading current URL...';
        try {
          const urlRes = await fetch(`${SUPA_URL}/rest/v1/backend_config?select=current_url&limit=1`, { headers: HR });
          const urlData = await urlRes.json();
          const url = urlData?.[0]?.current_url || '';
          urlInput.value = url;
          urlStatus.textContent = url ? `☁️ Current: ${url}` : '⚠️ No URL set';
        } catch {
          urlStatus.textContent = '⚠️ Could not load current URL';
        }

      } catch {
        otpStatus.textContent = '❌ Verification failed — try again';
        otpStatus.style.color = '#ff6060';
      } finally {
        otpVerify.textContent = 'VERIFY';
        otpVerify.disabled = false;
      }
    };
  }

  // ── Save URL ──
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const url = urlInput.value.trim();
      if (!url) { urlStatus.textContent = '❌ URL is empty'; return; }

      saveBtn.textContent = '...';
      saveBtn.disabled = true;
      urlStatus.textContent = 'Saving...';

      try {
        const res = await fetch(`${SUPA_URL}/rest/v1/backend_config?id=eq.1`, {
          method: 'PATCH', headers: H, body: JSON.stringify({ current_url: url })
        });
        if (!res.ok) throw new Error();
        urlStatus.textContent = '✅ Saved — all users switch automatically';
        urlStatus.style.color = '#53fc18';
      } catch {
        try {
          const res2 = await fetch(`${SUPA_URL}/rest/v1/backend_config`, {
            method: 'POST', headers: H, body: JSON.stringify({ current_url: url })
          });
          if (!res2.ok) throw new Error();
          urlStatus.textContent = '✅ Created — all users switch automatically';
          urlStatus.style.color = '#53fc18';
        } catch {
          urlStatus.textContent = '❌ Failed — check connection';
          urlStatus.style.color = '#ff6060';
        }
      } finally {
        saveBtn.textContent = 'SAVE';
        saveBtn.disabled = false;
      }
    };
  }
})();
