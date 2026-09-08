import { describe, expect, it } from 'vitest';
import { normalizeAndValidateCpf } from '../../src/domain/cpf.js';

describe('CPF validation', () => {
  it.each(['52998224725', '529.982.247-25'])('normalizes accepted format', value => {
    expect(normalizeAndValidateCpf(value)).toBe('52998224725');
  });
  it.each(['11111111111', '00000000000', '52998224724', '123', '', 'abc52998224725', '529982247250'])('rejects invalid input without disclosing it', value => {
    expect(() => normalizeAndValidateCpf(value)).toThrow('INVALID_CPF');
  });
});
