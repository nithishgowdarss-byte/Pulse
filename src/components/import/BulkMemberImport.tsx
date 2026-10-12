// src/components/import/BulkMemberImport.tsx
import React, { useMemo, useState } from 'react';
import { parseAndValidateMemberCsv, type ImportRowValid, type ImportRowError } from '../../lib/contactImport';
import { callRpc } from '../../lib/rpc';
import { handleMutationError } from '../../lib/handleMutationError';
import { LoadingButton } from '../ui/LoadingButton';
import { toast } from '../../lib/toast';
import { Users, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Download, Info } from 'lucide-react';

interface BulkMemberImportProps {
  currentBranchId?: string;
  onImportComplete?: () => void;
}

export const BulkMemberImport: React.FC<BulkMemberImportProps> = ({ currentBranchId = 'br_nag_1', onImportComplete }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const [pending, setPending] = useState(false);

  const parsed = useMemo(
    () => (raw ? parseAndValidateMemberCsv(raw) : null),
    [raw]
  );

  async function onFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Upload a .csv file');
      return;
    }
    if (file.size > 2_000_000) {
      toast.error('CSV must be under 2MB');
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      setRaw(text);
    } catch {
      toast.error('Failed to read CSV file');
    }
  }

  function downloadTemplate() {
    const csvContent = `full_name,phone,gender,months,amount_paid,balance_due,status,notes\nRahul Sharma,9876543210,male,3,3000,3000,active,Morning batch\nPriya N,9876543211,female,1,1500,0,active,Crossfit\nVikram Rathod,9876543212,male,12,14000,0,active,VIP Annual\n`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'pulse_members_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function importValid() {
    if (!currentBranchId) {
      toast.error('Select a branch first');
      return;
    }
    if (!parsed?.valid.length) {
      toast.error('No valid rows to import');
      return;
    }
    setPending(true);
    try {
      const result = await callRpc<{
        inserted: number;
        skipped_duplicates: number;
        skipped_phones: string[];
      }>('bulk_import_members', {
        p_branch_id: currentBranchId,
        p_rows: parsed.valid.map((v) => ({
          full_name: v.full_name,
          phone: v.phone,
          gender: v.gender,
          age: v.age,
          email: v.email,
          start_date: v.start_date,
          end_date: v.end_date,
          months: v.months,
          package_type: v.package_type,
          amount_paid: v.amount_paid,
          balance_due: v.balance_due,
          status: v.status,
          notes: v.notes,
        })),
      }, { context: 'bulk_import_members' });

      toast.success(
        `Imported ${result.inserted} member(s)` +
          (result.skipped_duplicates
            ? ` · skipped ${result.skipped_duplicates} duplicate phone(s)`
            : '')
      );
      setRaw('');
      setFileName(null);
      if (onImportComplete) onImportComplete();
    } catch (e) {
      handleMutationError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-600/10 text-emerald-400 border border-emerald-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-zinc-100">Bulk Member Import (CSV)</h2>
            <p className="text-xs text-zinc-400">
              Required columns: <code className="text-emerald-400 font-mono">full_name</code> (or name) + <code className="text-emerald-400 font-mono">phone</code> (10-digit Indian mobile)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={downloadTemplate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-700 bg-zinc-950 hover:bg-zinc-800 text-xs font-semibold text-zinc-300 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-zinc-400" />
          <span>Download CSV Template</span>
        </button>
      </div>

      {/* File Drop / Input Area */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <label className="flex-1 w-full flex flex-col items-center justify-center p-5 border-2 border-dashed border-zinc-700 hover:border-emerald-500/60 rounded-xl bg-zinc-950/60 cursor-pointer transition-colors text-center group">
          <Upload className="w-6 h-6 text-zinc-500 group-hover:text-emerald-400 mb-2 transition-colors" />
          <span className="text-xs font-semibold text-zinc-300">
            {fileName ? `Selected: ${fileName}` : 'Click or Drag & Drop member CSV file here'}
          </span>
          <span className="text-[11px] text-zinc-500 mt-0.5">Supports UTF-8 CSV up to 2MB</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {parsed && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-center">
              <p className="text-[11px] text-zinc-400">Total Rows</p>
              <p className="text-lg font-black text-zinc-100">{parsed.totalRows}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
              <p className="text-[11px] text-emerald-400 font-semibold">Valid & Ready</p>
              <p className="text-lg font-black text-emerald-300">{parsed.valid.length}</p>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center">
              <p className="text-[11px] text-red-400 font-semibold">Validation Errors</p>
              <p className="text-lg font-black text-red-300">{parsed.errors.length}</p>
            </div>
          </div>

          {parsed.errors.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-xl border border-red-900/50 bg-red-950/20">
              <table className="w-full text-left text-xs">
                <thead className="bg-red-950/40 text-red-300 border-b border-red-900/40">
                  <tr>
                    <th className="p-2">Row</th>
                    <th className="p-2">Field</th>
                    <th className="p-2">Error Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-950/30">
                  {parsed.errors.map((e, i) => (
                    <tr key={i} className="text-zinc-300">
                      <td className="p-2 font-mono">{e.rowNumber || '—'}</td>
                      <td className="p-2 font-mono text-amber-300">{e.field || '—'}</td>
                      <td className="p-2 text-red-300">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-zinc-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-zinc-500" />
              <span>Duplicate phone numbers will be automatically skipped during import.</span>
            </p>

            <LoadingButton
              loading={pending}
              loadingText="Importing Members…"
              disabled={!parsed.valid.length || !currentBranchId}
              onClick={importValid}
              variant="primary"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Import {parsed.valid.length} Valid Member(s)
            </LoadingButton>
          </div>
        </div>
      )}
    </div>
  );
};
