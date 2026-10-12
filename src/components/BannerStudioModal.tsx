import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, ImagePlus, Loader2, Share2, Sparkles, X, Archive, MessageCircle } from 'lucide-react';
import type { Branch } from '../types';
import { BANNER_TYPES, FESTIVALS, THEMES, type BannerCopy, type BannerLanguage, type BannerType, type FestivalKey } from '../lib/bannerTemplates';
import { renderBanner, ensureBannerFonts, canvasToBlob, shareText, type BannerFormat, type RenderableBanner } from '../lib/bannerRenderer';
import { toast } from '../lib/toast';

interface SavedBanner extends Omit<RenderableBanner, 'branches'> { id: string; title: string; branch_ids: string[]; status: string; created_at: string; created_by_name: string; copy_source: string }

const TYPE_NAMES: Record<BannerType, string> = { marathon: 'Marathon / Run', game: 'Games / Challenge', event: 'Activity / Event', offer: 'Offer', ad: 'Ad', festival: 'Festival wishes' };

export const BannerStudioModal: React.FC<{ branches: Branch[]; onClose: () => void }> = ({ branches, onClose }) => {
  const [type, setType] = useState<BannerType>('offer');
  const [festival, setFestival] = useState<FestivalKey>('diwali');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [offer, setOffer] = useState('');
  const [price, setPrice] = useState('');
  const [branchIds, setBranchIds] = useState<string[]>(branches.map((b) => b.id));
  const [theme, setTheme] = useState<string>('pulse');
  const [language, setLanguage] = useState<BannerLanguage>('both');
  const [format, setFormat] = useState<BannerFormat>('story');
  const [validUntil, setValidUntil] = useState('');
  const [copy, setCopy] = useState<BannerCopy | null>(null);
  const [copySource, setCopySource] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<SavedBanner[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedBranches = useMemo(() => branches.filter((b) => branchIds.includes(b.id)).map((b) => ({ name: b.name, phone: b.phone })), [branches, branchIds]);
  const banner: RenderableBanner | null = copy ? { type, festival: type === 'festival' ? festival : undefined, theme, language, copy, date, venue, offer, price, branches: selectedBranches } : null;

  const loadHistory = async () => { const r = await fetch('/api/banners'); if (r.ok) setHistory(await r.json()); };
  useEffect(() => { loadHistory(); ensureBannerFonts(); }, []);
  useEffect(() => { if (type === 'festival' && theme === 'pulse') setTheme(festival === 'rajyotsava' ? 'kannada' : 'festive'); }, [type, festival]);
  useEffect(() => {
    if (!banner || !canvasRef.current) return;
    let cancelled = false;
    ensureBannerFonts().then(() => { if (!cancelled && canvasRef.current) renderBanner(canvasRef.current, banner, format); });
    return () => { cancelled = true; };
  });

  const payload = () => ({ type, festival, title, date, venue, offer, price, branch_ids: branchIds, theme, language });
  const generate = async (useAi: boolean) => {
    if (!branchIds.length) return toast.error('Pick at least one branch');
    setBusy(true);
    try {
      const r = await fetch('/api/banners/copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload(), useAi }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || 'Could not write copy');
      setCopy(b.copy); setCopySource(b.source);
      if (b.source === 'template' && useAi) toast.info('AI unavailable — used the built-in template');
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const fileName = () => `pulse-${type}-${format}-${Date.now()}.png`;
  const download = async () => {
    if (!canvasRef.current) return;
    const blob = await canvasToBlob(canvasRef.current);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fileName(); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const share = async () => {
    if (!canvasRef.current || !banner) return;
    const blob = await canvasToBlob(canvasRef.current);
    const file = new File([blob], fileName(), { type: 'image/png' });
    const text = shareText(banner);
    if ((navigator as any).canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], text, title: banner.copy.headline }); return; } catch (e: any) { if (e?.name === 'AbortError') return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  const whatsapp = () => banner && window.open(`https://wa.me/?text=${encodeURIComponent(shareText(banner))}`, '_blank', 'noopener');
  const save = async () => {
    if (!copy) return;
    const r = await fetch('/api/banners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload(), copy, copy_source: copySource, valid_until: validUntil || undefined }) });
    if (r.ok) { toast.success('Saved to banner history'); loadHistory(); } else toast.error((await r.json().catch(() => ({}))).error || 'Save failed');
  };
  const archive = async (id: string) => { await fetch(`/api/banners/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'archived' }) }); loadHistory(); };
  const reopen = (h: SavedBanner) => {
    setType(h.type as BannerType); if (h.festival) setFestival(h.festival as FestivalKey); setTitle(h.title || ''); setDate(h.date || ''); setVenue(h.venue || '');
    setOffer(h.offer || ''); setPrice(h.price || ''); setBranchIds(h.branch_ids); setTheme(h.theme); setLanguage(h.language); setCopy(h.copy); setCopySource(h.copy_source);
  };

  const input = 'w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-red-500';
  const label = 'block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md" role="dialog" aria-label="Banner Studio">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-6xl max-h-[95dvh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 font-black uppercase text-sm"><ImagePlus className="w-4 h-4 text-red-400" /> Banner Studio</div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-xl hover:bg-zinc-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 p-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label><span className={label}>Type</span>
                <select name="type" className={input} value={type} onChange={(e) => setType(e.target.value as BannerType)}>
                  {BANNER_TYPES.map((t) => <option key={t} value={t}>{TYPE_NAMES[t]}</option>)}
                </select></label>
              {type === 'festival' ? (
                <label><span className={label}>Festival</span>
                  <select name="festival" className={input} value={festival} onChange={(e) => setFestival(e.target.value as FestivalKey)}>
                    {(Object.keys(FESTIVALS) as FestivalKey[]).map((k) => <option key={k} value={k}>{FESTIVALS[k].en}</option>)}
                  </select></label>
              ) : (
                <label><span className={label}>Theme</span>
                  <select name="theme" className={input} value={theme} onChange={(e) => setTheme(e.target.value)}>{THEMES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
              )}
            </div>
            <label className="block"><span className={label}>Title</span><input name="title" className={input} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'festival' ? 'Optional personal line' : 'e.g. Pulse Sunday 10K Run'} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label><span className={label}>Date</span><input name="date" className={input} value={date} maxLength={60} onChange={(e) => setDate(e.target.value)} placeholder="Sun, 2 Nov · 6 AM" /></label>
              <label><span className={label}>Venue</span><input name="venue" className={input} value={venue} maxLength={100} onChange={(e) => setVenue(e.target.value)} placeholder="Nagarabhavi branch" /></label>
              <label><span className={label}>Offer</span><input name="offer" className={input} value={offer} maxLength={100} onChange={(e) => setOffer(e.target.value)} placeholder="Flat 30% off" /></label>
              <label><span className={label}>Price</span><input name="price" className={input} value={price} maxLength={30} onChange={(e) => setPrice(e.target.value)} placeholder="₹2,999 / 3 months" /></label>
            </div>
            {type === 'festival' && (
              <label className="block"><span className={label}>Theme</span>
                <select className={input} value={theme} onChange={(e) => setTheme(e.target.value)}>{THEMES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            )}
            <div><span className={label}>Branches</span>
              <div className="flex flex-wrap gap-2">
                {branches.map((b) => (
                  <label key={b.id} className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${branchIds.includes(b.id) ? 'bg-red-600 border-red-500' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
                    <input type="checkbox" className="sr-only" checked={branchIds.includes(b.id)} onChange={(e) => setBranchIds((p) => (e.target.checked ? [...p, b.id] : p.filter((x) => x !== b.id)))} />
                    {b.name.replace('Pulse Fitness - ', '')}
                  </label>
                ))}
              </div></div>
            <div className="grid grid-cols-3 gap-3">
              <label><span className={label}>Language</span>
                <select name="language" className={input} value={language} onChange={(e) => setLanguage(e.target.value as BannerLanguage)}>
                  <option value="en">English</option><option value="kn">ಕನ್ನಡ</option><option value="both">English + ಕನ್ನಡ</option></select></label>
              <label><span className={label}>Format</span>
                <select name="format" className={input} value={format} onChange={(e) => setFormat(e.target.value as BannerFormat)}>
                  <option value="story">Story 1080×1920</option><option value="post">Post 1080×1080</option></select></label>
              <label><span className={label}>Show members till</span><input type="date" className={input} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => generate(true)} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 font-black text-xs uppercase disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate with AI</button>
              <button onClick={() => generate(false)} disabled={busy} className="px-4 py-2 rounded-xl bg-zinc-800 font-bold text-xs uppercase">Quick template</button>
            </div>
            {copy && (
              <div className="space-y-2 bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3">
                <div className="text-[11px] text-zinc-500">Copy ({copySource === 'ai' ? 'AI' : 'template'}) — edit freely</div>
                {(['headline', 'subline', 'body', 'cta'] as const).map((k) => (
                  <input key={k} aria-label={`copy ${k}`} className={input} value={copy[k]} onChange={(e) => setCopy({ ...copy, [k]: e.target.value })} />
                ))}
                {copy.kn && language !== 'en' && (['headline', 'body', 'cta'] as const).map((k) => (
                  <input key={`kn-${k}`} aria-label={`kannada ${k}`} className={input} value={copy.kn![k]} onChange={(e) => setCopy({ ...copy, kn: { ...copy.kn!, [k]: e.target.value } })} />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            {copy ? (
              <>
                <canvas ref={canvasRef} data-testid="banner-canvas" className={`rounded-2xl border border-zinc-800 shadow-2xl w-full ${format === 'story' ? 'max-w-[300px]' : 'max-w-[420px]'}`} />
                <div className="flex flex-wrap justify-center gap-2">
                  <button onClick={download} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 text-xs font-bold"><Download className="w-4 h-4" /> PNG</button>
                  <button onClick={share} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 text-xs font-bold"><Share2 className="w-4 h-4" /> Share</button>
                  <button onClick={whatsapp} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-xs font-bold"><MessageCircle className="w-4 h-4" /> WhatsApp text</button>
                  <button onClick={save} className="px-3 py-2 rounded-xl bg-red-600 text-xs font-black uppercase">Save to history</button>
                </div>
              </>
            ) : (
              <div className="w-full h-64 grid place-items-center text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">Fill the form and generate to preview</div>
            )}
            <div className="w-full">
              <div className={label}>History ({history.length})</div>
              <ul className="divide-y divide-zinc-900 max-h-56 overflow-y-auto">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 py-2 text-xs">
                    <button onClick={() => reopen(h)} className="flex-1 text-left">
                      <div className="font-bold text-white">{h.copy.headline}</div>
                      <div className="text-zinc-500">{h.type} · {new Date(h.created_at).toLocaleDateString('en-IN')} · {h.created_by_name} · {h.status}</div>
                    </button>
                    {h.status === 'active' && <button onClick={() => archive(h.id)} aria-label="Archive banner" className="p-1.5 rounded-lg hover:bg-zinc-800"><Archive className="w-4 h-4" /></button>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
