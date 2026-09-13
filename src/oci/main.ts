import { Pool } from 'pg';
import { AuthenticateCustomer } from '../application/authenticateCustomer.js';
import { PostgresCustomerRepository } from '../adapters/postgresCustomerRepository.js';
import { JoseCustomerJwt } from '../security/customerJwt.js';
import { parseEnvironment } from '../config/environment.js';
import { createHttpServer } from './http.js';

function main() {
  const environment = parseEnvironment(process.env.APP_ENVIRONMENT);
  const config: unknown = JSON.parse(process.env.AUTH_DB_CONFIG ?? '{}');
  if (!config || typeof config !== 'object'
    || !('host' in config) || typeof config.host !== 'string' || !/^[a-zA-Z0-9.-]+\.neon\.tech$/.test(config.host) || config.host.includes('-pooler.')
    || !('user' in config) || typeof config.user !== 'string' || !config.user
    || !('password' in config) || typeof config.password !== 'string' || !config.password
    || !('database' in config) || typeof config.database !== 'string' || !config.database
    || !('port' in config) || config.port !== 5432) throw new Error('Invalid configuration');
  const pool = new Pool({ host: config.host, user: config.user, password: config.password,
    database: config.database, port: 5432, ssl: { rejectUnauthorized: true }, max: 2,
    connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000, statement_timeout: 1500, query_timeout: 2000 });
  pool.on('error', () => { process.stderr.write('{"event":"DatabaseConnectionError"}\n'); });
  const jwt = new JoseCustomerJwt(process.env.APP_JWT_SECRET ?? '');
  const server = createHttpServer(environment, new AuthenticateCustomer(new PostgresCustomerRepository(pool), jwt));
  server.listen(8080, '0.0.0.0');
  const stop = () => {
    server.close(() => { void pool.end().then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

try { main(); }
catch { process.stderr.write('{"event":"InvalidStartupConfiguration"}\n'); process.exitCode = 1; }
