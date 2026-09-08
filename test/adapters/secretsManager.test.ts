import { expect, it, vi } from 'vitest';
import { SecretsManagerSecretProvider } from '../../src/adapters/secretsManager.js';

it('caches by ARN and refreshes after the configured lifetime', async () => {
  let now = 0;
  const send = vi.fn().mockResolvedValue({ SecretString: '{"value":"synthetic-test-only"}' });
  const provider = new SecretsManagerSecretProvider({ send }, () => now, 100);
  await provider.getJson('fixture-arn');
  await provider.getJson('fixture-arn');
  expect(send).toHaveBeenCalledTimes(1);
  await provider.getJson('another-fixture-arn');
  expect(send).toHaveBeenCalledTimes(2);
  now = 100;
  await provider.getJson('fixture-arn');
  expect(send).toHaveBeenCalledTimes(3);
});
it.each(['', undefined, 'invalid-json', 'null', '[]'])('rejects malformed values with a generic error', async SecretString => {
  const provider = new SecretsManagerSecretProvider({ send: vi.fn().mockResolvedValue({ SecretString }) });
  await expect(provider.getJson('fixture-arn')).rejects.toThrow('DEPENDENCY_UNAVAILABLE');
});
it('does not expose SDK error messages or cache failures', async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error('sensitive dependency details')).mockResolvedValueOnce({ SecretString: '{"value":"fixture"}' });
  const provider = new SecretsManagerSecretProvider({ send });
  await expect(provider.getJson('fixture-arn')).rejects.toThrow(/^DEPENDENCY_UNAVAILABLE$/);
  await expect(provider.getJson<{ value: string }>('fixture-arn')).resolves.toEqual({ value: 'fixture' });
});
