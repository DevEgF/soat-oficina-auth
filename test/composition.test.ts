import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const signing: Record<string, unknown> = { value: 'synthetic-signing-key-at-least-32bytes' };
  return {
  send: vi.fn(), poolFactory: vi.fn(), query: vi.fn(), end: vi.fn(), on: vi.fn(),
  password: 'synthetic-password', signing,
  };
});
vi.mock('@aws-sdk/client-secrets-manager', async original => ({
  ...await original<typeof import('@aws-sdk/client-secrets-manager')>(),
  SecretsManagerClient: class { send = fixture.send; },
}));
vi.mock('../src/adapters/postgresPool.js', () => ({ createCustomerPool: fixture.poolFactory }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));
  fixture.password = 'synthetic-password';
  fixture.signing = { value: 'synthetic-signing-key-at-least-32bytes' };
  fixture.send.mockImplementation((command: { input: { SecretId: string } }) => Promise.resolve({
    SecretString: JSON.stringify(command.input.SecretId === 'jwt-fixture' ? fixture.signing : { username: 'fixture', password: fixture.password }),
  }));
  fixture.query.mockResolvedValue({ rows: [{ id: '9a8db7aa-28ae-4fc1-b784-e6cd90364cb3', status: 'ACTIVE' }] });
  fixture.end.mockResolvedValue(undefined);
  fixture.poolFactory.mockImplementation(() => ({ query: fixture.query, end: fixture.end, on: fixture.on }));
  for (const [name, value] of Object.entries({ JWT_SECRET_ARN: 'jwt-fixture', DB_SECRET_ARN: 'db-fixture', DB_HOST: 'localhost', DB_PORT: '5432', DB_NAME: 'oficina', NODE_EXTRA_CA_CERTS: resolve('certs/global-bundle.pem') })) vi.stubEnv(name, value);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it('composes the real use case, reuses the pool, and refreshes rotated credentials', async () => {
  const { getAuthentication, getCustomerJwt } = await import('../src/composition.js');
  const useCase = await getAuthentication();
  const issued = await useCase.execute({ cpf: '52998224725', environment: 'hml' });
  await expect((await getCustomerJwt()).verify(issued.accessToken, 'hml')).resolves.toMatchObject({ scope: ['CUSTOMER'] });
  await getAuthentication();
  expect(fixture.poolFactory).toHaveBeenCalledTimes(1);
  fixture.password = 'rotated-synthetic-password';
  vi.setSystemTime(new Date('2026-09-08T12:06:00Z'));
  await getAuthentication();
  expect(fixture.poolFactory).toHaveBeenCalledTimes(2);
  expect(fixture.end).toHaveBeenCalledOnce();
});
it('authorizer composition never fetches database credentials', async () => {
  const { getCustomerJwt } = await import('../src/composition.js');
  await getCustomerJwt();
  expect(fixture.send).toHaveBeenCalledTimes(1);
  expect(fixture.send).toHaveBeenCalledWith(expect.objectContaining({ input: { SecretId: 'jwt-fixture' } }));
  expect(fixture.poolFactory).not.toHaveBeenCalled();
});
it('fails closed for missing configuration or invalid signing value', async () => {
  const { getCustomerJwt } = await import('../src/composition.js');
  vi.stubEnv('JWT_SECRET_ARN', '');
  await expect(getCustomerJwt()).rejects.toThrow('INVALID_CONFIGURATION');
  vi.stubEnv('JWT_SECRET_ARN', 'jwt-fixture');
  fixture.signing = {};
  await expect(getCustomerJwt()).rejects.toThrow('INVALID_CONFIGURATION');
});
it.each([['DB_PORT', '0'], ['DB_PORT', 'not-a-port'], ['DB_NAME', 'unexpected']])('rejects invalid database configuration', async (name, value) => {
  vi.stubEnv(name, value);
  const { getAuthentication } = await import('../src/composition.js');
  await expect(getAuthentication()).rejects.toThrow('INVALID_CONFIGURATION');
  expect(fixture.poolFactory).not.toHaveBeenCalled();
});
