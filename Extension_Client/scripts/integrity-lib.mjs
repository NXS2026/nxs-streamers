import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const monitoredFiles = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'background.js',
  'config.js',
  'features.js',
  'kick_automation.js',
  'stream_uptime.js',
  'utils.js',
  'modern-theme.css'
];

function sha256Hex(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function generateIntegrityFile(targetDir, options = {}) {
  const {
    buildType = 'source',
    outputFileName = 'INTEGRITY.json'
  } = options;

  const manifestPath = path.join(targetDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const files = {};

  for (const relativePath of monitoredFiles) {
    const filePath = path.join(targetDir, relativePath);
    const content = await fs.readFile(filePath, 'utf8');
    files[relativePath] = sha256Hex(content);
  }

  const payload = {
    name: manifest.name || 'NXS Streamers',
    version: manifest.version || 'unknown',
    buildType,
    generatedAt: new Date().toISOString(),
    algorithm: 'sha256',
    files
  };

  const outputPath = path.join(targetDir, outputFileName);
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  return outputPath;
}
