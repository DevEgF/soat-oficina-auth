import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<string, { name?: string; environment?: unknown; concurrency?: { group: string; 'cancel-in-progress': boolean }; steps?: { run?: string }[] }>;
}
const workflow = (name: string) => parse(readFileSync(`.github/workflows/${name}.yml`, 'utf8')) as Workflow;

describe('delivery safety contracts', () => {
  it('runs the three required checks without AWS write permission', () => {
    const ci = workflow('ci');
    expect(Object.values(ci.jobs).map(job => job.name)).toEqual(expect.arrayContaining(['auth / node-check', 'auth / terraform', 'auth / security']));
    expect(ci.permissions).toEqual({ contents: 'read' });
    const commands = Object.values(ci.jobs).flatMap(job => job.steps?.map(step => step.run ?? '')).join('\n');
    for (const command of ['npm ci', 'npm run check', 'terraform -chdir=infra test', 'terraform -chdir=infra/shared test', 'checkov']) expect(commands).toContain(command);
  });
  it('serializes shared and environment state independently, and uses OIDC', () => {
    const deploy = workflow('deploy');
    expect(deploy.permissions['id-token']).toBe('write');
    expect(deploy.jobs.shared?.concurrency).toEqual({ group: 'auth-shared', 'cancel-in-progress': false });
    expect(deploy.jobs.apply?.concurrency?.group).toContain("'prod' || 'hml'");
    expect(deploy.jobs.apply?.concurrency?.['cancel-in-progress']).toBe(false);
    const text = readFileSync('.github/workflows/deploy.yml', 'utf8');
    expect(text).toContain('scripts/promote-bundle.sh');
    expect(text).toContain('scripts/smoke.mjs');
    expect(text).toContain('auth/${TF_VAR_environment}/terraform.tfstate');
  });
  it('allows destruction only through an explicit manual confirmation', () => {
    const destroy = workflow('destroy');
    expect(Object.keys(destroy.on)).toEqual(['workflow_dispatch']);
    const text = readFileSync('.github/workflows/destroy.yml', 'utf8');
    expect(text).toContain('DESTROY-soat-oficina-auth');
    expect(text.indexOf('Validate typed confirmation')).toBeLessThan(text.indexOf('Configure AWS credentials'));
    expect(text).not.toContain('-chdir=infra/shared');
  });
  it('documents authentication outcomes and protects every customer operation', () => {
    const api = parse(readFileSync('openapi/fase3.yaml', 'utf8')) as { paths: Record<string, Record<string, { responses: Record<string, unknown>; security?: unknown }>> };
    expect(Object.keys(api.paths['/auth/token']?.post?.responses ?? {})).toEqual(expect.arrayContaining(['200', '400', '401', '429', '503']));
    for (const [path, methods] of Object.entries(api.paths)) {
      if (path.startsWith('/api/customer/')) {
        for (const operation of Object.values(methods)) expect(operation.security).toEqual([{ bearerAuth: [] }]);
      }
    }
  });
});
