import { Pool } from 'pg';
import { expect, it } from 'vitest';
import { createCustomerPool } from '../../src/adapters/postgresPool.js';

it.runIf(process.env.AUTH_TEST_DATABASE_URL)('cancels a stalled statement before the Lambda deadline', async () => {
  const configured = createCustomerPool({ host: 'localhost', port: 5432, database: 'oficina', username: 'fixture', password: 'fixture' }, '-----BEGIN CERTIFICATE-----\nfixture');
  // Only this local PostgreSQL fixture lacks TLS; production createCustomerPool never disables it.
  const localFixture = new Pool({ ...configured.options, connectionString: process.env.AUTH_TEST_DATABASE_URL, ssl: false });
  try {
    await expect(localFixture.query('SELECT pg_sleep(10)')).rejects.toMatchObject({ code: '57014' });
  } finally {
    await localFixture.end();
    await configured.end();
  }
});
