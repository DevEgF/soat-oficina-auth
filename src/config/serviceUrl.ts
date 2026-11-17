// Base URL of a service this one calls: http or https, without credentials, query or fragment.
export function parseServiceUrl(value: string | undefined): string {
  let url: URL;
  try { url = new URL(value ?? ''); } catch { throw new Error('INVALID_SERVICE_URL'); }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname
    || url.username || url.password || url.search || url.hash) throw new Error('INVALID_SERVICE_URL');
  return url.href.replace(/\/+$/, '');
}
