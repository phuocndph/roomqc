
-- Sprint 1A — D9 + hotel_policy index + items review reason

-- 1. issue_role enum
DO $$ BEGIN
  CREATE TYPE public.issue_role AS ENUM ('primary_issue','derived_action');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Convert column issue_role text -> enum (default primary_issue)
ALTER TABLE public.room_check_issues
  ALTER COLUMN issue_role DROP DEFAULT;

ALTER TABLE public.room_check_issues
  ALTER COLUMN issue_role TYPE public.issue_role
  USING (
    CASE
      WHEN issue_role IN ('primary_issue','derived_action') THEN issue_role::public.issue_role
      ELSE 'primary_issue'::public.issue_role
    END
  );

ALTER TABLE public.room_check_issues
  ALTER COLUMN issue_role SET DEFAULT 'primary_issue'::public.issue_role,
  ALTER COLUMN issue_role SET NOT NULL;

-- 3. Bổ sung các cột nghiệp vụ cho room_check_issues
ALTER TABLE public.room_check_issues
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS quality_issue boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retire_reason text,
  ADD COLUMN IF NOT EXISTS suspicious boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS charge_status public.charge_status NOT NULL DEFAULT 'not_applicable';

CREATE INDEX IF NOT EXISTS idx_rci_charge_status
  ON public.room_check_issues (hotel_id, charge_status)
  WHERE charge_status IN ('pending_manager_review','pending_fo_confirm','fo_rejected');

CREATE INDEX IF NOT EXISTS idx_rci_role
  ON public.room_check_issues (room_check_id, issue_role);

-- 4. items: lý do flag review (giúp dry-run report đầy đủ)
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS migration_review_reason text;

-- 5. hotel_policy: đảm bảo unique active per (tenant, hotel, key)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_hotel_policy_active_key'
  ) THEN
    -- Nếu cột is_active không tồn tại thì bỏ qua (đợt A đã có)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='hotel_policy' AND column_name='is_active'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX uq_hotel_policy_active_key
               ON public.hotel_policy (tenant_id, hotel_id, policy_key)
               WHERE is_active = true';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_hotel_policy_key
               ON public.hotel_policy (tenant_id, hotel_id, policy_key)';
    END IF;
  END IF;
END $$;
