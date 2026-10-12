import { useState, useEffect, useCallback } from 'react';
import { WinbackCampaign, WinbackEnrollment, WinbackAttempt, Member } from '../types';
import { toast } from '../lib/toast';
import { safeFetchJson } from '../lib/apiUtils';

export interface HydratedEnrollment extends WinbackEnrollment {
  member?: Member;
  prediction?: any;
}

export interface CampaignRunReport {
  success: boolean;
  campaign_id: string;
  campaign_name: string;
  examined_active: number;
  enrolled_new: number;
  sent: number;
  skipped_silence_hours: number;
  suppressed: number;
  exhausted: number;
  is_silence_hours: boolean;
  errors: string[];
  executed_at: string;
}

export function useWinbackCampaigns(branchId?: string, statusFilter?: string, searchQuery?: string) {
  const [campaigns, setCampaigns] = useState<WinbackCampaign[]>([]);
  const [enrollments, setEnrollments] = useState<HydratedEnrollment[]>([]);
  const [attempts, setAttempts] = useState<WinbackAttempt[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isEnrolling, setIsEnrolling] = useState<boolean>(false);
  const [lastReport, setLastReport] = useState<CampaignRunReport | null>(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      const data = await safeFetchJson<WinbackCampaign[]>('/api/winback/campaigns', undefined, []);
      setCampaigns(data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchEnrollments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (branchId && branchId !== 'all') params.append('branch_id', branchId);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);

      const data = await safeFetchJson<HydratedEnrollment[]>(
        `/api/winback/enrollments?${params.toString()}`,
        undefined,
        []
      );
      setEnrollments(data || []);
    } catch (err) {
      console.error(err);
    }
  }, [branchId, statusFilter, searchQuery]);

  const fetchAttempts = useCallback(async () => {
    try {
      const data = await safeFetchJson<WinbackAttempt[]>('/api/winback/attempts', undefined, []);
      setAttempts(data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchCampaigns(), fetchEnrollments(), fetchAttempts()]);
    setIsLoading(false);
  }, [fetchCampaigns, fetchEnrollments, fetchAttempts]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => {
      fetchEnrollments();
      fetchAttempts();
    }, 8000);
    return () => clearInterval(interval);
  }, [fetchAll, fetchEnrollments, fetchAttempts]);

  const runCampaign = async (options?: { campaignId?: string; forceBypassSilence?: boolean }): Promise<CampaignRunReport> => {
    setIsRunning(true);
    try {
      const res = await fetch('/api/winback/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: options?.campaignId,
          force_bypass_silence: options?.forceBypassSilence,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Run failed' }));
        throw new Error(err.error || 'Campaign execution failed');
      }

      const report: CampaignRunReport = await res.json();
      setLastReport(report);
      await Promise.all([fetchEnrollments(), fetchAttempts()]);

      if (report.sent > 0) {
        toast.success(`🎯 Win-Back Dispatched: ${report.sent} touches sent (${report.enrolled_new} newly enrolled)`);
      } else if (report.skipped_silence_hours > 0) {
        toast.warning(`🌙 Silence Hours Active (IST 21:00-08:00): ${report.skipped_silence_hours} WhatsApp/SMS buffered.`, {
          duration: 6000,
        });
      } else {
        toast.info(`Win-back evaluation complete: ${report.examined_active} examined, 0 sent (cooldown or converted).`);
      }

      return report;
    } catch (err: any) {
      toast.error(err.message || 'Campaign dispatch failed');
      throw err;
    } finally {
      setIsRunning(false);
    }
  };

  const enrollMember = async ({ memberId, campaignId }: { memberId: string; campaignId?: string }) => {
    setIsEnrolling(true);
    try {
      const res = await fetch('/api/winback/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, campaign_id: campaignId }),
      });
      if (!res.ok) throw new Error('Failed to enroll member');
      await fetchEnrollments();
      toast.success('Member enrolled in win-back campaign');
    } catch (err: any) {
      toast.error(err.message || 'Failed to enroll member');
    } finally {
      setIsEnrolling(false);
    }
  };

  return {
    campaigns,
    enrollments,
    attempts,
    isLoading,
    isRunning,
    lastReport,
    isEnrolling,
    runCampaign,
    enrollMember,
    refetch: fetchAll,
  };
}
