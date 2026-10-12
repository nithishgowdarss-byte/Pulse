import { useState, useEffect, useCallback } from 'react';
import { PayrollSettlementLine } from '../types';
import { safeFetchJson } from '../lib/apiUtils';

export function usePayrollSettlementLines(params?: {
  periodMonth?: string;
  branchId?: string;
  trainerId?: string;
  status?: string;
}) {
  const { periodMonth, branchId, trainerId, status } = params || {};
  const [lines, setLines] = useState<PayrollSettlementLine[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchLines = useCallback(async () => {
    setIsLoading(true);
    try {
      const q = new URLSearchParams();
      if (periodMonth) q.append('p_period_month', periodMonth);
      if (branchId && branchId !== 'all') q.append('p_branch_id', branchId);
      if (trainerId && trainerId !== 'all') q.append('p_trainer_id', trainerId);
      if (status && status !== 'all') q.append('p_status', status);

      const data = await safeFetchJson<PayrollSettlementLine[]>(
        `/api/payroll/lines?${q.toString()}`,
        undefined,
        []
      );
      setLines(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [periodMonth, branchId, trainerId, status]);

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  return {
    lines,
    isLoading,
    refetch: fetchLines,
  };
}
