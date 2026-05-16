import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');

const COPY_TARGETS = [
  'index.html',
  'manifest.json',
  'service-worker.js',
  'new_version_logo.png',
  'icon-192.svg',
  'icon-512.svg',
  'css',
  'js',
  'assets',
  'locales',
  'fixtures',
  'shared',
  'svg_files'
];

const EXCLUDED_ROOT_DIRS = new Set([
  '.git',
  '.github',
  '.vercel',
  'node_modules',
  'tests',
  'backend',
  'scripts',
  'public',
  'api',
  '__pycache__',
  '.pytest_cache',
  '.pytest-tmp',
  'tmp'
]);

function assertNotExcluded(target) {
  if (EXCLUDED_ROOT_DIRS.has(target)) {
    throw new Error(`Refusing to copy excluded build target: ${target}`);
  }
}

async function copyTarget(target) {
  assertNotExcluded(target);
  const source = path.join(rootDir, target);
  if (!existsSync(source)) return;
  const destination = path.join(publicDir, target);
  await cp(source, destination, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: src => {
      const rel = path.relative(rootDir, src).replaceAll(path.sep, '/');
      return !rel.split('/').some(part => EXCLUDED_ROOT_DIRS.has(part));
    }
  });
}

async function writeRuntimeConfig() {
  const key = String(process.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const mapId = String(process.env.VITE_GOOGLE_MAPS_MAP_ID || '').trim();
  const config = {};
  if (key) config.VITE_GOOGLE_MAPS_API_KEY = key;
  if (mapId) config.VITE_GOOGLE_MAPS_MAP_ID = mapId;
  const output = path.join(publicDir, 'js', 'runtime-config.js');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    `window.SOLAR_ROTA_CONFIG = Object.assign(window.SOLAR_ROTA_CONFIG || {}, ${JSON.stringify(config)});\n`,
    'utf8'
  );
}

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });

for (const target of COPY_TARGETS) {
  await copyTarget(target);
}

await writeRuntimeConfig();

console.log(`Static build complete: ${path.relative(rootDir, publicDir).replaceAll(path.sep, '/')}`);
