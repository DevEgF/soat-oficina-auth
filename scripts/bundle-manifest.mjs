import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedCanary = `canary-${hash(await readFile('infra/canary/health.js'))}.zip`;
const names = ['auth.zip', 'authorizer.zip', expectedCanary];
if (process.argv[2] === 'create') {
  assert.match(process.env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/);
  const files = {};
  for (const name of names) files[name] = hash(await readFile(`dist/${name}`));
  await writeFile('dist/manifest.json', JSON.stringify({ commit: process.env.GITHUB_SHA, files }, null, 2));
} else {
  const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
  assert.equal(manifest.commit, process.env.PROMOTED_SHA);
  assert.deepEqual(Object.keys(manifest.files).sort(), names.sort());
  assert.deepEqual((await readdir('dist')).sort(), [...names, 'manifest.json'].sort());
  for (const name of names) assert.equal(hash(await readFile(`dist/${name}`)), manifest.files[name]);
}
console.log('Bundle provenance and SHA256 checks passed.');
