import React, { useState, useEffect } from 'react';
import { EmptySearch, matchesPerson } from './ui/EmptySearch';
import { Member, Profile, CommissionSettlement, Branch } from '../types';
import {
  Users,
  QrCode,
  Award,
  RefreshCw,
  Search,
  Plus,
  Clock,
  Building2,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { formatPhoneDisplay } from '../lib/phoneUtils';
import { calculateDaysRemaining } from '../lib/membership';
import { getTrainerCommissionStats } from '../lib/commission';
import { MyShiftPanel } from './staff/MyShiftPanel';

interface TrainerDashboardProps {
  currentTrainer: Profile;
  members: Member[];
  trainers?: Profile[];
  branches?: Branch[];
  isOwnerViewing?: boolean;
  onSwitchTrainer?: (trainerId: string) => void;
  onReturnToOwner?: () => void;
  onActivateMember: (memberId: string, details: any) => Promise<void>;
  onLaunchHandoverMode: () => void;
  onSelectMember: (member: Member) => void;
  onOpenRenew: (member: Member) => void;
  onOpenAiStudio?: (member?: Member) => void;
}

export const TrainerDashboard: React.FC<TrainerDashboardProps> = ({
  currentTrainer,
  members,
  trainers = [],
  branches = [],
  isOwnerViewing = false,
  onSwitchTrainer,
  onReturnToOwner,
  onActivateMember,
  onLaunchHandoverMode,
  onSelectMember,
  onOpenRenew,
  onOpenAiStudio,
}) => {
  const [activeTab, setActiveTab] = useState<'my_members' | 'pending' | 'commission' | 'shifts'>('my_members');
  const [searchQuery, setSearchQuery] = useState('');
  const [settlements, setSettlements] = useState<CommissionSettlement[]>([]);

  // Resolve branch name for trainer
  const matchedBranch = branches.find(b => b.id === currentTrainer.branch_id);
  const trainerBranchName = currentTrainer.branch_name || (matchedBranch ? matchedBranch.name : 'Pulse Fitness - Nagarabhavi');
  const cleanBranchName = trainerBranchName.replace('Pulse Fitness - ', '');

  // Filter trainer's own assigned members
  const myMembers = members.filter(m => m.onboarded_by === currentTrainer.id);
  const pendingMembers = myMembers.filter(m => m.status === 'pending');
  const activeMembers = myMembers.filter(m => m.status === 'active');

  useEffect(() => {
    const fetchTrainerSettlements = async () => {
      try {
        const res = await fetch(`/api/commission-settlements?trainer_id=${currentTrainer.id}`);
        if (res.ok) setSettlements(await res.json());
      } catch (err) {
        console.error(err);
      }
    };
    fetchTrainerSettlements();
  }, [currentTrainer.id]);

  // Compute Trainer Commission Stats securely
  const commissionStats = getTrainerCommissionStats(members, settlements, currentTrainer.id);

  // Filter list for table view
  const displayMembers = myMembers.filter(m => {
    if (activeTab === 'pending') return m.status === 'pending';
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      return matchesPerson(q, m.full_name, m.phone);
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Owner Preview Banner if viewed by Owner */}
      {isOwnerViewing && (
        <div className="bg-indigo-950/80 border border-indigo-700/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600 text-white rounded-xl font-black text-xs">
              OWNER VIEW
            </div>
            <div>
              <span className="text-xs font-bold text-white block">
                Viewing Trainer Portal as: <span className="text-indigo-300 font-extrabold">{currentTrainer.full_name}</span> (📍 {cleanBranchName})
              </span>
              <span className="text-[11px] text-zinc-400">
                You can switch between any branch trainer below or return to the owner dashboard.
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto">
            {trainers.length > 0 && onSwitchTrainer && (
              <div className="relative flex-1 sm:flex-none">
                <select
                  value={currentTrainer.id}
                  onChange={(e) => onSwitchTrainer(e.target.value)}
                  className="w-full sm:w-auto bg-zinc-900 border border-indigo-600/60 text-white text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-400"
                >
                  {trainers.map((t) => {
                    const br = branches.find(b => b.id === t.branch_id);
                    const bLabel = (t.branch_name || (br ? br.name : 'Nagarabhavi')).replace('Pulse Fitness - ', '');
                    return (
                      <option key={t.id} value={t.id} className="bg-zinc-900 text-white">
                        {t.full_name} • {bLabel}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {onReturnToOwner && (
              <button
                onClick={onReturnToOwner}
                className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Owner</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Welcome Banner */}
      <div className="bg-gradient-to-r from-red-950 via-zinc-900 to-zinc-900 border border-red-900/40 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-red-400 text-xs font-bold uppercase tracking-wider block">
              TRAINER PORTAL • PULSE FITNESS
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-black uppercase flex items-center space-x-1">
              <Building2 className="w-3 h-3 text-indigo-400" />
              <span>{cleanBranchName}</span>
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-1.5 flex items-center space-x-2">
            <span>Welcome, {currentTrainer.full_name}</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Assigned to <span className="text-zinc-200 font-bold">{trainerBranchName}</span>. Track floor shifts, onboard walk-in clients, and manage earned commissions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {onOpenAiStudio && (
            <button
              onClick={() => onOpenAiStudio()}
              className="px-4 py-3 bg-gradient-to-r from-orange-600 via-amber-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-orange-600/20 transition-all flex items-center space-x-2"
            >
              <Sparkles className="w-4 h-4 text-amber-200" />
              <span>AI WORKOUT &amp; DIET STUDIO</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('shifts')}
            className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-extrabold text-xs rounded-2xl shadow-lg transition-all flex items-center space-x-2"
          >
            <Clock className="w-4 h-4" />
            <span>MY SHIFT / QR BADGE</span>
          </button>


          <button
            onClick={onLaunchHandoverMode}
            className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs rounded-2xl transition-all flex items-center space-x-2"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>ONBOARD CLIENT</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl">
          <span className="text-[10px] font-bold text-zinc-400 uppercase block">My Active Clients</span>
          <div className="text-2xl sm:text-3xl font-black font-mono text-white mt-1">{activeMembers.length}</div>
          <span className="text-[11px] text-zinc-500 block mt-1">Out of {myMembers.length} total</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl">
          <span className="text-[10px] font-bold text-zinc-400 uppercase block">Pending Activations</span>
          <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400 mt-1">{pendingMembers.length}</div>
          <span className="text-[11px] text-zinc-500 block mt-1">Awaiting plan confirmation</span>
        </div>

        <button
          onClick={() => setActiveTab('commission')}
          className="bg-zinc-900 border border-zinc-800 hover:border-red-700 p-5 rounded-3xl shadow-xl text-left transition-all"
        >
          <span className="text-[10px] font-bold text-zinc-400 uppercase block">My Earned Commission</span>
          <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 mt-1">
            ₹{commissionStats.totalCommissionEarned.toLocaleString()}
          </div>
          <span className="text-[11px] text-zinc-400 block mt-1">₹{commissionStats.totalCommissionPending.toLocaleString()} Pending Payout</span>
        </button>

      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 space-x-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('my_members')}
          className={`pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
            activeTab === 'my_members' ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          MY MEMBERS ({myMembers.length})
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center space-x-1.5 ${
            activeTab === 'pending' ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-400 hover:text-amber-300'
          }`}
        >
          <span>PENDING ACTIVATION ({pendingMembers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('commission')}
          className={`pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center space-x-1.5 ${
            activeTab === 'commission' ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Award className="w-3.5 h-3.5 text-amber-400" />
          <span>MY COMMISSION SUMMARY</span>
        </button>

        <button
          onClick={() => setActiveTab('shifts')}
          className={`pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center space-x-1.5 ${
            activeTab === 'shifts' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-emerald-300'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-emerald-400" />
          <span>MY SHIFTS & QR BADGE</span>
        </button>
      </div>

      {/* CONTENT TAB: MY SHIFTS */}
      {activeTab === 'shifts' && (
        <MyShiftPanel
          staffId={currentTrainer.id}
          branchId={currentTrainer.branch_id}
          staffName={currentTrainer.full_name}
          branchName={trainerBranchName}
        />
      )}

      {/* CONTENT TAB 1 & 2: MEMBERS TABLE */}
      {activeTab !== 'commission' && activeTab !== 'shifts' && (
        <div className="space-y-4">
          
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
              {activeTab === 'pending' ? 'Clients Pending Confirmation' : 'My Onboarded Clients'}
            </h3>

            <div className="relative w-64">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-[10px] font-black uppercase text-zinc-400">
                  <tr>
                    <th className="px-6 py-4">Client Name</th>
                    <th className="px-6 py-4">Status & Validity</th>
                    <th className="px-6 py-4">Package</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {displayMembers.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <EmptySearch what={activeTab === 'pending' ? 'pending activations' : 'members'} query={activeTab === 'pending' ? '' : searchQuery}
                          onClear={() => setSearchQuery('')} emptyHint={activeTab === 'pending' ? 'All your clients are activated.' : 'Use “Onboard client” to add your first member.'} />
                      </td>
                    </tr>
                  ) : (
                    displayMembers.map((m) => {
                      const days = calculateDaysRemaining(m.end_date);
                      return (
                        <tr key={m.id} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="px-6 py-4">
                            <button
                              onClick={() => onSelectMember(m)}
                              className="font-bold text-white hover:text-red-400 transition-colors block text-left"
                            >
                              {m.full_name}
                            </button>
                            <span className="text-[11px] font-mono text-zinc-400 block mt-0.5">{formatPhoneDisplay(m.phone)}</span>
                          </td>

                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border inline-block ${
                              m.status === 'active'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                : m.status === 'pending'
                                ? 'bg-amber-950 text-amber-400 border-amber-800'
                                : 'bg-red-950 text-red-400 border-red-800'
                            }`}>
                              {m.status}
                            </span>
                            {m.end_date && (
                              <span className="text-[11px] font-mono font-bold text-zinc-400 block mt-1">
                                {days < 0 ? 'Expired' : `${days} Days Left`}
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            <span className="font-bold text-white block">{m.package_type || 'General Gym'}</span>
                            <span className="text-mono text-emerald-400 font-bold">₹{m.amount_paid || 0}</span>
                          </td>

                          <td className="px-6 py-4 text-right space-x-2">
                            {onOpenAiStudio && (
                              <button
                                onClick={() => onOpenAiStudio(m)}
                                title="Generate AI Workout & Diet Protocol"
                                className="px-3 py-1.5 bg-gradient-to-r from-orange-650 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-extrabold text-xs rounded-xl shadow transition-all inline-flex items-center space-x-1"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>AI Plan</span>
                              </button>
                            )}

                            <button
                              onClick={() => onOpenRenew(m)}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs rounded-xl shadow transition-all inline-flex items-center space-x-1"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Renew</span>
                            </button>
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENT TAB 4: MY COMMISSION SUMMARY */}
      {activeTab === 'commission' && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-600/20 text-amber-400 flex items-center justify-center">
                <Award className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-black text-white">MY COMMISSION SUMMARY</h3>
                <p className="text-xs text-zinc-400">Calculated automatically on every client onboarding & package renewal</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                <span className="text-[10px] font-bold text-zinc-500 uppercase block">Total Earned</span>
                <span className="text-2xl font-black font-mono text-amber-400">₹{commissionStats.totalCommissionEarned.toLocaleString()}</span>
              </div>

              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                <span className="text-[10px] font-bold text-zinc-500 uppercase block">Paid Out by Owner</span>
                <span className="text-2xl font-black font-mono text-emerald-400">₹{commissionStats.totalCommissionPaid.toLocaleString()}</span>
              </div>

              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                <span className="text-[10px] font-bold text-zinc-500 uppercase block">Pending Settlement Balance</span>
                <span className="text-2xl font-black font-mono text-red-400">₹{commissionStats.totalCommissionPending.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-400 uppercase">Settlement History</h4>
              <div className="space-y-2">
                {commissionStats.settlementHistory.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic p-4 bg-zinc-950 rounded-xl border border-zinc-800">No payouts logged yet.</p>
                ) : (
                  commissionStats.settlementHistory.map((s) => (
                    <div key={s.id} className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-bold text-white block">Commission Payout: ₹{(s.amount || s.total_commission || 0).toLocaleString('en-IN')}</span>
                        <span className="text-[10px] text-zinc-500">{s.notes}</span>
                      </div>
                      <span className="text-emerald-400 font-bold uppercase">{s.status}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
