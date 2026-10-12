import React, { useState } from 'react';
import { Profile, CommissionSettlement } from '../types';
import { Award, CheckCircle2, X } from 'lucide-react';

interface CommissionSettlementModalProps {
  trainer: Profile;
  pendingCommissionAmount: number;
  onClose: () => void;
  onSettlementSuccess: () => void;
}

export const CommissionSettlementModal: React.FC<CommissionSettlementModalProps> = ({
  trainer,
  pendingCommissionAmount,
  onClose,
  onSettlementSuccess
}) => {
  const [settlementAmount, setSettlementAmount] = useState<string>(pendingCommissionAmount.toString());
  const [notes, setNotes] = useState<string>('Commission payout settled via GPay / Cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const amt = parseFloat(settlementAmount);
      if (isNaN(amt) || amt <= 0) {
        throw new Error('Please enter a valid positive settlement amount');
      }

      const res = await fetch('/api/commission-settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainer_id: trainer.id,
          total_commission: amt,
          notes: notes || undefined
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to record commission settlement');
      }

      onSettlementSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Settlement failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full shadow-2xl relative overflow-hidden">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-950 via-zinc-900 to-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-600/20 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">SETTLE TRAINER COMMISSION</h3>
              <p className="text-xs text-zinc-400">{trainer.full_name}</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSettle} className="p-6 space-y-4">

          {errorMessage && (
            <div className="p-3 bg-red-950 border border-red-800 text-red-300 text-xs rounded-xl">
              {errorMessage}
            </div>
          )}

          {/* Pending Overview */}
          <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase block">Calculated Pending Balance</span>
              <span className="text-xl font-black text-amber-400 font-mono">₹{pendingCommissionAmount}</span>
            </div>
            <span className="px-2.5 py-1 bg-amber-950 border border-amber-800 text-amber-400 text-[10px] font-bold rounded-lg uppercase">
              Pending Payout
            </span>
          </div>

          {/* Amount Input */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">
              Settlement Amount to Pay (₹) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-zinc-400 font-bold text-sm">₹</span>
              <input
                type="number"
                required
                min="1"
                value={settlementAmount}
                onChange={(e) => setSettlementAmount(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Settlement Note / Mode</label>
            <input
              type="text"
              placeholder="e.g. Paid via GPay / Cash"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Action */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-zinc-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>MARK COMMISSION AS PAID & SETTLED</span>
          </button>

        </form>

      </div>
    </div>
  );
};
