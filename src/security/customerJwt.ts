import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { parseEnvironment, type Environment } from '../config/environment.js';
import type { CustomerJwt, IssuedCustomerToken, VerifiedCustomerToken } from '../ports/customerJwt.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class JoseCustomerJwt implements CustomerJwt {
  private readonly key: Uint8Array;

  constructor(rawSecret: string, private readonly now: () => Date = () => new Date()) {
    if (Buffer.byteLength(rawSecret, 'utf8') < 32) throw new Error('INVALID_SIGNING_CONFIGURATION');
    this.key = createHash('sha256').update(rawSecret, 'utf8').digest();
  }

  async issue(customerId: string, environment: Environment): Promise<IssuedCustomerToken> {
    if (!uuid.test(customerId)) throw new Error('INVALID_CUSTOMER_ID');
    const issuedAt = Math.floor(this.now().getTime() / 1000);
    const accessToken = await new SignJWT({ scope: ['CUSTOMER'], env: parseEnvironment(environment) })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('oficina').setAudience('oficina-api').setSubject(customerId)
      .setIssuedAt(issuedAt).setExpirationTime(issuedAt + 900).sign(this.key);
    return { accessToken, expiresIn: 900 };
  }

  async verify(token: string, environment: Environment): Promise<VerifiedCustomerToken> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'], issuer: 'oficina', audience: 'oficina-api',
        requiredClaims: ['exp', 'iat', 'sub', 'env', 'scope'], maxTokenAge: 900,
        currentDate: this.now(),
      });
      if (payload.env !== parseEnvironment(environment) || typeof payload.sub !== 'string' || !uuid.test(payload.sub)
        || !Array.isArray(payload.scope) || payload.scope.length !== 1 || payload.scope[0] !== 'CUSTOMER'
        || typeof payload.iat !== 'number' || typeof payload.exp !== 'number'
        || payload.exp <= payload.iat || payload.exp - payload.iat > 900) throw new Error('INVALID_TOKEN');
      return { sub: payload.sub, env: environment, scope: ['CUSTOMER'], iss: 'oficina', aud: 'oficina-api', iat: payload.iat, exp: payload.exp };
    } catch {
      throw new Error('INVALID_TOKEN');
    }
  }
}
