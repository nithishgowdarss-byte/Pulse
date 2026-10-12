import { useState, useEffect, useCallback } from 'react';
import { MemberChurnPrediction } from '../types';
import { toast } from '../lib/toast';
import { safeFetchJson } from '../lib/apiUtils';

export interface ChurnPredictionSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  avg_churn_rate_percent: number;
}

export interface ChurnPredictionsResponse {
  predictions: MemberChurnPrediction[];
  summary: ChurnPredictionSummary;
  in_silence_hours: boolean;
}

export function useChurnPredictions(branchId?: string, band?: string, search?: string) {
  const [predictions, setPredictions] = useState<MemberChurnPrediction[]>([]);
  const [summary, setSummary] = useState<ChurnPredictionSummary>({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    avg_churn_rate_percent: 0,
  });
  const [inSilenceHours, setInSilenceHours] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchPredictions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (branchId && branchId !== 'all') params.append('branch_id', branchId);
      if (band && band !== 'all') params.append('band', band);
      if (search) params.append('search', search);

      const data = await safeFetchJson<ChurnPredictionsResponse>(
        `/api/churn/predictions?${params.toString()}`,
        undefined,
        null
      );
      if (data) {
        setPredictions(data.predictions || []);
        setSummary(data.summary || {
          total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          avg_churn_rate_percent: 0,
        });
        setInSilenceHours(data.in_silence_hours || false);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [branchId, band, search]);

  useEffect(() => {
    fetchPredictions();
    const interval = setInterval(fetchPredictions, 10000);
    return () => clearInterval(interval);
  }, [fetchPredictions]);

  const refreshPredictions = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/churn/refresh', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to recalculate churn probabilities');
      const data = await res.json();
      await fetchPredictions();
      toast.success(`ML Churn Predictions Recalculated: ${data.updated} members updated`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to recalculate predictions');
    } finally {
      setIsRefreshing(false);
    }
  };

  return {
    predictions,
    summary,
    inSilenceHours,
    isLoading,
    isRefreshing,
    refreshPredictions,
    refetch: fetchPredictions,
  };
}
