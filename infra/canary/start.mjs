import { spawnSync } from 'node:child_process';

const { CANARY_NAME: name, AWS_REGION: region } = process.env;

if (!name || !region) {
  throw new Error('CANARY_NAME and AWS_REGION are required');
}

const command = process.platform === 'win32' ? 'aws.exe' : 'aws';
const result = spawnSync(
  command,
  ['synthetics', 'start-canary', '--name', name, '--region', region],
  { stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
