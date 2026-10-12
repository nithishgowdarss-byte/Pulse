// src/components/register/ShiftCloseWidget.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { ShiftCloseTotalsData } from '../../types';
import { safeFetchJson } from '../../lib/apiUtils';
import { IndianRupee, RefreshCw, CheckCircle2, ShieldCheck, Landmark } from 'lucide-react';

interface ShiftCloseWidgetProps {
  branchId?: string | null;
  day?: string;
}

export const ShiftCloseWidget: React.FC<ShiftCloseWidgetProps> = ({
  branchId,
  day = new Date().toISOString().slice(0, 10),
}) => {
  const [data, setData] = useState<ShiftCloseTotalsData>({
    day,
    upi: 0,
    cash: 0,
    card: 0,
    bank_transfer: 0,
    adjusted: 0,
    total: 0,
    n_count: 0,
    r_count: 0,
    b_count: 0,
    f_count: 0,
  });
  const [isFetching, setIsFetching] = useState<boolean>(false);

  const fetchTotals = useCallback(async () => {
    setIsFetching(true);
    try {
      const params = new URLSearchParams();
      if (branchId && branchId !== 'all') params.set('branch_id', branchId);
      params.set('day', day);

      const res = await safeFetchJson<ShiftCloseTotalsData>(`/api/shift-close-totals?${params.toString()}`, undefined, {
        day,
        upi: 0,
        cash: 0,
        card: 0,
        bank_transfer: 0,
        adjusted: 0,
        total: 0,
        n_count: 0,
        r_count: 0,
        b_count: 0,
        f_count: 0,
      });

      if (res) setData(res);
    } catch (err) {
      console.error('Error loading shift close totals:', err);
    } finally {
      setIsFetching(false);
    }
  }, [branchId, day]);

  useEffect(() => {
    fetchTotals();
    const interval = setInterval(fetchTotals, 20000);
    return () => clearInterval(interval);
  }, [fetchTotals]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Landmark className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100">10 PM Drawer · Shift Close Match</h3>
            <p className="text-[11px] text-zinc-400">Nightly audit: Cash drawer + PhonePe UPI match</p>
          </div>
        </div>
        <button
          onClick={() => fetchTotals()}
          className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700/60"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin text-emerald-400' : ''}`} />
          <span>{isFetching ? 'Auditing…' : 'Sync'}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3">
          <span className="block text-[11px] font-medium text-zinc-400 mb-0.5">UPI / GPay / QR</span>
          <span className="text-base font-bold text-zinc-100 font-mono">
            ₹{Number(data.upi ?? 0).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3">
          <span className="block text-[11px] font-medium text-zinc-400 mb-0.5">Cash in Drawer</span>
          <span className="text-base font-bold text-zinc-100 font-mono">
            ₹{Number(data.cash ?? 0).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3">
          <span className="block text-[11px] font-medium text-zinc-400 mb-0.5">Card POS Swipe</span>
          <span className="text-base font-bold text-zinc-100 font-mono">
            ₹{Number(data.card ?? 0).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="rounded-xl bg-zinc-950 border border-zinc-800/80 p-3">
          <span className="block text-[11px] font-medium text-zinc-400 mb-0.5">Bank (NEFT/IMPS)</span>
          <span className="text-base font-bold text-zinc-100 font-mono">
            ₹{Number(data.bank_transfer ?? 0).toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-semibold text-emerald-400 block">Total Real Money Collected (Excl. Freeze)</span>
          <span className="text-2xl font-black text-white tracking-tight">
            ₹{Number(data.total ?? 0).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            N {data.n_count ?? 0}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            R {data.r_count ?? 0}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
            B {data.b_count ?? 0}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            F {data.f_count ?? 0}
          </span>
        </div>
      </div>

      <p className="text-[11px] text-zinc-400 text-center flex items-center justify-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        <span>Compare PhonePe Merchant Summary + Cash Drawer against Total</span>
      </p>
    </div>
  );
};
