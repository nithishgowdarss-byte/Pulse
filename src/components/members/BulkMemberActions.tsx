import React, { useState } from 'react';
import { Profile } from '../../types';
import { LoadingButton } from '../ui/LoadingButton';
import { CheckSquare, UserCheck, Shield, X, AlertCircle } from 'lucide-react';
import { toast } from '../../lib/toast';

interface BulkMemberActionsProps {
  selectedIds: string[];
  trainers: Profile[];
  onClearSelection: () => void;
  onSuccess: () => void;
}

export const BulkMemberActions: React.FC<BulkMemberActionsProps> = ({
  selectedIds,
  trainers,
  onClearSelection,
  onSuccess,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (selectedIds.length === 0) return null;

  const handleApply = async () => {
    if (!selectedStatus && !selectedTrainerId) {
      toast.error('Select a status or trainer to apply to selected members.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/members/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_ids: selectedIds,
          status: selectedStatus || undefined,
          trainer_id: selectedTrainerId || undefined,
        }),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(resData.error || 'Failed to update members in bulk');
      }

      toast.success(`Successfully updated ${resData.updated_count || selectedIds.length} members`);
      onClearSelection();
      onSuccess();
    } catch (err: any) {
      console.error('Bulk update error:', err);
      toast.error(err.message || 'Bulk operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[92%] sm:w-full bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-3xl p-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-200 flex flex-col sm:flex-row items-center justify-between gap-3">
      {/* Selection Count */}
      <div className="flex items-center space-x-2.5 text-white shrink-0">
        <div className="w-8 h-8 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
          <CheckSquare className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wider">
            {selectedIds.length} Members Selected
          </div>
          <p className="text-[10px] text-zinc-400">Batch operations</p>
        </div>
      </div>

      {/* Select Controls */}
      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
        {/* Status Picker */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-red-500"
        >
          <option value="">Status (No Change)</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="expired">Expired</option>
          <option value="frozen">Frozen</option>
        </select>

        {/* Trainer Assignment */}
        <select
          value={selectedTrainerId}
          onChange={(e) => setSelectedTrainerId(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-red-500 max-w-[150px] truncate"
        >
          <option value="">Trainer (No Change)</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>

        {/* Apply Action */}
        <LoadingButton
          onClick={handleApply}
          loading={isSubmitting}
          loadingText="Applying…"
          size="sm"
          variant="primary"
        >
          Apply Bulk
        </LoadingButton>

        {/* Clear */}
        <button
          onClick={onClearSelection}
          disabled={isSubmitting}
          className="p-1.5 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all"
          title="Cancel Selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
