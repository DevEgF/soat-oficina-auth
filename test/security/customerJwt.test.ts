import { createHash } from 'node:crypto';
import { SignJWT, decodeJwt } from 'jose';
import { expect, it } from 'vitest';
import { JoseCustomerJwt } from '../../src/security/customerJwt.js';

const secret = 'synthetic-unit-test-signing-key-only-32bytes';
const customerId = '9a8db7aa-28ae-4fc1-b784-e6cd90364cb3';
const now = new Date('2026-09-08T12:00:00Z');
const service = new JoseCustomerJwt(secret, () => now);

it('issues approved claims with a 900 second lifetime and no CPF', async () => {
  const issued = await service.issue(customerId, 'hml');
  expect(issued.expiresIn).toBe(900);
  const claims = await service.verify(issued.accessToken, 'hml');
  expect(claims).toMatchObject({ sub: customerId, env: 'hml', scope: ['CUSTOMER'], iss: 'oficina', aud: 'oficina-api' });
  expect(claims.exp - claims.iat).toBe(900);
  expect(Object.keys(decodeJwt(issued.accessToken)).sort()).toEqual(['aud', 'env', 'exp', 'iat', 'iss', 'scope', 'sub']);
});
it('rejects a token from another environment and a tampered token', async () => {
  const issued = await service.issue(customerId, 'hml');
  await expect(service.verify(issued.accessToken, 'prod')).rejects.toThrow(/^INVALID_TOKEN$/);
  await expect(service.verify(`${issued.accessToken}x`, 'hml')).rejects.toThrow(/^INVALID_TOKEN$/);
});
it('rejects invalid customer subject on issuance', async () => {
  await expect(service.issue('staff-user', 'hml')).rejects.toThrow('INVALID_CUSTOMER_ID');
});
it.each([
  { env: 'prod' }, { aud: 'another-api' }, { iss: 'another-issuer' },
  { scope: ['ADMIN'] }, { scope: 'CUSTOMER' }, { sub: 'not-a-uuid' },
  { exp: 0 }, { exp: Math.floor(now.getTime() / 1000) + 901 }, { iat: undefined },
])('rejects invalid security claims', async replacement => {
  const seconds = Math.floor(now.getTime() / 1000);
  const payload = { sub: customerId, env: 'hml', scope: ['CUSTOMER'], iss: 'oficina', aud: 'oficina-api', iat: seconds, exp: seconds + 900, ...replacement };
  const token = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(createHash('sha256').update(secret).digest());
  await expect(service.verify(token, 'hml')).rejects.toThrow(/^INVALID_TOKEN$/);
});
