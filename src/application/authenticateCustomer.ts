import { normalizeAndValidateCpf } from '../domain/cpf.js';
import { parseEnvironment, type Environment } from '../config/environment.js';
import type { CustomerRepository } from '../ports/customerRepository.js';
import type { CustomerJwt, IssuedCustomerToken } from '../ports/customerJwt.js';
import { DependencyUnavailableError, InvalidCustomerError, MalformedCpfError } from './errors.js';

export class AuthenticateCustomer {
  constructor(private readonly customers: CustomerRepository, private readonly jwt: Pick<CustomerJwt, 'issue'>) {}

  async execute(input: { cpf: string; environment: Environment }): Promise<IssuedCustomerToken> {
    const environment = parseEnvironment(input.environment);
    let cpf: string;
    try { cpf = normalizeAndValidateCpf(input.cpf); } catch { throw new MalformedCpfError(); }
    try {
      const customer = await this.customers.findByCpf(cpf, environment);
      if (!customer || customer.status !== 'ACTIVE') throw new InvalidCustomerError();
      return await this.jwt.issue(customer.id, environment);
    } catch (error) {
      if (error instanceof InvalidCustomerError) throw error;
      throw new DependencyUnavailableError();
    }
  }
}
