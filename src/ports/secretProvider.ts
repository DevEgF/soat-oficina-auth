export interface SecretProvider {
  getJson<T>(arn: string): Promise<T>;
}
