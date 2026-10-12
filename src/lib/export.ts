import { csvCell } from './csv';
import { Member, ContactExportResult, ExportLogRecord, Profile } from '../types';
import { normalizeIndianPhone, formatPhoneDisplay } from './phoneUtils';

/**
 * Hardened vCard (v3.0) content generator for Pulse Fitness Gym
 */
export function generateHardenedVCard(
  members: Member[],
  existingPhonesSet: Set<string> = new Set()
): ContactExportResult {
  let vcardOutput = '';
  let addedCount = 0;
  let skippedDuplicatesCount = 0;
  const skippedMembers: Array<{ name: string; phone: string; reason: string }> = [];

  const seenInBatch = new Set<string>();

  members.forEach((member) => {
    // Soft archived members skipped from contact sync unless explicitly targeted
    if (member.is_archived) return;

    const cleanPhone = normalizeIndianPhone(member.phone);
    
    // Duplicate check against existing device contacts or duplicate batch items
    if (existingPhonesSet.has(cleanPhone) || seenInBatch.has(cleanPhone)) {
      skippedDuplicatesCount++;
      skippedMembers.push({
        name: member.full_name,
        phone: formatPhoneDisplay(member.phone),
        reason: 'Phone number already exists in contacts list'
      });
      return;
    }

    seenInBatch.add(cleanPhone);
    addedCount++;

    const formattedPhone = cleanPhone.length === 10 ? `+91${cleanPhone}` : member.phone;
    const nameParts = member.full_name.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const joinDate = member.start_date || member.created_at.split('T')[0];
    const duration = member.subscription_months ? `${member.subscription_months} Months` : 'Pending';
    const pkg = member.package_type || 'General Gym';
    const trainerInfo = member.trainer_name ? `Trainer: ${member.trainer_name}` : 'No Trainer Assigned';
    const balanceInfo = member.balance_due && member.balance_due > 0 ? ` [Balance Due: ₹${member.balance_due}]` : '';

    const richNote = `Pulse Fitness Gym Member • Joined: ${joinDate} • Plan: ${pkg} (${duration}) • ${trainerInfo}${balanceInfo}${member.notes ? ` • Note: ${member.notes}` : ''}`;

    vcardOutput += `BEGIN:VCARD\r\n`;
    vcardOutput += `VERSION:3.0\r\n`;
    vcardOutput += `N:${lastName};${firstName};;;\r\n`;
    vcardOutput += `FN:${member.full_name}\r\n`;
    vcardOutput += `ORG:Pulse Fitness Gym\r\n`;
    vcardOutput += `TITLE:Gym Member (${pkg})\r\n`;
    vcardOutput += `TEL;TYPE=CELL,VOICE:${formattedPhone}\r\n`;
    if (member.email) {
      vcardOutput += `EMAIL;TYPE=INTERNET:${member.email}\r\n`;
    }
    vcardOutput += `NOTE:${richNote}\r\n`;
    vcardOutput += `CATEGORIES:Pulse Fitness Gym, Members\r\n`;
    vcardOutput += `END:VCARD\r\n`;
  });

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `Pulse_Fitness_Gym_Contacts_${timestamp}.vcf`;

  return {
    totalProcessed: members.length,
    addedCount,
    skippedDuplicatesCount,
    skippedMembers,
    vcardContent: vcardOutput,
    filename
  };
}

/**
 * Trigger file download in browser for vCard
 */
export function downloadVCardFile(vcardContent: string, filename: string): void {
  const blob = new Blob([vcardContent], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate CSV string for export
 */
export function generateMembersCSV(members: Member[]): string {
  const headers = [
    'Full Name',
    'Phone',
    'Status',
    'Package',
    'Subscription Months',
    'Amount Paid (₹)',
    'Balance Due (₹)',
    'Payment Ref',
    'Start Date',
    'End Date',
    'Trainer',
    'Age',
    'Gender',
    'Email',
    'Emergency Contact',
    'Archived',
    'Created At'
  ];
  
  const rows = members.map(m => [
    m.full_name, formatPhoneDisplay(m.phone), (m.status || '').toUpperCase(), m.package_type || '', m.subscription_months || '',
    m.amount_paid || 0, m.balance_due || 0, m.payment_reference || '', m.start_date || '', m.end_date || '', m.trainer_name || '',
    m.age || '', m.gender || '', m.email || '', m.emergency_contact || '', m.is_archived ? 'YES' : 'NO', m.created_at,
  ].map(csvCell));

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export function downloadCSVFile(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Logs export audit event to backend API
 */
export async function logExportAudit(
  userProfile: Profile,
  exportType: 'vcf' | 'csv' | 'clipboard',
  filterUsed: string,
  memberCount: number
): Promise<ExportLogRecord | null> {
  try {
    const res = await fetch('/api/export-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exported_by: userProfile.id,
        export_type: exportType,
        filter_used: filterUsed,
        member_count: memberCount
      })
    });

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error('Failed to log contact export audit:', err);
  }
  return null;
}
