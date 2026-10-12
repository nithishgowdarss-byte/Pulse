import React, { useState, useEffect } from 'react';
import { MemberOffers } from './MemberOffers';
import { MemberQrPass, MemberPtSummary } from './MemberQrPass';
import { Profile, Member, AttendanceRecord, PaymentRecord, MemberMeasurement, GymAnnouncement, MemberFreezeRequest } from '../types';
import { Dumbbell, QrCode, Calendar, Clock, CreditCard, Scale, PauseCircle, Bell, User, Phone, CheckCircle2, AlertCircle, RefreshCw, Send, Sparkles } from 'lucide-react';
import { calculateDaysRemaining } from '../lib/membership';
import { formatPhoneDisplay } from '../lib/phoneUtils';
import { PulseAiCoachChat } from './PulseAiCoachChat';
import { safeFetchJson } from '../lib/apiUtils';

interface MemberAppViewProps {
  currentProfile: Profile;
  onLogout: () => void;
}

export const MemberAppView: React.FC<MemberAppViewProps> = ({ currentProfile, onLogout }) => {
  const [member, setMember] = useState<Member | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [measurements, setMeasurements] = useState<MemberMeasurement[]>([]);
  const [announcements, setAnnouncements] = useState<GymAnnouncement[]>([]);
  const [activeTab, setActiveTab] = useState<'pass' | 'measurements' | 'ai_coach' | 'freeze' | 'announcements'>('pass');
  const [loading, setLoading] = useState(true);

  // Freeze Request Form
  const [freezeStart, setFreezeStart] = useState('');
  const [freezeEnd, setFreezeEnd] = useState('');
  const [freezeReason, setFreezeReason] = useState('');
  const [freezeSubmitted, setFreezeSubmitted] = useState(false);

  const fetchMemberSelf = async () => {
    setLoading(true);
    try {
      const list = await safeFetchJson<Member[]>('/api/members', undefined, []);
      if (list && list.length > 0) {
        // Match member by email or phone or default first active member
        const found = list.find(m => m.email === currentProfile.email || m.phone === currentProfile.phone) || list[0];
        setMember(found || null);

        if (found) {
          const [paymentsData, measurementsData, announcementsData] = await Promise.all([
            safeFetchJson<PaymentRecord[]>(`/api/members/${found.id}/payments`, undefined, []),
            safeFetchJson<MemberMeasurement[]>(`/api/members/${found.id}/measurements`, undefined, []),
            safeFetchJson<GymAnnouncement[]>('/api/announcements', undefined, [])
          ]);

          if (paymentsData) setPayments(paymentsData);
          if (measurementsData) setMeasurements(measurementsData);
          if (announcementsData) setAnnouncements(announcementsData);
        }
      }
    } catch (err) {
      console.warn('Member fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemberSelf();
  }, []);

  const [freezeError, setFreezeError] = useState<string | null>(null);

  const isAnnualMember = Boolean(
    member &&
    (Number(member.subscription_months) === 12 ||
      /annual|year|yearly|12\s*month/i.test(member.package_type || ''))
  );

  const handleRequestFreeze = async (e: React.FormEvent) => {
    e.preventDefault();
    setFreezeError(null);
    if (!member || !freezeStart || !freezeEnd || !freezeReason) return;

    if (!isAnnualMember) {
      setFreezeError('Membership freezes are strictly reserved for Annual (12-Month) memberships.');
      return;
    }

    const start = new Date(freezeStart).getTime();
    const end = new Date(freezeEnd).getTime();
    const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
    if (diffDays > 30 || diffDays < 1) {
      setFreezeError('Freeze duration cannot exceed 30 calendar days (1 month).');
      return;
    }

    try {
      const res = await fetch('/api/freeze-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: member.id,
          member_name: member.full_name,
          start_date: freezeStart,
          end_date: freezeEnd,
          reason: freezeReason
        })
      });

      if (res.ok) {
        setFreezeSubmitted(true);
        setFreezeStart('');
        setFreezeEnd('');
        setFreezeReason('');
      } else {
        const errData = await res.json().catch(() => ({}));
        setFreezeError(errData.error || 'Failed to submit freeze request');
      }
    } catch (err) {
      console.error(err);
      setFreezeError('Connection error while submitting request');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono text-zinc-400">Loading Member Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-6 flex items-center justify-center">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl max-w-sm w-full text-center space-y-4">
          <Dumbbell className="w-12 h-12 text-orange-500 mx-auto" />
          <h3 className="text-lg font-black">Member Profile Not Found</h3>
          <p className="text-xs text-zinc-400">Please ask your gym trainer or manager to onboard your phone number.</p>
          <button onClick={onLogout} className="w-full py-3 bg-zinc-800 text-white text-xs font-bold rounded-xl">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const daysRemaining = calculateDaysRemaining(member.end_date);

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      
      {/* Member App Mobile Bar */}
      <div className="bg-gradient-to-r from-red-950 via-zinc-900 to-zinc-900 border-b border-zinc-800 p-5 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-600 to-red-600 text-white font-black text-lg flex items-center justify-center shadow-lg">
            {member.full_name.slice(0, 1)}
          </div>
          <div>
            <h2 className="text-base font-black text-white">{member.full_name}</h2>
            <p className="text-[10px] text-zinc-400 font-mono">Pulse Member • {member.branch_name || 'Main Branch'}</p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl"
        >
          Sign Out
        </button>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-5">
        
        {/* Membership Pass Card */}
        <div className="bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-2xl relative overflow-hidden">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-orange-600/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 bg-orange-950 text-orange-400 border border-orange-800/80 text-[10px] font-extrabold rounded-full uppercase">
              {member.package_type || 'General Gym'}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
              member.status === 'active'
                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                : 'bg-red-950 text-red-400 border-red-800'
            }`}>
              {member.status}
            </span>
          </div>

          <div className="space-y-1 text-center py-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase block">Remaining Subscription</span>
            <span className={`text-3xl font-black font-mono block ${
              daysRemaining <= 7 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {daysRemaining < 0 ? 'Expired' : `${daysRemaining} Days Left`}
            </span>
            <span className="text-xs text-zinc-400 block pt-1">Valid until {member.end_date || 'N/A'}</span>
          </div>

          {/* QR Turnstile Pass */}
          <MemberQrPass memberId={member.id} />
          <MemberPtSummary memberId={member.id} />
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-5 gap-1 bg-zinc-900 p-1.5 rounded-2xl border border-zinc-800">
          <button
            onClick={() => setActiveTab('pass')}
            className={`py-2 text-[10px] sm:text-[11px] font-bold rounded-xl transition-all ${
              activeTab === 'pass' ? 'bg-orange-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Digital Pass
          </button>
          <button
            onClick={() => setActiveTab('measurements')}
            className={`py-2 text-[10px] sm:text-[11px] font-bold rounded-xl transition-all ${
              activeTab === 'measurements' ? 'bg-orange-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Body Log
          </button>
          <button
            onClick={() => setActiveTab('ai_coach')}
            className={`py-2 text-[10px] sm:text-[11px] font-bold rounded-xl transition-all flex items-center justify-center gap-1 ${
              activeTab === 'ai_coach' ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white shadow' : 'text-orange-400 hover:text-orange-300'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>AI Coach</span>
          </button>
          <button
            onClick={() => setActiveTab('freeze')}
            className={`py-2 text-[10px] sm:text-[11px] font-bold rounded-xl transition-all ${
              activeTab === 'freeze' ? 'bg-orange-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Pause Pass
          </button>
          <button
            onClick={() => setActiveTab('announcements')}
            className={`py-2 text-[10px] sm:text-[11px] font-bold rounded-xl transition-all ${
              activeTab === 'announcements' ? 'bg-orange-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Notice
          </button>
        </div>


        {/* TAB 1: PASS */}
        {activeTab === 'pass' && (
          <div className="space-y-4">
            
            {/* Trainer Contact Banner */}
            <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase block">Your Assigned Personal Trainer</span>
                <span className="text-sm font-black text-amber-400">{member.trainer_name || 'Pulse Master Trainer'}</span>
              </div>
              <a
                href={`tel:${member.phone}`}
                className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-bold rounded-xl flex items-center space-x-1"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Call Trainer</span>
              </a>
            </div>
          </div>
        )}

        {/* TAB 2: MEASUREMENTS */}
        {activeTab === 'measurements' && (
          <div className="space-y-3">
            <h4 className="text-xs font-black text-zinc-300 uppercase tracking-wider">Body Transformation Logs</h4>

            <div className="space-y-2">
              {measurements.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs bg-zinc-900 rounded-2xl border border-zinc-800">
                  No body composition logs recorded by trainer yet.
                </div>
              ) : (
                measurements.map(m => (
                  <div key={m.id} className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 space-y-2 text-xs">
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                      <span className="font-bold text-orange-400">{m.date}</span>
                      <span className="text-zinc-500">Weight: <strong className="text-white">{m.weight_kg ? `${m.weight_kg} kg` : 'N/A'}</strong></span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-zinc-400 pt-1">
                      <div className="bg-zinc-950 p-2 rounded-xl">Fat: {m.body_fat_pct ? `${m.body_fat_pct}%` : '-'}</div>
                      <div className="bg-zinc-950 p-2 rounded-xl">Waist: {m.waist_inches ? `${m.waist_inches}"` : '-'}</div>
                      <div className="bg-zinc-950 p-2 rounded-xl">Biceps: {m.biceps_inches ? `${m.biceps_inches}"` : '-'}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB: PULSE AI COACH (Powered by FreeLLMAPI) */}
        {activeTab === 'ai_coach' && member && (
          <PulseAiCoachChat member={member} />
        )}

        {/* TAB 3: FREEZE MEMBERSHIP REQUEST */}

        {activeTab === 'freeze' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-cyan-400 uppercase tracking-wider">Request Membership Pause / Freeze</h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                  Annual Only · Max 30d
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Going on vacation or medical leave? Annual members can pause their subscription for up to 30 calendar days (1 month).
              </p>

              {!isAnnualMember && (
                <div className="p-3 bg-amber-950/50 border border-amber-800/60 text-amber-200 text-xs rounded-xl space-y-1">
                  <p className="font-bold">⚠️ Annual Membership Benefit</p>
                  <p className="text-[11px] text-amber-300/80">
                    Membership pause / freeze is strictly reserved for 12-month Annual members. Your current plan is{' '}
                    <strong>{member?.package_type || `${member?.subscription_months || 1}-Month Plan`}</strong>. Contact the front desk if you wish to upgrade to an annual plan.
                  </p>
                </div>
              )}

              {freezeError && (
                <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-xl font-medium">
                  {freezeError}
                </div>
              )}

              {freezeSubmitted && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs rounded-xl font-bold">
                  ✓ Freeze request submitted to Gym Management for approval!
                </div>
              )}

              <form onSubmit={handleRequestFreeze} className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 block mb-1">Start Date *</label>
                    <input
                      type="date"
                      required
                      disabled={!isAnnualMember}
                      value={freezeStart}
                      onChange={(e) => setFreezeStart(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 disabled:opacity-50 rounded-xl p-2.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 block mb-1">End Date (Max 30 Days) *</label>
                    <input
                      type="date"
                      required
                      disabled={!isAnnualMember}
                      value={freezeEnd}
                      onChange={(e) => setFreezeEnd(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 disabled:opacity-50 rounded-xl p-2.5 text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-400 block mb-1">Reason for Pause *</label>
                  <textarea
                    rows={2}
                    required
                    disabled={!isAnnualMember}
                    placeholder="e.g. Work travel, fever, medical rest..."
                    value={freezeReason}
                    onChange={(e) => setFreezeReason(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 disabled:opacity-50 rounded-xl p-2.5 text-xs text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!isAnnualMember}
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-lg transition-all"
                >
                  Submit Pause Request (Max 1 Month)
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: GYM ANNOUNCEMENTS */}
        {activeTab === 'announcements' && (
          <div className="space-y-3">
            <MemberOffers />
            <h4 className="text-xs font-black text-zinc-300 uppercase tracking-wider">Pulse Gym Notice Board</h4>

            <div className="space-y-3">
              {announcements.map(ann => (
                <div key={ann.id} className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="px-2 py-0.5 bg-orange-950 text-orange-400 text-[9px] font-bold uppercase rounded border border-orange-800">
                      {ann.category || 'General'}
                    </span>
                    <span className="text-[10px] text-zinc-500">{new Date(ann.created_at).toLocaleDateString()}</span>
                  </div>
                  <h5 className="text-sm font-black text-white pt-1">{ann.title}</h5>
                  <p className="text-xs text-zinc-300 leading-relaxed">{ann.content}</p>
                  <span className="text-[10px] text-zinc-500 block pt-1">— Posted by {ann.author_name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
