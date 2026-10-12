import React, { useState } from 'react';
import { Member, PaymentMethod, Profile } from '../types';
import { IndianRupee, CreditCard, X, CheckCircle2 } from 'lucide-react';

interface AddPaymentModalProps {
  member: Member;
  currentProfile: Profile;
  onClose: () => void;
  onPaymentSuccess: () => void;
}

export const AddPaymentModal: React.FC<AddPaymentModalProps> = ({
  member,
  currentProfile,
  onClose,
  onPaymentSuccess
}) => {
  const [amount, setAmount] = useState<string>(member.balance_due ? member.balance_due.toString() : '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI / GPay / PhonePe');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payVal = parseFloat(amount);
      if (isNaN(payVal) || payVal <= 0) {
        throw new Error('Please enter a valid payment amount');
      }

      const res = await fetch(`/api/members/${member.id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: payVal,
          payment_method: paymentMethod,
          payment_reference: paymentReference || undefined,
          notes: notes || undefined,
          received_by: currentProfile.id
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to record payment');
      }

      onPaymentSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Payment recording failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full shadow-2xl relative overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-emerald-950 via-zinc-900 to-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <IndianRupee className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">RECORD PARTIAL PAYMENT</h3>
              <p className="text-xs text-zinc-400">{member.full_name}</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">

          {errorMessage && (
            <div className="p-3 bg-red-950 border border-red-800 text-red-300 text-xs rounded-xl">
              {errorMessage}
            </div>
          )}

          {/* Balance Overview */}
          <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex justify-between items-center">
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase block">Current Balance Due</span>
              <span className="text-lg font-black text-amber-400 font-mono">₹{member.balance_due || 0}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-zinc-400 uppercase block">Total Paid So Far</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">₹{member.amount_paid || 0}</span>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">
              Payment Amount (₹) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-zinc-400 font-bold text-sm">₹</span>
              <input
                type="number"
                required
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 2000"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="UPI / GPay / PhonePe">UPI / GPay / PhonePe / Paytm</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card Swipe (POS)</option>
              <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
            </select>
          </div>

          {/* Payment Reference ID */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">UPI Ref / Transaction ID (Optional)</label>
            <input
              type="text"
              placeholder="e.g. UPI/7781203/GPay"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Payment Notes */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Payment Note (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Cleared 2nd installment"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-black text-xs rounded-xl transition-all shadow-lg flex items-center justify-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>CONFIRM & ADD PAYMENT</span>
          </button>
        </form>

      </div>
    </div>
  );
};
