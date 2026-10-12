import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, CheckCircle2, AlertTriangle, XCircle, Loader2, Search } from 'lucide-react';
import { apiJson, ApiError } from '../../lib/http';

type Result =
  | { kind: 'ok'; name: string; warnings: string[]; at: string }
  | { kind: 'error'; message: string; code?: string; member?: any; candidates?: { id: string; full_name: string }[]; retry?: Record<string, unknown> };

export const CheckInPanel: React.FC<{ branchId?: string }> = ({ branchId }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const [camState, setCamState] = useState<'off' | 'starting' | 'on' | 'error'>('off');
  const [camError, setCamError] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [today, setToday] = useState<any[] | null>(null);
  const [todayError, setTodayError] = useState('');

  const loadToday = useCallback(async () => {
    try {
      setTodayError('');
      const from = new Date(); from.setHours(0, 0, 0, 0);
      const qs = new URLSearchParams({ from: from.toISOString() });
      if (branchId && branchId !== 'all') qs.set('branch_id', branchId);
      const list = await apiJson<any[]>(`/api/attendance?${qs}`);
      setToday(Array.isArray(list) ? list : []);
    } catch (e: any) { setTodayError(e.message); setToday(null); }
  }, [branchId]);
  useEffect(() => { loadToday(); }, [loadToday]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamState((s) => (s === 'error' ? s : 'off'));
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const submit = useCallback(async (payload: Record<string, unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const r = await apiJson<any>('/api/attendance/check-in', { method: 'POST', json: payload });
      setResult({ kind: 'ok', name: r.member?.full_name || 'Member', warnings: r.warnings || [], at: r.record?.checked_in_at });
      if (navigator.vibrate) navigator.vibrate(80);
      setPhone('');
      loadToday();
    } catch (e: any) {
      const err = e as ApiError;
      setResult({ kind: 'error', message: err.message, code: err.code, member: err.body?.member, candidates: err.body?.candidates, retry: payload });
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }, [loadToday]);

  const scanLoop = useCallback(() => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || !streamRef.current) return;
    if (v.readyState >= 2 && !busyRef.current) {
      const w = Math.min(640, v.videoWidth), h = Math.round((v.videoHeight / v.videoWidth) * w) || 480;
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(v, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          submit({ qr_token: code.data });
          setTimeout(() => requestAnimationFrame(scanLoop), 2500);
          return;
        }
      }
    }
    requestAnimationFrame(scanLoop);
  }, [submit]);

  const startCamera = async () => {
    setCamError('');
    if (!window.isSecureContext) {
      setCamState('error');
      setCamError('The camera only works over HTTPS (or on localhost). Open Pulse via its https:// address, or use phone-number check-in below.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState('error'); setCamError('This browser cannot use the camera. Use phone-number check-in below.'); return;
    }
    setCamState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
      setCamState('on');
      requestAnimationFrame(scanLoop);
    } catch (e: any) {
      setCamState('error');
      const n = e?.name;
      setCamError(
        n === 'NotAllowedError' || n === 'SecurityError' ? 'Camera permission was denied. Allow camera access for this site in the browser settings (lock icon → Camera → Allow), then tap Start again. Meanwhile use phone-number check-in below.' :
        n === 'NotFoundError' || n === 'OverconstrainedError' ? 'No camera was found on this device. Use phone-number check-in below.' :
        n === 'NotReadableError' ? 'The camera is busy in another app. Close it and try again, or use phone-number check-in.' :
        `Could not start the camera (${n || 'unknown error'}). Use phone-number check-in below.`);
    }
  };

  const onManual = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { setResult({ kind: 'error', message: 'Enter the member’s 10-digit phone number.' }); return; }
    submit({ member_id: digits.slice(-10), method: 'manual' });
  };

  return (
    <div className="space-y-4" data-testid="checkin-panel">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white">Scan member QR</h3>
          {camState === 'on' ? (
            <button onClick={stopCamera} className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-bold flex items-center gap-1"><CameraOff className="w-3.5 h-3.5" />Stop</button>
          ) : (
            <button onClick={startCamera} disabled={camState === 'starting'} className="px-3 py-1.5 rounded-xl bg-orange-600 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-60">
              {camState === 'starting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}Start camera
            </button>
          )}
        </div>
        <div className={`relative rounded-xl overflow-hidden bg-black ${camState === 'on' || camState === 'starting' ? '' : 'hidden'}`}>
          <video ref={videoRef} playsInline muted className="w-full max-h-72 object-cover" />
          <div className="absolute inset-8 border-2 border-orange-500/70 rounded-xl pointer-events-none" />
        </div>
        <canvas ref={canvasRef} className="hidden" />
        {camState === 'error' && <p role="alert" className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-xl p-2">{camError}</p>}
        {camState === 'off' && <p className="text-xs text-zinc-400">Point the camera at the QR in the member’s Pulse app (Digital Pass tab).</p>}
      </div>

      <form onSubmit={onManual} className="flex gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={16} placeholder="Member phone (10 digits)" aria-label="Member phone"
          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white" />
        <button disabled={busy} className="px-4 py-2 rounded-xl bg-zinc-100 text-zinc-900 text-sm font-bold flex items-center gap-1 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}Check in
        </button>
      </form>

      {result && (
        <div role="status" data-testid="checkin-result" className={`rounded-2xl p-3 border text-sm ${result.kind === 'ok' ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200' : 'bg-red-950/40 border-red-800 text-red-200'}`}>
          {result.kind === 'ok' ? (
            <>
              <div className="flex items-center gap-2 font-bold"><CheckCircle2 className="w-4 h-4" />{result.name} checked in</div>
              {result.warnings.map((w) => <div key={w} className="mt-1 flex items-center gap-1 text-amber-300 text-xs"><AlertTriangle className="w-3.5 h-3.5" />{w}</div>)}
            </>
          ) : (
            <>
              <div className="flex items-start gap-2"><XCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{result.message}</span></div>
              {(result.code === 'MEMBERSHIP_EXPIRED' || result.code === 'MEMBERSHIP_INACTIVE') && result.retry && (
                <button onClick={() => submit({ ...result.retry, override: true })} className="mt-2 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold">Allow one-time entry</button>
              )}
              {result.candidates && (
                <div className="mt-2 flex flex-wrap gap-2">{result.candidates.map((c) => (
                  <button key={c.id} onClick={() => submit({ member_id: c.id, method: 'manual' })} className="px-3 py-1.5 rounded-xl bg-zinc-800 text-white text-xs font-bold">{c.full_name}</button>
                ))}</div>
              )}
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400">Today’s check-ins {today ? `(${today.length})` : ''}</h3>
        {todayError ? <p role="alert" className="text-xs text-red-300">Couldn’t load today’s check-ins: {todayError} <button className="underline" onClick={loadToday}>Retry</button></p> :
          today === null ? <p className="text-xs text-zinc-400">Loading…</p> :
          today.length === 0 ? <p className="text-xs text-zinc-400">No check-ins yet today.</p> : (
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 max-h-64 overflow-auto">
            {today.slice(0, 100).map((a) => (
              <li key={a.id} className="px-3 py-2 flex justify-between text-xs"><span className="text-zinc-200 truncate">{a.member_name}</span>
                <span className="text-zinc-400 shrink-0 ml-2">{new Date(a.checked_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {a.method}</span></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
