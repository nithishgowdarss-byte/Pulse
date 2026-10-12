// src/lib/contactImport.ts
import { normalizePhone10, isValidIndianMobile10 } from './phone';

export type ImportRowValid = {
  rowNumber: number;
  full_name: string;
  phone: string;
  gender: string | null;
  age: number | null;
  email: string | null;
  start_date: string | null;
  end_date: string | null;
  months: number | null;
  package_type: string | null;
  amount_paid: number;
  balance_due: number;
  status: 'pending' | 'active' | 'expired';
  notes: string | null;
};

export type ImportRowError = {
  rowNumber: number;
  field?: string;
  message: string;
};

const HEADER_MAP: Record<string, string> = {
  full_name: 'full_name',
  name: 'full_name',
  member_name: 'full_name',
  phone: 'phone',
  mobile: 'phone',
  phone_number: 'phone',
  gender: 'gender',
  sex: 'gender',
  age: 'age',
  email: 'email',
  start_date: 'start_date',
  end_date: 'end_date',
  months: 'months',
  duration: 'months',
  package_type: 'package_type',
  package: 'package_type',
  plan: 'package_type',
  amount_paid: 'amount_paid',
  paid: 'amount_paid',
  balance_due: 'balance_due',
  balance: 'balance_due',
  due: 'balance_due',
  status: 'status',
  notes: 'notes',
};

function normHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, '_');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(cur.trim());
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && next === '\n') i++;
      row.push(cur.trim());
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  row.push(cur.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

function parseDate(v: string): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

export function parseAndValidateMemberCsv(text: string): {
  valid: ImportRowValid[];
  errors: ImportRowError[];
  totalRows: number;
} {
  const errors: ImportRowError[] = [];
  const valid: ImportRowValid[] = [];

  if (!text?.trim()) {
    return { valid: [], errors: [{ rowNumber: 0, message: 'File is empty' }], totalRows: 0 };
  }

  const matrix = parseCsv(text.replace(/^\uFEFF/, ''));
  if (matrix.length < 2) {
    return {
      valid: [],
      errors: [{ rowNumber: 0, message: 'CSV needs header + at least one data row' }],
      totalRows: 0,
    };
  }

  const headers = matrix[0].map((h) => HEADER_MAP[normHeader(h)] || normHeader(h));
  if (!headers.includes('full_name') || !headers.includes('phone')) {
    return {
      valid: [],
      errors: [{ rowNumber: 0, message: 'Required columns: full_name (or name), phone (or mobile)' }],
      totalRows: matrix.length - 1,
    };
  }

  const seen = new Set<string>();

  for (let i = 1; i < matrix.length; i++) {
    const rowNumber = i + 1;
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = (matrix[i][idx] ?? '').trim();
    });

    const full_name = (raw.full_name || '').trim();
    if (!full_name) {
      errors.push({ rowNumber, field: 'full_name', message: 'Name is required' });
      continue;
    }

    const phone = normalizePhone10(raw.phone || '');
    if (!phone || !isValidIndianMobile10(phone)) {
      errors.push({
        rowNumber,
        field: 'phone',
        message: 'Invalid Indian mobile (10 digits, starts with 6–9)',
      });
      continue;
    }
    if (seen.has(phone)) {
      errors.push({ rowNumber, field: 'phone', message: `Duplicate in file: ${phone}` });
      continue;
    }
    seen.add(phone);

    let status = (raw.status || 'active').toLowerCase();
    if (!['pending', 'active', 'expired'].includes(status)) {
      errors.push({ rowNumber, field: 'status', message: 'status must be pending, active, or expired' });
      continue;
    }

    let months: number | null = null;
    if (raw.months) {
      months = Number(raw.months);
      if (!Number.isInteger(months) || months < 1 || months > 12) {
        errors.push({ rowNumber, field: 'months', message: 'months must be 1–12' });
        continue;
      }
    }

    const amount_paid = raw.amount_paid ? Number(raw.amount_paid) : 0;
    const balance_due = raw.balance_due ? Number(raw.balance_due) : 0;
    if (Number.isNaN(amount_paid) || amount_paid < 0) {
      errors.push({ rowNumber, field: 'amount_paid', message: 'Invalid amount_paid' });
      continue;
    }
    if (Number.isNaN(balance_due) || balance_due < 0) {
      errors.push({ rowNumber, field: 'balance_due', message: 'Invalid balance_due' });
      continue;
    }

    let age: number | null = null;
    if (raw.age) {
      age = Number(raw.age);
      if (!Number.isInteger(age) || age < 10 || age > 100) {
        errors.push({ rowNumber, field: 'age', message: 'age must be between 10 and 100' });
        continue;
      }
    }

    const start_date = raw.start_date ? parseDate(raw.start_date) : null;
    if (raw.start_date && !start_date) {
      errors.push({ rowNumber, field: 'start_date', message: 'Use YYYY-MM-DD or DD/MM/YYYY' });
      continue;
    }
    const end_date = raw.end_date ? parseDate(raw.end_date) : null;
    if (raw.end_date && !end_date) {
      errors.push({ rowNumber, field: 'end_date', message: 'Use YYYY-MM-DD or DD/MM/YYYY' });
      continue;
    }

    if (raw.email && !raw.email.includes('@')) {
      errors.push({ rowNumber, field: 'email', message: 'Invalid email address' });
      continue;
    }

    let gender = (raw.gender || '').toLowerCase() || null;
    if (gender === 'm') gender = 'male';
    if (gender === 'f') gender = 'female';
    if (gender && !['male', 'female', 'other'].includes(gender)) {
      errors.push({ rowNumber, field: 'gender', message: 'gender must be male, female, or other' });
      continue;
    }

    valid.push({
      rowNumber,
      full_name,
      phone,
      gender,
      age,
      email: raw.email || null,
      start_date,
      end_date,
      months,
      package_type: raw.package_type || null,
      amount_paid,
      balance_due,
      status: status as ImportRowValid['status'],
      notes: raw.notes || null,
    });
  }

  return { valid, errors, totalRows: matrix.length - 1 };
}
