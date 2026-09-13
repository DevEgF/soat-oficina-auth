import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpServer } from '../../src/oci/http.js';
import { DependencyUnavailableError, InvalidCustomerError } from '../../src/application/errors.js';

const servers: ReturnType<typeof createHttpServer>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); server.close(); await once(server, 'close'); }
});
async function start(execute = vi.fn().mockResolvedValue({ accessToken: 'synthetic-token', expiresIn: 900 })) {
  const log = vi.fn();
  const server = createHttpServer('hml', { execute }, log);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: string) => fetch(`${base}/auth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  return { base, post, execute, log };
}
describe('OCI HTTP authentication', () => {
  it('uses the fixed environment, emits no secrets in logs and disables caching', async () => {
    const { post, execute, log } = await start();
    const response = await post('{"cpf":"synthetic-cpf","environment":"prod"}');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(execute).toHaveBeenCalledWith({ cpf: 'synthetic-cpf', environment: 'hml' });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/synthetic-cpf|synthetic-token/);
  });
  it('rejects malformed and oversized payloads before calling the use case', async () => {
    const { post, execute } = await start();
    expect((await post('{')).status).toBe(400);
    expect((await post('{"cpf":2}')).status).toBe(400);
    expect((await post('x'.repeat(4097))).status).toBe(413);
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects unknown routes and unsupported content types', async () => {
    const { base, execute } = await start();
    expect((await fetch(`${base}/unknown`)).status).toBe(404);
    expect((await fetch(`${base}/auth/token`, { method: 'POST', body: '{}' })).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });
  it('returns uniform unauthorized and sanitized dependency failures', async () => {
    const execute = vi.fn().mockRejectedValueOnce(new InvalidCustomerError()).mockRejectedValueOnce(new DependencyUnavailableError());
    const { post } = await start(execute);
    const unauthorized = await post('{"cpf":"synthetic"}');
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ message: 'Unauthorized' });
    expect((await post('{"cpf":"synthetic"}')).status).toBe(503);
  });
  it('limits requests and keeps health independent', async () => {
    const { post, base } = await start();
    for (let i = 0; i < 60; i++) await post('{}');
    expect((await post('{}')).status).toBe(429);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
});
