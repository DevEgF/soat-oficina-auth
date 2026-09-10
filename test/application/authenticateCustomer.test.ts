import { expect, it, vi } from 'vitest';
import { AuthenticateCustomer } from '../../src/application/authenticateCustomer.js';
import { DependencyUnavailableError, InvalidCustomerError, MalformedCpfError } from '../../src/application/errors.js';

const id = '9a8db7aa-28ae-4fc1-b784-e6cd90364cb3';
function fixture() {
  const findByCpf = vi.fn().mockResolvedValue({ id, status: 'ACTIVE' });
  const issue = vi.fn().mockResolvedValue({ accessToken: 'synthetic-token', expiresIn: 900 });
  return { findByCpf, issue, useCase: new AuthenticateCustomer({ findByCpf }, { issue }) };
}
it('normalizes CPF, looks up once and issues a token using only customer UUID', async () => {
  const { useCase, findByCpf, issue } = fixture();
  await expect(useCase.execute({ cpf: '529.982.247-25', environment: 'hml' })).resolves.toEqual({ accessToken: 'synthetic-token', expiresIn: 900 });
  expect(findByCpf).toHaveBeenCalledExactlyOnceWith('52998224725', 'hml');
  expect(issue).toHaveBeenCalledExactlyOnceWith(id, 'hml');
});
it.each([null, { id, status: 'BLOCKED' }])('rejects missing/blocked customer uniformly', async customer => {
  const { useCase, findByCpf, issue } = fixture();
  findByCpf.mockResolvedValue(customer);
  await expect(useCase.execute({ cpf: '52998224725', environment: 'hml' })).rejects.toThrow(InvalidCustomerError);
  expect(issue).not.toHaveBeenCalled();
});
it('does not call dependencies for malformed CPF', async () => {
  const { useCase, findByCpf } = fixture();
  await expect(useCase.execute({ cpf: 'bad', environment: 'hml' })).rejects.toThrow(MalformedCpfError);
  expect(findByCpf).not.toHaveBeenCalled();
});
it.each(['findByCpf', 'issue'] as const)('maps dependency failure to a generic error', async dependency => {
  const mocks = fixture();
  mocks[dependency].mockRejectedValue(new Error('sensitive dependency detail'));
  await expect(mocks.useCase.execute({ cpf: '52998224725', environment: 'hml' })).rejects.toThrow(DependencyUnavailableError);
});
