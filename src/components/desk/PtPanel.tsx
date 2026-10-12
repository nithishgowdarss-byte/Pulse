import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { matchesPerson } from '../ui/EmptySearch';
import { Plus, CheckCircle2, Undo2, Download } from 'lucide-react';
import { apiJson, toCsv, downloadText } from '../../lib/http';

type Pkg = { id: string; member_id: string; member_name: string; branch_id: string; trainer_id: string; trainer_name: string; sessions_total: number; sessions_used: number; sessions_left: number; price: number; purchased_at: string; expires_on?: string; expired: boolean; notes?: string; sessions: { id: string; at: string; trainer_name: string; notes?: string }[] };

export const PtPanel: React.FC<{ role: string; branchId?: string }> = ({ role, branchId }) => {
  const canCreate = role === 'super_owner' || role === 'owner' || role === 'branch_manager';
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [error, setError] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [form, setForm] = useState({ member_id: '', trainer_id: '', sessions_total: '12', price: '', expires_on: '' });
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const qs = new URLSearchParams(); if (activeOnly) qs.set('active', '1');
      if (branchId && branchId !== 'all') qs.set('branch_id', branchId);
      setPkgs((await apiJson<{ packages: Pkg[] }>(`/api/pt-packages?${qs}`)).packages);
    } catch (e: any) { setError(e.message); setPkgs(null); }
  }, [activeOnly, branchId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showForm) return;
    Promise.all([apiJson<any[]>('/api/members'), apiJson<any[]>('/api/profiles')]).then(([m, p]) => {
      setMembers(m.filter((x) => !x.is_archived && (!branchId || branchId === 'all' || x.branch_id === branchId)));
      setTrainers(p.filter((x) => ['trainer', 'branch_manager', 'owner', 'super_owner'].includes(x.role)));
    }).catch((e) => setMsg({ ok: false, text: `Couldn’t load members/trainers: ${e.message}` }));
  }, [showForm, branchId]);

  const memberMatches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? members.filter((m) => matchesPerson(s, m.full_name, m.phone)) : members).slice(0, 50);
  }, [members, q]);
  const selMember = members.find((m) => m.id === form.member_id);
  const trainerOpts = trainers.filter((t) => !selMember || t.role === 'owner' || t.role === 'super_owner' || t.branch_id === selMember.branch_id || (t.assigned_branch_ids || []).includes(selMember.branch_id));

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (!form.member_id) return setMsg({ ok: false, text: 'Pick a member first.' });
    if (!form.trainer_id) return setMsg({ ok: false, text: 'Pick a trainer.' });
    try {
      const r = await apiJson<{ package: Pkg }>('/api/pt-packages', { method: 'POST', json: { ...form, sessions_total: Number(form.sessions_total), price: form.price === '' ? 0 : Number(form.price) } });
      setMsg({ ok: true, text: `PT package created for ${r.package.member_name} (${r.package.sessions_total} sessions).` });
      setShowForm(false); setForm({ member_id: '', trainer_id: '', sessions_total: '12', price: '', expires_on: '' }); setQ('');
      load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  const logSession = async (p: Pkg) => {
    setMsg(null);
    try {
      const r = await apiJson<{ package: Pkg }>(`/api/pt-packages/${p.id}/sessions`, { method: 'POST', json: {} });
      setMsg({ ok: true, text: `Session logged for ${p.member_name}. ${r.package.sessions_left} left.` });
      load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };
  const undo = async (p: Pkg) => {
    const last = p.sessions[p.sessions.length - 1]; if (!last) return;
    try { await apiJson(`/api/pt-packages/${p.id}/sessions/${last.id}`, { method: 'DELETE' }); setMsg({ ok: true, text: 'Last session removed.' }); load(); }
    catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };
  const exportCsv = () => pkgs && downloadText(toCsv(pkgs as any, [['member_name', 'Member'], ['trainer_name', 'Trainer'], ['sessions_total', 'Sessions'], ['sessions_used', 'Used'], ['sessions_left', 'Left'], ['price', 'Price (INR)'], ['purchased_at', 'Purchased'], ['expires_on', 'Expires']]), `pulse-pt-${new Date().toISOString().slice(0, 10)}.csv`);

  return (
    <div className="space-y-3" data-testid="pt-panel">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <label className="flex items-center gap-1 text-xs text-zinc-400"><input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />Active only</label>
        <div className="flex gap-2">
          <button onClick={exportCsv} disabled={!pkgs?.length} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-xs font-bold flex items-center gap-1 disabled:opacity-50"><Download className="w-3.5 h-3.5" />CSV</button>
          {canCreate && <button onClick={() => setShowForm((v) => !v)} className="px-2.5 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" />New PT package</button>}
        </div>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-xs rounded-xl p-2 border ${msg.ok ? 'text-emerald-200 bg-emerald-950/40 border-emerald-800' : 'text-red-200 bg-red-950/40 border-red-800'}`}>{msg.text}</p>}
      {showForm && (
        <form onSubmit={create} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 grid gap-2 sm:grid-cols-2" data-testid="pt-form">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search member name/phone" className="sm:col-span-2 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white" />
          {members.length > 0 && memberMatches.length === 0 && <p role="status" className="sm:col-span-2 text-[11px] text-amber-300">No member matches “{q}”. Check the spelling or type phone digits. <button type="button" className="underline" onClick={() => setQ('')}>Clear</button></p>}
          <select aria-label="Member" value={form.member_id} onChange={(e) => setForm({ ...form, member_id: e.target.value, trainer_id: '' })} className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white">
            <option value="">{members.length ? `Member (${memberMatches.length} shown)` : 'Loading members…'}</option>
            {memberMatches.map((m) => <option key={m.id} value={m.id}>{m.full_name} · {m.phone}</option>)}
          </select>
          <select aria-label="Trainer" value={form.trainer_id} onChange={(e) => setForm({ ...form, trainer_id: e.target.value })} className="px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white">
            <option value="">Trainer</option>
            {trainerOpts.map((t) => <option key={t.id} value={t.id}>{t.full_name} ({t.role.replace('_', ' ')})</option>)}
          </select>
          <label className="text-xs text-zinc-400">Sessions<input type="number" min={1} max={200} value={form.sessions_total} onChange={(e) => setForm({ ...form, sessions_total: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white" /></label>
          <label className="text-xs text-zinc-400">Price ₹<input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white" /></label>
          <label className="text-xs text-zinc-400">Expires (optional)<input type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-white" /></label>
          <button className="self-end px-3 py-2 rounded-lg bg-orange-600 text-white text-sm font-bold">Create package</button>
        </form>
      )}
      {error && <p role="alert" className="text-xs text-red-300 bg-red-950/40 border border-red-800 rounded-xl p-2">Couldn’t load PT packages: {error} <button onClick={load} className="underline">Retry</button></p>}
      {!error && pkgs === null && <p className="text-xs text-zinc-500">Loading PT packages…</p>}
      {pkgs && pkgs.length === 0 && <p className="text-xs text-zinc-400 bg-zinc-900 rounded-xl p-3">{activeOnly ? 'No active PT packages. Untick “Active only” to see finished ones.' : 'No PT packages yet.'}{canCreate ? ' Use “New PT package” to sell one.' : ' Ask the manager/owner to create one.'}</p>}
      {pkgs && pkgs.length > 0 && (
        <ul className="space-y-2 max-h-[50vh] overflow-auto">
          {pkgs.map((p) => (
            <li key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{p.member_name}</div>
                <div className="text-[11px] text-zinc-500 truncate">Trainer {p.trainer_name}{p.expires_on ? ` · expires ${p.expires_on}` : ''}{p.sessions.length ? ` · last ${new Date(p.sessions[p.sessions.length - 1].at).toLocaleDateString('en-IN')}` : ''}</div>
                <div className="mt-1 h-1.5 rounded bg-zinc-800 overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${(p.sessions_used / p.sessions_total) * 100}%` }} /></div>
              </div>
              <div className={`text-xs font-bold shrink-0 ${p.expired ? 'text-red-400' : 'text-zinc-200'}`}>{p.expired ? 'Expired' : `${p.sessions_left}/${p.sessions_total} left`}</div>
              <button onClick={() => logSession(p)} disabled={p.expired || p.sessions_left <= 0} className="shrink-0 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-40"><CheckCircle2 className="w-3.5 h-3.5" />Log</button>
              {canCreate && p.sessions.length > 0 && <button onClick={() => undo(p)} title="Remove last session" aria-label="Undo last session" className="shrink-0 p-1.5 rounded-lg bg-zinc-800 text-zinc-300"><Undo2 className="w-3.5 h-3.5" /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
