import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { safeFetchJson } from '../lib/apiUtils';

export interface ReconciliationRow {
  period_month: string;
  branch_id?: string;
  branch_name?: string;
  trainer_id: string;
  trainer_name: string;
  pending_lines: number;
  paid_lines: number;
  void_lines: number;
  pending_amount: number;
  paid_amount: number;
  void_amount: number;
  earned_amount: number;
  variance?: number; // earned - (pending + paid) should be 0
}

export interface SettlementLineItem {
  id: string;
  trainer_id: string;
  trainer_name?: string;
  member_id?: string;
  member_name?: string;
  member_phone?: string;
  branch_id?: string;
  branch_name?: string;
  payment_id?: string;
  amount: number;
  rate_percent?: number;
  base_amount?: number;
  package_type?: string;
  status: 'pending' | 'paid' | 'void';
  period_month: string;
  created_at: string;
  paid_at?: string;
  paid_by?: string;
  notes?: string;
}

export function usePayrollReconciliation(month: string, branchId?: string | null) {
  const period = month
    ? dayjs(month.length === 7 ? `${month}-01` : month).startOf('month').format('YYYY-MM-DD')
    : dayjs().startOf('month').format('YYYY-MM-DD');

  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [totals, setTotals] = useState({
    earned: 0,
    pending: 0,
    paid: 0,
    void: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchReconciliation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('period_month', period);
      if (branchId && branchId !== 'all') {
        params.set('branch_id', branchId);
      }

      const data = await safeFetchJson<{ period_month: string; rows: ReconciliationRow[] }>(
        `/api/payroll-reconciliation?${params.toString()}`,
        undefined,
        null
      );
      const fetchedRows: ReconciliationRow[] = data?.rows || [];

      // Calculate variance per row
      const enhancedRows = fetchedRows.map((r) => {
        const earned = Number(r.earned_amount || 0);
        const pending = Number(r.pending_amount || 0);
        const paid = Number(r.paid_amount || 0);
        const variance = Math.round((earned - (pending + paid)) * 100) / 100;
        return {
          ...r,
          variance,
        };
      });

      setRows(enhancedRows);
      setTotals({
        earned: enhancedRows.reduce((s, r) => s + Number(r.earned_amount || 0), 0),
        pending: enhancedRows.reduce((s, r) => s + Number(r.pending_amount || 0), 0),
        paid: enhancedRows.reduce((s, r) => s + Number(r.paid_amount || 0), 0),
        void: enhancedRows.reduce((s, r) => s + Number(r.void_amount || 0), 0),
      });
    } catch (err: any) {
      console.error('Payroll reconciliation error:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [period, branchId]);

  useEffect(() => {
    fetchReconciliation();
  }, [fetchReconciliation]);

  return {
    period,
    rows,
    totals,
    isLoading,
    error,
    refetch: fetchReconciliation,
  };
}

export function usePayrollLines(opts: {
  period: string;
  trainerId?: string;
  branchId?: string | null;
}) {
  const [lines, setLines] = useState<SettlementLineItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLines = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('period_month', opts.period);
      if (opts.trainerId) params.set('trainer_id', opts.trainerId);
      if (opts.branchId && opts.branchId !== 'all') params.set('branch_id', opts.branchId);

      const res = await fetch(`/api/payroll-lines?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load settlement lines: ${res.statusText}`);
      }

      const data = await res.json();
      setLines(data || []);
    } catch (err: any) {
      console.error('Settlement lines fetch error:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [opts.period, opts.trainerId, opts.branchId]);

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  return {
    lines,
    isLoading,
    error,
    refetch: fetchLines,
  };
}

export function buildPayrollReconciliationCsv(rows: ReconciliationRow[], period: string): string {
  const header = [
    'Period Month',
    'Branch',
    'Trainer Name',
    'Earned Amount (₹)',
    'Pending Amount (₹)',
    'Paid Amount (₹)',
    'Void Amount (₹)',
    'Pending Lines',
    'Paid Lines',
    'Void Lines',
    'Reconciliation Variance (₹)',
  ];

  const lines = [header.join(',')];

  for (const r of rows) {
    const vals = [
      period,
      r.branch_name || 'All Branches',
      r.trainer_name || 'Trainer',
      r.earned_amount,
      r.pending_amount,
      r.paid_amount,
      r.void_amount,
      r.pending_lines,
      r.paid_lines,
      r.void_lines,
      r.variance ?? 0,
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`);

    lines.push(vals.join(','));
  }

  return lines.join('\n');
}
