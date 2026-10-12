import React, { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { apiJson, toCsv, downloadText } from '../../lib/http';
import { buildBalanceReminder } from '../../lib/balanceReminder';

type Target = { member_id: string; full_name: string; phone: string; balance_due: number; branch_name?: string; branch_id?: string; days_overdue?: number; last_reminder_at?: string; package_type?: string; status?: string };
type Resp = { total_outstanding?: number; targets: Target[]; invalid_phone: { member_id: string; full_name: string; phone: string; balance_due: number }[]; in_cooldown: number; cooldown_days: number };

export const DuesPanel: React.FC<{ branchId?: string; actorName?: string }> = ({ branchId, actorName }) => {
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [rowErr, setRowErr] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ cooldown_days: showAll ? '0' : '3' });
      if (branchId && branchId !== 'all') qs.set('branch_id', branchId);
      setData(await apiJson<Resp>(`/api/balance-reminders/targets?${qs}`));
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [branchId, showAll]);
  useEffect(() => { load(); }, [load]);

  const remind = async (t: Target) => {
    setRowErr((r) => ({ ...r, [t.member_id]: '' }));
    let href: string;
    try { href = buildBalanceReminder({ ...t, id: t.member_id }).href; } catch { setRowErr((r) => ({ ...r, [t.member_id]: 'Invalid phone number' })); return; }
    // Open WhatsApp first (must happen inside the click for popup blockers), then log.
    window.open(href, '_blank', 'noopener');
    try {
      await apiJson('/api/balance-reminders/log', { method: 'POST', json: { member_id: t.member_id, balance_due: t.balance_due, channel: 'whatsapp', status: 'sent', sender_name: actorName } });
      setSent((s) => ({ ...s, [t.member_id]: new Date().toISOString() }));
    } catch (e: any) {
      setRowErr((r) => ({ ...r, [t.member_id]: `WhatsApp opened, but the reminder wasn’t logged: ${e.message}` }));
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const rows = [...data.targets.map((t) => ({ ...t, note: '' })), ...data.invalid_phone.map((t) => ({ ...t, note: 'invalid phone' }))];
    downloadText(toCsv(rows, [['full_name', 'Member'], ['phone', 'Phone'], ['branch_name', 'Branch'], ['balance_due', 'Balance due (INR)'], ['package_type', 'Package'], ['last_reminder_at', 'Last reminder'], ['note', 'Note']]),
      `pulse-dues-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const total = data?.total_outstanding ?? (data ? data.targets.reduce((s, t) => s + t.balance_due, 0) + data.invalid_phone.reduce((s, t) => s + t.balance_due, 0) : 0);

  return (
    <div className="space-y-3" data-testid="dues-panel">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="text-sm text-zinc-300">{data ? <>Outstanding: <b className="text-white">₹{total.toLocaleString('en-IN')}</b></> : ' '}</div>
        <div className="flex gap-2">
          <label className="flex items-center gap-1 text-xs text-zinc-400"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Include recently reminded</label>
          <button onClick={load} aria-label="Refresh dues" className="p-1.5 rounded-lg bg-zinc-800 text-zinc-200"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={exportCsv} disabled={!data || (data.targets.length + data.invalid_phone.length) === 0} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-xs font-bold flex items-center gap-1 disabled:opacity-50"><Download className="w-3.5 h-3.5" />CSV</button>
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-red-300 bg-red-950/40 border border-red-800 rounded-xl p-2">Couldn’t load dues: {error} <button onClick={load} className="underline">Retry</button></p>}
      {!error && !data && <p className="text-xs text-zinc-500">Loading dues…</p>}
      {data && data.targets.length === 0 && (
        <p className="text-xs text-zinc-400 bg-zinc-900 rounded-xl p-3">
          {data.in_cooldown > 0 ? `No one to remind right now — ${data.in_cooldown} member(s) with dues were reminded in the last ${data.cooldown_days} days. Tick “Include recently reminded” to see them.` :
            data.invalid_phone.length ? 'Everyone with dues has an invalid phone number (listed below).' : 'No outstanding dues in this branch. 🎉'}
        </p>
      )}
      {data && data.in_cooldown > 0 && data.targets.length > 0 && <p className="text-[11px] text-zinc-500">{data.in_cooldown} member(s) hidden: reminded in the last {data.cooldown_days} days.</p>}
      {data && data.targets.length > 0 && (
        <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 max-h-[50vh] overflow-auto">
          {data.targets.map((t) => (
            <li key={t.member_id} className="p-3 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white font-semibold truncate">{t.full_name}</div>
                <div className="text-[11px] text-zinc-500 truncate">{t.phone} · {t.branch_name || t.branch_id}{t.last_reminder_at ? ` · last reminded ${new Date(t.last_reminder_at).toLocaleDateString('en-IN')}` : ''}</div>
                {rowErr[t.member_id] && <div role="alert" className="text-[11px] text-red-300">{rowErr[t.member_id]}</div>}
              </div>
              <div className="text-sm font-bold text-amber-300 shrink-0">₹{t.balance_due.toLocaleString('en-IN')}</div>
              <button onClick={() => remind(t)} className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${sent[t.member_id] ? 'bg-zinc-800 text-emerald-300' : 'bg-emerald-600 text-white'}`}>
                <MessageCircle className="w-3.5 h-3.5" />{sent[t.member_id] ? 'Sent' : 'WhatsApp'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && data.invalid_phone.length > 0 && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-3">
          <div className="text-xs font-bold text-amber-300 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{data.invalid_phone.length} member(s) with dues can’t get WhatsApp — fix their phone number</div>
          <ul className="mt-1 text-[11px] text-amber-200/80">{data.invalid_phone.map((m) => <li key={m.member_id}>{m.full_name} — “{m.phone || 'no phone'}” — ₹{m.balance_due.toLocaleString('en-IN')}</li>)}</ul>
        </div>
      )}
    </div>
  );
};
