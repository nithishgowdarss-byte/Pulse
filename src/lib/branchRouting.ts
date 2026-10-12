// src/lib/branchRouting.ts
import { normalizeIndianPhone, isValidIndianMobile } from './phoneUtils';

export interface BranchRoutingResult {
  branchId: string;
  branchName: string;
  branchCode: string;
  matchedRule: string;
  matchedKeyword: string;
  confidence: 'high' | 'medium' | 'default';
  cleanedName: string;
  originalName: string;
}

export interface ParsedDumpContact {
  id: string;
  rawText: string;
  originalName: string;
  cleanedName: string;
  phone: string; // 10-digit clean phone
  displayPhone: string; // +91 formatted
  isValidPhone: boolean;
  branchId: string;
  branchName: string;
  branchCode: string;
  matchedRule: string;
  matchedKeyword: string;
  confidence: 'high' | 'medium' | 'default';
  gender?: 'Male' | 'Female' | 'Other';
  notes?: string;
  duplicateStatus?: 'new' | 'existing_in_branch' | 'existing_other_branch' | 'duplicate_in_input';
  duplicateBranchName?: string;
}

// Known branch IDs and metadata in Pulse Fitness
export const KNOWN_BRANCHES = [
  {
    id: 'br_nag_1',
    name: 'Pulse Fitness - Nagarabhavi',
    shortName: 'Nagarabhavi',
    code: 'NAG01',
    keywords: ['gym', 'nagarabhavi', 'nagarbhavi', 'nag', 'nag01'],
  },
  {
    id: 'br_bsk_3',
    name: 'Pulse Fitness - Banashankari',
    shortName: 'Banashankari',
    code: 'BSK03',
    keywords: ['bsk', 'banashankari', 'bsk03'],
  },
  {
    id: 'br_rr_2',
    name: 'Pulse Fitness - RR Nagar',
    shortName: 'RR Nagar',
    code: 'RRN02',
    keywords: ['rr', 'rr nagar', 'rr nagara', 'rrn02', 'rajarajeshwari'],
  },
];

/**
 * Detects the gym branch from a contact name according to the business rules:
 * - Nagarbhavi clients: "gym" at end of name (e.g., "Arun gym", "Pooja Gym", "Kiran - gym", "Nagarbhavi")
 * - Banashankari clients: "Bsk" tag/suffix (e.g., "Suresh Bsk", "Anita BSK", "bsk")
 * - RR Nagar clients: "Rr" tag/suffix (e.g., "Karthik Rr", "Pradeep RR", "Rr Nagara")
 */
export function detectBranchFromName(
  name: string,
  defaultBranchId: string = 'br_nag_1'
): BranchRoutingResult {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return {
      branchId: defaultBranchId,
      branchName: 'Pulse Fitness - Nagarabhavi',
      branchCode: 'NAG01',
      matchedRule: 'Default fallback (Empty name)',
      matchedKeyword: '',
      confidence: 'default',
      cleanedName: 'Member',
      originalName: '',
    };
  }

  // 1. Check for Banashankari ("Bsk" or "Banashankari")
  // Examples: "Ananya Bsk", "Deepak BSK", "Rohit - bsk", "Anita (BSK)", "Suresh_bsk"
  const bskRegex = /(?:[\s\-_(\[]+|^)bsk(?:\b|[)\]]|\s*$)/i;
  const banashankariKeywordRegex = /\bbanashankari\b/i;
  if (bskRegex.test(trimmed) || banashankariKeywordRegex.test(trimmed)) {
    const cleaned = cleanSuffix(trimmed, [
      /[\s\-_(\[]+bsk\s*[)\]]?$/i,
      /[\s\-_(\[]+banashankari\s*[)\]]?$/i,
    ]);
    return {
      branchId: 'br_bsk_3',
      branchName: 'Pulse Fitness - Banashankari',
      branchCode: 'BSK03',
      matchedRule: 'Tagged with "Bsk" (Banashankari Branch)',
      matchedKeyword: 'Bsk',
      confidence: 'high',
      cleanedName: cleaned || trimmed,
      originalName: trimmed,
    };
  }

  // 2. Check for RR Nagar ("Rr" or "Rr Nagara" or "RR Nagar")
  // Examples: "Karthik Rr", "Pradeep RR", "Sneha - rr", "Darshan Rr Nagara", "Manoj (rr)"
  const rrRegex = /(?:[\s\-_(\[]+|^)rr(?:\s*nagara?)?(?:\b|[)\]]|\s*$)/i;
  const rrNagarKeywordRegex = /\b(?:rr\s*nagara?|rajarajeshwari)\b/i;
  if (rrRegex.test(trimmed) || rrNagarKeywordRegex.test(trimmed)) {
    const cleaned = cleanSuffix(trimmed, [
      /[\s\-_(\[]+rr\s*nagara?\s*[)\]]?$/i,
      /[\s\-_(\[]+rr\s*[)\]]?$/i,
    ]);
    return {
      branchId: 'br_rr_2',
      branchName: 'Pulse Fitness - RR Nagar',
      branchCode: 'RRN02',
      matchedRule: 'Tagged with "Rr" (RR Nagar Branch)',
      matchedKeyword: 'Rr',
      confidence: 'high',
      cleanedName: cleaned || trimmed,
      originalName: trimmed,
    };
  }

  // 3. Check for Nagarbhavi ("gym" at the end of their name or "nagarbhavi" / "nagarabhavi")
  // Examples: "Ramesh gym", "Arun Gym", "Pooja - Gym", "Kiran_gym", "Deepak (gym)"
  const gymEndRegex = /(?:[\s\-_(\[]+|^)gym(?:\b|[)\]]|\s*$)/i;
  const nagarbhaviKeywordRegex = /\b(?:nagarbhavi|nagarabhavi)\b/i;
  if (gymEndRegex.test(trimmed) || nagarbhaviKeywordRegex.test(trimmed)) {
    const cleaned = cleanSuffix(trimmed, [
      /[\s\-_(\[]+gym\s*[)\]]?$/i,
      /[\s\-_(\[]+nagarabhavi\s*[)\]]?$/i,
      /[\s\-_(\[]+nagarbhavi\s*[)\]]?$/i,
    ]);
    return {
      branchId: 'br_nag_1',
      branchName: 'Pulse Fitness - Nagarabhavi',
      branchCode: 'NAG01',
      matchedRule: 'Ended with "gym" (Nagarabhavi Branch)',
      matchedKeyword: 'gym',
      confidence: 'high',
      cleanedName: cleaned || trimmed,
      originalName: trimmed,
    };
  }

  // Fallback to default branch
  const fallback = KNOWN_BRANCHES.find(b => b.id === defaultBranchId) || KNOWN_BRANCHES[0];
  return {
    branchId: fallback.id,
    branchName: fallback.name,
    branchCode: fallback.code,
    matchedRule: 'No suffix matched (Defaulted to ' + fallback.shortName + ')',
    matchedKeyword: '',
    confidence: 'default',
    cleanedName: trimmed,
    originalName: trimmed,
  };
}

/**
 * Strips branch tags from the name for a clean CRM display
 */
export function cleanSuffix(name: string, patterns: RegExp[]): string {
  let result = name;
  for (const pat of patterns) {
    result = result.replace(pat, '');
  }
  // Trim dangling punctuation like trailing dashes, colons, commas
  result = result.replace(/[\s\-_:,()[\]]+$/, '').replace(/^[\s\-_:,()[\]]+/, '').trim();
  return result || name;
}

/**
 * Extracts phone and name from a variety of contact line formats:
 * - "Arun gym 9876543210"
 * - "Suresh Bsk: +91 98451 23456"
 * - "Karthik Rr - 9886012345"
 * - "Pooja gym, 9900112233"
 * - "9876543210 Arun gym"
 * - "Arun gym\t9876543210"
 */
export function extractContactFromTextLine(
  line: string,
  defaultBranchId: string = 'br_nag_1'
): ParsedDumpContact | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;

  // Find any sequence of digits that could be a phone number (e.g. 10 digits or 12 digits starting with 91 or +91)
  const phoneMatch = trimmed.match(/(?:\+?91[\s\-]?)?[6-9]\d{4}[\s\-]?\d{5}/) ||
                     trimmed.match(/(?:\+?91[\s\-]?)?\d{10,12}/);

  if (!phoneMatch) {
    // If no clear phone number found, check if line contains a phone separated by tab or comma
    const parts = trimmed.split(/[\t,;]+/).map(p => p.trim());
    if (parts.length >= 2) {
      for (let i = 0; i < parts.length; i++) {
        const clean = normalizeIndianPhone(parts[i]);
        if (clean.length === 10) {
          const namePart = parts.filter((_, idx) => idx !== i).join(' ').trim();
          if (namePart) {
            const route = detectBranchFromName(namePart, defaultBranchId);
            return {
              id: `parsed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              rawText: trimmed,
              originalName: namePart,
              cleanedName: route.cleanedName,
              phone: clean,
              displayPhone: `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`,
              isValidPhone: isValidIndianMobile(clean),
              branchId: route.branchId,
              branchName: route.branchName,
              branchCode: route.branchCode,
              matchedRule: route.matchedRule,
              matchedKeyword: route.matchedKeyword,
              confidence: route.confidence,
            };
          }
        }
      }
    }
    return null;
  }

  const rawPhone = phoneMatch[0];
  const cleanPhone = normalizeIndianPhone(rawPhone);

  // Everything else in the line is the name
  let rawName = trimmed.replace(rawPhone, '').trim();
  // Strip leading/trailing separators
  rawName = rawName.replace(/^[\s\-_:,()[\]]+/, '').replace(/[\s\-_:,()[\]]+$/, '').trim();

  if (!rawName) {
    rawName = 'Member';
  }

  const route = detectBranchFromName(rawName, defaultBranchId);

  return {
    id: `parsed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    rawText: trimmed,
    originalName: rawName,
    cleanedName: route.cleanedName,
    phone: cleanPhone,
    displayPhone: cleanPhone.length === 10 ? `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}` : rawPhone,
    isValidPhone: isValidIndianMobile(cleanPhone),
    branchId: route.branchId,
    branchName: route.branchName,
    branchCode: route.branchCode,
    matchedRule: route.matchedRule,
    matchedKeyword: route.matchedKeyword,
    confidence: route.confidence,
  };
}

/**
 * Parses vCard (.vcf) formatted strings into contacts with automatic branch detection
 */
export function parseVCardText(
  vcardText: string,
  defaultBranchId: string = 'br_nag_1'
): ParsedDumpContact[] {
  const contacts: ParsedDumpContact[] = [];
  const cards = vcardText.split(/BEGIN:VCARD/i).slice(1);

  for (const card of cards) {
    let name = '';
    let phone = '';

    const lines = card.split(/\r?\n/);
    for (const l of lines) {
      const line = l.trim();
      if (/^FN:/i.test(line)) {
        name = line.replace(/^FN:/i, '').trim();
      } else if (!name && /^N:/i.test(line)) {
        const parts = line.replace(/^N:/i, '').split(';').map(p => p.trim()).filter(Boolean);
        name = parts.reverse().join(' ');
      } else if (/^TEL[^:]*:/i.test(line)) {
        const telVal = line.replace(/^TEL[^:]*:/i, '').trim();
        const clean = normalizeIndianPhone(telVal);
        if (clean.length === 10 && !phone) {
          phone = clean;
        }
      }
    }

    if (name && phone) {
      const route = detectBranchFromName(name, defaultBranchId);
      contacts.push({
        id: `vcf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        rawText: `FN:${name} | TEL:${phone}`,
        originalName: name,
        cleanedName: route.cleanedName,
        phone,
        displayPhone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`,
        isValidPhone: isValidIndianMobile(phone),
        branchId: route.branchId,
        branchName: route.branchName,
        branchCode: route.branchCode,
        matchedRule: route.matchedRule,
        matchedKeyword: route.matchedKeyword,
        confidence: route.confidence,
      });
    }
  }

  return contacts;
}

/**
 * Comprehensive master parser: Handles raw multi-line dump, CSV, TSV, vCard, or key-value format
 */
export function parseBulkContactsDump(
  rawInput: string,
  defaultBranchId: string = 'br_nag_1'
): {
  contacts: ParsedDumpContact[];
  totalParsed: number;
  validCount: number;
  invalidCount: number;
  branchBreakdown: Record<string, number>;
} {
  if (!rawInput || !rawInput.trim()) {
    return {
      contacts: [],
      totalParsed: 0,
      validCount: 0,
      invalidCount: 0,
      branchBreakdown: {},
    };
  }

  const text = rawInput.trim();

  // If text contains vCard markers, parse as vCard
  if (/BEGIN:VCARD/i.test(text)) {
    const vcfContacts = parseVCardText(text, defaultBranchId);
    if (vcfContacts.length > 0) {
      return buildParseSummary(vcfContacts);
    }
  }

  const lines = text.split(/\r?\n/);
  const contacts: ParsedDumpContact[] = [];

  // Check if first line is CSV header
  const firstLineLower = lines[0].toLowerCase();
  const hasCsvHeader = (firstLineLower.includes('name') || firstLineLower.includes('full_name')) &&
                       (firstLineLower.includes('phone') || firstLineLower.includes('mobile'));

  let startIdx = 0;
  let nameColIdx = -1;
  let phoneColIdx = -1;

  if (hasCsvHeader && lines.length > 1) {
    const headerCols = lines[0].split(/[,\t;]/).map(h => h.trim().toLowerCase());
    nameColIdx = headerCols.findIndex(h => h.includes('name'));
    phoneColIdx = headerCols.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('contact'));
    startIdx = 1;
  }

  // Iterate lines
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // If CSV header was detected, parse columns
    if (nameColIdx !== -1 && phoneColIdx !== -1) {
      const cols = line.split(/[,\t;]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length > Math.max(nameColIdx, phoneColIdx)) {
        const rawName = cols[nameColIdx] || 'Member';
        const rawPhone = cols[phoneColIdx] || '';
        const cleanPhone = normalizeIndianPhone(rawPhone);
        const route = detectBranchFromName(rawName, defaultBranchId);
        contacts.push({
          id: `line_${i}_${Date.now()}`,
          rawText: line,
          originalName: rawName,
          cleanedName: route.cleanedName,
          phone: cleanPhone,
          displayPhone: cleanPhone.length === 10 ? `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}` : rawPhone,
          isValidPhone: isValidIndianMobile(cleanPhone),
          branchId: route.branchId,
          branchName: route.branchName,
          branchCode: route.branchCode,
          matchedRule: route.matchedRule,
          matchedKeyword: route.matchedKeyword,
          confidence: route.confidence,
        });
        continue;
      }
    }

    // Otherwise, parse using smart text line extractor
    const parsed = extractContactFromTextLine(line, defaultBranchId);
    if (parsed) {
      contacts.push(parsed);
    }
  }

  // Check for multi-line block contact dump (e.g. Line 1: Name, Line 2: Phone)
  if (contacts.length === 0 && lines.length >= 2) {
    for (let i = 0; i < lines.length - 1; i += 2) {
      const nameLine = lines[i].trim();
      const phoneLine = lines[i + 1].trim();
      const cleanPhone = normalizeIndianPhone(phoneLine);
      if (nameLine && cleanPhone.length === 10 && isValidIndianMobile(cleanPhone)) {
        const route = detectBranchFromName(nameLine, defaultBranchId);
        contacts.push({
          id: `block_${i}_${Date.now()}`,
          rawText: `${nameLine} - ${phoneLine}`,
          originalName: nameLine,
          cleanedName: route.cleanedName,
          phone: cleanPhone,
          displayPhone: `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`,
          isValidPhone: true,
          branchId: route.branchId,
          branchName: route.branchName,
          branchCode: route.branchCode,
          matchedRule: route.matchedRule,
          matchedKeyword: route.matchedKeyword,
          confidence: route.confidence,
        });
      }
    }
  }

  return buildParseSummary(contacts);
}

function buildParseSummary(contacts: ParsedDumpContact[]) {
  // Deduplicate within input by phone
  const seenPhones = new Set<string>();
  contacts.forEach(c => {
    if (c.isValidPhone) {
      if (seenPhones.has(c.phone)) {
        c.duplicateStatus = 'duplicate_in_input';
      } else {
        seenPhones.add(c.phone);
        c.duplicateStatus = 'new';
      }
    }
  });

  const branchBreakdown: Record<string, number> = {
    br_nag_1: 0,
    br_bsk_3: 0,
    br_rr_2: 0,
  };

  contacts.forEach(c => {
    if (branchBreakdown[c.branchId] !== undefined) {
      branchBreakdown[c.branchId]++;
    } else {
      branchBreakdown[c.branchId] = 1;
    }
  });

  const validCount = contacts.filter(c => c.isValidPhone && c.duplicateStatus !== 'duplicate_in_input').length;
  const invalidCount = contacts.length - validCount;

  return {
    contacts,
    totalParsed: contacts.length,
    validCount,
    invalidCount,
    branchBreakdown,
  };
}
