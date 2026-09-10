import { build } from 'esbuild';
import { zipSync } from 'fflate';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

for (const name of ['auth', 'authorizer']) {
  const output = `dist/${name}`;
  await mkdir(`${output}/certs`, { recursive: true });
  await build({
    entryPoints: [`src/handlers/${name}.ts`], outfile: `${output}/index.mjs`,
    bundle: true, platform: 'node', target: 'node22', format: 'esm', sourcemap: true,
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  });
  await copyFile('certs/global-bundle.pem', `${output}/certs/global-bundle.pem`);
  const entries = {};
  for (const path of ['index.mjs', 'index.mjs.map', 'certs/global-bundle.pem']) {
    entries[path] = [new Uint8Array(await readFile(`${output}/${path}`)), { mtime: new Date('2020-01-01T00:00:00Z') }];
  }
  await writeFile(`dist/${name}.zip`, zipSync(entries));
}
const canary = new Uint8Array(await readFile('infra/canary/health.js'));
const canaryHash = createHash('sha256').update(canary).digest('hex');
await writeFile(`dist/canary-${canaryHash}.zip`, zipSync({
  'nodejs/node_modules/health.js': [canary, { mtime: new Date('2020-01-01T00:00:00Z') }],
}));
