import { expect, it } from 'vitest';
import { parseServiceUrl } from '../../src/config/serviceUrl.js';

it.each([
  ['http://os-service:8080', 'http://os-service:8080'],
  ['http://os-service:8080/', 'http://os-service:8080'],
  ['https://os.example.com/oficina/', 'https://os.example.com/oficina'],
])('accepts %s', (value, expected) => {
  expect(parseServiceUrl(value)).toBe(expected);
});

it.each([undefined, '', 'os-service', 'file:///etc/hosts', 'http://a:b@os-service', 'http://os-service?x=1', 'http://os-service#x'])(
  'rejects %j', value => {
    expect(() => parseServiceUrl(value)).toThrow('INVALID_SERVICE_URL');
  },
);
