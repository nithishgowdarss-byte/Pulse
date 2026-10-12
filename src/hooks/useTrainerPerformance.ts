import { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { Profile, Member, CommissionSettlement } from '../types';
import { safeFetchJson } from '../lib/apiUtils';

export type TrainerPerformanceItem = {
  trainerId: string;
  name: string;
  role: string;
  branchName?: string;
  activationsMtd: number;
  activeMembers: number;
  totalMembers: number;
  retentionRate: number;
  commissionEarnedMtd: number;
  pendingCommission: number;
};

export function useTrainerPerformance(branchId?: string | null) {
  const [data, setData] = useState<TrainerPerformanceItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [trainers, members, settlements, branches] = await Promise.all([
        safeFetchJson<Profile[]>('/api/trainers', undefined, []),
        safeFetchJson<Member[]>('/api/members', undefined, []),
        safeFetchJson<CommissionSettlement[]>('/api/commission-settlements', undefined, []),
        safeFetchJson<any[]>('/api/branches', undefined, []),
      ]);

      let trainerList = trainers || [];
      if (trainerList.length === 0) {
        const allProfs = await safeFetchJson<Profile[]>('/api/profiles', undefined, []);
        trainerList = (allProfs || []).filter((p) => p.role === 'trainer');
      }

      const branchList = branches || [];
      const memberList = members || [];
      const settlementList = settlements || [];

      const filteredTrainers = trainerList.filter((t) => {
        if (branchId && branchId !== 'all' && t.branch_id && t.branch_id !== branchId) return false;
        return true;
      });

      const today = dayjs().format('YYYY-MM-DD');

      const items: TrainerPerformanceItem[] = filteredTrainers.map((t) => {
        const mine = memberList.filter((m) => !m.is_archived && m.onboarded_by === t.id);
        
        // Activations MTD (start_date in this current calendar month)
        const activationsMtd = mine.filter((m) => {
          if (!m.start_date) return false;
          return dayjs(m.start_date).isSame(dayjs(), 'month');
        }).length;

        // Active members in trainer's client book
        const active = mine.filter((m) => m.status === 'active').length;
        const total = mine.length || 1;

        // Retained: active and membership end_date >= today
        const retained = mine.filter(
          (m) => m.status === 'active' && m.end_date && m.end_date >= today
        ).length;

        const retentionRate = Math.round((retained / total) * 100);

        // Calculate commissions
        const earnedFromMembers = mine.reduce((sum, m) => sum + (m.commission_amount || 0), 0);
        const settledForTrainer = settlements
          .filter((s) => s.trainer_id === t.id && s.status === 'paid')
          .reduce((sum, s) => sum + (s.total_commission || 0), 0);

        const pending = Math.max(0, earnedFromMembers - settledForTrainer);

        const matchedBranch = branchList.find((b) => b.id === t.branch_id);
        const branchName = t.branch_name || (matchedBranch ? matchedBranch.name : 'Pulse Fitness - Nagarabhavi');

        return {
          trainerId: t.id,
          name: t.full_name || 'Trainer',
          role: t.role,
          branchName,
          activationsMtd,
          activeMembers: active,
          totalMembers: mine.length,
          retentionRate,
          commissionEarnedMtd: earnedFromMembers,
          pendingCommission: pending,
        };
      });

      // Sort by activations MTD desc
      items.sort((a, b) => b.activationsMtd - a.activationsMtd);
      setData(items);
    } catch (err: any) {
      console.error('Failed to load trainer performance:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [branchId]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
  };
}
