import { clear } from 'idb-keyval';
import type { Profile } from '../types';

export const AUTH_REQUIRED_EVENT = 'pulse:auth-required';

let installed = false;
/** Emits AUTH_REQUIRED_EVENT whenever an API call comes back 401 (expired / revoked session). */
export function installAuthInterceptor() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await orig(input, { credentials: 'same-origin', ...init });
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (res.status === 401 && url.includes('/api/') && !url.includes('/api/auth/login')) {
      window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
    }
    return res;
  };
}

const LAST_PROFILE = 'pulse_last_profile';
export function rememberProfile(p: Profile | null) {
  try { p ? localStorage.setItem(LAST_PROFILE, JSON.stringify(p)) : localStorage.removeItem(LAST_PROFILE); } catch { /* private mode */ }
}
/**
 * Current session. When the server can't be reached (offline / server down) we fall back to the last signed-in
 * profile on this device so the app (e.g. a member's saved QR pass) still opens; logout clears it.
 */
export async function fetchMe(): Promise<Profile | null> {
  try {
    const r = await fetch('/api/auth/me');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const p = (await r.json()).profile ?? null;
    rememberProfile(p);
    return p;
  } catch {
    try { return JSON.parse(localStorage.getItem(LAST_PROFILE) || 'null'); } catch { return null; }
  }
}

export async function login(phone: string, pin: string): Promise<{ profile?: Profile; error?: string }> {
  let r: Response;
  try {
    r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin }),
    });
  } catch {
    return { error: typeof navigator !== 'undefined' && !navigator.onLine ? 'You are offline. Connect to the internet to sign in.' : 'Could not reach the Pulse server. Check Wi-Fi/data and try again.' };
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return { error: body.error || (r.status >= 500 ? 'Server error. Please try again in a moment.' : 'Login failed') };
  rememberProfile(body.profile ?? null);
  return { profile: body.profile };
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  // Clear cached API responses so the next person on this device sees nothing of ours
  await clear().catch(() => {});
  try { localStorage.clear(); } catch {}
}
