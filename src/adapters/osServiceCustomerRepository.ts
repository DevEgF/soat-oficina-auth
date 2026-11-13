import { parseEnvironment, type Environment } from '../config/environment.js';
import type { CustomerRecord } from '../domain/customer.js';
import type { CustomerRepository } from '../ports/customerRepository.js';
import type { ServiceToken } from '../ports/serviceToken.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Customers belong to the OS Service: this adapter asks its internal API instead of reading the
 * database. Errors carry only a fixed code, never the document, the URL or the token.
 */
export class OsServiceCustomerRepository implements CustomerRepository {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly token: ServiceToken, private readonly timeoutMs = 2_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async findByCpf(cpf: string, environment: Environment): Promise<CustomerRecord | null> {
    const bearer = await this.token.current(parseEnvironment(environment));
    let status: number;
    let text: string;
    try {
      // One deadline for the whole exchange: connection, headers and body.
      const response = await fetch(`${this.baseUrl}/api/internal/customers/${encodeURIComponent(cpf)}`, {
        headers: { accept: 'application/json', authorization: `Bearer ${bearer}` },
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      status = response.status;
      text = await response.text();
    } catch {
      throw new Error('CUSTOMER_SERVICE_UNAVAILABLE');
    }
    if (status === 404) return null;
    if (status !== 200) throw new Error('CUSTOMER_SERVICE_UNEXPECTED_STATUS');
    return parseCustomer(text);
  }
}

function parseCustomer(text: string): CustomerRecord {
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new Error('INVALID_CUSTOMER_RESPONSE'); }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const { id, status } = body as Record<string, unknown>;
    if (typeof id === 'string' && uuid.test(id) && (status === 'ACTIVE' || status === 'BLOCKED')) return { id, status };
  }
  throw new Error('INVALID_CUSTOMER_RESPONSE');
}
