// src/lib/phone.ts
import { normalizeIndianPhone, isValidIndianMobile, formatPhoneDisplay } from './phoneUtils';

export function normalizePhone10(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = normalizeIndianPhone(String(input));
  return digits.length === 10 ? digits : null;
}

export function isValidIndianMobile10(input: string | null | undefined): boolean {
  if (!input) return false;
  return isValidIndianMobile(String(input));
}

export function phone10(input: string | null | undefined): string | null {
  return normalizePhone10(input);
}

export { normalizeIndianPhone, isValidIndianMobile, formatPhoneDisplay };
