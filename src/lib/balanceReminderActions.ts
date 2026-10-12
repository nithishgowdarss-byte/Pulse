// src/lib/balanceReminderActions.ts
import { buildBalanceReminder, type BalanceMember } from './balanceReminder';
import { toast } from './toast';

export async function sendBalanceWhatsApp(
  member: BalanceMember,
  actorId?: string | null
) {
  const memberId = member.id || member.member_id;
  if (!memberId) throw new Error('Member ID is required');

  const built = buildBalanceReminder(member);

  try {
    const res = await fetch('/api/balance-reminders/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        member_id: memberId,
        branch_id: member.branch_id || null,
        balance_due: member.balance_due,
        channel: 'whatsapp',
        status: 'sent',
        actor_id: actorId || null,
      }),
    });

    if (!res.ok) {
      console.warn('Could not log reminder to server:', await res.text());
    }
  } catch (err) {
    console.warn('Network error logging reminder:', err);
  }

  window.open(built.href, '_blank', 'noopener,noreferrer');
  return built;
}

export async function logCallOutcome(
  memberId: string,
  branchId: string | null | undefined,
  outcome: 'paid' | 'will_pay' | 'renewed' | 'wont_renew' | 'no_answer',
  notes?: string,
  actorId?: string
) {
  try {
    const res = await fetch('/api/balance-reminders/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        member_id: memberId,
        branch_id: branchId || null,
        balance_due: 0,
        channel: 'call',
        status: outcome === 'no_answer' ? 'failed' : 'sent',
        error_message: `Call outcome: ${outcome}${notes ? ` - ${notes}` : ''}`,
        actor_id: actorId || null,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to log call outcome:', e);
    return false;
  }
}
