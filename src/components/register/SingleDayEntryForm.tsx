// src/components/register/SingleDayEntryForm.tsx
import React, { useRef, useState, useEffect } from 'react';
import { submitRegisterEntry } from '../../lib/offline/registerEntry';
import { handleMutationError } from '../../lib/handleMutationError';
import { phone10, isValidInPhone10 } from '../../lib/balanceReminder';
import { ScanToBillButton } from './ScanToBillButton';
import { toast } from '../../lib/toast';
import { callRpc } from '../../lib/rpc';
import {
  IndianRupee,
  Sparkles,
  Check,
  Clock,
  User,
  Phone,
  ShieldCheck,
  PauseCircle,
  AlertCircle,
  Calendar,
  Lock,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

type EntryType = 'new' | 'renewal' | 'balance' | 'freeze';

interface FreezeEligibilityState {
  loading: boolean;
  checked: boolean;
  data: {
    eligible: boolean;
    reason?: string;
    member_id?: string;
    full_name?: string;
    package_type?: string;
    subscription_months?: number;
    current_end_date?: string;
    projected_end_date?: string;
    freeze_days?: number;
    message?: string;
  } | null;
}

interface SingleDayEntryFormProps {
  branchId?: string | null;
  onDone?: () => void;
}

export const SingleDayEntryForm: React.FC<SingleDayEntryFormProps> = ({ branchId, onDone }) => {
  const idempotencyKey = useRef(`reg:${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

  const [entryType, setEntryType] = useState<EntryType>('new');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('Male');
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState('');
  const [listPrice, setListPrice] = useState('');
  const [method, setMethod] = useState<'upi' | 'cash' | 'card' | 'bank_transfer' | 'adjusted'>('upi');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);

  const [freezeEligibility, setFreezeEligibility] = useState<FreezeEligibilityState>({
    loading: false,
    checked: false,
    data: null,
  });

  const phoneOk = phone.replace(/\D/g, '').slice(-10).length === 10;
  const paid = Number(amount || 0);
  const list = Number(listPrice || amount || 0);
  const previewBalance = entryType === 'balance' || entryType === 'freeze' ? null : Math.max(0, list - paid);

  // Check freeze eligibility when phone changes or mode switches to freeze
  useEffect(() => {
    let active = true;
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (cleanPhone.length !== 10) {
      setFreezeEligibility({ loading: false, checked: false, data: null });
      return;
    }

    if (entryType === 'freeze') {
      setFreezeEligibility(prev => ({ ...prev, loading: true }));
      callRpc<any>('member_freeze_eligible', {
        p_phone: cleanPhone,
        p_branch_id: branchId || undefined,
      })
        .then((res) => {
          if (!active) return;
          setFreezeEligibility({ loading: false, checked: true, data: res });
          if (res?.full_name && !fullName.trim()) {
            setFullName(res.full_name);
          }
        })
        .catch(() => {
          if (!active) return;
          setFreezeEligibility({
            loading: false,
            checked: true,
            data: { eligible: false, reason: 'ERROR', message: 'Could not verify eligibility' },
          });
        });
    }

    return () => {
      active = false;
    };
  }, [phone, entryType, branchId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneOk) {
      toast.error('Enter a valid 10-digit Indian phone number');
      return;
    }
    if (entryType === 'new' && !fullName.trim()) {
      toast.error('Member name is required for new join');
      return;
    }
    if (entryType !== 'freeze' && paid < 0) {
      toast.error('Enter valid amount paid');
      return;
    }
    if (entryType === 'balance' && paid <= 0) {
      toast.error('Enter amount collected for balance payment');
      return;
    }

    if (entryType === 'freeze') {
      if (freezeEligibility.checked && freezeEligibility.data && !freezeEligibility.data.eligible) {
        toast.error(freezeEligibility.data.message || 'Member is not eligible for freeze');
        return;
      }
    }

    setPending(true);
    try {
      const result = await submitRegisterEntry({
        entryType: entryType,
        fullName: fullName.trim() || 'Member',
        phone: phone,
        gender: entryType === 'balance' || entryType === 'freeze' ? null : gender,
        months: entryType === 'balance' || entryType === 'freeze' ? null : months,
        freezeDays: entryType === 'freeze' ? 30 : null,
        amount: entryType === 'freeze' ? 0 : paid,
        method: entryType === 'freeze' ? 'adjusted' : method,
        listPrice: entryType === 'balance' || entryType === 'freeze' || !listPrice ? null : Number(listPrice),
        branchId: branchId || 'br_nag_1',
        notes: notes || null,
      });

      const tag =
        entryType === 'new' ? 'N' : entryType === 'renewal' ? 'R' : entryType === 'balance' ? 'B' : 'F';
      
      if (result.queued) {
        toast.info(`Saved offline (${tag}) · Will sync automatically when back online`);
      } else if (entryType === 'freeze') {
        const newExpiry = result?.end_date ? `till ${result.end_date}` : 'for 30 days';
        toast.success(`F · 1-Month Annual Freeze applied ${newExpiry} (₹0 adjusted)`);
      } else {
        toast.success(
          `${tag} saved · ₹${paid.toLocaleString('en-IN')}` +
            (result?.balance_due > 0
              ? ` · Balance Due: ₹${Number(result.balance_due).toLocaleString('en-IN')}`
              : ' · Full Paid')
        );
      }

      // Reset form state & refresh idempotency
      idempotencyKey.current = `reg:${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      setFullName('');
      setPhone('');
      setAmount('');
      setListPrice('');
      setNotes('');
      setFreezeEligibility({ loading: false, checked: false, data: null });

      if (onDone) onDone();
    } catch (err: any) {
      handleMutationError(err);
    } finally {
      setPending(false);
    }
  }

  const isFreezeBlocked =
    entryType === 'freeze' &&
    freezeEligibility.checked &&
    freezeEligibility.data !== null &&
    !freezeEligibility.data.eligible;

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-lg backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-red-600/10 text-red-500 border border-red-500/20 font-black text-sm">
            N / R / B / F
          </div>
          <div>
            <h2 className="font-bold text-sm text-zinc-100">Front-Desk Accounts Register Entry</h2>
            <p className="text-xs text-zinc-400">Record payments, renewals, dues collection & annual freezes in one motion</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ScanToBillButton
            branchId={branchId}
            onFilled={(d) => {
              setEntryType(d.entryType);
              setPhone(d.phone);
              setFullName(d.fullName);
              if (d.gender) setGender(d.gender);
              if (d.entryType === 'balance') {
                setAmount(d.balanceDue > 0 ? String(d.balanceDue) : '');
              }
            }}
          />
        </div>
      </div>

      {/* 4-Desk Mode Toggles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            ['new', 'N · New Join', 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'],
            ['renewal', 'R · Renewal', 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10'],
            ['balance', 'B · Collect Balance', 'text-amber-400 border-amber-500/30 bg-amber-500/10'],
            ['freeze', 'F · Freeze (Annual · 30d)', 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10'],
          ] as const
        ).map(([v, label, activeColor]) => (
          <button
            key={v}
            type="button"
            onClick={() => setEntryType(v)}
            className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-all text-left flex items-center justify-between ${
              entryType === v
                ? `${activeColor} shadow-sm ring-1 ring-white/10`
                : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            <span>{label}</span>
            {entryType === v && <Check className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>

      {/* Main Form Fields */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-zinc-400" />
            <span>Full Name {entryType === 'new' && <span className="text-red-500">*</span>}</span>
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required={entryType === 'new'}
            placeholder={entryType === 'new' ? 'e.g. Vikram Rao' : 'Optional if member exists'}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-red-500 focus:outline-none"
          />
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-zinc-400" />
              <span>Mobile Phone</span>
              <span className="text-red-500">*</span>
            </span>
            {phone && (
              <span className={`text-[10px] ${phoneOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                {phoneOk ? '10-digit OK' : '10 digits needed'}
              </span>
            )}
          </label>
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            placeholder="10-digit phone"
            className={`w-full rounded-xl border bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none font-mono ${
              phone && !phoneOk ? 'border-amber-500/60' : 'border-zinc-700 focus:border-red-500'
            }`}
          />
        </div>

        {/* Fields for New & Renewal */}
        {entryType !== 'balance' && entryType !== 'freeze' && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Gender / Duration</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="rounded-xl border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-100 focus:border-red-500 focus:outline-none"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>

                <select
                  className="rounded-xl border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs text-zinc-100 focus:border-red-500 focus:outline-none font-bold"
                  value={months}
                  onChange={(e) => setMonths(Number(e.target.value))}
                >
                  <option value={1}>1 Month</option>
                  <option value={3}>3 Months</option>
                  <option value={6}>6 Months</option>
                  <option value={12}>12 Months</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Total Package List Price (₹)</label>
              <input
                type="number"
                inputMode="decimal"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                placeholder="e.g. 5000 (for balance calc)"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-red-500 focus:outline-none"
              />
            </div>
          </>
        )}

        {/* Freeze specific fields (Fixed 1 Month - 30 Days) */}
        {entryType === 'freeze' && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-indigo-300 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Freeze Duration</span>
                </span>
                <span className="text-[10px] text-indigo-400 font-bold uppercase bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-700/40">
                  Fixed 1 Month
                </span>
              </label>
              <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/20 px-3 py-2 text-xs text-indigo-200 font-bold flex items-center justify-between">
                <span>30 Calendar Days (1 Month)</span>
                <span className="text-[10px] text-indigo-300 bg-indigo-900/60 px-2 py-0.5 rounded-md font-mono">
                  +30 Days
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Freeze Reason / Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Traveling for exams / Medical"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </>
        )}

        {/* Price Paid & Payment Method (when not freeze) */}
        {entryType !== 'freeze' && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center justify-between">
                <span>Price Paid Today (₹)</span>
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-zinc-500 font-bold">₹</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  placeholder="0"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 pl-7 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:border-red-500 focus:outline-none font-bold"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300">Payment Mode</label>
              <select
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:border-red-500 focus:outline-none font-semibold uppercase"
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
              >
                <option value="upi">UPI (GPay / PhonePe)</option>
                <option value="cash">Cash (Drawer)</option>
                <option value="card">Card (POS Machine)</option>
                <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
              </select>
            </div>
          </>
        )}
      </div>

      {/* Freeze Rules Eligibility Status Banner */}
      {entryType === 'freeze' && (
        <div className="rounded-xl border p-3.5 text-xs transition-all">
          {freezeEligibility.loading ? (
            <div className="flex items-center space-x-2 text-zinc-400">
              <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span>Verifying annual membership eligibility for {phone}...</span>
            </div>
          ) : !phoneOk ? (
            <div className="flex items-center space-x-2 text-zinc-400">
              <AlertCircle className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <span>Enter 10-digit registered mobile number to verify annual plan freeze eligibility.</span>
            </div>
          ) : freezeEligibility.checked && freezeEligibility.data?.eligible ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-emerald-800/40 bg-emerald-950/30 text-emerald-300 rounded-lg p-2.5 border">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <span className="font-bold text-emerald-300">
                    Annual Member Verified: {freezeEligibility.data.full_name}
                  </span>
                  <span className="text-[11px] text-emerald-400/80 block">
                    Plan: {freezeEligibility.data.package_type || '12-Month Annual Membership'}
                  </span>
                </div>
              </div>
              <div className="text-right text-[11px] font-mono">
                <span className="text-zinc-400">Validity Extension: </span>
                <span className="text-zinc-300">{freezeEligibility.data.current_end_date}</span>
                <span className="text-emerald-400 font-bold"> → {freezeEligibility.data.projected_end_date}</span>
                <span className="ml-1 text-emerald-400 font-black">(+30d)</span>
              </div>
            </div>
          ) : freezeEligibility.checked && !freezeEligibility.data?.eligible ? (
            <div className="flex items-start space-x-2.5 border-red-800/50 bg-red-950/40 text-red-200 rounded-lg p-2.5 border">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-red-300 block">
                  {freezeEligibility.data?.reason === 'NOT_ANNUAL'
                    ? 'Freeze Blocked: Annual Members Only (12-Month Plan Required)'
                    : freezeEligibility.data?.reason === 'EXPIRED'
                    ? 'Freeze Blocked: Membership Already Expired'
                    : freezeEligibility.data?.reason === 'MEMBER_NOT_FOUND'
                    ? 'Member Not Found'
                    : 'Freeze Not Permitted'}
                </span>
                <p className="text-[11px] text-red-300/90 mt-0.5">
                  {freezeEligibility.data?.message ||
                    'Membership freeze is strictly reserved for 12-month Annual members. Please select Renewal (R) or New (N).'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-indigo-300">
              <ShieldCheck className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>
                <strong className="text-white">Business Rule:</strong> Membership freezes are strictly permitted for{' '}
                <strong className="text-indigo-200">12-month / Annual members</strong> only, capped at{' '}
                <strong className="text-indigo-200">exactly 1 month (30 days)</strong>.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer Strip with Live Balance & Submit */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
        <div>
          {previewBalance !== null && (
            <p className="text-xs text-zinc-400">
              Computed Balance Due After Save:{' '}
              <span className={`font-bold ${previewBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                ₹{previewBalance.toLocaleString('en-IN')}
              </span>
            </p>
          )}
          {entryType === 'freeze' && (
            <p className="text-xs text-indigo-400 font-medium">
              Extends annual member validity by exactly 30 days without fake revenue entry.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!phoneOk || pending || isFreezeBlocked}
          className="rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 text-xs font-bold text-white transition-all flex items-center gap-2 shadow-lg shadow-red-950"
        >
          {pending ? (
            <span>Recording Entry…</span>
          ) : (
            <>
              <Check className="w-4 h-4" />
              <span>
                Save Entry (
                {entryType === 'new' ? 'N' : entryType === 'renewal' ? 'R' : entryType === 'balance' ? 'B' : 'F · Freeze'}
                )
              </span>
            </>
          )}
        </button>
      </div>
    </form>
  );
};

