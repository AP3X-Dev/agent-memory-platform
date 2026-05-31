import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

const packages = await readdir(packagesDir, { withFileTypes: true });

for (const entry of packages) {
  if (!entry.isDirectory()) continue;

  const packageDir = join(packagesDir, entry.name);
  await rm(join(packageDir, 'dist'), { recursive: true, force: true });

  const packageEntries = await readdir(packageDir, { withFileTypes: true });
  await Promise.all(packageEntries
    .filter((packageEntry) => packageEntry.isFile() && packageEntry.name.endsWith('.tsbuildinfo'))
    .map((packageEntry) => rm(join(packageDir, packageEntry.name), { force: true })));
}
