import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AuthenticateCustomer } from '../../src/application/authenticateCustomer.js';

const mocks = vi.hoisted(() => ({
  pool: vi.fn(), createHttpServer: vi.fn(), listen: vi.fn(), close: vi.fn((callback: () => void) => callback()),
}));
vi.mock('pg', () => ({ Pool: class { constructor(options: unknown) { mocks.pool(options); } } }));
vi.mock('../../src/oci/http.js', () => ({
  createHttpServer: (...args: unknown[]) => {
    mocks.createHttpServer(...args);
    return { listen: mocks.listen, close: mocks.close };
  },
}));

const secret = 'synthetic-secret-only-for-tests-32-bytes';
const customerId = '9a8db7aa-28ae-4fc1-b784-e6cd90364cb3';
let exitCode: typeof process.exitCode;
let handlers: Record<PropertyKey, () => void>;
const servers: Server[] = [];
beforeEach(() => {
  exitCode = process.exitCode;
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('APP_ENVIRONMENT', 'hml');
  vi.stubEnv('APP_JWT_SECRET', secret);
  vi.stubEnv('OS_SERVICE_URL', 'http://os-service:8080');
  handlers = {};
  vi.spyOn(process, 'once').mockImplementation((event, callback) => { handlers[event] = callback as () => void; return process; });
});
afterEach(async () => {
  process.exitCode = exitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const server of servers.splice(0)) { server.closeAllConnections(); server.close(); await once(server, 'close'); }
});

it('serves on port 8080 without opening a database pool and stops on SIGTERM', async () => {
  vi.stubEnv('AUTH_DB_CONFIG', '{');
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  vi.useFakeTimers();
  await import('../../src/oci/main.js');
  expect(mocks.createHttpServer).toHaveBeenCalledWith('hml', expect.anything());
  expect(mocks.listen).toHaveBeenCalledWith(8080, '0.0.0.0');
  expect(mocks.pool).not.toHaveBeenCalled();
  handlers.SIGTERM?.();
  expect(mocks.close).toHaveBeenCalled();
  expect(exit).toHaveBeenCalledWith(0);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(exit).toHaveBeenCalledWith(1);
  expect(handlers.SIGINT).toBe(handlers.SIGTERM);
});

it('authenticates customers through the configured OS Service', async () => {
  const requests: IncomingMessage[] = [];
  const server = createServer((request, response) => {
    requests.push(request);
    const found = request.url === '/api/internal/customers/52998224725';
    response.writeHead(found ? 200 : 404, { 'content-type': 'application/json' });
    response.end(found ? JSON.stringify({ id: customerId, status: 'ACTIVE' }) : '{}');
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  vi.stubEnv('OS_SERVICE_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  await import('../../src/oci/main.js');
  const useCase = mocks.createHttpServer.mock.calls[0]?.[1] as Pick<AuthenticateCustomer, 'execute'>;
  await expect(useCase.execute({ cpf: '529.982.247-25', environment: 'hml' })).resolves.toMatchObject({ expiresIn: 900 });
  // Module registry is reset per test, so the error class is compared by its fixed message.
  await expect(useCase.execute({ cpf: '11144477735', environment: 'hml' })).rejects.toThrow(/^INVALID_CUSTOMER$/);
  expect(requests.map(request => request.url)).toEqual(['/api/internal/customers/52998224725', '/api/internal/customers/11144477735']);
  expect(requests.every(request => request.headers.authorization?.startsWith('Bearer '))).toBe(true);
});

it.each([
  ['OS_SERVICE_URL', undefined],
  ['OS_SERVICE_URL', ''],
  ['OS_SERVICE_URL', 'os-service:8080'],
  ['OS_SERVICE_URL', 'ftp://os-service:8080'],
  ['OS_SERVICE_URL', 'http://'],
  ['OS_SERVICE_URL', 'http://user:synthetic-password@os-service:8080'],
  ['OS_SERVICE_URL', 'http://os-service:8080/?debug=true'],
  ['OS_SERVICE_URL', 'http://os-service:8080/#fragment'],
  ['APP_JWT_SECRET', undefined],
  ['APP_JWT_SECRET', ''],
  ['APP_JWT_SECRET', 'synthetic-password'],
  ['APP_ENVIRONMENT', 'dev'],
  ['APP_ENVIRONMENT', ''],
])('fails closed when %s is %j without printing it', async (name, value) => {
  vi.stubEnv(name, value);
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  await import('../../src/oci/main.js');
  expect(process.exitCode).toBe(1);
  expect(mocks.listen).not.toHaveBeenCalled();
  expect(stderr).toHaveBeenCalledExactlyOnceWith('{"event":"InvalidStartupConfiguration"}\n');
  expect(JSON.stringify(stderr.mock.calls)).not.toMatch(/synthetic-password|synthetic-secret/);
});
