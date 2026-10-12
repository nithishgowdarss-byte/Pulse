// src/components/register/ScanToBillButton.tsx
import React, { useState } from 'react';
import { safeFetchJson } from '../../lib/apiUtils';
import { toast } from '../../lib/toast';
import { QrCode, X, Search, Camera } from 'lucide-react';
import { Member } from '../../types';

export type FilledData = {
  entryType: 'renewal' | 'balance';
  phone: string;
  fullName: string;
  gender?: string;
  balanceDue: number;
  endDate?: string | null;
};

interface ScanToBillButtonProps {
  onFilled: (data: FilledData) => void;
  branchId?: string | null;
}

export const ScanToBillButton: React.FC<ScanToBillButtonProps> = ({ onFilled, branchId }) => {
  const [open, setOpen] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  async function handleFindMember(query: string) {
    if (!query.trim()) return;
    setIsSearching(true);

    try {
      const clean = query.replace(/\D/g, '').slice(-10);
      const members = await safeFetchJson<Member[]>('/api/members', undefined, []);
      const found = members.find(
        (m) =>
          m.id === query.trim() ||
          String(m.phone).replace(/\D/g, '').slice(-10) === clean ||
          m.full_name.toLowerCase().includes(query.toLowerCase().trim())
      );

      if (!found) {
        toast.error('No matching member found');
        return;
      }

      if (found.is_archived) {
        toast.error('Member is archived');
        return;
      }

      const phone = String(found.phone || '').replace(/\D/g, '').slice(-10);
      const hasDue = Number(found.balance_due) > 0;
      
      let endingSoon = false;
      if (found.end_date) {
        const diffDays = Math.ceil((new Date(found.end_date).getTime() - Date.now()) / 86400000);
        if (diffDays <= 14) endingSoon = true;
      }

      const entryType: 'renewal' | 'balance' = hasDue ? 'balance' : 'renewal';

      onFilled({
        entryType,
        phone,
        fullName: found.full_name,
        gender: found.gender || undefined,
        balanceDue: Number(found.balance_due || 0),
        endDate: found.end_date,
      });

      toast.success(
        hasDue
          ? `Loaded ${found.full_name} · Balance ₹${Number(found.balance_due).toLocaleString('en-IN')}`
          : `Loaded ${found.full_name} · Ready for Renewal (R)`
      );

      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Error finding member');
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700/80 text-xs font-semibold text-zinc-200 transition-colors shadow-sm"
      >
        <QrCode className="w-3.5 h-3.5 text-cyan-400" />
        <span>Scan to Bill</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-100">Scan to Bill / Quick Member Lookup</h3>
                  <p className="text-xs text-zinc-400">Autofill N / R / B / F desk form in 1 step</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
                <Search className="w-4 h-4 text-zinc-400" />
                <span>Search by Phone, Name or Member ID</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={phoneSearch}
                  onChange={(e) => setPhoneSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFindMember(phoneSearch);
                  }}
                  placeholder="e.g. 9876543210 or Rahul"
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleFindMember(phoneSearch)}
                  disabled={isSearching || !phoneSearch.trim()}
                  className="rounded-xl bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-xs font-bold text-white transition-colors disabled:opacity-50"
                >
                  {isSearching ? '...' : 'Load'}
                </button>
              </div>
            </div>

            <div className="text-[11px] text-zinc-400 text-center">
              Member QR codes containing <code className="text-zinc-400">PULSE:MEMBER:ID</code> or standard 10-digit phone automatically prefill amount & balance.
            </div>
          </div>
        </div>
      )}
    </>
  );
};
