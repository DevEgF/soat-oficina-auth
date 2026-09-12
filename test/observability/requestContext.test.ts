import { afterEach, expect, it, vi } from 'vitest';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { PowertoolsTelemetry, requestId } from '../../src/observability/requestContext.js';

afterEach(() => vi.restoreAllMocks());
it('preserves a safe correlation ID and replaces invalid IDs', () => {
  expect(requestId('req-123')).toBe('req-123');
  expect(requestId('bad\nvalue')).toMatch(/^[0-9a-f-]{36}$/);
  expect(requestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
});
it.each(['oficina-auth', 'oficina-authorizer'] as const)('emits approved fields and low-cardinality metrics', async service => {
  const info = vi.spyOn(Logger.prototype, 'info').mockImplementation(() => undefined);
  const dimension = vi.spyOn(Metrics.prototype, 'addDimension');
  const metric = vi.spyOn(Metrics.prototype, 'addMetric');
  vi.spyOn(Metrics.prototype, 'publishStoredMetrics').mockReturnThis();
  const telemetry = new PowertoolsTelemetry(service);
  expect(await telemetry.run('hml', () => Promise.resolve('result'))).toBe('result');
  telemetry.record({ eventName: 'AuthSucceeded', environment: 'hml', requestId: 'req-123', statusCode: 200, durationMs: 10 });
  expect(info).toHaveBeenCalledWith('AuthSucceeded', { eventName: 'AuthSucceeded', environment: 'hml', requestId: 'req-123', statusCode: 200, durationMs: 10 });
  expect(dimension).toHaveBeenCalledExactlyOnceWith('Environment', 'hml');
  expect(metric).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(dimension.mock.calls)).not.toContain('requestId');
});
