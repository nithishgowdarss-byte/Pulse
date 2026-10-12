// src/lib/paymentImport.ts
import { normalizePhone10, isValidIndianMobile10 } from './phone';

export type PaymentImportValid = {
  rowNumber: number;
  phone: string;
  amount: number;
  method: 'upi' | 'cash' | 'card' | 'bank_transfer';
  entry_type: 'new' | 'renewal' | 'balance';
  entry_date: string;
  reference: string | null;
  notes: string | null;
  package_type: string | null;
  list_price: number | null;
  months: number | null;
  full_name: string | null;
  idempotency_key: string;
};

export type PaymentImportError = {
  rowNumber: number;
  field?: string;
  message: string;
};

const METHODS = new Set(['upi', 'cash', 'card', 'bank_transfer']);
const ENTRY_TYPES = new Set(['new', 'renewal', 'balance']);

const HEADER_MAP: Record<string, string> = {
  phone: 'phone',
  mobile: 'phone',
  phone_number: 'phone',
  amount: 'amount',
  price: 'amount',
  amount_paid: 'amount',
  method: 'method',
  mode: 'method',
  payment_mode: 'method',
  entry_type: 'entry_type',
  type: 'entry_type',
  entry_date: 'entry_date',
  date: 'entry_date',
  payment_date: 'entry_date',
  reference: 'reference',
  txn_id: 'reference',
  notes: 'notes',
  package_type: 'package_type',
  package: 'package_type',
  list_price: 'list_price',
  months: 'months',
  duration: 'months',
  full_name: 'full_name',
  name: 'full_name',
  idempotency_key: 'idempotency_key',
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

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function parseAndValidatePaymentCsv(text: string): {
  valid: PaymentImportValid[];
  errors: PaymentImportError[];
  totalRows: number;
} {
  const errors: PaymentImportError[] = [];
  const valid: PaymentImportValid[] = [];
  const seenKeys = new Set<string>();

  if (!text?.trim()) {
    return { valid: [], errors: [{ rowNumber: 0, message: 'File is empty' }], totalRows: 0 };
  }

  const matrix = parseCsv(text.replace(/^\uFEFF/, ''));
  if (matrix.length < 2) {
    return {
      valid: [],
      errors: [{ rowNumber: 0, message: 'Need header + at least one data row' }],
      totalRows: 0,
    };
  }

  const headers = matrix[0].map((h) => HEADER_MAP[normHeader(h)] || normHeader(h));
  if (!headers.includes('phone') || !headers.includes('amount') || !headers.includes('method')) {
    return {
      valid: [],
      errors: [{ rowNumber: 0, message: 'Required columns: phone, amount, method' }],
      totalRows: matrix.length - 1,
    };
  }

  const hasType = headers.includes('entry_type');

  for (let i = 1; i < matrix.length; i++) {
    const rowNumber = i + 1;
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = (matrix[i][idx] ?? '').trim();
    });

    const phone = normalizePhone10(raw.phone || '');
    if (!phone || !isValidIndianMobile10(phone)) {
      errors.push({ rowNumber, field: 'phone', message: 'Invalid 10-digit Indian mobile' });
      continue;
    }

    const amount = Number(raw.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push({ rowNumber, field: 'amount', message: 'amount must be > 0' });
      continue;
    }

    let method = (raw.method || '').toLowerCase().replace(/\s+/g, '_');
    if (['gpay', 'google_pay', 'phonepe', 'bhim', 'paytm'].includes(method)) method = 'upi';
    if (!METHODS.has(method)) {
      errors.push({
        rowNumber,
        field: 'method',
        message: 'method must be upi, cash, card, or bank_transfer',
      });
      continue;
    }

    let entry_type = (hasType ? raw.entry_type || 'balance' : 'balance').toLowerCase().trim();
    if (entry_type === 'n') entry_type = 'new';
    if (entry_type === 'r') entry_type = 'renewal';
    if (entry_type === 'b') entry_type = 'balance';
    if (!ENTRY_TYPES.has(entry_type)) {
      errors.push({
        rowNumber,
        field: 'entry_type',
        message: 'entry_type must be new, renewal, or balance (or N/R/B)',
      });
      continue;
    }

    let entry_date = raw.entry_date ? parseDate(raw.entry_date) : todayIST();
    if (raw.entry_date && !entry_date) {
      errors.push({
        rowNumber,
        field: 'entry_date',
        message: 'Use YYYY-MM-DD or DD/MM/YYYY',
      });
      continue;
    }

    let months: number | null = null;
    if (raw.months) {
      months = Number(raw.months);
      if (!Number.isInteger(months) || months < 1 || months > 12) {
        errors.push({ rowNumber, field: 'months', message: 'months 1–12' });
        continue;
      }
    }

    let list_price: number | null = null;
    if (raw.list_price) {
      list_price = Number(raw.list_price);
      if (!Number.isFinite(list_price) || list_price < 0) {
        errors.push({ rowNumber, field: 'list_price', message: 'Invalid list_price' });
        continue;
      }
    }

    const idempotency_key =
      raw.idempotency_key ||
      `imp:${phone}:${amount}:${method}:${entry_type}:${entry_date}:${rowNumber}`;

    if (seenKeys.has(idempotency_key)) {
      errors.push({ rowNumber, field: 'idempotency_key', message: 'Duplicate key in file' });
      continue;
    }
    seenKeys.add(idempotency_key);

    valid.push({
      rowNumber,
      phone,
      amount,
      method: method as PaymentImportValid['method'],
      entry_type: entry_type as PaymentImportValid['entry_type'],
      entry_date: entry_date!,
      reference: raw.reference || null,
      notes: raw.notes || null,
      package_type: raw.package_type || null,
      list_price,
      months,
      full_name: raw.full_name || null,
      idempotency_key,
    });
  }

  return { valid, errors, totalRows: matrix.length - 1 };
}
