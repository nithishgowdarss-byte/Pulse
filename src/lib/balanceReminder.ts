// src/lib/balanceReminder.ts

export type BalanceMember = {
  id?: string;
  member_id?: string;
  full_name: string;
  phone: string | null;
  email?: string | null;
  balance_due: number;
  end_date?: string | null;
  branch_id?: string | null;
  days_overdue?: number;
};

export function phone10(phone: string | null | undefined): string | null {
  const d = String(phone || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? d : null;
}

export function isValidInPhone10(phone: string | null | undefined): boolean {
  return phone10(phone) !== null;
}

export function buildBalanceReminder(member: BalanceMember) {
  const phone = phone10(member.phone);
  if (!phone) {
    const err = new Error('INVALID_PHONE');
    (err as any).code = 'INVALID_PHONE';
    throw err;
  }

  const first =
    String(member.full_name || 'Member').trim().split(/\s+/)[0] || 'there';
  const amt = Number(member.balance_due || 0).toLocaleString('en-IN');
  const end = member.end_date
    ? ` Your membership is valid till ${member.end_date}.`
    : '';

  // Concise copy for high WhatsApp readability (< 300 chars)
  const text =
    `Hi ${first}, pending balance at Pulse Fitness is ₹${amt}.` +
    end +
    ` Please pay at the gym (UPI / Cash / Card). — Pulse Fitness`;

  return {
    phone,
    text,
    href: `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`,
    smsHref: `sms:+91${phone}?body=${encodeURIComponent(text)}`,
  };
}
