import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

interface Container {
  image: string;
  ports: { name: string; containerPort: number }[];
  envFrom: { configMapRef: { name: string } }[];
  env: { name: string; valueFrom?: { secretKeyRef?: { name: string; key: string } } }[];
  securityContext: { allowPrivilegeEscalation: boolean; readOnlyRootFilesystem: boolean; capabilities: { drop: string[] } };
  resources: { requests: Record<string, string>; limits: Record<string, string> };
  readinessProbe: { httpGet: { path: string; port: string } };
  livenessProbe: { httpGet: { path: string; port: string } };
}
interface Deployment {
  metadata: { name: string };
  spec: { template: { spec: { automountServiceAccountToken: boolean; securityContext: { runAsNonRoot: boolean; runAsUser: number }; containers: Container[] } } };
}
const manifest = <T>(name: string) => parse(readFileSync(`k8s/${name}`, 'utf8')) as T;

describe('kind manifests', () => {
  it('applies only the service resources; the example secret stays out', () => {
    const kustomization = manifest<{ namespace: string; resources: string[] }>('kustomization.yaml');
    expect(kustomization.namespace).toBe('oficina');
    expect(kustomization.resources.sort()).toEqual(['configmap.yaml', 'deployment.yaml', 'service.yaml']);
  });

  it('points the service to the OS Service in hml', () => {
    const config = manifest<{ metadata: { name: string }; data: Record<string, string> }>('configmap.yaml');
    expect(config.metadata.name).toBe('auth-service-config');
    expect(config.data).toEqual({ APP_ENVIRONMENT: 'hml', OS_SERVICE_URL: 'http://os-service:8080' });
  });

  it('runs locked down, with the signing secret from the platform Secret and health probes', () => {
    const deployment = manifest<Deployment>('deployment.yaml');
    expect(deployment.metadata.name).toBe('auth-service');
    const pod = deployment.spec.template.spec;
    expect(pod.automountServiceAccountToken).toBe(false);
    expect(pod.securityContext).toMatchObject({ runAsNonRoot: true, runAsUser: 1000 });
    const [container] = pod.containers;
    expect(container?.image).toMatch(/^soat-oficina-auth:(?!latest$)/);
    expect(container?.ports).toEqual([{ name: 'http', containerPort: 8080 }]);
    expect(container?.envFrom).toEqual([{ configMapRef: { name: 'auth-service-config' } }]);
    expect(container?.env).toEqual([{ name: 'APP_JWT_SECRET', valueFrom: { secretKeyRef: { name: 'auth-service-secrets', key: 'APP_JWT_SECRET' } } }]);
    expect(container?.securityContext).toEqual({ allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } });
    expect(Object.keys(container?.resources.limits ?? {}).sort()).toEqual(['cpu', 'memory']);
    expect(container?.readinessProbe.httpGet).toEqual({ path: '/health', port: 'http' });
    expect(container?.livenessProbe.httpGet).toEqual({ path: '/health', port: 'http' });
  });

  it('publishes the service on node port 30084', () => {
    const service = manifest<{ metadata: { name: string }; spec: { type: string; ports: { port: number; nodePort: number }[] } }>('service.yaml');
    expect(service.metadata.name).toBe('auth-service');
    expect(service.spec.type).toBe('NodePort');
    expect(service.spec.ports).toEqual([expect.objectContaining({ port: 8080, nodePort: 30084 })]);
  });

  it('keeps only placeholders in the example secret', () => {
    const secret = manifest<{ metadata: { name: string }; stringData: Record<string, string> }>('secret.example.yaml');
    expect(secret.metadata.name).toBe('auth-service-secrets');
    expect(Object.keys(secret.stringData)).toEqual(['APP_JWT_SECRET']);
    expect(secret.stringData.APP_JWT_SECRET).toMatch(/^CHANGE_ME/);
  });
});
