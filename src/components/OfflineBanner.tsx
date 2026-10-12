// src/components/OfflineBanner.tsx
import React, { useState, useEffect } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOutboxCount } from '../hooks/useOutboxCount';
import { flushOutbox, onSyncStateChange } from '../lib/offline/syncEngine';
import { promptPwaInstall, onInstallAvailabilityChange, isPwaInstalled } from '../lib/pwa';
import { WifiOff, RefreshCw, Download, CheckCircle2 } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const online = useNetworkStatus();
  const pending = useOutboxCount();
  const [isSyncing, setIsSyncing] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const isInstalled = isPwaInstalled();

  useEffect(() => {
    const unsubSync = onSyncStateChange(setIsSyncing);
    const unsubInstall = onInstallAvailabilityChange(setCanInstall);
    return () => {
      unsubSync();
      unsubInstall();
    };
  }, []);

  return (
    <div className="space-y-1">
      {/* Network / Outbox Status */}
      {(!online || pending > 0 || isSyncing) && (
        <div
          className={`px-4 py-2 text-center text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            !online
              ? 'bg-red-950/90 text-red-300 border-b border-red-800/60'
              : 'bg-amber-950/90 text-amber-300 border-b border-amber-800/60'
          }`}
        >
          {!online ? (
            <>
              <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
              <span>
                Offline Mode · {pending > 0 ? `${pending} action(s) queued` : 'Viewing cached records'} · Will auto-sync when network returns
              </span>
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
              <span>Syncing {pending} queued desk action(s) to server…</span>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span>Back online · {pending} action(s) ready to sync</span>
              <button
                onClick={() => flushOutbox()}
                className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-[11px] font-bold transition-colors"
              >
                Sync Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* Optional Install Prompt Bar if available */}
      {canInstall && !isInstalled && (
        <div className="bg-zinc-900/90 border-b border-zinc-800 px-4 py-1.5 flex items-center justify-between text-xs">
          <span className="text-zinc-300 font-medium flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-red-500" />
            <span>Install Pulse Fitness on your home screen for full-screen desk mode</span>
          </span>
          <button
            onClick={() => promptPwaInstall()}
            className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-[11px] transition-colors shadow-sm"
          >
            Install App
          </button>
        </div>
      )}
    </div>
  );
};
