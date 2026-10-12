// src/lib/staffQr.ts
export function buildStaffQrValue(staff: { id: string; branch_id?: string | null }): string {
  return `PULSE:STAFF:${staff.id}:${staff.branch_id || ''}`;
}

export function parseStaffQrValue(raw: string): { id: string; branchId: string | null } | null {
  const clean = String(raw || '').trim();
  // Support both UUID and standard profile IDs (e.g. usr_trainer_1 or standard UUIDs)
  const m = clean.match(/^PULSE:STAFF:([0-9a-zA-Z_\-]+):(.*)$/i);
  if (!m) return null;
  return { id: m[1], branchId: m[2] ? m[2] : null };
}
