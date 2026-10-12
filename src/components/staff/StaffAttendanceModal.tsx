import React, { useState, useEffect, useCallback, useId } from 'react';
import { 
  X, 
  Users, 
  Clock, 
  CheckCircle2, 
  QrCode, 
  Calendar, 
  Search, 
  LogIn, 
  LogOut, 
  AlertCircle,
  Building2,
  RefreshCw,
  UserCheck
} from 'lucide-react';
import { StaffAttendance, Branch, Profile } from '../../types';
import { parseStaffQrValue } from '../../lib/staffQr';
import { callRpc } from '../../lib/rpc';
import { toast } from '../../lib/toast';
import { LoadingButton } from '../ui/LoadingButton';
import dayjs from 'dayjs';

interface StaffAttendanceModalProps {
  open: boolean;
  onClose: () => void;
  branches?: Branch[];
  activeBranchId?: string;
}

export const StaffAttendanceModal: React.FC<StaffAttendanceModalProps> = ({
  open,
  onClose,
  branches = [],
  activeBranchId = 'all',
}) => {
  const [selectedDay, setSelectedDay] = useState(dayjs().format('YYYY-MM-DD'));
  const [selectedBranch, setSelectedBranch] = useState(activeBranchId);
  const [logs, setLogs] = useState<StaffAttendance[]>([]);
  const [staffList, setStaffList] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [scanProcessing, setScanProcessing] = useState(false);

  // Manual Check-in state
  const [manualStaffId, setManualStaffId] = useState('');
  const [manualBranchId, setManualBranchId] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualLoading, setManualLoading] = useState(false);

  // Unique HTML IDs
  const branchSelectId = useId();
  const dateInputId = useId();
  const qrInputId = useId();
  const manualStaffSelectId = useId();
  const manualBranchSelectId = useId();
  const manualNotesInputId = useId();

  // Load staff profiles
  const loadStaffProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/profiles');
      if (res.ok) {
        const data: Profile[] = await res.json();
        const trainers = data.filter(
          (p) => p.role === 'trainer' || p.role === 'branch_manager' || p.role === 'owner'
        );
        setStaffList(trainers);
        if (trainers.length > 0 && !manualStaffId) {
          setManualStaffId(trainers[0].id);
          setManualBranchId(trainers[0].branch_id || 'br_nag_1');
        }
      }
    } catch (err) {
      console.warn('Failed to load profiles', err);
    }
  }, [manualStaffId]);

  // Load attendance logs
  const loadLogs = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      let url = `/api/staff-attendance?day=${selectedDay}`;
      if (selectedBranch && selectedBranch !== 'all') {
        url += `&branch_id=${selectedBranch}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to load staff attendance logs', err);
    } finally {
      setLoading(false);
    }
  }, [open, selectedDay, selectedBranch]);

  useEffect(() => {
    if (open) {
      loadStaffProfiles();
      loadLogs();
    }
  }, [open, loadLogs, loadStaffProfiles]);

  useEffect(() => {
    setSelectedBranch(activeBranchId);
  }, [activeBranchId]);

  if (!open) return null;

  // Process QR Scanner input
  const handleQrScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = qrInput.trim();
    if (!raw) return;

    const parsed = parseStaffQrValue(raw);
    const targetStaffId = parsed ? parsed.id : raw;
    const targetBranch = parsed?.branchId || (selectedBranch !== 'all' ? selectedBranch : 'br_nag_1');

    setScanProcessing(true);
    try {
      // Check if staff has an open shift
      const resOpen = await fetch(`/api/staff-attendance/open-shift/${targetStaffId}`);
      let hasOpenShift = false;
      if (resOpen.ok) {
        const openData = await resOpen.json();
        hasOpenShift = !!openData;
      }

      if (hasOpenShift) {
        // Clock out
        await callRpc('staff_check_out', {
          p_staff_id: targetStaffId,
          p_notes: 'QR Scanner Station Clock-out',
        });
        toast.success(`Staff Clocked Out successfully!`);
      } else {
        // Clock in
        await callRpc('staff_check_in', {
          p_staff_id: targetStaffId,
          p_branch_id: targetBranch,
          p_method: 'qr',
          p_notes: 'QR Scanner Station Clock-in',
        });
        toast.success(`Staff Clocked In successfully!`);
      }

      setQrInput('');
      await loadLogs();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process QR check-in/out');
    } finally {
      setScanProcessing(false);
    }
  };

  // Manual check-in
  const handleManualCheckIn = async () => {
    if (!manualStaffId) {
      toast.error('Select a staff member');
      return;
    }
    setManualLoading(true);
    try {
      await callRpc('staff_check_in', {
        p_staff_id: manualStaffId,
        p_branch_id: manualBranchId || 'br_nag_1',
        p_method: 'manual',
        p_notes: manualNotes.trim() || undefined,
      });
      toast.success('Staff checked in successfully');
      setManualNotes('');
      await loadLogs();
    } catch (err: any) {
      toast.error(err?.message || 'Manual check-in failed');
    } finally {
      setManualLoading(false);
    }
  };

  // Manual / Override check-out
  const handleOverrideCheckOut = async (staffId: string) => {
    try {
      await callRpc('staff_check_out', {
        p_staff_id: staffId,
        p_notes: 'Owner/Manager check-out override',
      });
      toast.success('Staff shift closed successfully');
      await loadLogs();
    } catch (err: any) {
      toast.error(err?.message || 'Check-out override failed');
    }
  };

  const activeOnFloorCount = logs.filter((l) => !l.checked_out_at).length;
  const completedCount = logs.filter((l) => !!l.checked_out_at).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-600/10 border border-red-500/20 flex items-center justify-center text-red-500">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Staff Attendance & Floor Shifts</h2>
              <p className="text-xs text-zinc-400">
                Live attendance monitoring, QR scanner station, and shift logs across all branches
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Metric Bar */}
        <div className="p-6 border-b border-zinc-800/80 bg-zinc-900/40 grid grid-cols-1 md:grid-cols-12 gap-4 shrink-0">
          {/* Metrics */}
          <div className="md:col-span-4 grid grid-cols-2 gap-3">
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3">
              <div className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                On Floor Now
              </div>
              <div className="text-2xl font-black text-white">{activeOnFloorCount}</div>
            </div>

            <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-3">
              <div className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-3 h-3 text-zinc-500" />
                Completed Today
              </div>
              <div className="text-2xl font-black text-zinc-300">{completedCount}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="md:col-span-8 flex flex-wrap items-center gap-3 justify-end">
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
              <Building2 className="w-4 h-4 text-zinc-500" />
              <label htmlFor={branchSelectId} className="sr-only">Filter by branch</label>
              <select
                id={branchSelectId}
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-zinc-900 text-white">All Branches (3)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id} className="bg-zinc-900 text-white">
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
              <Calendar className="w-4 h-4 text-zinc-500" />
              <label htmlFor={dateInputId} className="sr-only">Select date</label>
              <input
                id={dateInputId}
                type="date"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none"
              />
            </div>

            <button
              onClick={loadLogs}
              disabled={loading}
              className="p-2 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-colors"
              title="Refresh Logs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Quick Actions Grid (QR Fast Station + Manual Check-in) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Fast QR Scanner Bar */}
            <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2 text-xs font-bold text-white uppercase tracking-wider">
                <QrCode className="w-4 h-4 text-red-500" />
                <span>QR Scanner Station / Fast Scan</span>
              </div>
              <p className="text-[11px] text-zinc-400 mb-3">
                Scan trainer QR badge to auto clock-in or clock-out.
              </p>
              <form onSubmit={handleQrScanSubmit} className="flex gap-2">
                <label htmlFor={qrInputId} className="sr-only">Staff QR or ID</label>
                <div className="relative flex-1">
                  <input
                    id={qrInputId}
                    type="text"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    placeholder="Scan QR payload or enter staff ID..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
                <LoadingButton
                  type="submit"
                  loading={scanProcessing}
                  size="sm"
                  variant="primary"
                  className="px-4 text-xs shrink-0"
                >
                  Process Scan
                </LoadingButton>
              </form>
            </div>

            {/* 2. Manual Staff Check-In */}
            <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2 text-xs font-bold text-white uppercase tracking-wider">
                <LogIn className="w-4 h-4 text-emerald-400" />
                <span>Manual Staff Check-In</span>
              </div>
              <p className="text-[11px] text-zinc-400 mb-3">
                Manually start a shift for staff who forgot their badge.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label htmlFor={manualStaffSelectId} className="sr-only">Select staff</label>
                  <select
                    id={manualStaffSelectId}
                    value={manualStaffId}
                    onChange={(e) => {
                      setManualStaffId(e.target.value);
                      const p = staffList.find((x) => x.id === e.target.value);
                      if (p?.branch_id) setManualBranchId(p.branch_id);
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  >
                    {staffList.map((st) => (
                      <option key={st.id} value={st.id} className="bg-zinc-950 text-white">
                        {st.full_name} ({st.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={manualBranchSelectId} className="sr-only">Select branch</label>
                  <select
                    id={manualBranchSelectId}
                    value={manualBranchId}
                    onChange={(e) => setManualBranchId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id} className="bg-zinc-950 text-white">
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={manualNotesInputId} className="sr-only">Shift notes</label>
                  <input
                    id={manualNotesInputId}
                    type="text"
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>
              <div className="mt-2 text-right">
                <LoadingButton
                  onClick={handleManualCheckIn}
                  loading={manualLoading}
                  size="sm"
                  variant="secondary"
                  className="px-4 text-xs font-semibold"
                >
                  Start Shift
                </LoadingButton>
              </div>
            </div>
          </div>

          {/* Logs Table */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-red-500" />
                <span>Shift Logs for {dayjs(selectedDay).format('D MMMM YYYY')}</span>
              </h3>
              <span className="text-xs text-zinc-500">{logs.length} records</span>
            </div>

            {logs.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs">
                No staff attendance records logged for {dayjs(selectedDay).format('D MMM YYYY')}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Staff Member</th>
                      <th className="py-3 px-4">Branch</th>
                      <th className="py-3 px-4">Clock In</th>
                      <th className="py-3 px-4">Clock Out</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Notes</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {logs.map((log) => {
                      const isOpen = !log.checked_out_at;
                      const inTime = dayjs(log.checked_in_at);
                      const outTime = log.checked_out_at ? dayjs(log.checked_out_at) : dayjs();
                      const diffMins = outTime.diff(inTime, 'minute');
                      const hours = Math.floor(diffMins / 60);
                      const mins = diffMins % 60;
                      const durationStr = `${hours}h ${mins}m`;

                      return (
                        <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-white whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-300">
                                {log.profiles?.full_name?.charAt(0) || 'S'}
                              </div>
                              <div>
                                <div>{log.profiles?.full_name || 'Staff Member'}</div>
                                <div className="text-[10px] text-zinc-500 capitalize">{log.profiles?.role || 'trainer'}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-zinc-300 whitespace-nowrap">
                            {branches.find((b) => b.id === log.branch_id)?.name || (log as any).branch_name || 'Pulse Fitness'}
                          </td>

                          <td className="py-3.5 px-4 font-mono text-zinc-300 whitespace-nowrap">
                            {dayjs(log.checked_in_at).format('hh:mm A')}
                          </td>

                          <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                            {log.checked_out_at ? (
                              <span className="text-zinc-300">{dayjs(log.checked_out_at).format('hh:mm A')}</span>
                            ) : (
                              <span className="text-amber-400 font-semibold italic">On Floor</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-zinc-300 font-mono whitespace-nowrap">
                            {durationStr}
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
                              {log.method}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isOpen ? (
                              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                On Floor
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-zinc-400">
                                <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />
                                Completed
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-zinc-400 max-w-xs truncate">
                            {log.notes || '—'}
                          </td>

                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            {isOpen && (
                              <button
                                onClick={() => handleOverrideCheckOut(log.staff_id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300 transition-colors"
                              >
                                <LogOut className="w-3 h-3" />
                                Clock Out
                              </button>
                            )}
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <div className="text-xs text-zinc-500">
            Staff shifts are recorded with branch and timestamp audit trails.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
export default StaffAttendanceModal;
