import { Pool } from 'pg';

export interface DatabaseConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export function createCustomerPool(connection: DatabaseConnection, ca: string): Pool {
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('INVALID_DATABASE_CONFIGURATION');
  return new Pool({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.username,
    password: connection.password,
    max: 2,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    statement_timeout: 1500,
    query_timeout: 2000,
    ssl: { ca, rejectUnauthorized: true },
  });
}
