import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const key = String(process.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const config = key ? { VITE_GOOGLE_MAPS_API_KEY: key } : {};

const body = `window.SOLAR_ROTA_CONFIG = Object.assign(window.SOLAR_ROTA_CONFIG || {}, ${JSON.stringify(config)});\n`;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputArg = process.argv[2] || 'public/js/runtime-config.js';
const outputPath = path.resolve(rootDir, outputArg);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, body, 'utf8');
