import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AuthenticateCustomer } from '../application/authenticateCustomer.js';
import { InvalidCustomerError, MalformedCpfError } from '../application/errors.js';
import type { Environment } from '../config/environment.js';

// This adapter is a normal container service, not the AWS serverless deployment.
export function createHttpServer(environment: Environment, useCase: Pick<AuthenticateCustomer, 'execute'>,
  log: (record: object) => void = record => process.stdout.write(`${JSON.stringify(record)}\n`)) {
  let windowStart = Date.now();
  let requests = 0;
  const server = createServer((request, response) => {
    const requestId = randomUUID();
    const started = Date.now();
    const send = (status: number, body: object) => {
      response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store',
        'x-request-id': requestId });
      response.end(JSON.stringify(body));
      log({ service: 'oficina-auth', environment, requestId, statusCode: status, durationMs: Date.now() - started });
    };
    if (request.method === 'GET' && request.url === '/health') { send(200, { status: 'UP' }); return; }
    if (request.method !== 'POST' || request.url !== '/auth/token') { send(404, { message: 'Not found' }); return; }
    if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0; }
    if (++requests > 60) { request.resume(); send(429, { message: 'Too many requests' }); return; }
    if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
      request.resume(); send(400, { message: 'Invalid request' }); return;
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    let rejected = false;
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 4096) {
        if (!rejected) { rejected = true; chunks.length = 0; send(413, { message: 'Request too large' }); }
      } else if (!rejected) chunks.push(chunk);
    });
    request.on('error', () => { if (!response.headersSent) send(400, { message: 'Invalid request' }); });
    request.on('end', () => {
      if (rejected || response.headersSent) return;
      void (async () => {
        try {
          let input: unknown;
          try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
          catch { throw new MalformedCpfError(); }
          if (!input || typeof input !== 'object' || !('cpf' in input) || typeof input.cpf !== 'string') throw new MalformedCpfError();
          const token = await useCase.execute({ cpf: input.cpf, environment });
          send(200, { ...token, tokenType: 'Bearer' });
        } catch (error) {
          if (error instanceof MalformedCpfError) send(400, { message: 'Invalid request' });
          else if (error instanceof InvalidCustomerError) send(401, { message: 'Unauthorized' });
          else send(503, { message: 'Service unavailable' });
        }
      })();
    });
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.setTimeout(15_000, socket => socket.destroy());
  return server;
}
