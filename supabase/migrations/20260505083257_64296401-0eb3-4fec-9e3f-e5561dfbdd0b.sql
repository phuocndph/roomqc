
-- A.1: Asset group enum
CREATE TYPE public.asset_group AS ENUM (
  'linen','consumable_free','minibar','stationery',
  'equipment_large','electronic_accessory','furniture',
  'glassware','bathroom_hardware'
);

ALTER TABLE public.items
  ADD COLUMN asset_group public.asset_group,
  ADD COLUMN migration_review_required boolean NOT NULL DEFAULT false;

CREATE INDEX idx_items_asset_group
  ON public.items(tenant_id, hotel_id, asset_group)
  WHERE asset_group IS NOT NULL;

CREATE INDEX idx_items_review_required
  ON public.items(tenant_id, hotel_id)
  WHERE migration_review_required = true;

-- A.4: Charge status enum
CREATE TYPE public.charge_status AS ENUM (
  'not_applicable','not_chargeable','pending_manager_review',
  'pending_fo_confirm','fo_rejected','chargeable_confirmed','chargeable_rejected'
);

-- A.4: Idempotency cho inventory_transactions
ALTER TABLE public.inventory_transactions
  ADD COLUMN idempotency_key_raw text,
  ADD COLUMN idempotency_key_hash text;

CREATE UNIQUE INDEX uq_inv_tx_idempotency
  ON public.inventory_transactions(tenant_id, idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

-- A.3: Hotel policy + history
CREATE TABLE public.hotel_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  policy_key text NOT NULL,
  policy_value jsonb NOT NULL,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE UNIQUE INDEX uq_hotel_policy_active_key
  ON public.hotel_policy(tenant_id, hotel_id, policy_key)
  WHERE is_active = true;

CREATE INDEX idx_hotel_policy_hotel
  ON public.hotel_policy(hotel_id, policy_key)
  WHERE is_active = true;

CREATE TABLE public.hotel_policy_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES public.hotel_policy(id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL,
  policy_key text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  old_version int,
  new_version int,
  changed_by uuid,
  changed_role text,
  change_reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotel_policy_history_lookup
  ON public.hotel_policy_history(hotel_id, policy_key, changed_at DESC);

ALTER TABLE public.hotel_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_policy_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY hp_select ON public.hotel_policy
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

CREATE POLICY hp_insert ON public.hotel_policy
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid())
    AND (public.has_role(auth.uid(), 'owner'::app_role)
         OR public.has_role(auth.uid(), 'hotel_manager'::app_role)
         OR public.has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY hp_update ON public.hotel_policy
  FOR UPDATE TO authenticated
  USING (
    tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid())
    AND (public.has_role(auth.uid(), 'owner'::app_role)
         OR public.has_role(auth.uid(), 'hotel_manager'::app_role)
         OR public.has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY hp_delete ON public.hotel_policy
  FOR DELETE TO authenticated
  USING (
    tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid())
    AND (public.has_role(auth.uid(), 'owner'::app_role)
         OR public.has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY hph_select ON public.hotel_policy_history
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = auth.uid()));

-- Trigger ghi history + bump version
CREATE OR REPLACE FUNCTION public.trg_hotel_policy_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.policy_value IS DISTINCT FROM NEW.policy_value THEN
    SELECT ur.role::text INTO v_role
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    ORDER BY CASE ur.role::text
      WHEN 'super_admin' THEN 1
      WHEN 'owner' THEN 2
      WHEN 'hotel_manager' THEN 3
      WHEN 'department_manager' THEN 4
      ELSE 5 END
    LIMIT 1;

    NEW.version := COALESCE(OLD.version, 1) + 1;
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();

    INSERT INTO public.hotel_policy_history(
      policy_id, tenant_id, hotel_id, policy_key,
      old_value, new_value, old_version, new_version,
      changed_by, changed_role, changed_at
    ) VALUES (
      NEW.id, NEW.tenant_id, NEW.hotel_id, NEW.policy_key,
      OLD.policy_value, NEW.policy_value, OLD.version, NEW.version,
      auth.uid(), v_role, now()
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hotel_policy_versioning
  BEFORE UPDATE ON public.hotel_policy
  FOR EACH ROW EXECUTE FUNCTION public.trg_hotel_policy_history();

-- Seed 8 default policy
INSERT INTO public.hotel_policy (tenant_id, hotel_id, policy_key, policy_value, description)
SELECT h.tenant_id, h.id, k.key, k.val::jsonb, k.note
FROM public.hotels h
CROSS JOIN (VALUES
  ('minibar_expiry_warning_days', '7', 'Số ngày cảnh báo trước khi minibar hết hạn'),
  ('laundry_compensation_after_days', '30', 'Số ngày chờ trước khi yêu cầu vendor đền bù lô giặt nhận thiếu'),
  ('quick_path_undo_ttl_minutes', '5', 'Số phút cho phép hoàn tác Quick Path "Phòng OK"'),
  ('draft_ttl_hours', '24', 'Số giờ giữ bản nháp kiểm phòng'),
  ('photo_required_by_issue_type',
   '{"damaged_lost":true,"missing_replace":false,"consumed_chargeable":false}',
   'Có bắt buộc chụp ảnh theo từng loại sự cố hay không'),
  ('charge_policy_by_asset_group', '{}', 'Chính sách tính tiền cho khách theo nhóm tài sản'),
  ('max_wash_cycles_by_linen_category', '{}', 'Số lần giặt tối đa theo từng loại đồ vải'),
  ('minibar_fo_reject_notify_manager', 'true', 'Khi Lễ tân từ chối charge minibar có notify Quản lý không')
) AS k(key, val, note)
ON CONFLICT DO NOTHING;

-- A.2: Preview & Apply asset group mapping
CREATE OR REPLACE FUNCTION public.preview_asset_group_mapping(
  _tenant_id uuid,
  _hotel_id uuid DEFAULT NULL
)
RETURNS TABLE(
  item_id uuid,
  item_code text,
  item_name text,
  item_type text,
  current_group public.asset_group,
  suggested_group public.asset_group,
  confidence text,
  needs_review boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND tenant_id = _tenant_id
  ) AND NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden_tenant';
  END IF;

  RETURN QUERY
  SELECT
    i.id, i.code, i.name, i.item_type::text,
    i.asset_group,
    CASE
      WHEN i.item_type = 'linen' THEN 'linen'::public.asset_group
      WHEN i.item_type = 'furniture' THEN 'furniture'::public.asset_group
      WHEN i.item_type = 'consumable' AND i.is_chargeable IS TRUE
        THEN 'minibar'::public.asset_group
      WHEN i.item_type = 'consumable' AND COALESCE(i.is_chargeable, false) = false
        THEN 'consumable_free'::public.asset_group
      WHEN i.item_type = 'equipment' AND COALESCE(i.unit_price, 0) >= 1000000
        THEN 'equipment_large'::public.asset_group
      WHEN i.item_type = 'equipment'
        THEN 'electronic_accessory'::public.asset_group
      ELSE NULL
    END,
    CASE
      WHEN i.item_type IN ('linen','furniture') THEN 'high'
      WHEN i.item_type = 'consumable' THEN 'medium'
      ELSE 'low'
    END,
    (i.item_type = 'equipment')
  FROM public.items i
  WHERE i.tenant_id = _tenant_id
    AND (_hotel_id IS NULL OR i.hotel_id = _hotel_id)
    AND i.status = 'active'
  ORDER BY i.name;
END $$;

CREATE OR REPLACE FUNCTION public.apply_asset_group_mapping(
  _tenant_id uuid,
  _hotel_id uuid DEFAULT NULL,
  _override_existing boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_affected int := 0; v_flagged int := 0; v_skipped int := 0;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'hotel_manager'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden_role';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND tenant_id = _tenant_id
  ) AND NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden_tenant';
  END IF;

  WITH preview AS (
    SELECT * FROM public.preview_asset_group_mapping(_tenant_id, _hotel_id)
  ),
  upd AS (
    UPDATE public.items i
    SET asset_group = p.suggested_group,
        migration_review_required = p.needs_review,
        updated_at = now()
    FROM preview p
    WHERE i.id = p.item_id
      AND p.suggested_group IS NOT NULL
      AND (_override_existing OR i.asset_group IS NULL)
    RETURNING i.id
  )
  SELECT COUNT(*) INTO v_affected FROM upd;

  SELECT COUNT(*) INTO v_flagged
  FROM public.items
  WHERE tenant_id = _tenant_id
    AND (_hotel_id IS NULL OR hotel_id = _hotel_id)
    AND migration_review_required = true;

  SELECT COUNT(*) INTO v_skipped
  FROM public.items i
  WHERE i.tenant_id = _tenant_id
    AND (_hotel_id IS NULL OR i.hotel_id = _hotel_id)
    AND i.asset_group IS NULL
    AND i.status = 'active';

  RETURN jsonb_build_object(
    'affected', v_affected,
    'review_required', v_flagged,
    'still_unmapped', v_skipped,
    'tenant_id', _tenant_id,
    'hotel_id', _hotel_id
  );
END $$;

-- A.5: Staff-safe view
CREATE OR REPLACE VIEW public.room_check_staff_items_view
WITH (security_invoker = true) AS
SELECT
  ri.id AS room_item_id,
  ri.room_id,
  ri.item_id,
  i.code AS item_code,
  i.name AS display_name,
  i.item_type,
  i.asset_group,
  ri.standard_quantity AS room_quantity_expected,
  ri.quantity AS room_quantity_current,
  ri.condition,
  i.tenant_id,
  i.hotel_id,
  CASE
    WHEN i.item_type = 'linen'
      AND COALESCE(i.current_wash_cycles, 0) >= COALESCE(i.max_wash_cycles, 999999)
      THEN 'replace_needed'
    WHEN ri.condition = 'damaged' THEN 'damaged'
    ELSE 'ok'
  END AS badge_label
FROM public.room_items ri
JOIN public.items i ON i.id = ri.item_id;

COMMENT ON VIEW public.room_check_staff_items_view IS
  'Đợt A.5 — Staff-safe view: ẩn unit_price, charge_price, wash_cycles, quantity_in_stock';

GRANT SELECT ON public.room_check_staff_items_view TO authenticated;
