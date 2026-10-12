import { csvCell } from './csv';
/** Fetch JSON and throw a readable error (never fails silently). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public body?: any) { super(message); }
}

export async function apiJson<T = any>(url: string, init: RequestInit & { timeoutMs?: number; json?: unknown } = {}): Promise<T> {
  const { timeoutMs = 15000, json, ...rest } = init;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const headers: Record<string, string> = { ...(rest.headers as any) };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...rest, headers, body: json !== undefined ? JSON.stringify(json) : rest.body, signal: ctl.signal });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === 'AbortError') throw new ApiError('The server is taking too long to respond. Check the connection and try again.', 0, 'TIMEOUT');
    throw new ApiError(typeof navigator !== 'undefined' && !navigator.onLine ? 'You are offline. Reconnect and try again.' : 'Could not reach the Pulse server. Check Wi-Fi/data and try again.', 0, 'NETWORK');
  }
  clearTimeout(timer);
  let body: any = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) { try { body = await res.json(); } catch { body = null; } }
  if (!res.ok) {
    const msg = body?.error || (res.status === 401 ? 'Your session ended. Please log in again.' : res.status === 403 ? 'You do not have access to this.' : res.status >= 500 ? 'Server error. Please try again in a moment.' : `Request failed (${res.status})`);
    throw new ApiError(msg, res.status, body?.code, body);
  }
  if (!ct.includes('application/json')) throw new ApiError('Unexpected response from server (not JSON). Is the app behind a proxy/login page?', res.status, 'BAD_RESPONSE');
  return body as T;
}

/** CSV with spreadsheet formula-injection protection. */
export function toCsv(rows: Array<Record<string, unknown>>, columns: Array<[key: string, label: string]>): string {
  const cell = csvCell;
  return [columns.map(([, l]) => cell(l)).join(','), ...rows.map((r) => columns.map(([k]) => cell(r[k])).join(','))].join('\r\n');
}

export function downloadText(content: string, filename: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\ufeff' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
