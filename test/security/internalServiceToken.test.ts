import { createHash } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import { expect, it } from 'vitest';
import type { Environment } from '../../src/config/environment.js';
import { JoseCustomerJwt } from '../../src/security/customerJwt.js';
import { JoseInternalServiceToken } from '../../src/security/internalServiceToken.js';

const secret = 'synthetic-unit-test-signing-key-only-32bytes';
const start = new Date('2026-09-08T12:00:00Z');
function clock() {
  let current = start.getTime();
  return { now: () => new Date(current), advance: (seconds: number) => { current += seconds * 1000; } };
}

it('signs the internal claims with the key shared by the customer token', async () => {
  const token = await new JoseInternalServiceToken(secret, () => start).current('hml');
  expect(decodeProtectedHeader(token)).toEqual({ alg: 'HS256', typ: 'JWT' });
  const { payload } = await jwtVerify(token, createHash('sha256').update(secret, 'utf8').digest(), {
    algorithms: ['HS256'], currentDate: start,
  });
  const issuedAt = Math.floor(start.getTime() / 1000);
  expect(payload).toEqual({
    iss: 'oficina', aud: 'oficina-api', sub: 'soat-oficina-auth', scope: ['INTERNAL'], env: 'hml',
    iat: issuedAt, exp: issuedAt + 60,
  });
});

it('is not accepted as a customer token', async () => {
  const token = await new JoseInternalServiceToken(secret, () => start).current('hml');
  await expect(new JoseCustomerJwt(secret, () => start).verify(token, 'hml')).rejects.toThrow(/^INVALID_TOKEN$/);
});

it('reuses the token while more than ten seconds remain', async () => {
  const time = clock();
  const tokens = new JoseInternalServiceToken(secret, time.now);
  const first = await tokens.current('hml');
  time.advance(49);
  expect(await tokens.current('hml')).toBe(first);
  time.advance(1);
  const renewed = await tokens.current('hml');
  expect(renewed).not.toBe(first);
  expect(decodeJwt(renewed).iat).toBe(Math.floor(start.getTime() / 1000) + 50);
});

it('issues a separate token per environment', async () => {
  const tokens = new JoseInternalServiceToken(secret, () => start);
  const hml = await tokens.current('hml');
  const prod = await tokens.current('prod');
  expect(decodeJwt(prod).env).toBe('prod');
  expect(await tokens.current('hml')).not.toBe(prod);
  expect(decodeJwt(await tokens.current('hml')).env).toBe('hml');
  expect(hml).not.toBe(prod);
});

it('rejects a short secret and an unknown environment', async () => {
  expect(() => new JoseInternalServiceToken('short')).toThrow('INVALID_SIGNING_CONFIGURATION');
  await expect(new JoseInternalServiceToken(secret).current('dev' as Environment)).rejects.toThrow('INVALID_ENVIRONMENT');
});
