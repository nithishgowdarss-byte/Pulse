/**
 * Phone utilities for Pulse Fitness
 * Handles Indian phone number validation, E.164 normalization, and duplicate matching.
 */

export function normalizeIndianPhone(input: string): string {
  if (!input) return '';
  // Remove all non-digit characters
  let digits = input.replace(/\D/g, '');

  // If starts with 91 and has 12 digits, strip 91
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length > 10 && digits.startsWith('0')) {
    // If starts with leading zero (e.g. 09876543210), strip zeros
    digits = digits.replace(/^0+/, '');
  }

  // If we have 10 digits, return formatted clean 10-digit number
  if (digits.length === 10) {
    return digits;
  }

  return digits;
}

export function formatPhoneDisplay(phoneStr: string): string {
  const clean = normalizeIndianPhone(phoneStr);
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return phoneStr;
}

export function isValidIndianMobile(phoneStr: string): boolean {
  const clean = normalizeIndianPhone(phoneStr);
  // Valid Indian mobile numbers are 10 digits starting with 6, 7, 8, or 9
  return /^[6-9]\d{9}$/.test(clean);
}

export function arePhonesEqual(phone1: string, phone2: string): boolean {
  const norm1 = normalizeIndianPhone(phone1);
  const norm2 = normalizeIndianPhone(phone2);
  if (norm1 && norm2 && norm1 === norm2) return true;
  return false;
}
