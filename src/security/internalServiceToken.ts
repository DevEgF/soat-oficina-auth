import { SignJWT } from 'jose';
import { parseEnvironment, type Environment } from '../config/environment.js';
import type { ServiceToken } from '../ports/serviceToken.js';
import { deriveSigningKey } from './signingKey.js';

const SUBJECT = 'soat-oficina-auth';
const LIFETIME_SECONDS = 60;
const RENEW_BEFORE_SECONDS = 10;

/**
 * HS256 token with the INTERNAL scope, signed with the same key and claims rules as the customer
 * token. A token is reused while more than ten seconds of its one-minute lifetime remain.
 */
export class JoseInternalServiceToken implements ServiceToken {
  private readonly key: Uint8Array;
  private cached: { environment: Environment; token: string; expiresAt: number } | undefined;

  constructor(rawSecret: string, private readonly now: () => Date = () => new Date()) {
    this.key = deriveSigningKey(rawSecret);
  }

  async current(environment: Environment): Promise<string> {
    const env = parseEnvironment(environment);
    const issuedAt = Math.floor(this.now().getTime() / 1000);
    if (this.cached?.environment === env && this.cached.expiresAt - issuedAt > RENEW_BEFORE_SECONDS) return this.cached.token;
    const token = await new SignJWT({ scope: ['INTERNAL'], env })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('oficina').setAudience('oficina-api').setSubject(SUBJECT)
      .setIssuedAt(issuedAt).setExpirationTime(issuedAt + LIFETIME_SECONDS).sign(this.key);
    this.cached = { environment: env, token, expiresAt: issuedAt + LIFETIME_SECONDS };
    return token;
  }
}
