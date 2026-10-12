import React, { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { toast } from '../lib/toast';

interface PinUser { id: string; kind: string; name: string; role: string; phone: string; has_pin: boolean }

/** Super-owner only: set or reset any person's PIN (server enforces this too). */
export const PinManagementModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [users, setUsers] = useState<PinUser[]>([]);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  const load = async () => {
    const r = await fetch('/api/auth/pins');
    if (r.ok) setUsers(await r.json());
    else toast.error('Only the super owner can manage PINs');
  };
  useEffect(() => { load(); }, []);

  const save = async (id: string) => {
    const r = await fetch(`/api/auth/pins/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }),
    });
    const b = await r.json().catch(() => ({}));
    if (r.ok) { toast.success('PIN updated'); setEditing(null); setPin(''); load(); }
    else toast.error(b.error || 'Could not set PIN');
  };

  const shown = users.filter((u) => `${u.name} ${u.phone} ${u.role}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md" role="dialog" aria-label="Manage PINs">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 font-black uppercase text-sm"><KeyRound className="w-4 h-4 text-red-400" /> Login PINs</div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-xl hover:bg-zinc-800"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 border-b border-zinc-900">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search name, phone or role"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-red-500" />
        </div>
        <ul className="overflow-y-auto divide-y divide-zinc-900">
          {shown.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <div className="flex-1 min-w-[10rem]">
                <div className="font-bold text-white">{u.name}</div>
                <div className="text-[11px] text-zinc-500">{u.role.replace('_', ' ')} · {u.phone} · {u.has_pin ? 'PIN set' : 'no PIN'}</div>
              </div>
              {editing === u.id ? (
                <>
                  <input autoFocus type="password" inputMode="numeric" maxLength={8} value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="New PIN"
                    className="w-28 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 tracking-widest" />
                  <button onClick={() => save(u.id)} className="px-3 py-1.5 rounded-lg bg-red-600 font-bold text-xs">Save</button>
                  <button onClick={() => { setEditing(null); setPin(''); }} className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs">Cancel</button>
                </>
              ) : (
                <button onClick={() => { setEditing(u.id); setPin(''); }} className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-bold">
                  {u.has_pin ? 'Reset PIN' : 'Set PIN'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
