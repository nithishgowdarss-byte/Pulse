import React, { useEffect, useState } from 'react';
import { apiJson, toCsv, downloadText } from '../../lib/http';
import { Notice, inr, fieldCls, btnCls } from '../ui/Modal';

const istDate = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export const ExpensesPanel: React.FC<{ branches: { id: string; name: string }[]; defaultBranch?: string; canDelete: boolean }> = ({ branches, defaultBranch, canDelete }) => {
  const first = defaultBranch && defaultBranch !== 'all' && branches.some((b) => b.id === defaultBranch) ? defaultBranch : branches[0]?.id || '';
  const [month, setMonth] = useState(istDate().slice(0, 7));
  const [filter, setFilter] = useState(branches.length > 1 ? 'all' : first);
  const [list, setList] = useState<any[]>([]); const [cats, setCats] = useState<string[]>([]); const [total, setTotal] = useState(0);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ branch_id: first, category: '', amount: '', date: istDate(), note: '' });
  const load = async () => {
    setErr('');
    try { const r = await apiJson(`/api/expenses?month=${month}&branch_id=${filter}`); setList(r.expenses); setCats(r.categories); setTotal(r.total); }
    catch (e: any) { setErr(e.message); } finally { setLoaded(true); }
  };
  useEffect(() => { load(); }, [month, filter]); // eslint-disable-line
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('');
    try {
      await apiJson('/api/expenses', { method: 'POST', json: { ...form, amount: Number(form.amount) } });
      setMsg(`Saved ${form.category} ${inr(Number(form.amount))}.`); setForm({ ...form, amount: '', note: '' }); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const del = async (id: string) => {
    if (!confirm('Delete this expense?')) return;
    try { await apiJson(`/api/expenses/${id}`, { method: 'DELETE' }); load(); } catch (e: any) { setErr(e.message); }
  };
  const bname = (id: string) => branches.find((b) => b.id === id)?.name.replace('Pulse Fitness - ', '') || id;
  return (
    <div className="space-y-3" data-testid="expenses-panel">
      <form onSubmit={add} className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-zinc-950 border border-zinc-800 rounded-2xl p-3" aria-label="Add expense">
        <label className="text-[11px] text-zinc-300 font-bold">Branch<select required value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className={fieldCls}>{branches.map((b) => <option key={b.id} value={b.id}>{bname(b.id)}</option>)}</select></label>
        <label className="text-[11px] text-zinc-300 font-bold">Category<select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={fieldCls}><option value="">Choose…</option>{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="text-[11px] text-zinc-300 font-bold">Amount (₹)<input required inputMode="decimal" type="number" min="1" max="10000000" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={fieldCls} /></label>
        <label className="text-[11px] text-zinc-300 font-bold">Date<input required type="date" max={istDate()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={fieldCls} /></label>
        <label className="text-[11px] text-zinc-300 font-bold col-span-2 sm:col-span-1">Note<input maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. BESCOM bill" className={fieldCls} /></label>
        <div className="flex items-end"><button disabled={busy} className={`${btnCls} w-full bg-orange-600 text-white`}>{busy ? 'Saving…' : 'Add expense'}</button></div>
      </form>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="error">{err} <button className="underline font-bold" onClick={load}>Retry</button></Notice>}
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-[11px] text-zinc-300 font-bold">Month<input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={fieldCls} /></label>
        {branches.length > 1 && <label className="text-[11px] text-zinc-300 font-bold">Show<select value={filter} onChange={(e) => setFilter(e.target.value)} className={fieldCls}><option value="all">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{bname(b.id)}</option>)}</select></label>}
        <div className="text-xs text-zinc-300 ml-auto">Total <b className="text-white">{inr(total)}</b></div>
        <button type="button" disabled={!list.length} className={`${btnCls} bg-zinc-800 text-white`} onClick={() => downloadText(toCsv(list.map((e) => ({ ...e, branch: bname(e.branch_id) })), [['date', 'Date'], ['branch', 'Branch'], ['category', 'Category'], ['amount', 'Amount'], ['note', 'Note']]), `pulse-expenses-${month}.csv`)}>Export CSV</button>
      </div>
      {loaded && !err && list.length === 0 && <Notice>No expenses recorded for {month}{filter !== 'all' ? ` at ${bname(filter)}` : ''}. Add one with the form above.</Notice>}
      <ul className="divide-y divide-zinc-800 text-xs">
        {list.map((e) => (
          <li key={e.id} className="py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0"><div className="text-white font-bold">{e.category} · {inr(e.amount)}</div><div className="text-zinc-400 truncate">{e.date} · {bname(e.branch_id)}{e.note ? ` · ${e.note}` : ''}</div></div>
            {canDelete && <button onClick={() => del(e.id)} aria-label={`Delete ${e.category} ${e.amount} on ${e.date}`} className={`${btnCls} bg-zinc-800 text-red-300`}>Delete</button>}
          </li>
        ))}
      </ul>
    </div>
  );
};
