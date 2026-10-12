import React, { useEffect, useState } from 'react';
import { apiJson } from '../lib/http';
import { Notice, btnCls, fieldCls } from './ui/Modal';

const when = (iso?: string) => iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : '';

/** DPDP consent gate: shown on first login (or when the notice version changes). */
export const ConsentGate: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [need, setNeed] = useState(false); const [ticked, setTicked] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiJson('/api/privacy/me').then((r) => setNeed(!r.consent || r.consent.version !== r.current_version)).catch(() => setNeed(false)); // offline: don't lock the member out of their pass
  }, []);
  if (!need) return null;
  const accept = async () => {
    setBusy(true); setErr('');
    try { await apiJson('/api/privacy/consent', { method: 'POST', json: { accepted: true } }); setNeed(false); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[90] bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="consent-title" className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-3 max-h-[95vh] overflow-auto">
        <h2 id="consent-title" className="text-base font-black text-white">Your data at Pulse Fitness</h2>
        <p className="text-xs text-zinc-300">Under India’s Digital Personal Data Protection Act, 2023, we ask before using your data. We keep:</p>
        <ul className="text-xs text-zinc-300 list-disc ml-5 space-y-1">
          <li>Name, phone and branch: to run your membership and send renewal/dues reminders.</li>
          <li>Check-ins, payments and PT sessions: for your pass, receipts and accounts.</li>
          <li>Body measurements you log: only to show your progress.</li>
        </ul>
        <p className="text-xs text-zinc-300">We do not sell your data. You can download it or ask us to delete it at any time from this app (Privacy, below your pass).</p>
        <label className="flex items-start gap-2 text-xs text-white"><input type="checkbox" className="mt-0.5 w-4 h-4" checked={ticked} onChange={(e) => setTicked(e.target.checked)} /> I agree to Pulse Fitness using my data as described.</label>
        {err && <Notice kind="error">{err}</Notice>}
        <div className="flex gap-2">
          <button onClick={accept} disabled={!ticked || busy} className={`${btnCls} flex-1 bg-orange-600 text-white`}>{busy ? 'Saving…' : 'Agree and continue'}</button>
          <button onClick={onLogout} className={`${btnCls} bg-zinc-800 text-zinc-200`}>Not now, sign out</button>
        </div>
      </div>
    </div>
  );
};

export const MemberRenewCard: React.FC<{ daysRemaining: number }> = ({ daysRemaining }) => {
  const [reqs, setReqs] = useState<any[]>([]); const [months, setMonths] = useState(3); const [note, setNote] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [loadErr, setLoadErr] = useState('');
  const load = () => apiJson('/api/renew-requests').then((r) => { setReqs(r.requests); setLoadErr(''); }).catch((e) => setLoadErr(e.message));
  useEffect(() => { load(); }, []);
  const pending = reqs.find((r) => r.status === 'pending'); const last = reqs.find((r) => r.status !== 'pending');
  const submit = async () => {
    setBusy(true); setErr('');
    try { await apiJson('/api/renew-requests', { method: 'POST', json: { months, note } }); setNote(''); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const cancel = async () => { try { await apiJson(`/api/renew-requests/${pending.id}/resolve`, { method: 'POST', json: { status: 'cancelled' } }); load(); } catch (e: any) { setErr(e.message); } };
  return (
    <section aria-labelledby="renew-h" className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 space-y-2" data-testid="member-renew">
      <h3 id="renew-h" className="text-sm font-black text-white">Renew membership</h3>
      {loadErr && <Notice kind="error">Couldn’t load your renewal status: {loadErr}</Notice>}
      {pending ? (<>
        <Notice kind="ok">Request sent {when(pending.created_at)} for {pending.months} month{pending.months > 1 ? 's' : ''}. Pay at the front desk (cash/UPI); they’ll confirm it here.</Notice>
        <button onClick={cancel} className={`${btnCls} bg-zinc-800 text-zinc-200`}>Cancel request</button>
      </>) : (<>
        <p className="text-xs text-zinc-300">{daysRemaining < 0 ? 'Your membership has ended.' : `${daysRemaining} days left.`} Request a renewal and pay at the desk on your next visit. No online payment needed.</p>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-[11px] text-zinc-300 font-bold">Duration<select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={fieldCls}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}</select></label>
          <label className="text-[11px] text-zinc-300 font-bold flex-1 min-w-[120px]">Note (optional)<input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. will pay by UPI on Saturday" className={fieldCls} /></label>
          <button onClick={submit} disabled={busy} className={`${btnCls} bg-orange-600 text-white`}>{busy ? 'Sending…' : 'Request renewal'}</button>
        </div>
        {last && <p className="text-[11px] text-zinc-400">Last request: {last.months} months, {last.status}{last.resolution_note ? `: ${last.resolution_note}` : ''}.</p>}
      </>)}
      {err && <Notice kind="error">{err}</Notice>}
    </section>
  );
};

export const MemberPrivacyCard: React.FC = () => {
  const [info, setInfo] = useState<any>(null); const [err, setErr] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [ok, setOk] = useState('');
  const load = () => apiJson('/api/privacy/me').then(setInfo).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const download = async () => {
    setErr(''); setOk('');
    try {
      const data = await apiJson('/api/privacy/export');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'pulse-my-data.json'; a.click();
      setOk('Your data was downloaded as pulse-my-data.json.');
    } catch (e: any) { setErr(e.message); }
  };
  const requestDelete = async () => {
    if (!confirm('Ask Pulse Fitness to delete your personal data? Your membership and app access will end once the owner approves.')) return;
    setBusy(true); setErr('');
    try { await apiJson('/api/privacy/requests', { method: 'POST', json: { reason } }); setReason(''); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const pending = info?.requests?.find((r: any) => r.status === 'pending');
  const rejected = info?.requests?.find((r: any) => r.status === 'rejected');
  return (
    <section aria-labelledby="priv-h" className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 space-y-2" data-testid="member-privacy">
      <h3 id="priv-h" className="text-sm font-black text-white">Privacy</h3>
      {info?.consent && <p className="text-[11px] text-zinc-400">You agreed to the data notice on {when(info.consent.accepted_at)}.</p>}
      <button onClick={download} className={`${btnCls} bg-zinc-800 text-white`}>Download my data</button>
      {pending ? <Notice>Deletion requested {when(pending.created_at)}. The owner will review it; you’ll be signed out once it’s done.</Notice> : (
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-[11px] text-zinc-300 font-bold flex-1 min-w-[140px]">Reason (optional)<input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls} /></label>
          <button onClick={requestDelete} disabled={busy} className={`${btnCls} bg-zinc-800 text-red-300`}>Request data deletion</button>
        </div>
      )}
      {rejected && !pending && <p className="text-[11px] text-amber-300">Earlier deletion request was declined: {rejected.note}</p>}
      {ok && <Notice kind="ok">{ok}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}
    </section>
  );
};
