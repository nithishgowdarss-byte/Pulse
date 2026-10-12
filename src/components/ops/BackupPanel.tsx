import React, { useState } from 'react';
import { apiJson } from '../../lib/http';
import { Notice, btnCls, fieldCls } from '../ui/Modal';

export const BackupPanel: React.FC = () => {
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [check, setCheck] = useState<any>(null); const [typed, setTyped] = useState('');
  const download = async () => {
    setBusy('backup'); setErr(''); setOk('');
    try {
      const res = await fetch('/api/admin/backup', { credentials: 'same-origin' });
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error || `Backup failed (${res.status})`); }
      const blob = await res.blob();
      const name = /filename="?([^";]+)/.exec(res.headers.get('content-disposition') || '')?.[1] || 'pulse-backup.db';
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setOk(`Backup downloaded (${(blob.size / 1024).toFixed(0)} KB). Keep it somewhere safe: it contains member phone numbers.`);
    } catch (e: any) { setErr(navigator.onLine ? e.message : 'You are offline. Reconnect to download a backup.'); } finally { setBusy(''); }
  };
  const upload = async (f?: File) => {
    if (!f) return; setBusy('validate'); setErr(''); setOk(''); setCheck(null); setTyped('');
    try { setCheck({ ...(await apiJson('/api/admin/restore/validate', { method: 'POST', body: f, headers: { 'Content-Type': 'application/octet-stream' }, timeoutMs: 120000 })), name: f.name }); }
    catch (e: any) { setErr(`This file can't be restored: ${e.message}`); } finally { setBusy(''); }
  };
  const restore = async () => {
    setBusy('restore'); setErr('');
    try { const r = await apiJson('/api/admin/restore/confirm', { method: 'POST', json: { token: check.token, confirm: typed } }); setOk(`Restored. A copy of the previous data was kept as ${r.previous_copy}. Reloading…`); setCheck(null); setTimeout(() => location.reload(), 2500); }
    catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-3" data-testid="backup-panel">
      <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 space-y-2">
        <h3 className="text-sm font-black text-white">Download a backup</h3>
        <p className="text-[11px] text-zinc-400">A full snapshot of all branches (members, payments, attendance, staff, settings) as one SQLite file. Take one before big changes.</p>
        <button onClick={download} disabled={!!busy} className={`${btnCls} bg-orange-600 text-white`}>{busy === 'backup' ? 'Preparing…' : 'Download backup'}</button>
      </section>
      <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 space-y-2">
        <h3 className="text-sm font-black text-white">Restore from a backup</h3>
        <p className="text-[11px] text-zinc-400">The file is checked first. Nothing changes until you type RESTORE. Current data is saved as a pre-restore copy on the server.</p>
        <label className="text-[11px] text-zinc-300 font-bold block">Backup file (.db)<input type="file" accept=".db,application/octet-stream" disabled={!!busy} onChange={(e) => upload(e.target.files?.[0])} className={fieldCls} /></label>
        {busy === 'validate' && <Notice>Checking the file…</Notice>}
        {check && (
          <div className="space-y-2">
            <Notice kind="ok">“{check.name}” is a valid Pulse backup.</Notice>
            <table className="w-full text-xs text-left"><caption className="sr-only">Backup contents compared with current data</caption>
              <thead className="text-zinc-400"><tr><th scope="col" className="p-1">Data</th><th scope="col" className="p-1 text-right">In backup</th><th scope="col" className="p-1 text-right">Now</th></tr></thead>
              <tbody>{['branches', 'profiles', 'members', 'payments'].map((k) => <tr key={k} className="border-t border-zinc-800 text-zinc-200"><td className="p-1 capitalize">{k === 'payments' ? 'payments' : k}</td><td className="p-1 text-right">{check.summary[k === 'payments' ? 'paymentHistory' : k] ?? check.summary[k] ?? 0}</td><td className="p-1 text-right">{check.current[k]}</td></tr>)}</tbody></table>
            <label className="text-[11px] text-zinc-300 font-bold block">Type RESTORE to replace all current data<input value={typed} onChange={(e) => setTyped(e.target.value)} className={fieldCls} autoComplete="off" /></label>
            <button onClick={restore} disabled={typed !== 'RESTORE' || !!busy} className={`${btnCls} bg-red-700 text-white`}>{busy === 'restore' ? 'Restoring…' : 'Restore now'}</button>
          </div>
        )}
      </section>
      {ok && <Notice kind="ok">{ok}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}
    </div>
  );
};
