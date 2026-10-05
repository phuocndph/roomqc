-- =========================================================
-- ĐỢT B — Migration tổng hợp (role names: owner, hotel_manager, department_manager, staff, super_admin)
-- =========================================================

-- ---------- B.2: Validation trigger cho room_checks jsonb ----------
CREATE OR REPLACE FUNCTION public.validate_room_check_issue_entries()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _b text;
  _arr jsonb;
  _e jsonb;
  _allowed_roles text[] := ARRAY['primary_issue','derived_action'];
BEGIN
  FOR _b IN SELECT unnest(ARRAY[
    'items_missing','items_damaged','items_lost',
    'items_consumed','items_replaced','items_sent_to_laundry'
  ])
  LOOP
    _arr := to_jsonb(NEW)->_b;
    IF _arr IS NULL OR jsonb_typeof(_arr) <> 'array' THEN CONTINUE; END IF;

    FOR _e IN SELECT * FROM jsonb_array_elements(_arr) LOOP
      IF (_e->>'quantity') IS NULL OR (_e->>'quantity')::numeric <= 0 THEN
        RAISE EXCEPTION 'invalid_quantity:%', _b USING ERRCODE = '22023';
      END IF;
      IF _e ? 'issue_role'
         AND NOT ((_e->>'issue_role') = ANY(_allowed_roles)) THEN
        RAISE EXCEPTION 'invalid_issue_role:%:%', _b, _e->>'issue_role' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_room_check_entries ON public.room_checks;
CREATE TRIGGER trg_validate_room_check_entries
  BEFORE INSERT OR UPDATE ON public.room_checks
  FOR EACH ROW EXECUTE FUNCTION public.validate_room_check_issue_entries();

-- ---------- B.3.1: Mở rộng laundry_batches ----------
ALTER TABLE public.laundry_batches
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS partially_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS compensation_settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS compensation_settled_by uuid;

DO $$
DECLARE _con text;
BEGIN
  SELECT conname INTO _con
  FROM pg_constraint
  WHERE conrelid = 'public.laundry_batches'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.laundry_batches DROP CONSTRAINT %I', _con);
  END IF;
END $$;

ALTER TABLE public.laundry_batches
  ADD CONSTRAINT laundry_batches_status_check
  CHECK (status IN (
    'draft','delivered','washing','ready','received','stocked',
    'partially_received','compensation_needed','closed','cancelled'
  ));

CREATE INDEX IF NOT EXISTS idx_laundry_batches_compensation
  ON public.laundry_batches(hotel_id, status, partially_received_at)
  WHERE status IN ('partially_received','compensation_needed');

-- ---------- B.3.2: Chống trừ kho 2 lần ----------
CREATE OR REPLACE FUNCTION public.atomic_item_to_laundry(
  p_item_id uuid,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item record;
BEGIN
  SELECT id, hotel_id, tenant_id INTO v_item
  FROM items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found: %', p_item_id;
  END IF;
  -- LINEN POOL BRIDGE: KHÔNG trừ quantity_in_stock ở đây nữa.
  -- Stock chỉ trừ duy nhất khi laundry_batch_items INSERT
  -- (qua trigger laundry_batch_items_inventory_trigger).
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_laundry_batch_with_items(
  p_tenant_id uuid, p_hotel_id uuid, p_vendor_id uuid,
  p_delivery_date date, p_expected_return_date date,
  p_delivery_staff_id uuid, p_receiver_name text, p_notes text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_batch_id uuid;
  v_batch_code text;
  v_item record;
  v_item_data record;
  v_total_items integer := 0;
  v_total_weight numeric := 0;
  v_estimated_cost numeric := 0;
  v_vendor record;
  v_price_per_kg numeric;
  v_policy jsonb;
BEGIN
  SELECT * INTO v_vendor FROM laundry_vendors WHERE id = p_vendor_id;
  v_price_per_kg := COALESCE((v_vendor.contract_info->>'price_per_kg')::numeric, 0);

  v_batch_code := 'LB-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' ||
    lpad((floor(random() * 1000)::integer)::text, 3, '0');

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
    AS x(item_id uuid, quantity integer, weight_kg numeric, condition_note text)
  LOOP
    SELECT * INTO v_item_data FROM items WHERE id = v_item.item_id AND tenant_id = p_tenant_id;
    IF v_item_data IS NULL THEN
      RAISE EXCEPTION 'Item not found: %', v_item.item_id;
    END IF;
    IF COALESCE(v_item_data.quantity_in_stock, 0) < v_item.quantity THEN
      RAISE EXCEPTION 'Không đủ hàng trong kho cho %: Tồn kho %, Yêu cầu %',
        v_item_data.name, COALESCE(v_item_data.quantity_in_stock, 0), v_item.quantity;
    END IF;
    v_total_items := v_total_items + v_item.quantity;
    v_total_weight := v_total_weight + COALESCE(v_item.weight_kg, 0);
  END LOOP;

  v_estimated_cost := v_total_weight * v_price_per_kg;

  SELECT policy_value INTO v_policy
  FROM hotel_policy
  WHERE tenant_id = p_tenant_id
    AND hotel_id = p_hotel_id
    AND policy_key = 'laundry_compensation_after_days'
    AND is_active = true
  LIMIT 1;

  INSERT INTO laundry_batches (
    tenant_id, hotel_id, batch_code, vendor_id,
    delivery_date, expected_return_date, delivery_staff_id,
    receiver_name, notes, total_items, total_weight_kg,
    estimated_cost, status, policy_snapshot
  ) VALUES (
    p_tenant_id, p_hotel_id, v_batch_code, p_vendor_id,
    p_delivery_date, p_expected_return_date, p_delivery_staff_id,
    p_receiver_name, p_notes, v_total_items, v_total_weight,
    v_estimated_cost, 'delivered', COALESCE(v_policy, jsonb_build_object('compensation_after_days', 30))
  )
  RETURNING id INTO v_batch_id;

  -- LINEN POOL BRIDGE: chỉ INSERT batch_items.
  -- Trigger sẽ trừ stock + cộng laundry + tăng wash_cycles.
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
    AS x(item_id uuid, quantity integer, weight_kg numeric, condition_note text)
  LOOP
    INSERT INTO laundry_batch_items (
      batch_id, item_id, quantity_delivered, weight_kg, condition_note
    ) VALUES (
      v_batch_id, v_item.item_id, v_item.quantity, v_item.weight_kg, v_item.condition_note
    );
  END LOOP;

  UPDATE laundry_vendors SET
    total_orders = COALESCE(total_orders, 0) + 1,
    total_value = COALESCE(total_value, 0) + v_estimated_cost,
    updated_at = now()
  WHERE id = p_vendor_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', v_batch_id,
    'batch_code', v_batch_code,
    'total_items', v_total_items,
    'total_weight', v_total_weight,
    'estimated_cost', v_estimated_cost
  );
END;
$function$;

-- ---------- B.3.3: RPC partial receive + compensation ----------
CREATE OR REPLACE FUNCTION public.mark_batch_partially_received(
  _batch_id uuid,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_batch record;
  v_e jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch FROM laundry_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_batch.status NOT IN ('delivered','washing','ready') THEN
    RAISE EXCEPTION 'invalid_status:%', v_batch.status USING ERRCODE = 'P0001';
  END IF;

  FOR v_e IN SELECT * FROM jsonb_array_elements(_items) LOOP
    UPDATE laundry_batch_items
    SET quantity_returned = COALESCE((v_e->>'quantity_returned')::int, quantity_returned),
        quantity_lost     = COALESCE((v_e->>'quantity_lost')::int, quantity_lost),
        quantity_damaged  = COALESCE((v_e->>'quantity_damaged')::int, quantity_damaged),
        updated_at = now()
    WHERE batch_id = _batch_id
      AND item_id = (v_e->>'item_id')::uuid;
  END LOOP;

  UPDATE laundry_batches
  SET status = 'partially_received',
      partially_received_at = now(),
      updated_at = now()
  WHERE id = _batch_id;

  RETURN jsonb_build_object('ok', true, 'batch_id', _batch_id);
END $$;

CREATE OR REPLACE FUNCTION public.settle_batch_compensation(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_batch record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(v_user_id,'owner'::app_role)
       OR public.has_role(v_user_id,'hotel_manager'::app_role)
       OR public.has_role(v_user_id,'department_manager'::app_role)
       OR public.has_role(v_user_id,'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch FROM laundry_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_batch.status NOT IN ('partially_received','compensation_needed') THEN
    RAISE EXCEPTION 'invalid_status:%', v_batch.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE laundry_batches
  SET status = 'closed',
      compensation_settled_at = now(),
      compensation_settled_by = v_user_id,
      updated_at = now()
  WHERE id = _batch_id;

  RETURN jsonb_build_object('ok', true, 'batch_id', _batch_id);
END $$;

CREATE OR REPLACE FUNCTION public.mark_batches_compensation_needed()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r record;
  v_days int;
BEGIN
  FOR r IN
    SELECT lb.id, lb.partially_received_at,
           COALESCE((lb.policy_snapshot->>'compensation_after_days')::int, 30) AS days
    FROM laundry_batches lb
    WHERE lb.status = 'partially_received'
      AND lb.partially_received_at IS NOT NULL
  LOOP
    v_days := r.days;
    IF (now() - r.partially_received_at) >= make_interval(days => v_days) THEN
      UPDATE laundry_batches SET status='compensation_needed', updated_at = now()
      WHERE id = r.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('flagged', v_count, 'ran_at', now());
END $$;

-- ---------- B.4: batch_inventory + FIFO ----------
CREATE TABLE IF NOT EXISTS public.batch_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  batch_code text NOT NULL,
  quantity_initial int NOT NULL CHECK (quantity_initial > 0),
  quantity_available int NOT NULL CHECK (quantity_available >= 0),
  wash_cycles int NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_inv_fifo
  ON public.batch_inventory(tenant_id, hotel_id, item_id, received_at)
  WHERE retired_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_batch_inv_code
  ON public.batch_inventory(tenant_id, hotel_id, item_id, batch_code);

ALTER TABLE public.batch_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY bi_select ON public.batch_inventory FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM users u WHERE u.id = auth.uid()));

CREATE POLICY bi_modify_owner_manager ON public.batch_inventory FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT u.tenant_id FROM users u WHERE u.id = auth.uid())
    AND (public.has_role(auth.uid(),'owner'::app_role)
      OR public.has_role(auth.uid(),'hotel_manager'::app_role)
      OR public.has_role(auth.uid(),'department_manager'::app_role)
      OR public.has_role(auth.uid(),'super_admin'::app_role))
  )
  WITH CHECK (
    tenant_id IN (SELECT u.tenant_id FROM users u WHERE u.id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.touch_batch_inventory()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_batch_inv_touch ON public.batch_inventory;
CREATE TRIGGER trg_batch_inv_touch
  BEFORE UPDATE ON public.batch_inventory
  FOR EACH ROW EXECUTE FUNCTION public.touch_batch_inventory();

CREATE OR REPLACE FUNCTION public.create_new_linen_batch(
  _item_id uuid, _quantity int, _batch_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item record;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF _quantity <= 0 THEN RAISE EXCEPTION 'invalid_quantity' USING ERRCODE='22023'; END IF;
  IF coalesce(trim(_batch_code),'') = '' THEN
    RAISE EXCEPTION 'batch_code_required' USING ERRCODE='22023';
  END IF;

  SELECT id, tenant_id, hotel_id INTO v_item FROM items WHERE id = _item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found' USING ERRCODE='P0002'; END IF;

  IF v_item.tenant_id <> public.get_current_user_tenant_id() THEN
    RAISE EXCEPTION 'forbidden_tenant' USING ERRCODE='42501';
  END IF;

  IF NOT (public.has_role(v_user_id,'owner'::app_role)
       OR public.has_role(v_user_id,'hotel_manager'::app_role)
       OR public.has_role(v_user_id,'department_manager'::app_role)
       OR public.has_role(v_user_id,'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden_role' USING ERRCODE='42501';
  END IF;

  INSERT INTO batch_inventory(
    tenant_id, hotel_id, item_id, batch_code,
    quantity_initial, quantity_available, wash_cycles,
    received_at, created_by
  ) VALUES (
    v_item.tenant_id, v_item.hotel_id, _item_id, _batch_code,
    _quantity, _quantity, 0, now(), v_user_id
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'batch_inventory_id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.allocate_linen_fifo(
  _item_id uuid, _quantity int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining int := _quantity;
  v_take int;
  v_alloc jsonb := '[]'::jsonb;
  r record;
BEGIN
  IF _quantity <= 0 THEN RAISE EXCEPTION 'invalid_quantity' USING ERRCODE='22023'; END IF;

  FOR r IN
    SELECT id, batch_code, quantity_available, wash_cycles
    FROM batch_inventory
    WHERE item_id = _item_id
      AND retired_at IS NULL
      AND quantity_available > 0
    ORDER BY received_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(r.quantity_available, v_remaining);

    UPDATE batch_inventory
    SET quantity_available = quantity_available - v_take,
        wash_cycles = wash_cycles + 1
    WHERE id = r.id;

    v_alloc := v_alloc || jsonb_build_object(
      'batch_inventory_id', r.id,
      'batch_code', r.batch_code,
      'allocated', v_take,
      'wash_cycles_after', r.wash_cycles + 1
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', _quantity,
    'allocated_total', _quantity - v_remaining,
    'shortage', v_remaining,
    'allocations', v_alloc
  );
END $$;