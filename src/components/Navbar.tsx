import React, { useState } from 'react';
import {
  Dumbbell,
  Shield,
  UserCheck,
  Smartphone,
  RefreshCw,
  Database,
  Building2,
  User,
  Bell,
  CheckCheck,
  MapPin,
  Zap,
  Sparkles,
  FileDown,
} from 'lucide-react';
import { KeyRound, LogOut, ImagePlus } from 'lucide-react';
import { UserRole, Profile, Branch } from '../types';
import { useStaffNotifications } from '../hooks/useStaffNotifications';

export type ViewMode = 'owner' | 'trainer' | 'member_app' | 'client';

interface NavbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  currentProfile: Profile;
  profiles: Profile[];
  branches: Branch[];
  activeBranchId: string;
  onSelectBranch: (branchId: string) => void;
  onLogout: () => void;
  onOpenPins?: () => void;
  onOpenBannerStudio?: () => void;
  onOpenBranchManager: () => void;
  onResetSeed: () => void;
  onOpenExpoGuide: () => void;
  onOpenCodebaseViewer?: () => void;
  onOpenFreeLlmApi?: () => void;
  onOpenTrainerStudio?: () => void;
  onOpenOwnerBroadcast?: () => void;
  onOpenBulkDump?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  viewMode,
  onViewModeChange,
  currentProfile,
  profiles,
  branches,
  activeBranchId,
  onSelectBranch,
  onLogout,
  onOpenPins,
  onOpenBannerStudio,
  onOpenBranchManager,
  onResetSeed,
  onOpenExpoGuide,
  onOpenCodebaseViewer,
  onOpenFreeLlmApi,
  onOpenTrainerStudio,
  onOpenOwnerBroadcast,
  onOpenBulkDump,
}) => {
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const isOwnerRole = currentProfile.role === 'owner' || currentProfile.role === 'super_owner' || currentProfile.role === 'branch_manager';

  const { notifications, unreadCount, markAsRead, markAllAsRead } = useStaffNotifications(
    currentProfile?.id,
    activeBranchId
  );

  return (
    <header className="bg-zinc-950 border-b border-zinc-800 text-white sticky top-0 z-40 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between min-h-16 sm:min-h-20 py-2 gap-x-3 gap-y-2">
          
          {/* Left: Logo & Branch Switcher Dropdown */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-red-600 via-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/20 ring-1 ring-white/20 flex-shrink-0">
              <Dumbbell className="w-6 h-6 text-white transform -rotate-12" />
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white uppercase font-sans">
                  PULSE <span className="text-red-500">FITNESS</span>
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-black uppercase">
                  3 Branches
                </span>
              </div>

              {/* Owner Branch Switcher Dropdown */}
              <div className="flex items-center space-x-1.5 mt-0.5">
                <div className="flex items-center space-x-1 bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-0.5 shadow-inner">
                  <MapPin className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <select
                    value={activeBranchId}
                    onChange={(e) => onSelectBranch(e.target.value)}
                    title="Change Active Gym Branch"
                    className="bg-transparent text-[11px] font-black text-zinc-200 focus:outline-none cursor-pointer pr-1 uppercase tracking-wider"
                  >
                    <option value="all" className="bg-zinc-900 text-white">
                      🏢 All 3 Branches (HQ)
                    </option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id} className="bg-zinc-900 text-white">
                        📍 {b.name.replace('Pulse Fitness - ', '')}
                      </option>
                    ))}
                  </select>
                </div>

                {isOwnerRole && (
                  <button
                    onClick={onOpenBranchManager}
                    title="Manage Branch Details & Settings"
                    className="p-1 rounded-lg text-zinc-500 hover:text-indigo-300 hover:bg-zinc-800 transition-colors"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Center: Portal Navigation Mode Selector */}
          <div className="hidden xl:flex items-center bg-zinc-900/90 p-1 rounded-2xl border border-zinc-800 shadow-inner space-x-1">
            {/* Owner Portal (Visible to Owner Roles Only) */}
            {isOwnerRole && (
              <button
                onClick={() => onViewModeChange('owner')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all ${
                  viewMode === 'owner'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>OWNER PORTAL</span>
              </button>
            )}

            {/* Trainer Portal (Visible to all) */}
            <button
              onClick={() => onViewModeChange('trainer')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all ${
                viewMode === 'trainer'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>TRAINER PORTAL</span>
            </button>

            {/* Client Handover */}
            <button
              onClick={() => onViewModeChange('client')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all ${
                viewMode === 'client'
                  ? 'bg-amber-500 text-zinc-950 font-extrabold shadow-md shadow-amber-500/30'
                  : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>CLIENT HANDOVER</span>
            </button>
          </div>

          {/* Right: User Profile & Tools */}
          <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">

            {/* Staff In-App Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifMenu(!showNotifMenu)}
                title="Staff In-App Notifications"
                className="relative p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {showNotifMenu && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl z-50 p-4 space-y-3 animate-in fade-in zoom-in duration-150">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <Bell className="w-4 h-4 text-red-500" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Staff Notifications ({unreadCount} new)
                      </span>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-[11px] font-semibold text-emerald-400 hover:underline flex items-center space-x-1"
                      >
                        <CheckCheck className="w-3 h-3" />
                        <span>Mark all read</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-zinc-500 text-center py-4">No notifications yet</p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => markAsRead(n.id)}
                          className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            n.is_read
                              ? 'bg-zinc-900/40 border-zinc-800/60 text-zinc-400'
                              : 'bg-zinc-900 border-red-500/40 text-zinc-200 ring-1 ring-red-500/20'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-xs">{n.title}</span>
                            <span className="text-[10px] text-zinc-500">
                              {new Date(n.created_at).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-zinc-300 text-[11px] mt-1 line-clamp-2">{n.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {onOpenBannerStudio && (
              <button onClick={onOpenBannerStudio} title="Banner Studio: posters for offers, events and festivals" aria-label="Banner Studio"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-fuchsia-700 to-red-600 text-white text-xs font-black shadow-md">
                <ImagePlus className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Banners</span>
              </button>
            )}

            {/* FreeLLMAPI Gateway & Router Button */}
            {onOpenFreeLlmApi && (
              <button
                onClick={onOpenFreeLlmApi}
                title="Open FreeLLMAPI Multi-Provider Router & AI Gateway"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-950/80 via-zinc-900 to-zinc-900 border border-orange-500/50 hover:border-orange-400 text-orange-400 hover:text-orange-300 text-xs font-bold transition-all shadow-sm shadow-orange-500/10"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span className="hidden xl:inline font-mono">FreeLLMAPI</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              </button>
            )}

            {/* Expo & React Native Schema Guide button */}
            <button
              onClick={onOpenExpoGuide}
              title="View Expo React Native & Supabase Code"
              className="hidden 2xl:flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs hover:border-zinc-500 hover:text-white transition-all"
            >
              <Database className="w-3.5 h-3.5 text-red-400" />
              <span>Mobile Code</span>
            </button>

            {/* Smart Auto-Branch Contact Dump Button */}
            {onOpenBulkDump && (
              <button
                onClick={onOpenBulkDump}
                title="Dump Contacts Bulk or Send One-by-One with Automatic Branch Recognition (gym → Nagarbhavi, Bsk → Banashankari, Rr → RR Nagar)"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-black transition-all shadow-md shadow-red-600/30 cursor-pointer active:scale-95"
              >
                <Zap className="w-3.5 h-3.5 fill-white text-white" />
                <span className="hidden xl:inline">⚡ Dump Contacts</span>
              </button>
            )}

            {/* User Account / Profile Switcher */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-2xl px-2.5 py-1.5 shadow-inner">
              <img
                src={currentProfile.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
                alt={currentProfile.full_name}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full ring-2 ring-red-500/40 object-cover mr-2 flex-shrink-0"
              />
              <div className="text-left mr-1 hidden sm:block">
                <div className="text-xs font-extrabold text-white truncate max-w-[90px] sm:max-w-[120px]">
                  {currentProfile.full_name}
                </div>
                <div className="text-[10px] text-zinc-400 capitalize flex items-center space-x-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isOwnerRole ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                  <span>{currentProfile.role.replace('_', ' ')}</span>
                </div>
              </div>

              {onOpenPins && (
                <button onClick={onOpenPins} title="Manage login PINs" aria-label="Manage login PINs"
                  className="ml-1 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
                  <KeyRound className="w-4 h-4" />
                </button>
              )}
              <button onClick={onLogout} title="Sign out" aria-label="Sign out"
                className="ml-1 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {/* Reset Seed Data (super owner, dev only; server blocks it in production) */}
            {currentProfile.role === 'super_owner' && (<button
              onClick={onResetSeed}
              title="Reset Sample Data"
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>)}
          </div>
        </div>

        {/* Mobile View Navigation Tabs */}
        <div className="xl:hidden flex items-center justify-between py-2 border-t border-zinc-900 overflow-x-auto gap-2">
          {isOwnerRole && (
            <button
              onClick={() => onViewModeChange('owner')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold text-center whitespace-nowrap transition-all ${
                viewMode === 'owner' ? 'bg-red-600 text-white' : 'bg-zinc-900 text-zinc-400'
              }`}
            >
              Owner Portal
            </button>
          )}
          <button
            onClick={() => onViewModeChange('trainer')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold text-center whitespace-nowrap transition-all ${
              viewMode === 'trainer' ? 'bg-red-600 text-white' : 'bg-zinc-900 text-zinc-400'
            }`}
          >
            Trainer Portal
          </button>
          <button
            onClick={() => onViewModeChange('client')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold text-center whitespace-nowrap transition-all ${
              viewMode === 'client' ? 'bg-amber-500 text-zinc-950' : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            Client Mode
          </button>
        </div>
      </div>
    </header>
  );
};
