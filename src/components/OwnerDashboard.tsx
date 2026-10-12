import React, { useState, useEffect } from 'react';
import { EmptySearch, matchesPerson } from './ui/EmptySearch';
import { Member, Profile, CommissionSettlement, Branch } from '../types';
import {
  Users,
  Award,
  Search,
  Plus,
  Download,
  RefreshCw,
  ShieldCheck,
  PlusCircle,
  IndianRupee,
  Building2,
  History,
  FileSpreadsheet,
  UserCheck,
  Zap,
  Megaphone,
  Sparkles,
} from 'lucide-react';

import { formatPhoneDisplay } from '../lib/phoneUtils';
import { calculateDaysRemaining } from '../lib/membership';
import { getAllTrainersCommissionOverview } from '../lib/commission';
import { TrainerPerformanceSection } from './dashboard/TrainerPerformanceSection';
import { RevenueSummaryStrip } from './dashboard/RevenueSummaryStrip';
import { SingleDayEntryForm } from './register/SingleDayEntryForm';
import { ShiftCloseWidget } from './register/ShiftCloseWidget';
import { BulkMemberImport } from './import/BulkMemberImport';
import { BulkPaymentImport } from './import/BulkPaymentImport';
import { StaffAttendanceModal } from './staff/StaffAttendanceModal';
import { useExportMembersCsv } from '../hooks/useExportMembersCsv';
import { LoadingButton } from './ui/LoadingButton';

interface OwnerDashboardProps {
  currentOwner: Profile;
  members: Member[];
  trainers: Profile[];
  branches: Branch[];
  activeBranchId: string;
  onSelectMember: (member: Member) => void;
  onDeleteMember?: (memberId: string) => void;
  onLaunchHandoverMode: () => void;
  onLaunchBulkExport: () => void;
  onOpenAddPayment: (member: Member) => void;
  onOpenRenew: (member: Member) => void;
  onOpenCommissionSettlement: (trainer: Profile, pendingAmount: number) => void;
  onOpenBranchManager: () => void;
  onOpenAuditLogs: () => void;
  onSelectBranch: (branchId: string) => void;
  onOpenFreeLlmApi?: () => void;
  onOpenOwnerBroadcast?: () => void;
  onOpenTrainerStudio?: () => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  currentOwner,
  members,
  trainers,
  branches,
  activeBranchId,
  onSelectMember,
  onLaunchHandoverMode,
  onLaunchBulkExport,
  onOpenAddPayment,
  onOpenRenew,
  onOpenCommissionSettlement,
  onOpenBranchManager,
  onOpenAuditLogs,
  onSelectBranch,
  onOpenFreeLlmApi,
  onOpenOwnerBroadcast,
  onOpenTrainerStudio,
}) => {
  const [activeTab, setActiveTab] = useState<'members' | 'register' | 'trainers' | 'import'>('members');
  const [memberFilter, setMemberFilter] = useState<'all' | 'active' | 'pending' | 'expired'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showStaffAttendanceModal, setShowStaffAttendanceModal] = useState(false);

  const { exporting: isCsvExporting, runExport: runMembersCsvExport } = useExportMembersCsv(members, branches);

  const [settlements, setSettlements] = useState<CommissionSettlement[]>([]);

  const fetchDashboardExtras = async () => {
    try {
      const settleRes = await fetch('/api/commission-settlements');
      if (settleRes.ok) setSettlements(await settleRes.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDashboardExtras();
    const interval = setInterval(fetchDashboardExtras, 4000);
    return () => clearInterval(interval);
  }, []);

  // Filter Members by Branch & Criteria
  const branchFilteredMembers = members.filter(m => {
    if (activeBranchId !== 'all' && m.branch_id && m.branch_id !== activeBranchId) return false;
    return true;
  });

  // Compute Financial & Membership Intelligence Metrics for selected branch context
  const activeMembersCount = branchFilteredMembers.filter(m => m.status === 'active').length;
  const pendingMembersCount = branchFilteredMembers.filter(m => m.status === 'pending').length;

  const totalGrossRevenue = branchFilteredMembers.reduce((acc, m) => acc + (m.amount_paid || 0), 0);
  const totalBalanceDue = branchFilteredMembers.reduce((acc, m) => acc + (m.balance_due || 0), 0);

  const commissionOverview = getAllTrainersCommissionOverview(branchFilteredMembers, settlements, trainers);

  // Filter Members for Main Table
  const filteredMainMembers = branchFilteredMembers.filter(m => {
    if (memberFilter !== 'all' && m.status !== memberFilter) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      return matchesPerson(q, m.full_name, m.phone, [m.email, m.trainer_name]);
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Top Banner & Quick Actions */}
      <div className="bg-gradient-to-r from-red-950/80 via-zinc-900 to-zinc-900 border border-red-900/40 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center space-x-2 text-red-400 text-xs font-bold tracking-widest uppercase">
            <ShieldCheck className="w-4 h-4" />
            <span>PULSE FITNESS MULTI-BRANCH ENTERPRISE PLATFORM</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
            Welcome back, {currentOwner.full_name}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-xl">
            3 Owned &amp; Operated Branches (Nagarabhavi, RR Nagar, Banashankari), live front-desk day registers, floor trainer books, and financial auditing.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 sm:gap-3">
          {onOpenFreeLlmApi && (
            <button
              onClick={onOpenFreeLlmApi}
              title="Open FreeLLMAPI Router & AI Gateway"
              className="px-3.5 py-3 bg-gradient-to-r from-orange-950/90 via-zinc-900 to-zinc-900 hover:from-orange-900/80 border border-orange-500/60 text-orange-300 font-extrabold text-xs rounded-2xl transition-all flex items-center space-x-2 shadow-lg shadow-orange-500/10"
            >
              <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span>FREELLMAPI ROUTER</span>
            </button>
          )}

          {onOpenOwnerBroadcast && (
            <button
              onClick={onOpenOwnerBroadcast}
              title="Generate multi-lingual broadcasts with FreeLLMAPI"
              className="px-3.5 py-3 bg-gradient-to-r from-amber-950/80 to-zinc-900 hover:from-amber-900/80 border border-amber-600/60 text-amber-300 font-extrabold text-xs rounded-2xl transition-all flex items-center space-x-2"
            >
              <Megaphone className="w-4 h-4 text-amber-400" />
              <span>AI CAMPAIGN WRITER</span>
            </button>
          )}

          <button
            onClick={onOpenBranchManager}

            className="px-3.5 py-3 bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-300 font-extrabold text-xs rounded-2xl transition-all flex items-center space-x-2"
          >
            <Building2 className="w-4 h-4 text-indigo-400" />
            <span>BRANCH LOCATIONS</span>
          </button>

          <button
            onClick={onOpenAuditLogs}
            className="px-3.5 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 font-extrabold text-xs rounded-2xl transition-all flex items-center space-x-2"
          >
            <History className="w-4 h-4 text-indigo-400" />
            <span>AUDIT LOGS</span>
          </button>

          <button
            onClick={() => setShowStaffAttendanceModal(true)}
            className="px-3.5 py-3 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/80 text-emerald-300 font-extrabold text-xs rounded-2xl transition-all flex items-center space-x-2 shadow-lg"
          >
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>STAFF SHIFTS &amp; ATTENDANCE</span>
          </button>

          <button
            onClick={onLaunchHandoverMode}
            className="px-3.5 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-extrabold text-xs rounded-2xl transition-all flex items-center space-x-2"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>ONBOARD</span>
          </button>

          <button
            onClick={onLaunchBulkExport}
            className="px-3.5 py-3 bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 hover:from-red-500 hover:to-orange-500 text-white font-extrabold text-xs rounded-2xl transition-all flex items-center space-x-2 shadow-lg shadow-red-600/30 active:scale-95 cursor-pointer"
            title="Dump Contacts Bulk or Send One-by-One with Automatic Branch Recognition (gym → Nagarbhavi, Bsk → Banashankari, Rr → RR Nagar)"
          >
            <Zap className="w-4 h-4 fill-white" />
            <span>⚡ DUMP CONTACTS (AUTO-BRANCH)</span>
          </button>

          <LoadingButton
            onClick={() =>
              runMembersCsvExport({
                branchId: activeBranchId === 'all' ? null : activeBranchId,
                status: memberFilter === 'all' ? null : memberFilter,
                search: searchQuery,
              })
            }
            loading={isCsvExporting}
            loadingText="EXPORTING..."
            variant="secondary"
            className="px-3.5 py-3 text-emerald-400 font-extrabold text-xs rounded-2xl transition-all flex items-center space-x-2 border-emerald-800/60"
          >
            <Download className="w-4 h-4" />
            <span>EXPORT CSV</span>
          </LoadingButton>

          <button
            onClick={onLaunchBulkExport}
            className="px-3.5 py-3 bg-zinc-800 hover:bg-zinc-700 text-orange-400 font-extrabold text-xs rounded-2xl transition-all flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>EXPORT VCARD</span>
          </button>
        </div>
      </div>

      {/* Real-time Sales Revenue Strip */}
      <RevenueSummaryStrip branchId={activeBranchId} />

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        
        {/* Total Revenue & Balance Due */}
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Collections</span>
            <div className="w-8 h-8 bg-emerald-950/80 border border-emerald-800/80 rounded-xl flex items-center justify-center text-emerald-400">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl lg:text-2xl xl:text-3xl font-black font-mono text-emerald-400">
              ₹{totalGrossRevenue.toLocaleString()}
            </div>
            {totalBalanceDue > 0 ? (
              <p className="text-[11px] text-amber-400 font-mono font-bold mt-1">
                Outstanding: ₹{totalBalanceDue.toLocaleString()}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-400 mt-1">All accounts settled</p>
            )}
          </div>
        </div>

        {/* Active Members */}
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl shadow-xl flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Members</span>
            <div className="w-8 h-8 bg-blue-950/80 border border-blue-800/80 rounded-xl flex items-center justify-center text-blue-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl lg:text-2xl xl:text-3xl font-black font-mono text-white">
              {activeMembersCount}
            </div>
            <p className="text-[11px] text-zinc-400 font-medium mt-1">
              {pendingMembersCount} Pending Activation
            </p>
          </div>
        </div>

        {/* Trainer Commissions Pending */}
        <button
          onClick={() => setActiveTab('trainers')}
          className="bg-zinc-900 border border-zinc-800 hover:border-red-700/60 p-5 rounded-3xl shadow-xl flex flex-col justify-between space-y-3 text-left transition-all group"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-red-400 transition-colors">Trainer Commissions</span>
            <div className="w-8 h-8 bg-red-950/80 border border-red-800/80 rounded-xl flex items-center justify-center text-red-400">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl lg:text-2xl xl:text-3xl font-black font-mono text-red-400">
              ₹{commissionOverview.aggregatePendingCommissions.toLocaleString()}
            </div>
            <p className="text-[11px] text-zinc-400 font-medium mt-1">
              Across {trainers.length} active trainers
            </p>
          </div>
        </button>

        {/* Branch Network */}
        <button
          onClick={onOpenBranchManager}
          className="bg-zinc-900 border border-zinc-800 hover:border-indigo-700/60 p-5 rounded-3xl shadow-xl flex flex-col justify-between space-y-3 text-left transition-all group"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-indigo-400 transition-colors">Branch Network</span>
            <div className="w-8 h-8 bg-indigo-950/80 border border-indigo-800/80 rounded-xl flex items-center justify-center text-indigo-400">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-xl lg:text-2xl xl:text-3xl font-black font-mono text-indigo-400">
              {branches.length} Locations
            </div>
            <p className="text-[11px] text-zinc-400 font-medium mt-1">
              Nagarabhavi, RR Nagar, Banashankari
            </p>
          </div>
        </button>

      </div>

      {/* Main Navigation Tabs */}
      <div className="flex border-b border-zinc-800 overflow-x-auto no-scrollbar space-x-6">
        <button
          onClick={() => setActiveTab('members')}
          className={`pb-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all shrink-0 ${
            activeTab === 'members' ? 'border-red-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          ALL GYM MEMBERS ({branchFilteredMembers.length})
        </button>

        <button
          onClick={() => setActiveTab('register')}
          className={`pb-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center space-x-2 shrink-0 ${
            activeTab === 'register' ? 'border-red-500 text-red-400' : 'border-transparent text-zinc-400 hover:text-red-300'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>N/R/B/F DAY REGISTER</span>
        </button>

        <button
          onClick={() => setActiveTab('trainers')}
          className={`pb-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center space-x-2 shrink-0 ${
            activeTab === 'trainers' ? 'border-amber-500 text-amber-300' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>TRAINER PERFORMANCE</span>
        </button>

        <button
          onClick={() => setActiveTab('import')}
          className={`pb-4 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center space-x-2 shrink-0 ${
            activeTab === 'import' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-emerald-300'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>CSV DATA IMPORTER</span>
        </button>
      </div>

      {/* VIEW: CSV DATA IMPORTER */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          <BulkMemberImport
            currentBranchId={activeBranchId === 'all' ? 'br_nag_1' : activeBranchId}
          />
          <BulkPaymentImport
            currentBranchId={activeBranchId === 'all' ? 'br_nag_1' : activeBranchId}
          />
        </div>
      )}

      {/* VIEW: N/R/B/F DAY REGISTER */}
      {activeTab === 'register' && (
        <div className="space-y-6">
          <SingleDayEntryForm branchId={activeBranchId} />
          <ShiftCloseWidget branchId={activeBranchId} />
        </div>
      )}

      {/* VIEW 1: ALL MEMBERS */}
      {activeTab === 'members' && (
        <div className="space-y-6">
          
          {/* Sub-Header & Search Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            
            {/* Filter Pills */}
            <div className="flex flex-wrap gap-2">
              {(['all', 'active', 'pending', 'expired'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setMemberFilter(f)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase transition-all border ${
                    memberFilter === f
                      ? 'bg-red-600 text-white border-red-500 shadow'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Search Bar & Quick Export */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search member name or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                />
              </div>

              <LoadingButton
                onClick={() =>
                  runMembersCsvExport({
                    branchId: activeBranchId === 'all' ? null : activeBranchId,
                    status: memberFilter === 'all' ? null : memberFilter,
                    search: searchQuery,
                  })
                }
                loading={isCsvExporting}
                loadingText="Exporting..."
                variant="secondary"
                size="sm"
                className="px-3 py-2 text-xs rounded-xl font-bold border-zinc-700/80 shrink-0 text-emerald-400"
                title="Export filtered member list to CSV"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                <span>CSV</span>
              </LoadingButton>
            </div>
          </div>

          {/* Members Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="px-6 py-4">Gym Member</th>
                    <th className="px-6 py-4">Status & Validity</th>
                    <th className="px-6 py-4">Package & Financials</th>
                    <th className="px-6 py-4">Onboarded By</th>
                    <th className="px-6 py-4 text-right">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredMainMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptySearch what="members" query={searchQuery} filterNote={memberFilter !== 'all' ? `with status “${memberFilter}”` : activeBranchId && activeBranchId !== 'all' ? 'in this branch' : undefined}
                          onClear={() => { setSearchQuery(''); setMemberFilter('all'); }} emptyHint="Add members with Onboard / Import." />
                      </td>
                    </tr>
                  ) : (
                    filteredMainMembers.map((m) => {
                      const days = calculateDaysRemaining(m.end_date);
                      return (
                        <tr key={m.id} className="hover:bg-zinc-800/40 transition-colors">
                          
                          {/* Name & Phone */}
                          <td className="px-6 py-4">
                            <button
                              onClick={() => onSelectMember(m)}
                              className="text-left font-bold text-white hover:text-red-400 transition-colors flex items-center space-x-2"
                            >
                              <span>{m.full_name}</span>
                            </button>
                            <span className="text-[11px] font-mono text-zinc-400 block mt-0.5">
                              {formatPhoneDisplay(m.phone)}
                            </span>
                          </td>

                          {/* Status & Days */}
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
                              <div className="flex items-center space-x-1.5 mt-1">
                                <span className={`text-[11px] font-mono font-bold ${
                                  days < 0 ? 'text-red-400' : days <= 7 ? 'text-amber-400' : 'text-zinc-400'
                                }`}>
                                  {days < 0 ? 'Expired' : `${days}d Left`}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Financials */}
                          <td className="px-6 py-4">
                            <span className="font-bold text-white block">{m.package_type || 'General Gym'}</span>
                            <div className="flex items-center space-x-2 mt-0.5">
                              <span className="font-mono text-emerald-400 font-bold">₹{m.amount_paid || 0}</span>
                              {m.balance_due && m.balance_due > 0 ? (
                                <span className="font-mono text-amber-400 font-bold text-[10px] bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-800">
                                  Due: ₹{m.balance_due}
                                </span>
                              ) : null}
                            </div>
                          </td>

                          {/* Trainer */}
                          <td className="px-6 py-4 font-medium text-amber-300">
                            {m.trainer_name}
                          </td>

                          {/* Actions */}
                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              onClick={() => onOpenRenew(m)}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs rounded-xl shadow transition-all inline-flex items-center space-x-1"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Renew</span>
                            </button>

                            {m.balance_due && m.balance_due > 0 ? (
                              <button
                                onClick={() => onOpenAddPayment(m)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-extrabold text-xs rounded-xl shadow transition-all inline-flex items-center space-x-1"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                                <span>Pay</span>
                              </button>
                            ) : null}
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

      {/* VIEW 2: TRAINER PERFORMANCE & LEADERBOARD */}
      {activeTab === 'trainers' && (
        <TrainerPerformanceSection
          branchId={activeBranchId}
          trainers={trainers}
          onOpenSettlement={(trainerId, pending) => {
            const tr = trainers.find((t) => t.id === trainerId);
            if (tr) {
              onOpenCommissionSettlement(tr, pending);
            }
          }}
        />
      )}

      {/* MODAL: Staff Shifts & QR Attendance */}
      <StaffAttendanceModal
        open={showStaffAttendanceModal}
        onClose={() => setShowStaffAttendanceModal(false)}
        branches={branches}
        activeBranchId={activeBranchId}
      />

    </div>
  );
};
