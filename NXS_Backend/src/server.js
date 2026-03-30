import 'dotenv/config';

import cors from 'cors';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStore } from './store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || './data');
const dbFile = path.join(dataDir, 'db.json');

const PORT = Number(process.env.PORT || 3000);
const OTP_TTL_MS = Number(process.env.OTP_TTL_MINUTES || 5) * 60 * 1000;
const ACTIVE_USER_TTL_MS = Number(process.env.ACTIVE_USER_TTL_SECONDS || 120) * 1000;
const ALLOW_ALL_USERS = String(process.env.ALLOW_ALL_USERS || 'true').toLowerCase() === 'true';
const OTP_DEBUG = String(process.env.OTP_DEBUG || 'true').toLowerCase() === 'true';
const AUTO_BOOTSTRAP_FIRST_ADMIN = String(process.env.AUTO_BOOTSTRAP_FIRST_ADMIN || 'true').toLowerCase() === 'true';
const DISCORD_BOT_TOKEN = String(process.env.DISCORD_BOT_TOKEN || '').trim();
const DISCORD_OTP_WEBHOOK_URL = String(process.env.DISCORD_OTP_WEBHOOK_URL || '').trim();

const OWNER_IDS = parseIdSet(process.env.OWNER_IDS);
const ADMIN_IDS = parseIdSet(process.env.ADMIN_IDS);
const USER_IDS = parseIdSet(process.env.USER_IDS);
const DEFAULT_ALLOWED_URLS = parseList(process.env.DEFAULT_ALLOWED_URLS);

const store = createStore(dbFile);
const sseClients = new Map();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

function parseList(raw = '') {
  return String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseIdSet(raw = '') {
  return new Set(parseList(raw));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeUrl(url = '') {
  return String(url)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function wildcardToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesAllowedUrl(url, pattern) {
  const normalizedUrl = normalizeUrl(url);
  const normalizedPattern = normalizeUrl(pattern);

  if (!normalizedPattern) return false;
  if (normalizedPattern.includes('*')) return wildcardToRegex(normalizedPattern).test(normalizedUrl);
  return normalizedUrl === normalizedPattern || normalizedUrl.startsWith(`${normalizedPattern}/`);
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function discordHeaders() {
  return {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

async function sendDiscordOtpDm({ discordId, code, username, role }) {
  if (!DISCORD_BOT_TOKEN) {
    return { ok: false, method: 'bot_dm', error: 'DISCORD_BOT_TOKEN is not configured' };
  }

  try {
    const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: discordHeaders(),
      body: JSON.stringify({ recipient_id: String(discordId) })
    });

    if (!channelRes.ok) {
      const body = await channelRes.text();
      throw new Error(`Failed to create DM channel (${channelRes.status}): ${body}`);
    }

    const channelData = await channelRes.json();
    const message = [
      `NXS Streamers OTP`,
      `Hello ${username || 'there'},`,
      ``,
      `Your login code is: \`${code}\``,
      `Role: ${role}`,
      `This code expires in ${Math.round(OTP_TTL_MS / 60000)} minutes.`
    ].join('\n');

    const sendRes = await fetch(`https://discord.com/api/v10/channels/${channelData.id}/messages`, {
      method: 'POST',
      headers: discordHeaders(),
      body: JSON.stringify({ content: message })
    });

    if (!sendRes.ok) {
      const body = await sendRes.text();
      throw new Error(`Failed to send DM (${sendRes.status}): ${body}`);
    }

    return { ok: true, method: 'bot_dm' };
  } catch (error) {
    return { ok: false, method: 'bot_dm', error: error.message };
  }
}

async function sendDiscordOtpWebhook({ discordId, code, username, role }) {
  if (!DISCORD_OTP_WEBHOOK_URL) {
    return { ok: false, method: 'webhook', error: 'DISCORD_OTP_WEBHOOK_URL is not configured' };
  }

  try {
    const content = [
      `NXS Streamers OTP`,
      `User: <@${discordId}> (${username || 'Unknown'})`,
      `Role: ${role}`,
      `Code: \`${code}\``,
      `Expires in ${Math.round(OTP_TTL_MS / 60000)} minutes.`
    ].join('\n');

    const response = await fetch(DISCORD_OTP_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        username: 'NXS Streamers OTP'
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Webhook send failed (${response.status}): ${body}`);
    }

    return { ok: true, method: 'webhook' };
  } catch (error) {
    return { ok: false, method: 'webhook', error: error.message };
  }
}

async function deliverOtpToDiscord({ discordId, code, username, role }) {
  const attempts = [];

  const dmResult = await sendDiscordOtpDm({ discordId, code, username, role });
  attempts.push(dmResult);
  if (dmResult.ok) {
    console.log(`[OTP] Delivered via Discord DM to ${discordId}`);
    return dmResult;
  }
  console.warn(`[OTP] Discord DM failed for ${discordId}: ${dmResult.error}`);

  const webhookResult = await sendDiscordOtpWebhook({ discordId, code, username, role });
  attempts.push(webhookResult);
  if (webhookResult.ok) {
    console.log(`[OTP] Delivered via Discord webhook for ${discordId}`);
    return webhookResult;
  }
  console.warn(`[OTP] Discord webhook failed for ${discordId}: ${webhookResult.error}`);

  if (OTP_DEBUG) {
    console.log(`[OTP][DEBUG] ${discordId} (${role}) -> ${code}`);
    return {
      ok: true,
      method: 'debug_console',
      debugCode: code,
      attempts,
      fallbackReason: attempts.map((attempt) => `${attempt.method}: ${attempt.error}`).join(' | ')
    };
  }

  return {
    ok: false,
    method: 'none',
    error: attempts.map((attempt) => `${attempt.method}: ${attempt.error}`).join(' | ')
  };
}

function createId() {
  return crypto.randomUUID();
}

function isOwner(discordId) {
  return OWNER_IDS.has(String(discordId || ''));
}

function hasAnyAdmin(db) {
  if (OWNER_IDS.size > 0 || ADMIN_IDS.size > 0) return true;
  return (db.users || []).some((user) => user.role === 'admin');
}

async function bootstrapAdminIfNeeded(discordId) {
  if (!AUTO_BOOTSTRAP_FIRST_ADMIN || !discordId) return false;

  let bootstrapped = false;
  await store.update((db) => {
    if (hasAnyAdmin(db)) return db;
    ensureUser(db, {
      discordId,
      username: `owner-${String(discordId).slice(-4)}`,
      role: 'admin'
    });
    bootstrapped = true;
    return db;
  });

  if (bootstrapped) {
    console.log(`[NXS] Bootstrapped first admin: ${discordId}`);
  }

  return bootstrapped;
}

function seedUsersFromEnv(db) {
  const seen = new Set(db.users.map((user) => String(user.discordId)));

  for (const discordId of OWNER_IDS) {
    if (!seen.has(discordId)) {
      db.users.push({
        discordId,
        username: `owner-${discordId.slice(-4)}`,
        role: 'admin',
        whitelisted: true,
        createdAt: nowIso()
      });
      seen.add(discordId);
    }
  }

  for (const discordId of ADMIN_IDS) {
    if (!seen.has(discordId)) {
      db.users.push({
        discordId,
        username: `admin-${discordId.slice(-4)}`,
        role: 'admin',
        whitelisted: true,
        createdAt: nowIso()
      });
      seen.add(discordId);
    }
  }

  for (const discordId of USER_IDS) {
    if (!seen.has(discordId)) {
      db.users.push({
        discordId,
        username: `user-${discordId.slice(-4)}`,
        role: 'user',
        whitelisted: true,
        createdAt: nowIso()
      });
      seen.add(discordId);
    }
  }
}

function getUserRecord(db, discordId) {
  return db.users.find((user) => String(user.discordId) === String(discordId || '')) || null;
}

function getRole(db, discordId) {
  const normalized = String(discordId || '');
  if (!normalized) return 'guest';
  if (isOwner(normalized) || ADMIN_IDS.has(normalized)) return 'admin';

  const user = getUserRecord(db, normalized);
  if (user?.whitelisted === false) return 'guest';
  if (user?.role === 'admin') return 'admin';
  if (user?.role === 'user' || user?.whitelisted) return 'user';
  if (USER_IDS.has(normalized)) return 'user';
  if (ALLOW_ALL_USERS) return 'user';
  return 'guest';
}

function isAdmin(db, discordId) {
  return getRole(db, discordId) === 'admin';
}

function isWhitelistedUser(db, discordId) {
  return getRole(db, discordId) !== 'guest';
}

function canManageSchedule(db, discordId) {
  return isOwner(discordId) || (OWNER_IDS.size === 0 && isAdmin(db, discordId));
}

function ensureUser(db, { discordId, username = null, role = null }) {
  if (!discordId) return null;

  let user = getUserRecord(db, discordId);
  if (!user) {
    user = {
      discordId: String(discordId),
      username: username || `user-${String(discordId).slice(-4)}`,
      role: role || getRole(db, discordId),
      whitelisted: true,
      createdAt: nowIso()
    };
    db.users.push(user);
  } else {
    if (username) user.username = username;
    if (role) user.role = role;
    if (user.whitelisted === undefined) user.whitelisted = true;
  }

  return user;
}

function pruneTimeouts(db) {
  const now = Date.now();
  for (const [discordId, timeout] of Object.entries(db.moderation.timeouts || {})) {
    if (!timeout?.expires || new Date(timeout.expires).getTime() <= now) {
      delete db.moderation.timeouts[discordId];
    }
  }
}

function pruneOtpRequests(db) {
  const cutoff = Date.now() - OTP_TTL_MS;
  db.otpRequests = (db.otpRequests || []).filter((request) => {
    return new Date(request.createdAt).getTime() > cutoff && !request.used;
  });
}

function pruneActiveUsers(db) {
  const cutoff = Date.now() - ACTIVE_USER_TTL_MS;
  for (const [discordId, user] of Object.entries(db.activeUsers || {})) {
    if (!user?.lastSeen || new Date(user.lastSeen).getTime() <= cutoff) {
      delete db.activeUsers[discordId];
    }
  }
}

function getKnownUsers(db) {
  const users = new Map();

  for (const user of db.users || []) {
    users.set(String(user.discordId), {
      discordId: String(user.discordId),
      username: user.username || `user-${String(user.discordId).slice(-4)}`,
      role: getRole(db, user.discordId),
      whitelisted: user.whitelisted !== false,
      isOwner: isOwner(user.discordId)
    });
  }

  for (const user of Object.values(db.activeUsers || {})) {
    users.set(String(user.discordId), {
      discordId: String(user.discordId),
      username: user.username || `user-${String(user.discordId).slice(-4)}`,
      role: getRole(db, user.discordId),
      whitelisted: getRole(db, user.discordId) !== 'guest',
      isOwner: isOwner(user.discordId)
    });
  }

  for (const dashboard of Object.values(db.dashboard || {})) {
    users.set(String(dashboard.discordId), {
      discordId: String(dashboard.discordId),
      username: dashboard.username || `user-${String(dashboard.discordId).slice(-4)}`,
      role: getRole(db, dashboard.discordId),
      whitelisted: getRole(db, dashboard.discordId) !== 'guest',
      isOwner: isOwner(dashboard.discordId)
    });
  }

  return Array.from(users.values()).sort((a, b) => a.username.localeCompare(b.username));
}

function getAnnouncementRecipients(db, latest) {
  if (!latest) return [];

  const users = getKnownUsers(db).filter((user) => user.discordId !== String(latest.sentBy || ''));
  if (latest.target === 'everyone') return users;
  if (latest.target === 'admins') return users.filter((user) => user.role === 'admin');
  return users.filter((user) => user.role !== 'admin');
}

function buildChannelArray(channels = {}) {
  return Object.entries(channels).map(([channel, value]) => ({
    channel,
    duration: value.durationMs || 0,
    comments: value.comments || 0,
    lastSeen: value.lastSeen || null
  }));
}

function buildDashboardResponse(dashboard) {
  if (!dashboard) {
    return {
      discordId: null,
      username: 'Unknown',
      totalWatchTime: 0,
      totalComments: 0,
      channels: []
    };
  }

  return {
    discordId: dashboard.discordId,
    username: dashboard.username || 'Unknown',
    totalWatchTime: dashboard.totalWatchTime || 0,
    totalComments: dashboard.totalComments || 0,
    channels: Object.entries(dashboard.channels || {}).map(([slug, value]) => ({
      slug,
      watchTime: value.watchTime || 0,
      comments: value.comments || 0
    }))
  };
}

function recalculateDashboardTotals(dashboard) {
  dashboard.totalWatchTime = 0;
  dashboard.totalComments = 0;

  for (const value of Object.values(dashboard.channels || {})) {
    dashboard.totalWatchTime += value.watchTime || 0;
    dashboard.totalComments += value.comments || 0;
  }

  dashboard.lastUpdated = nowIso();
}

function ensureDashboard(db, { discordId, username }) {
  if (!db.dashboard[discordId]) {
    db.dashboard[discordId] = {
      discordId,
      username: username || `user-${String(discordId).slice(-4)}`,
      totalWatchTime: 0,
      totalComments: 0,
      channels: {},
      lastUpdated: null
    };
  }

  if (username) db.dashboard[discordId].username = username;
  return db.dashboard[discordId];
}

function emitSse(discordId, payload) {
  const bucket = sseClients.get(String(discordId || ''));
  if (!bucket || bucket.size === 0) return;

  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of bucket) {
    client.write(message);
  }
}

async function notifyClear(discordId) {
  emitSse(discordId, { type: 'clear' });
}

async function notifyAnnouncement(latest) {
  const db = await store.read();
  const recipients = getAnnouncementRecipients(db, latest);
  for (const user of recipients) {
    emitSse(user.discordId, {
      type: 'announcement',
      message: latest.message,
      timestamp: latest.timestamp,
      senderName: latest.senderName || 'Admin'
    });
  }
}

function requireAdmin(req, res, next) {
  store.read().then((db) => {
    pruneTimeouts(db);
    const adminId = req.query.adminId || req.body.adminId;
    if (!isAdmin(db, adminId)) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    req.currentDb = db;
    req.adminId = String(adminId);
    return next();
  }).catch((error) => {
    console.error('[AdminGuard] Failed:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });
}

function requireOwner(req, res, next) {
  store.read().then((db) => {
    const ownerId = req.body.ownerId || req.query.ownerId;
    if (!canManageSchedule(db, ownerId)) {
      return res.status(403).json({ success: false, error: 'Owner only' });
    }

    req.currentDb = db;
    req.ownerId = String(ownerId);
    return next();
  }).catch((error) => {
    console.error('[OwnerGuard] Failed:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });
}

app.get('/', async (_req, res) => {
  res.json({
    ok: true,
    name: 'NXS Streamers Backend',
    port: PORT,
    dataFile: dbFile
  });
});

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    status: 'online',
    service: 'NXS Streamers Backend',
    timestamp: nowIso()
  });
});

app.get('/api/check-admin', async (req, res) => {
  const discordId = String(req.query.id || '');
  await bootstrapAdminIfNeeded(discordId);
  const db = await store.read();
  res.json({ isAdmin: isAdmin(db, discordId) });
});

app.get('/api/check-owner', async (req, res) => {
  const db = await store.read();
  const discordId = String(req.query.id || '');
  res.json({ isOwner: canManageSchedule(db, discordId) });
});

app.get('/api/check-user-whitelist', async (req, res) => {
  const db = await store.read();
  const discordId = String(req.query.id || '');
  res.json({ whitelisted: isWhitelistedUser(db, discordId) });
});

app.get('/api/request-otp', async (req, res) => {
  const discordId = String(req.query.id || '');
  const db = await store.read();

  if (!isAdmin(db, discordId)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const code = generateOtpCode();
  const username = getUserRecord(db, discordId)?.username || `admin-${discordId.slice(-4)}`;
  const otpEntry = {
    id: createId(),
    discordId,
    code,
    role: 'admin',
    username,
    createdAt: nowIso(),
    used: false
  };

  await store.update((draft) => {
    pruneOtpRequests(draft);
    ensureUser(draft, { discordId, username, role: 'admin' });
    draft.otpRequests.unshift(otpEntry);
    draft.otpRequests = draft.otpRequests.slice(0, 100);
    return draft;
  });

  const delivery = await deliverOtpToDiscord({
    discordId,
    code,
    username,
    role: 'admin'
  });

  if (!delivery.ok) {
    await store.update((draft) => {
      draft.otpRequests = draft.otpRequests.filter((entry) => entry.id !== otpEntry.id);
      return draft;
    });
    return res.status(500).json({ success: false, error: delivery.error || 'Failed to deliver OTP' });
  }

  return res.json({
    success: true,
    message: `OTP delivered via ${delivery.method}`,
    deliveryMethod: delivery.method,
    ...(delivery.debugCode ? { debugCode: delivery.debugCode } : {}),
    ...(delivery.fallbackReason ? { fallbackReason: delivery.fallbackReason } : {})
  });
});

app.get('/api/request-user-otp', async (req, res) => {
  const discordId = String(req.query.id || '');
  const db = await store.read();

  if (!isWhitelistedUser(db, discordId)) {
    return res.status(403).json({ success: false, error: 'User is not whitelisted' });
  }

  const code = generateOtpCode();
  const username = getUserRecord(db, discordId)?.username || `user-${discordId.slice(-4)}`;
  const role = isAdmin(db, discordId) ? 'admin' : 'user';
  const otpEntry = {
    id: createId(),
    discordId,
    code,
    role,
    username,
    createdAt: nowIso(),
    used: false
  };

  await store.update((draft) => {
    pruneOtpRequests(draft);
    ensureUser(draft, { discordId, username, role: 'user' });
    draft.otpRequests.unshift(otpEntry);
    draft.otpRequests = draft.otpRequests.slice(0, 100);
    return draft;
  });

  const delivery = await deliverOtpToDiscord({
    discordId,
    code,
    username,
    role
  });

  if (!delivery.ok) {
    await store.update((draft) => {
      draft.otpRequests = draft.otpRequests.filter((entry) => entry.id !== otpEntry.id);
      return draft;
    });
    return res.status(500).json({ success: false, error: delivery.error || 'Failed to deliver OTP' });
  }

  return res.json({
    success: true,
    message: `OTP delivered via ${delivery.method}`,
    deliveryMethod: delivery.method,
    ...(delivery.debugCode ? { debugCode: delivery.debugCode } : {}),
    ...(delivery.fallbackReason ? { fallbackReason: delivery.fallbackReason } : {})
  });
});

app.get('/api/verify-otp', async (req, res) => {
  const discordId = String(req.query.id || '');
  const code = String(req.query.code || '');

  const db = await store.read();
  pruneOtpRequests(db);

  const request = (db.otpRequests || []).find((entry) => {
    return String(entry.discordId) === discordId && String(entry.code) === code && !entry.used;
  });

  if (!request) {
    return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
  }

  if (Date.now() - new Date(request.createdAt).getTime() > OTP_TTL_MS) {
    await store.update((draft) => {
      draft.otpRequests = draft.otpRequests.filter((entry) => entry.id !== request.id);
      return draft;
    });
    return res.status(400).json({ success: false, error: 'OTP expired' });
  }

  const role = request.role === 'admin' || isAdmin(db, discordId) ? 'admin' : 'user';
  const username = request.username || `${role}-${discordId.slice(-4)}`;

  await store.update((draft) => {
    draft.otpRequests = draft.otpRequests.filter((entry) => entry.id !== request.id);
    ensureUser(draft, { discordId, username, role });
    return draft;
  });

  return res.json({
    success: true,
    role,
    username
  });
});

app.get('/api/check-ban', async (req, res) => {
  const db = await store.read();
  const discordId = String(req.query.id || '');
  const ban = db.moderation.bans?.[discordId];
  if (!ban) return res.json({ banned: false });
  return res.json({ banned: true, ...ban });
});

app.get('/api/check-timeout', async (req, res) => {
  const discordId = String(req.query.id || '');

  const db = await store.update((draft) => {
    pruneTimeouts(draft);
    return draft;
  });

  const timeout = db.moderation.timeouts?.[discordId];
  if (!timeout) return res.json({ timedout: false });
  return res.json({ timedout: true, ...timeout });
});

app.get('/api/check-whitelist', async (req, res) => {
  const db = await store.read();
  const requestedUrl = String(req.query.url || '');
  const allowedList = [...DEFAULT_ALLOWED_URLS, ...(db.urlWhitelist || [])];

  if (allowedList.length === 0) {
    return res.json({ allowed: true });
  }

  return res.json({
    allowed: allowedList.some((pattern) => matchesAllowedUrl(requestedUrl, pattern))
  });
});

app.post('/api/notify-whitelist-error', async (req, res) => {
  const userId = String(req.query.id || req.body.id || '');
  const url = String(req.query.url || req.body.url || '');

  await store.update((draft) => {
    draft.whitelistErrors.unshift({
      id: createId(),
      userId,
      url,
      timestamp: nowIso()
    });
    draft.whitelistErrors = draft.whitelistErrors.slice(0, 200);
    return draft;
  });

  res.json({ success: true });
});

app.get('/api/global-schedule', async (_req, res) => {
  const db = await store.read();
  res.json(db.schedule || { enabled: false, rules: [] });
});

app.post('/api/owner/update-schedule', requireOwner, async (req, res) => {
  const enabled = Boolean(req.body.enabled);
  const rules = Array.isArray(req.body.rules) ? req.body.rules : [];

  const db = await store.update((draft) => {
    draft.schedule = {
      enabled,
      rules
    };
    return draft;
  });

  res.json({ success: true, schedule: db.schedule });
});

app.post('/api/owner/user-access', requireOwner, async (req, res) => {
  const targetDiscordId = String(req.body.targetDiscordId || '').trim();
  const targetUsername = String(req.body.targetUsername || req.body.username || '').trim();
  const requestedRole = String(req.body.role || 'user').trim().toLowerCase();
  const whitelisted = req.body.whitelisted !== undefined ? Boolean(req.body.whitelisted) : true;

  if (!targetDiscordId) {
    return res.status(400).json({ success: false, error: 'targetDiscordId is required' });
  }

  if (!['admin', 'user'].includes(requestedRole)) {
    return res.status(400).json({ success: false, error: 'role must be admin or user' });
  }

  if (isOwner(targetDiscordId) && (requestedRole !== 'admin' || whitelisted === false)) {
    return res.status(400).json({ success: false, error: 'Owner access cannot be downgraded' });
  }

  const db = await store.update((draft) => {
    const user = ensureUser(draft, {
      discordId: targetDiscordId,
      username: targetUsername || null,
      role: requestedRole
    });

    user.role = requestedRole;
    user.whitelisted = whitelisted;
    if (targetUsername) user.username = targetUsername;

    draft.otpRequests = (draft.otpRequests || []).filter((entry) => String(entry.discordId) !== targetDiscordId);

    if (draft.activeUsers?.[targetDiscordId]) {
      if (whitelisted === false) {
        delete draft.activeUsers[targetDiscordId];
      } else {
        draft.activeUsers[targetDiscordId].role = getRole(draft, targetDiscordId);
        if (targetUsername) draft.activeUsers[targetDiscordId].username = targetUsername;
      }
    }

    return draft;
  });

  const updatedUser = getKnownUsers(db).find((user) => user.discordId === targetDiscordId) || {
    discordId: targetDiscordId,
    username: targetUsername || `user-${targetDiscordId.slice(-4)}`,
    role: requestedRole,
    whitelisted,
    isOwner: isOwner(targetDiscordId)
  };

  res.json({ success: true, user: updatedUser });
});

app.post('/api/heartbeat', async (req, res) => {
  const {
    discordId = 'guest',
    username = 'Guest',
    action = 'idle',
    channel = null,
    comment = null,
    duration = 0,
    status = 'Active'
  } = req.body || {};

  if (!discordId || discordId === 'guest') {
    return res.json({ success: true, guest: true });
  }

  await store.update((draft) => {
    pruneActiveUsers(draft);
    pruneTimeouts(draft);
    ensureUser(draft, { discordId, username, role: getRole(draft, discordId) });

    const activeUser = draft.activeUsers[discordId] || {
      discordId,
      username,
      role: getRole(draft, discordId),
      ip: req.ip,
      status,
      lastSeen: nowIso(),
      channels: {}
    };

    activeUser.username = username || activeUser.username;
    activeUser.role = getRole(draft, discordId);
    activeUser.ip = req.ip;
    activeUser.status = status;
    activeUser.lastSeen = nowIso();

    if (channel) {
      if (!activeUser.channels[channel]) {
        activeUser.channels[channel] = {
          durationMs: 0,
          comments: 0,
          lastSeen: nowIso()
        };
      }

      activeUser.channels[channel].lastSeen = nowIso();
      if (action === 'watch' && Number(duration) > 0) {
        activeUser.channels[channel].durationMs += Number(duration) * 1000;
      }
      if (action === 'comment') {
        activeUser.channels[channel].comments += 1;
      }
    }

    draft.activeUsers[discordId] = activeUser;

    if (action === 'comment' || action === 'watch') {
      draft.logs.unshift({
        id: createId(),
        discordId,
        username,
        action,
        channel,
        comment,
        duration: Number(duration) || 0,
        timestamp: nowIso()
      });
      draft.logs = draft.logs.slice(0, 1000);
    }

    return draft;
  });

  res.json({ success: true });
});

app.post('/api/dashboard/update', async (req, res) => {
  const { discordId, username, channel, comments = 0, watchTime = 0 } = req.body || {};
  if (!discordId || !channel) return res.status(400).json({ success: false, error: 'discordId and channel are required' });

  const db = await store.update((draft) => {
    ensureUser(draft, { discordId, username, role: getRole(draft, discordId) });
    const dashboard = ensureDashboard(draft, { discordId, username });

    if (!dashboard.channels[channel]) {
      dashboard.channels[channel] = { watchTime: 0, comments: 0 };
    }

    dashboard.channels[channel].watchTime += Number(watchTime) || 0;
    dashboard.channels[channel].comments += Number(comments) || 0;
    recalculateDashboardTotals(dashboard);
    return draft;
  });

  res.json({ success: true, dashboard: buildDashboardResponse(db.dashboard[discordId]) });
});

app.post('/api/dashboard/sync', async (req, res) => {
  const { discordId, username, channel, watchTime = 0, comments = 0 } = req.body || {};
  if (!discordId || !channel) return res.status(400).json({ success: false, error: 'discordId and channel are required' });

  const db = await store.update((draft) => {
    ensureUser(draft, { discordId, username, role: getRole(draft, discordId) });
    const dashboard = ensureDashboard(draft, { discordId, username });

    if (!dashboard.channels[channel]) {
      dashboard.channels[channel] = { watchTime: 0, comments: 0 };
    }

    dashboard.channels[channel].watchTime = Math.max(dashboard.channels[channel].watchTime || 0, Number(watchTime) || 0);
    dashboard.channels[channel].comments = Math.max(dashboard.channels[channel].comments || 0, Number(comments) || 0);
    recalculateDashboardTotals(dashboard);
    return draft;
  });

  res.json({ success: true, dashboard: buildDashboardResponse(db.dashboard[discordId]) });
});

app.get('/api/admin/active-users', requireAdmin, async (_req, res) => {
  const db = await store.update((draft) => {
    pruneActiveUsers(draft);
    pruneTimeouts(draft);
    return draft;
  });

  const users = Object.values(db.activeUsers || {})
    .filter((user) => !db.moderation.bans?.[user.discordId])
    .filter((user) => !db.moderation.timeouts?.[user.discordId])
    .map((user) => ({
      discordId: user.discordId,
      username: user.username,
      role: user.role,
      whitelisted: getRole(db, user.discordId) !== 'guest',
      isOwner: isOwner(user.discordId),
      ip: user.ip,
      status: user.status,
      lastSeen: user.lastSeen,
      channelStats: buildChannelArray(user.channels)
    }))
    .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

  res.json(users);
});

app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  const db = await store.read();
  res.json(getKnownUsers(db));
});

app.get('/api/admin/user-logs', requireAdmin, async (req, res) => {
  const db = await store.read();
  const requestedUserId = String(req.query.userId || req.adminId);
  const logs = (db.logs || [])
    .filter((entry) => String(entry.discordId) === requestedUserId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json(logs);
});

app.get('/api/admin/user-dashboard', requireAdmin, async (req, res) => {
  const userId = String(req.query.userId || '');
  const db = await store.read();
  const dashboard = db.dashboard?.[userId];
  res.json(buildDashboardResponse(dashboard));
});

app.get('/api/admin/bans', requireAdmin, async (_req, res) => {
  const db = await store.read();
  res.json(db.moderation.bans || {});
});

app.get('/api/admin/timeouts', requireAdmin, async (_req, res) => {
  const db = await store.update((draft) => {
    pruneTimeouts(draft);
    return draft;
  });
  res.json(db.moderation.timeouts || {});
});

app.get('/api/admin/kicks', requireAdmin, async (_req, res) => {
  const db = await store.read();
  res.json(db.moderation.kicks || {});
});

app.post('/api/admin/moderate', requireAdmin, async (req, res) => {
  const { targetIp, type, reason = 'Moderated by admin', duration = 60, moderatorDiscord } = req.body || {};
  const db = await store.read();
  const target = Object.values(db.activeUsers || {}).find((user) => user.ip === targetIp);

  if (!target) {
    return res.status(404).json({ success: false, error: 'Active user not found for the given IP' });
  }

  if (type === 'kick') {
    await store.update((draft) => {
      draft.moderation.kicks[target.discordId] = {
        type: 'kick',
        moderatorDiscord: moderatorDiscord || req.adminId,
        adminId: req.adminId,
        reason,
        createdAt: nowIso()
      };
      delete draft.activeUsers[target.discordId];
      return draft;
    });

    return res.json({ success: true });
  }

  if (type === 'ban') {
    await store.update((draft) => {
      draft.moderation.bans[target.discordId] = {
        type: 'ban',
        reason,
        moderatorDiscord: moderatorDiscord || req.adminId,
        adminId: req.adminId,
        createdAt: nowIso()
      };
      delete draft.activeUsers[target.discordId];
      return draft;
    });
    emitSse(target.discordId, { type: 'ban', reason, moderatorDiscord: moderatorDiscord || req.adminId });
    return res.json({ success: true });
  }

  if (type === 'timeout') {
    const expires = new Date(Date.now() + Number(duration || 60) * 60 * 1000).toISOString();
    await store.update((draft) => {
      draft.moderation.timeouts[target.discordId] = {
        type: 'timeout',
        reason,
        moderatorDiscord: moderatorDiscord || req.adminId,
        adminId: req.adminId,
        expires,
        createdAt: nowIso()
      };
      delete draft.activeUsers[target.discordId];
      return draft;
    });
    emitSse(target.discordId, { type: 'timeout', reason, moderatorDiscord: moderatorDiscord || req.adminId, expires });
    return res.json({ success: true });
  }

  return res.status(400).json({ success: false, error: 'Unsupported moderation type' });
});

app.post('/api/admin/ban', requireAdmin, async (req, res) => {
  const { targetDiscordId, reason = 'Banned by admin', moderatorDiscord } = req.body || {};
  if (!targetDiscordId) return res.status(400).json({ success: false, error: 'targetDiscordId is required' });

  await store.update((draft) => {
    draft.moderation.bans[targetDiscordId] = {
      type: 'ban',
      reason,
      moderatorDiscord: moderatorDiscord || req.adminId,
      adminId: req.adminId,
      createdAt: nowIso()
    };
    delete draft.activeUsers[targetDiscordId];
    return draft;
  });

  emitSse(targetDiscordId, { type: 'ban', reason, moderatorDiscord: moderatorDiscord || req.adminId });
  res.json({ success: true });
});

app.post('/api/admin/timeout', requireAdmin, async (req, res) => {
  const {
    targetDiscordId,
    durationMinutes = 60,
    reason = 'Timed out by admin',
    moderatorDiscord
  } = req.body || {};

  if (!targetDiscordId) return res.status(400).json({ success: false, error: 'targetDiscordId is required' });
  const expires = new Date(Date.now() + Number(durationMinutes) * 60 * 1000).toISOString();

  await store.update((draft) => {
    draft.moderation.timeouts[targetDiscordId] = {
      type: 'timeout',
      reason,
      moderatorDiscord: moderatorDiscord || req.adminId,
      adminId: req.adminId,
      expires,
      createdAt: nowIso()
    };
    delete draft.activeUsers[targetDiscordId];
    return draft;
  });

  emitSse(targetDiscordId, { type: 'timeout', reason, moderatorDiscord: moderatorDiscord || req.adminId, expires });
  res.json({ success: true });
});

app.post('/api/admin/unban', requireAdmin, async (req, res) => {
  const { targetDiscordId } = req.body || {};
  if (!targetDiscordId) return res.status(400).json({ success: false, error: 'targetDiscordId is required' });

  await store.update((draft) => {
    delete draft.moderation.bans[targetDiscordId];
    return draft;
  });

  await notifyClear(targetDiscordId);
  res.json({ success: true });
});

app.post('/api/admin/remove-timeout', requireAdmin, async (req, res) => {
  const { targetDiscordId } = req.body || {};
  if (!targetDiscordId) return res.status(400).json({ success: false, error: 'targetDiscordId is required' });

  await store.update((draft) => {
    delete draft.moderation.timeouts[targetDiscordId];
    return draft;
  });

  await notifyClear(targetDiscordId);
  res.json({ success: true });
});

app.post('/api/admin/announcement', requireAdmin, async (req, res) => {
  const { message, target = 'users', senderName = 'Admin' } = req.body || {};
  if (!message) return res.status(400).json({ success: false, error: 'message is required' });

  const latest = {
    message,
    target,
    senderName,
    sentBy: req.adminId,
    timestamp: nowIso()
  };

  await store.update((draft) => {
    draft.announcements.latest = latest;
    draft.announcements.confirmations = [];
    return draft;
  });

  await notifyAnnouncement(latest);
  res.json({ success: true, announcement: latest });
});

app.get('/api/announcement/latest', async (_req, res) => {
  const db = await store.read();
  res.json(db.announcements?.latest || {});
});

app.post('/api/announcement/confirm', async (req, res) => {
  const { userId, username = 'Unknown', timestamp = null } = req.body || {};
  if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

  await store.update((draft) => {
    const latest = draft.announcements.latest;
    if (!latest) return draft;
    if (timestamp && latest.timestamp !== timestamp) return draft;

    ensureUser(draft, { discordId: userId, username, role: getRole(draft, userId) });

    const exists = (draft.announcements.confirmations || []).some((entry) => entry.userId === userId);
    if (!exists) {
      draft.announcements.confirmations.push({
        userId,
        username,
        timestamp: nowIso()
      });
    }
    return draft;
  });

  res.json({ success: true });
});

app.get('/api/announcement/confirmations', requireAdmin, async (_req, res) => {
  const db = await store.read();
  const latest = db.announcements?.latest;
  if (!latest) {
    return res.json({ confirmations: [], pending: [] });
  }

  const recipients = getAnnouncementRecipients(db, latest);
  const confirmedMap = new Map(
    (db.announcements.confirmations || []).map((entry) => [String(entry.userId), entry])
  );

  const confirmations = recipients
    .filter((user) => confirmedMap.has(user.discordId))
    .map((user) => ({
      userId: user.discordId,
      username: confirmedMap.get(user.discordId)?.username || user.username
    }));

  const pending = recipients
    .filter((user) => !confirmedMap.has(user.discordId))
    .map((user) => ({
      userId: user.discordId,
      username: user.username
    }));

  res.json({ confirmations, pending });
});

app.post('/api/log-action', async (req, res) => {
  const { userId, action = 'SYSTEM', description = '', timestamp = nowIso() } = req.body || {};
  if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

  await store.update((draft) => {
    draft.actionLogs.unshift({
      id: createId(),
      userId,
      action,
      description,
      timestamp
    });
    draft.actionLogs = draft.actionLogs.slice(0, 500);
    return draft;
  });

  res.json({ success: true });
});

app.get('/api/sse/moderation', async (req, res) => {
  const discordId = String(req.query.id || '');
  if (!discordId) return res.status(400).json({ success: false, error: 'id is required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sseClients.has(discordId)) sseClients.set(discordId, new Set());
  sseClients.get(discordId).add(res);

  const heartbeat = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const bucket = sseClients.get(discordId);
    if (!bucket) return;
    bucket.delete(res);
    if (bucket.size === 0) sseClients.delete(discordId);
  });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

async function bootstrap() {
  await store.update((db) => {
    seedUsersFromEnv(db);
    pruneOtpRequests(db);
    pruneTimeouts(db);
    pruneActiveUsers(db);
    return db;
  });

  app.listen(PORT, () => {
    console.log(`[NXS] Backend running on http://localhost:${PORT}`);
    console.log(`[NXS] Data file: ${dbFile}`);
    console.log(`[NXS] Owners configured: ${OWNER_IDS.size}`);
    console.log(`[NXS] Admins configured: ${ADMIN_IDS.size}`);
    console.log(`[NXS] Allow all users: ${ALLOW_ALL_USERS}`);
    console.log(`[NXS] OTP debug mode: ${OTP_DEBUG}`);
    console.log(`[NXS] Auto bootstrap first admin: ${AUTO_BOOTSTRAP_FIRST_ADMIN}`);
    console.log(`[NXS] Discord bot configured: ${Boolean(DISCORD_BOT_TOKEN)}`);
    console.log(`[NXS] Discord webhook configured: ${Boolean(DISCORD_OTP_WEBHOOK_URL)}`);
  });
}

bootstrap().catch((error) => {
  console.error('[NXS] Failed to start backend:', error);
  process.exit(1);
});
