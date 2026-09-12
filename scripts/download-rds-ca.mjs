import { mkdir, writeFile } from 'node:fs/promises';

const response = await fetch('https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem');
if (!response.ok) throw new Error(`RDS CA download failed (${response.status})`);
const bundle = await response.text();
if (!bundle.includes('-----BEGIN CERTIFICATE-----') || !bundle.includes('-----END CERTIFICATE-----')) throw new Error('Invalid RDS CA bundle');
await mkdir(new URL('../certs/', import.meta.url), { recursive: true });
await writeFile(new URL('../certs/global-bundle.pem', import.meta.url), bundle);
