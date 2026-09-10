import { GetSecretValueCommand, type GetSecretValueCommandOutput } from '@aws-sdk/client-secrets-manager';
import type { SecretProvider } from '../ports/secretProvider.js';

interface SecretClient {
  send(command: GetSecretValueCommand): Promise<Pick<GetSecretValueCommandOutput, 'SecretString'>>;
}

export class SecretsManagerSecretProvider implements SecretProvider {
  private readonly cache = new Map<string, { value: object; expiresAt: number }>();

  constructor(
    private readonly client: SecretClient,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 300_000,
  ) {}

  async getJson<T>(arn: string): Promise<T> {
    const cached = this.cache.get(arn);
    if (cached && cached.expiresAt > this.now()) return cached.value as T;
    this.cache.delete(arn);
    try {
      const response = await this.client.send(new GetSecretValueCommand({ SecretId: arn }));
      if (!response.SecretString) throw new Error('DEPENDENCY_UNAVAILABLE');
      const value: unknown = JSON.parse(response.SecretString);
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('DEPENDENCY_UNAVAILABLE');
      this.cache.set(arn, { value, expiresAt: this.now() + this.ttlMs });
      return value as T;
    } catch {
      throw new Error('DEPENDENCY_UNAVAILABLE');
    }
  }
}
