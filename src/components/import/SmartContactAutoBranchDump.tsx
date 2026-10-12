// src/components/import/SmartContactAutoBranchDump.tsx
import React, { useState, useMemo } from 'react';
import { EmptySearch } from '../ui/EmptySearch';
import {
  Upload,
  Send,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Building2,
  FileText,
  Copy,
  Check,
  RefreshCw,
  Search,
  Filter,
  UserCheck,
  Info,
  Phone,
  User,
  ArrowRight,
  ShieldCheck,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import {
  parseBulkContactsDump,
  detectBranchFromName,
  ParsedDumpContact,
  KNOWN_BRANCHES
} from '../../lib/branchRouting';
import { toast } from '../../lib/toast';
import { LoadingButton } from '../ui/LoadingButton';

interface SmartContactAutoBranchDumpProps {
  onSuccess?: () => void;
  defaultBranchId?: string;
}

export const SmartContactAutoBranchDump: React.FC<SmartContactAutoBranchDumpProps> = ({
  onSuccess,
  defaultBranchId = 'br_nag_1',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'bulk_dump' | 'single_send'>('bulk_dump');

  // Bulk Dump State
  const [rawText, setRawText] = useState('');
  const [cleanSuffix, setCleanSuffix] = useState(true);
  const [fallbackBranch, setFallbackBranch] = useState(defaultBranchId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [filterBranch, setFilterBranch] = useState<'all' | 'br_nag_1' | 'br_bsk_3' | 'br_rr_2'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastBulkResult, setLastBulkResult] = useState<{
    inserted: number;
    skipped_duplicates: number;
    branch_summary: Record<string, number>;
  } | null>(null);

  // Single Send State
  const [singleName, setSingleName] = useState('');
  const [singlePhone, setSinglePhone] = useState('');
  const [singleRawLine, setSingleRawLine] = useState('');
  const [isSingleSubmitting, setIsSingleSubmitting] = useState(false);
  const [sessionSentList, setSessionSentList] = useState<Array<{
    name: string;
    cleanedName: string;
    phone: string;
    branchName: string;
    branchId: string;
    rule: string;
    timestamp: string;
  }>>([]);

  // Live Auto-Detection for Single Send (either from separate fields or single line)
  const singleDetection = useMemo(() => {
    let nameToTest = singleName.trim();
    let phoneToTest = singlePhone.trim();

    if (singleRawLine.trim()) {
      const match = singleRawLine.match(/(?:\+?91[\s\-]?)?[6-9]\d{4}[\s\-]?\d{5}/) ||
                    singleRawLine.match(/(?:\+?91[\s\-]?)?\d{10,12}/);
      if (match) {
        phoneToTest = match[0];
        nameToTest = singleRawLine.replace(match[0], '').replace(/^[\s\-_:,()[\]]+/, '').replace(/[\s\-_:,()[\]]+$/, '').trim();
      } else {
        nameToTest = singleRawLine.trim();
      }
    }

    const route = detectBranchFromName(nameToTest || 'Member', fallbackBranch);
    const cleanDigits = phoneToTest.replace(/\D/g, '').slice(-10);
    const isValidPhone = cleanDigits.length === 10 && /^[6-9]\d{9}$/.test(cleanDigits);

    return {
      inputName: nameToTest,
      cleanedName: route.cleanedName,
      branchId: route.branchId,
      branchName: route.branchName,
      branchCode: route.branchCode,
      matchedRule: route.matchedRule,
      matchedKeyword: route.matchedKeyword,
      confidence: route.confidence,
      cleanPhone: cleanDigits,
      isValidPhone,
      displayPhone: cleanDigits.length === 10 ? `+91 ${cleanDigits.slice(0, 5)} ${cleanDigits.slice(5)}` : phoneToTest,
    };
  }, [singleName, singlePhone, singleRawLine, fallbackBranch]);

  // Live Bulk Parsing
  const parsedSummary = useMemo(() => {
    return parseBulkContactsDump(rawText, fallbackBranch);
  }, [rawText, fallbackBranch]);

  // Filtered contacts in preview table
  const displayedContacts = useMemo(() => {
    return parsedSummary.contacts.filter(c => {
      if (filterBranch !== 'all' && c.branchId !== filterBranch) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = c.originalName.toLowerCase().includes(q) || c.cleanedName.toLowerCase().includes(q);
        const matchesPhone = c.phone.includes(q);
        const matchesBranch = c.branchName.toLowerCase().includes(q);
        return matchesName || matchesPhone || matchesBranch;
      }
      return true;
    });
  }, [parsedSummary.contacts, filterBranch, searchQuery]);

  // Demo Example Loader
  const handleLoadDemoContacts = () => {
    const sample = `Arun gym 9876543210
Suresh Bsk +91 98451 23456
Karthik Rr 9886012345
Pooja gym, 9900112233
Ananya BSK: 9812345678
Darshan Rr Nagara - 9123456780
Ramesh Gym 9845012345
Deepak - Bsk 9740112233
Sneha rr 9632114455`;
    setRawText(sample);
    setFileName('sample_pulse_contacts.txt');
    setLastBulkResult(null);
    toast.success('Loaded example contacts demonstrating gym, Bsk, and Rr auto-routing!');
  };

  // File Upload Handler (.txt, .csv, .vcf)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5_000_000) {
      toast.error('File size must be under 5MB');
      return;
    }

    setFileName(file.name);
    try {
      const text = await file.text();
      setRawText(text);
      setLastBulkResult(null);
      toast.success(`Loaded file "${file.name}" with ${text.split(/\r?\n/).length} lines`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to read file contents');
    }
  };

  // Submit Bulk Dump
  const handleBulkSubmit = async () => {
    const validRows = parsedSummary.contacts.filter(c => c.isValidPhone);
    if (validRows.length === 0) {
      toast.error('No valid contacts with 10-digit Indian phone numbers found to import.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/contacts/quick-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: validRows.map(c => ({
            full_name: c.originalName,
            phone: c.phone,
          })),
          clean_suffix: cleanSuffix,
          default_branch_id: fallbackBranch,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import contacts');
      }

      setLastBulkResult({
        inserted: data.inserted,
        skipped_duplicates: data.skipped_duplicates,
        branch_summary: data.branch_summary || {},
      });

      toast.success(`Successfully imported ${data.inserted} clients across branches! (Skipped ${data.skipped_duplicates} duplicates)`);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error occurred while saving contacts');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Single Contact
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let name = singleDetection.inputName.trim();
    let phone = singleDetection.cleanPhone;

    if (!name) {
      toast.error('Please enter client name');
      return;
    }

    if (!singleDetection.isValidPhone || phone.length !== 10) {
      toast.error('Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)');
      return;
    }

    setIsSingleSubmitting(true);
    try {
      const response = await fetch('/api/contacts/quick-dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: {
            full_name: name,
            phone,
          },
          clean_suffix: cleanSuffix,
          default_branch_id: fallbackBranch,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add client');
      }

      if (data.inserted > 0) {
        const addedItem = data.results?.[0];
        toast.success(`✓ Added ${addedItem?.full_name || name} to ${addedItem?.branch_name || singleDetection.branchName}!`);
        
        setSessionSentList(prev => [
          {
            name,
            cleanedName: addedItem?.full_name || singleDetection.cleanedName,
            phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
            branchName: addedItem?.branch_name || singleDetection.branchName,
            branchId: addedItem?.branch_id || singleDetection.branchId,
            rule: addedItem?.matched_rule || singleDetection.matchedRule,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          },
          ...prev,
        ]);

        // Reset inputs
        setSingleName('');
        setSinglePhone('');
        setSingleRawLine('');
        if (onSuccess) onSuccess();
      } else if (data.skipped_duplicates > 0) {
        toast.error(`Client with phone ${phone} already exists in ${singleDetection.branchName}`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to add client');
    } finally {
      setIsSingleSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Rules Explainer Banner */}
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-red-600/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full bg-red-600/20 text-red-400 border border-red-500/30 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                AUTOMATIC BRANCH ROUTING ENGINE
              </span>
              <span className="text-zinc-400 text-xs">• Zero Prompts</span>
            </div>
            <h3 className="text-lg font-black text-white tracking-tight">
              Dump Contacts Bulk or Send One-by-One
            </h3>
            <p className="text-xs text-zinc-400 max-w-xl">
              Clients are automatically recognized by their contact suffix and routed directly to their branch without asking you which branch to assign:
            </p>
          </div>

          <div className="flex items-center gap-2 bg-zinc-950/80 p-1.5 rounded-2xl border border-zinc-800">
            <button
              onClick={() => setActiveSubTab('bulk_dump')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                activeSubTab === 'bulk_dump'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>BULK CONTACT DUMP</span>
            </button>

            <button
              onClick={() => setActiveSubTab('single_send')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                activeSubTab === 'single_send'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>SEND ONE-BY-ONE</span>
            </button>
          </div>
        </div>

        {/* Visual Rule Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-zinc-800/80">
          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-3 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-xs flex-shrink-0">
              NAG
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-emerald-300">Nagarabhavi</span>
                <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-black">“gym” at end</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                e.g. <span className="text-zinc-200">Arun gym</span>, <span className="text-zinc-200">Pooja Gym</span>, <span className="text-zinc-200">Kiran - gym</span>
              </p>
            </div>
          </div>

          <div className="bg-blue-950/20 border border-blue-500/30 rounded-2xl p-3 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-black text-xs flex-shrink-0">
              BSK
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-blue-300">Banashankari</span>
                <span className="text-[10px] font-mono bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded font-black">“Bsk”</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                e.g. <span className="text-zinc-200">Suresh Bsk</span>, <span className="text-zinc-200">Anita BSK</span>, <span className="text-zinc-200">bsk</span>
              </p>
            </div>
          </div>

          <div className="bg-purple-950/20 border border-purple-500/30 rounded-2xl p-3 flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-black text-xs flex-shrink-0">
              RR
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-purple-300">RR Nagar</span>
                <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded font-black">“Rr”</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                e.g. <span className="text-zinc-200">Karthik Rr</span>, <span className="text-zinc-200">Darshan Rr Nagara</span>, <span className="text-zinc-200">Pradeep RR</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: BULK DUMP */}
      {activeSubTab === 'bulk_dump' && (
        <div className="space-y-5">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-zinc-200">
                <input
                  type="checkbox"
                  checked={cleanSuffix}
                  onChange={(e) => setCleanSuffix(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-red-600 focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <span>Clean suffix from member name (e.g. "Arun gym" → "Arun")</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadDemoContacts}
                className="px-3 py-1.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-bold text-zinc-300 transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Try Demo Contacts Dump</span>
              </button>

              <label className="px-3 py-1.5 rounded-xl border border-red-600/40 bg-red-950/30 hover:bg-red-900/40 text-xs font-bold text-red-300 transition-colors flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload .VCF / .CSV / .TXT</span>
                <input
                  type="file"
                  accept=".txt,.csv,.vcf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Text Dump Input Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-bold uppercase tracking-wider text-zinc-300">
                Paste Contact Dump (Any Format: Lines, WhatsApp, VCF, CSV)
              </span>
              <span>{fileName ? `File: ${fileName}` : `${parsedSummary.totalParsed} contacts detected`}</span>
            </div>

            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setLastBulkResult(null);
              }}
              placeholder={`Paste contact lines or phone dump here...\nExamples:\nArun gym 9876543210\nSuresh Bsk +91 98451 23456\nKarthik Rr - 9886012345\nPooja gym, 9900112233\nAnanya BSK 9812345678\nDarshan Rr Nagara 9123456780`}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 rounded-2xl p-4 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none transition-colors"
            />
          </div>

          {/* Live Branch Breakdown Stat Badges */}
          {parsedSummary.totalParsed > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-2xl">
                <span className="text-[10px] font-bold text-zinc-400 uppercase block">Total Parsed</span>
                <div className="text-xl font-black text-white mt-1">{parsedSummary.totalParsed}</div>
              </div>

              <div className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-2xl">
                <span className="text-[10px] font-bold text-emerald-400 uppercase block flex items-center justify-between">
                  <span>🟢 Nagarabhavi</span>
                  <span className="font-mono text-[9px]">gym</span>
                </span>
                <div className="text-xl font-black text-emerald-300 mt-1">
                  {parsedSummary.branchBreakdown['br_nag_1'] || 0}
                </div>
              </div>

              <div className="bg-blue-950/20 border border-blue-500/30 p-3 rounded-2xl">
                <span className="text-[10px] font-bold text-blue-400 uppercase block flex items-center justify-between">
                  <span>🔵 Banashankari</span>
                  <span className="font-mono text-[9px]">Bsk</span>
                </span>
                <div className="text-xl font-black text-blue-300 mt-1">
                  {parsedSummary.branchBreakdown['br_bsk_3'] || 0}
                </div>
              </div>

              <div className="bg-purple-950/20 border border-purple-500/30 p-3 rounded-2xl">
                <span className="text-[10px] font-bold text-purple-400 uppercase block flex items-center justify-between">
                  <span>🟣 RR Nagar</span>
                  <span className="font-mono text-[9px]">Rr</span>
                </span>
                <div className="text-xl font-black text-purple-300 mt-1">
                  {parsedSummary.branchBreakdown['br_rr_2'] || 0}
                </div>
              </div>
            </div>
          )}

          {/* Last Bulk Result Banner if completed */}
          {lastBulkResult && (
            <div className="p-4 bg-emerald-950/30 border border-emerald-500/40 rounded-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-black text-white">Import Complete!</h4>
                <p className="text-xs text-zinc-300">
                  Successfully inserted <strong className="text-emerald-400 font-bold">{lastBulkResult.inserted}</strong> clients into their respective gym branches.
                  {lastBulkResult.skipped_duplicates > 0 && ` (${lastBulkResult.skipped_duplicates} duplicate numbers skipped).`}
                </p>
                <div className="flex gap-3 text-xs text-zinc-400 pt-1">
                  <span>🟢 Nagarabhavi: <strong className="text-white">{lastBulkResult.branch_summary['br_nag_1'] || 0}</strong></span>
                  <span>🔵 Banashankari: <strong className="text-white">{lastBulkResult.branch_summary['br_bsk_3'] || 0}</strong></span>
                  <span>🟣 RR Nagar: <strong className="text-white">{lastBulkResult.branch_summary['br_rr_2'] || 0}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Preview Table */}
          {parsedSummary.totalParsed > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-300 uppercase">Live Preview Table</span>
                  <span className="text-xs text-zinc-400">({displayedContacts.length} shown)</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Branch Filter Tabs */}
                  <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setFilterBranch('all')}
                      className={`px-2 py-0.5 rounded-lg transition-colors ${
                        filterBranch === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      All Branches
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterBranch('br_nag_1')}
                      className={`px-2 py-0.5 rounded-lg transition-colors ${
                        filterBranch === 'br_nag_1' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Nagarabhavi
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterBranch('br_bsk_3')}
                      className={`px-2 py-0.5 rounded-lg transition-colors ${
                        filterBranch === 'br_bsk_3' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Banashankari
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterBranch('br_rr_2')}
                      className={`px-2 py-0.5 rounded-lg transition-colors ${
                        filterBranch === 'br_rr_2' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      RR Nagar
                    </button>
                  </div>

                  {/* Search Filter */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      placeholder="Search preview..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl pl-8 pr-3 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 w-36"
                    />
                  </div>
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto border border-zinc-800 rounded-2xl bg-zinc-950/70 max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-900/90 text-zinc-400 border-b border-zinc-800 sticky top-0 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3 font-bold">Original Name</th>
                      <th className="py-2.5 px-3 font-bold">CRM Saved Name</th>
                      <th className="py-2.5 px-3 font-bold">Phone (+91)</th>
                      <th className="py-2.5 px-3 font-bold">Auto-Routed Branch</th>
                      <th className="py-2.5 px-3 font-bold">Matching Rule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900 text-zinc-200">
                    {displayedContacts.length === 0 && (<tr><td colSpan={5}><EmptySearch what="contacts" query={searchQuery} filterNote={filterBranch !== 'all' ? 'in the selected branch' : undefined} onClear={() => { setSearchQuery(''); setFilterBranch('all'); }} /></td></tr>)}
                    {displayedContacts.map((c) => {
                      const isNag = c.branchId === 'br_nag_1';
                      const isBsk = c.branchId === 'br_bsk_3';
                      const isRr = c.branchId === 'br_rr_2';

                      return (
                        <tr key={c.id} className="hover:bg-zinc-900/50 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-zinc-300 font-mono text-[11px]">
                            {c.originalName}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-white">
                            {cleanSuffix ? c.cleanedName : c.originalName}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px]">
                            {c.isValidPhone ? (
                              <span className="text-zinc-300">{c.displayPhone}</span>
                            ) : (
                              <span className="text-amber-400 flex items-center gap-1 font-sans text-[10px]">
                                <AlertCircle className="w-3 h-3" />
                                Invalid Mobile
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                                isNag
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : isBsk
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : isRr
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                  : 'bg-zinc-800 text-zinc-300'
                              }`}
                            >
                              <Building2 className="w-2.5 h-2.5" />
                              {c.branchName.replace('Pulse Fitness - ', '')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-zinc-400">
                            {c.matchedRule}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex justify-end">
                <LoadingButton
                  type="button"
                  onClick={handleBulkSubmit}
                  loading={isSubmitting}
                  loadingText="AUTO-ROUTING CLIENTS..."
                  className="px-6 py-3 bg-gradient-to-r from-red-600 via-red-500 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-red-600/30 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    IMPORT & AUTO-ADD {parsedSummary.validCount} CLIENTS TO BRANCHES
                  </span>
                </LoadingButton>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: SEND ONE-BY-ONE */}
      {activeSubTab === 'single_send' && (
        <div className="space-y-6">
          <form onSubmit={handleSingleSubmit} className="bg-zinc-950 p-5 rounded-3xl border border-zinc-800 space-y-4">
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-black text-white">Send Individual Client</h4>
              </div>

              <span className="text-[11px] text-zinc-400">
                Type name with <code className="text-emerald-400 font-mono">gym</code>, <code className="text-blue-400 font-mono">Bsk</code>, or <code className="text-purple-400 font-mono">Rr</code>
              </span>
            </div>

            {/* Input Row: Quick Single Line or Dedicated Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase block mb-1.5">
                  Client Contact Name (with branch tag)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh gym, Suresh Bsk, or Karthik Rr"
                    value={singleName}
                    onChange={(e) => setSingleName(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-red-500 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase block mb-1.5">
                  10-Digit Mobile Number
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-xs font-bold text-zinc-400">+91</span>
                  <input
                    type="tel"
                    required
                    maxLength={14}
                    placeholder="9876543210"
                    value={singlePhone}
                    onChange={(e) => setSinglePhone(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-red-500 rounded-2xl pl-12 pr-4 py-2.5 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Live Auto-Detection Radar Box */}
            {singleName.trim() && (
              <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                      🎯 Detected Destination Branch:
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black uppercase ${
                        singleDetection.branchId === 'br_nag_1'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : singleDetection.branchId === 'br_bsk_3'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      }`}
                    >
                      <Building2 className="w-3 h-3" />
                      {singleDetection.branchName}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300">
                    Rule: <span className="font-semibold text-white">{singleDetection.matchedRule}</span>
                    {cleanSuffix && singleDetection.cleanedName !== singleName && (
                      <span className="text-zinc-400"> · Will be saved in CRM as: <strong className="text-white">{singleDetection.cleanedName}</strong></span>
                    )}
                  </p>
                </div>

                <LoadingButton
                  type="submit"
                  loading={isSingleSubmitting}
                  loadingText="SENDING..."
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>SEND & AUTO-ADD CLIENT</span>
                </LoadingButton>
              </div>
            )}
          </form>

          {/* Session Sent Stream */}
          {sessionSentList.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Clients Sent in this Session ({sessionSentList.length})</span>
                </h4>
              </div>

              <div className="border border-zinc-800 rounded-2xl bg-zinc-950 overflow-hidden divide-y divide-zinc-900">
                {sessionSentList.map((item, idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center font-bold">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white">{item.cleanedName}</span>
                          {item.name !== item.cleanedName && (
                            <span className="text-[10px] text-zinc-400 font-mono">({item.name})</span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                          {item.phone}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                          item.branchId === 'br_nag_1'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : item.branchId === 'br_bsk_3'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        }`}
                      >
                        <Building2 className="w-2.5 h-2.5" />
                        {item.branchName.replace('Pulse Fitness - ', '')}
                      </span>

                      <span className="text-[10px] text-zinc-400">
                        {item.timestamp}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
