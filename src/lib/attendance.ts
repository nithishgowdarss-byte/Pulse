import { Member, AttendanceRecord } from '../types';

/**
 * Generates a stable QR payload string for a member
 */
export function generateMemberQrPayload(member: Member): string {
  return `PULSE:MEMBER:${member.id}:${member.phone}`;
}

/**
 * Verifies and parses scanned QR payload
 */
export function verifyQrPayload(payload: string): { memberId: string; phone?: string } | null {
  if (!payload || !payload.startsWith('PULSE:MEMBER:')) {
    // Also support scanning direct member ID string or raw phone string
    if (payload.startsWith('mem_')) {
      return { memberId: payload };
    }
    return null;
  }

  const parts = payload.split(':');
  if (parts.length >= 3) {
    return {
      memberId: parts[2],
      phone: parts[3] || undefined
    };
  }
  return null;
}

/**
 * Computes check-ins for today
 */
export function getTodayAttendanceCount(attendanceList: AttendanceRecord[]): number {
  const todayStr = new Date().toISOString().slice(0, 10);
  return attendanceList.filter(a => a.checked_in_at.startsWith(todayStr)).length;
}

/**
 * Returns attendance history for a specific member
 */
export function getAttendanceForMember(attendanceList: AttendanceRecord[], memberId: string): AttendanceRecord[] {
  return attendanceList
    .filter(a => a.member_id === memberId)
    .sort((a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime());
}

/**
 * Formats check-in timestamp for display
 */
export function formatAttendanceTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return isoString;
  }
}
