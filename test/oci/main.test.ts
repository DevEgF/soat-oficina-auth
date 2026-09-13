import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: vi.fn(), on: vi.fn(), end: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn(), close: vi.fn((callback: () => void) => callback()),
}));
vi.mock('pg', () => ({ Pool: class {
  constructor(options: unknown) { mocks.pool(options); }
  on = mocks.on;
  end = mocks.end;
} }));
vi.mock('../../src/oci/http.js', () => ({ createHttpServer: () => ({ listen: mocks.listen, close: mocks.close }) }));

const connection = { host: 'ep-synthetic.us-east-2.aws.neon.tech', user: 'synthetic',
  password: 'synthetic-password', port: 5432, database: 'neondb' };
let exitCode: typeof process.exitCode;
beforeEach(() => {
  exitCode = process.exitCode;
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('APP_ENVIRONMENT', 'hml');
  vi.stubEnv('APP_JWT_SECRET', 'synthetic-secret-only-for-tests-32-bytes');
  vi.stubEnv('AUTH_DB_CONFIG', JSON.stringify(connection));
});
afterEach(() => {
  process.exitCode = exitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('enforces certificate verification and closes the pool on shutdown', async () => {
  const handlers: Record<PropertyKey, () => void> = {};
  vi.spyOn(process, 'once').mockImplementation((event, callback) => { handlers[event] = callback as () => void; return process; });
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  vi.useFakeTimers();
  await import('../../src/oci/main.js');
  expect(mocks.pool).toHaveBeenCalledWith(expect.objectContaining({ ssl: { rejectUnauthorized: true }, max: 2 }));
  expect(mocks.listen).toHaveBeenCalledWith(8080, '0.0.0.0');
  const errorHandler = mocks.on.mock.calls[0]?.[1] as (() => void);
  errorHandler();
  expect(stderr).toHaveBeenCalledWith('{"event":"DatabaseConnectionError"}\n');
  handlers.SIGTERM?.();
  await Promise.resolve();
  expect(mocks.end).toHaveBeenCalled();
  expect(exit).toHaveBeenCalledWith(0);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(exit).toHaveBeenCalledWith(1);
});
it.each([
  '{}', '{', JSON.stringify({ ...connection, host: 'ep-demo-pooler.neon.tech' }),
  JSON.stringify({ ...connection, port: 1234 }),
  JSON.stringify({ ...connection, password: '' }),
  JSON.stringify({ ...connection, database: '' }),
  JSON.stringify({ ...connection, user: '' }),
])('fails closed on invalid startup configuration without printing it', async config => {
  vi.stubEnv('AUTH_DB_CONFIG', config);
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  await import('../../src/oci/main.js');
  expect(process.exitCode).toBe(1);
  expect(mocks.listen).not.toHaveBeenCalled();
  expect(stderr).toHaveBeenCalledWith('{"event":"InvalidStartupConfiguration"}\n');
  expect(JSON.stringify(stderr.mock.calls)).not.toContain('synthetic-password');
});
