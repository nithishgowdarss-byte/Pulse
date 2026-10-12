// src/hooks/useSalesTotals.ts
import { useState, useEffect, useCallback } from 'react';
import { SalesTotalsData } from '../types';
import { safeFetchJson } from '../lib/apiUtils';

export function useSalesTotals(branchId?: string | null, day?: string) {
  const [data, setData] = useState<SalesTotalsData>({ day: 0, week: 0, month: 0 });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFetching, setIsFetching] = useState<boolean>(false);

  const fetchTotals = useCallback(async () => {
    setIsFetching(true);
    try {
      const pDay = day || new Date().toISOString().slice(0, 10);
      const params = new URLSearchParams();
      if (branchId && branchId !== 'all') params.set('branch_id', branchId);
      params.set('day', pDay);

      const res = await safeFetchJson<SalesTotalsData>(`/api/sales-totals?${params.toString()}`, undefined, {
        day: 0,
        week: 0,
        month: 0
      });

      if (res) {
        setData(res);
      }
    } catch (e) {
      console.error('Error fetching sales totals:', e);
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [branchId, day]);

  useEffect(() => {
    fetchTotals();
    const interval = setInterval(fetchTotals, 15000);
    return () => clearInterval(interval);
  }, [fetchTotals]);

  return { data, isLoading, isFetching, refetch: fetchTotals };
}
