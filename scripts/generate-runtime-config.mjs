import { writeFile } from 'node:fs/promises';

const key = String(process.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const config = {
  VITE_GOOGLE_MAPS_API_KEY: key
};

const body = `window.SOLAR_ROTA_CONFIG = Object.assign(window.SOLAR_ROTA_CONFIG || {}, ${JSON.stringify(config)});\n`;
await writeFile(new URL('../js/runtime-config.js', import.meta.url), body, 'utf8');
