import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.agents' ||
        entry.name === '.pytest_cache' ||
        entry.name.startsWith('pytest-cache-files-')
      ) continue;
      files.push(...await collectJsFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(path);
    }
  }
  return files;
}

const jsFiles = await collectJsFiles(process.cwd());
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`syntax check passed for ${jsFiles.length} JS files`);
