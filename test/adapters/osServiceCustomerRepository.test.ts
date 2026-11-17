import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { OsServiceCustomerRepository } from '../../src/adapters/osServiceCustomerRepository.js';
import type { Environment } from '../../src/config/environment.js';
import { JoseInternalServiceToken } from '../../src/security/internalServiceToken.js';

const secret = 'synthetic-unit-test-signing-key-only-32bytes';
const cpf = '52998224725';
const customerId = '9a8db7aa-28ae-4fc1-b784-e6cd90364cb3';
type Handler = (request: IncomingMessage, response: ServerResponse) => void;

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); server.close(); await once(server, 'close'); }
});
async function fakeOsService(handler: Handler) {
  const requests: IncomingMessage[] = [];
  const server = createServer((request, response) => { requests.push(request); handler(request, response); });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}
const reply = (status: number, body: string): Handler => (_request, response) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(body);
};
const repository = (url: string, timeoutMs?: number) =>
  new OsServiceCustomerRepository(url, new JoseInternalServiceToken(secret), timeoutMs);

describe('OS Service customer lookup', () => {
  it('returns the customer and authenticates with an internal token', async () => {
    const { url, requests } = await fakeOsService(reply(200, JSON.stringify({ id: customerId, status: 'ACTIVE' })));
    await expect(repository(url).findByCpf(cpf, 'hml')).resolves.toEqual({ id: customerId, status: 'ACTIVE' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.url).toBe(`/api/internal/customers/${cpf}`);
    const authorization = requests[0]?.headers.authorization ?? '';
    expect(authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    const token = authorization.slice('Bearer '.length);
    expect(decodeProtectedHeader(token)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const { payload } = await jwtVerify(token, createHash('sha256').update(secret).digest(), {
      algorithms: ['HS256'], issuer: 'oficina', audience: 'oficina-api', subject: 'soat-oficina-auth',
    });
    expect(payload).toMatchObject({ scope: ['INTERNAL'], env: 'hml' });
    expect(Object.keys(payload).sort()).toEqual(['aud', 'env', 'exp', 'iat', 'iss', 'scope', 'sub']);
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(60);
  });

  it.each(['hml', 'prod'] as const)('signs the token for the requested environment', async environment => {
    const { url, requests } = await fakeOsService(reply(200, JSON.stringify({ id: customerId, status: 'ACTIVE' })));
    await repository(url).findByCpf(cpf, environment);
    const token = (requests[0]?.headers.authorization ?? '').slice('Bearer '.length);
    const { payload } = await jwtVerify(token, createHash('sha256').update(secret).digest());
    expect(payload.env).toBe(environment);
  });

  it('keeps a blocked status for the use case to reject and ignores extra fields', async () => {
    const { url } = await fakeOsService(reply(200, JSON.stringify({ id: customerId, status: 'BLOCKED', name: 'ignored' })));
    await expect(repository(`${url}/`).findByCpf(cpf, 'hml')).resolves.toEqual({ id: customerId, status: 'BLOCKED' });
  });

  it('returns null when the customer does not exist', async () => {
    const { url } = await fakeOsService(reply(404, '{"message":"Not found"}'));
    await expect(repository(url).findByCpf(cpf, 'hml')).resolves.toBeNull();
  });

  it.each([500, 502, 503, 400, 401, 403, 429])('fails on unexpected status %i', async status => {
    const { url } = await fakeOsService(reply(status, '{}'));
    await expect(repository(url).findByCpf(cpf, 'hml')).rejects.toThrow('CUSTOMER_SERVICE_UNEXPECTED_STATUS');
  });

  it('does not follow redirects', async () => {
    const { url, requests } = await fakeOsService((_request, response) => {
      response.writeHead(302, { location: '/elsewhere' });
      response.end();
    });
    await expect(repository(url).findByCpf(cpf, 'hml')).rejects.toThrow('CUSTOMER_SERVICE_UNAVAILABLE');
    expect(requests).toHaveLength(1);
  });

  it.each([
    'not json', '', 'null', '[]', '"ACTIVE"',
    JSON.stringify({ status: 'ACTIVE' }),
    JSON.stringify({ id: 'not-a-uuid', status: 'ACTIVE' }),
    JSON.stringify({ id: customerId }),
    JSON.stringify({ id: customerId, status: 'INACTIVE' }),
    JSON.stringify({ id: customerId, status: 'active' }),
  ])('rejects an invalid body: %s', async body => {
    const { url } = await fakeOsService(reply(200, body));
    await expect(repository(url).findByCpf(cpf, 'hml')).rejects.toThrow('INVALID_CUSTOMER_RESPONSE');
  });

  it('gives up when the service does not answer in time', async () => {
    const { url } = await fakeOsService(() => { /* never answers */ });
    const started = Date.now();
    await expect(repository(url, 100).findByCpf(cpf, 'hml')).rejects.toThrow('CUSTOMER_SERVICE_UNAVAILABLE');
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('gives up when the body stalls after the headers', async () => {
    const { url } = await fakeOsService((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write('{"id":');
    });
    await expect(repository(url, 100).findByCpf(cpf, 'hml')).rejects.toThrow('CUSTOMER_SERVICE_UNAVAILABLE');
  });

  it('waits two seconds by default', async () => {
    const { url } = await fakeOsService(() => { /* never answers */ });
    const started = Date.now();
    await expect(repository(url).findByCpf(cpf, 'hml')).rejects.toThrow('CUSTOMER_SERVICE_UNAVAILABLE');
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_900);
    expect(Date.now() - started).toBeLessThan(4_000);
  });

  it('fails when the service is unreachable', async () => {
    const { url } = await fakeOsService(reply(200, '{}'));
    for (const server of servers.splice(0)) { server.close(); await once(server, 'close'); }
    await expect(repository(url).findByCpf(cpf, 'hml')).rejects.toThrow('CUSTOMER_SERVICE_UNAVAILABLE');
  });

  it('keeps document and token out of error messages', async () => {
    const { url } = await fakeOsService(reply(500, `{"echo":"${cpf}"}`));
    const error = await repository(url).findByCpf(cpf, 'hml').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toMatch(new RegExp(`${cpf}|Bearer|${secret}`));
  });

  it('refuses an invalid environment before calling the service', async () => {
    const { url, requests } = await fakeOsService(reply(200, '{}'));
    await expect(repository(url).findByCpf(cpf, 'dev' as Environment)).rejects.toThrow('INVALID_ENVIRONMENT');
    expect(requests).toHaveLength(0);
  });
});
