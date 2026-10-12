import React from 'react';
import { SearchX } from 'lucide-react';

/** Explains why a list is empty and what to do next (never a blank list). */
export const EmptySearch: React.FC<{ query?: string; what: string; filterNote?: string; onClear?: () => void; emptyHint?: string }> = ({ query, what, filterNote, onClear, emptyHint }) => {
  const q = (query || '').trim();
  return (
    <div role="status" data-testid="empty-search" className="p-6 text-center text-xs text-zinc-400 space-y-2">
      <SearchX className="w-5 h-5 mx-auto text-zinc-400" />
      {q ? (
        <p>No {what} match “<span className="text-zinc-200 break-all">{q}</span>”{filterNote ? ` ${filterNote}` : ''}. Check the spelling, try part of the name, or search by phone digits.</p>
      ) : (
        <p>No {what}{filterNote ? ` ${filterNote}` : ''}. {emptyHint || ''}</p>
      )}
      {(q || filterNote) && onClear && (
        <button type="button" onClick={onClear} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 font-bold">Clear search{filterNote ? ' & filters' : ''}</button>
      )}
    </div>
  );
};

/** Matches a person by name (case-insensitive) or by phone digits ("98765 43210", "+91 98765..." all work). */
export function matchesPerson(q: string, name?: string, phone?: string, extra: (string | undefined)[] = []): boolean {
  const s = q.toLowerCase().trim();
  if (!s) return true;
  if ((name || '').toLowerCase().includes(s) || extra.some((x) => (x || '').toLowerCase().includes(s))) return true;
  const d = s.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return d.length >= 3 && String(phone || '').replace(/\D/g, '').includes(d);
}
