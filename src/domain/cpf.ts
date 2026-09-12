export function normalizeAndValidateCpf(value: string): string {
  if (!/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(value)) throw new Error('INVALID_CPF');
  const digits = value.replace(/\D/g, '');
  if (/^(\d)\1{10}$/.test(digits)) throw new Error('INVALID_CPF');
  const check = (length: number): number => {
    const sum = digits.slice(0, length).split('').reduce((acc, digit, index) => acc + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  if (check(9) !== Number(digits[9]) || check(10) !== Number(digits[10])) throw new Error('INVALID_CPF');
  return digits;
}
