import { Member, Lead, AutomationRule, AutomationLog, CRMActivity } from '../types';

export const DEFAULT_AUTOMATION_RULES: AutomationRule[] = [
  {
    id: 'rule_1',
    name: 'At-Risk Member Alert (7 Days Inactive)',
    trigger_event: 'no_attendance_7_days',
    action_type: 'flag_at_risk',
    is_enabled: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'rule_2',
    name: 'Upcoming Expiry WhatsApp (3 Days Before)',
    trigger_event: 'expiry_3_days',
    action_type: 'send_whatsapp',
    is_enabled: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'rule_3',
    name: 'Urgent Expiry Notice (1 Day Before)',
    trigger_event: 'expiry_1_day',
    action_type: 'notify_trainer',
    is_enabled: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'rule_4',
    name: 'Cold Lead Re-engagement (3 Days Unfollowed)',
    trigger_event: 'lead_inactive_3_days',
    action_type: 'notify_trainer',
    is_enabled: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'rule_5',
    name: 'Expired Member Win-back Offer (14 Days Post Expiry)',
    trigger_event: 'expired_winback_14_days',
    action_type: 'mark_winback',
    is_enabled: true,
    created_at: new Date().toISOString()
  }
];

export interface AutomationRunResult {
  evaluatedCount: number;
  triggeredCount: number;
  logs: AutomationLog[];
  crmActivities: CRMActivity[];
}

export function evaluateAutomations(
  rules: AutomationRule[],
  members: Member[],
  leads: Lead[],
  lastAttendanceMap: Record<string, string> = {} // memberId -> ISO date
): AutomationRunResult {
  const activeRules = rules.filter(r => r.is_enabled);
  const logs: AutomationLog[] = [];
  const crmActivities: CRMActivity[] = [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMs = Date.now();

  let evaluatedCount = 0;
  let triggeredCount = 0;

  for (const rule of activeRules) {
    if (rule.trigger_event === 'no_attendance_7_days') {
      const activeMembers = members.filter(m => m.status === 'active' && !m.is_archived);
      evaluatedCount += activeMembers.length;

      for (const member of activeMembers) {
        const lastAttDate = lastAttendanceMap[member.id] || member.start_date || member.created_at.slice(0, 10);
        const diffDays = Math.floor((todayMs - new Date(lastAttDate).getTime()) / (1000 * 3600 * 24));

        if (diffDays >= 7) {
          triggeredCount++;
          const actionText = `Flagged member as At-Risk due to ${diffDays} consecutive days without attendance check-in. Trainer ${member.trainer_name || 'Assigned Staff'} alerted.`;
          
          logs.push({
            id: `autolog_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            rule_id: rule.id,
            rule_name: rule.name,
            member_id: member.id,
            member_name: member.full_name,
            action_taken: actionText,
            status: 'executed',
            created_at: new Date().toISOString()
          });

          crmActivities.push({
            id: `crm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            member_id: member.id,
            branch_id: member.branch_id,
            type: 'system_automation',
            title: '⚠️ At-Risk Attendance Alert',
            description: actionText,
            actor_name: 'Automation Engine',
            created_at: new Date().toISOString()
          });
        }
      }
    } else if (rule.trigger_event === 'expiry_3_days' || rule.trigger_event === 'expiry_1_day') {
      const targetDays = rule.trigger_event === 'expiry_3_days' ? 3 : 1;
      const activeMembers = members.filter(m => m.status === 'active' && m.end_date && !m.is_archived);
      evaluatedCount += activeMembers.length;

      for (const member of activeMembers) {
        if (!member.end_date) continue;
        const endDateMs = new Date(member.end_date).getTime();
        const diffDays = Math.ceil((endDateMs - todayMs) / (1000 * 3600 * 24));

        if (diffDays === targetDays) {
          triggeredCount++;
          const actionText = rule.action_type === 'send_whatsapp'
            ? `Prepared automated WhatsApp renewal reminder template for ${member.full_name} expiring in ${diffDays} day(s).`
            : `Pushed renewal notification to ${member.trainer_name || 'Trainer'} for client ${member.full_name}.`;

          logs.push({
            id: `autolog_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            rule_id: rule.id,
            rule_name: rule.name,
            member_id: member.id,
            member_name: member.full_name,
            action_taken: actionText,
            status: 'executed',
            created_at: new Date().toISOString()
          });

          crmActivities.push({
            id: `crm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            member_id: member.id,
            branch_id: member.branch_id,
            type: 'system_automation',
            title: `🔔 Membership Expiring in ${diffDays} Day(s)`,
            description: actionText,
            actor_name: 'Automation Engine',
            created_at: new Date().toISOString()
          });
        }
      }
    } else if (rule.trigger_event === 'expired_winback_14_days') {
      const expiredMembers = members.filter(m => m.status === 'expired' && !m.is_archived);
      evaluatedCount += expiredMembers.length;

      for (const member of expiredMembers) {
        if (!member.end_date) continue;
        const diffDays = Math.floor((todayMs - new Date(member.end_date).getTime()) / (1000 * 3600 * 24));

        if (diffDays >= 14 && diffDays <= 30) {
          triggeredCount++;
          const actionText = `Tagged member for Win-back Campaign (Special 15% renewal discount code generated).`;

          logs.push({
            id: `autolog_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            rule_id: rule.id,
            rule_name: rule.name,
            member_id: member.id,
            member_name: member.full_name,
            action_taken: actionText,
            status: 'executed',
            created_at: new Date().toISOString()
          });

          crmActivities.push({
            id: `crm_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            member_id: member.id,
            branch_id: member.branch_id,
            type: 'system_automation',
            title: '🎯 Win-Back Campaign Tagged',
            description: actionText,
            actor_name: 'Automation Engine',
            created_at: new Date().toISOString()
          });
        }
      }
    } else if (rule.trigger_event === 'lead_inactive_3_days') {
      const openLeads = leads.filter(l => l.status !== 'Converted' && l.status !== 'Lost');
      evaluatedCount += openLeads.length;

      for (const lead of openLeads) {
        const createdMs = new Date(lead.created_at).getTime();
        const diffDays = Math.floor((todayMs - createdMs) / (1000 * 3600 * 24));

        if (diffDays >= 3) {
          triggeredCount++;
          const actionText = `Follow-up task escalated to ${lead.assigned_trainer_name || 'Front Desk'} for uncontacted lead ${lead.full_name} (${lead.source}).`;

          logs.push({
            id: `autolog_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            rule_id: rule.id,
            rule_name: rule.name,
            member_name: lead.full_name,
            action_taken: actionText,
            status: 'executed',
            created_at: new Date().toISOString()
          });
        }
      }
    }
  }

  return {
    evaluatedCount,
    triggeredCount,
    logs,
    crmActivities
  };
}
