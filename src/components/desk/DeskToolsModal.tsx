import React, { useState } from 'react';
import { X } from 'lucide-react';
import { CheckInPanel } from './CheckInPanel';
import { DuesPanel } from './DuesPanel';
import { PtPanel } from './PtPanel';

type Tab = 'checkin' | 'dues' | 'pt';
export const DeskToolsModal: React.FC<{ role: string; branchId?: string; actorName?: string; onClose: () => void; initialTab?: Tab }> = ({ role, branchId, actorName, onClose, initialTab = 'checkin' }) => {
  const canDues = role !== 'trainer';
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: [Tab, string][] = [['checkin', 'Check-in'], ...(canDues ? [['dues', 'Dues'] as [Tab, string]] : []), ['pt', 'PT sessions']];
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Desk tools" onClick={onClose}>
      <div className="w-full sm:max-w-2xl max-h-[95vh] overflow-auto bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-white">Front desk</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid gap-1 bg-zinc-950 p-1 rounded-2xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`py-2 text-xs font-bold rounded-xl ${tab === k ? 'bg-orange-600 text-white' : 'text-zinc-400'}`}>{l}</button>
          ))}
        </div>
        {tab === 'checkin' && <CheckInPanel branchId={branchId} />}
        {tab === 'dues' && canDues && <DuesPanel branchId={branchId} actorName={actorName} />}
        {tab === 'pt' && <PtPanel role={role} branchId={branchId} />}
      </div>
    </div>
  );
};
