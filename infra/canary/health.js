'use strict';
const synthetics = require('@aws/synthetics-puppeteer');

exports.handler = async () => {
  synthetics.getConfiguration().setConfig({
    includeRequestHeaders: false, includeResponseHeaders: false,
    includeRequestBody: false, includeResponseBody: false,
    logRequest: false, logResponse: false,
    logRequestBody: false, logResponseBody: false,
    continueOnHttpStepFailure: false,
  });
  const url = new URL('/actuator/health', process.env.API_URL);
  if (url.protocol !== 'https:') throw new Error('Invalid health endpoint configuration');
  await synthetics.executeHttpStep('health', {
    hostname: url.hostname, port: 443, path: url.pathname,
    protocol: 'https:', method: 'GET', timeout: 10000,
  }, async response => {
    if (response.statusCode !== 200) throw new Error('Health HTTP check failed');
    let body = '';
    for await (const chunk of response) {
      body += chunk.toString();
      if (body.length > 16384) throw new Error('Health response exceeded limit');
    }
    let status;
    try { status = JSON.parse(body).status; }
    catch { throw new Error('Invalid health response'); }
    if (status !== 'UP') throw new Error('Health status is not UP');
  });
};
