import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DB = {
  users: [],
  otpRequests: [],
  urlWhitelist: [],
  schedule: {
    enabled: false,
    rules: []
  },
  dashboard: {},
  logs: [],
  actionLogs: [],
  activeUsers: {},
  moderation: {
    bans: {},
    timeouts: {},
    kicks: {}
  },
  announcements: {
    latest: null,
    confirmations: []
  },
  whitelistErrors: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDefaults(target, defaults) {
  if (Array.isArray(defaults)) {
    return Array.isArray(target) ? target : clone(defaults);
  }

  if (!defaults || typeof defaults !== 'object') {
    return target === undefined ? defaults : target;
  }

  const source = target && typeof target === 'object' ? target : {};
  const merged = {};

  for (const [key, value] of Object.entries(defaults)) {
    merged[key] = mergeDefaults(source[key], value);
  }

  for (const [key, value] of Object.entries(source)) {
    if (!(key in merged)) merged[key] = value;
  }

  return merged;
}

export function createStore(filePath) {
  let writeQueue = Promise.resolve();

  async function ensureFile() {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
    }
  }

  async function read() {
    await ensureFile();
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    return mergeDefaults(parsed, DEFAULT_DB);
  }

  async function write(db) {
    await ensureFile();
    await fs.writeFile(filePath, JSON.stringify(db, null, 2), 'utf8');
    return db;
  }

  async function update(mutator) {
    writeQueue = writeQueue.then(async () => {
      const db = await read();
      const next = (await mutator(db)) || db;
      return write(next);
    });

    const result = await writeQueue;
    return clone(result);
  }

  return {
    filePath,
    defaults: () => clone(DEFAULT_DB),
    read,
    write,
    update
  };
}
