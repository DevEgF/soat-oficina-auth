import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { smoke } from './smoke.mjs';

const config = { API_URL: 'https://hml.example.com', ENVIRONMENT: 'hml', SMOKE_ACTIVE_CPF: 'active',
  SMOKE_BLOCKED_CPF: 'blocked', SMOKE_UNKNOWN_CPF: 'unknown', SMOKE_OTHER_ACTIVE_CPF: 'other', SMOKE_TRACKING_CODE: 'owned', OTHER_API_URL: 'https://prod.example.com' };
const claims = { iss: 'oficina', aud: 'oficina-api', sub: '11111111-2222-3333-4444-555555555555', iat: 1, exp: 901, env: 'hml', scope: ['CUSTOMER'] };
const token = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const response = (status, body, headers) => new Response(JSON.stringify(body), { status, headers });
function fixtureRequest(fault) {
  return async (url, options = {}) => {
    if (url.pathname === '/auth/token') {
      const cpf = JSON.parse(options.body).cpf;
      if (cpf === '123') return response(400, { message: 'Bad request' });
      if (['blocked', 'unknown'].includes(cpf)) return response(401, { message: fault === 'enumeration' && cpf === 'blocked' ? 'Blocked' : 'Unauthorized' });
      return response(200, { accessToken: cpf === 'active' ? token : 'other-token', tokenType: 'Bearer', expiresIn: 900 }, { 'cache-control': 'no-store' });
    }
    if (!options.headers?.authorization) return response(401, {});
    if (url.hostname === 'prod.example.com') return response(fault === 'cross-env' ? 200 : 403, {});
    if (options.headers.authorization === 'Bearer other-token') return response(fault === 'ownership' ? 200 : 404, {});
    return response(fault === 'missing-order' ? 404 : 200, {}, { 'x-correlation-id': 'req-fixture' });
  };
}
test('complete smoke requires owned access and denies foreign/cross-environment requests', async () => {
  await smoke(config, fixtureRequest());
  for (const fault of ['enumeration', 'ownership', 'cross-env', 'missing-order']) {
    await assert.rejects(smoke(config, fixtureRequest(fault)));
  }
});
test('missing fixtures and missing production peer fail before any request', async () => {
  let called = false;
  const noRequest = () => { called = true; throw new Error('unexpected request'); };
  await assert.rejects(smoke({ ...config, SMOKE_TRACKING_CODE: '' }, noRequest));
  await assert.rejects(smoke({ ...config, ENVIRONMENT: 'prod', OTHER_API_URL: '' }, noRequest));
  assert.equal(called, false);
});

test('promotion rejects tampering and changes to runtime, workflow or compiler configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'oficina-promotion-'));
  const repo = join(root, 'repo');
  const artifact = join(root, 'artifact');
  const bin = join(root, 'bin');
  const source = resolve('.');
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' };
  const run = (cmd, args, extra = {}) => spawnSync(cmd, args, { cwd: repo, env: { ...env, ...extra }, encoding: 'utf8' });
  const git = args => { const result = run('git', args); assert.equal(result.status, 0, 'Fixture git operation failed'); return result.stdout.trim(); };
  try {
    await mkdir(join(repo, 'scripts'), { recursive: true });
    await mkdir(join(repo, 'infra', 'canary'), { recursive: true });
    await mkdir(join(repo, 'src'), { recursive: true });
    await mkdir(join(repo, '.github', 'workflows'), { recursive: true });
    await mkdir(artifact);
    await mkdir(bin);
    for (const name of ['promote-bundle.sh', 'bundle-manifest.mjs']) await copyFile(join(source, 'scripts', name), join(repo, 'scripts', name));
    await writeFile(join(repo, 'infra', 'canary', 'health.js'), 'synthetic canary');
    await writeFile(join(repo, 'src', 'handler.ts'), 'synthetic handler');
    await writeFile(join(repo, '.github', 'workflows', 'deploy.yml'), 'current delivery policy');
    await writeFile(join(repo, 'tsconfig.json'), '{}');
    await writeFile(join(repo, '.gitignore'), 'dist/\n');
    git(['init', '-q']); git(['add', '.']); git(['commit', '-qm', 'fixture']);
    const sha = git(['rev-parse', 'HEAD']);
    const { createHash } = await import('node:crypto');
    const canary = `canary-${createHash('sha256').update('synthetic canary').digest('hex')}.zip`;
    const files = {};
    for (const name of ['auth.zip', 'authorizer.zip', canary]) {
      await writeFile(join(artifact, name), `original ${name}`);
      files[name] = createHash('sha256').update(await readFile(join(artifact, name))).digest('hex');
    }
    await writeFile(join(artifact, 'manifest.json'), JSON.stringify({ commit: sha, files }));
    await writeFile(join(bin, 'gh'), '#!/usr/bin/env bash\nset -euo pipefail\nif [ "$2" = list ]; then printf "1\\t%s\\n" "$FIXTURE_SHA"; else mkdir -p dist; cp "$FIXTURE_ARTIFACT"/* dist/; fi\n');
    await chmod(join(bin, 'gh'), 0o755);
    const fixtureEnv = { PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`, FIXTURE_SHA: sha,
      FIXTURE_ARTIFACT: artifact.replaceAll('\\', '/'), GITHUB_REPOSITORY: 'fixture/auth' };
    const promote = () => run('bash', ['scripts/promote-bundle.sh'], fixtureEnv);
    assert.equal(promote().status, 0, 'Matching protected artifact must promote');
    assert.equal(await readFile(join(repo, 'dist', 'auth.zip'), 'utf8'), 'original auth.zip');
    const removeDownload = async () => {
      const download = resolve(repo, 'dist');
      assert.equal(download, join(root, 'repo', 'dist'));
      await rm(download, { recursive: true });
    };
    await removeDownload();
    await writeFile(join(artifact, 'auth.zip'), 'tampered');
    assert.notEqual(promote().status, 0, 'Tampered artifact must fail');
    await removeDownload();
    await writeFile(join(artifact, 'auth.zip'), 'original auth.zip');
    for (const path of ['src/handler.ts', '.github/workflows/deploy.yml', 'tsconfig.json']) {
      const original = await readFile(join(repo, path));
      await writeFile(join(repo, path), 'changed input');
      git(['add', '.']); git(['commit', '-qm', 'changed']);
      assert.notEqual(promote().status, 0, 'Changed build or delivery policy cannot reuse old hml bytes');
      await writeFile(join(repo, path), original);
      git(['add', '.']); git(['commit', '-qm', 'restore fixture']);
    }
  } finally {
    // root is a freshly created test-owned directory under the OS temporary root.
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')));
    await rm(root, { recursive: true, force: true });
  }
});
