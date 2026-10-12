// src/lib/exportMembersCsv.ts
export type MemberCsvRow = {
  full_name: string;
  phone: string | null;
  email?: string | null;
  gender?: string | null;
  status?: string | null;
  end_date?: string | null;
  balance_due?: number | null;
  package_type?: string | null;
  branch_name?: string | null;
};

function esc(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function membersToCsv(rows: MemberCsvRow[]): string {
  const header = [
    'full_name',
    'phone',
    'email',
    'gender',
    'status',
    'end_date',
    'balance_due',
    'package_type',
    'branch',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    const phone = String(r.phone || '').replace(/\D/g, '').slice(-10);
    lines.push(
      [
        esc(r.full_name),
        esc(phone ? `91${phone}` : ''),
        esc(r.email || ''),
        esc(r.gender || ''),
        esc(r.status || ''),
        esc(r.end_date || ''),
        esc(r.balance_due ?? ''),
        esc(r.package_type || ''),
        esc(r.branch_name || ''),
      ].join(',')
    );
  }
  return lines.join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
