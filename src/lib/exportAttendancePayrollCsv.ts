import dayjs from 'dayjs';

export function buildAttendancePayrollCsv(rows: any[]): string {
  const header = [
    'date',
    'check_in_time',
    'member_name',
    'phone',
    'branch',
    'method',
    'checked_in_by',
    'notes',
  ];
  const lines = [header.join(',')];

  for (const r of rows) {
    const vals = [
      dayjs(r.checked_in_at).format('YYYY-MM-DD'),
      dayjs(r.checked_in_at).format('HH:mm:ss'),
      r.member?.full_name ?? r.member_name ?? '',
      r.member?.phone ?? '',
      r.branch?.name ?? r.branch_name ?? 'Main HQ',
      r.method ?? 'qr',
      r.staff?.full_name ?? r.checked_in_by_name ?? '',
      String(r.notes ?? '').replace(/"/g, '""'),
    ].map((v) => `"${String(v)}"`);
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/csv;charset=utf-8'
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
