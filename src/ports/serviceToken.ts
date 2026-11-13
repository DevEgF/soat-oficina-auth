import type { Environment } from '../config/environment.js';

// Short-lived token this service presents when calling another service's internal API.
export interface ServiceToken {
  current(environment: Environment): Promise<string>;
}
