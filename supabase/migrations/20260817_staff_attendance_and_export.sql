-- Migration: Staff Attendance Table, Indexes, RLS, and RPCs
-- Date: 2026-08-17

CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  checked_out_at timestamptz,
  method text NOT NULL DEFAULT 'manual'
    CHECK (method IN ('qr', 'manual', 'owner_override')),
  notes text,
  recorded_by uuid REFERENCES public.profiles(id), -- who logged it (self or owner)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff_day
  ON public.staff_attendance (staff_id, checked_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_branch_day
  ON public.staff_attendance (branch_id, checked_in_at DESC);

-- One open shift per staff (no double open check-in)
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_open_shift
  ON public.staff_attendance (staff_id)
  WHERE checked_out_at IS NULL;

-- Export Audit Logs Table
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

DROP POLICY IF EXISTS staff_attendance_select ON public.staff_attendance;
CREATE POLICY staff_attendance_select ON public.staff_attendance
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_owner'
        OR p.id = staff_attendance.staff_id
        OR (p.role IN ('owner', 'branch_manager') AND p.branch_id = staff_attendance.branch_id)
      )
  )
);

DROP POLICY IF EXISTS staff_attendance_insert ON public.staff_attendance;
CREATE POLICY staff_attendance_insert ON public.staff_attendance
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_owner'
        OR p.id = staff_id
        OR (p.role IN ('owner', 'branch_manager') AND p.branch_id = staff_attendance.branch_id)
      )
  )
);

DROP POLICY IF EXISTS staff_attendance_update ON public.staff_attendance;
CREATE POLICY staff_attendance_update ON public.staff_attendance
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'super_owner'
        OR p.id = staff_attendance.staff_id
        OR (p.role IN ('owner', 'branch_manager') AND p.branch_id = staff_attendance.branch_id)
      )
  )
);

-- RPC: staff_check_in
CREATE OR REPLACE FUNCTION public.staff_check_in(
  p_staff_id uuid DEFAULT NULL,      -- null = self
  p_branch_id uuid DEFAULT NULL,
  p_method text DEFAULT 'manual',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me record;
  target uuid;
  branch uuid;
  row_id uuid;
BEGIN
  SELECT id, role, branch_id INTO me FROM profiles WHERE id = auth.uid();
  IF me.id IS NULL THEN RAISE EXCEPTION 'AUTH_SESSION_MISSING'; END IF;

  target := COALESCE(p_staff_id, me.id);

  -- Self always OK; owner/manager/super for others
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
$$;

-- RPC: staff_check_out
CREATE OR REPLACE FUNCTION public.staff_check_out(
  p_staff_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.staff_check_in TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_check_out TO authenticated;
