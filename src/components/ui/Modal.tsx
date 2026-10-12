import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** Accessible dialog: Esc closes, focus moves in and is trapped, focus returns to the opener on close. */
export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = (): HTMLElement[] => Array.from(el?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') || []);
    (focusables()[1] || focusables()[0] || el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={`w-full ${wide ? 'sm:max-w-4xl' : 'sm:max-w-2xl'} max-h-[95vh] overflow-auto bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-4 space-y-4 outline-none`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-black text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Notice: React.FC<{ kind?: 'info' | 'error' | 'ok'; children: React.ReactNode }> = ({ kind = 'info', children }) => (
  <div role={kind === 'error' ? 'alert' : 'status'} className={`text-xs rounded-xl px-3 py-2 border ${kind === 'error' ? 'bg-red-950/60 border-red-800 text-red-200' : kind === 'ok' ? 'bg-emerald-950/60 border-emerald-800 text-emerald-200' : 'bg-zinc-950 border-zinc-800 text-zinc-300'}`}>{children}</div>
);

export const inr = (n: number) => { const v = Math.round(Number(n) || 0); return (v < 0 ? '−₹' : '₹') + Math.abs(v).toLocaleString('en-IN'); };
export const fieldCls = 'w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500';
export const btnCls = 'px-3 py-2 rounded-xl text-xs font-black disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400';
