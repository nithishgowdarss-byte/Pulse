import React from 'react';
import { useTrainerPerformance } from '../../hooks/useTrainerPerformance';
import { Award, UserCheck, TrendingUp, DollarSign, CheckCircle2, ChevronRight } from 'lucide-react';
import { Profile } from '../../types';

interface TrainerPerformanceSectionProps {
  branchId?: string | null;
  onOpenSettlement?: (trainerId: string, pendingAmount: number) => void;
  trainers?: Profile[];
}

export const TrainerPerformanceSection: React.FC<TrainerPerformanceSectionProps> = ({
  branchId,
  onOpenSettlement,
}) => {
  const { data = [], isLoading } = useTrainerPerformance(branchId);

  const totalActivationsMtd = data.reduce((acc, t) => acc + t.activationsMtd, 0);
  const totalActiveBook = data.reduce((acc, t) => acc + t.activeMembers, 0);
  const avgRetention = data.length
    ? Math.round(data.reduce((acc, t) => acc + t.retentionRate, 0) / data.length)
    : 0;
  const totalCommissions = data.reduce((acc, t) => acc + t.commissionEarnedMtd, 0);

  return (
    <div className="space-y-6">
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">MTD Activations</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black font-mono text-white mt-2">{totalActivationsMtd}</div>
          <p className="text-[10px] text-zinc-500 mt-0.5">Enrolled this calendar month</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Client Book</span>
            <UserCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black font-mono text-white mt-2">{totalActiveBook}</div>
          <p className="text-[10px] text-zinc-500 mt-0.5">Assigned to floor trainers</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Avg Retention</span>
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-400 mt-2">{avgRetention}%</div>
          <p className="text-[10px] text-zinc-500 mt-0.5">Active non-expired ratio</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Commissions Pool</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black font-mono text-white mt-2">
            ₹{totalCommissions.toLocaleString('en-IN')}
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5">Earned by floor team</p>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-black text-white flex items-center space-x-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span>TRAINER PERFORMANCE & LEADERBOARD</span>
            </h3>
            <p className="text-xs text-zinc-400">
              MTD client activations · Active client book · 30-day retention rate · Commission settlements
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="h-36 flex items-center justify-center text-zinc-500 text-xs">
            Loading trainer metrics…
          </div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs">No trainer performance data in this scope.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-[11px] font-black uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                  <th className="pb-3 pr-4">Trainer</th>
                  <th className="pb-3 pr-4 text-right">Activations MTD</th>
                  <th className="pb-3 pr-4 text-right">Active Book</th>
                  <th className="pb-3 pr-4 text-right">Retention</th>
                  <th className="pb-3 pr-4 text-right">Commission Earned</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {data.map((t, idx) => (
                  <tr key={t.trainerId} className="hover:bg-zinc-950/40 transition-colors">
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                            idx === 0
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-bold text-white flex items-center space-x-1.5">
                            <span>{t.name}</span>
                            {idx === 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[9px] font-black uppercase">
                                Top
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-1.5 mt-0.5">
                            <span className="text-[11px] text-zinc-400 capitalize">
                              {t.role.replace('_', ' ')}
                            </span>
                            {t.branchName && (
                              <span className="px-1.5 py-0.2 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 text-[10px] font-bold">
                                📍 {t.branchName.replace('Pulse Fitness - ', '')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 pr-4 text-right">
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        {t.activationsMtd}
                      </span>
                    </td>

                    <td className="py-3.5 pr-4 text-right">
                      <span className="font-mono font-bold text-zinc-200 text-sm">
                        {t.activeMembers}
                      </span>
                      <span className="text-[10px] text-zinc-400 block">of {t.totalMembers} total</span>
                    </td>

                    <td className="py-3.5 pr-4 text-right">
                      <div className="inline-flex items-center space-x-1.5">
                        <div className="w-12 bg-zinc-800 h-1.5 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full ${
                              t.retentionRate >= 80
                                ? 'bg-emerald-500'
                                : t.retentionRate >= 50
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, t.retentionRate)}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-white text-xs">{t.retentionRate}%</span>
                      </div>
                    </td>

                    <td className="py-3.5 pr-4 text-right">
                      <span className="font-mono font-bold text-amber-400 text-sm">
                        ₹{t.commissionEarnedMtd.toLocaleString('en-IN')}
                      </span>
                      {t.pendingCommission > 0 && (
                        <span className="text-[10px] text-red-400 block font-mono">
                          ₹{t.pendingCommission.toLocaleString('en-IN')} pending
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 text-right">
                      {onOpenSettlement && t.pendingCommission > 0 ? (
                        <button
                          onClick={() => onOpenSettlement(t.trainerId, t.pendingCommission)}
                          className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-zinc-950 font-black text-xs rounded-xl shadow transition-all"
                        >
                          Settle
                        </button>
                      ) : (
                        <span className="text-[11px] text-zinc-400 font-medium">All Settled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
