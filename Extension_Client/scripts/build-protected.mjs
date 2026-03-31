import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import JavaScriptObfuscator from 'javascript-obfuscator';
import { generateIntegrityFile } from './integrity-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceDir = path.resolve(__dirname, '..');
const distRoot = path.join(sourceDir, 'dist');
const distDir = path.join(distRoot, 'NXS_Streamers_Protected');

const excludedTopLevel = new Set([
  'dist',
  'node_modules',
  'scripts',
  'package.json',
  'package-lock.json',
  'PROTECTION.md',
  'NXS_SETUP.md',
  'supabase-setup.sql'
]);

const reservedNames = [
  'APP_CONFIG',
  'getSupabaseHeaders',
  'renderChannels',
  'ASCDialog',
  'chrome',
  'document',
  'window',
  'globalThis',
  'module',
  'exports'
];

const obfuscationOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.18,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  renameProperties: false,
  reservedNames,
  rotateStringArray: true,
  selfDefending: true,
  shuffleStringArray: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.8,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

async function ensureCleanDir(targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
}

async function copySource() {
  async function copyDirectory(currentSource, currentTarget) {
    await fs.mkdir(currentTarget, { recursive: true });
    const entries = await fs.readdir(currentSource, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(currentSource, entry.name);
      const relativePath = path.relative(sourceDir, sourcePath);
      const top = relativePath.split(path.sep)[0];

      if (excludedTopLevel.has(top)) continue;

      const targetPath = path.join(currentTarget, entry.name);

      if (entry.isDirectory()) {
        await copyDirectory(sourcePath, targetPath);
        continue;
      }

      if (entry.isFile()) {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  await copyDirectory(sourceDir, distDir);
}

async function collectJsFiles(dir, bucket = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectJsFiles(fullPath, bucket);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.js')) {
      bucket.push(fullPath);
    }
  }

  return bucket;
}

async function obfuscateFile(filePath) {
  const source = await fs.readFile(filePath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(source, {
    ...obfuscationOptions,
    inputFileName: path.basename(filePath)
  }).getObfuscatedCode();

  new vm.Script(result, { filename: filePath });
  await fs.writeFile(filePath, result, 'utf8');
}

async function writeBuildInfo(files) {
  const buildInfo = {
    name: 'NXS Streamers Protected Build',
    builtAt: new Date().toISOString(),
    outputDirectory: distDir,
    obfuscatedFiles: files.map((file) => path.relative(distDir, file))
  };

  await fs.writeFile(
    path.join(distDir, 'BUILD_INFO.json'),
    JSON.stringify(buildInfo, null, 2),
    'utf8'
  );
}

async function main() {
  await ensureCleanDir(distRoot);
  await copySource();

  const jsFiles = await collectJsFiles(distDir);
  for (const filePath of jsFiles) {
    await obfuscateFile(filePath);
  }

  await generateIntegrityFile(distDir, { buildType: 'protected' });
  await writeBuildInfo(jsFiles);

  console.log(`Protected build created at: ${distDir}`);
  console.log(`Obfuscated files: ${jsFiles.length}`);
}

main().catch((error) => {
  console.error('[build:protected] Failed:', error);
  process.exit(1);
});
