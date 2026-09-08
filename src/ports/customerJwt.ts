import type { Environment } from '../config/environment.js';

export interface IssuedCustomerToken { accessToken: string; expiresIn: 900 }
export interface VerifiedCustomerToken {
  sub: string;
  env: Environment;
  scope: ['CUSTOMER'];
  iss: 'oficina';
  aud: 'oficina-api';
  iat: number;
  exp: number;
}
export interface CustomerJwt {
  issue(customerId: string, environment: Environment): Promise<IssuedCustomerToken>;
  verify(token: string, environment: Environment): Promise<VerifiedCustomerToken>;
}
