import { parseEnvironment, type Environment } from '../config/environment.js';
import type { CustomerRecord } from '../domain/customer.js';
import type { CustomerRepository } from '../ports/customerRepository.js';

interface CustomerQuery {
  query(sql: string, parameters: string[]): Promise<{ rows: CustomerRecord[] }>;
}

export class PostgresCustomerRepository implements CustomerRepository {
  constructor(private readonly pool: CustomerQuery) {}

  async findByCpf(cpf: string, environment: Environment): Promise<CustomerRecord | null> {
    const schema = parseEnvironment(environment);
    const result = await this.pool.query(
      `SELECT id, status FROM "${schema}".clientes WHERE documento = $1 LIMIT 1`,
      [cpf],
    );
    return result.rows[0] ?? null;
  }
}
