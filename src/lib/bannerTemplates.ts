// Banner Studio: shared types + offline copy templates (used when no AI provider is reachable)

export const BANNER_TYPES = ['marathon', 'game', 'event', 'offer', 'ad', 'festival'] as const;
export type BannerType = (typeof BANNER_TYPES)[number];

export const FESTIVALS = {
  diwali: { en: 'Diwali', kn: 'ದೀಪಾವಳಿ', wishEn: 'Happy Diwali!', wishKn: 'ದೀಪಾವಳಿ ಹಬ್ಬದ ಹಾರ್ದಿಕ ಶುಭಾಶಯಗಳು', motif: '🪔' },
  ugadi: { en: 'Ugadi', kn: 'ಯುಗಾದಿ', wishEn: 'Happy Ugadi!', wishKn: 'ಯುಗಾದಿ ಹಬ್ಬದ ಹಾರ್ದಿಕ ಶುಭಾಶಯಗಳು', motif: '🌿' },
  sankranti: { en: 'Makara Sankranti', kn: 'ಮಕರ ಸಂಕ್ರಾಂತಿ', wishEn: 'Happy Sankranti!', wishKn: 'ಮಕರ ಸಂಕ್ರಾಂತಿ ಹಬ್ಬದ ಶುಭಾಶಯಗಳು', motif: '🪁' },
  ganesh: { en: 'Ganesh Chaturthi', kn: 'ಗಣೇಶ ಚತುರ್ಥಿ', wishEn: 'Happy Ganesh Chaturthi!', wishKn: 'ಗಣೇಶ ಚತುರ್ಥಿಯ ಶುಭಾಶಯಗಳು', motif: '🙏' },
  dasara: { en: 'Dasara', kn: 'ದಸರಾ', wishEn: 'Happy Dasara!', wishKn: 'ನಾಡಹಬ್ಬ ದಸರಾದ ಶುಭಾಶಯಗಳು', motif: '🏵️' },
  rajyotsava: { en: 'Kannada Rajyotsava', kn: 'ಕನ್ನಡ ರಾಜ್ಯೋತ್ಸವ', wishEn: 'Happy Kannada Rajyotsava!', wishKn: 'ಕನ್ನಡ ರಾಜ್ಯೋತ್ಸವದ ಹಾರ್ದಿಕ ಶುಭಾಶಯಗಳು', motif: '💛❤️' },
  christmas: { en: 'Christmas', kn: 'ಕ್ರಿಸ್ಮಸ್', wishEn: 'Merry Christmas!', wishKn: 'ಕ್ರಿಸ್ಮಸ್ ಹಬ್ಬದ ಶುಭಾಶಯಗಳು', motif: '🎄' },
  newyear: { en: 'New Year', kn: 'ಹೊಸ ವರ್ಷ', wishEn: 'Happy New Year!', wishKn: 'ಹೊಸ ವರ್ಷದ ಹಾರ್ದಿಕ ಶುಭಾಶಯಗಳು', motif: '🎆' },
  holi: { en: 'Holi', kn: 'ಹೋಳಿ', wishEn: 'Happy Holi!', wishKn: 'ಹೋಳಿ ಹಬ್ಬದ ಶುಭಾಶಯಗಳು', motif: '🎨' },
} as const;
export type FestivalKey = keyof typeof FESTIVALS;

export const THEMES = ['pulse', 'festive', 'energy', 'ocean', 'minimal', 'kannada'] as const;
export type BannerTheme = (typeof THEMES)[number];
export type BannerLanguage = 'en' | 'kn' | 'both';

export interface BannerCopy {
  headline: string;
  subline: string;
  body: string;
  cta: string;
  kn?: { headline: string; subline: string; body: string; cta: string };
}

export interface BannerInput {
  type: BannerType;
  title: string;
  festival?: FestivalKey;
  date?: string;
  venue?: string;
  offer?: string;
  price?: string;
  branchNames?: string[];
  language?: BannerLanguage;
}

const KN_CTA: Record<BannerType, string> = {
  marathon: 'ಈಗಲೇ ನೋಂದಾಯಿಸಿ',
  game: 'ಭಾಗವಹಿಸಿ, ಗೆಲ್ಲಿರಿ',
  event: 'ಎಲ್ಲರಿಗೂ ಸ್ವಾಗತ',
  offer: 'ಇಂದೇ ಸೇರಿ',
  ad: 'ಇಂದೇ ಸೇರಿ',
  festival: 'ಆರೋಗ್ಯವಾಗಿರಿ, ಸಂತೋಷವಾಗಿರಿ',
};

export function templateCopy(input: BannerInput): BannerCopy {
  const t = (input.title || '').trim();
  const when = [input.date, input.venue].filter(Boolean).join(' · ');
  const price = input.price ? ` at ${input.price}` : '';
  let c: BannerCopy;
  switch (input.type) {
    case 'marathon':
      c = { headline: t || 'Pulse Run', subline: when || 'Bengaluru', body: `Lace up and run with the Pulse Fitness family. All levels welcome — 5K, 10K and fun run.${input.offer ? ' ' + input.offer : ''}`, cta: 'Register now' };
      break;
    case 'game':
      c = { headline: t || 'Pulse Games', subline: when || 'This weekend', body: `Team challenges, prizes and bragging rights.${input.offer ? ' ' + input.offer : ''}`, cta: 'Join the challenge' };
      break;
    case 'event':
      c = { headline: t || 'Pulse Fitness Event', subline: when || 'Coming soon', body: `Bring a friend and train with our coaches.${input.offer ? ' ' + input.offer : ''}`, cta: 'Save your spot' };
      break;
    case 'offer':
      c = { headline: t || 'Limited Time Offer', subline: input.offer ? `${input.offer}${price}` : `Membership${price}`, body: `Start your fitness journey today. Expert trainers, modern equipment, 3 branches across Bengaluru.${input.date ? ' Valid ' + (/^(till|until|valid)/i.test(input.date) ? input.date.replace(/^valid\s*/i, '') : 'till ' + input.date) + '.' : ''}`, cta: 'Join today' };
      break;
    case 'ad':
      c = { headline: t || 'Train Smarter at Pulse', subline: input.offer || 'Strength · Cardio · Personal training', body: `Certified coaches and a community that keeps you going${price}.`, cta: 'Book a free trial' };
      break;
    case 'festival': {
      const f = FESTIVALS[input.festival || 'diwali'];
      c = { headline: f.wishEn, subline: t || 'From all of us at Pulse Fitness', body: `Wishing you and your family health, strength and happiness this ${f.en}.${input.offer ? ' ' + input.offer : ''}`, cta: 'Stay strong, stay happy' };
      c.kn = { headline: f.wishKn, subline: 'ಪಲ್ಸ್ ಫಿಟ್‌ನೆಸ್ ಕುಟುಂಬದಿಂದ', body: `${f.kn} ಹಬ್ಬವು ನಿಮ್ಮ ಕುಟುಂಬಕ್ಕೆ ಆರೋಗ್ಯ, ಶಕ್ತಿ ಮತ್ತು ಸಂತೋಷ ತರಲಿ.`, cta: KN_CTA.festival };
      return c;
    }
    default:
      c = { headline: t || 'Pulse Fitness', subline: when, body: '', cta: 'Join today' };
  }
  c.kn = {
    headline: t || 'ಪಲ್ಸ್ ಫಿಟ್‌ನೆಸ್',
    subline: when || (input.offer ? input.offer : ''),
    body: input.type === 'offer' || input.type === 'ad' ? 'ಪರಿಣಿತ ತರಬೇತುದಾರರು, ಆಧುನಿಕ ಉಪಕರಣಗಳು — ಬೆಂಗಳೂರಿನಲ್ಲಿ 3 ಶಾಖೆಗಳು.' : 'ಪಲ್ಸ್ ಫಿಟ್‌ನೆಸ್ ಕುಟುಂಬದೊಂದಿಗೆ ಭಾಗವಹಿಸಿ.',
    cta: KN_CTA[input.type],
  };
  return c;
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Parse/sanitize AI JSON output; returns null if unusable. */
export function parseAiCopy(raw: string): BannerCopy | null {
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const c: BannerCopy = { headline: clip(j.headline, 60), subline: clip(j.subline, 90), body: clip(j.body, 220), cta: clip(j.cta, 40) };
    if (!c.headline || !c.cta) return null;
    if (j.kn && typeof j.kn === 'object') {
      const kn = { headline: clip(j.kn.headline, 80), subline: clip(j.kn.subline, 110), body: clip(j.kn.body, 260), cta: clip(j.kn.cta, 50) };
      if (kn.headline && /[\u0C80-\u0CFF]/.test(kn.headline)) c.kn = kn;
    }
    return c;
  } catch {
    return null;
  }
}

export function bannerPrompt(input: BannerInput): string {
  const f = input.type === 'festival' ? FESTIVALS[input.festival || 'diwali'].en : '';
  return [
    `Write short poster copy for Pulse Fitness, a gym chain in Bengaluru.`,
    `Type: ${input.type}${f ? ` (festival: ${f})` : ''}. Title: ${input.title || '-'}.`,
    input.date ? `Date: ${input.date}.` : '', input.venue ? `Venue: ${input.venue}.` : '',
    input.offer ? `Offer: ${input.offer}.` : '', input.price ? `Price: ${input.price}.` : '',
    input.branchNames?.length ? `Branches: ${input.branchNames.join(', ')}.` : '',
    `Return ONLY JSON: {"headline": max 6 words, "subline": max 12 words, "body": max 30 words, "cta": max 4 words,`,
    `"kn": {"headline","subline","body","cta"} in natural Kannada script}. No hashtags, no emojis, no prices you were not given.`,
  ].filter(Boolean).join(' ');
}
