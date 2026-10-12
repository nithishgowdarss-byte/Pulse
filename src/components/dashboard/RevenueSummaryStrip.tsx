// src/components/dashboard/RevenueSummaryStrip.tsx
import React from 'react';
import { useSalesTotals } from '../../hooks/useSalesTotals';
import { IndianRupee, TrendingUp, Calendar, RefreshCw } from 'lucide-react';

interface RevenueSummaryStripProps {
  branchId?: string | null;
}

export const RevenueSummaryStrip: React.FC<RevenueSummaryStripProps> = ({ branchId }) => {
  const { data, isFetching, refetch } = useSalesTotals(branchId);

  const items = [
    { label: 'Today (Gross)', value: data?.day, icon: IndianRupee, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { label: 'This Week (IST)', value: data?.week, icon: TrendingUp, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
    { label: 'This Month (MTD)', value: data?.month, icon: Calendar, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
          <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
          Live Cash & UPI Collections (Real-time)
        </span>
        <button
          onClick={() => refetch()}
          className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors px-2 py-0.5 rounded bg-zinc-800/60 border border-zinc-700/50"
          title="Refresh Sales Totals"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin text-emerald-400' : ''}`} />
          <span>{isFetching ? 'Refreshing…' : 'Sync'}</span>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`rounded-xl border p-4 transition-all duration-200 shadow-sm ${item.bg}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-zinc-400">
                  {item.label}
                </p>
                <div className={`p-1.5 rounded-lg bg-zinc-900/60 ${item.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight text-white">
                ₹{Number(item.value ?? 0).toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                Excludes frozen & adjustment entries
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
