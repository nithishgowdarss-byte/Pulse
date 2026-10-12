import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { RefreshCw, WifiOff } from 'lucide-react';
import { apiJson } from '../lib/http';

type Pass = { token: string; expires_at: string };
const key = (id: string) => `pulse_pass_${id}`;

export const MemberQrPass: React.FC<{ memberId: string }> = ({ memberId }) => {
  const [img, setImg] = useState('');
  const [pass, setPass] = useState<Pass | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const render = async (p: Pass) => { setPass(p); setImg(await QRCode.toDataURL(p.token, { margin: 1, width: 240, errorCorrectionLevel: 'M' })); };

  const load = useCallback(async () => {
    setLoading(true); setError(''); setNote('');
    try {
      const p = await apiJson<Pass>(`/api/members/${encodeURIComponent(memberId)}/pass`);
      try { localStorage.setItem(key(memberId), JSON.stringify(p)); } catch { /* storage full/private mode */ }
      await render(p);
    } catch (e: any) {
      let cached: Pass | null = null;
      try { cached = JSON.parse(localStorage.getItem(key(memberId)) || 'null'); } catch { cached = null; }
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        await render(cached);
        setNote(`Offline — showing your saved pass (valid until ${new Date(cached.expires_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}).`);
      } else {
        setImg(''); setPass(null);
        setError(`${e.message}${cached ? ' Your saved pass has expired.' : ''} The front desk can also check you in with your phone number.`);
      }
    } finally { setLoading(false); }
  }, [memberId]);

  useEffect(() => { load(); }, [load]);
  // Refresh shortly before expiry
  useEffect(() => {
    if (!pass) return;
    const ms = new Date(pass.expires_at).getTime() - Date.now() - 60 * 60 * 1000;
    const t = setTimeout(load, Math.max(60_000, Math.min(ms, 2 ** 31 - 1)));
    return () => clearTimeout(t);
  }, [pass, load]);

  return (
    <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800/80 text-center space-y-2" data-testid="member-qr-pass">
      {img ? (
        <div className="p-2 bg-white rounded-xl inline-block shadow-inner"><img src={img} alt="Your check-in QR code" className="w-40 h-40 sm:w-48 sm:h-48" /></div>
      ) : (
        <div className="w-40 h-40 mx-auto rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs text-zinc-500 p-3">{loading ? 'Loading your pass…' : 'Pass unavailable'}</div>
      )}
      {note && <p className="text-[11px] text-amber-300 flex items-center justify-center gap-1"><WifiOff className="w-3 h-3" />{note}</p>}
      {error && <p role="alert" className="text-[11px] text-red-300">{error}</p>}
      <div className="flex items-center justify-center gap-2">
        <span className="text-[10px] font-mono text-zinc-500">Show this at the front desk to check in</span>
        <button onClick={load} aria-label="Refresh pass" className="p-1 rounded bg-zinc-800 text-zinc-300"><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
    </div>
  );
};

export const MemberPtSummary: React.FC<{ memberId: string }> = ({ memberId }) => {
  const [pkgs, setPkgs] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiJson<{ packages: any[] }>(`/api/pt-packages?member_id=${encodeURIComponent(memberId)}`).then((r) => setPkgs(r.packages)).catch((e) => setError(e.message));
  }, [memberId]);
  if (error) return <p role="alert" className="text-[11px] text-red-300">Couldn’t load PT sessions: {error}</p>;
  if (!pkgs || pkgs.length === 0) return null;
  return (
    <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800/80 space-y-1" data-testid="member-pt">
      <div className="text-xs font-bold text-zinc-300">Personal training</div>
      {pkgs.map((p) => (
        <div key={p.id} className="text-xs text-zinc-400 flex justify-between"><span>with {p.trainer_name}</span>
          <span className={p.expired ? 'text-red-400' : 'text-orange-300 font-bold'}>{p.expired ? `expired ${p.expires_on}` : `${p.sessions_left} of ${p.sessions_total} sessions left`}</span></div>
      ))}
    </div>
  );
};
