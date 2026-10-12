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

export async function fetchMe(): Promise<Profile | null> {
  try {
    const r = await fetch('/api/auth/me');
    if (!r.ok) return null;
    return (await r.json()).profile ?? null;
  } catch {
    return null;
  }
}

export async function login(phone: string, pin: string): Promise<{ profile?: Profile; error?: string }> {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, pin }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return { error: body.error || 'Login failed' };
  return { profile: body.profile };
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  // Clear cached API responses so the next person on this device sees nothing of ours
  await clear().catch(() => {});
  try { localStorage.clear(); } catch {}
}
