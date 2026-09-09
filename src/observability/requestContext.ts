import { randomUUID } from 'node:crypto';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import type { Environment } from '../config/environment.js';

export interface RequestResult {
  eventName: 'AuthSucceeded' | 'AuthRejected' | 'AuthDependencyFailure' | 'AuthorizerAllowed' | 'AuthorizerDenied' | 'AuthorizerErrors';
  environment: Environment;
  requestId: string;
  statusCode: number;
  durationMs: number;
}
export interface Telemetry {
  record(result: RequestResult): void;
  run<T>(environment: Environment, operation: () => Promise<T>): Promise<T>;
}
export function requestId(value: string | undefined): string {
  return value && /^[A-Za-z0-9._=-]{1,128}$/.test(value) ? value : randomUUID();
}

export class PowertoolsTelemetry implements Telemetry {
  private readonly logger: Logger;
  private readonly metrics: Metrics;
  private readonly tracer: Tracer;
  constructor(private readonly serviceName: 'oficina-auth' | 'oficina-authorizer') {
    this.logger = new Logger({ serviceName });
    this.metrics = new Metrics({ serviceName, namespace: 'Oficina' });
    this.tracer = new Tracer({ serviceName });
  }
  record(result: RequestResult): void {
    this.logger.info(result.eventName, { ...result });
    this.metrics.addDimension('Environment', result.environment);
    this.metrics.addMetric(result.eventName, MetricUnit.Count, 1);
    this.metrics.addMetric(this.serviceName === 'oficina-authorizer' ? 'AuthorizerLatency' : 'AuthLatency', MetricUnit.Milliseconds, result.durationMs);
    this.metrics.publishStoredMetrics();
  }
  async run<T>(environment: Environment, operation: () => Promise<T>): Promise<T> {
    const parent = process.env.AWS_LAMBDA_FUNCTION_NAME ? this.tracer.getSegment() : undefined;
    if (!parent) return operation();
    const segment = parent.addNewSubsegment(this.serviceName);
    this.tracer.setSegment(segment);
    segment.addAnnotation('Environment', environment);
    try { return await operation(); }
    finally { segment.close(); this.tracer.setSegment(parent); }
  }
}
