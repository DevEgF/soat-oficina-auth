import { expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';

it.each(['hml', 'prod'])('accepts exact deployment environment', value => {
  expect(parseEnvironment(value)).toBe(value);
});
it.each(['production', '', undefined, 'HML', 'hml;drop schema prod'])('rejects other environments', value => {
  expect(() => parseEnvironment(value)).toThrow('INVALID_ENVIRONMENT');
});
