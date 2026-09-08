import { expect, it } from 'vitest';
import { createCustomerPool } from '../../src/adapters/postgresPool.js';

const connection = { host: 'localhost', port: 5432, database: 'oficina', username: 'fixture', password: 'fixture' };
it('requires a CA and keeps TLS verification enabled with bounded connections', async () => {
  expect(() => createCustomerPool(connection, '')).toThrow('INVALID_DATABASE_CONFIGURATION');
  const pool = createCustomerPool(connection, '-----BEGIN CERTIFICATE-----\nfixture');
  expect(pool.options.ssl).toMatchObject({ rejectUnauthorized: true });
  expect(pool.options.max).toBe(2);
  expect(pool.options.connectionTimeoutMillis).toBe(3000);
  expect(pool.options.idleTimeoutMillis).toBe(30000);
  await pool.end();
});
