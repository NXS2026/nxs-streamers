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

function normalizeIdentity(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeKickUsername(value = '') {
  return String(value || '').trim().replace(/^@+/, '');
}

function isValidEmail(value = '') {
  const normalized = normalizeIdentity(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function isEmailIdentity(value = '') {
  return isValidEmail(value);
}

function isReservedTestEmail(value = '') {
  const normalized = normalizeIdentity(value);
  return normalized.endsWith('@example.com') || normalized.endsWith('@example.org') || normalized.endsWith('@example.net');
}

function parseIdSet(raw = '') {
  return new Set(parseList(raw).map(normalizeIdentity).filter((value) => value && isValidEmail(value)));
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

function getGeneratedUsername(discordId, prefix = 'user') {
  const normalizedId = normalizeIdentity(discordId);
  const emailLocalPart = normalizedId.split('@')[0]?.replace(/[^a-z0-9._-]/gi, '').slice(0, 24);
  return emailLocalPart || `${prefix}-${normalizedId.slice(-4) || 'user'}`;
}

function isGeneratedUsername(username, discordId) {
  const value = String(username || '').trim();
  if (!value) return true;

  const suffix = String(discordId || '').slice(-4);
  return value === `owner-${suffix}` || value === `admin-${suffix}` || value === `user-${suffix}`;
}

function discordHeaders() {
  return {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

function formatDiscordDisplayName(profile = {}) {
  const username = String(profile.username || '').trim();
  const globalName = String(profile.global_name || '').trim();

  if (globalName && username && globalName !== username) {
    return `${globalName} (@${username})`;
  }

  return globalName || username || null;
}

async function fetchDiscordProfile(discordId) {
  if (!DISCORD_BOT_TOKEN || !discordId) return null;

  try {
    const response = await fetch(`https://discord.com/api/v10/users/${encodeURIComponent(String(discordId))}`, {
      method: 'GET',
      headers: discordHeaders()
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Discord profile lookup failed (${response.status}): ${body}`);
    }

    return response.json();
  } catch (error) {
    console.warn(`[Discord] Failed to fetch profile for ${discordId}:`, error.message);
    return null;
  }
}

async function resolveDiscordUsername({ db, discordId, preferredUsername = '', fallbackPrefix = 'user' }) {
  const preferred = String(preferredUsername || '').trim();
  if (preferred && !isGeneratedUsername(preferred, discordId)) {
    return preferred;
  }

  const storedUsername = String(getUserRecord(db, discordId)?.username || '').trim();
  if (storedUsername && !isGeneratedUsername(storedUsername, discordId)) {
    return storedUsername;
  }

  const profile = await fetchDiscordProfile(discordId);
  const profileName = formatDiscordDisplayName(profile);
  if (profileName) {
    return profileName;
  }

  return preferred || storedUsername || getGeneratedUsername(discordId, fallbackPrefix);
}

async function sendDiscordDirectMessage({ discordId, content }) {
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
    const sendRes = await fetch(`https://discord.com/api/v10/channels/${channelData.id}/messages`, {
      method: 'POST',
      headers: discordHeaders(),
      body: JSON.stringify({ content })
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

async function sendDiscordOtpDm({ discordId, code, username, role }) {
  const message = [
    `NXS Streamers OTP`,
    `Hello ${username || 'there'},`,
    ``,
    `Your login code is: \`${code}\``,
    `Role: ${role}`,
    `This code expires in ${Math.round(OTP_TTL_MS / 60000)} minutes.`
  ].join('\n');

  return sendDiscordDirectMessage({ discordId, content: message });
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

async function sendSecurityAlertWebhook(content) {
  if (!DISCORD_OTP_WEBHOOK_URL) {
    return { ok: false, method: 'webhook', error: 'DISCORD_OTP_WEBHOOK_URL is not configured' };
  }

  try {
    const response = await fetch(DISCORD_OTP_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        username: 'NXS Security Alert'
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

async function deliverSecurityAlertToDiscord(alert) {
  const lines = [
    `NXS Streamers Security Alert`,
    `Type: ${alert.type || 'tamper_detected'}`,
    `Extension: ${alert.extensionName || 'NXS Streamers'} v${alert.version || 'unknown'}`,
    `Extension ID: ${alert.extensionId || 'unknown'}`,
    `Build: ${alert.buildType || 'unknown'}`,
    `Detected: ${alert.detectedAt || nowIso()}`,
    `User ID: ${alert.userDiscordId || 'unknown'}`,
    `Files: ${(alert.files || []).map((file) => file.path).join(', ') || 'unknown'}`
  ];

  if (alert.reason) {
    lines.push(`Reason: ${alert.reason}`);
  }

  const content = lines.join('\n');
  const ownerIds = Array.from(OWNER_IDS);
  const attempts = [];

  for (const ownerId of ownerIds) {
    const result = await sendDiscordDirectMessage({ discordId: ownerId, content });
    attempts.push({ ownerId, ...result });
    if (result.ok) {
      return { ok: true, method: 'bot_dm', ownerId, attempts };
    }
  }

  const webhookResult = await sendSecurityAlertWebhook(content);
  attempts.push({ ownerId: null, ...webhookResult });
  if (webhookResult.ok) {
    return { ok: true, method: 'webhook', attempts };
  }

  return {
    ok: false,
    method: 'none',
    error: attempts.map((attempt) => `${attempt.method}${attempt.ownerId ? `:${attempt.ownerId}` : ''}: ${attempt.error}`).join(' | '),
    attempts
  };
}

function createId() {
  return crypto.randomUUID();
}

function isOwner(discordId) {
  return OWNER_IDS.has(normalizeIdentity(discordId));
}

function isStoredOwner(db, discordId) {
  const user = getUserRecord(db, discordId);
  return user?.owner === true;
}

function isEffectiveOwner(db, discordId) {
  return isOwner(discordId) || isStoredOwner(db, discordId);
}

function hasAnyAdmin(db) {
  if (OWNER_IDS.size > 0 || ADMIN_IDS.size > 0) return true;
  return (db.users || []).some((user) => user.role === 'admin');
}

function hasAnyEmailScopedAdmin(db) {
  if (OWNER_IDS.size > 0 || ADMIN_IDS.size > 0) return true;
  return (db.users || []).some((user) => isEmailIdentity(user.discordId) && user.role === 'admin' && user.whitelisted !== false);
}

function hasAnyEmailScopedOwner(db) {
  if (OWNER_IDS.size > 0) return true;
  return (db.users || []).some((user) => isEmailIdentity(user.discordId) && user.owner === true && user.whitelisted !== false);
}

function hasAnyEmailScopedIdentity(db) {
  if (OWNER_IDS.size > 0 || ADMIN_IDS.size > 0 || USER_IDS.size > 0) return true;
  return (db.users || []).some((user) => isEmailIdentity(user.discordId));
}

async function bootstrapAdminIfNeeded(discordId) {
  const normalizedId = normalizeIdentity(discordId);
  if (!AUTO_BOOTSTRAP_FIRST_ADMIN || !normalizedId) return false;

  let bootstrapped = false;
  await store.update((db) => {
    if (hasAnyAdmin(db)) return db;
    const user = ensureUser(db, {
      discordId: normalizedId,
      username: getGeneratedUsername(normalizedId, 'owner'),
      role: 'admin'
    });
    if (user) user.owner = true;
    bootstrapped = true;
    return db;
  });

  if (bootstrapped) {
    console.log(`[NXS] Bootstrapped first admin: ${normalizedId}`);
  }

  return bootstrapped;
}

async function bootstrapEmailAdminForMigrationIfNeeded(discordId) {
  const normalizedId = normalizeIdentity(discordId);
  if (!normalizedId || !isEmailIdentity(normalizedId)) return false;

  let bootstrapped = false;
  await store.update((db) => {
    const hasEmailAdmin = hasAnyEmailScopedAdmin(db);
    const hasEmailIdentity = hasAnyEmailScopedIdentity(db);
    const shouldBootstrap = AUTO_BOOTSTRAP_FIRST_ADMIN
      ? !hasEmailAdmin
      : (!hasEmailAdmin && !hasEmailIdentity);

    if (!shouldBootstrap) return db;

    const user = ensureUser(db, {
      discordId: normalizedId,
      username: getGeneratedUsername(normalizedId, 'owner'),
      role: 'admin'
    });
    if (user) user.owner = true;
    bootstrapped = true;
    return db;
  });

  if (bootstrapped) {
    console.log(`[NXS] Bootstrapped email admin for migration: ${normalizedId}`);
  }

  return bootstrapped;
}

function seedUsersFromEnv(db) {
  const seen = new Set(db.users.map((user) => normalizeIdentity(user.discordId)));

  for (const discordId of OWNER_IDS) {
    if (!seen.has(discordId)) {
      db.users.push({
        discordId,
        username: getGeneratedUsername(discordId, 'owner'),
        role: 'admin',
        owner: true,
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
        username: getGeneratedUsername(discordId, 'admin'),
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
        username: getGeneratedUsername(discordId, 'user'),
        role: 'user',
        whitelisted: true,
        createdAt: nowIso()
      });
      seen.add(discordId);
    }
  }
}

function getUserRecord(db, discordId) {
  const normalizedId = normalizeIdentity(discordId);
  return db.users.find((user) => normalizeIdentity(user.discordId) === normalizedId) || null;
}

function getRole(db, discordId) {
  const normalized = normalizeIdentity(discordId);
  if (!normalized) return 'guest';
  if (isEffectiveOwner(db, normalized) || ADMIN_IDS.has(normalized)) return 'admin';

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

function getRoleRank(db, discordId) {
  const normalized = normalizeIdentity(discordId);
  if (!normalized) return 0;
  if (isEffectiveOwner(db, normalized)) return 3;

  const role = getRole(db, normalized);
  if (role === 'admin') return 2;
  if (role === 'user') return 1;
  return 0;
}

function canApplyRestrictedModeration(db, actorDiscordId, targetDiscordId) {
  const actorRank = getRoleRank(db, actorDiscordId);
  const targetRank = getRoleRank(db, targetDiscordId);

  if (actorRank >= 2) return targetRank < 3;
  if (actorRank === 1) return targetRank < 2;
  return false;
}

function isWhitelistedUser(db, discordId) {
  return getRole(db, discordId) !== 'guest';
}

function canManageSchedule(db, discordId) {
  const normalizedId = normalizeIdentity(discordId);
  if (isEffectiveOwner(db, normalizedId)) return true;
  return OWNER_IDS.size === 0 && !hasAnyEmailScopedOwner(db) && isAdmin(db, normalizedId);
}

function ensureUser(db, { discordId, username = null, role = null }) {
  const normalizedId = normalizeIdentity(discordId);
  const normalizedUsername = normalizeKickUsername(username);
  if (!normalizedId) return null;

  let user = getUserRecord(db, normalizedId);
  if (!user) {
    user = {
      discordId: normalizedId,
      username: normalizedUsername || getGeneratedUsername(normalizedId, 'user'),
      role: role || getRole(db, normalizedId),
      owner: false,
      whitelisted: true,
      createdAt: nowIso()
    };
    db.users.push(user);
  } else {
    user.discordId = normalizedId;
    if (normalizedUsername) user.username = normalizedUsername;
    if (role) user.role = role;
    if (user.owner === undefined) user.owner = false;
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

function pruneReservedTestIdentities(db) {
  db.users = (db.users || []).filter((user) => !isReservedTestEmail(user.discordId));
  db.otpRequests = (db.otpRequests || []).filter((entry) => !isReservedTestEmail(entry.discordId));
  db.logs = (db.logs || []).filter((entry) => !isReservedTestEmail(entry.discordId));
  db.actionLogs = (db.actionLogs || []).filter((entry) => !isReservedTestEmail(entry.userId));
  db.announcements.confirmations = (db.announcements?.confirmations || []).filter((entry) => !isReservedTestEmail(entry.userId));
  db.whitelistErrors = (db.whitelistErrors || []).filter((entry) => !isReservedTestEmail(entry.userId));
  db.securityAlerts = (db.securityAlerts || []).filter((entry) => !isReservedTestEmail(entry.userDiscordId));

  for (const key of Object.keys(db.activeUsers || {})) {
    if (isReservedTestEmail(key)) delete db.activeUsers[key];
  }

  for (const key of Object.keys(db.dashboard || {})) {
    if (isReservedTestEmail(key)) delete db.dashboard[key];
  }

  for (const key of Object.keys(db.moderation?.bans || {})) {
    if (isReservedTestEmail(key)) delete db.moderation.bans[key];
  }

  for (const key of Object.keys(db.moderation?.timeouts || {})) {
    if (isReservedTestEmail(key)) delete db.moderation.timeouts[key];
  }

  for (const key of Object.keys(db.moderation?.kicks || {})) {
    if (isReservedTestEmail(key)) delete db.moderation.kicks[key];
  }
}

function getKnownUsers(db) {
  const users = new Map();

  for (const user of db.users || []) {
    const normalizedId = normalizeIdentity(user.discordId);
    if (!isEmailIdentity(normalizedId)) continue;
    users.set(normalizedId, {
      discordId: normalizedId,
      username: user.username || getGeneratedUsername(normalizedId, 'user'),
      role: getRole(db, user.discordId),
      whitelisted: user.whitelisted !== false,
      isOwner: isEffectiveOwner(db, user.discordId)
    });
  }

  for (const user of Object.values(db.activeUsers || {})) {
    const normalizedId = normalizeIdentity(user.discordId);
    if (!isEmailIdentity(normalizedId)) continue;
    users.set(normalizedId, {
      discordId: normalizedId,
      username: user.username || getGeneratedUsername(normalizedId, 'user'),
      role: getRole(db, user.discordId),
      whitelisted: getRole(db, user.discordId) !== 'guest',
      isOwner: isEffectiveOwner(db, user.discordId)
    });
  }

  for (const dashboard of Object.values(db.dashboard || {})) {
    const normalizedId = normalizeIdentity(dashboard.discordId);
    if (!isEmailIdentity(normalizedId)) continue;
    users.set(normalizedId, {
      discordId: normalizedId,
      username: dashboard.username || getGeneratedUsername(normalizedId, 'user'),
      role: getRole(db, dashboard.discordId),
      whitelisted: getRole(db, dashboard.discordId) !== 'guest',
      isOwner: isEffectiveOwner(db, dashboard.discordId)
    });
  }

  return Array.from(users.values()).sort((a, b) => a.username.localeCompare(b.username));
}

function getAnnouncementRecipients(db, latest) {
  if (!latest) return [];

  const sentBy = normalizeIdentity(latest.sentBy || '');
  const users = getKnownUsers(db).filter((user) => user.discordId !== sentBy);
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
  const normalizedId = normalizeIdentity(discordId);
  const normalizedUsername = normalizeKickUsername(username);
  if (!normalizedId) return null;

  if (!db.dashboard[normalizedId]) {
    db.dashboard[normalizedId] = {
      discordId: normalizedId,
      username: normalizedUsername || getGeneratedUsername(normalizedId, 'user'),
      totalWatchTime: 0,
      totalComments: 0,
      channels: {},
      lastUpdated: null
    };
  }

  if (normalizedUsername) db.dashboard[normalizedId].username = normalizedUsername;
  return db.dashboard[normalizedId];
}

function emitSse(discordId, payload) {
  const bucket = sseClients.get(normalizeIdentity(discordId));
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
    const adminId = normalizeIdentity(req.query.adminId || req.body.adminId);
    if (!isAdmin(db, adminId)) {
      return res.status(403).json({ success: false, error: 'Admin only' });
    }

    req.currentDb = db;
    req.adminId = adminId;
    return next();
  }).catch((error) => {
    console.error('[AdminGuard] Failed:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });
}

function requireOwner(req, res, next) {
  store.read().then((db) => {
    const ownerId = normalizeIdentity(req.body.ownerId || req.query.ownerId);
    if (!canManageSchedule(db, ownerId)) {
      return res.status(403).json({ success: false, error: 'Owner only' });
    }

    req.currentDb = db;
    req.ownerId = ownerId;
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
  const discordId = normalizeIdentity(req.query.id || '');
  await bootstrapAdminIfNeeded(discordId);
  const db = await store.read();
  res.json({ isAdmin: isAdmin(db, discordId) });
});

app.get('/api/check-owner', async (req, res) => {
  const db = await store.read();
  const discordId = normalizeIdentity(req.query.id || '');
  res.json({ isOwner: canManageSchedule(db, discordId) });
});

app.get('/api/check-user-whitelist', async (req, res) => {
  const db = await store.read();
  const discordId = normalizeIdentity(req.query.id || '');
  res.json({ whitelisted: isWhitelistedUser(db, discordId) });
});

app.post('/api/login', async (req, res) => {
  const email = normalizeIdentity(req.body.email || req.body.id || '');
  const kickUsername = normalizeKickUsername(req.body.kickUsername || req.body.username || '');

  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
  }

  if (isReservedTestEmail(email)) {
    return res.status(400).json({ success: false, error: 'Reserved test emails are not allowed' });
  }

  if (!kickUsername) {
    return res.status(400).json({ success: false, error: 'Kick username is required' });
  }

  await bootstrapAdminIfNeeded(email);
  await bootstrapEmailAdminForMigrationIfNeeded(email);

  const db = await store.update((draft) => {
    pruneTimeouts(draft);
    return draft;
  });

  const ban = db.moderation.bans?.[email];
  if (ban) {
    return res.status(403).json({
      success: false,
      error: 'This email is banned from opening the app',
      moderationType: 'ban',
      ...ban
    });
  }

  const timeout = db.moderation.timeouts?.[email];
  if (timeout) {
    return res.status(403).json({
      success: false,
      error: 'This email is temporarily blocked from opening the app',
      moderationType: 'timeout',
      ...timeout
    });
  }

  if (!isWhitelistedUser(db, email)) {
    return res.status(403).json({ success: false, error: 'This email is not allowed to log in' });
  }

  const role = isAdmin(db, email) ? 'admin' : 'user';
  const updatedDb = await store.update((draft) => {
    const user = ensureUser(draft, { discordId: email, username: kickUsername, role });
    if (user) user.username = kickUsername;

    const dashboard = ensureDashboard(draft, { discordId: email, username: kickUsername });
    if (dashboard) dashboard.username = kickUsername;

    if (draft.activeUsers?.[email]) {
      draft.activeUsers[email].username = kickUsername;
      draft.activeUsers[email].role = role;
    }

    return draft;
  });

  return res.json({
    success: true,
    email,
    username: kickUsername,
    kickUsername,
    role: getRole(updatedDb, email),
    isOwner: canManageSchedule(updatedDb, email)
  });
});

app.get('/api/request-otp', async (req, res) => {
  const discordId = normalizeIdentity(req.query.id || '');
  const db = await store.read();

  if (!isAdmin(db, discordId)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }

  const code = generateOtpCode();
  const username = await resolveDiscordUsername({
    db,
    discordId,
    preferredUsername: getUserRecord(db, discordId)?.username,
    fallbackPrefix: 'admin'
  });
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
  const discordId = normalizeIdentity(req.query.id || '');
  const db = await store.read();

  if (!isWhitelistedUser(db, discordId)) {
    return res.status(403).json({ success: false, error: 'User is not whitelisted' });
  }

  const code = generateOtpCode();
  const username = await resolveDiscordUsername({
    db,
    discordId,
    preferredUsername: getUserRecord(db, discordId)?.username,
    fallbackPrefix: 'user'
  });
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
  const discordId = normalizeIdentity(req.query.id || '');
  const code = String(req.query.code || '');

  const db = await store.read();
  pruneOtpRequests(db);

  const request = (db.otpRequests || []).find((entry) => {
    return normalizeIdentity(entry.discordId) === discordId && String(entry.code) === code && !entry.used;
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
  const username = await resolveDiscordUsername({
    db,
    discordId,
    preferredUsername: request.username,
    fallbackPrefix: role
  });

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
  const discordId = normalizeIdentity(req.query.id || '');
  const ban = db.moderation.bans?.[discordId];
  if (!ban) return res.json({ banned: false });
  return res.json({ banned: true, ...ban });
});

app.get('/api/check-timeout', async (req, res) => {
  const discordId = normalizeIdentity(req.query.id || '');

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
  const userId = normalizeIdentity(req.query.id || req.body.id || '');
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

app.post('/api/security/tamper-alert', async (req, res) => {
  const {
    extensionId = '',
    extensionName = 'NXS Streamers',
    version = 'unknown',
    buildType = 'unknown',
    userDiscordId = '',
    reason = '',
    detectedAt = nowIso(),
    files = [],
    signature = ''
  } = req.body || {};

  if (!extensionId) {
    return res.status(400).json({ success: false, error: 'extensionId is required' });
  }

  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ success: false, error: 'files is required' });
  }

  const normalizedFiles = files
    .map((file) => ({
      path: String(file?.path || '').trim(),
      expectedHash: String(file?.expectedHash || '').trim(),
      actualHash: String(file?.actualHash || '').trim()
    }))
    .filter((file) => file.path);

  if (normalizedFiles.length === 0) {
    return res.status(400).json({ success: false, error: 'files is required' });
  }

  const normalizedUserDiscordId = normalizeIdentity(userDiscordId);

  const alertSignature = signature || crypto
    .createHash('sha256')
    .update(JSON.stringify({ extensionId, version, buildType, userDiscordId: normalizedUserDiscordId, files: normalizedFiles }))
    .digest('hex');

  const createdAt = nowIso();
  let duplicate = false;

  await store.update((draft) => {
    const recentAlert = (draft.securityAlerts || []).find((alert) =>
      alert.signature === alertSignature &&
      (Date.now() - new Date(alert.createdAt).getTime()) < 10 * 60 * 1000
    );

    duplicate = !!recentAlert;
    draft.securityAlerts.unshift({
      id: createId(),
      type: 'tamper_detected',
      extensionId,
      extensionName,
      version,
      buildType,
      userDiscordId: normalizedUserDiscordId,
      reason: String(reason || ''),
      detectedAt,
      createdAt,
      signature: alertSignature,
      files: normalizedFiles
    });
    draft.securityAlerts = draft.securityAlerts.slice(0, 200);
    return draft;
  });

  if (duplicate) {
    return res.json({ success: true, duplicate: true, notified: false });
  }

  const delivery = await deliverSecurityAlertToDiscord({
    type: 'tamper_detected',
    extensionId,
    extensionName,
    version,
    buildType,
    userDiscordId,
    reason,
    detectedAt,
    files: normalizedFiles
  });

  if (!delivery.ok) {
    console.warn('[Security] Tamper alert saved but Discord delivery failed:', delivery.error);
  } else {
    console.log('[Security] Tamper alert delivered:', delivery.method);
  }

  return res.json({
    success: true,
    duplicate: false,
    notified: delivery.ok,
    deliveryMethod: delivery.method
  });
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
  const targetDiscordId = normalizeIdentity(req.body.targetDiscordId || '');
  const targetUsername = normalizeKickUsername(req.body.targetUsername || req.body.username || '');
  const requestedRole = String(req.body.role || 'user').trim().toLowerCase();
  const whitelisted = req.body.whitelisted !== undefined ? Boolean(req.body.whitelisted) : true;

  if (!targetDiscordId) {
    return res.status(400).json({ success: false, error: 'targetDiscordId is required' });
  }

  if (!['admin', 'user'].includes(requestedRole)) {
    return res.status(400).json({ success: false, error: 'role must be admin or user' });
  }

  if (isEffectiveOwner(req.currentDb || await store.read(), targetDiscordId) && (requestedRole !== 'admin' || whitelisted === false)) {
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

    draft.otpRequests = (draft.otpRequests || []).filter((entry) => normalizeIdentity(entry.discordId) !== targetDiscordId);

    if (draft.activeUsers?.[targetDiscordId]) {
      if (whitelisted === false) {
        delete draft.activeUsers[targetDiscordId];
      } else {
        draft.activeUsers[targetDiscordId].role = getRole(draft, targetDiscordId);
        if (targetUsername) draft.activeUsers[targetDiscordId].username = targetUsername;
      }
    }

    if (draft.dashboard?.[targetDiscordId] && targetUsername) {
      draft.dashboard[targetDiscordId].username = targetUsername;
    }

    return draft;
  });

  const updatedUser = getKnownUsers(db).find((user) => user.discordId === targetDiscordId) || {
    discordId: targetDiscordId,
    username: targetUsername || getGeneratedUsername(targetDiscordId, 'user'),
    role: requestedRole,
    whitelisted,
    isOwner: isEffectiveOwner(db, targetDiscordId)
  };

  res.json({ success: true, user: updatedUser });
});

app.post('/api/admin/user-access', requireAdmin, async (req, res) => {
  const targetDiscordId = normalizeIdentity(req.body.targetDiscordId || '');
  const targetUsername = normalizeKickUsername(req.body.targetUsername || req.body.username || '');
  const requestedRole = String(req.body.role || 'user').trim().toLowerCase();
  const whitelisted = req.body.whitelisted !== undefined ? Boolean(req.body.whitelisted) : true;

  if (!targetDiscordId) {
    return res.status(400).json({ success: false, error: 'targetDiscordId is required' });
  }

  if (requestedRole !== 'user') {
    return res.status(403).json({ success: false, error: 'Admins may only assign user role' });
  }

  const db = await store.read();
  if (isEffectiveOwner(db, targetDiscordId)) {
    return res.status(403).json({ success: false, error: 'Owner access cannot be changed' });
  }

  const currentRole = getRole(db, targetDiscordId);
  if (currentRole === 'admin') {
    return res.status(403).json({ success: false, error: 'Cannot modify another admin role via admin endpoint' });
  }

  const updatedDb = await store.update((draft) => {
    const user = ensureUser(draft, {
      discordId: targetDiscordId,
      username: targetUsername || null,
      role: 'user'
    });

    user.role = 'user';
    user.whitelisted = whitelisted;
    if (targetUsername) user.username = targetUsername;

    draft.otpRequests = (draft.otpRequests || []).filter((entry) => normalizeIdentity(entry.discordId) !== targetDiscordId);

    if (draft.activeUsers?.[targetDiscordId]) {
      if (whitelisted === false) {
        delete draft.activeUsers[targetDiscordId];
      } else {
        draft.activeUsers[targetDiscordId].role = getRole(draft, targetDiscordId);
        if (targetUsername) draft.activeUsers[targetDiscordId].username = targetUsername;
      }
    }

    if (draft.dashboard?.[targetDiscordId] && targetUsername) {
      draft.dashboard[targetDiscordId].username = targetUsername;
    }

    return draft;
  });

  const updatedUser = getKnownUsers(updatedDb).find((user) => user.discordId === targetDiscordId) || {
    discordId: targetDiscordId,
    username: targetUsername || getGeneratedUsername(targetDiscordId, 'user'),
    role: 'user',
    whitelisted,
    isOwner: isEffectiveOwner(updatedDb, targetDiscordId)
  };

  res.json({ success: true, user: updatedUser });
});

app.post('/api/heartbeat', async (req, res) => {
  const {
    discordId: rawDiscordId = 'guest',
    username: rawUsername = 'Guest',
    action = 'idle',
    channel = null,
    comment = null,
    duration = 0,
    status = 'Active'
  } = req.body || {};

  const discordId = normalizeIdentity(rawDiscordId);
  const username = normalizeKickUsername(rawUsername) || 'Guest';

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
  const discordId = normalizeIdentity(req.body.discordId || '');
  const username = normalizeKickUsername(req.body.username || '');
  const { channel, comments = 0, watchTime = 0 } = req.body || {};
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
  const discordId = normalizeIdentity(req.body.discordId || '');
  const username = normalizeKickUsername(req.body.username || '');
  const { channel, watchTime = 0, comments = 0 } = req.body || {};
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
    .filter((user) => isEmailIdentity(user.discordId))
    .filter((user) => !db.moderation.bans?.[user.discordId])
    .filter((user) => !db.moderation.timeouts?.[user.discordId])
    .map((user) => ({
      discordId: user.discordId,
      username: user.username,
      role: user.role,
      whitelisted: getRole(db, user.discordId) !== 'guest',
      isOwner: isEffectiveOwner(db, user.discordId),
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
  const requestedUserId = normalizeIdentity(req.query.userId || req.adminId);
  const logs = (db.logs || [])
    .filter((entry) => normalizeIdentity(entry.discordId) === requestedUserId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json(logs);
});

app.get('/api/admin/user-dashboard', requireAdmin, async (req, res) => {
  const userId = normalizeIdentity(req.query.userId || '');
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
  const normalizedModerator = normalizeIdentity(moderatorDiscord || req.adminId);
  const db = await store.read();
  const target = Object.values(db.activeUsers || {}).find((user) => user.ip === targetIp);

  if (!target) {
    return res.status(404).json({ success: false, error: 'Active user not found for the given IP' });
  }

  if ((type === 'ban' || type === 'timeout') && !canApplyRestrictedModeration(db, req.adminId, target.discordId)) {
    return res.status(403).json({ success: false, error: 'Role hierarchy prevents this moderation action.' });
  }

  if (type === 'kick') {
    await store.update((draft) => {
      draft.moderation.kicks[target.discordId] = {
        type: 'kick',
        moderatorDiscord: normalizedModerator,
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
        moderatorDiscord: normalizedModerator,
        adminId: req.adminId,
        createdAt: nowIso()
      };
      delete draft.activeUsers[target.discordId];
      return draft;
    });
    emitSse(target.discordId, { type: 'ban', reason, moderatorDiscord: normalizedModerator });
    return res.json({ success: true });
  }

  if (type === 'timeout') {
    const expires = new Date(Date.now() + Number(duration || 60) * 60 * 1000).toISOString();
    await store.update((draft) => {
      draft.moderation.timeouts[target.discordId] = {
        type: 'timeout',
        reason,
        moderatorDiscord: normalizedModerator,
        adminId: req.adminId,
        expires,
        createdAt: nowIso()
      };
      delete draft.activeUsers[target.discordId];
      return draft;
    });
    emitSse(target.discordId, { type: 'timeout', reason, moderatorDiscord: normalizedModerator, expires });
    return res.json({ success: true });
  }

  return res.status(400).json({ success: false, error: 'Unsupported moderation type' });
});

app.post('/api/admin/ban', requireAdmin, async (req, res) => {
  const targetDiscordId = normalizeIdentity(req.body.targetDiscordId || '');
  const reason = String(req.body.reason || 'Banned by admin');
  const moderatorDiscord = normalizeIdentity(req.body.moderatorDiscord || req.adminId);
  if (!targetDiscordId) return res.status(400).json({ success: false, error: 'targetDiscordId is required' });
  const db = req.currentDb || await store.read();

  if (!canApplyRestrictedModeration(db, req.adminId, targetDiscordId)) {
    return res.status(403).json({ success: false, error: 'Role hierarchy prevents this moderation action.' });
  }

  await store.update((draft) => {
    draft.moderation.bans[targetDiscordId] = {
      type: 'ban',
      reason,
      moderatorDiscord,
      adminId: req.adminId,
      createdAt: nowIso()
    };
    delete draft.activeUsers[targetDiscordId];
    return draft;
  });

  emitSse(targetDiscordId, { type: 'ban', reason, moderatorDiscord });
  res.json({ success: true });
});

app.post('/api/admin/timeout', requireAdmin, async (req, res) => {
  const targetDiscordId = normalizeIdentity(req.body.targetDiscordId || '');
  const durationMinutes = req.body.durationMinutes ?? 60;
  const reason = String(req.body.reason || 'Timed out by admin');
  const moderatorDiscord = normalizeIdentity(req.body.moderatorDiscord || req.adminId);

  if (!targetDiscordId) return res.status(400).json({ success: false, error: 'targetDiscordId is required' });
  const db = req.currentDb || await store.read();

  if (!canApplyRestrictedModeration(db, req.adminId, targetDiscordId)) {
    return res.status(403).json({ success: false, error: 'Role hierarchy prevents this moderation action.' });
  }

  const expires = new Date(Date.now() + Number(durationMinutes) * 60 * 1000).toISOString();

  await store.update((draft) => {
    draft.moderation.timeouts[targetDiscordId] = {
      type: 'timeout',
      reason,
      moderatorDiscord,
      adminId: req.adminId,
      expires,
      createdAt: nowIso()
    };
    delete draft.activeUsers[targetDiscordId];
    return draft;
  });

  emitSse(targetDiscordId, { type: 'timeout', reason, moderatorDiscord, expires });
  res.json({ success: true });
});

app.post('/api/admin/unban', requireAdmin, async (req, res) => {
  const targetDiscordId = normalizeIdentity(req.body.targetDiscordId || '');
  if (!targetDiscordId) return res.status(400).json({ success: false, error: 'targetDiscordId is required' });

  await store.update((draft) => {
    delete draft.moderation.bans[targetDiscordId];
    return draft;
  });

  await notifyClear(targetDiscordId);
  res.json({ success: true });
});

app.post('/api/admin/remove-timeout', requireAdmin, async (req, res) => {
  const targetDiscordId = normalizeIdentity(req.body.targetDiscordId || '');
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
  const userId = normalizeIdentity(req.body.userId || '');
  const username = normalizeKickUsername(req.body.username || 'Unknown') || 'Unknown';
  const timestamp = req.body.timestamp || null;
  if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

  await store.update((draft) => {
    const latest = draft.announcements.latest;
    if (!latest) return draft;
    if (timestamp && latest.timestamp !== timestamp) return draft;

    ensureUser(draft, { discordId: userId, username, role: getRole(draft, userId) });

    const exists = (draft.announcements.confirmations || []).some((entry) => normalizeIdentity(entry.userId) === userId);
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
    (db.announcements.confirmations || []).map((entry) => [normalizeIdentity(entry.userId), entry])
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
  const userId = normalizeIdentity(req.body.userId || '');
  const action = req.body.action || 'SYSTEM';
  const description = req.body.description || '';
  const timestamp = req.body.timestamp || nowIso();
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
  const discordId = normalizeIdentity(req.query.id || '');
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
    pruneReservedTestIdentities(db);
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
