export type UserRole = 'super_owner' | 'owner' | 'branch_manager' | 'trainer' | 'member';

export interface Branch {
  id: string;
  name: string;
  code: string;
  city: string;
  address: string;
  phone: string;
  email?: string;
  gst_number?: string;
  logo_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone: string;
  email?: string;
  avatar?: string;
  gym_name: string;
  branch_id?: string;
  branch_name?: string;
  assigned_branch_ids?: string[];
  created_at: string;
}

export type MemberStatus = 'pending' | 'active' | 'expired' | 'cancelled';

export type MemberLifecycleStage = 
  | 'lead' 
  | 'walk_in' 
  | 'trial' 
  | 'member' 
  | 'active' 
  | 'inactive' 
  | 'renewal_due' 
  | 'expired' 
  | 'win_back' 
  | 'cancelled' 
  | 'archived';

export type PlanPackage = 'General Gym' | 'Personal Training (PT)' | 'Cardio & HIIT Special' | 'VIP Annual Membership' | 'Student Plan';

export type PaymentMethod = 'Cash' | 'UPI / GPay / PhonePe' | 'Card' | 'Bank Transfer';

export interface MemberFreezeInfo {
  is_frozen: boolean;
  freeze_start?: string;
  freeze_end?: string;
  reason?: string;
}

export interface Member {
  id: string;
  full_name: string;
  phone: string; // Clean normalized 10-digit
  raw_phone?: string;
  age?: number;
  gender?: 'Male' | 'Female' | 'Other' | 'Prefer not to say';
  email?: string;
  emergency_contact?: string;
  notes?: string;
  status: MemberStatus;
  lifecycle_stage?: MemberLifecycleStage;
  subscription_months?: number;
  package_type?: PlanPackage;
  payment_method?: PaymentMethod;
  amount_paid?: number;
  balance_due?: number;
  payment_reference?: string;
  commission_rate?: number; // percentage (e.g. 10%)
  commission_amount?: number; // stored calculated currency value
  start_date?: string; // YYYY-MM-DD
  end_date?: string;   // YYYY-MM-DD
  onboarded_by: string; // trainer profile id
  trainer_name?: string;
  branch_id: string;
  branch_name?: string;
  freeze_info?: MemberFreezeInfo;
  is_archived?: boolean;
  archived_at?: string;
  archived_by?: string;
  qr_code_id?: string;
  auto_debit_enabled?: boolean;
  razorpay_subscription_id?: string;
  next_billing_date?: string;
  mandate_status?: 'active' | 'paused' | 'cancelled' | 'failed' | null;
  last_retention_outreach_at?: string;
  created_at: string;
  updated_at: string;
}

export type CRMActivityType = 
  | 'joined' 
  | 'renewed' 
  | 'payment' 
  | 'attendance' 
  | 'package_change' 
  | 'note' 
  | 'complaint' 
  | 'freeze' 
  | 'measurement' 
  | 'file' 
  | 'system_automation' 
  | 'whatsapp_sent'
  | 'stage_change';

export interface CRMActivity {
  id: string;
  member_id: string;
  branch_id?: string;
  type: CRMActivityType;
  title: string;
  description: string;
  actor_name: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export type LeadSource = 'Instagram' | 'Facebook' | 'Google' | 'Walk-in' | 'Referral' | 'Website' | 'Campaign';

export type LeadStatus = 'Cold' | 'Warm' | 'Hot' | 'Converted' | 'Lost';

export interface Lead {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  interested_plan?: string;
  budget?: number;
  follow_up_date?: string;
  notes?: string;
  assigned_trainer_id?: string;
  assigned_trainer_name?: string;
  branch_id: string;
  branch_name?: string;
  created_at: string;
  updated_at?: string;
}

export type AutomationTrigger = 
  | 'no_attendance_7_days' 
  | 'expiry_3_days' 
  | 'expiry_1_day' 
  | 'birthday' 
  | 'lead_inactive_3_days' 
  | 'expired_winback_14_days';

export type AutomationAction = 
  | 'notify_trainer' 
  | 'send_whatsapp' 
  | 'mark_winback' 
  | 'flag_at_risk';

export type AutomationLogRecord = AutomationLog;
export type AuditLogRecord = AuditLog;

export interface AutomationRule {
  id: string;
  name: string;
  trigger_event: AutomationTrigger;
  action_type: AutomationAction;
  is_enabled: boolean;
  branch_id?: string;
  created_at: string;
}

export interface AutomationLog {
  id: string;
  rule_id: string;
  rule_name: string;
  member_id?: string;
  member_name?: string;
  action_taken: string;
  status: 'executed' | 'failed';
  created_at: string;
}

export type Permission = 
  | 'members.view' 
  | 'members.create' 
  | 'members.edit' 
  | 'members.export' 
  | 'members.transfer' 
  | 'payments.manage' 
  | 'analytics.view' 
  | 'branches.manage' 
  | 'leads.manage' 
  | 'automations.manage' 
  | 'settlements.manage'
  | 'audit.view';

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value?: any;
  new_value?: any;
  branch_id?: string;
  device_info?: string;
  details?: string;
  created_at: string;
}

export interface MemberFreezeRequest {
  id: string;
  member_id: string;
  member_name: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  branch_id?: string;
  created_at: string;
}

export interface MemberMeasurement {
  id: string;
  member_id: string;
  date: string;
  weight_kg?: number;
  body_fat_pct?: number;
  waist_inches?: number;
  chest_inches?: number;
  biceps_inches?: number;
  notes?: string;
  created_at: string;
}

export interface GymAnnouncement {
  id: string;
  branch_id?: string;
  title: string;
  content: string;
  author_name: string;
  category: 'general' | 'offer' | 'event' | 'maintenance';
  created_at: string;
}

export interface PaymentRecord {
  id: string;
  member_id: string;
  amount: number;
  payment_method: PaymentMethod | string;
  payment_reference?: string;
  entry_type?: 'new' | 'renewal' | 'balance' | 'freeze';
  entry_date?: string;
  idempotency_key?: string;
  list_price?: number;
  balance_after?: number;
  branch_id?: string;
  notes?: string;
  received_by: string;
  received_by_name?: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  member_id: string;
  member_name?: string;
  member_package?: string;
  checked_in_at: string;
  checked_out_at?: string;
  checked_in_by: string;
  checked_in_by_name?: string;
  branch_id?: string;
  branch_name?: string;
  method: 'qr' | 'manual' | 'biometric' | 'manual_override';
  notes?: string;
}

export interface ExportLogRecord {
  id: string;
  exported_by: string;
  exported_by_name?: string;
  export_type: 'vcf' | 'csv' | 'clipboard';
  filter_used: string;
  member_count: number;
  branch_id?: string;
  created_at: string;
}

export interface MemberRiskScore {
  id: string;
  member_id: string;
  branch_id?: string;
  risk_score: number; // 0 - 100
  risk_level: 'low' | 'medium' | 'high';
  reasons: string[];
  calculated_at: string;
}

export interface RetentionAlert {
  id: string;
  member_id: string;
  branch_id?: string;
  alert_type: 'at_risk' | 'no_show' | 'expiry_soon' | 'balance_due' | 'auto_debit_failed';
  severity: 'medium' | 'high';
  message: string;
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  member?: {
    id: string;
    full_name: string;
    phone: string;
    end_date?: string;
    balance_due?: number;
    package_type?: string;
  };
}

export interface AutoDebitAttempt {
  id: string;
  member_id: string;
  branch_id?: string;
  amount: number;
  status: 'success' | 'failed' | 'pending';
  razorpay_payment_id?: string;
  failure_reason?: string;
  attempted_at: string;
}

export interface RetentionOutreachLog {
  id: string;
  member_id: string;
  branch_id?: string;
  alert_id?: string;
  channel: 'whatsapp' | 'sms' | 'email';
  status: 'sent' | 'failed' | 'skipped';
  message_body: string;
  provider_response?: any;
  error_message?: string;
  reply_received?: boolean;
  reply_text?: string;
  replied_at?: string;
  sent_at: string;
}

export interface StaffNotification {
  id: string;
  user_id: string;
  branch_id?: string;
  type: 'member_reply' | 'high_risk' | 'auto_debit_failed' | 'expiry_alert' | 'system';
  title: string;
  body: string;
  member_id?: string;
  is_read: boolean;
  created_at: string;
}

export interface CommissionSettlement {
  id: string;
  trainer_id: string;
  trainer_name?: string;
  member_id?: string;
  member_name?: string;
  member_phone?: string;
  branch_id?: string;
  branch_name?: string;
  payment_id?: string;
  amount: number;
  total_commission?: number;
  rate_percent?: number;
  base_amount?: number;
  package_type?: string;
  period_start?: string;
  period_end?: string;
  period_month: string; // YYYY-MM-01
  status: 'pending' | 'paid' | 'void';
  paid_at?: string;
  paid_by?: string;
  notes?: string;
  created_at: string;
}

export interface ContactExportResult {
  totalProcessed: number;
  addedCount: number;
  skippedDuplicatesCount: number;
  skippedMembers: Array<{ name: string; phone: string; reason: string }>;
  vcardContent: string;
  filename: string;
}

export interface PackageConfig {
  name: PlanPackage;
  pricePerMonth: number;
  defaultCommissionRate: number; // %
  description: string;
}

export interface GymStats {
  totalMembers: number;
  activeMembers: number;
  pendingMembers: number;
  expiredMembers: number;
  archivedMembers: number;
  expiringIn7Count: number;
  expiringIn15Count: number;
  expiringIn30Count: number;
  joinsToday: number;
  joinsThisWeek: number;
  totalRevenue: number;
  totalBalanceDue: number;
  pendingCommissionsTotal: number;
  todayAttendanceCount: number;
  trainerStats: Array<{
    trainerId: string;
    trainerName: string;
    clientCount: number;
    revenue: number;
    commissionEarned: number;
    commissionPaid: number;
    commissionPending: number;
  }>;
}

export interface ChurnFactor {
  key: string;
  weight: number;
  days?: number;
  days_left?: number;
  amount?: number;
}

export interface MemberChurnPrediction {
  member_id: string;
  branch_id?: string;
  branch_name?: string;
  member_name?: string;
  member_phone?: string;
  member_email?: string;
  package_type?: string;
  end_date?: string;
  balance_due?: number;
  churn_probability: number;
  risk_band: 'low' | 'medium' | 'high' | 'critical';
  factors: ChurnFactor[];
  model_version: string;
  predicted_at: string;
}

export interface WinbackCampaign {
  id: string;
  name: string;
  min_probability: number;
  channels: ('whatsapp' | 'sms' | 'email')[];
  max_attempts: number;
  cooldown_hours: number;
  is_active: boolean;
  created_at: string;
}

export interface WinbackEnrollment {
  id: string;
  campaign_id: string;
  campaign_name?: string;
  member_id: string;
  branch_id?: string;
  branch_name?: string;
  status: 'enrolled' | 'messaged' | 'responded' | 'converted' | 'exhausted' | 'suppressed' | 'failed';
  attempt_count: number;
  last_channel?: string;
  last_error?: string;
  last_attempt_at?: string;
  converted_at?: string;
  churn_probability?: number;
  created_at: string;
  updated_at: string;
  member?: {
    id: string;
    full_name: string;
    phone: string;
    email?: string;
    status: string;
    end_date?: string;
    balance_due?: number;
    branch_name?: string;
    package_type?: string;
  };
}

export interface WinbackAttempt {
  id: string;
  enrollment_id: string;
  member_id?: string;
  member_name?: string;
  member_phone?: string;
  channel: 'whatsapp' | 'sms' | 'email' | string;
  status: 'sent' | 'failed' | 'skipped';
  error_message?: string;
  provider_id?: string;
  created_at: string;
}

export interface PayrollSettlementLine {
  settlement_id: string;
  period_month: string;
  branch_id: string;
  branch_name: string;
  trainer_id: string;
  trainer_name: string;
  member_id?: string;
  member_name?: string;
  member_phone?: string;
  payment_id?: string;
  base_amount: number;
  rate_percent: number;
  commission_amount: number;
  package_type: string;
  status: 'pending' | 'paid' | 'void';
  notes?: string;
  created_at: string;
  paid_at?: string;
  paid_by?: string;
  paid_by_name?: string;
}

export interface BalanceReminderLog {
  id: string;
  member_id: string;
  member_name?: string;
  member_phone?: string;
  branch_id?: string | null;
  branch_name?: string;
  balance_due: number;
  channel: 'whatsapp' | 'sms' | 'email' | 'call';
  status: 'sent' | 'skipped' | 'failed' | 'queued';
  outcome?: 'promised' | 'paid' | 'no_answer' | 'wont_pay' | 'wrong_number' | null;
  promised_date?: string | null;
  error_message?: string | null;
  actor_id?: string | null;
  actor_name?: string;
  created_at: string;
}

export interface BalanceReminderSettings {
  branch_id: string;
  min_balance: number;
  cooldown_days: number;
  include_expired: boolean;
  max_digest_rows: number;
  enabled: boolean;
  updated_at: string;
}

export interface BalanceReminderTarget {
  member_id: string;
  branch_id?: string | null;
  branch_name?: string;
  full_name: string;
  phone: string;
  email?: string | null;
  balance_due: number;
  end_date?: string | null;
  status: string;
  days_overdue: number;
  last_reminded_at?: string | null;
  last_reminder_at?: string | null;
  last_channel?: string | null;
  promised_date?: string | null;
  package_type?: string;
  last_payment_date?: string;
}

export interface SalesTotalsData {
  day: number;
  week: number;
  month: number;
}

export interface ShiftCloseTotalsData {
  day: string;
  upi: number;
  cash: number;
  card: number;
  bank_transfer: number;
  adjusted: number;
  total: number;
  n_count: number;
  r_count: number;
  b_count: number;
  f_count: number;
}

export interface DayRegisterEntry {
  id: string; // payment id or entry id
  row_number?: number;
  member_id: string;
  full_name: string;
  phone: string;
  gender?: string;
  entry_type: 'new' | 'renewal' | 'balance' | 'freeze';
  entry_date: string;
  start_date?: string;
  end_date?: string;
  duration_months?: number;
  months?: number;
  freeze_days?: number;
  list_price?: number;
  amount_paid?: number;
  amount: number;
  balance_due?: number;
  balance_after?: number;
  payment_method: string;
  branch_id?: string;
  branch_name?: string;
  recorded_by?: string;
  recorded_by_name?: string;
  notes?: string;
  created_at: string;
}

export interface DayRegisterSummary {
  date: string;
  total_entries?: number;
  new_joins_count?: number;
  renewals_count?: number;
  balance_collections_count?: number;
  freezes_count?: number;
  new_count?: number;
  renewal_count?: number;
  balance_count?: number;
  freeze_count?: number;
  total_collected: number;
  total_balance_created?: number;
  total_balance_generated?: number;
  upi_total?: number;
  cash_total?: number;
  card_total?: number;
  upi_collected?: number;
  cash_collected?: number;
  card_collected?: number;
  bank_transfer_collected?: number;
}

export type StaffAttendanceMethod = 'qr' | 'manual' | 'owner_override';

export interface StaffAttendance {
  id: string;
  staff_id: string;
  branch_id: string;
  checked_in_at: string;
  checked_out_at?: string | null;
  method: StaffAttendanceMethod;
  notes?: string | null;
  recorded_by?: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
    role: UserRole;
    avatar?: string;
  };
}

export interface MemberCsvRow {
  full_name: string;
  phone: string | null;
  email?: string | null;
  gender?: string | null;
  status?: string | null;
  end_date?: string | null;
  balance_due?: number | null;
  package_type?: string | null;
  branch_name?: string | null;
}

export interface MemberExportFilter {
  branchId?: string | null;
  status?: string | null; // active | expired | pending | all
  expiringWithinDays?: number | null;
  balanceOnly?: boolean;
  search?: string;
}

export interface ExportLog {
  id: string;
  export_type: string;
  row_count: number;
  branch_id?: string | null;
  exported_by?: string | null;
  meta?: any;
  created_at: string;
}

// FreeLLMAPI Router & Gym Intelligence Types
export type LLMProviderId = 'gemini' | 'groq' | 'cerebras' | 'mistral' | 'openrouter' | 'github';

export interface FreeLLMProviderStatus {
  id: LLMProviderId;
  name: string;
  badge: string;
  models: string[];
  defaultModel: string;
  isAvailable: boolean;
  priority: number;
  hasCustomKey: boolean;
  latencyMs?: number;
  freeTierDesc: string;
  rpmLimit: number;
  tpmLimit: number;
  lastTested?: string;
  status: 'healthy' | 'degraded' | 'unconfigured' | 'rate_limited';
}

export interface FreeLLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface FreeLLMFailoverHop {
  attemptedProvider: LLMProviderId;
  model: string;
  reason: string;
  timestamp: string;
}

export interface FreeLLMCompletionResponse {
  id: string;
  provider: LLMProviderId;
  model: string;
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  failoverHistory?: FreeLLMFailoverHop[];
  latencyMs: number;
  costEstimatedSavedUsd: number;
}

export interface FreeLLMStats {
  totalRequests: number;
  totalTokens: number;
  averageLatencyMs: number;
  totalCostSavedUsd: number;
  failoversCount: number;
  activeProvider: LLMProviderId;
  lastRequestAt?: string;
}

export interface FreeLLMGymWorkoutPlan {
  id: string;
  title: string;
  goal: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  daysPerWeek: number;
  schedule: {
    day: string;
    focus: string;
    warmup: string[];
    exercises: {
      name: string;
      sets: number;
      reps: string;
      rpeOrRest: string;
      notes?: string;
    }[];
    cooldown: string[];
  }[];
  trainerTips: string[];
  generatedBy: string;
  modelUsed: string;
  providerUsed: string;
  createdAt: string;
}

export interface FreeLLMGymDietPlan {
  id: string;
  title: string;
  dietaryPreference: 'Vegetarian' | 'Non-Vegetarian' | 'Eggetarian' | 'Vegan';
  targetCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatsGrams: number;
  hydrationGoalLitres: number;
  meals: {
    mealTime: string;
    name: string;
    options: string[];
    calories: number;
    proteinGrams: number;
  }[];
  guidelines: string[];
  generatedBy: string;
  modelUsed: string;
  providerUsed: string;
  createdAt: string;
}




