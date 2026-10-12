import React, { useState, useEffect } from 'react';
import { Member, Profile, PaymentRecord, Branch } from '../types';
import { Phone, Mail, Download, RefreshCw, QrCode, PlusCircle, CreditCard, ArrowRightLeft } from 'lucide-react';
import { formatPhoneDisplay } from '../lib/phoneUtils';
import { generateHardenedVCard, downloadVCardFile, logExportAudit } from '../lib/export';
import { calculateDaysRemaining } from '../lib/membership';
import { MemberTransferModal } from './MemberTransferModal';

interface MemberDetailModalProps {
  member: Member;
  currentProfile: Profile;
  branches?: Branch[];
  onClose: () => void;
  onOpenAddPayment?: (member: Member) => void;
  onOpenRenew?: (member: Member) => void;
  onMemberUpdated?: () => void;
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({
  member,
  currentProfile,
  branches = [],
  onClose,
  onOpenAddPayment,
  onOpenRenew,
  onMemberUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'qrcode' | 'payments'>('details');
  const [paymentList, setPaymentList] = useState<PaymentRecord[]>([]);
  const [showTransferModal, setShowTransferModal] = useState(false);

  const daysRemaining = calculateDaysRemaining(member.end_date);

  useEffect(() => {
    const fetchMemberData = async () => {
      try {
        const payRes = await fetch(`/api/members/${member.id}/payments`);
        if (payRes.ok) setPaymentList(await payRes.json());
      } catch (err) {
        console.error(err);
      }
    };
    fetchMemberData();
  }, [member.id]);

  const handleDownloadSingleVCard = async () => {
    const res = generateHardenedVCard([member]);
    downloadVCardFile(res.vcardContent, `${member.full_name.replace(/\s+/g, '_')}_contact.vcf`);
    await logExportAudit(currentProfile, 'vcf', 'Single Member Detail', 1);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-lg w-full shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Top Banner */}
        <div className="p-6 bg-gradient-to-r from-red-950/80 via-zinc-900 to-zinc-900 border-b border-zinc-800 flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-red-600 text-white font-black text-xl flex items-center justify-center shadow-lg">
              {member.full_name.slice(0, 1)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-black text-white">{member.full_name}</h2>
              </div>
              <p className="text-xs font-mono text-zinc-400">{formatPhoneDisplay(member.phone)}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl transition-all"
          >
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-950 px-6 pt-3 space-x-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('details')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'details' ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            OVERVIEW
          </button>

          <button
            onClick={() => setActiveTab('qrcode')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center space-x-1 whitespace-nowrap ${
              activeTab === 'qrcode' ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>QR CARD</span>
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center space-x-1 whitespace-nowrap ${
              activeTab === 'payments' ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>PAYMENTS ({paymentList.length})</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 overflow-y-auto">

          {/* TAB 1: OVERVIEW & DETAILS */}
          {activeTab === 'details' && (
            <div className="space-y-6">

              {/* Status & Expiry Intelligence Box */}
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase block">Membership Status</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase border inline-block mt-1 ${
                    member.status === 'active'
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                      : member.status === 'pending'
                      ? 'bg-amber-950 text-amber-400 border-amber-800'
                      : 'bg-red-950 text-red-400 border-red-800'
                  }`}>
                    {member.status}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase block">Days Remaining</span>
                  <span className={`font-mono font-black text-lg block mt-0.5 ${
                    daysRemaining < 0
                      ? 'text-red-400'
                      : daysRemaining <= 7
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}>
                    {daysRemaining < 0 ? 'Expired' : `${daysRemaining} Days`}
                  </span>
                </div>
              </div>

              {/* Financial Breakdown Card */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Financial Overview</h4>
                  {onOpenAddPayment && member.balance_due && member.balance_due > 0 ? (
                    <button
                      onClick={() => onOpenAddPayment(member)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center space-x-1"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Clear Balance</span>
                    </button>
                  ) : null}
                </div>

                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-zinc-500 text-xs block">Amount Paid:</span>
                    <span className="font-mono font-bold text-emerald-400 text-base">₹{member.amount_paid || 0}</span>
                  </div>

                  <div>
                    <span className="text-zinc-500 text-xs block">Balance Due:</span>
                    <span className={`font-mono font-bold text-base ${
                      member.balance_due && member.balance_due > 0 ? 'text-amber-400' : 'text-zinc-400'
                    }`}>
                      ₹{member.balance_due || 0}
                    </span>
                  </div>

                  {member.payment_reference && (
                    <div className="col-span-2 pt-2 border-t border-zinc-900 flex justify-between text-xs">
                      <span className="text-zinc-500">UPI / Payment Ref:</span>
                      <span className="font-mono text-zinc-300 font-medium">{member.payment_reference}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* UPI AutoPay / E-Mandate Card */}
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white uppercase">UPI 2.0 AutoPay Mandate</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                      member.mandate_status === 'active'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                        : member.mandate_status === 'failed'
                        ? 'bg-red-950 text-red-300 border-red-700'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    {member.mandate_status ? member.mandate_status : 'Not Registered'}
                  </span>
                </div>

                <div className="text-xs text-zinc-400 space-y-1">
                  {member.mandate_id ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Mandate UMN:</span>
                        <span className="font-mono text-zinc-300">{member.mandate_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Max Auto-Debit Cap:</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          ₹{member.mandate_max_amount ? member.mandate_max_amount.toLocaleString() : '15,000'}/mo
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-zinc-500">
                      No recurring e-mandate registered for automatic renewals.
                    </p>
                  )}
                </div>
              </div>

              {/* Contact & Personal Info Grid */}
              <div className="space-y-3 text-sm">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Contact & Onboarding</h4>
                
                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3 text-zinc-300">
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                    <span className="text-zinc-500 flex items-center space-x-1">
                      <Phone className="w-3.5 h-3.5 text-red-500" />
                      <span>Phone:</span>
                    </span>
                    <span className="font-mono font-bold text-white">{formatPhoneDisplay(member.phone)}</span>
                  </div>

                  {member.email && (
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                      <span className="text-zinc-500 flex items-center space-x-1">
                        <Mail className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Email:</span>
                      </span>
                      <span className="font-medium text-white">{member.email}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                    <span className="text-zinc-500">Home Branch:</span>
                    <span className="font-bold text-indigo-400">{member.branch_name || 'Main HQ'}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                    <span className="text-zinc-500">Package Type:</span>
                    <span className="font-bold text-white">{member.package_type || 'General Gym'}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Assigned Trainer:</span>
                    <span className="font-bold text-amber-300">{member.trainer_name}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {onOpenRenew && (
                    <button
                      onClick={() => onOpenRenew(member)}
                      className="py-3 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center space-x-1.5"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>1-TAP RENEW</span>
                    </button>
                  )}

                  {onOpenAddPayment && (
                    <button
                      onClick={() => onOpenAddPayment(member)}
                      className="py-3 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-extrabold text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center space-x-1.5"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>ADD PAYMENT</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleDownloadSingleVCard}
                    className="py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs rounded-2xl transition-all flex items-center justify-center space-x-2"
                  >
                    <Download className="w-4 h-4 text-orange-400" />
                    <span>EXPORT (.VCF)</span>
                  </button>

                  {(currentProfile.role === 'super_owner' || currentProfile.role === 'owner') && branches.length > 1 && (
                    <button
                      onClick={() => setShowTransferModal(true)}
                      className="py-3 bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 font-bold text-xs rounded-2xl transition-all flex items-center justify-center space-x-1.5"
                    >
                      <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
                      <span>TRANSFER BRANCH</span>
                    </button>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: QR CODE DIGITAL PASS */}
          {activeTab === 'qrcode' && (
            <div className="space-y-4 text-center">
              <div className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 rounded-3xl border border-zinc-800 shadow-2xl max-w-xs mx-auto space-y-4">
                <div className="p-4 bg-white rounded-2xl inline-block shadow-inner">
                  <div className="w-40 h-40 bg-zinc-950 p-2 rounded-xl flex items-center justify-center">
                    <QrCode className="w-32 h-32 text-white" />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-black text-white">{member.full_name}</h3>
                  <p className="text-xs text-red-400 font-mono">ID: {member.id}</p>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">Pulse Fitness Digital Access Pass</p>
                </div>

                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-left text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Package:</span>
                    <span className="font-bold text-white">{member.package_type || 'General Gym'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Valid Till:</span>
                    <span className="font-bold text-emerald-400 font-mono">{member.end_date || 'Pending'}</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-zinc-400">
                Digital access pass for membership verification.
              </p>
            </div>
          )}

          {/* TAB 4: PAYMENT HISTORY */}
          {activeTab === 'payments' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Payment Transactions</h4>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {paymentList.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-xs">No individual payment records logged yet.</div>
                ) : (
                  paymentList.map((pay) => (
                    <div key={pay.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-black text-emerald-400 text-sm">₹{pay.amount}</span>
                        <span className="text-zinc-400 text-[10px]">{new Date(pay.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-zinc-400">
                        <span>Mode: {pay.payment_method}</span>
                        <span>By: {pay.received_by_name}</span>
                      </div>
                      {pay.notes && (
                        <p className="text-[10px] text-zinc-500 italic border-t border-zinc-900 pt-1 mt-1">
                          "{pay.notes}"
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl"
          >
            Close
          </button>
        </div>

      </div>

      {showTransferModal && (
        <MemberTransferModal
          currentProfile={currentProfile}
          member={member}
          branches={branches}
          onTransferSuccess={() => {
            if (onMemberUpdated) onMemberUpdated();
          }}
          onClose={() => setShowTransferModal(false)}
        />
      )}
    </div>
  );
};
