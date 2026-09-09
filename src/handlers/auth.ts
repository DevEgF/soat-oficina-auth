import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { Environment } from '../config/environment.js';
import { parseEnvironment } from '../config/environment.js';
import type { AuthenticateCustomer } from '../application/authenticateCustomer.js';
import { InvalidCustomerError, MalformedCpfError } from '../application/errors.js';
import { normalizeAndValidateCpf } from '../domain/cpf.js';
import { getAuthentication } from '../composition.js';
import { PowertoolsTelemetry, requestId, type Telemetry } from '../observability/requestContext.js';

export function createAuthHandler(environment: Environment, getUseCase: () => Promise<Pick<AuthenticateCustomer, 'execute'>>, telemetry: Telemetry) {
  return async (event: APIGatewayProxyEventV2) => telemetry.run(environment, async () => {
    const started = Date.now();
    const correlation = requestId(event.requestContext.requestId);
    let statusCode = 503;
    let body: object = { message: 'Service unavailable' };
    try {
      let input: unknown;
      try { input = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body ?? ''); }
      catch { throw new MalformedCpfError(); }
      if (typeof input !== 'object' || input === null || !('cpf' in input) || typeof input.cpf !== 'string') throw new MalformedCpfError();
      try { normalizeAndValidateCpf(input.cpf); } catch { throw new MalformedCpfError(); }
      const useCase = await getUseCase();
      const token = await useCase.execute({ cpf: input.cpf, environment });
      statusCode = 200;
      body = { accessToken: token.accessToken, tokenType: 'Bearer', expiresIn: token.expiresIn };
    } catch (error) {
      if (error instanceof MalformedCpfError) { statusCode = 400; body = { message: 'Invalid request' }; }
      else if (error instanceof InvalidCustomerError) { statusCode = 401; body = { message: 'Unauthorized' }; }
    }
    telemetry.record({ eventName: statusCode === 200 ? 'AuthSucceeded' : statusCode === 503 ? 'AuthDependencyFailure' : 'AuthRejected', environment, requestId: correlation, statusCode, durationMs: Date.now() - started });
    return { statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-request-id': correlation }, body: JSON.stringify(body) };
  });
}

const telemetry = new PowertoolsTelemetry('oficina-auth');
export const handler = (event: APIGatewayProxyEventV2) => createAuthHandler(parseEnvironment(process.env.ENVIRONMENT), getAuthentication, telemetry)(event);
