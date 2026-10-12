import React, { useState, useEffect } from 'react';
import { Member, Profile, ContactExportResult, ExportLogRecord } from '../types';
import { Download, FileText, Copy, Check, Users, ShieldAlert, History, Sparkles, Upload, CreditCard, Zap } from 'lucide-react';
import { generateHardenedVCard, downloadVCardFile, generateMembersCSV, downloadCSVFile, logExportAudit } from '../lib/export';
import { BulkMemberImport } from './import/BulkMemberImport';
import { BulkPaymentImport } from './import/BulkPaymentImport';
import { SmartContactAutoBranchDump } from './import/SmartContactAutoBranchDump';

interface BulkContactModalProps {
  currentProfile?: Profile;
  members: Member[];
  onClose: () => void;
  onRefreshData?: () => void;
  initialTab?: 'auto_dump' | 'export' | 'import_members' | 'import_payments' | 'audit';
}

export const BulkContactModal: React.FC<BulkContactModalProps> = ({
  currentProfile,
  members,
  onClose,
  onRefreshData,
  initialTab = 'auto_dump'
}) => {
  const [activeTab, setActiveTab] = useState<'auto_dump' | 'export' | 'import_members' | 'import_payments' | 'audit'>(initialTab);
  const [filterType, setFilterType] = useState<'active' | 'pending' | 'expired' | 'all'>('active');
  const [copiedClipboard, setCopiedClipboard] = useState(false);
  const [exportResult, setExportResult] = useState<ContactExportResult | null>(null);

  const [auditLogs, setAuditLogs] = useState<ExportLogRecord[]>([]);

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/export-logs');
      if (res.ok) setAuditLogs(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  // Filter members based on selection
  const filteredMembers = members.filter(m => {
    if (m.is_archived) return false;
    if (filterType === 'all') return true;
    return m.status === filterType;
  });

  const handleExportVCard = async () => {
    const result = generateHardenedVCard(filteredMembers);
    setExportResult(result);
    downloadVCardFile(result.vcardContent, result.filename);
    if (currentProfile) {
      await logExportAudit(currentProfile, 'vcf', `Filter: ${filterType.toUpperCase()}`, result.addedCount);
    }
    fetchAuditLogs();
  };

  const handleExportCSV = async () => {
    const csvStr = generateMembersCSV(filteredMembers);
    const filename = `Pulse_Fitness_Members_${filterType}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSVFile(csvStr, filename);
    if (currentProfile) {
      await logExportAudit(currentProfile, 'csv', `Filter: ${filterType.toUpperCase()}`, filteredMembers.length);
    }
    fetchAuditLogs();
  };

  const handleCopyClipboard = async () => {
    const lines = filteredMembers.map(m => `${m.full_name}: +91${m.phone} (${m.package_type || 'General Gym'})`);
    const content = lines.join('\n');
    await navigator.clipboard.writeText(content);
    setCopiedClipboard(true);
    setTimeout(() => setCopiedClipboard(false), 2500);
    if (currentProfile) {
      await logExportAudit(currentProfile, 'clipboard', `Filter: ${filterType.toUpperCase()}`, filteredMembers.length);
    }
    fetchAuditLogs();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-4xl w-full shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-red-950 via-zinc-900 to-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-red-600/20 border border-red-500/30 text-red-400 flex items-center justify-center shadow-md shadow-red-600/20">
              <Zap className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black text-white">SMART CONTACT DUMP & DATA DESK</h3>
                <span className="px-2 py-0.5 rounded-full bg-red-600/20 border border-red-500/30 text-red-400 text-[10px] font-black uppercase">
                  AUTO-BRANCH ROUTING
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Bulk dump & single send • Auto-routes: <span className="text-emerald-400 font-bold">gym → Nagarabhavi</span> • <span className="text-blue-400 font-bold">Bsk → Banashankari</span> • <span className="text-purple-400 font-bold">Rr → RR Nagar</span>
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl transition-colors">
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-950 px-5 pt-3 space-x-4 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('auto_dump')}
            className={`pb-3 text-xs font-black border-b-2 transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'auto_dump' ? 'border-red-500 text-red-400 shadow-sm' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-red-400" />
            <span>⚡ AUTO-BRANCH CONTACT DUMP</span>
          </button>

          <button
            onClick={() => setActiveTab('import_members')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'import_members' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>CSV MEMBER IMPORT</span>
          </button>

          <button
            onClick={() => setActiveTab('import_payments')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'import_payments' ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>CSV PAYMENT IMPORT</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'export' ? 'border-orange-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT CONTACTS (VCF/CSV)</span>
          </button>

          <button
            onClick={() => { setActiveTab('audit'); fetchAuditLogs(); }}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center space-x-1 whitespace-nowrap ${
              activeTab === 'audit' ? 'border-orange-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>AUDIT LOGS ({auditLogs.length})</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">

          {activeTab === 'auto_dump' && (
            <SmartContactAutoBranchDump
              defaultBranchId={currentProfile?.branch_id || 'br_nag_1'}
              onSuccess={() => {
                if (onRefreshData) onRefreshData();
              }}
            />
          )}

          {activeTab === 'import_members' && (
            <BulkMemberImport
              currentBranchId={currentProfile?.branch_id || 'br_nag_1'}
              onImportComplete={() => {
                if (onRefreshData) onRefreshData();
              }}
            />
          )}

          {activeTab === 'import_payments' && (
            <BulkPaymentImport
              currentBranchId={currentProfile?.branch_id || 'br_nag_1'}
              onImportComplete={() => {
                if (onRefreshData) onRefreshData();
              }}
            />
          )}

          {activeTab === 'export' && (
            <div className="space-y-5">
              
              {/* Filter Selection */}
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase block mb-1">Target Members Filter</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['active', 'pending', 'expired', 'all'] as const).map((ft) => (
                    <button
                      key={ft}
                      onClick={() => setFilterType(ft)}
                      className={`py-2 text-xs font-extrabold uppercase rounded-xl border transition-all ${
                        filterType === ft
                          ? 'bg-orange-600 text-white border-orange-500 shadow-md'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {ft}
                    </button>
                  ))}
                </div>
              </div>

              {/* Members Preview Badge */}
              <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase block">Selected Audience</span>
                  <span className="text-sm font-extrabold text-white">
                    {filteredMembers.length} Members ({filterType.toUpperCase()})
                  </span>
                </div>
                <Users className="w-6 h-6 text-orange-400" />
              </div>

              {/* Export Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleExportVCard}
                  disabled={filteredMembers.length === 0}
                  className="w-full py-4 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 disabled:opacity-40 text-white font-extrabold text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>BULK EXPORT VCARD FOR SMARTPHONE (.VCF)</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExportCSV}
                    disabled={filteredMembers.length === 0}
                    className="py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1.5"
                  >
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>EXPORT EXCEL/CSV</span>
                  </button>

                  <button
                    onClick={handleCopyClipboard}
                    disabled={filteredMembers.length === 0}
                    className="py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1.5"
                  >
                    {copiedClipboard ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-amber-400" />}
                    <span>{copiedClipboard ? 'COPIED TO CLIPBOARD!' : 'COPY NUMBERS'}</span>
                  </button>
                </div>
              </div>

              {/* Export Result Notice */}
              {exportResult && (
                <div className="p-4 bg-emerald-950/60 border border-emerald-800/80 rounded-2xl text-xs space-y-1">
                  <p className="font-bold text-emerald-300">✓ Export Generated & Logged Successfully!</p>
                  <p className="text-zinc-400">Total Processed: {exportResult.totalProcessed} • Added: {exportResult.addedCount} • File: {exportResult.filename}</p>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Export Activity Audit Log</h4>
              
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {auditLogs.length === 0 ? (
                  <div className="p-8 text-center text-zinc-400 text-xs">No export logs recorded yet.</div>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-white block">Exported {log.member_count} Members</span>
                        <span className="text-[10px] text-zinc-400">By {log.exported_by_name} • {log.filter_used}</span>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 bg-orange-950 text-orange-400 font-mono font-bold text-[10px] rounded uppercase border border-orange-800">
                          {log.export_type}
                        </span>
                        <span className="text-[10px] text-zinc-400 block mt-0.5">{new Date(log.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 text-right">
          <button onClick={onClose} className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl">
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
