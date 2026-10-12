// Client-side banner renderer (pure Canvas 2D — no external services)
import { FESTIVALS, type BannerCopy, type FestivalKey } from './bannerTemplates';

export type BannerFormat = 'story' | 'post';
export const FORMAT_SIZE: Record<BannerFormat, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  post: { w: 1080, h: 1080 },
};

export interface RenderableBanner {
  type: string;
  festival?: string;
  theme: string;
  language: 'en' | 'kn' | 'both';
  copy: BannerCopy;
  date?: string;
  venue?: string;
  offer?: string;
  price?: string;
  branches: { name: string; phone?: string }[];
}

const THEME_COLORS: Record<string, { bg: [string, string, string]; accent: string; text: string; muted: string; chip: string }> = {
  pulse: { bg: ['#0a0a0a', '#2a0505', '#7f1d1d'], accent: '#ef4444', text: '#ffffff', muted: '#fca5a5', chip: '#dc2626' },
  festive: { bg: ['#1c0a00', '#7c2d12', '#f59e0b'], accent: '#fbbf24', text: '#fffbeb', muted: '#fde68a', chip: '#b45309' },
  energy: { bg: ['#0f0a1e', '#5b21b6', '#ec4899'], accent: '#f472b6', text: '#ffffff', muted: '#f5d0fe', chip: '#9333ea' },
  ocean: { bg: ['#020617', '#0c4a6e', '#06b6d4'], accent: '#22d3ee', text: '#f0f9ff', muted: '#bae6fd', chip: '#0369a1' },
  minimal: { bg: ['#fafafa', '#f4f4f5', '#e4e4e7'], accent: '#dc2626', text: '#09090b', muted: '#52525b', chip: '#18181b' },
  kannada: { bg: ['#1a1400', '#a16207', '#b91c1c'], accent: '#facc15', text: '#ffffff', muted: '#fef08a', chip: '#b91c1c' },
};

const TYPE_ICON: Record<string, string> = { marathon: '🏃', game: '🏆', event: '📅', offer: '🔥', ad: '💪', festival: '✨' };
const TYPE_LABEL: Record<string, string> = { marathon: 'MARATHON', game: 'GAMES', event: 'EVENT', offer: 'SPECIAL OFFER', ad: 'PULSE FITNESS', festival: 'FESTIVAL WISHES' };

const LATIN = '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const KANNADA = '"Noto Sans Kannada", "Tunga", "Kedage", sans-serif';
const EMOJI = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const hasKannada = (s: string) => /[\u0C80-\u0CFF]/.test(s);
const fontFor = (s: string, weight: number, size: number) => `${weight} ${size}px ${hasKannada(s) ? KANNADA : LATIN}`;

export async function ensureBannerFonts() {
  if (typeof document === 'undefined' || !(document as any).fonts) return;
  await Promise.all([
    (document as any).fonts.load(`700 48px "Noto Sans Kannada"`, 'ಕನ್ನಡ'),
    (document as any).fonts.load(`400 48px "Noto Sans Kannada"`, 'ಕನ್ನಡ'),
  ]).catch(() => {});
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws wrapped text, shrinking the font until it fits maxLines. Returns the y below the block. */
function textBlock(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, opts: { size: number; min: number; weight: number; color: string; maxLines: number; lineH?: number; align?: CanvasTextAlign }) {
  if (!text) return y;
  let size = opts.size;
  let lines: string[] = [];
  for (; size >= opts.min; size -= 4) {
    ctx.font = fontFor(text, opts.weight, size);
    lines = wrap(ctx, text, maxW);
    if (lines.length <= opts.maxLines) break;
  }
  lines = lines.slice(0, opts.maxLines);
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = 'top';
  const lh = size * (opts.lineH ?? (hasKannada(text) ? 1.45 : 1.15));
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  return y + lines.length * lh;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderBanner(canvas: HTMLCanvasElement, b: RenderableBanner, format: BannerFormat) {
  // Shrink the middle content until it clears the CTA/footer (long AI copy, Kannada, etc.)
  for (let k = 1; k >= 0.55; k -= 0.07) {
    if (drawBanner(canvas, b, format, k)) return;
  }
}

function drawBanner(canvas: HTMLCanvasElement, b: RenderableBanner, format: BannerFormat, k: number): boolean {
  const { w, h } = FORMAT_SIZE[format];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const th = THEME_COLORS[b.theme] || THEME_COLORS.pulse;
  const story = format === 'story';
  const pad = 72;
  const cx = w / 2;

  // Background
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, th.bg[0]); g.addColorStop(0.55, th.bg[1]); g.addColorStop(1, th.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Decorative glows + rays
  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 3; i++) {
    const rg = ctx.createRadialGradient(w * (0.15 + i * 0.4), h * (0.2 + i * 0.25), 10, w * (0.15 + i * 0.4), h * (0.2 + i * 0.25), w * 0.55);
    rg.addColorStop(0, th.accent); rg.addColorStop(1, 'transparent');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = th.text;
  for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.moveTo(cx, story ? h * 0.36 : h * 0.4); ctx.arc(cx, story ? h * 0.36 : h * 0.4, w * 1.2, (i * Math.PI) / 7, (i * Math.PI) / 7 + 0.09); ctx.fill(); }
  ctx.restore();

  // Brand header
  let y = story ? 96 : 56;
  const logo = story ? 92 : 72;
  const lg = ctx.createLinearGradient(pad, y, pad + logo, y + logo);
  lg.addColorStop(0, '#dc2626'); lg.addColorStop(1, '#f97316');
  ctx.fillStyle = lg; roundRect(ctx, pad, y, logo, logo, 22); ctx.fill();
  ctx.font = `${logo * 0.55}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('💪', pad + logo / 2, y + logo / 2 + 4);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${story ? 50 : 42}px ${LATIN}`; ctx.fillStyle = th.text;
  ctx.fillText('PULSE', pad + logo + 24, y + logo * 0.38);
  const pw = ctx.measureText('PULSE ').width;
  ctx.fillStyle = th.accent; ctx.fillText('FITNESS', pad + logo + 24 + pw, y + logo * 0.38);
  ctx.font = `600 ${story ? 24 : 20}px ${LATIN}`; ctx.fillStyle = th.muted;
  ctx.fillText('Bengaluru · 3 Branches', pad + logo + 24, y + logo * 0.8);

  // Type chip
  const label = b.type === 'festival' && b.festival && FESTIVALS[b.festival as FestivalKey] ? FESTIVALS[b.festival as FestivalKey].en.toUpperCase() : TYPE_LABEL[b.type] || 'PULSE';
  ctx.font = `800 ${story ? 26 : 22}px ${LATIN}`;
  const cw = ctx.measureText(label).width + 48;
  ctx.fillStyle = th.chip; roundRect(ctx, w - pad - cw, y + logo / 2 - 26, cw, 52, 26); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(label, w - pad - cw / 2, y + logo / 2 + 1);
  y += logo + (story ? 120 : 40) * k;

  // Motif
  const motif = b.type === 'festival' && b.festival && FESTIVALS[b.festival as FestivalKey] ? FESTIVALS[b.festival as FestivalKey].motif : TYPE_ICON[b.type] || '✨';
  const ms = (story ? 230 : 130) * k;
  ctx.font = `${ms}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(motif, cx, y);
  y += ms * 1.15 + (story ? 30 : 10) * k;

  const showEn = b.language !== 'kn';
  const showKn = b.language !== 'en' && !!b.copy.kn;
  const maxW = w - pad * 2;
  const both = showEn && showKn;
  const primary = showEn ? b.copy : b.copy.kn!;

  y = textBlock(ctx, primary.headline, cx, y, maxW, { size: Math.round((story ? 112 : (both ? 72 : 88)) * k), min: Math.round(40 * k), weight: 900, color: th.text, maxLines: 2 }) + (story ? 24 : 12);
  y = textBlock(ctx, primary.subline, cx, y, maxW, { size: Math.round((story ? 46 : (both ? 32 : 38)) * k), min: Math.round(22 * k), weight: 700, color: th.accent, maxLines: 2 }) + (story ? 28 : 14);
  if (story || !both) y = textBlock(ctx, primary.body, cx, y, maxW - 40, { size: Math.round((story ? 38 : 30) * k), min: Math.round(20 * k), weight: 500, color: th.muted, maxLines: story ? 4 : 3, lineH: 1.35 }) + (story ? 36 : 18);
  if (both) {
    const kn = b.copy.kn!;
    ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = th.text; ctx.fillRect(cx - 80, y, 160, 3); ctx.restore();
    y += story ? 36 : 18;
    y = textBlock(ctx, kn.headline, cx, y, maxW, { size: Math.round((story ? 64 : 44) * k), min: Math.round(26 * k), weight: 700, color: th.text, maxLines: 2 }) + 8;
    if (story) y = textBlock(ctx, kn.body, cx, y, maxW - 40, { size: Math.round(34 * k), min: Math.round(20 * k), weight: 400, color: th.muted, maxLines: 3 }) + 24;
  }

  // Offer / price pill
  const pill = [b.offer, b.price].filter(Boolean).join('  ·  ');
  if (pill && b.type !== 'festival') {
    ctx.font = `900 ${Math.round((story ? 50 : 38) * k)}px ${LATIN}`;
    const pwid = Math.min(maxW, ctx.measureText(pill).width + 80);
    const ph = (story ? 96 : 72) * k;
    ctx.fillStyle = th.accent; roundRect(ctx, cx - pwid / 2, y, pwid, ph, ph / 2); ctx.fill();
    ctx.fillStyle = b.theme === 'minimal' ? '#fff' : '#0a0a0a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pill, cx, y + ph / 2 + 2, pwid - 40);
    y += ph + (story ? 36 : 18);
  }

  // Date / venue
  const when = [b.date && `📅 ${b.date}`, b.venue && `📍 ${b.venue}`].filter(Boolean).join('    ');
  if (when) {
    ctx.font = `700 ${Math.round((story ? 36 : 28) * k)}px ${LATIN}, ${EMOJI}`; ctx.fillStyle = th.text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(when, cx, y, maxW);
    y += (story ? 60 : 44) * k;
  }

  // Footer: CTA + branches
  const footerH = story ? 330 : 210;
  const fy = h - footerH;
  const cta = showEn ? b.copy.cta : b.copy.kn?.cta || b.copy.cta;
  ctx.font = fontFor(cta, 900, story ? 46 : 34);
  const ctaW = Math.min(maxW, ctx.measureText(cta).width + 120);
  const ctaH = story ? 100 : 72;
  const ctaY = fy - ctaH - (story ? 40 : 18);
  if (y > ctaY - 8 && k > 0.56) return false;
  const cg = ctx.createLinearGradient(cx - ctaW / 2, 0, cx + ctaW / 2, 0);
  cg.addColorStop(0, '#dc2626'); cg.addColorStop(1, '#f97316');
  ctx.fillStyle = cg; roundRect(ctx, cx - ctaW / 2, Math.max(y, ctaY), ctaW, ctaH, ctaH / 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(cta.toUpperCase(), cx, Math.max(y, ctaY) + ctaH / 2 + 2, ctaW - 40);

  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, fy, w, footerH);
  ctx.fillStyle = th.accent; ctx.fillRect(0, fy, w, 6);
  const list = b.branches.slice(0, 3);
  const colW = maxW / Math.max(1, list.length);
  list.forEach((br, i) => {
    const x = pad + colW * i + colW / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = `800 ${story ? 32 : 26}px ${LATIN}`; ctx.fillStyle = '#fff';
    ctx.fillText(br.name.replace('Pulse Fitness - ', ''), x, fy + (story ? 60 : 40), colW - 16);
    if (br.phone) { ctx.font = `600 ${story ? 30 : 24}px ${LATIN}`; ctx.fillStyle = '#e4e4e7'; ctx.fillText(`📞 ${br.phone}`, x, fy + (story ? 110 : 80), colW - 16); }
  });
  ctx.font = `600 ${story ? 26 : 20}px ${LATIN}`; ctx.fillStyle = '#a1a1aa'; ctx.textAlign = 'center';
  ctx.fillText('pulsefitness.in  ·  Train hard. Stay strong.', cx, h - (story ? 80 : 50));
  return true;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'));
}

export function shareText(b: RenderableBanner): string {
  const c = b.language === 'kn' && b.copy.kn ? b.copy.kn : b.copy;
  const lines = [`*${c.headline}*`, c.subline, c.body, [b.offer, b.price].filter(Boolean).join(' · '), [b.date, b.venue].filter(Boolean).join(' · '), `👉 ${c.cta}`];
  if (b.language === 'both' && b.copy.kn) lines.push('', `*${b.copy.kn.headline}*`, b.copy.kn.body);
  lines.push('', ...b.branches.map((br) => `📍 ${br.name.replace('Pulse Fitness - ', '')}${br.phone ? ` — ${br.phone}` : ''}`), '— Pulse Fitness');
  return lines.filter((l) => l !== undefined && l !== null && l !== '' || l === '').join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
