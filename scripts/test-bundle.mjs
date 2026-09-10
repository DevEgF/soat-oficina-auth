import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';

process.env.ENVIRONMENT = 'hml';
process.env.POWERTOOLS_TRACE_ENABLED = 'false';
for (const name of ['auth', 'authorizer']) {
  const archive = unzipSync(new Uint8Array(await readFile(`dist/${name}.zip`)));
  assert.deepEqual(Object.keys(archive).sort(), ['certs/global-bundle.pem', 'index.mjs', 'index.mjs.map']);
}
const auth = await import('../dist/auth/index.mjs');
const rejected = await auth.handler({ body: '{', isBase64Encoded: false, requestContext: { requestId: 'bundle-smoke' } });
assert.equal(rejected.statusCode, 400);
const authorizer = await import('../dist/authorizer/index.mjs');
assert.equal((await authorizer.handler({ headers: {}, requestContext: { requestId: 'bundle-smoke' } })).isAuthorized, false);
console.log('Both packaged handlers passed offline smoke checks.');
