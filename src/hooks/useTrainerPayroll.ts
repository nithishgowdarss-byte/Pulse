import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { toast } from '../lib/toast';
import { safeFetchJson } from '../lib/apiUtils';

export interface TrainerPayrollSummary {
  trainerId: string;
  name: string;
  role?: string;
  branchName?: string;
  pending: number;
  paid: number;
  total: number;
  rowIdsPending: string[];
  rowIdsPaid: string[];
}

export function useTrainerPayroll(month?: string, branchId?: string | null) {
  const period = month
    ? dayjs(month.length === 7 ? `${month}-01` : month).startOf('month').format('YYYY-MM-DD')
    : dayjs().startOf('month').format('YYYY-MM-DD');

  const [trainers, setTrainers] = useState<TrainerPayrollSummary[]>([]);
  const [grandPending, setGrandPending] = useState<number>(0);
  const [grandPaid, setGrandPaid] = useState<number>(0);
  const [grandTotal, setGrandTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [dataUpdatedAt, setDataUpdatedAt] = useState<number>(Date.now());
  const [error, setError] = useState<Error | null>(null);

  const [isMarkingPaid, setIsMarkingPaid] = useState<boolean>(false);
  const [isMarkingPending, setIsMarkingPending] = useState<boolean>(false);

  const fetchData = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setIsFetching(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('period_month', period);
      if (branchId && branchId !== 'all') {
        params.set('branch_id', branchId);
      }

      const payload = await safeFetchJson<{
        trainers: TrainerPayrollSummary[];
        grandPending: number;
        grandPaid: number;
        grandTotal: number;
      }>(`/api/trainer-payroll?${params.toString()}`, undefined, null);

      if (payload) {
        setTrainers(payload.trainers || []);
        setGrandPending(payload.grandPending || 0);
        setGrandPaid(payload.grandPaid || 0);
        setGrandTotal((payload.grandPending || 0) + (payload.grandPaid || 0));
        setDataUpdatedAt(Date.now());
      }
    } catch (err: any) {
      console.error('Trainer payroll fetch error:', err);
      setError(err);
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [period, branchId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const markPaid = {
    isPending: isMarkingPaid,
    mutate: async (trainerId: string, customRowIds?: string[]) => {
      setIsMarkingPaid(true);
      try {
        const targetTrainer = trainers.find((t) => t.trainerId === trainerId);
        const rowIds = customRowIds || targetTrainer?.rowIdsPending || [];

        const res = await fetch('/api/trainer-payroll/mark-paid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trainer_id: trainerId,
            period_month: period,
            settlement_ids: rowIds,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to mark settlement as paid');
        }

        toast.success(`Marked commissions for ${targetTrainer?.name || 'Trainer'} as Paid`);
        await fetchData(true);
      } catch (err: any) {
        toast.error(err.message || 'Action failed');
      } finally {
        setIsMarkingPaid(false);
      }
    },
  };

  const markPending = {
    isPending: isMarkingPending,
    mutate: async (trainerId: string, customRowIds?: string[]) => {
      setIsMarkingPending(true);
      try {
        const targetTrainer = trainers.find((t) => t.trainerId === trainerId);
        const rowIds = customRowIds || targetTrainer?.rowIdsPaid || [];

        const res = await fetch('/api/trainer-payroll/mark-pending', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trainer_id: trainerId,
            period_month: period,
            settlement_ids: rowIds,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to revert settlement to pending');
        }

        toast.success(`Reverted commissions for ${targetTrainer?.name || 'Trainer'} to Pending`);
        await fetchData(true);
      } catch (err: any) {
        toast.error(err.message || 'Action failed');
      } finally {
        setIsMarkingPending(false);
      }
    },
  };

  return {
    period,
    trainers,
    grandPending,
    grandPaid,
    grandTotal,
    isLoading,
    isFetching,
    dataUpdatedAt,
    error,
    refetch: () => fetchData(false),
    markPaid,
    markPending,
  };
}
