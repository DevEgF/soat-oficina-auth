import type { Environment } from '../config/environment.js';
import type { CustomerRecord } from '../domain/customer.js';

export interface CustomerRepository {
  findByCpf(cpf: string, environment: Environment): Promise<CustomerRecord | null>;
}
