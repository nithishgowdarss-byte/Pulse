import React, { useState } from 'react';
import { Database, Copy, Check, Smartphone, ShieldCheck, Code, ArrowRight } from 'lucide-react';

interface ExpoSchemaGuideModalProps {
  onClose: () => void;
}

export const ExpoSchemaGuideModal: React.FC<ExpoSchemaGuideModalProps> = ({ onClose }) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const phase2SqlSchema = `-- Pulse Fitness Gym - Phase 2 Supabase Migration SQL & RLS Policies

-- 1. Extend Members Table
ALTER TABLE members 
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS balance_due NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS package_type TEXT,
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 10,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES profiles(id);

-- 2. Create Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES members(id) NOT NULL,
  checked_in_at TIMESTAMPTZ DEFAULT NOW(),
  checked_in_by UUID REFERENCES profiles(id),
  method TEXT CHECK (method IN ('qr', 'manual', 'biometric')) DEFAULT 'qr',
  notes TEXT
);

-- 3. Create Export Logs Table
CREATE TABLE IF NOT EXISTS export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exported_by UUID REFERENCES profiles(id),
  export_type TEXT CHECK (export_type IN ('vcf', 'csv', 'clipboard')),
  filter_used TEXT,
  member_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Commission Settlements Table
CREATE TABLE IF NOT EXISTS commission_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id UUID REFERENCES profiles(id) NOT NULL,
  period_start DATE,
  period_end DATE,
  total_commission NUMERIC(10,2) NOT NULL,
  status TEXT CHECK (status IN ('pending', 'paid')) DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_settlements ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for Attendance
CREATE POLICY "Owners full access on attendance" 
  ON attendance FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

CREATE POLICY "Trainers view own created attendance" 
  ON attendance FOR SELECT 
  USING (checked_in_by = auth.uid());

CREATE POLICY "Trainers insert attendance" 
  ON attendance FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

-- 7. RLS Policies for Commission Settlements
CREATE POLICY "Owners full access on settlements" 
  ON commission_settlements FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

CREATE POLICY "Trainers view own settlements only" 
  ON commission_settlements FOR SELECT 
  USING (trainer_id = auth.uid());

-- 8. RLS Policies for Export Logs
CREATE POLICY "Owners full access on export_logs" 
  ON export_logs FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner'));

CREATE POLICY "Users view own export logs" 
  ON export_logs FOR SELECT 
  USING (exported_by = auth.uid());

CREATE POLICY "Users insert export logs" 
  ON export_logs FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);
`;

  const expoContactsCode = `// lib/contacts.ts - Hardened Bulk Contact Export for Expo React Native
import * as Contacts from 'expo-contacts';

export async function bulkExportToPhoneContacts(members: Array<{ full_name: string; phone: string; start_date?: string; subscription_months?: number; package_type?: string; trainer_name?: string }>) {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') {
    alert('Permission to access Contacts was denied.');
    return;
  }

  const existing = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers]
  });

  const existingPhones = new Set<string>();
  existing.data.forEach(c => {
    c.phoneNumbers?.forEach(p => {
      if (p.number) {
        existingPhones.add(p.number.replace(/\\D/g, '').slice(-10));
      }
    });
  });

  let savedCount = 0;
  let skippedCount = 0;

  for (const member of members) {
    const cleanPhone = member.phone.replace(/\\D/g, '').slice(-10);
    if (existingPhones.has(cleanPhone)) {
      skippedCount++;
      continue;
    }

    const nameParts = member.full_name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    await Contacts.addContactAsync({
      [Contacts.Fields.FirstName]: firstName,
      [Contacts.Fields.LastName]: lastName,
      [Contacts.Fields.PhoneNumbers]: [{
        number: \`+91\${cleanPhone}\`,
        label: 'mobile'
      }],
      [Contacts.Fields.Company]: 'Pulse Fitness Gym',
      [Contacts.Fields.JobTitle]: \`Gym Member (\${member.package_type || 'General Gym'})\`,
      [Contacts.Fields.Note]: \`Pulse Fitness Member • Joined: \${member.start_date || 'Today'} • Plan: \${member.package_type || 'General Gym'} (\${member.subscription_months || 1}m) • Trainer: \${member.trainer_name || 'Assigned'}\`
    });

    existingPhones.add(cleanPhone);
    savedCount++;
  }

  alert(\`Successfully saved \${savedCount} contacts to smartphone! (\${skippedCount} skipped duplicates)\`);
}`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(key);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-3xl w-full shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-zinc-950 via-zinc-900 to-red-950 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-red-600/20 text-red-400 border border-red-500/30 rounded-2xl">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-red-400 tracking-wider">PHASE 2 SUPABASE & EXPO MOBILE GUIDE</span>
              <h2 className="text-xl font-black text-white">Migration SQL & Native Expo Code</h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white bg-zinc-800 rounded-xl"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex items-start space-x-3">
            <Smartphone className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-300">
              Run the Phase 2 SQL script below in your <strong>Supabase SQL Editor</strong> to apply all Phase 2 columns, attendance tables, export audit logs, commission settlement tables, and RLS security rules!
            </p>
          </div>

          {/* Section 1: SQL Script */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                <Code className="w-4 h-4" />
                <span>Phase 2 Supabase SQL Migration & RLS Security Script</span>
              </h3>

              <button
                onClick={() => copyToClipboard(phase2SqlSchema, 'sql')}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-lg flex items-center space-x-1 transition-all"
              >
                {copiedSection === 'sql' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                <span>{copiedSection === 'sql' ? 'Copied Migration SQL!' : 'Copy Migration SQL'}</span>
              </button>
            </div>

            <pre className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-60 leading-relaxed">
              {phase2SqlSchema}
            </pre>
          </div>

          {/* Section 2: Expo Code */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1.5">
                <Smartphone className="w-4 h-4" />
                <span>React Native Expo (`expo-contacts`) Bulk Importer</span>
              </h3>

              <button
                onClick={() => copyToClipboard(expoContactsCode, 'expo')}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-lg flex items-center space-x-1 transition-all"
              >
                {copiedSection === 'expo' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                <span>{copiedSection === 'expo' ? 'Copied Expo TS!' : 'Copy Expo Code'}</span>
              </button>
            </div>

            <pre className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 text-[11px] font-mono text-zinc-200 overflow-x-auto max-h-56 leading-relaxed">
              {expoContactsCode}
            </pre>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 text-right">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs rounded-xl"
          >
            Close Guide
          </button>
        </div>

      </div>
    </div>
  );
};
