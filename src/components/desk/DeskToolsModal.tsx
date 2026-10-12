import React, { useState } from 'react';
import { CheckInPanel } from './CheckInPanel';
import { DuesPanel } from './DuesPanel';
import { PtPanel } from './PtPanel';
import { RenewRequestsPanel } from '../ops/RequestsPanel';
import { Modal } from '../ui/Modal';

type Tab = 'checkin' | 'dues' | 'pt' | 'renew';
export const DeskToolsModal: React.FC<{ role: string; branchId?: string; actorName?: string; onClose: () => void; initialTab?: Tab }> = ({ role, branchId, actorName, onClose, initialTab = 'checkin' }) => {
  const canDues = role !== 'trainer';
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: [Tab, string][] = [['checkin', 'Check-in'], ...(canDues ? [['dues', 'Dues'] as [Tab, string]] : []), ['pt', 'PT sessions'], ['renew', 'Renewals']];
  return (
    <Modal title="Front desk" onClose={onClose}>
        <div className="grid gap-1 bg-zinc-950 p-1 rounded-2xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`py-2 text-xs font-bold rounded-xl ${tab === k ? 'bg-orange-600 text-white' : 'text-zinc-400'}`}>{l}</button>
          ))}
        </div>
        {tab === 'checkin' && <CheckInPanel branchId={branchId} />}
        {tab === 'dues' && canDues && <DuesPanel branchId={branchId} actorName={actorName} />}
        {tab === 'pt' && <PtPanel role={role} branchId={branchId} />}
        {tab === 'renew' && <RenewRequestsPanel />}
    </Modal>
  );
};
