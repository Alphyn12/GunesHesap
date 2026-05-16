import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const key = String(process.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const mapId = String(process.env.VITE_GOOGLE_MAPS_MAP_ID || '').trim();
const config = {};
if (key) config.VITE_GOOGLE_MAPS_API_KEY = key;
if (mapId) config.VITE_GOOGLE_MAPS_MAP_ID = mapId;

const body = `window.SOLAR_ROTA_CONFIG = Object.assign(window.SOLAR_ROTA_CONFIG || {}, ${JSON.stringify(config)});\n`;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputArg = process.argv[2] || 'public/js/runtime-config.js';
const outputPath = path.resolve(rootDir, outputArg);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, body, 'utf8');
