/**
 * ============================================================
 * STREAM UPTIME DETECTION & STARTING SOON LOGIC
 * ============================================================
 * 
 * This script handles the logic for:
 * 1. Detecting stream uptime from Kick's UI
 * 2. Determining if stream is in "Starting Soon" phase (< 10 minutes)
 * 3. Switching between Starting Soon chat and Normal/Emoji chat
 * 
 * ============================================================
 */

// Cache for stream uptime
let cachedUptime = null;
let lastUptimeCheck = 0;
const UPTIME_CHECK_INTERVAL = 2000; // Check every 2 seconds

/**
 * Parse time string from Kick uptime counter
 * Formats: "MM:SS", "H:MM:SS", "HH:MM:SS"
 * Returns: total seconds
 */
function parseUptimeString(timeStr) {
  if (!timeStr) return 0;
  
  const parts = timeStr.trim().split(':').map(p => parseInt(p, 10));
  
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // H:MM:SS or HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  
  return 0;
}

/**
 * Extract stream uptime from Kick's UI
 * Looks for the uptime counter displayed during live streams
 */
function extractStreamUptime() {
  try {
    const TIME_REGEX = /^\d{1,2}:\d{2}(:\d{2})?$/;

    // --- Tier 1: Kick-specific known selectors (most reliable) ---
    const kickSelectors = [
      // Kick v2 / current UI
      '[class*="uptime"]',
      '[class*="StreamDuration"]',
      '[class*="stream-duration"]',
      '[class*="LiveDuration"]',
      '[class*="live-duration"]',
      '[data-testid="stream-uptime"]',
      '[data-testid="live-duration"]',
      '[data-testid*="uptime"]',
      // older Kick UI
      'span[class*="duration"]',
      '[class*="stream-info"] span',
      '[class*="stream-info"] div',
      '[class*="live-time"]',
      '[class*="liveTime"]',
      // generic fallbacks
      '[aria-label*="uptime" i]',
      '[aria-label*="duration" i]',
      '[title*="uptime" i]'
    ];

    for (const selector of kickSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent.trim();
        if (TIME_REGEX.test(text)) {
          console.log(`[StreamUptime] Found via selector "${selector}": ${text}`);
          return text;
        }
      }
    }

    // --- Tier 2: Walk near the LIVE badge ---
    const liveBadges = document.querySelectorAll(
      '[class*="live" i], [class*="badge" i], [data-testid*="live" i]'
    );
    for (const badge of liveBadges) {
      // Check badge text itself
      const badgeText = badge.textContent.trim().toUpperCase();
      if (!badgeText.includes('LIVE') && !TIME_REGEX.test(badgeText)) continue;

      // Walk up 3 levels then search all descendants for a time string
      let node = badge;
      for (let i = 0; i < 3; i++) {
        if (!node.parentElement) break;
        node = node.parentElement;
      }
      const descendants = node.querySelectorAll('span, div, p');
      for (const d of descendants) {
        const t = d.textContent.trim();
        if (TIME_REGEX.test(t)) {
          console.log(`[StreamUptime] Found near LIVE badge: ${t}`);
          return t;
        }
      }
    }

    // --- Tier 3: Header / navbar area scan ---
    const headerAreas = document.querySelectorAll(
      'header, nav, [class*="header"], [class*="navbar"], [class*="topbar"], [class*="player-info"], [class*="stream-header"]'
    );
    for (const area of headerAreas) {
      const spans = area.querySelectorAll('span, div');
      for (const span of spans) {
        const t = span.textContent.trim();
        if (TIME_REGEX.test(t)) {
          console.log(`[StreamUptime] Found in header area: ${t}`);
          return t;
        }
      }
    }

    // --- Tier 4: Full-page scan as last resort ---
    // Only look at leaf nodes (no children) to avoid grabbing parent containers
    const allSpans = document.querySelectorAll('span, div, p');
    for (const el of allSpans) {
      if (el.children.length === 0) {
        const t = el.textContent.trim();
        if (TIME_REGEX.test(t)) {
          console.log(`[StreamUptime] Found via full-page scan: ${t}`);
          return t;
        }
      }
    }

  } catch (error) {
    console.error('[StreamUptime] Error extracting uptime:', error);
  }
  
  return null;
}

/**
 * Get current stream uptime in seconds
 * Uses caching to avoid excessive DOM queries
 */
function getStreamUptimeSeconds() {
  const now = Date.now();
  
  // Return cached value if still fresh
  if (cachedUptime !== null && (now - lastUptimeCheck) < UPTIME_CHECK_INTERVAL) {
    return cachedUptime;
  }
  
  // Extract new uptime value
  const uptimeStr = extractStreamUptime();
  if (uptimeStr) {
    cachedUptime = parseUptimeString(uptimeStr);
    lastUptimeCheck = now;
    return cachedUptime;
  }
  
  return null;
}

/**
 * Check if stream is in "Starting Soon" phase
 * Returns true if stream uptime is less than 10 minutes
 */
function isInStartingSoonPhase() {
  const uptimeSeconds = getStreamUptimeSeconds();
  
  if (uptimeSeconds === null) {
    // Can't determine uptime, assume NOT in starting phase
    return false;
  }
  
  const TEN_MINUTES_SECONDS = 10 * 60; // 600 seconds
  const isStarting = uptimeSeconds < TEN_MINUTES_SECONDS;
  
  console.log(`[StreamUptime] Stream uptime: ${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s - Starting phase: ${isStarting}`);
  
  return isStarting;
}

/**
 * Get remaining time until stream exits "Starting Soon" phase
 * Returns: { minutes, seconds, totalSeconds }
 */
function getTimeUntilStartingSoonEnd() {
  const uptimeSeconds = getStreamUptimeSeconds();
  
  if (uptimeSeconds === null) {
    return null;
  }
  
  const TEN_MINUTES_SECONDS = 10 * 60;
  const remainingSeconds = Math.max(0, TEN_MINUTES_SECONDS - uptimeSeconds);
  
  return {
    totalSeconds: remainingSeconds,
    minutes: Math.floor(remainingSeconds / 60),
    seconds: remainingSeconds % 60
  };
}

/**
 * Format uptime for logging
 */
function formatUptime(seconds) {
  if (seconds === null) return 'Unknown';
  
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

/**
 * Monitor stream uptime and trigger callbacks
 * Useful for real-time switching logic
 */
class StreamUptimeMonitor {
  constructor() {
    this.isMonitoring = false;
    this.monitorInterval = null;
    this.lastPhaseState = null;
    this.callbacks = {
      onEnterStartingPhase: null,
      onExitStartingPhase: null,
      onUptimeUpdate: null
    };
  }
  
  /**
   * Start monitoring stream uptime
   */
  start(checkInterval = 1000) {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('[StreamUptime] Monitor started');
    
    this.monitorInterval = setInterval(() => {
      const isStarting = isInStartingSoonPhase();
      const uptime = getStreamUptimeSeconds();
      
      // Trigger update callback
      if (this.callbacks.onUptimeUpdate) {
        this.callbacks.onUptimeUpdate(uptime, isStarting);
      }
      
      // Detect phase change
      if (this.lastPhaseState === null) {
        this.lastPhaseState = isStarting;
      } else if (this.lastPhaseState !== isStarting) {
        if (isStarting && this.callbacks.onEnterStartingPhase) {
          console.log('[StreamUptime] Entered Starting Soon phase');
          this.callbacks.onEnterStartingPhase();
        } else if (!isStarting && this.callbacks.onExitStartingPhase) {
          console.log('[StreamUptime] Exited Starting Soon phase');
          this.callbacks.onExitStartingPhase();
        }
        this.lastPhaseState = isStarting;
      }
    }, checkInterval);
  }
  
  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    console.log('[StreamUptime] Monitor stopped');
  }
  
  /**
   * Register callback for phase changes
   */
  onEnterStartingPhase(callback) {
    this.callbacks.onEnterStartingPhase = callback;
    return this;
  }
  
  /**
   * Register callback for exiting starting phase
   */
  onExitStartingPhase(callback) {
    this.callbacks.onExitStartingPhase = callback;
    return this;
  }
  
  /**
   * Register callback for uptime updates
   */
  onUptimeUpdate(callback) {
    this.callbacks.onUptimeUpdate = callback;
    return this;
  }
}

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseUptimeString,
    extractStreamUptime,
    getStreamUptimeSeconds,
    isInStartingSoonPhase,
    getTimeUntilStartingSoonEnd,
    formatUptime,
    StreamUptimeMonitor
  };
}
