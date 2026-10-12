import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { toast } from '../lib/toast';
import { safeFetchJson } from '../lib/apiUtils';

export const STALE_DAYS = 14;

export interface StaleMemberItem {
  id: string;
  full_name: string;
  phone: string;
  branch_id: string;
  branch_name?: string;
  status: string;
  end_date?: string;
  lastCheckIn: string | null;
  daysSince: number;
  isFlagged?: boolean;
}

export function useStaleMembers(branchId?: string | null) {
  const [data, setData] = useState<StaleMemberItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [flaggingMemberId, setFlaggingMemberId] = useState<string | null>(null);

  const fetchStale = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('days', String(STALE_DAYS));
      if (branchId && branchId !== 'all') {
        params.set('branch_id', branchId);
      }

      const rows = await safeFetchJson<StaleMemberItem[]>(
        `/api/retention/stale-members?${params.toString()}`,
        undefined,
        []
      );
      setData(rows || []);
    } catch (err: any) {
      console.error('Stale members fetch error:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchStale();
  }, [fetchStale]);

  const flagMutation = {
    isPending: flaggingMemberId !== null,
    flaggingId: flaggingMemberId,
    mutate: async (member: {
      id: string;
      full_name: string;
      branch_id: string;
      daysSince: number;
    }) => {
      setFlaggingMemberId(member.id);
      try {
        const res = await fetch('/api/retention/flag-stale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            member_id: member.id,
            branch_id: member.branch_id,
            days_since: member.daysSince,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to flag stale member');
        }

        toast.success(`Flagged ${member.full_name} in Retention Inbox & Staff Playbook`);
        setData((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, isFlagged: true } : m))
        );
      } catch (err: any) {
        toast.error(err.message || 'Failed to flag member');
      } finally {
        setFlaggingMemberId(null);
      }
    },
  };

  return {
    data,
    isLoading,
    error,
    refetch: fetchStale,
    flagMutation,
    STALE_DAYS,
  };
}
