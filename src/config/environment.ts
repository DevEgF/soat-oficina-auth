export type Environment = 'hml' | 'prod';

export function parseEnvironment(value: string | undefined): Environment {
  if (value === 'hml' || value === 'prod') return value;
  throw new Error('INVALID_ENVIRONMENT');
}
