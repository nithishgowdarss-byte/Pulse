// src/lib/duesAging.ts
export type AgingBucket = 'current' | 'late' | 'bad_debt';

export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 7) return 'current';
  if (daysOverdue <= 30) return 'late';
  return 'bad_debt';
}

export function groupByAging<T extends { days_overdue: number; balance_due: number }>(
  rows: T[]
): {
  current: T[];
  late: T[];
  badDebt: T[];
  totals: {
    current: number;
    late: number;
    badDebt: number;
    all: number;
  };
} {
  const current: T[] = rows.filter((r) => agingBucket(r.days_overdue) === 'current');
  const late: T[] = rows.filter((r) => agingBucket(r.days_overdue) === 'late');
  const badDebt: T[] = rows.filter((r) => agingBucket(r.days_overdue) === 'bad_debt');
  
  const sum = (xs: T[]) =>
    xs.reduce((s, r) => s + Number(r.balance_due || 0), 0);

  return {
    current,
    late,
    badDebt,
    totals: {
      current: sum(current),
      late: sum(late),
      badDebt: sum(badDebt),
      all: sum(rows),
    },
  };
}
