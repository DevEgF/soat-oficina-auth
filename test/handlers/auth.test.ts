import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { expect, it, vi } from 'vitest';
import { createAuthHandler } from '../../src/handlers/auth.js';
import { DependencyUnavailableError, InvalidCustomerError, MalformedCpfError } from '../../src/application/errors.js';

function event(body: string | undefined): APIGatewayProxyEventV2 {
  return { body, isBase64Encoded: false, requestContext: { requestId: 'req-123' } } as APIGatewayProxyEventV2;
}
const telemetry = { record: vi.fn(), run: async <T>(_environment: string, operation: () => Promise<T>): Promise<T> => operation() };
it.each(['{', '{}', '{"cpf":123}', '{"cpf":null}', '{"cpf":"invalid"}'])('rejects malformed input before composition', async body => {
  const getUseCase = vi.fn();
  const response = await createAuthHandler('hml', getUseCase, telemetry)(event(body));
  expect(response.statusCode).toBe(400);
  expect(getUseCase).not.toHaveBeenCalled();
});
it.each([
  [new MalformedCpfError(), 400, 'Invalid request'],
  [new InvalidCustomerError(), 401, 'Unauthorized'],
  [new DependencyUnavailableError(), 503, 'Service unavailable'],
  [new Error('sensitive dependency detail'), 503, 'Service unavailable'],
] as const)('maps errors to safe HTTP responses', async (error, statusCode, message) => {
  const response = await createAuthHandler('hml', () => Promise.resolve({ execute: vi.fn().mockRejectedValue(error) }), telemetry)(event('{"cpf":"52998224725"}'));
  expect(response.statusCode).toBe(statusCode);
  expect(JSON.parse(response.body)).toEqual({ message });
  expect(response.headers).toMatchObject({ 'cache-control': 'no-store', 'x-request-id': 'req-123' });
});
it('does not disclose initialization failures', async () => {
  const response = await createAuthHandler('hml', () => Promise.reject(new Error('sensitive')), telemetry)(event('{"cpf":"52998224725"}'));
  expect(response.statusCode).toBe(503);
  expect(response.body).toBe('{"message":"Service unavailable"}');
});
it('returns token only in response and supports base64 encoded JSON', async () => {
  const record = vi.fn();
  const execute = vi.fn().mockResolvedValue({ accessToken: 'synthetic-token', expiresIn: 900 });
  const request = { ...event(Buffer.from('{"cpf":"52998224725"}').toString('base64')), isBase64Encoded: true };
  const response = await createAuthHandler('hml', () => Promise.resolve({ execute }), { ...telemetry, record })(request);
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toEqual({ accessToken: 'synthetic-token', tokenType: 'Bearer', expiresIn: 900 });
  expect(JSON.stringify(record.mock.calls)).not.toContain('synthetic-token');
  expect(JSON.stringify(record.mock.calls)).not.toContain('52998224725');
});
