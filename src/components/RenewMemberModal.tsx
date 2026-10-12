import React, { useState } from 'react';
import { Member, Profile, PlanPackage, PaymentMethod } from '../types';
import { RefreshCw, IndianRupee, Calendar, CheckCircle2, X } from 'lucide-react';
import { PACKAGE_CONFIGS, calculateRenewalPreFill } from '../lib/membership';
import { getDefaultCommissionRate } from '../lib/commission';

interface RenewMemberModalProps {
  member: Member;
  currentProfile: Profile;
  onClose: () => void;
  onRenewalSuccess: () => void;
}

export const RenewMemberModal: React.FC<RenewMemberModalProps> = ({
  member,
  currentProfile,
  onClose,
  onRenewalSuccess
}) => {
  const initialPreFill = calculateRenewalPreFill(member, 1);

  const [packageType, setPackageType] = useState<PlanPackage>(initialPreFill.packageType as PlanPackage);
  const [subscriptionMonths, setSubscriptionMonths] = useState<number>(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI / GPay / PhonePe');
  
  const [amountPaid, setAmountPaid] = useState<string>(initialPreFill.suggestedAmount.toString());
  const [balanceDue, setBalanceDue] = useState<string>('0');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [commissionRate, setCommissionRate] = useState<string>(initialPreFill.defaultCommissionRate.toString());
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Update suggested pricing whenever package or months change
  const handlePackageOrMonthsChange = (newPkg: PlanPackage, newMonths: number) => {
    setPackageType(newPkg);
    setSubscriptionMonths(newMonths);

    const config = PACKAGE_CONFIGS[newPkg] || PACKAGE_CONFIGS['General Gym'];
    const calculatedFee = config.pricePerMonth * newMonths;
    setAmountPaid(calculatedFee.toString());
    setCommissionRate(config.defaultCommissionRate.toString());
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const paidVal = parseFloat(amountPaid || '0');
      const dueVal = parseFloat(balanceDue || '0');
      const commRateVal = parseFloat(commissionRate || '10');

      const res = await fetch(`/api/members/${member.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription_months: subscriptionMonths,
          package_type: packageType,
          payment_method: paymentMethod,
          amount_paid: paidVal,
          balance_due: dueVal,
          payment_reference: paymentReference || undefined,
          commission_rate: commRateVal,
          notes: notes || undefined,
          renewed_by: currentProfile.id
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to renew membership');
      }

      onRenewalSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Renewal process failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-lg w-full shadow-2xl relative overflow-hidden">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-red-950 via-zinc-900 to-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-red-600/20 border border-red-500/30 text-red-400 flex items-center justify-center">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">1-TAP MEMBERSHIP RENEWAL</h3>
              <p className="text-xs text-zinc-400">{member.full_name}</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleRenewSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">

          {errorMessage && (
            <div className="p-3 bg-red-950 border border-red-800 text-red-300 text-xs rounded-xl">
              {errorMessage}
            </div>
          )}

          {/* Package Selection */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Select Gym Package</label>
            <select
              value={packageType}
              onChange={(e) => handlePackageOrMonthsChange(e.target.value as PlanPackage, subscriptionMonths)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 font-bold"
            >
              {Object.keys(PACKAGE_CONFIGS).map((pkgKey) => (
                <option key={pkgKey} value={pkgKey}>
                  {pkgKey} (₹{PACKAGE_CONFIGS[pkgKey as PlanPackage].pricePerMonth}/mo • {PACKAGE_CONFIGS[pkgKey as PlanPackage].defaultCommissionRate}% Comm)
                </option>
              ))}
            </select>
          </div>

          {/* Months Buttons */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Duration (Months)</label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 3, 6, 12].map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => handlePackageOrMonthsChange(packageType, m)}
                  className={`py-2 text-xs font-black rounded-xl border transition-all ${
                    subscriptionMonths === m
                      ? 'bg-red-600 text-white border-red-500 shadow-md'
                      : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {m} {m === 1 ? 'Month' : 'Months'}
                </button>
              ))}
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">
                Amount Paid (₹) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                required
                min="0"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Balance Due (₹)</label>
              <input
                type="number"
                min="0"
                value={balanceDue}
                onChange={(e) => setBalanceDue(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-400 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Commission & Payment Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
              >
                <option value="UPI / GPay / PhonePe">UPI / GPay / PhonePe</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Trainer Commission (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Transaction Ref */}
          <div>
            <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Transaction Ref / UPI ID (Optional)</label>
            <input
              type="text"
              placeholder="e.g. UPI/8812930/PhonePe"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-red-500"
            />
          </div>

          {/* Renewal Summary Box */}
          <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-800 text-xs text-zinc-400 space-y-1">
            <p className="flex justify-between">
              <span>Trainer Commission Earned:</span>
              <span className="font-mono font-bold text-amber-400">
                ₹{Math.round(((parseFloat(amountPaid || '0')) * (parseFloat(commissionRate || '10'))) / 100)} ({commissionRate}%)
              </span>
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>CONFIRM & EXECUTE RENEWAL</span>
          </button>

        </form>

      </div>
    </div>
  );
};
