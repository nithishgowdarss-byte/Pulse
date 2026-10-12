-- ============================================================================
-- PULSE FITNESS GYM OPERATING SYSTEM - PHASE 3 SUPABASE MIGRATION SCRIPT
-- ============================================================================
-- Compatible with PostgreSQL 14+ & Supabase RLS
-- Safe, additive DDL execution (DOES NOT BREAK EXISTING TABLES)

BEGIN;

-- 1. EXTEND PROFILES & MEMBERS FOR MULTI-BRANCH SUPPORT
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    city VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    gst_number VARCHAR(50),
    logo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Default Branch if not existing
INSERT INTO public.branches (id, name, code, city, address, phone)
VALUES ('00000000-0000-0000-0000-000000000001', 'Pulse Fitness - Main HQ', 'HQ01', 'Mumbai', 'Andheri West, Mumbai, MH', '9876543210')
ON CONFLICT (code) DO NOTHING;

-- Add Branch columns to Profiles
ALTER TABLE public.profiles 
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    ADD COLUMN IF NOT EXISTS branch_name VARCHAR(255) DEFAULT 'Pulse Fitness - Main HQ',
    ADD COLUMN IF NOT EXISTS assigned_branch_ids UUID[] DEFAULT ARRAY['00000000-0000-0000-0000-000000000001']::UUID[];

-- Add Branch & Freeze columns to Members
ALTER TABLE public.members 
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    ADD COLUMN IF NOT EXISTS branch_name VARCHAR(255) DEFAULT 'Pulse Fitness - Main HQ',
    ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(50) DEFAULT 'member',
    ADD COLUMN IF NOT EXISTS freeze_info JSONB DEFAULT '{"is_frozen": false}'::jsonb;

-- 2. ADVANCED MEMBER CRM TIMELINE TABLE
CREATE TABLE IF NOT EXISTS public.crm_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id),
    type VARCHAR(50) NOT NULL, -- 'joined', 'renewed', 'payment', 'attendance', 'note', 'complaint', 'freeze', 'measurement', 'system_automation'
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    actor_name VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. LEAD MANAGEMENT MODULE TABLE
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    source VARCHAR(50) NOT NULL DEFAULT 'Walk-in', -- 'Instagram', 'Facebook', 'Google', 'Walk-in', 'Referral', 'Website'
    status VARCHAR(50) NOT NULL DEFAULT 'Cold',    -- 'Cold', 'Warm', 'Hot', 'Converted', 'Lost'
    interested_plan VARCHAR(100),
    budget NUMERIC(10,2),
    follow_up_date DATE,
    notes TEXT,
    assigned_trainer_id UUID REFERENCES public.profiles(id),
    assigned_trainer_name VARCHAR(255),
    branch_id UUID NOT NULL REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. AUTOMATION RULES & LOGS TABLES
CREATE TABLE IF NOT EXISTS public.automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    trigger_event VARCHAR(100) NOT NULL, -- 'no_attendance_7_days', 'expiry_3_days', 'expiry_1_day', 'birthday', 'lead_inactive_3_days', 'expired_winback_14_days'
    action_type VARCHAR(100) NOT NULL,   -- 'notify_trainer', 'send_whatsapp', 'mark_winback', 'flag_at_risk'
    is_enabled BOOLEAN DEFAULT TRUE,
    branch_id UUID REFERENCES public.branches(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
    rule_name VARCHAR(255) NOT NULL,
    member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    member_name VARCHAR(255),
    action_taken TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'executed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. MEMBER BODY MEASUREMENTS & FREEZE REQUESTS
CREATE TABLE IF NOT EXISTS public.member_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    weight_kg NUMERIC(5,2),
    body_fat_pct NUMERIC(5,2),
    waist_inches NUMERIC(5,2),
    chest_inches NUMERIC(5,2),
    biceps_inches NUMERIC(5,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.member_freeze_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    member_name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    branch_id UUID REFERENCES public.branches(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. GYM ANNOUNCEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.gym_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    branch_id UUID REFERENCES public.branches(id),
    device_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. INDEXES FOR HIGH-PERFORMANCE SEARCH & TIMELINE
CREATE INDEX IF NOT EXISTS idx_members_branch ON public.members(branch_id);
CREATE INDEX IF NOT EXISTS idx_members_phone ON public.members(phone);
CREATE INDEX IF NOT EXISTS idx_members_status ON public.members(status);
CREATE INDEX IF NOT EXISTS idx_crm_activities_member ON public.crm_activities(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_branch_status ON public.leads(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- 9. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_freeze_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users appropriate access
CREATE POLICY "Authenticated users view branches" ON public.branches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Super Owners manage branches" ON public.branches FOR ALL USING (auth.jwt() ->> 'role' IN ('super_owner', 'owner'));

CREATE POLICY "Users view relevant CRM activities" ON public.crm_activities FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Staff insert CRM activities" ON public.crm_activities FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Staff manage leads" ON public.leads FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Members view public announcements" ON public.gym_announcements FOR SELECT USING (true);
CREATE POLICY "Staff manage announcements" ON public.gym_announcements FOR ALL USING (auth.jwt() ->> 'role' IN ('super_owner', 'owner', 'branch_manager'));

-- 10. MSG91 VAULT SECRET ROTATION & DLT TEMPLATE TABLES
CREATE TABLE IF NOT EXISTS public.branch_sms_config (
  branch_id UUID PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  vault_secret_id UUID,
  vault_secret_name TEXT,
  previous_vault_secret_id UUID,
  previous_vault_secret_name TEXT,
  rotation_started_at TIMESTAMPTZ,
  key_created_at TIMESTAMPTZ DEFAULT NOW(),
  key_last_verified_at TIMESTAMPTZ,
  key_last_error TEXT,
  rotation_due_at TIMESTAMPTZ,
  auto_retire_previous_after TIMESTAMPTZ,
  msg91_sender_id TEXT,
  msg91_last4 TEXT,
  previous_msg91_last4 TEXT,
  is_configured BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.branch_secret_rotation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  action TEXT NOT NULL CHECK (action IN ('create', 'rotate', 'retire_previous', 'failed')),
  actor_id UUID REFERENCES public.profiles(id),
  new_last4 TEXT,
  old_last4 TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.msg91_dlt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'expiry_7d', 'expiry_3d', 'winback', 'payment_reminder',
    'stale_nudge', 'otp', 'custom'
  )),
  msg91_template_id TEXT NOT NULL,
  sender_id TEXT,
  variable_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample_body TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, purpose, msg91_template_id)
);

CREATE INDEX IF NOT EXISTS idx_dlt_templates_purpose
  ON public.msg91_dlt_templates (purpose, is_active);

ALTER TABLE public.branch_sms_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_secret_rotation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.msg91_dlt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select dlt" ON public.msg91_dlt_templates
FOR SELECT TO authenticated USING (
  branch_id IS NULL OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND (p.role = 'super_owner' OR p.branch_id = public.msg91_dlt_templates.branch_id)
  )
);

CREATE POLICY "Staff write dlt" ON public.msg91_dlt_templates
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND (
      p.role = 'super_owner' OR (p.role IN ('owner', 'branch_manager') AND p.branch_id = public.msg91_dlt_templates.branch_id)
    )
  )
);

-- ============================================================
-- 1) Balance Reminder Log & Settings
-- ============================================================

CREATE TABLE IF NOT EXISTS public.balance_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id),
  balance_due NUMERIC(12,2) NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'sms', 'email', 'call')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'failed', 'queued')),
  error_message TEXT,
  actor_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_balance_reminder_member_created
  ON public.balance_reminder_log (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_balance_reminder_branch_day
  ON public.balance_reminder_log (branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.balance_reminder_settings (
  branch_id UUID PRIMARY KEY REFERENCES public.branches(id) ON DELETE CASCADE,
  min_balance NUMERIC(12,2) NOT NULL DEFAULT 1,
  cooldown_days INT NOT NULL DEFAULT 3 CHECK (cooldown_days >= 1),
  include_expired BOOLEAN NOT NULL DEFAULT FALSE,
  max_digest_rows INT NOT NULL DEFAULT 40,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.balance_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balance_reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read balance logs" ON public.balance_reminder_log
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff insert balance logs" ON public.balance_reminder_log
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated read balance settings" ON public.balance_reminder_settings
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff update balance settings" ON public.balance_reminder_settings
FOR ALL TO authenticated USING (true);

-- Target selection function
CREATE OR REPLACE FUNCTION public.list_balance_reminder_targets(
  p_branch_id UUID DEFAULT NULL,
  p_min_balance NUMERIC DEFAULT NULL,
  p_cooldown_days INT DEFAULT NULL
)
RETURNS TABLE (
  member_id UUID,
  branch_id UUID,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  balance_due NUMERIC,
  end_date DATE,
  status TEXT,
  days_overdue INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.branch_id,
    m.full_name,
    m.phone,
    m.email,
    m.balance_due,
    m.end_date,
    m.status,
    GREATEST(
      0,
      (timezone('Asia/Kolkata', now()))::date - COALESCE(
        (SELECT MAX(p.entry_date) FROM public.payments p
         WHERE p.member_id = m.id AND p.entry_type = 'balance'),
        m.start_date,
        (timezone('Asia/Kolkata', now()))::date
      )
    )::int AS days_overdue
  FROM public.members m
  LEFT JOIN public.balance_reminder_settings s ON s.branch_id = m.branch_id
  WHERE COALESCE(s.enabled, true) = true
    AND COALESCE(m.is_archived, false) = false
    AND COALESCE(m.balance_due, 0) >= COALESCE(p_min_balance, s.min_balance, 1)
    AND (
      m.status = 'active'
      OR (COALESCE(s.include_expired, false) AND m.status = 'expired')
    )
    AND (p_branch_id IS NULL OR m.branch_id = p_branch_id)
    AND m.phone IS NOT NULL
    AND length(regexp_replace(m.phone, '\D', '', 'g')) >= 10
    AND NOT EXISTS (
      SELECT 1 FROM public.balance_reminder_log l
      WHERE l.member_id = m.id
        AND l.status = 'sent'
        AND l.created_at >= now() - make_interval(
          days => COALESCE(p_cooldown_days, s.cooldown_days, 3)
        )
    )
  ORDER BY m.balance_due DESC, m.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_balance_reminder_targets TO authenticated;

-- ============================================================
-- 2) Single Day Register Entry RPC (N / R / B)
-- ============================================================

CREATE OR REPLACE FUNCTION public.register_day_entry(
  p_entry_type TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_gender TEXT DEFAULT NULL,
  p_months INT DEFAULT NULL,
  p_freeze_days INT DEFAULT NULL,
  p_amount NUMERIC DEFAULT 0,
  p_method TEXT DEFAULT 'upi',
  p_list_price NUMERIC DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me RECORD;
  phone10 TEXT;
  member_id UUID;
  branch UUID;
  today DATE := (timezone('Asia/Kolkata', now()))::date;
  new_end DATE;
  balance NUMERIC;
  pay_id UUID;
  start_d DATE;
  list_price NUMERIC;
  cur_end DATE;
  freeze_days INT;
  sub_months INT;
  pkg_name TEXT;
  mem_status TEXT;
BEGIN
  SELECT id, role, branch_id INTO me FROM public.profiles WHERE id = auth.uid();
  IF me.id IS NULL THEN RAISE EXCEPTION 'AUTH_SESSION_MISSING'; END IF;
  IF me.role NOT IN ('super_owner', 'owner', 'branch_manager', 'trainer') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_entry_type NOT IN ('new', 'renewal', 'balance', 'freeze') THEN
    RAISE EXCEPTION 'INVALID_ENTRY_TYPE';
  END IF;
  IF p_entry_type <> 'freeze' AND (p_amount IS NULL OR p_amount < 0) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Idempotent payment replay
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, member_id INTO pay_id, member_id
    FROM public.payments WHERE idempotency_key = p_idempotency_key;
    IF pay_id IS NOT NULL THEN
      SELECT balance_due INTO balance FROM public.members WHERE id = member_id;
      RETURN jsonb_build_object(
        'member_id', member_id,
        'payment_id', pay_id,
        'entry_type', p_entry_type,
        'balance_due', balance,
        'replayed', true
      );
    END IF;
  END IF;

  phone10 := right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 10);
  IF length(phone10) <> 10 THEN RAISE EXCEPTION 'INVALID_PHONE'; END IF;

  branch := COALESCE(p_branch_id, me.branch_id);
  IF branch IS NULL AND me.role <> 'super_owner' THEN
    RAISE EXCEPTION 'BRANCH_REQUIRED';
  END IF;

  IF me.role <> 'super_owner' AND branch IS DISTINCT FROM me.branch_id THEN
    RAISE EXCEPTION 'FORBIDDEN_BRANCH';
  END IF;

  SELECT id INTO member_id
  FROM public.members
  WHERE right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = phone10
    AND COALESCE(is_archived, false) = false
    AND branch_id = branch
  ORDER BY created_at DESC
  LIMIT 1;

  list_price := COALESCE(p_list_price, p_amount, 0);

  IF p_entry_type = 'new' THEN
    IF p_months IS NULL OR p_months < 1 OR p_months > 12 THEN
      RAISE EXCEPTION 'INVALID_MONTHS';
    END IF;
    IF trim(COALESCE(p_full_name, '')) = '' THEN
      RAISE EXCEPTION 'NAME_REQUIRED';
    END IF;

    start_d := today;
    new_end := (today + (p_months || ' months')::interval)::date;
    balance := GREATEST(0, list_price - p_amount);

    IF member_id IS NULL THEN
      INSERT INTO public.members (
        full_name, phone, gender, status, branch_id,
        start_date, end_date, subscription_months,
        amount_paid, balance_due, onboarded_by
      ) VALUES (
        trim(p_full_name), phone10, p_gender, 'active', branch,
        start_d, new_end, p_months,
        p_amount, balance, me.id
      ) RETURNING id INTO member_id;
    ELSE
      UPDATE public.members SET
        full_name = trim(p_full_name),
        gender = COALESCE(p_gender, gender),
        status = 'active',
        start_date = start_d,
        end_date = new_end,
        subscription_months = p_months,
        amount_paid = COALESCE(amount_paid, 0) + p_amount,
        balance_due = balance,
        updated_at = now()
      WHERE id = member_id;
    END IF;

  ELSIF p_entry_type = 'renewal' THEN
    IF member_id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
    IF p_months IS NULL OR p_months < 1 OR p_months > 12 THEN
      RAISE EXCEPTION 'INVALID_MONTHS';
    END IF;

    SELECT end_date INTO cur_end FROM public.members WHERE id = member_id FOR UPDATE;
    start_d := CASE WHEN cur_end IS NOT NULL AND cur_end >= today THEN cur_end ELSE today END;
    new_end := (start_d + (p_months || ' months')::interval)::date;
    balance := GREATEST(0, list_price - p_amount);

    UPDATE public.members SET
      full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
      status = 'active',
      end_date = new_end,
      subscription_months = p_months,
      amount_paid = COALESCE(amount_paid, 0) + p_amount,
      balance_due = balance,
      updated_at = now()
    WHERE id = member_id;

  ELSIF p_entry_type = 'freeze' THEN
    IF member_id IS NULL THEN
      RAISE EXCEPTION 'MEMBER_NOT_FOUND';
    END IF;

    -- Fixed: exactly one month (30 days). Ignore client p_freeze_days / p_months.
    freeze_days := 30;

    SELECT
      end_date,
      subscription_months,
      lower(COALESCE(package_type, '')),
      status
    INTO cur_end, sub_months, pkg_name, mem_status
    FROM public.members
    WHERE id = member_id
    FOR UPDATE;

    IF mem_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'CANNOT_FREEZE_INACTIVE';
    END IF;

    IF cur_end IS NULL OR cur_end < today THEN
      RAISE EXCEPTION 'CANNOT_FREEZE_EXPIRED';
    END IF;

    -- Annual package only (12 months or package name contains annual/year)
    IF NOT (
      COALESCE(sub_months, 0) = 12
      OR pkg_name LIKE '%annual%'
      OR pkg_name LIKE '%year%'
    ) THEN
      RAISE EXCEPTION 'FREEZE_ANNUAL_ONLY';
    END IF;

    new_end := (cur_end + (freeze_days || ' days')::interval)::date;

    UPDATE public.members SET
      end_date = new_end,
      notes = trim(concat_ws(' ', notes, '[Frozen 30d (Annual) on ' || today::text || ']')),
      updated_at = now()
    WHERE id = member_id
    RETURNING balance_due INTO balance;

  ELSE
    -- B: balance collection only
    IF member_id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
    IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

    UPDATE public.members SET
      balance_due = GREATEST(0, COALESCE(balance_due, 0) - p_amount),
      amount_paid = COALESCE(amount_paid, 0) + p_amount,
      updated_at = now()
    WHERE id = member_id
    RETURNING balance_due INTO balance;
  END IF;

  IF p_amount > 0 THEN
    INSERT INTO public.payments (
      member_id, branch_id, amount, method,
      entry_type, entry_date, recorded_by, notes, idempotency_key
    ) VALUES (
      member_id, branch, p_amount, lower(p_method),
      p_entry_type, today, me.id, p_notes, p_idempotency_key
    )
    RETURNING id INTO pay_id;
  END IF;

  RETURN jsonb_build_object(
    'member_id', member_id,
    'payment_id', pay_id,
    'entry_type', p_entry_type,
    'balance_due', balance,
    'end_date', new_end,
    'freeze_days', CASE WHEN p_entry_type = 'freeze' THEN freeze_days ELSE NULL END,
    'replayed', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_day_entry TO authenticated;

-- Fast eligibility check for UI phone validation
CREATE OR REPLACE FUNCTION public.member_freeze_eligible(
  p_phone TEXT,
  p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  phone10 TEXT;
  today DATE := (timezone('Asia/Kolkata', now()))::date;
  m RECORD;
  is_annual BOOLEAN;
  projected_end DATE;
BEGIN
  phone10 := right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 10);
  IF length(phone10) <> 10 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'INVALID_PHONE');
  END IF;

  SELECT id, full_name, end_date, subscription_months, lower(COALESCE(package_type, '')) AS pkg, status
  INTO m
  FROM public.members
  WHERE right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10) = phone10
    AND COALESCE(is_archived, false) = false
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
  ORDER BY created_at DESC
  LIMIT 1;

  IF m.id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'MEMBER_NOT_FOUND');
  END IF;

  IF m.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'NOT_ACTIVE', 'member_id', m.id);
  END IF;

  IF m.end_date IS NULL OR m.end_date < today THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'EXPIRED', 'member_id', m.id, 'end_date', m.end_date);
  END IF;

  is_annual := (COALESCE(m.subscription_months, 0) = 12 OR m.pkg LIKE '%annual%' OR m.pkg LIKE '%year%');
  IF NOT is_annual THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'reason', 'NOT_ANNUAL',
      'member_id', m.id,
      'full_name', m.full_name,
      'subscription_months', m.subscription_months
    );
  END IF;

  projected_end := (m.end_date + '30 days'::interval)::date;

  RETURN jsonb_build_object(
    'eligible', true,
    'member_id', m.id,
    'full_name', m.full_name,
    'current_end_date', m.end_date,
    'projected_end_date', projected_end,
    'freeze_days', 30
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.member_freeze_eligible TO authenticated;

-- ==============================================================================
-- STAFF ATTENDANCE & EXPORT LOGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  checked_out_at timestamptz,
  method text NOT NULL DEFAULT 'manual'
    CHECK (method IN ('qr', 'manual', 'owner_override')),
  notes text,
  recorded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_day
  ON public.staff_attendance (staff_id, checked_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_branch_day
  ON public.staff_attendance (branch_id, checked_in_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_open_shift
  ON public.staff_attendance (staff_id)
  WHERE checked_out_at IS NULL;

CREATE TABLE IF NOT EXISTS public.export_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type text NOT NULL DEFAULT 'members_csv',
  row_count integer NOT NULL DEFAULT 0,
  branch_id uuid REFERENCES public.branches(id),
  exported_by uuid REFERENCES public.profiles(id),
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.staff_check_in(
  p_staff_id uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_method text DEFAULT 'manual',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
DECLARE
  me record;
  target uuid;
  branch uuid;
  row_id uuid;
BEGIN
  SELECT id, role, branch_id INTO me FROM profiles WHERE id = auth.uid();
  IF me.id IS NULL THEN RAISE EXCEPTION 'AUTH_SESSION_MISSING'; END IF;

  target := COALESCE(p_staff_id, me.id);

  IF target IS DISTINCT FROM me.id
     AND me.role NOT IN ('super_owner', 'owner', 'branch_manager') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT branch_id INTO branch FROM profiles WHERE id = target;
  branch := COALESCE(p_branch_id, branch, me.branch_id);
  IF branch IS NULL THEN RAISE EXCEPTION 'BRANCH_REQUIRED'; END IF;

  IF me.role IN ('owner', 'branch_manager')
     AND me.role <> 'super_owner'
     AND me.branch_id IS DISTINCT FROM branch THEN
    RAISE EXCEPTION 'FORBIDDEN_BRANCH';
  END IF;

  IF EXISTS (
    SELECT 1 FROM staff_attendance
    WHERE staff_id = target AND checked_out_at IS NULL
  ) THEN
    RAISE EXCEPTION 'ALREADY_CHECKED_IN';
  END IF;

  INSERT INTO staff_attendance (
    staff_id, branch_id, checked_in_at, method, notes, recorded_by
  ) VALUES (
    target,
    branch,
    now(),
    COALESCE(p_method, 'manual'),
    p_notes,
    me.id
  )
  RETURNING id INTO row_id;

  RETURN jsonb_build_object(
    'id', row_id,
    'staff_id', target,
    'branch_id', branch,
    'checked_in_at', now()
  );
END;
$;

CREATE OR REPLACE FUNCTION public.staff_check_out(
  p_staff_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
DECLARE
  me record;
  target uuid;
  open_row staff_attendance%ROWTYPE;
BEGIN
  SELECT id, role, branch_id INTO me FROM profiles WHERE id = auth.uid();
  IF me.id IS NULL THEN RAISE EXCEPTION 'AUTH_SESSION_MISSING'; END IF;

  target := COALESCE(p_staff_id, me.id);

  IF target IS DISTINCT FROM me.id
     AND me.role NOT IN ('super_owner', 'owner', 'branch_manager') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO open_row
  FROM staff_attendance
  WHERE staff_id = target AND checked_out_at IS NULL
  ORDER BY checked_in_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_OPEN_SHIFT';
  END IF;

  IF me.role IN ('owner', 'branch_manager')
     AND me.role <> 'super_owner'
     AND me.branch_id IS DISTINCT FROM open_row.branch_id THEN
    RAISE EXCEPTION 'FORBIDDEN_BRANCH';
  END IF;

  UPDATE staff_attendance SET
    checked_out_at = now(),
    notes = CASE
      WHEN p_notes IS NULL THEN notes
      WHEN notes IS NULL THEN p_notes
      ELSE notes || ' | ' || p_notes
    END
  WHERE id = open_row.id;

  RETURN jsonb_build_object(
    'id', open_row.id,
    'staff_id', target,
    'checked_in_at', open_row.checked_in_at,
    'checked_out_at', now()
  );
END;
$;

GRANT EXECUTE ON FUNCTION public.staff_check_in TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_check_out TO authenticated;

COMMIT;
