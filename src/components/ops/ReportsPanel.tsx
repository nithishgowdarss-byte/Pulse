import React, { useEffect, useState } from 'react';
import { apiJson, toCsv, downloadText } from '../../lib/http';
import { Notice, inr, fieldCls, btnCls } from '../ui/Modal';

const istMonth = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 7);
type Row = { key: string; amount: number };

const Bars: React.FC<{ rows: Row[]; label: string }> = ({ rows, label }) => {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <section aria-label={label} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 space-y-1.5 break-inside-avoid">
      <h3 className="text-xs font-black text-zinc-200">{label}</h3>
      {rows.length === 0 ? <p className="text-[11px] text-zinc-400">No entries this month.</p> : rows.map((r) => (
        <div key={r.key} className="text-[11px]">
          <div className="flex justify-between text-zinc-300"><span className="truncate">{r.key}</span><span className="font-bold text-white">{inr(r.amount)}</span></div>
          <div className="h-1.5 bg-zinc-800 rounded" aria-hidden="true"><div className="h-1.5 bg-orange-500 rounded" style={{ width: `${(r.amount / max) * 100}%` }} /></div>
        </div>
      ))}
    </section>
  );
};

export const ReportsPanel: React.FC<{ branches: { id: string; name: string }[]; defaultBranch?: string }> = ({ branches, defaultBranch }) => {
  const [month, setMonth] = useState(istMonth());
  const [branch, setBranch] = useState(defaultBranch && defaultBranch !== 'all' ? defaultBranch : 'all');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true); setErr('');
    try { setData(await apiJson(`/api/reports/monthly?month=${month}&branch_id=${branch}`)); }
    catch (e: any) { setErr(e.message); setData(null); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [month, branch]); // eslint-disable-line
  const exportCsv = () => {
    const rows: any[] = [
      ...data.branches.map((b: any) => ({ section: 'Branch', item: b.branch, revenue: b.revenue, expenses: b.expenses, net: b.net })),
      ...data.by_plan.map((r: Row) => ({ section: 'Plan', item: r.key, revenue: r.amount })),
      ...data.by_method.map((r: Row) => ({ section: 'Payment method', item: r.key, revenue: r.amount })),
      ...data.expenses_by_category.map((r: Row) => ({ section: 'Expense category', item: r.key, expenses: r.amount })),
      ...data.attendance_trend.map((t: any) => ({ section: 'Check-ins', item: t.day, revenue: t.checkins })),
      ...data.churn.members.map((m: any) => ({ section: 'Not renewed', item: `${m.full_name} (${m.branch}) ended ${m.end_date}` })),
    ];
    downloadText(toCsv(rows, [['section', 'Section'], ['item', 'Item'], ['revenue', 'Revenue / count'], ['expenses', 'Expenses'], ['net', 'Net']]), `pulse-report-${month}-${branch}.csv`);
  };
  const maxC = data ? Math.max(1, ...data.attendance_trend.map((t: any) => t.checkins)) : 1;
  return (
    <div className="space-y-3 print-area" data-testid="reports-panel">
      <div className="flex flex-wrap gap-2 items-end no-print">
        <label className="text-[11px] text-zinc-300 font-bold">Month<input type="month" value={month} max={istMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className={fieldCls} /></label>
        <label className="text-[11px] text-zinc-300 font-bold">Branch
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className={fieldCls}>
            {branches.length > 1 && <option value="all">All branches</option>}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name.replace('Pulse Fitness - ', '')}</option>)}
          </select></label>
        <button className={`${btnCls} bg-zinc-800 text-white`} onClick={exportCsv} disabled={!data}>Export CSV</button>
        <button className={`${btnCls} bg-zinc-800 text-white`} onClick={() => window.print()} disabled={!data}>Print / Save PDF</button>
      </div>
      {loading && <Notice>Loading report…</Notice>}
      {err && <Notice kind="error">Could not load the report: {err} <button className="underline font-bold" onClick={load}>Try again</button></Notice>}
      {data && (<>
        <h3 className="text-sm font-black text-white">Report for {month}{branch !== 'all' ? ` · ${branches.find((b) => b.id === branch)?.name.replace('Pulse Fitness - ', '')}` : ' · all branches'}</h3>
        {data.totals.payments === 0 && data.totals.expenses === 0 && <Notice>No payments or expenses recorded for {month}. Pick another month, or record payments from Members and expenses from the Expenses tab.</Notice>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[['Revenue', inr(data.totals.revenue)], ['Expenses', inr(data.totals.expenses)], ['Net', inr(data.totals.net)], ['Check-ins', String(data.totals.checkins)], ['Payments', String(data.totals.payments)], ['New members', String(data.totals.new_members)], ['Not renewed', String(data.churn.not_renewed)], ['Churn rate', `${data.churn.rate_pct}%`]].map(([k, v]) => (
            <div key={k} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3"><div className="text-[10px] uppercase text-zinc-400 font-bold">{k}</div><div className="text-base font-black text-white truncate">{v}</div></div>
          ))}
        </div>
        <div className="overflow-x-auto"><table className="w-full text-xs text-left">
          <caption className="sr-only">Revenue by branch</caption>
          <thead className="text-zinc-400"><tr><th scope="col" className="p-2">Branch</th><th scope="col" className="p-2 text-right">Revenue</th><th scope="col" className="p-2 text-right">Expenses</th><th scope="col" className="p-2 text-right">Net</th></tr></thead>
          <tbody>{data.branches.map((b: any) => <tr key={b.branch_id} className="border-t border-zinc-800 text-zinc-200"><td className="p-2">{b.branch}</td><td className="p-2 text-right">{inr(b.revenue)}</td><td className="p-2 text-right">{inr(b.expenses)}</td><td className={`p-2 text-right font-bold ${b.net < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{inr(b.net)}</td></tr>)}</tbody>
        </table></div>
        <div className="grid sm:grid-cols-3 gap-2">
          <Bars rows={data.by_plan} label="Revenue by plan" />
          <Bars rows={data.by_method} label="Revenue by payment method" />
          <Bars rows={data.expenses_by_category} label="Expenses by category" />
        </div>
        <section aria-label="Daily check-ins" className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
          <h3 className="text-xs font-black text-zinc-200 mb-2">Daily check-ins</h3>
          {data.totals.checkins === 0 ? <p className="text-[11px] text-zinc-400">No check-ins recorded in {month}.</p> :
            <div className="flex items-end gap-[2px] h-24" role="img" aria-label={`Check-ins per day, peak ${maxC}`}>
              {data.attendance_trend.map((t: any) => <div key={t.day} title={`${t.day}: ${t.checkins}`} className="flex-1 bg-sky-500 rounded-t" style={{ height: `${(t.checkins / maxC) * 100}%`, minHeight: t.checkins ? 2 : 0 }} />)}
            </div>}
        </section>
        <section aria-label="Members not renewed" className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3">
          <h3 className="text-xs font-black text-zinc-200">Ended this month, not renewed ({data.churn.not_renewed} of {data.churn.ended_this_month})</h3>
          {data.churn.members.length === 0 ? <p className="text-[11px] text-zinc-400 mt-1">Nobody lapsed in {month}. 🎉</p> :
            <ul className="mt-1 text-[11px] text-zinc-300 divide-y divide-zinc-800">{data.churn.members.map((m: any) => <li key={m.id} className="py-1 flex justify-between gap-2"><span className="truncate">{m.full_name} · {m.branch}</span><span>{m.end_date}</span></li>)}</ul>}
        </section>
      </>)}
    </div>
  );
};
