import type { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';
import { parseEnvironment, type Environment } from '../config/environment.js';
import type { CustomerJwt } from '../ports/customerJwt.js';
import { getCustomerJwt } from '../composition.js';
import { PowertoolsTelemetry, requestId, type Telemetry } from '../observability/requestContext.js';

export function createAuthorizerHandler(environment: Environment, getJwt: () => Promise<Pick<CustomerJwt, 'verify'>>, telemetry: Telemetry) {
  return async (event: APIGatewayRequestAuthorizerEventV2) => telemetry.run(environment, async () => {
    const started = Date.now();
    const correlation = requestId(event.requestContext.requestId);
    let isAuthorized = false;
    let context: Record<string, string> = {};
    const header = event.headers?.authorization ?? event.headers?.Authorization;
    const bearer = header && header.length <= 8192 ? /^Bearer ([^\s]+)$/i.exec(header)?.[1] : undefined;
    if (bearer) {
      try {
        const jwt = await getJwt();
        const claims = await jwt.verify(bearer, environment);
        isAuthorized = true;
        context = { customerId: claims.sub, scope: 'CUSTOMER', environment, requestId: correlation };
      } catch { /* Invalid credentials and unavailable dependencies both fail closed. */ }
    }
    telemetry.record({ eventName: isAuthorized ? 'AuthorizerAllowed' : 'AuthorizerDenied', environment, requestId: correlation, statusCode: isAuthorized ? 200 : 403, durationMs: Date.now() - started });
    return { isAuthorized, context };
  });
}

const telemetry = new PowertoolsTelemetry('oficina-authorizer');
export const handler = (event: APIGatewayRequestAuthorizerEventV2) => createAuthorizerHandler(parseEnvironment(process.env.ENVIRONMENT), getCustomerJwt, telemetry)(event);
