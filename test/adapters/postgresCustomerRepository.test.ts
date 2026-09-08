import { expect, it, vi } from 'vitest';
import { PostgresCustomerRepository } from '../../src/adapters/postgresCustomerRepository.js';
import type { Environment } from '../../src/config/environment.js';

it.each(['hml', 'prod'] as const)('queries only the configured schema with bound parameters', async environment => {
  const query = vi.fn().mockResolvedValue({ rows: [{ id: '9a8db7aa-28ae-4fc1-b784-e6cd90364cb3', status: 'ACTIVE' }] });
  const repository = new PostgresCustomerRepository({ query });
  await expect(repository.findByCpf('synthetic-query-input', environment)).resolves.toMatchObject({ status: 'ACTIVE' });
  expect(query).toHaveBeenCalledWith(`SELECT id, status FROM "${environment}".clientes WHERE documento = $1 LIMIT 1`, ['synthetic-query-input']);
});
it('returns null for unknown customer', async () => {
  const repository = new PostgresCustomerRepository({ query: vi.fn().mockResolvedValue({ rows: [] }) });
  await expect(repository.findByCpf('unknown', 'hml')).resolves.toBeNull();
});
it('rejects an invalid schema before touching the database', async () => {
  const query = vi.fn();
  const repository = new PostgresCustomerRepository({ query });
  await expect(repository.findByCpf('unknown', 'hml;DROP SCHEMA prod' as Environment)).rejects.toThrow('INVALID_ENVIRONMENT');
  expect(query).not.toHaveBeenCalled();
});
