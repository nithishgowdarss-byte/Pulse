import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { safeFetchJson } from '../lib/apiUtils';

export type AttendanceLogFilters = {
  branchId?: string | null;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  trainerId?: string | null;
};

export type AttendanceLogRow = {
  id: string;
  checked_in_at: string;
  checked_out_at?: string;
  method: string;
  notes?: string;
  branch_id?: string;
  checked_in_by?: string;
  checked_in_by_name?: string;
  member_name?: string;
  member_package?: string;
  member?: {
    id: string;
    full_name: string;
    phone: string;
    package_type?: string;
  };
  branch?: {
    id: string;
    name: string;
  };
  staff?: {
    id: string;
    full_name: string;
  };
};

export function useAttendanceLogs(filters: AttendanceLogFilters) {
  const [data, setData] = useState<AttendanceLogRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fromIso = dayjs(filters.from).startOf('day').toISOString();
      const toIso = dayjs(filters.to).endOf('day').toISOString();

      const params = new URLSearchParams();
      if (filters.branchId && filters.branchId !== 'all') params.set('branch_id', filters.branchId);
      if (filters.trainerId) params.set('trainer_id', filters.trainerId);
      params.set('from', fromIso);
      params.set('to', toIso);

      const json = await safeFetchJson<AttendanceLogRow[]>(
        `/api/attendance?${params.toString()}`,
        undefined,
        []
      );
      setData(json || []);
    } catch (err: any) {
      console.error('Error fetching attendance logs:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [filters.branchId, filters.from, filters.to, filters.trainerId]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchLogs,
  };
}
