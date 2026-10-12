// src/hooks/useExportMembersCsv.ts
import { useState } from 'react';
import { membersToCsv, downloadCsv, MemberCsvRow } from '../lib/exportMembersCsv';
import { Member, Branch, MemberExportFilter } from '../types';
import dayjs from 'dayjs';
import { toast } from '../lib/toast';

export async function exportFilteredMembersCsv(
  filter: MemberExportFilter,
  fallbackMembers?: Member[],
  branches?: Branch[]
): Promise<number> {
  let memberList: Member[] = [];

  // Try fetching fresh data from backend
  try {
    const res = await fetch('/api/members');
    if (res.ok) {
      memberList = await res.json();
    } else if (fallbackMembers) {
      memberList = [...fallbackMembers];
    }
  } catch {
    if (fallbackMembers) {
      memberList = [...fallbackMembers];
    }
  }

  // Filter out archived members
  let filtered = memberList.filter((m) => !m.is_archived);

  // 1. Branch filter
  if (filter.branchId && filter.branchId !== 'all') {
    filtered = filtered.filter((m) => m.branch_id === filter.branchId);
  }

  // 2. Status filter
  if (filter.status && filter.status !== 'all') {
    filtered = filtered.filter((m) => m.status === filter.status);
  }

  // 3. Balance dues only
  if (filter.balanceOnly) {
    filtered = filtered.filter((m) => Number(m.balance_due || 0) > 0);
  }

  // 4. Expiring within days
  if (filter.expiringWithinDays && filter.expiringWithinDays > 0) {
    const todayStr = dayjs().format('YYYY-MM-DD');
    const toStr = dayjs().add(filter.expiringWithinDays, 'day').format('YYYY-MM-DD');
    filtered = filtered.filter((m) => {
      if (!m.end_date) return false;
      return m.end_date >= todayStr && m.end_date <= toStr;
    });
  }

  // 5. Search query
  if (filter.search?.trim()) {
    const q = filter.search.trim().toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.full_name?.toLowerCase().includes(q) ||
        m.phone?.includes(q) ||
        m.email?.toLowerCase().includes(q)
    );
  }

  // Map to CSV rows
  const branchMap: Record<string, string> = {};
  if (branches) {
    branches.forEach((b) => {
      branchMap[b.id] = b.name;
    });
  }

  const rows: MemberCsvRow[] = filtered.map((m) => ({
    full_name: m.full_name,
    phone: m.phone,
    email: m.email || null,
    gender: m.gender || null,
    status: m.status || null,
    end_date: m.end_date || null,
    balance_due: m.balance_due ?? 0,
    package_type: m.package_type || null,
    branch_name: m.branch_name || branchMap[m.branch_id] || (m.branch_id === 'br_nag_1' ? 'Pulse Fitness - Nagarabhavi' : m.branch_id === 'br_rr_2' ? 'Pulse Fitness - RR Nagar' : 'Pulse Fitness - Banashankari'),
  }));

  const csv = membersToCsv(rows);
  const stamp = dayjs().format('YYYYMMDD-HHmm');
  downloadCsv(`pulse-members-${stamp}.csv`, csv);

  // Post audit log to backend
  try {
    await fetch('/api/export-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        export_type: 'members_csv',
        row_count: rows.length,
        branch_id: filter.branchId ?? null,
        meta: filter,
      }),
    });
  } catch (err) {
    console.warn('Failed to record export audit log', err);
  }

  return rows.length;
}

export function useExportMembersCsv(fallbackMembers?: Member[], branches?: Branch[]) {
  const [exporting, setExporting] = useState(false);

  const runExport = async (filter: MemberExportFilter = {}) => {
    setExporting(true);
    try {
      const count = await exportFilteredMembersCsv(filter, fallbackMembers, branches);
      toast.success(`Exported ${count} members to CSV`);
      return count;
    } catch (e: any) {
      toast.error(e?.message || 'Failed to export members CSV');
      throw e;
    } finally {
      setExporting(false);
    }
  };

  return { exporting, runExport };
}
