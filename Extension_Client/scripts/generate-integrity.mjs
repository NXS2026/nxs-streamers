import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateIntegrityFile } from './integrity-lib.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourceDir = path.resolve(__dirname, '..');

const outputPath = await generateIntegrityFile(sourceDir, { buildType: 'source' });
console.log(`Integrity manifest created at: ${outputPath}`);
