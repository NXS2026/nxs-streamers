let channelConfig = null;
let isRunning = true;
let emojiTimer = null;
let normalTimer = null;
let isInStream = false;
let emojiIndex = 0;
let normalIndex = 0;
let startingIndex = 0;
let startingTimer = null;
let isStartingPhase = false;
let sessionStartTime = null;
let commentsSentThisSession = 0;

// Shuffle tracking for NORMAL MESSAGES and STARTING SOON CHAT
let startingShuffle = [];
let normalShuffle = [];

// First message flags — premier message = random cooldown 1-120s
let isFirstEmoji = true;
let isFirstNormal = true;

let messageQueue = [];
let isProcessingQueue = false;


let specialCooldownStartTime = null;
let specialCooldownScheduledMessages = [];
let specialCooldownProcessingIndex = 0;
let specialCooldownLoopCount = 0;


let currentVolumeTarget = 1.0; 
let volumeCycleInterval = 5 * 60 * 1000; 
const DEFAULT_API_BASE_URL = globalThis.APP_CONFIG?.api?.fallbackUrl || "http://localhost:3000";

window.addEventListener("load", () => {
    injectVolumeToStorage(1.0);

    setTimeout(() => {
        initializeAutomation();
        setupVisibilityDetection();
        
        setupSmartVolumeJitter(); 
        setupInteractionHeartbeat();
        setupFocusSpoofing();
        setupQualityJitter();
        setupResourceOptimizer();
        setupClickShield();
        setupAutoAcceptRules(); 
        setupAutoBadgeActivator(); 

        
        setTimeout(() => {
            console.log("Kick PRO: Initial 10s unmute triggered");
            forceUnmute();
            setInterval(forceUnmute, 5000);
        }, 10000);

    }, 3000);
});

function injectVolumeToStorage(vol) {
    try {
        // Always set volume=1 and muted=false on video player
        // Chrome tab mute handles the actual silence - Kick sees an active viewer
        localStorage.setItem("kick_video_player_volume", "1");
        localStorage.setItem("videojs-volume", "1");
        localStorage.setItem("kick_video_player_muted", "false");
        
        const player = document.querySelector('video');
        if (player) {
            player.muted = false;
            player.volume = 1;
        }
    } catch (e) {}
}

function forceUnmute() {
    // Always run - Chrome tab mute handles silence, video player must stay unmuted for Kick
    console.log("Kick PRO: Attempting to force unmute player...");
    
    
    const muteButton = document.querySelector('button[aria-label="Mute"], button[aria-label="Unmute"], .vjs-mute-control');
    if (muteButton) {
        const isCurrentlyMuted = muteButton.getAttribute('aria-label') === 'Unmute' || 
                               muteButton.classList.contains('vjs-vol-0') ||
                               document.querySelector('.vjs-vol-0');
        if (isCurrentlyMuted) {
            muteButton.click();
            console.log("Kick PRO: Clicked mute button to unmute");
        }
    }

    
    const video = document.querySelector('video');
    if (video) {
        if (video.muted) {
            video.muted = false;
            console.log("Kick PRO: Set video.muted to false");
        }
        if (video.volume !== 1) {
            video.volume = 1;
            console.log("Kick PRO: Set video.volume to 1");
        }
        
        
        if (video.paused) {
            video.play().catch(err => {
                console.log("Kick PRO: Autoplay prevented, waiting for interaction", err);
            });
        }
    }
}


document.addEventListener('click', () => {
    forceUnmute();
}, { once: false });

async function getApiUrl() {
    return new Promise((resolve) => {
        chrome.storage.local.get(["API_BASE_URL"], (data) => {
            resolve(data.API_BASE_URL || DEFAULT_API_BASE_URL);
        });
    });
}

async function checkUrlWhitelist(url) {
    return new Promise(async (resolve) => {
        try {
            const baseUrl = await getApiUrl();
            const res = await fetch(`${baseUrl}/api/check-whitelist?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            
            if (!data.allowed) {
                console.warn(`Kick PRO: URL ${url} is not whitelisted.`);
                // If not whitelisted, notify the user via Discord
                chrome.storage.local.get(["userDiscordId"], (userData) => {
                    if (userData.userDiscordId) {
                        fetch(`${baseUrl}/api/notify-whitelist-error?id=${userData.userDiscordId}&url=${encodeURIComponent(url)}`)
                            .catch(err => console.error("Kick PRO: Failed to notify whitelist error", err));
                    }
                });
                resolve(false);
            } else {
                resolve(true);
            }
        } catch (e) {
            console.error("Kick PRO: Failed to check URL whitelist", e);
            resolve(true); // Fallback to true if server is down to avoid blocking users
        }
    });
}

async function initializeAutomation() {
    const slug = window.location.pathname.split("/")[1];
    if (!slug) return;

    // Enforcement: Check whitelist before starting anything
    const isWhitelisted = await checkUrlWhitelist(`kick.com/${slug}`);
    if (!isWhitelisted) {
        console.warn(`Kick PRO: Channel ${slug} is not whitelisted. Automation disabled.`);
        isRunning = false;
        chrome.runtime.sendMessage({ action: "showWhitelistError" }).catch(() => {});
        return;
    }

    chrome.storage.local.get(["channels", "masterAutoMode", "moderatedUsers", "isBanned", "globalMute"], (result) => {
        if (result.isBanned) {
            console.warn("Kick PRO: User is banned. Automation disabled.");
            isRunning = false;
            return;
        }
        const channels = result.channels || [];
        const channel = channels.find(c => c.slug.toLowerCase() === slug.toLowerCase());
        
        if (channel) {
            // Check for ban or timeout
            const modUsers = result.moderatedUsers || {};
            const modUser = modUsers[channel.id];
            
            // Check for BAN
            if (modUser && modUser.banned) {
                console.warn(`Kick PRO: User is banned from ${channel.slug}. Automation disabled.`);
                isRunning = false;
                return;
            }
            
            // Check for TIMEOUT
            if (modUser && modUser.timeout && modUser.timeoutExpires) {
                if (new Date(modUser.timeoutExpires) > new Date()) {
                    console.log(`Kick PRO: Automation paused for ${channel.slug} due to active timeout until ${modUser.timeoutExpires}`);
                    isRunning = false;
                    return;
                }
            }

            const isAutoEnabled = result.masterAutoMode || channel.autoMode;
            channelConfig = channel;
            channelConfig.globalMute = result.globalMute !== false;
            if (isAutoEnabled) checkIfInStream();
        }
    });
}

async function checkIfInStream() {
    const streamPlayer = document.querySelector("[class*=\"player\"], video");
    const chatArea = document.querySelector("[class*=\"chat\"], [data-testid*=\"chat\"]");
    const isLive = document.body.innerText.includes("LIVE") || !!streamPlayer;

    isInStream = !!(isLive && chatArea);
    
    // Check for KICK action (auto-logout)
    if (isInStream) {
        const slug = window.location.pathname.split("/")[1];
        if (slug) {
            chrome.storage.local.get(["channels", "moderatedUsers"], (result) => {
                const channels = result.channels || [];
                const channel = channels.find(c => c.slug.toLowerCase() === slug.toLowerCase());
                if (channel) {
                    const modUsers = result.moderatedUsers || {};
                    const modUser = modUsers[channel.id];
                    if (modUser && modUser.kicked) {
                        console.warn(`Kick PRO: User was kicked from ${channel.slug}. Performing auto-logout...`);
                        // Perform logout by clearing session
                        chrome.storage.local.set({
                            isUserLoggedIn: false,
                            isAdminVerified: false,
                            isUserVerified: false,
                            userDiscordId: null
                        });
                        // Redirect to home
                        window.location.href = 'https://kick.com';
                        return;
                    }
                }
            });
        }
    }
    
    if (isInStream && isRunning) {
        // GLOBAL SCHEDULE ENFORCEMENT
        const storage = await new Promise(resolve => chrome.storage.local.get(["isAdminVerified", "isUserLoggedIn"], resolve));
        if (storage.isUserLoggedIn && !storage.isAdminVerified) {
            try {
                const baseUrl = await getApiUrl();
                const res = await fetch(`${baseUrl}/api/global-schedule`);
                if (res.ok) {
                    const schedule = await res.json();
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
                            console.warn("Kick PRO: Global Schedule restriction active. Automation paused.");
                            return; // Stop here, don't start automation
                        }
                    }
                }
            } catch (e) {
                console.error("Kick PRO: Failed to check global schedule", e);
            }
        }
        
        startAutomation();
    }
}

function setupVisibilityDetection() {
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) checkIfInStream();
    });
}

// ============================================================
// PHASE DETECTION — 100% reliable, zero DOM dependency
// source of truth: streamStart_<channelId> in chrome.storage
// set by background.js the moment isLive flips true
// ============================================================

let _phaseCheckInterval = null;

/**
 * Get stream uptime in seconds from chrome.storage.
 * Returns null if stream start time not recorded yet.
 */
async function _getUptimeFromStorage() {
    return new Promise(resolve => {
        const key = `streamStart_${channelConfig.id}`;
        chrome.storage.local.get([key], data => {
            const startTime = data[key];
            if (!startTime) { resolve(null); return; }
            resolve(Math.floor((Date.now() - startTime) / 1000));
        });
    });
}

/**
 * Central source of truth for phase.
 * Returns: 'starting' | 'regular'
 *
 * - Starting feature OFF        → always 'regular'
 * - uptime readable >= 10min    → 'regular'
 * - uptime readable < 10min     → 'starting'
 * - uptime null (not yet saved) → 'starting' (safe default)
 */
async function _currentPhase() {
    const startingEnabled = channelConfig.starting?.enabled && channelConfig.starting.list?.length > 0;
    if (!startingEnabled) return 'regular';
    const uptime = await _getUptimeFromStorage();
    if (uptime === null) return 'starting'; // safe default
    return uptime < 600 ? 'starting' : 'regular';
}

function startAutomation() {
    if (sessionStartTime !== null) return;
    sessionStartTime = Date.now();
    console.log("Kick PRO: Starting automation session...");
    if (channelConfig.autoFollow) setTimeout(autoFollow, 5000);

    if (channelConfig.starting?.enabled && channelConfig.starting.list?.length > 0) {
        _resolveStartingPhase();
    } else {
        startRegularAutomation();
    }
}

/**
 * Read uptime from storage, decide phase, start the right automation.
 * Retries every 3s until background.js saves the start time.
 */
async function _resolveStartingPhase() {
    const uptime = await _getUptimeFromStorage();

    if (uptime === null) {
        console.log("Kick PRO: Waiting for background.js to record stream start time...");
        setTimeout(_resolveStartingPhase, 3000);
        return;
    }

    if (uptime < 600) {
        console.log(`Kick PRO: Stream uptime ${uptime}s — Starting Soon phase ACTIVE.`);
        isStartingPhase = true;
        if (startingTimer) clearTimeout(startingTimer);
        scheduleNextStarting();

        // Poll every 10s — switch to regular exactly when uptime hits 600s
        if (_phaseCheckInterval) clearInterval(_phaseCheckInterval);
        _phaseCheckInterval = setInterval(async () => {
            const phase = await _currentPhase();
            if (phase === 'regular' && isStartingPhase) {
                console.log("Kick PRO: 10 minutes reached — switching to Regular chat.");
                isStartingPhase = false;
                if (startingTimer) clearTimeout(startingTimer);
                clearInterval(_phaseCheckInterval);
                _phaseCheckInterval = null;
                startRegularAutomation();
            }
        }, 10000);

    } else {
        console.log(`Kick PRO: Stream uptime ${uptime}s — Skipping Starting Soon phase.`);
        isStartingPhase = false;
        startRegularAutomation();
    }
}


function startRegularAutomation() {
    // Clear phase polling interval if running
    if (_phaseCheckInterval) {
        clearInterval(_phaseCheckInterval);
        _phaseCheckInterval = null;
    }

    // Reset first-message flags for random initial cooldown
    isFirstEmoji = true;
    isFirstNormal = true;

    console.log("Kick PRO: Starting regular automation (Emoji/Normal chat).");
    
    if (channelConfig.emoji?.enabled && channelConfig.emoji.list?.length > 0) {
        if (emojiTimer) clearTimeout(emojiTimer);
        scheduleNextEmoji();
    }
    
    if (channelConfig.normal?.enabled && channelConfig.normal.list?.length > 0) {
        if (normalTimer) clearTimeout(normalTimer);
        
        if (channelConfig.normal.specialCooldown && channelConfig.normal.specialCooldown.enabled === true) {
            startSpecialCooldown();
        } else {
            scheduleNextNormal();
        }
    }
}

async function scheduleNextStarting() {
    if (!isRunning || await _currentPhase() !== 'starting' || !channelConfig.starting?.enabled) return;
    if (channelConfig.maxComments > 0 && commentsSentThisSession >= channelConfig.maxComments) {
        console.log("Kick PRO: Max comments reached for starting messages.");
        return;
    }
    if (!channelConfig.starting.list || channelConfig.starting.list.length === 0) return;

    if (startingTimer) clearTimeout(startingTimer);

    // Initialize shuffle if empty or we've gone through all messages
    if (startingShuffle.length === 0) {
        startingShuffle = shuffleArray(channelConfig.starting.list);
        console.log("Kick PRO: Starting messages shuffled");
    }

    const cds = (channelConfig.starting.cooldowns && channelConfig.starting.cooldowns.length > 0) ? channelConfig.starting.cooldowns : [30];
    const cooldownIndex = startingIndex % cds.length;
    const interval = cds[cooldownIndex] * 1000;
    const finalInterval = Math.max(1000, interval);

    console.log(`Kick PRO: Next starting message in ${Math.round(finalInterval/1000)}s (Shuffle Index: ${startingIndex % startingShuffle.length})`);

    startingTimer = setTimeout(() => {
        if (channelConfig.maxComments > 0 && commentsSentThisSession >= channelConfig.maxComments) return;
        
        const msg = startingShuffle[startingIndex % startingShuffle.length];
        sendComment(msg);
        startingIndex++;
        
        // If we've gone through all messages, reshuffle
        if (startingIndex % startingShuffle.length === 0) {
            startingShuffle = shuffleArray(channelConfig.starting.list);
            console.log("Kick PRO: Starting messages reshuffled");
        }
        
        scheduleNextStarting();
    }, finalInterval);
}

function autoFollow() {
    try {
        const followButton = document.querySelector('button[aria-label*="Follow" i], button[aria-label*="follow" i]');
        if (followButton && followButton.textContent.toLowerCase().includes('follow')) {
            followButton.click();
            console.log('Kick PRO: Auto-followed channel');
        }
    } catch (error) {
        console.error('Kick PRO: Error auto-following:', error);
    }
}

async function scheduleNextEmoji() {
    if (!isRunning || await _currentPhase() !== 'regular' || !channelConfig.emoji?.enabled) return;
    if (channelConfig.maxComments > 0 && commentsSentThisSession >= channelConfig.maxComments) {
        console.log("Kick PRO: Max comments reached for emoji.");
        return;
    }
    if (!channelConfig.emoji.list || channelConfig.emoji.list.length === 0) return;

    if (emojiTimer) clearTimeout(emojiTimer);

    let finalInterval;
    if (isFirstEmoji) {
        // Premier message: random entre 1s et 120s
        finalInterval = (Math.floor(Math.random() * 120) + 1) * 1000;
        isFirstEmoji = false;
        console.log(`Kick PRO: First emoji — random cooldown: ${Math.round(finalInterval/1000)}s`);
    } else {
        const cds = (channelConfig.emoji.cooldowns && channelConfig.emoji.cooldowns.length > 0) ? channelConfig.emoji.cooldowns : [30];
        const interval = cds[emojiIndex % cds.length] * 1000;
        finalInterval = Math.max(5000, interval);
        console.log(`Kick PRO: Next emoji in ${Math.round(finalInterval/1000)}s (Index: ${emojiIndex % cds.length})`);
    }

    emojiTimer = setTimeout(() => {
        
        if (channelConfig.maxComments > 0 && commentsSentThisSession >= channelConfig.maxComments) return;
        
        const list = channelConfig.emoji.list;
        const msg = list[emojiIndex % list.length];
        sendComment(msg);
        emojiIndex++;
        scheduleNextEmoji();
    }, finalInterval);
}

async function scheduleNextNormal() {
    if (!isRunning || await _currentPhase() !== 'regular' || !channelConfig.normal?.enabled) return;
    if (channelConfig.maxComments > 0 && commentsSentThisSession >= channelConfig.maxComments) {
        console.log("Kick PRO: Max comments reached for normal messages.");
        return;
    }
    if (!channelConfig.normal.list || channelConfig.normal.list.length === 0) return;

    if (normalTimer) clearTimeout(normalTimer);

    // Initialize shuffle if empty or we've gone through all messages
    if (normalShuffle.length === 0) {
        normalShuffle = shuffleArray(channelConfig.normal.list);
        console.log("Kick PRO: Normal messages shuffled");
    }

    let finalInterval;
    if (isFirstNormal) {
        // Premier message: random entre 1s et 120s
        finalInterval = (Math.floor(Math.random() * 120) + 1) * 1000;
        isFirstNormal = false;
        console.log(`Kick PRO: First normal msg — random cooldown: ${Math.round(finalInterval/1000)}s`);
    } else {
        const cds = (channelConfig.normal.cooldowns && channelConfig.normal.cooldowns.length > 0) ? channelConfig.normal.cooldowns : [60];
        const cooldownIndex = normalIndex % cds.length;
        const interval = cds[cooldownIndex] * 1000;
        finalInterval = Math.max(1000, interval);
        console.log(`Kick PRO: Next normal message in ${Math.round(finalInterval/1000)}s (Shuffle Index: ${normalIndex % normalShuffle.length})`);
    }

    normalTimer = setTimeout(() => {
       
        if (channelConfig.maxComments > 0 && commentsSentThisSession >= channelConfig.maxComments) return;

        const msg = normalShuffle[normalIndex % normalShuffle.length];
        sendComment(msg);
        normalIndex++;
        
        // If we've gone through all messages, reshuffle
        if (normalIndex % normalShuffle.length === 0) {
            normalShuffle = shuffleArray(channelConfig.normal.list);
            console.log("Kick PRO: Normal messages reshuffled");
        }
        
        scheduleNextNormal();
    }, finalInterval);
}


function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}


async function startSpecialCooldown() {
    if (!isRunning || await _currentPhase() !== 'regular' || !channelConfig.normal?.enabled || !channelConfig.normal.specialCooldown || channelConfig.normal.specialCooldown.enabled !== true) return;
    if (channelConfig.maxComments > 0 && commentsSentThisSession >= channelConfig.maxComments) return;
    if (!channelConfig.normal.list || channelConfig.normal.list.length === 0) return;

    const specialConfig = channelConfig.normal.specialCooldown;
    const messageCount = specialConfig.messageCount || 100;
    const timeValue = specialConfig.timeValue || 5;
    const timeUnit = specialConfig.timeUnit || "min";

    
    let totalTimeMs = 0;
    if (timeUnit === "sec") {
        totalTimeMs = timeValue * 1000;
    } else if (timeUnit === "min") {
        totalTimeMs = timeValue * 60 * 1000;
    } else if (timeUnit === "hour") {
        totalTimeMs = timeValue * 60 * 60 * 1000;
    }

    specialCooldownStartTime = Date.now();
    specialCooldownScheduledMessages = [];
    specialCooldownProcessingIndex = 0;
    specialCooldownLoopCount++;

    
    for (let i = 0; i < messageCount; i++) {
        
        const randomDelay = Math.floor(Math.random() * totalTimeMs);
        specialCooldownScheduledMessages.push({
            timestamp: specialCooldownStartTime + randomDelay,
            messageIndex: i
        });
    }

    
    specialCooldownScheduledMessages.sort((a, b) => a.timestamp - b.timestamp);

    
    const messageList = channelConfig.normal.list;
    
    
    specialCooldownScheduledMessages = specialCooldownScheduledMessages.map((msg, idx) => ({
        ...msg,
        messageText: messageList[idx % messageList.length]
    }));

    
    scheduleNextSpecialCooldownMessage();
}

async function scheduleNextSpecialCooldownMessage() {
    if (!isRunning || await _currentPhase() !== 'regular' || !channelConfig.normal?.enabled || !channelConfig.normal.specialCooldown || channelConfig.normal.specialCooldown.enabled !== true) return;
    
    if (specialCooldownProcessingIndex >= specialCooldownScheduledMessages.length) {
        
        startSpecialCooldown();
        return;
    }

    if (channelConfig.maxComments > 0 && commentsSentThisSession >= channelConfig.maxComments) return;
    if (!channelConfig.normal.list || channelConfig.normal.list.length === 0) return;

    const nextMessage = specialCooldownScheduledMessages[specialCooldownProcessingIndex];
    const now = Date.now();
    const delay = Math.max(0, nextMessage.timestamp - now);

    normalTimer = setTimeout(() => {
        
        if (channelConfig.maxComments > 0 && commentsSentThisSession >= channelConfig.maxComments) return;

        
        const msg = nextMessage.messageText || channelConfig.normal.list[Math.floor(Math.random() * channelConfig.normal.list.length)];
        sendComment(msg);
        specialCooldownProcessingIndex++;
        scheduleNextSpecialCooldownMessage();
    }, delay);
}

async function sendComment(text) {
    if (!isRunning || !isInStream || !text) return;
    messageQueue.push(text);
    if (!isProcessingQueue) await processMessageQueue();
}

async function processMessageQueue() {
    if (messageQueue.length === 0 || isProcessingQueue) return;

    isProcessingQueue = true;
    const text = messageQueue.shift();

    try {
        const chatInput = findChatInput();
        if (chatInput) {
            injectText(chatInput, text);
            await new Promise(resolve => setTimeout(resolve, 1200));

            const btn = findSendButton();
            if (btn) {
                btn.click();
            } else {
                chatInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", keyCode: 13 }));
            }
            
            commentsSentThisSession++;
            chrome.runtime.sendMessage({ action: "recordComment", channelId: channelConfig.id, comment: text });
            await new Promise(resolve => setTimeout(resolve, 2500));
        }
    } catch (e) {
        console.error("Error processing message queue:", e);
    } finally {
        isProcessingQueue = false;
        if (messageQueue.length > 0) {
            
            setTimeout(() => processMessageQueue(), 100);
        }
    }
}

function findChatInput() {
    return document.querySelector("div[contenteditable=\"true\"][data-testid=\"chat-input\"]") || 
           document.querySelector("div[contenteditable=\"true\"]") ||
           document.querySelector("#message-input") ||
           document.querySelector("textarea[placeholder*='Message']") ||
           document.querySelector("input[placeholder*='Message']");
}

function findSendButton() {
    return document.querySelector("button[data-testid=\"chat-send-button\"]") || 
           document.querySelector("button[aria-label=\"Send Message\"]") ||
           document.querySelector("button[aria-label*='Send']") ||
           document.querySelector("button[class*='send']");
}

function injectText(element, text) {
    element.focus();
    try {
        
        element.innerText = "";
        
        
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("text/plain", text);
        element.dispatchEvent(new ClipboardEvent("paste", {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true
        }));
        
        
        if (element.innerText.trim() !== text.trim()) {
            element.innerText = text;
            element.dispatchEvent(new Event("input", { bubbles: true }));
        }
    } catch (e) {
        element.innerText = text;
        element.dispatchEvent(new Event("input", { bubbles: true }));
    }
}


function setupSmartVolumeJitter() {
    setInterval(() => {
        if (!isRunning) return;
        
        // Keep volume at 1.0 always (Chrome tab mute handles silence)
        currentVolumeTarget = 1.0;
        injectVolumeToStorage(currentVolumeTarget);
        console.log(`Kick PRO: Volume jitter applied: ${currentVolumeTarget.toFixed(2)}`);
    }, volumeCycleInterval);
}

function setupInteractionHeartbeat() {
    // Randomly scroll or click non-essential elements to look active
    setInterval(() => {
        if (!isRunning || !isInStream) return;
        
        const r = Math.random();
        if (r < 0.3) {
            window.scrollBy(0, Math.random() * 100 - 50);
        } else if (r < 0.6) {
            // Hover over some elements
            const elements = document.querySelectorAll('a, button');
            if (elements.length > 0) {
                const el = elements[Math.floor(Math.random() * elements.length)];
                el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            }
        }
    }, 45000);
}

function setupFocusSpoofing() {
    // Keep the tab "active" even when backgrounded
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { get: () => false });
    
    window.addEventListener('blur', (e) => {
        e.stopImmediatePropagation();
    }, true);
    
    // Periodically trigger focus events
    setInterval(() => {
        if (isRunning) {
            window.dispatchEvent(new FocusEvent('focus'));
            document.dispatchEvent(new Event('visibilitychange'));
        }
    }, 30000);
}

function setupQualityJitter() {
    // Occasionally change quality settings to simulate manual control
    setInterval(() => {
        if (!isRunning || !isInStream) return;
        
        const settingsBtn = document.querySelector('button[aria-label="Settings"]');
        if (settingsBtn) {
            // Just open and close to look active
            settingsBtn.click();
            setTimeout(() => settingsBtn.click(), 2000);
        }
    }, 120000);
}

function setupResourceOptimizer() {
    // If hidden, we can potentially lower some overhead
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            // Potentially lower video quality via localStorage if needed
        }
    });
}

function setupClickShield() {
    // Prevent common anti-bot traps (invisible overlays)
    document.addEventListener('mousedown', (e) => {
        if (e.target.offsetWidth === 0 || e.target.offsetHeight === 0) {
            console.warn("Kick PRO: Blocked potential trap click");
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

function setupAutoAcceptRules() {
    // Auto-click "Accept" on channel rules and cookies if they pop up
    setInterval(() => {
        if (!isRunning) return;
        
        // 1. Check for common "Accept" buttons by text
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const txt = btn.textContent.toLowerCase().trim();
            if (txt === 'accept' || 
                txt === 'agree' || 
                txt === 'i agree' || 
                txt === 'accept rules' || 
                txt === 'accept cookies' || 
                txt === 'allow all' ||
                txt === 'got it') {
                
                // Ensure button is visible and clickable
                if (btn.offsetWidth > 0 && btn.offsetHeight > 0) {
                    btn.click();
                    console.log("Kick PRO: Auto-accepted rules/cookies (Text match)");
                    break;
                }
            }
        }

        // 2. Check for specific Kick.com rules modal buttons
        const kickRulesBtn = document.querySelector('.rules-modal button, [class*="rules"] button, [class*="modal"] button[class*="primary"]');
        if (kickRulesBtn && kickRulesBtn.offsetWidth > 0) {
            const btnText = kickRulesBtn.textContent.toLowerCase();
            if (btnText.includes('accept') || btnText.includes('agree')) {
                kickRulesBtn.click();
                console.log("Kick PRO: Auto-accepted Kick rules modal");
            }
        }

        // 3. Check for Cookie banners (often have specific IDs or classes)
        const cookieSelectors = [
            '#onetrust-accept-btn-handler',
            '.cookie-banner-accept',
            '[aria-label*="Accept Cookies"]',
            '.accept-cookies-button'
        ];
        
        cookieSelectors.forEach(selector => {
            const el = document.querySelector(selector);
            if (el && el.offsetWidth > 0) {
                el.click();
                console.log("Kick PRO: Auto-accepted cookies (Selector match)");
            }
        });

    }, 2000); // Faster check every 2 seconds
}

function setupAutoBadgeActivator() {
    // Occasionally click the user profile or chat settings to look like a real user
    setInterval(() => {
        if (!isRunning || !isInStream) return;
        const chatSettings = document.querySelector('[aria-label="Chat Settings"]');
        if (chatSettings) {
            chatSettings.click();
            setTimeout(() => chatSettings.click(), 1500);
        }
    }, 180000);
}

// === Quality Control (Integrated from uKick) ===
const SETTINGS_LABELS = ["Settings", "Ajustes", "Configurações", "Paramètres", "Einstellungen", "Impostazioni", "Ayarlar", "Pengaturan", "设置", "設定", "설정", "إعدادات", "Asetukset", "Ustawienia", "Настройки", "Cài đặt", "Nastavení"];
let lastKickUrl = location.href;
let lastAppliedQuality = null;
let _persistTimer = null;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function getQualitySettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(["autoQuality", "preferredQuality"], (data) => {
            resolve({
                autoQuality: data.autoQuality !== false,
                preferredQuality: data.preferredQuality || "160",
            });
        });
    });
}

function isKickStreamUrl(url) { return /^https:\/\/(www\.)?kick\.com\/[^\/?#]+/.test(url); }

function persistSessionQuality(pref) {
    if (_persistTimer) { clearInterval(_persistTimer); _persistTimer = null; }
    if (!pref) return;
    const setQuality = () => { try { sessionStorage.setItem("stream_quality", String(pref)); } catch (e) {} };
    setQuality();
    const start = Date.now();
    _persistTimer = setInterval(() => {
        if (Date.now() - start > 10000) { clearInterval(_persistTimer); _persistTimer = null; return; }
        const cur = sessionStorage.getItem("stream_quality");
        const video = document.querySelector("video");
        if (cur === String(pref) && video) { clearInterval(_persistTimer); _persistTimer = null; return; }
        setQuality();
    }, 400);
}

function findSettingsButton() {
    const buttons = document.querySelectorAll("button[aria-label]");
    for (const btn of buttons) {
        const label = (btn.getAttribute("aria-label") || "").toLowerCase();
        if (SETTINGS_LABELS.some((langLabel) => label.includes(langLabel.toLowerCase()))) return btn;
    }
    return document.querySelector('button[class*="settings"], button[class*="cog"], .vjs-icon-cog');
}

async function waitForPlayerAndApply(preferredQuality) {
    const start = Date.now();
    persistSessionQuality(preferredQuality);
    while (Date.now() - start < 15000) {
        if (document.querySelector("video")) break;
        await sleep(300);
    }
    applyKickQuality(preferredQuality);
}

async function applyKickQuality(preferredQuality) {
    if (!preferredQuality) return;
    const pref = parseInt(String(preferredQuality).replace(/\D/g, ""), 10);
    if (isNaN(pref)) return;

    sessionStorage.setItem("stream_quality", String(pref));
    persistSessionQuality(pref);
    lastAppliedQuality = String(pref);

    const video = document.querySelector("video") || document.getElementById("video-player");
    if (!video) return;

    const safeClick = (el) => { if (!el) return false; try { el.click(); return true; } catch (e) { return false; } };
    
    // Hover to show controls
    const r = video.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    ["mouseenter", "mouseover", "mousemove"].forEach((t) => {
        video.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: cx, clientY: cy }));
    });

    await sleep(700);
    let attempt = 0;
    while (attempt < 10) {
        attempt++;
        let settingsBtn = findSettingsButton();
        if (!settingsBtn) { await sleep(500); continue; }
        safeClick(settingsBtn);
        await sleep(600);

        const qualityEls = Array.from(document.querySelectorAll('[data-testid="player-quality-option"], [role="menuitemradio"], [role="menuitem"], li, div[class*="option"]'))
            .filter((el) => /^\d+/.test((el.textContent || "").trim()));

        let available = qualityEls.map((el) => parseInt((el.textContent || "").replace(/\D/g, ""), 10)).filter(n => !isNaN(n));
        if (!available.length) { safeClick(settingsBtn); await sleep(500); continue; }

        available.sort((a, b) => b - a);
        let target = available.find((q) => q <= pref) || available[available.length - 1];
        const targetEl = qualityEls.find((el) => (el.textContent || "").includes(String(target)));

        if (targetEl) {
            safeClick(targetEl);
            sessionStorage.setItem("stream_quality", String(target));
            lastAppliedQuality = String(target);
            break;
        } else {
            safeClick(settingsBtn);
            await sleep(500);
        }
    }
}

async function initAutoQualityControl() {
    const settings = await getQualitySettings();
    if (settings.preferredQuality) {
        persistSessionQuality(String(settings.preferredQuality));
        lastAppliedQuality = String(settings.preferredQuality);
    }
    if (settings.autoQuality && isKickStreamUrl(location.href)) {
        waitForPlayerAndApply(settings.preferredQuality);
    }
    new MutationObserver(() => {
        if (location.href !== lastKickUrl) {
            lastKickUrl = location.href;
            if (settings.autoQuality && isKickStreamUrl(location.href)) waitForPlayerAndApply(settings.preferredQuality);
        }
    }).observe(document, { subtree: true, childList: true });

    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === "updateQualitySettings") {
            getQualitySettings().then((s) => {
                if (s.autoQuality && isKickStreamUrl(location.href)) waitForPlayerAndApply(s.preferredQuality);
            });
        }
    });
}

// === Volume Boost (Integrated from uKick) ===
let audioContext;
let gainNode;
let source;
let currentBoost = 1;
let currentVideo = null;

function setupAudioContext() {
    const video = document.querySelector("video");
    if (!video) return;
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    if (video !== currentVideo || !source) {
        currentVideo = video;
        if (source) try { source.disconnect(); } catch (e) {}
        source = audioContext.createMediaElementSource(video);
        if (!gainNode) gainNode = audioContext.createGain();
        gainNode.gain.value = currentBoost;
        source.connect(gainNode).connect(audioContext.destination);
    }
}

function setVolumeBoost(boostAmount) {
    currentBoost = boostAmount;
    if (gainNode) gainNode.gain.value = boostAmount;
    if (audioContext && audioContext.state === "suspended") audioContext.resume();
}

async function applyStoredVolumeBoost() {
    const { volumeBoost = 1 } = await chrome.storage.local.get("volumeBoost");
    setVolumeBoost(parseFloat(volumeBoost));
}

function enableAudioContextOnUserGesture() {
    const initialize = () => {
        setupAudioContext();
        applyStoredVolumeBoost();
        window.removeEventListener("click", initialize);
        window.removeEventListener("keydown", initialize);
    };
    window.addEventListener("click", initialize);
    window.addEventListener("keydown", initialize);
}

// Initialize new features
initAutoQualityControl();
enableAudioContextOnUserGesture();

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "volumeBoost" in changes) {
        setVolumeBoost(parseFloat(changes.volumeBoost.newValue) || 1);
    }
});
