import { Member, Profile, CommissionSettlement, PlanPackage } from '../types';
import { PACKAGE_CONFIGS } from './membership';

/**
 * Gets default commission percentage rate for a package type
 */
export function getDefaultCommissionRate(packageType?: PlanPackage): number {
  if (!packageType) return 10;
  return PACKAGE_CONFIGS[packageType]?.defaultCommissionRate || 10;
}

/**
 * Calculates stored commission currency amount from amount paid and commission rate percentage
 */
export function calculateCommissionAmount(amountPaid: number, commissionRate: number): number {
  if (!amountPaid || amountPaid <= 0 || !commissionRate || commissionRate <= 0) return 0;
  return Math.round((amountPaid * commissionRate) / 100);
}

/**
 * Computes complete commission statistics for a specific trainer
 */
export function getTrainerCommissionStats(
  members: Member[],
  settlements: CommissionSettlement[],
  trainerId: string
) {
  // Filter active/expired members onboarded or trained by this trainer
  const trainerMembers = members.filter(m => m.onboarded_by === trainerId && m.status !== 'pending');

  const totalGrossRevenue = trainerMembers.reduce((acc, m) => acc + (m.amount_paid || 0), 0);
  
  // Total calculated commission earned across all activated memberships
  const totalCommissionEarned = trainerMembers.reduce((acc, m) => {
    const rate = m.commission_rate ?? getDefaultCommissionRate(m.package_type);
    const amountPaid = m.amount_paid || 0;
    return acc + calculateCommissionAmount(amountPaid, rate);
  }, 0);

  // Total commission paid through settlements
  const trainerSettlements = settlements.filter(s => s.trainer_id === trainerId);
  const paidSettlements = trainerSettlements.filter(s => s.status === 'paid');
  
  const totalCommissionPaid = paidSettlements.reduce((acc, s) => acc + (s.total_commission || 0), 0);
  const totalCommissionPending = Math.max(0, totalCommissionEarned - totalCommissionPaid);

  return {
    trainerId,
    clientCount: trainerMembers.length,
    totalGrossRevenue,
    totalCommissionEarned,
    totalCommissionPaid,
    totalCommissionPending,
    settlementHistory: trainerSettlements
  };
}

/**
 * Computes gym-wide commission overview for Owner Dashboard
 */
export function getAllTrainersCommissionOverview(
  members: Member[],
  settlements: CommissionSettlement[],
  trainers: Profile[]
) {
  const trainerSummaries = trainers.map(t => {
    const stats = getTrainerCommissionStats(members, settlements, t.id);
    return {
      trainer: t,
      ...stats
    };
  });

  const aggregatePendingCommissions = trainerSummaries.reduce((acc, t) => acc + t.totalCommissionPending, 0);
  const aggregatePaidCommissions = trainerSummaries.reduce((acc, t) => acc + t.totalCommissionPaid, 0);
  const aggregateEarnedCommissions = trainerSummaries.reduce((acc, t) => acc + t.totalCommissionEarned, 0);

  return {
    trainerSummaries,
    aggregateEarnedCommissions,
    aggregatePaidCommissions,
    aggregatePendingCommissions
  };
}
