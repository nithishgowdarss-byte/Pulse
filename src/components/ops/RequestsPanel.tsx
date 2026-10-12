import React, { useEffect, useState } from 'react';
import { apiJson } from '../../lib/http';
import { Notice, btnCls, fieldCls } from '../ui/Modal';

const when = (iso?: string) => iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : '';

/** Member self-renew requests: desk records the payment via Renew, then confirms. */
export const RenewRequestsPanel: React.FC<{ onOpenRenew?: (memberId: string) => void }> = ({ onOpenRenew }) => {
  const [list, setList] = useState<any[]>([]); const [err, setErr] = useState(''); const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<Record<string, string>>({}); const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const load = async () => { setErr(''); try { setList((await apiJson('/api/renew-requests')).requests); } catch (e: any) { setErr(e.message); } finally { setLoaded(true); } };
  useEffect(() => { load(); }, []);
  const act = async (id: string, status: string) => {
    setRowErr({ ...rowErr, [id]: '' });
    try { await apiJson(`/api/renew-requests/${id}/resolve`, { method: 'POST', json: { status, note: note[id] } }); load(); }
    catch (e: any) { setRowErr({ ...rowErr, [id]: e.message }); }
  };
  const pending = list.filter((r) => r.status === 'pending');
  return (
    <div className="space-y-2" data-testid="renew-requests">
      {err && <Notice kind="error">{err} <button className="underline font-bold" onClick={load}>Retry</button></Notice>}
      {loaded && !err && pending.length === 0 && <Notice>No pending renewal requests. Members can request a renewal from their app; it shows up here.</Notice>}
      {pending.map((r) => (
        <div key={r.id} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 space-y-2">
          <div className="text-sm text-white font-bold">{r.member_name} · {r.months} month{r.months > 1 ? 's' : ''}{r.package_type ? ` · ${r.package_type}` : ''}</div>
          <div className="text-[11px] text-zinc-400">Requested {when(r.created_at)}{r.note ? ` · “${r.note}”` : ''}</div>
          <ol className="text-[11px] text-zinc-300 list-decimal ml-4"><li>Collect payment and record it with <b>Renew</b> on the member.</li><li>Then press <b>Confirm</b>.</li></ol>
          <div className="flex flex-wrap gap-2">
            {onOpenRenew && <button className={`${btnCls} bg-sky-700 text-white`} onClick={() => onOpenRenew(r.member_id)}>Renew {r.member_name.split(' ')[0]}</button>}
            <button className={`${btnCls} bg-emerald-700 text-white`} onClick={() => act(r.id, 'confirmed')}>Confirm</button>
            <input aria-label={`Reason for rejecting ${r.member_name}`} placeholder="Reason (to reject)" value={note[r.id] || ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} className={`${fieldCls} flex-1 min-w-[140px]`} />
            <button className={`${btnCls} bg-zinc-800 text-red-300`} onClick={() => act(r.id, 'rejected')}>Reject</button>
          </div>
          {rowErr[r.id] && <Notice kind="error">{rowErr[r.id]}</Notice>}
        </div>
      ))}
      {list.some((r) => r.status !== 'pending') && <details className="text-[11px] text-zinc-400"><summary className="cursor-pointer">History ({list.filter((r) => r.status !== 'pending').length})</summary>
        <ul className="mt-1 space-y-1">{list.filter((r) => r.status !== 'pending').slice(0, 50).map((r) => <li key={r.id}>{r.member_name} · {r.months}m · {r.status}{r.resolution_note ? ` (${r.resolution_note})` : ''} · {when(r.resolved_at)}</li>)}</ul></details>}
    </div>
  );
};

export const PrivacyRequestsPanel: React.FC<{ canResolve: boolean }> = ({ canResolve }) => {
  const [list, setList] = useState<any[]>([]); const [err, setErr] = useState(''); const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<Record<string, string>>({}); const [waive, setWaive] = useState<Record<string, boolean>>({}); const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const load = async () => { setErr(''); try { setList((await apiJson('/api/privacy/requests')).requests); } catch (e: any) { setErr(e.message); } finally { setLoaded(true); } };
  useEffect(() => { load(); }, []);
  const act = async (id: string, action: string, name: string) => {
    if (action === 'approve' && prompt(`This permanently removes ${name}'s personal data (payments are kept without their name). Type DELETE to continue.`) !== 'DELETE') return;
    setRowErr({ ...rowErr, [id]: '' });
    try { await apiJson(`/api/privacy/requests/${id}/resolve`, { method: 'POST', json: { action, note: note[id], waive_dues: !!waive[id] } }); load(); }
    catch (e: any) { setRowErr({ ...rowErr, [id]: e.message }); }
  };
  const exportFor = async (memberId: string) => {
    try {
      const data = await apiJson(`/api/privacy/export?member_id=${memberId}`);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = `member-data-${memberId}.json`; a.click();
    } catch (e: any) { setErr(e.message); }
  };
  const pending = list.filter((r) => r.status === 'pending');
  return (
    <div className="space-y-2" data-testid="privacy-requests">
      <p className="text-[11px] text-zinc-400">Data deletion requests under the DPDP Act, 2023. Approving anonymises the member: name, phone, measurements, PIN and consent are removed; payment records stay for accounts without identity.</p>
      {err && <Notice kind="error">{err} <button className="underline font-bold" onClick={load}>Retry</button></Notice>}
      {loaded && !err && pending.length === 0 && <Notice>No pending data deletion requests.</Notice>}
      {pending.map((r) => (
        <div key={r.id} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 space-y-2">
          <div className="text-sm text-white font-bold">{r.member_name}</div>
          <div className="text-[11px] text-zinc-400">Requested {when(r.created_at)}{r.reason ? ` · “${r.reason}”` : ''}</div>
          {canResolve ? (<>
            <div className="flex flex-wrap gap-2 items-center">
              <button className={`${btnCls} bg-zinc-800 text-white`} onClick={() => exportFor(r.member_id)}>Export their data</button>
              <label className="text-[11px] text-zinc-300 flex items-center gap-1"><input type="checkbox" checked={!!waive[r.id]} onChange={(e) => setWaive({ ...waive, [r.id]: e.target.checked })} /> Waive dues</label>
              <button className={`${btnCls} bg-red-700 text-white`} onClick={() => act(r.id, 'approve', r.member_name)}>Approve & delete</button>
            </div>
            <div className="flex gap-2"><input aria-label={`Reason for rejecting ${r.member_name}`} placeholder="Reason (to reject)" value={note[r.id] || ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} className={fieldCls} /><button className={`${btnCls} bg-zinc-800 text-red-300`} onClick={() => act(r.id, 'reject', r.member_name)}>Reject</button></div>
          </>) : <p className="text-[11px] text-amber-300">Only an owner can resolve this.</p>}
          {rowErr[r.id] && <Notice kind="error">{rowErr[r.id]}</Notice>}
        </div>
      ))}
    </div>
  );
};
