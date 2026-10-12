// src/hooks/useChurnRiskDistribution.ts
import { useState, useEffect, useCallback } from 'react';

export type BranchRiskRow = {
  branch_id: string | null;
  branch_name: string;
  low: number;
  medium: number;
  high: number;
  critical: number;
  total: number;
  avg_probability: number;
};

export function useChurnRiskDistribution(branchFilter?: string) {
  const [data, setData] = useState<BranchRiskRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDistribution = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const url = `/api/retention/churn-risk-distribution${
        branchFilter && branchFilter !== 'all' ? `?branch_id=${branchFilter}` : ''
      }`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to fetch churn risk distribution');
      }
      const json = await res.json();
      setData(json.distribution || json || []);
    } catch (err: any) {
      console.error('Error fetching churn risk distribution:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [branchFilter]);

  useEffect(() => {
    fetchDistribution();
  }, [fetchDistribution]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchDistribution,
  };
}
