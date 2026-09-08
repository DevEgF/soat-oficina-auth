export class MalformedCpfError extends Error {
  constructor() { super('INVALID_CPF'); }
}
export class InvalidCustomerError extends Error {
  constructor() { super('INVALID_CUSTOMER'); }
}
export class DependencyUnavailableError extends Error {
  constructor() { super('DEPENDENCY_UNAVAILABLE'); }
}
