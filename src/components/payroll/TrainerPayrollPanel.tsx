import React, { useState } from 'react';
import dayjs from 'dayjs';
import { useTrainerPayroll } from '../../hooks/useTrainerPayroll';
import { usePayrollReconciliation, usePayrollLines, buildPayrollReconciliationCsv } from '../../hooks/usePayrollReconciliation';
import { LoadingButton } from '../ui/LoadingButton';
import {
  Award,
  DollarSign,
  Calendar,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  ListFilter,
  Eye,
  X,
  Building2,
  User,
  CreditCard
} from 'lucide-react';
import { formatPhoneDisplay } from '../../lib/phoneUtils';
import { toast } from '../../lib/toast';

interface TrainerPayrollPanelProps {
  branchId?: string | null;
}

export const TrainerPayrollPanel: React.FC<TrainerPayrollPanelProps> = ({ branchId }) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(dayjs().format('YYYY-MM'));
  const [viewMode, setViewMode] = useState<'payroll' | 'reconciliation'>('payroll');
  const [selectedTrainerDetail, setSelectedTrainerDetail] = useState<{ id: string; name: string } | null>(null);

  const period = dayjs(`${selectedMonth}-01`).format('YYYY-MM-DD');

  // Hooks
  const payroll = useTrainerPayroll(period, branchId);
  const recon = usePayrollReconciliation(selectedMonth, branchId);
  const lines = usePayrollLines({
    period,
    trainerId: selectedTrainerDetail?.id,
    branchId,
  });

  const handleExportCsv = () => {
    if (!recon.rows.length) {
      toast.error('No reconciliation rows to export for this period.');
      return;
    }
    const csvContent = buildPayrollReconciliationCsv(recon.rows, period);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll_reconciliation_${selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported reconciliation report for ${dayjs(period).format('MMMM YYYY')}`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Award className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-black text-white uppercase tracking-wider">
              TRAINER PAYROLL & COMMISSION RECONCILIATION
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Automated payment triggers · Monthly commission aggregation · Settlement status toggles & audit reports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-2xl border border-zinc-800">
            <button
              onClick={() => setViewMode('payroll')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                viewMode === 'payroll'
                  ? 'bg-amber-500 text-zinc-950 shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Trainer Payroll
            </button>
            <button
              onClick={() => setViewMode('reconciliation')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                viewMode === 'reconciliation'
                  ? 'bg-amber-500 text-zinc-950 shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Reconciliation Report
            </button>
          </div>

          {/* Month Selector */}
          <div className="flex items-center space-x-2 bg-zinc-950 px-3 py-1.5 rounded-2xl border border-zinc-800">
            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-mono font-bold text-white focus:outline-none cursor-pointer"
            />
          </div>

          {viewMode === 'reconciliation' && (
            <button
              onClick={handleExportCsv}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-extrabold text-xs rounded-2xl shadow flex items-center space-x-2 transition-all"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Earned (MTD)</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 mt-2">
            ₹{payroll.grandTotal.toLocaleString('en-IN')}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">From activated & renewed client payments</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Pending Payouts</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400 mt-2">
            ₹{payroll.grandPending.toLocaleString('en-IN')}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">Awaiting owner settlement clearance</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Paid Settlements</span>
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-2">
            ₹{payroll.grandPaid.toLocaleString('en-IN')}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">Disbursed to trainers this cycle</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Period Month</span>
            <Calendar className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-2">
            {dayjs(period).format('MMM YYYY')}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">1st of month accounting cycle</p>
        </div>
      </div>

      {/* VIEW 1: TRAINER PAYROLL TABLE */}
      {viewMode === 'payroll' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
            <div>
              <h4 className="text-sm font-black text-white flex items-center space-x-2">
                <Award className="w-4 h-4 text-amber-400" />
                <span>TRAINER COMMISSION SETTLEMENTS TABLE</span>
              </h4>
              <p className="text-[11px] text-zinc-400">
                Switch toggle to mark full pending commission as Paid or revert to Pending
              </p>
            </div>

            <div className="text-xs text-zinc-400">
              Showing {payroll.trainers.length} active trainers
            </div>
          </div>

          {payroll.isLoading ? (
            <div className="h-40 flex items-center justify-center text-zinc-500 text-xs">
              Loading payroll records…
            </div>
          ) : payroll.trainers.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 text-xs">
              No commission settlements recorded for {dayjs(period).format('MMMM YYYY')}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="px-6 py-4">Trainer</th>
                    <th className="px-6 py-4 text-right">Pending Amount</th>
                    <th className="px-6 py-4 text-right">Paid Amount</th>
                    <th className="px-6 py-4 text-right">Total Commission</th>
                    <th className="px-6 py-4 text-center">Settlement Status</th>
                    <th className="px-6 py-4 text-right">Drill-Down</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {payroll.trainers.map((t) => {
                    const isFullyPaid = t.pending === 0 && t.paid > 0;
                    const isPartiallyPaid = t.pending > 0 && t.paid > 0;

                    return (
                      <tr key={t.trainerId} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white text-sm">{t.name}</div>
                          <span className="text-[11px] text-zinc-500">{t.branchName || 'Gym Staff'}</span>
                        </td>

                        <td className="px-6 py-4 text-right font-mono font-bold text-amber-400 text-sm">
                          ₹{t.pending.toLocaleString('en-IN')}
                        </td>

                        <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400 text-sm">
                          ₹{t.paid.toLocaleString('en-IN')}
                        </td>

                        <td className="px-6 py-4 text-right font-mono font-bold text-white text-sm">
                          ₹{t.total.toLocaleString('en-IN')}
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center space-x-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                                isFullyPaid
                                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                  : isPartiallyPaid
                                  ? 'bg-amber-950 text-amber-400 border-amber-800'
                                  : t.total === 0
                                  ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                              }`}
                            >
                              {isFullyPaid ? 'Paid' : isPartiallyPaid ? 'Partial' : t.total === 0 ? 'Zero' : 'Pending'}
                            </span>

                            {/* Switch Toggle */}
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isFullyPaid}
                                disabled={t.total === 0 || payroll.markPaid.isPending || payroll.markPending.isPending}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    payroll.markPaid.mutate(t.trainerId);
                                  } else {
                                    payroll.markPending.mutate(t.trainerId);
                                  }
                                }}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                            </label>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setSelectedTrainerDetail({ id: t.trainerId, name: t.name })}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-700 inline-flex items-center space-x-1.5 transition-all"
                          >
                            <Eye className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Line Items ({t.rowIdsPending.length + t.rowIdsPaid.length})</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: RECONCILIATION REPORT */}
      {viewMode === 'reconciliation' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
            <div>
              <h4 className="text-sm font-black text-white flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>MONTHLY PAYROLL RECONCILIATION & AUDIT REPORT</span>
              </h4>
              <p className="text-[11px] text-zinc-400">
                Accounting integrity verification: <code className="text-emerald-400 font-mono">earned = pending + paid</code> (excluding void)
              </p>
            </div>

            <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400">
              <span>Totals:</span>
              <span className="text-emerald-400 font-bold">₹{recon.totals.earned.toLocaleString('en-IN')} Earned</span>
              <span>•</span>
              <span className="text-amber-400 font-bold">₹{recon.totals.pending.toLocaleString('en-IN')} Pending</span>
              <span>•</span>
              <span className="text-white font-bold">₹{recon.totals.paid.toLocaleString('en-IN')} Paid</span>
            </div>
          </div>

          {recon.isLoading ? (
            <div className="h-40 flex items-center justify-center text-zinc-500 text-xs">
              Generating reconciliation summary…
            </div>
          ) : recon.rows.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 text-xs">
              No reconciliation entries for {dayjs(period).format('MMMM YYYY')}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="px-5 py-4">Trainer & Branch</th>
                    <th className="px-5 py-4 text-right">Earned (₹)</th>
                    <th className="px-5 py-4 text-right">Pending (₹)</th>
                    <th className="px-5 py-4 text-right">Paid (₹)</th>
                    <th className="px-5 py-4 text-right">Void (₹)</th>
                    <th className="px-5 py-4 text-center">Lines (P / Paid / V)</th>
                    <th className="px-5 py-4 text-right">Variance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {recon.rows.map((r, idx) => (
                    <tr key={`${r.trainer_id}_${r.branch_id || idx}`} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-bold text-white text-sm">{r.trainer_name}</div>
                        <span className="text-[10px] text-zinc-500">{r.branch_name || 'All Branches'}</span>
                      </td>

                      <td className="px-5 py-4 text-right font-mono font-bold text-emerald-400">
                        ₹{Number(r.earned_amount).toLocaleString('en-IN')}
                      </td>

                      <td className="px-5 py-4 text-right font-mono font-bold text-amber-400">
                        ₹{Number(r.pending_amount).toLocaleString('en-IN')}
                      </td>

                      <td className="px-5 py-4 text-right font-mono font-bold text-white">
                        ₹{Number(r.paid_amount).toLocaleString('en-IN')}
                      </td>

                      <td className="px-5 py-4 text-right font-mono text-zinc-500">
                        ₹{Number(r.void_amount || 0).toLocaleString('en-IN')}
                      </td>

                      <td className="px-5 py-4 text-center font-mono text-zinc-400">
                        <span className="text-amber-400 font-bold">{r.pending_lines}</span> /{' '}
                        <span className="text-emerald-400 font-bold">{r.paid_lines}</span> /{' '}
                        <span className="text-zinc-500">{r.void_lines}</span>
                      </td>

                      <td className="px-5 py-4 text-right font-mono font-bold">
                        {r.variance === 0 ? (
                          <span className="text-emerald-400 flex items-center justify-end space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>₹0.00 (Balanced)</span>
                          </span>
                        ) : (
                          <span className="text-red-400 flex items-center justify-end space-x-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>₹{r.variance?.toFixed(2)} Discrepancy</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: LINE ITEMS EXPLORER */}
      {selectedTrainerDetail && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-6 bg-gradient-to-r from-amber-950/60 via-zinc-900 to-zinc-900 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white flex items-center space-x-2">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>SETTLEMENT LINE ITEMS — {selectedTrainerDetail.name}</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Accounting period: {dayjs(period).format('MMMM YYYY')}
                </p>
              </div>

              <button
                onClick={() => setSelectedTrainerDetail(null)}
                className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {lines.isLoading ? (
                <div className="p-8 text-center text-zinc-500 text-xs">Loading line items…</div>
              ) : lines.lines.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs">No settlement lines found.</div>
              ) : (
                <div className="space-y-3">
                  {lines.lines.map((line) => (
                    <div
                      key={line.id}
                      className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <User className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="font-bold text-white text-sm">{line.member_name || 'Member'}</span>
                          {line.member_phone && (
                            <span className="text-xs font-mono text-zinc-400">
                              ({formatPhoneDisplay(line.member_phone)})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-2">
                          <span>{line.package_type || 'General Gym'}</span>
                          <span>•</span>
                          <span>Base: ₹{line.base_amount || 0}</span>
                          <span>•</span>
                          <span>Rate: {line.rate_percent || 10}%</span>
                          {line.notes && (
                            <>
                              <span>•</span>
                              <span className="italic">{line.notes}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end space-x-3">
                        <div className="text-right">
                          <div className="font-mono font-bold text-amber-400 text-sm">
                            ₹{Number(line.amount).toLocaleString('en-IN')}
                          </div>
                          <span className="text-[10px] text-zinc-500">
                            {dayjs(line.created_at).format('DD MMM, HH:mm')}
                          </span>
                        </div>

                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                            line.status === 'paid'
                              ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                              : line.status === 'void'
                              ? 'bg-red-950 text-red-400 border-red-800'
                              : 'bg-amber-950 text-amber-400 border-amber-800'
                          }`}
                        >
                          {line.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex justify-end">
              <button
                onClick={() => setSelectedTrainerDetail(null)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl transition-all"
              >
                Close Explorer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
