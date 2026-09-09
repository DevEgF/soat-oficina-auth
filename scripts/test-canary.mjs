import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { runInNewContext } from 'node:vm';
import { unzipSync } from 'fflate';

const source = await readFile('infra/canary/health.js');
const hash = createHash('sha256').update(source).digest('hex');
const archive = unzipSync(await readFile(`dist/canary-${hash}.zip`));
assert.deepEqual(Object.keys(archive), ['nodejs/node_modules/health.js']);
assert.equal(Buffer.from(archive['nodejs/node_modules/health.js']).toString(), source.toString());

async function run(statusCode, body, apiUrl = 'https://example.invalid') {
  let settings;
  const exports = {};
  runInNewContext(source.toString(), {
    exports, URL, process: { env: { API_URL: apiUrl } },
    require: name => {
      assert.equal(name, '@aws/synthetics-puppeteer');
      return {
        getConfiguration: () => ({ setConfig: value => { settings = value; } }),
        executeHttpStep: async (step, options, callback) => {
          assert.equal(step, 'health');
          assert.equal(options.path, '/actuator/health');
          assert.equal(options.timeout, 10000);
          assert.equal(settings.includeResponseBody, false);
          assert.equal(settings.logResponseBody, false);
          assert.equal(settings.logResponse, false);
          const response = Readable.from([body]);
          response.statusCode = statusCode;
          await callback(response);
        },
      };
    },
  });
  await exports.handler();
}
await run(200, '{"status":"UP"}');
await assert.rejects(run(503, 'private error details'), /Health HTTP check failed/);
await assert.rejects(run(200, '{"status":"DOWN"}'), /Health status is not UP/);
await assert.rejects(run(200, 'private invalid JSON'), /Invalid health response/);
await assert.rejects(run(200, 'x'.repeat(16385)), /Health response exceeded limit/);
await assert.rejects(run(200, '{"status":"UP"}', 'http://example.invalid'), /Invalid health endpoint configuration/);
console.log('Packaged canary passed six offline health and privacy checks.');
