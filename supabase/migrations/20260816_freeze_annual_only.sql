-- ============================================================================
-- FREEZE MEMBERSHIP HARDENING: ANNUAL (12-MONTH) ONLY & MAX 1 MONTH (30 DAYS)
-- ============================================================================

BEGIN;

-- 1. Helper RPC for UI phone-blur eligibility checks
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

COMMIT;
