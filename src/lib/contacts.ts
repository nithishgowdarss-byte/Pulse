import { Member, ContactExportResult } from '../types';
import { normalizeIndianPhone } from './phoneUtils';

/**
 * Generates a compliant vCard 3.0 block for a single member
 */
export function generateVCard30(member: Member, gymPrefix: string = 'Pulse Gym'): string {
  const cleanPhone = normalizeIndianPhone(member.phone);
  const formattedPhone = cleanPhone ? `+91${cleanPhone}` : member.phone;
  
  const formattedName = member.full_name.trim();
  const orgName = member.branch_name ? `${gymPrefix} - ${member.branch_name}` : gymPrefix;
  const statusNote = `Status: ${member.status.toUpperCase()} | Package: ${member.package_type || 'N/A'}`;
  const trainerNote = member.trainer_name ? `Trainer: ${member.trainer_name}` : '';
  const noteContent = [statusNote, trainerNote, member.notes].filter(Boolean).join(' | ');

  const vcardLines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${formattedName};;;`,
    `FN:${formattedName}`,
    `ORG:${orgName}`,
    `TEL;TYPE=CELL,VOICE:${formattedPhone}`,
  ];

  if (member.email) {
    vcardLines.push(`EMAIL;TYPE=INTERNET:${member.email.trim()}`);
  }

  if (noteContent) {
    vcardLines.push(`NOTE:${noteContent}`);
  }

  vcardLines.push('END:VCARD');
  return vcardLines.join('\r\n');
}

/**
 * Bulk exports members into a single merged .vcf file string with duplicate detection
 */
export function buildBulkVCardExport(
  members: Member[],
  filterName: string = 'All Members',
  gymPrefix: string = 'Pulse Gym'
): ContactExportResult {
  const seenPhones = new Set<string>();
  const validVCards: string[] = [];
  const skippedMembers: Array<{ name: string; phone: string; reason: string }> = [];

  let addedCount = 0;
  let skippedDuplicatesCount = 0;

  for (const member of members) {
    const clean = normalizeIndianPhone(member.phone);
    if (!clean) {
      skippedMembers.push({
        name: member.full_name,
        phone: member.phone,
        reason: 'Invalid 10-digit phone number format'
      });
      continue;
    }

    if (seenPhones.has(clean)) {
      skippedDuplicatesCount++;
      skippedMembers.push({
        name: member.full_name,
        phone: member.phone,
        reason: 'Duplicate phone number already exported'
      });
      continue;
    }

    seenPhones.add(clean);
    validVCards.push(generateVCard30(member, gymPrefix));
    addedCount++;
  }

  const vcardContent = validVCards.join('\r\n\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  const sanitizedFilter = filterName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filename = `pulse_fitness_contacts_${sanitizedFilter}_${dateStr}.vcf`;

  return {
    totalProcessed: members.length,
    addedCount,
    skippedDuplicatesCount,
    skippedMembers,
    vcardContent,
    filename
  };
}

/**
 * Triggers a browser download of a generated file (VCF or CSV)
 */
export function downloadFileInBrowser(content: string, filename: string, mimeType: string = 'text/vcard') {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
