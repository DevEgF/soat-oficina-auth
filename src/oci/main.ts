import { AuthenticateCustomer } from '../application/authenticateCustomer.js';
import { OsServiceCustomerRepository } from '../adapters/osServiceCustomerRepository.js';
import { JoseCustomerJwt } from '../security/customerJwt.js';
import { JoseInternalServiceToken } from '../security/internalServiceToken.js';
import { parseEnvironment } from '../config/environment.js';
import { parseServiceUrl } from '../config/serviceUrl.js';
import { createHttpServer } from './http.js';

function main() {
  const environment = parseEnvironment(process.env.APP_ENVIRONMENT);
  const osServiceUrl = parseServiceUrl(process.env.OS_SERVICE_URL);
  const secret = process.env.APP_JWT_SECRET ?? '';
  const customers = new OsServiceCustomerRepository(osServiceUrl, new JoseInternalServiceToken(secret));
  const server = createHttpServer(environment, new AuthenticateCustomer(customers, new JoseCustomerJwt(secret)));
  server.listen(8080, '0.0.0.0');
  const stop = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

try { main(); }
catch { process.stderr.write('{"event":"InvalidStartupConfiguration"}\n'); process.exitCode = 1; }
