-- ============================================================
-- Pulse Fitness Suite: Churn Prediction, Winback Campaigns & Line-Level Payroll
-- Migration: 20260815_churn_winback_payroll.sql
-- ============================================================

-- 1) Line-level payroll / commission report
-- ============================================================

CREATE OR REPLACE VIEW payroll_settlement_lines AS
SELECT
  cs.id AS settlement_id,
  cs.period_month,
  cs.branch_id,
  b.name AS branch_name,
  cs.trainer_id,
  tr.full_name AS trainer_name,
  cs.member_id,
  m.full_name AS member_name,
  m.phone AS member_phone,
  cs.payment_id,
  cs.base_amount,
  cs.rate_percent,
  cs.amount AS commission_amount,
  cs.package_type,
  cs.status,
  cs.notes,
  cs.created_at,
  cs.paid_at,
  cs.paid_by,
  payer.full_name AS paid_by_name
FROM commission_settlements cs
LEFT JOIN branches b ON b.id = cs.branch_id
LEFT JOIN profiles tr ON tr.id = cs.trainer_id
LEFT JOIN members m ON m.id = cs.member_id
LEFT JOIN profiles payer ON payer.id = cs.paid_by;

GRANT SELECT ON payroll_settlement_lines TO authenticated;

-- Filtered query pattern for the app (RPC)
CREATE OR REPLACE FUNCTION public.get_payroll_lines(
  p_period_month date,
  p_branch_id uuid DEFAULT NULL,
  p_trainer_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS TABLE (
  settlement_id uuid,
  period_month date,
  branch_id uuid,
  branch_name text,
  trainer_id uuid,
  trainer_name text,
  member_id uuid,
  member_name text,
  member_phone text,
  payment_id uuid,
  base_amount numeric,
  rate_percent numeric,
  commission_amount numeric,
  package_type text,
  status text,
  notes text,
  created_at timestamptz,
  paid_at timestamptz,
  paid_by_name text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    l.settlement_id,
    l.period_month,
    l.branch_id,
    l.branch_name,
    l.trainer_id,
    l.trainer_name,
    l.member_id,
    l.member_name,
    l.member_phone,
    l.payment_id,
    l.base_amount,
    l.rate_percent,
    l.commission_amount,
    l.package_type,
    l.status,
    l.notes,
    l.created_at,
    l.paid_at,
    l.paid_by_name
  FROM payroll_settlement_lines l
  WHERE l.period_month = p_period_month
    AND (p_branch_id IS NULL OR l.branch_id = p_branch_id)
    AND (p_trainer_id IS NULL OR l.trainer_id = p_trainer_id)
    AND (p_status IS NULL OR l.status = p_status)
  ORDER BY l.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_payroll_lines TO authenticated;

-- ============================================================
-- 2) Automated Churn Prediction Model
-- ============================================================

CREATE TABLE IF NOT EXISTS member_churn_predictions (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id),
  churn_probability numeric(5,4) NOT NULL CHECK (churn_probability >= 0 AND churn_probability <= 1),
  risk_band text NOT NULL CHECK (risk_band IN ('low', 'medium', 'high', 'critical')),
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version text NOT NULL DEFAULT 'rules_v1',
  predicted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_churn_pred_branch_band
  ON member_churn_predictions (branch_id, risk_band, churn_probability DESC);

CREATE OR REPLACE FUNCTION public.compute_churn_probability(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  last_visit timestamptz;
  days_since int;
  days_left int;
  visits_14 int;
  visits_prev_14 int;
  logit numeric := -2.2; -- base prior ~10% 
  prob numeric;
  factors jsonb := '[]'::jsonb;
  band text;
BEGIN
  SELECT id, branch_id, status, end_date, balance_due, start_date, is_archived
  INTO m FROM members WHERE id = p_member_id;

  IF NOT FOUND OR COALESCE(m.is_archived, false) OR m.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object(
      'probability', 0,
      'band', 'low',
      'factors', '[]'::jsonb
    );
  END IF;

  SELECT MAX(checked_in_at) INTO last_visit
  FROM attendance WHERE member_id = p_member_id;

  days_since := CASE
    WHEN last_visit IS NULL THEN 999
    ELSE (CURRENT_DATE - last_visit::date)
  END;

  days_left := CASE
    WHEN m.end_date IS NULL THEN 999
    ELSE (m.end_date - CURRENT_DATE)
  END;

  SELECT COUNT(*) INTO visits_14 FROM attendance
  WHERE member_id = p_member_id
    AND checked_in_at >= now() - interval '14 days';

  SELECT COUNT(*) INTO visits_prev_14 FROM attendance
  WHERE member_id = p_member_id
    AND checked_in_at >= now() - interval '28 days'
    AND checked_in_at < now() - interval '14 days';

  -- Feature contributions (log-odds style weights)
  IF last_visit IS NULL THEN
    logit := logit + 1.40;
    factors := factors || jsonb_build_array(jsonb_build_object('key','never_visited','weight',1.40));
  ELSIF days_since >= 30 THEN
    logit := logit + 1.50;
    factors := factors || jsonb_build_array(jsonb_build_object('key','stale_30d','weight',1.50,'days',days_since));
  ELSIF days_since >= 21 THEN
    logit := logit + 1.10;
    factors := factors || jsonb_build_array(jsonb_build_object('key','stale_21d','weight',1.10,'days',days_since));
  ELSIF days_since >= 14 THEN
    logit := logit + 0.80;
    factors := factors || jsonb_build_array(jsonb_build_object('key','stale_14d','weight',0.80,'days',days_since));
  END IF;

  IF visits_prev_14 >= 2 AND visits_14::numeric / visits_prev_14::numeric <= 0.5 THEN
    logit := logit + 0.90;
    factors := factors || jsonb_build_array(jsonb_build_object('key','attendance_drop','weight',0.90));
  END IF;

  IF days_left <= 0 THEN
    logit := logit + 1.60;
    factors := factors || jsonb_build_array(jsonb_build_object('key','expired','weight',1.60));
  ELSIF days_left <= 3 THEN
    logit := logit + 1.20;
    factors := factors || jsonb_build_array(jsonb_build_object('key','expiring_3d','weight',1.20,'days_left',days_left));
  ELSIF days_left <= 7 THEN
    logit := logit + 0.85;
    factors := factors || jsonb_build_array(jsonb_build_object('key','expiring_7d','weight',0.85,'days_left',days_left));
  END IF;

  IF COALESCE(m.balance_due, 0) > 0 THEN
    logit := logit + CASE
      WHEN m.balance_due >= 3000 THEN 0.70
      WHEN m.balance_due >= 1000 THEN 0.45
      ELSE 0.25
    END;
    factors := factors || jsonb_build_array(jsonb_build_object('key','dues','weight',0.45,'amount',m.balance_due));
  END IF;

  -- sigmoid
  prob := 1.0 / (1.0 + exp(-logit));
  prob := ROUND(prob::numeric, 4);

  band := CASE
    WHEN prob >= 0.75 THEN 'critical'
    WHEN prob >= 0.55 THEN 'high'
    WHEN prob >= 0.30 THEN 'medium'
    ELSE 'low'
  END;

  RETURN jsonb_build_object(
    'probability', prob,
    'band', band,
    'factors', factors,
    'branch_id', m.branch_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_churn_predictions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  pred jsonb;
  n int := 0;
BEGIN
  FOR r IN
    SELECT id FROM members
    WHERE status = 'active' AND COALESCE(is_archived, false) = false
  LOOP
    pred := public.compute_churn_probability(r.id);
    INSERT INTO member_churn_predictions (
      member_id, branch_id, churn_probability, risk_band, factors, model_version, predicted_at
    )
    VALUES (
      r.id,
      (pred->>'branch_id')::uuid,
      (pred->>'probability')::numeric,
      pred->>'band',
      COALESCE(pred->'factors', '[]'::jsonb),
      'rules_v1',
      now()
    )
    ON CONFLICT (member_id) DO UPDATE SET
      branch_id = EXCLUDED.branch_id,
      churn_probability = EXCLUDED.churn_probability,
      risk_band = EXCLUDED.risk_band,
      factors = EXCLUDED.factors,
      model_version = EXCLUDED.model_version,
      predicted_at = now();
    n := n + 1;
  END LOOP;

  RETURN jsonb_build_object('updated', n, 'at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_churn_predictions FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_churn_predictions TO service_role;

-- ============================================================
-- 3) Error-Resistant Winback Campaign Workflow
-- ============================================================

CREATE TABLE IF NOT EXISTS winback_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  min_probability numeric(5,4) NOT NULL DEFAULT 0.55,
  channels text[] NOT NULL DEFAULT ARRAY['whatsapp','sms','email'],
  max_attempts integer NOT NULL DEFAULT 3,
  cooldown_hours integer NOT NULL DEFAULT 48,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS winback_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES winback_campaigns(id),
  member_id uuid NOT NULL REFERENCES members(id),
  branch_id uuid REFERENCES branches(id),
  status text NOT NULL DEFAULT 'enrolled'
    CHECK (status IN (
      'enrolled', 'messaged', 'responded', 'converted',
      'exhausted', 'suppressed', 'failed'
    )),
  attempt_count integer NOT NULL DEFAULT 0,
  last_channel text,
  last_error text,
  last_attempt_at timestamptz,
  converted_at timestamptz,
  churn_probability numeric(5,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, member_id)
);

CREATE TABLE IF NOT EXISTS winback_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES winback_enrollments(id) ON DELETE CASCADE,
  channel text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message text,
  provider_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO winback_campaigns (name, min_probability, max_attempts, cooldown_hours)
VALUES ('Default win-back high risk', 0.55, 3, 48)
ON CONFLICT DO NOTHING;

-- Auto-Convert Trigger on Payment
CREATE OR REPLACE FUNCTION public.tg_winback_convert_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE winback_enrollments
  SET status = 'converted',
      converted_at = now(),
      updated_at = now()
  WHERE member_id = NEW.member_id
    AND status IN ('enrolled', 'messaged', 'failed');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_winback_convert_on_payment ON payments;
CREATE TRIGGER trg_winback_convert_on_payment
AFTER INSERT ON payments
FOR EACH ROW
EXECUTE FUNCTION public.tg_winback_convert_on_payment();
