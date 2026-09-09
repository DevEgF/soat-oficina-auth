import type { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';
import { expect, it, vi } from 'vitest';
import { createAuthorizerHandler } from '../../src/handlers/authorizer.js';

const telemetry = { record: vi.fn(), run: async <T>(_environment: string, operation: () => Promise<T>): Promise<T> => operation() };
function event(authorization?: string): APIGatewayRequestAuthorizerEventV2 {
  return { headers: authorization ? { authorization } : {}, requestContext: { requestId: 'req-123' } } as APIGatewayRequestAuthorizerEventV2;
}
it.each([undefined, '', 'Basic fixture', 'Bearer', 'Bearer token extra'])('denies missing or malformed bearer', async authorization => {
  const factory = vi.fn();
  expect(await createAuthorizerHandler('hml', factory, telemetry)(event(authorization))).toEqual({ isAuthorized: false, context: {} });
  expect(factory).not.toHaveBeenCalled();
});
it('denies an invalid or cross-environment token', async () => {
  const verify = vi.fn().mockRejectedValue(new Error('INVALID_TOKEN'));
  const result = await createAuthorizerHandler('prod', () => Promise.resolve({ verify }), telemetry)(event('Bearer fixture'));
  expect(result.isAuthorized).toBe(false);
  expect(verify).toHaveBeenCalledWith('fixture', 'prod');
});
it('returns only safe UUID authorization context', async () => {
  const verify = vi.fn().mockResolvedValue({ sub: '9a8db7aa-28ae-4fc1-b784-e6cd90364cb3', env: 'hml', scope: ['CUSTOMER'] });
  const result = await createAuthorizerHandler('hml', () => Promise.resolve({ verify }), telemetry)(event('Bearer fixture'));
  expect(result).toEqual({ isAuthorized: true, context: { customerId: '9a8db7aa-28ae-4fc1-b784-e6cd90364cb3', scope: 'CUSTOMER', environment: 'hml', requestId: 'req-123' } });
});
