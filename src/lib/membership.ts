import { Member, MemberStatus, PlanPackage, PackageConfig } from '../types';

export const PACKAGE_CONFIGS: Record<PlanPackage, PackageConfig> = {
  'General Gym': {
    name: 'General Gym',
    pricePerMonth: 2000,
    defaultCommissionRate: 10,
    description: 'Standard cardio + weights gym access'
  },
  'Personal Training (PT)': {
    name: 'Personal Training (PT)',
    pricePerMonth: 5000,
    defaultCommissionRate: 20,
    description: '1-on-1 dedicated fitness & diet coaching'
  },
  'Cardio & HIIT Special': {
    name: 'Cardio & HIIT Special',
    pricePerMonth: 3500,
    defaultCommissionRate: 15,
    description: 'High intensity fat-loss group training'
  },
  'VIP Annual Membership': {
    name: 'VIP Annual Membership',
    pricePerMonth: 2000, // 24,000 yearly
    defaultCommissionRate: 15,
    description: 'All access + locker + sauna pass'
  },
  'Student Plan': {
    name: 'Student Plan',
    pricePerMonth: 1500,
    defaultCommissionRate: 10,
    description: 'Discounted plan with valid student ID'
  }
};

/**
 * Calculates remaining days until membership expiration
 */
export function calculateDaysRemaining(endDateStr?: string): number {
  if (!endDateStr) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(endDateStr);
  end.setHours(0, 0, 0, 0);

  const diffTime = end.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Returns detailed membership lifecycle info
 */
export function getExpiryStatus(endDateStr?: string) {
  const daysRemaining = calculateDaysRemaining(endDateStr);
  const isExpired = daysRemaining < 0;
  const isExpiringIn7 = daysRemaining >= 0 && daysRemaining <= 7;
  const isExpiringIn15 = daysRemaining >= 0 && daysRemaining <= 15;
  const isExpiringIn30 = daysRemaining >= 0 && daysRemaining <= 30;

  return {
    isExpired,
    daysRemaining,
    isExpiringIn7,
    isExpiringIn15,
    isExpiringIn30
  };
}

/**
 * Automatically calculates status based on end_date & archived state
 */
export function resolveMemberStatus(member: Member): MemberStatus {
  if (member.is_archived) return member.status;
  if (member.status === 'pending') return 'pending';
  
  if (member.end_date) {
    const days = calculateDaysRemaining(member.end_date);
    if (days < 0) return 'expired';
  }
  return member.status;
}

export type ExpiryFilterType = 'all' | 'expiring_7' | 'expiring_15' | 'expiring_30' | 'expired' | 'pending' | 'active' | 'archived';

/**
 * Filters list of members based on intelligence category
 */
export function filterMembersByIntelligence(
  members: Member[],
  filter: ExpiryFilterType,
  trainerId?: string
): Member[] {
  let list = [...members];

  // Filter trainer if provided
  if (trainerId) {
    list = list.filter(m => m.onboarded_by === trainerId);
  }

  // Handle archive visibility
  if (filter === 'archived') {
    return list.filter(m => m.is_archived === true);
  } else {
    // Normal views hide archived members
    list = list.filter(m => !m.is_archived);
  }

  switch (filter) {
    case 'expiring_7':
      return list.filter(m => m.status === 'active' && m.end_date && calculateDaysRemaining(m.end_date) >= 0 && calculateDaysRemaining(m.end_date) <= 7);
    case 'expiring_15':
      return list.filter(m => m.status === 'active' && m.end_date && calculateDaysRemaining(m.end_date) >= 0 && calculateDaysRemaining(m.end_date) <= 15);
    case 'expiring_30':
      return list.filter(m => m.status === 'active' && m.end_date && calculateDaysRemaining(m.end_date) >= 0 && calculateDaysRemaining(m.end_date) <= 30);
    case 'expired':
      return list.filter(m => m.status === 'expired' || (m.end_date && calculateDaysRemaining(m.end_date) < 0));
    case 'pending':
      return list.filter(m => m.status === 'pending');
    case 'active':
      return list.filter(m => m.status === 'active' && (!m.end_date || calculateDaysRemaining(m.end_date) >= 0));
    case 'all':
    default:
      return list;
  }
}

/**
 * Calculate recommended total renewal cost and end date
 */
export function calculateRenewalPreFill(member: Member, renewalMonths: number = 1, packageType?: PlanPackage) {
  const pkgName = packageType || member.package_type || 'General Gym';
  const pkgConfig = PACKAGE_CONFIGS[pkgName] || PACKAGE_CONFIGS['General Gym'];

  const basePrice = pkgConfig.pricePerMonth * renewalMonths;
  const defaultCommissionRate = pkgConfig.defaultCommissionRate;
  
  // Calculate new start date: if currently active and not expired, start from current end_date, else today
  const todayStr = new Date().toISOString().slice(0, 10);
  let newStartDate = todayStr;
  
  if (member.end_date && calculateDaysRemaining(member.end_date) >= 0) {
    newStartDate = member.end_date;
  }

  const startDateObj = new Date(newStartDate);
  startDateObj.setMonth(startDateObj.getMonth() + renewalMonths);
  const newEndDate = startDateObj.toISOString().slice(0, 10);

  return {
    packageType: pkgName,
    renewalMonths,
    suggestedAmount: basePrice,
    defaultCommissionRate,
    newStartDate,
    newEndDate
  };
}
