import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { ReportsPanel } from './ReportsPanel';
import { ExpensesPanel } from './ExpensesPanel';
import { RenewRequestsPanel, PrivacyRequestsPanel } from './RequestsPanel';
import { BackupPanel } from './BackupPanel';

type Tab = 'reports' | 'expenses' | 'requests' | 'privacy' | 'backup';
export const OwnerOpsModal: React.FC<{ role: string; branches: { id: string; name: string }[]; branchIds?: string[]; activeBranchId?: string; onClose: () => void; onOpenRenew?: (memberId: string) => void }> = ({ role, branches, branchIds, activeBranchId, onClose, onOpenRenew }) => {
  const isOwner = role === 'owner' || role === 'super_owner';
  const visible = branchIds && branchIds.length && !isOwner ? branches.filter((b) => branchIds.includes(b.id)) : branches;
  const tabs: [Tab, string][] = [['reports', 'Reports'], ['expenses', 'Expenses'], ['requests', 'Renewals'], ['privacy', 'Privacy'], ...(role === 'super_owner' ? [['backup', 'Backup'] as [Tab, string]] : [])];
  const [tab, setTab] = useState<Tab>('reports');
  return (
    <Modal title="Business" onClose={onClose} wide>
      <div role="tablist" aria-label="Business sections" className="grid gap-1 bg-zinc-950 p-1 rounded-2xl no-print" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`py-2 text-xs font-bold rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${tab === k ? 'bg-orange-600 text-white' : 'text-zinc-300'}`}>{l}</button>)}
      </div>
      <div role="tabpanel">
        {tab === 'reports' && <ReportsPanel branches={visible} defaultBranch={activeBranchId} />}
        {tab === 'expenses' && <ExpensesPanel branches={visible} defaultBranch={activeBranchId} canDelete={isOwner} />}
        {tab === 'requests' && <RenewRequestsPanel onOpenRenew={onOpenRenew} />}
        {tab === 'privacy' && <PrivacyRequestsPanel canResolve={isOwner} />}
        {tab === 'backup' && role === 'super_owner' && <BackupPanel />}
      </div>
    </Modal>
  );
};
export default OwnerOpsModal;
