import React, { useState, useEffect, useCallback } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  LogOut, 
  LogIn, 
  QrCode as QrIcon, 
  Calendar, 
  AlertCircle,
  Copy,
  Check,
  Building2,
  RefreshCw
} from 'lucide-react';
import { StaffAttendance } from '../../types';
import { buildStaffQrValue } from '../../lib/staffQr';
import { callRpc } from '../../lib/rpc';
import { toast } from '../../lib/toast';
import { LoadingButton } from '../ui/LoadingButton';
import dayjs from 'dayjs';

interface MyShiftPanelProps {
  staffId: string;
  branchId?: string;
  staffName?: string;
  branchName?: string;
  onShiftChange?: () => void;
}

export const MyShiftPanel: React.FC<MyShiftPanelProps> = ({
  staffId,
  branchId = 'br_nag_1',
  staffName = 'Trainer',
  branchName = 'Pulse Fitness',
  onShiftChange,
}) => {
  const [openShift, setOpenShift] = useState<StaffAttendance | null>(null);
  const [recentLogs, setRecentLogs] = useState<StaffAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [checkInNotes, setCheckInNotes] = useState('');
  const [checkOutNotes, setCheckOutNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState('');

  const qrValue = buildStaffQrValue({ id: staffId, branch_id: branchId });

  const fetchShiftData = useCallback(async () => {
    if (!staffId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // 1. Fetch open shift
      const resOpen = await fetch(`/api/staff-attendance/open-shift/${staffId}`);
      if (resOpen.ok) {
        const data = await resOpen.json();
        setOpenShift(data);
      } else {
        setOpenShift(null);
      }

      // 2. Fetch recent attendance logs
      const resLogs = await fetch(`/api/staff-attendance?staff_id=${staffId}`);
      if (resLogs.ok) {
        const logs = await resLogs.json();
        setRecentLogs(logs.slice(0, 10));
      }
    } catch (err) {
      console.error('Failed to load shift data', err);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    fetchShiftData();
  }, [fetchShiftData]);

  // Live timer for active shift
  useEffect(() => {
    if (!openShift?.checked_in_at) {
      setElapsed('');
      return;
    }

    const updateTimer = () => {
      const start = dayjs(openShift.checked_in_at);
      const now = dayjs();
      const diffMins = now.diff(start, 'minute');
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      setElapsed(`${hours}h ${mins}m`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 30000);
    return () => clearInterval(interval);
  }, [openShift]);

  const handleCheckIn = async () => {
    setActionLoading(true);
    try {
      await callRpc('staff_check_in', {
        p_staff_id: staffId,
        p_branch_id: branchId,
        p_method: 'manual',
        p_notes: checkInNotes.trim() || undefined,
      });
      toast.success('Shift started! Checked in successfully.');
      setCheckInNotes('');
      await fetchShiftData();
      onShiftChange?.();
    } catch (err: any) {
      toast.error(err?.message || 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    setActionLoading(true);
    try {
      await callRpc('staff_check_out', {
        p_staff_id: staffId,
        p_notes: checkOutNotes.trim() || undefined,
      });
      toast.success('Shift completed! Checked out successfully.');
      setCheckOutNotes('');
      await fetchShiftData();
      onShiftChange?.();
    } catch (err: any) {
      toast.error(err?.message || 'Check-out failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyQr = () => {
    navigator.clipboard.writeText(qrValue);
    setCopied(true);
    toast.success('Staff QR code payload copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Shift Status & Action Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Shift Card (Left / 7 cols) */}
        <div className="lg:col-span-7 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 relative overflow-hidden shadow-xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div
                className={`w-3.5 h-3.5 rounded-full animate-pulse ${
                  openShift ? 'bg-emerald-500 shadow-lg shadow-emerald-500/50' : 'bg-zinc-600'
                }`}
              />
              <h3 className="text-lg font-bold text-white tracking-tight">
                {openShift ? 'Active Shift on Floor' : 'Shift Off-Duty'}
              </h3>
            </div>
            <button
              onClick={fetchShiftData}
              disabled={loading}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              title="Refresh Shift Status"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {openShift ? (
            <div className="space-y-5">
              <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold mb-1">
                    Clocked In Since
                  </div>
                  <div className="text-2xl font-black text-emerald-200">
                    {dayjs(openShift.checked_in_at).format('hh:mm A')}
                  </div>
                  <div className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-zinc-400" />
                    {dayjs(openShift.checked_in_at).format('ddd, D MMM YYYY')}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-zinc-400 font-semibold mb-1">
                    Duration
                  </div>
                  <div className="text-xl font-bold text-white flex items-center gap-1.5 justify-end">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    {elapsed || 'Calculating...'}
                  </div>
                  <div className="text-xs text-zinc-400 mt-1 flex items-center gap-1 justify-end">
                    <Building2 className="w-3 h-3 text-zinc-400" />
                    {branchName}
                  </div>
                </div>
              </div>

              {openShift.notes && (
                <div className="text-xs text-zinc-400 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800">
                  <span className="text-zinc-400 font-medium">Opening Note: </span>
                  {openShift.notes}
                </div>
              )}

              <div className="space-y-3 pt-2">
                <label className="text-xs font-semibold text-zinc-400 block">
                  Shift Handover / Closing Notes (Optional)
                </label>
                <input
                  type="text"
                  value={checkOutNotes}
                  onChange={(e) => setCheckOutNotes(e.target.value)}
                  placeholder="e.g., Completed morning personal training batches, handed floor to Manju"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                />
                <LoadingButton
                  onClick={handleCheckOut}
                  loading={actionLoading}
                  loadingText="Ending Shift..."
                  variant="danger"
                  className="w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Clock Out & End Shift
                </LoadingButton>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-5 text-center">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-2 opacity-80" />
                <div className="text-sm font-semibold text-zinc-300">You are currently clocked out</div>
                <div className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                  Start your shift when you arrive on the gym floor, or ask the branch manager / owner to scan your QR badge.
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-zinc-400 block">
                  Shift Start Notes (Optional)
                </label>
                <input
                  type="text"
                  value={checkInNotes}
                  onChange={(e) => setCheckInNotes(e.target.value)}
                  placeholder="e.g., Morning floor duty & 7 AM PT sessions"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
                />
                <LoadingButton
                  onClick={handleCheckIn}
                  loading={actionLoading}
                  loadingText="Clocking In..."
                  variant="primary"
                  className="w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Clock In & Start Shift
                </LoadingButton>
              </div>
            </div>
          )}
        </div>

        {/* Staff QR Code Card (Right / 5 cols) */}
        <div className="lg:col-span-5 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-between shadow-xl">
          <div className="text-center w-full">
            <div className="flex items-center justify-center gap-2 text-zinc-300 font-bold mb-1">
              <QrIcon className="w-4 h-4 text-red-500" />
              <span>Digital Staff QR Badge</span>
            </div>
            <p className="text-xs text-zinc-400">
              Present this code to the Owner or Manager scanner for automatic shift check-in / check-out.
            </p>
          </div>

          <div className="my-4 p-6 bg-white rounded-2xl shadow-2xl flex flex-col items-center justify-center space-y-2">
            <QrIcon className="w-32 h-32 text-zinc-950" />
            <span className="text-[10px] font-mono font-bold text-zinc-800 tracking-wider">STAFF PASS ID</span>
          </div>

          <div className="w-full space-y-2">
            <div className="flex items-center justify-between text-xs bg-zinc-950/80 px-3 py-2 rounded-lg border border-zinc-800/80">
              <span className="text-zinc-400 truncate">{staffName}</span>
              <span className="font-mono text-zinc-400">{staffId}</span>
            </div>

            <button
              onClick={handleCopyQr}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-zinc-300 bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/60 rounded-xl transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied QR Payload!' : 'Copy QR Code Value'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Shift History List */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-red-500" />
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">My Recent Shifts</h4>
          </div>
          <span className="text-xs text-zinc-400">Showing last {recentLogs.length} shifts</span>
        </div>

        {recentLogs.length === 0 ? (
          <div className="text-center py-8 text-xs text-zinc-400">
            No shift logs found for this staff member.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Clock In</th>
                  <th className="py-2.5 px-3">Clock Out</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {recentLogs.map((log) => {
                  const isOpen = !log.checked_out_at;
                  return (
                    <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-3 font-medium text-zinc-200 whitespace-nowrap">
                        {dayjs(log.checked_in_at).format('D MMM YYYY')}
                      </td>
                      <td className="py-3 px-3 text-zinc-300 font-mono whitespace-nowrap">
                        {dayjs(log.checked_in_at).format('hh:mm A')}
                      </td>
                      <td className="py-3 px-3 font-mono whitespace-nowrap">
                        {log.checked_out_at ? (
                          <span className="text-zinc-300">{dayjs(log.checked_out_at).format('hh:mm A')}</span>
                        ) : (
                          <span className="text-amber-400 font-semibold italic">On Floor</span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300">
                          {log.method}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isOpen ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-zinc-400">
                            <CheckCircle2 className="w-3 h-3 text-zinc-400" />
                            Completed
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-zinc-400 max-w-xs truncate">
                        {log.notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
export default MyShiftPanel;
