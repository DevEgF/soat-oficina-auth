import { readFileSync } from 'node:fs';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { Pool } from 'pg';
import { AuthenticateCustomer } from './application/authenticateCustomer.js';
import { SecretsManagerSecretProvider } from './adapters/secretsManager.js';
import { PostgresCustomerRepository } from './adapters/postgresCustomerRepository.js';
import { createCustomerPool } from './adapters/postgresPool.js';
import { JoseCustomerJwt } from './security/customerJwt.js';
import type { SecretProvider } from './ports/secretProvider.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error('INVALID_CONFIGURATION');
  return value;
}
let secretProvider: SecretProvider | undefined;
function secrets(): SecretProvider {
  secretProvider ??= new SecretsManagerSecretProvider(new SecretsManagerClient({ maxAttempts: 2 }));
  return secretProvider;
}
export async function getCustomerJwt(): Promise<JoseCustomerJwt> {
  const data = await secrets().getJson<Record<string, unknown>>(required('JWT_SECRET_ARN'));
  if (typeof data.value !== 'string') throw new Error('INVALID_CONFIGURATION');
  return new JoseCustomerJwt(data.value);
}
let pool: Pool | undefined;
let currentCredentials: { username: string; password: string } | undefined;
export async function getAuthentication(): Promise<AuthenticateCustomer> {
  const data = await secrets().getJson<Record<string, unknown>>(required('DB_SECRET_ARN'));
  if (typeof data.username !== 'string' || !data.username || typeof data.password !== 'string' || !data.password) throw new Error('INVALID_CONFIGURATION');
  if (!pool || currentCredentials?.username !== data.username || currentCredentials.password !== data.password) {
    const port = Number(required('DB_PORT'));
    if (!Number.isInteger(port) || port !== 5432 || required('DB_NAME') !== 'oficina') throw new Error('INVALID_CONFIGURATION');
    const ca = readFileSync(required('NODE_EXTRA_CA_CERTS'), 'utf8');
    const replacement = createCustomerPool({ host: required('DB_HOST'), port, database: 'oficina', username: data.username, password: data.password }, ca);
    replacement.on('error', () => { /* Never log pg error contents, which may include connection metadata. */ });
    const oldPool = pool;
    pool = replacement;
    currentCredentials = { username: data.username, password: data.password };
    if (oldPool) await oldPool.end();
  }
  return new AuthenticateCustomer(new PostgresCustomerRepository(pool), await getCustomerJwt());
}
