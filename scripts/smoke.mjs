import { pathToFileURL } from 'node:url';

const requireThat = (condition, message) => { if (!condition) throw new Error(message); };

// Tokens and synthetic identity inputs remain in memory; failures name only the check.
export async function smoke(config, request = fetch) {
  const { API_URL, ENVIRONMENT, SMOKE_ACTIVE_CPF, SMOKE_BLOCKED_CPF, SMOKE_UNKNOWN_CPF,
    SMOKE_OTHER_ACTIVE_CPF, SMOKE_TRACKING_CODE, OTHER_API_URL } = config;
  requireThat(['hml', 'prod'].includes(ENVIRONMENT), 'Invalid smoke environment');
  for (const value of [API_URL, SMOKE_ACTIVE_CPF, SMOKE_BLOCKED_CPF, SMOKE_UNKNOWN_CPF,
    SMOKE_OTHER_ACTIVE_CPF, SMOKE_TRACKING_CODE]) requireThat(Boolean(value), 'Synthetic smoke fixtures are required');
  requireThat(ENVIRONMENT !== 'prod' || Boolean(OTHER_API_URL), 'Production smoke requires the hml endpoint');
  const base = new URL(API_URL);
  requireThat(base.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(base.hostname), 'Smoke requires HTTPS');
  const call = async (path, options = {}, origin = base) => {
    const response = await request(new URL(path, origin), { ...options, signal: AbortSignal.timeout(15000), redirect: 'error' });
    return { response, body: await response.json() };
  };
  const auth = cpf => call('/auth/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cpf }) });
  requireThat((await auth('123')).response.status === 400, 'Malformed CPF must return 400');
  const blocked = await auth(SMOKE_BLOCKED_CPF);
  const unknown = await auth(SMOKE_UNKNOWN_CPF);
  requireThat(blocked.response.status === 401 && unknown.response.status === 401 &&
    JSON.stringify(blocked.body) === JSON.stringify(unknown.body) && blocked.body.message === 'Unauthorized', 'Invalid-customer responses differ');
  const trackingPath = `/api/customer/os/acompanhar?codigo=${encodeURIComponent(SMOKE_TRACKING_CODE)}`;
  requireThat((await call(trackingPath)).response.status === 401, 'Missing identity must return 401');
  const active = await auth(SMOKE_ACTIVE_CPF);
  requireThat(active.response.status === 200 && active.response.headers.get('cache-control') === 'no-store' &&
    active.body.tokenType === 'Bearer' && active.body.expiresIn === 900 && typeof active.body.accessToken === 'string', 'Active authentication failed');
  let claims;
  try { claims = JSON.parse(Buffer.from(active.body.accessToken.split('.')[1], 'base64url').toString()); }
  catch { throw new Error('Invalid issued-token format'); }
  const approvedClaims = ['iss', 'aud', 'sub', 'iat', 'exp', 'env', 'scope'];
  requireThat(Object.keys(claims).every(key => approvedClaims.includes(key)) &&
    claims.iss === 'oficina' && claims.aud === 'oficina-api' && claims.env === ENVIRONMENT &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.sub) &&
    JSON.stringify(claims.scope) === '["CUSTOMER"]' && claims.exp - claims.iat === 900, 'Issued claims violate the contract');
  const owned = await call(trackingPath, { headers: { authorization: `Bearer ${active.body.accessToken}` } });
  requireThat(owned.response.status === 200, 'Owned work order must be accessible');
  requireThat(Boolean(owned.response.headers.get('x-correlation-id')), 'Spring correlation header missing');
  const other = await auth(SMOKE_OTHER_ACTIVE_CPF);
  requireThat(other.response.status === 200 && typeof other.body.accessToken === 'string', 'Second active fixture must authenticate');
  requireThat((await call(trackingPath, { headers: { authorization: `Bearer ${other.body.accessToken}` } })).response.status === 404, 'Foreign work order must return 404');
  if (OTHER_API_URL) {
    const denied = await call(trackingPath, { headers: { authorization: `Bearer ${active.body.accessToken}` } }, new URL(OTHER_API_URL));
    // HTTP API simple authorizer denies with 403; missing identity is 401.
    requireThat(denied.response.status === 403, 'Cross-environment token must be denied by the authorizer');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await smoke(process.env);
    console.log('Authentication, ownership and environment smoke passed.');
  } catch {
    console.error('Authentication smoke failed; verify synthetic fixtures, migrations and service health.');
    process.exitCode = 1;
  }
}
