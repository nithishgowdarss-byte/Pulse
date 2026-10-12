import React, { useState } from 'react';
import { Member, Branch, Profile } from '../types';
import { Building2, ArrowRightLeft, ShieldAlert, Check } from 'lucide-react';

interface MemberTransferModalProps {
  currentProfile: Profile;
  member: Member;
  branches: Branch[];
  onTransferSuccess: () => void;
  onClose: () => void;
}

export const MemberTransferModal: React.FC<MemberTransferModalProps> = ({
  currentProfile,
  member,
  branches,
  onTransferSuccess,
  onClose
}) => {
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    branches.find(b => b.id !== member.branch_id)?.id || ''
  );
  const [reason, setReason] = useState<string>('Client relocated / requested transfer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentBranch = branches.find(b => b.id === member.branch_id) || { name: member.branch_name || 'Current Branch' };

  const handleTransfer = async () => {
    if (!selectedBranchId) {
      setError('Please select a target destination branch.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/members/${member.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_branch_id: selectedBranchId,
          transferred_by: currentProfile.full_name,
          reason
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to transfer member');
      }

      onTransferSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-indigo-950 via-zinc-900 to-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">CROSS-BRANCH MEMBER TRANSFER</h3>
              <p className="text-xs text-zinc-400">Reassign member home location across franchise</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-950/80 border border-red-800 rounded-xl text-xs text-red-300">
              ⚠️ {error}
            </div>
          )}

          {/* Member Card Summary */}
          <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-1">
            <span className="text-[10px] font-extrabold text-zinc-400 uppercase block">Selected Member</span>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-white">{member.full_name}</h4>
              <span className="px-2 py-0.5 bg-orange-950 text-orange-400 font-extrabold text-[10px] rounded uppercase border border-orange-800">
                {member.package_type || 'General Gym'}
              </span>
            </div>
            <p className="text-xs text-zinc-400">+91 {member.phone} • Status: {member.status.toUpperCase()}</p>
          </div>

          {/* Transfer Visual Pipeline */}
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800">
              <span className="text-[10px] font-bold text-zinc-400 uppercase block mb-1">From Branch</span>
              <span className="text-xs font-bold text-zinc-300 block truncate">{currentBranch.name}</span>
            </div>

            <div className="bg-indigo-950/50 p-3 rounded-2xl border border-indigo-500/40">
              <span className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">To Destination</span>
              <span className="text-xs font-bold text-indigo-300 block truncate">
                {branches.find(b => b.id === selectedBranchId)?.name || 'Select Branch'}
              </span>
            </div>
          </div>

          {/* Select Target Branch */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Select Target Branch *</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
            >
              {branches
                .filter(b => b.id !== member.branch_id)
                .map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.city})
                  </option>
                ))}
            </select>
          </div>

          {/* Transfer Reason */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Transfer Reason / Audit Note</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500"
              placeholder="Reason for branch transfer..."
            />
          </div>

          {/* Submit Action */}
          <button
            onClick={handleTransfer}
            disabled={loading || !selectedBranchId}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-40 text-white font-extrabold text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center space-x-2"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>{loading ? 'Processing Transfer...' : 'Confirm & Execute Transfer'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
