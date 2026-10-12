import React, { useState, useEffect } from 'react';
import { Navbar, ViewMode } from './components/Navbar';
import { ClientHandoverForm } from './components/ClientHandoverForm';
import { TrainerDashboard } from './components/TrainerDashboard';
import { OwnerDashboard } from './components/OwnerDashboard';
import { MemberDetailModal } from './components/MemberDetailModal';
import { AddPaymentModal } from './components/AddPaymentModal';
import { RenewMemberModal } from './components/RenewMemberModal';
import { CommissionSettlementModal } from './components/CommissionSettlementModal';
import { BulkContactModal } from './components/BulkContactModal';
import { ExpoSchemaGuideModal } from './components/ExpoSchemaGuideModal';
import { BranchManagementModal } from './components/BranchManagementModal';
import { AuditLogsModal } from './components/AuditLogsModal';
import { MemberAppView } from './components/MemberAppView';
import { OfflineBanner } from './components/OfflineBanner';
import { FreeLlmApiModal } from './components/FreeLlmApiModal';
import { TrainerAiStudioModal } from './components/TrainerAiStudioModal';
import { OwnerAiBroadcastModal } from './components/OwnerAiBroadcastModal';
import { Profile, Member, UserRole, PlanPackage, PaymentMethod, Branch } from './types';

import { safeFetchJson } from './lib/apiUtils';
import { toast } from './lib/toast';

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string>('all');

  // Navigation View Modes: 'owner' | 'trainer' | 'member_app' | 'client'
  const [viewMode, setViewMode] = useState<ViewMode>('owner');
  const [selectedTrainerId, setSelectedTrainerId] = useState<string>('usr_trainer_1');
  const [selectedMemberDetail, setSelectedMemberDetail] = useState<Member | null>(null);

  // Modals
  const [showBranchManager, setShowBranchManager] = useState<boolean>(false);
  const [showAuditLogs, setShowAuditLogs] = useState<boolean>(false);

  // Action Modals
  const [isBulkExportOpen, setIsBulkExportOpen] = useState<boolean>(false);
  const [showExpoGuide, setShowExpoGuide] = useState<boolean>(false);
  const [showFreeLlmApiModal, setShowFreeLlmApiModal] = useState<boolean>(false);
  const [showTrainerStudioModal, setShowTrainerStudioModal] = useState<boolean>(false);
  const [trainerStudioTargetMember, setTrainerStudioTargetMember] = useState<Member | null>(null);
  const [showOwnerBroadcastModal, setShowOwnerBroadcastModal] = useState<boolean>(false);

  const [paymentModalMember, setPaymentModalMember] = useState<Member | null>(null);
  const [renewModalMember, setRenewModalMember] = useState<Member | null>(null);
  const [settlementModalTrainer, setSettlementModalTrainer] = useState<{ trainer: Profile; pendingAmount: number } | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch initial gym state
  const fetchData = async () => {
    try {
      const [profs, mems, branchList] = await Promise.all([
        safeFetchJson<Profile[]>('/api/profiles', undefined, null),
        safeFetchJson<Member[]>('/api/members?includeArchived=true', undefined, null),
        safeFetchJson<Branch[]>('/api/branches', undefined, null)
      ]);

      if (profs && profs.length > 0) {
        setProfiles(profs);
        // Only set default profile if not set yet
        setCurrentProfile((prev) => {
          if (!prev) {
            const defaultOwner = profs.find(p => p.role === 'owner' || p.role === 'super_owner') || profs[0];
            return defaultOwner;
          }
          // Refresh existing profile data
          const updated = profs.find(p => p.id === prev.id);
          return updated || prev;
        });
      }

      if (branchList) {
        setBranches(branchList);
      }

      if (mems) {
        setMembers(mems);
        if (selectedMemberDetail) {
          const updated = mems.find(m => m.id === selectedMemberDetail.id);
          if (updated) setSelectedMemberDetail(updated);
        }
      }
    } catch (err) {
      console.error('Error fetching gym data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  // Handle Profile Switch (Owner / Manager / Trainer)
  const handleProfileChange = (profile: Profile) => {
    setCurrentProfile(profile);
    if (profile.role === 'trainer') {
      setViewMode('trainer');
      setSelectedTrainerId(profile.id);
    } else {
      // Owner or Branch Manager
      setViewMode('owner');
    }
  };

  // Onboard new client from ClientHandoverForm
  const handleClientSubmitSuccess = (newMember: Member) => {
    setMembers(prev => [newMember, ...prev]);
    fetchData();
  };

  // Activate Pending Member
  const handleActivateMember = async (memberId: string, details: {
    subscription_months: number;
    package_type: PlanPackage;
    payment_method: PaymentMethod;
    amount_paid: number;
    balance_due?: number;
    payment_reference?: string;
    commission_rate?: number;
    notes?: string;
  }) => {
    try {
      const res = await fetch(`/api/members/${memberId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...details,
          activated_by: currentProfile?.id
        })
      });

      if (!res.ok) {
        throw new Error('Failed to activate member');
      }

      const updatedMember = await res.json();
      setMembers(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
      await fetchData();
    } catch (err) {
      console.error('Activation failed:', err);
    }
  };

  // Archive Member
  const handleArchiveMember = async (memberId: string) => {
    try {
      const res = await fetch(`/api/members/${memberId}/archive`, {
        method: 'POST'
      });
      if (res.ok) {
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, is_archived: true } : m));
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Restore Member
  const handleRestoreMember = async (memberId: string) => {
    try {
      const res = await fetch(`/api/members/${memberId}/restore`, {
        method: 'POST'
      });
      if (res.ok) {
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, is_archived: false } : m));
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Reset Sample Data
  const handleResetSeed = async () => {
    try {
      const res = await fetch('/api/reset-seed', { method: 'POST' });
      if (res.ok) {
        toast.success('Sample member, branch, and settlement data reset to defaults.');
        await fetchData();
      } else {
        toast.error('Failed to reset sample data.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to reset sample data.');
    }
  };

  // Check roles
  const isOwnerRole = currentProfile?.role === 'owner' || currentProfile?.role === 'super_owner' || currentProfile?.role === 'branch_manager';
  const trainerProfiles = profiles.filter(p => p.role === 'trainer');

  // Resolve active trainer profile when in trainer mode or client mode
  const activeTrainerProfile: Profile = (() => {
    if (currentProfile?.role === 'trainer') return currentProfile;
    const found = profiles.find(p => p.id === selectedTrainerId && p.role === 'trainer');
    if (found) return found;
    const firstTrainer = profiles.find(p => p.role === 'trainer');
    if (firstTrainer) return firstTrainer;
    return {
      id: 'usr_trainer_1',
      full_name: 'Vishal',
      role: 'trainer',
      phone: '9812345671',
      gym_name: 'Pulse Fitness - Nagarabhavi',
      branch_id: 'br_nag_1',
      branch_name: 'Pulse Fitness - Nagarabhavi',
      created_at: new Date().toISOString()
    };
  })();

  if (isLoading || !currentProfile) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-bold text-zinc-400">Loading Pulse Fitness Platform...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-red-600 selection:text-white">
      {/* Offline Desk Banner */}
      <OfflineBanner />
      
      {/* Top Header Navbar */}
      <Navbar
        viewMode={viewMode}
        onViewModeChange={(mode) => setViewMode(mode)}
        currentProfile={currentProfile}
        profiles={profiles}
        branches={branches}
        activeBranchId={activeBranchId}
        onSelectBranch={(bId) => setActiveBranchId(bId)}
        onProfileChange={handleProfileChange}
        onOpenBranchManager={() => setShowBranchManager(true)}
        onResetSeed={handleResetSeed}
        onOpenExpoGuide={() => setShowExpoGuide(true)}
        onOpenFreeLlmApi={() => setShowFreeLlmApiModal(true)}
        onOpenTrainerStudio={() => {
          setTrainerStudioTargetMember(null);
          setShowTrainerStudioModal(true);
        }}
        onOpenOwnerBroadcast={() => setShowOwnerBroadcastModal(true)}
        onOpenBulkDump={() => setIsBulkExportOpen(true)}
      />

      {/* Main Body View based on viewMode */}
      <main className="pb-16">
        {viewMode === 'member_app' ? (
          <MemberAppView
            currentProfile={currentProfile}
            onLogout={() => setViewMode(isOwnerRole ? 'owner' : 'trainer')}
          />
        ) : viewMode === 'client' ? (
          <ClientHandoverForm
            currentTrainer={activeTrainerProfile}
            onSubmitSuccess={handleClientSubmitSuccess}
            onExitHandoverMode={() => setViewMode(isOwnerRole ? 'owner' : 'trainer')}
          />
        ) : viewMode === 'trainer' ? (
          <TrainerDashboard
            currentTrainer={activeTrainerProfile}
            members={members}
            trainers={trainerProfiles}
            branches={branches}
            isOwnerViewing={isOwnerRole}
            onSwitchTrainer={(trainerId) => setSelectedTrainerId(trainerId)}
            onReturnToOwner={() => setViewMode('owner')}
            onActivateMember={handleActivateMember}
            onLaunchHandoverMode={() => setViewMode('client')}
            onSelectMember={(m) => setSelectedMemberDetail(m)}
            onOpenRenew={(m) => setRenewModalMember(m)}
            onOpenAiStudio={(m) => {
              setTrainerStudioTargetMember(m || null);
              setShowTrainerStudioModal(true);
            }}
          />
        ) : (
          <OwnerDashboard
            currentOwner={currentProfile}
            members={members}
            trainers={trainerProfiles}
            branches={branches}
            activeBranchId={activeBranchId}
            onSelectMember={(m) => setSelectedMemberDetail(m)}
            onLaunchHandoverMode={() => setViewMode('client')}
            onLaunchBulkExport={() => setIsBulkExportOpen(true)}
            onOpenAddPayment={(m) => setPaymentModalMember(m)}
            onOpenRenew={(m) => setRenewModalMember(m)}
            onOpenCommissionSettlement={(t, amt) => setSettlementModalTrainer({ trainer: t, pendingAmount: amt })}
            onOpenBranchManager={() => setShowBranchManager(true)}
            onOpenAuditLogs={() => setShowAuditLogs(true)}
            onSelectBranch={(bId) => setActiveBranchId(bId)}
            onOpenFreeLlmApi={() => setShowFreeLlmApiModal(true)}
            onOpenOwnerBroadcast={() => setShowOwnerBroadcastModal(true)}
            onOpenTrainerStudio={() => {
              setTrainerStudioTargetMember(null);
              setShowTrainerStudioModal(true);
            }}
          />
        )}
      </main>


      {/* Multi-Branch Management Modal */}
      {showBranchManager && (
        <BranchManagementModal
          currentProfile={currentProfile}
          branches={branches}
          activeBranchId={activeBranchId}
          onSelectBranch={(bId) => setActiveBranchId(bId)}
          onRefreshBranches={fetchData}
          onClose={() => {
            setShowBranchManager(false);
            fetchData();
          }}
        />
      )}

      {/* Audit Logs Modal */}
      {showAuditLogs && (
        <AuditLogsModal
          currentProfile={currentProfile}
          onClose={() => setShowAuditLogs(false)}
        />
      )}

      {/* Member Detail Drawer */}
      {selectedMemberDetail && (
        <MemberDetailModal
          member={selectedMemberDetail}
          currentProfile={currentProfile}
          onClose={() => setSelectedMemberDetail(null)}
          onOpenRenew={(m) => {
            setSelectedMemberDetail(null);
            setRenewModalMember(m);
          }}
          onOpenAddPayment={(m) => {
            setSelectedMemberDetail(null);
            setPaymentModalMember(m);
          }}
          onRefreshMembers={fetchData}
        />
      )}

      {/* Add Payment Modal */}
      {paymentModalMember && (
        <AddPaymentModal
          member={paymentModalMember}
          currentProfile={currentProfile}
          onClose={() => setPaymentModalMember(null)}
          onPaymentSuccess={fetchData}
        />
      )}

      {/* Renew Membership Modal */}
      {renewModalMember && (
        <RenewMemberModal
          member={renewModalMember}
          currentProfile={currentProfile}
          onClose={() => setRenewModalMember(null)}
          onRenewSuccess={fetchData}
        />
      )}

      {/* Commission Settlement Modal */}
      {settlementModalTrainer && (
        <CommissionSettlementModal
          trainer={settlementModalTrainer.trainer}
          pendingAmount={settlementModalTrainer.pendingAmount}
          currentOwner={currentProfile}
          onClose={() => setSettlementModalTrainer(null)}
          onSettlementSuccess={fetchData}
        />
      )}

      {/* Smart Auto-Branch Contact Importer & Data Desk Modal */}
      {isBulkExportOpen && (
        <BulkContactModal
          currentProfile={currentProfile}
          members={members}
          onClose={() => setIsBulkExportOpen(false)}
          onRefreshData={fetchData}
          initialTab="auto_dump"
        />
      )}

      {/* Mobile Expo & Supabase Schema Guide Modal */}
      {showExpoGuide && (
        <ExpoSchemaGuideModal
          onClose={() => setShowExpoGuide(false)}
        />
      )}

      {/* FreeLLMAPI Central Gateway & Router Modal */}
      {showFreeLlmApiModal && (
        <FreeLlmApiModal
          onClose={() => setShowFreeLlmApiModal(false)}
          onOpenTrainerStudio={() => {
            setTrainerStudioTargetMember(null);
            setShowTrainerStudioModal(true);
          }}
        />
      )}

      {/* Trainer AI Studio Modal (Workout & Nutrition Architect) */}
      {showTrainerStudioModal && (
        <TrainerAiStudioModal
          members={members}
          trainerName={currentProfile?.full_name || 'Pulse Coach'}
          initialMember={trainerStudioTargetMember}
          onClose={() => {
            setShowTrainerStudioModal(false);
            setTrainerStudioTargetMember(null);
          }}
          onPlanSaved={fetchData}
        />
      )}

      {/* Owner AI Broadcast & Multi-Lingual Campaign Writer */}
      {showOwnerBroadcastModal && (
        <OwnerAiBroadcastModal
          branches={branches}
          activeBranchId={activeBranchId}
          onClose={() => setShowOwnerBroadcastModal(false)}
        />
      )}
    </div>
  );
}

