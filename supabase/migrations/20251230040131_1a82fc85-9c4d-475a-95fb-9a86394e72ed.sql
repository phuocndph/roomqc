-- =============================================
-- PHASE 4: RLS Policies for Route/Batch/Stop System
-- =============================================

-- Storekeeper check function - using role-based check instead of position
CREATE OR REPLACE FUNCTION is_storekeeper(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Storekeepers are department_managers or higher
  -- Or users with warehouse-related roles
  SELECT 
    has_role(_user_id, 'owner'::app_role) OR
    has_role(_user_id, 'hotel_manager'::app_role) OR
    has_role(_user_id, 'department_manager'::app_role)
$$;

-- Check if user is assigned to a specific route
CREATE OR REPLACE FUNCTION is_route_assignee(_user_id uuid, _order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM distribution_orders
    WHERE id = _order_id
      AND assigned_to = _user_id
  )
$$;

-- Check if user is leader (can manage routes)
CREATE OR REPLACE FUNCTION is_distribution_leader(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    has_role(_user_id, 'owner'::app_role) OR
    has_role(_user_id, 'hotel_manager'::app_role) OR
    has_role(_user_id, 'department_manager'::app_role)
$$;

-- =============================================
-- distribution_orders policies (Route)
-- =============================================

-- Drop existing overly permissive policies if any
DROP POLICY IF EXISTS "Users can view distribution orders from their tenant" ON distribution_orders;
DROP POLICY IF EXISTS "Managers can manage distribution orders" ON distribution_orders;

-- SELECT: Leaders see all in tenant, Assignees see only their routes, Storekeepers see all
CREATE POLICY "distribution_orders_select_policy"
ON distribution_orders FOR SELECT
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    is_distribution_leader(auth.uid())
    OR is_storekeeper(auth.uid())
    OR assigned_to = auth.uid()
    OR created_by = auth.uid()
  )
);

-- INSERT: Only Leaders can create routes
CREATE POLICY "distribution_orders_insert_policy"
ON distribution_orders FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND is_distribution_leader(auth.uid())
);

-- UPDATE: Leaders and Assignees (state via RPC)
CREATE POLICY "distribution_orders_update_policy"
ON distribution_orders FOR UPDATE
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    is_distribution_leader(auth.uid())
    OR assigned_to = auth.uid()
  )
)
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);

-- DELETE: Only Leaders can cancel/delete
CREATE POLICY "distribution_orders_delete_policy"
ON distribution_orders FOR DELETE
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND is_distribution_leader(auth.uid())
);

-- =============================================
-- distribution_order_batches policies (Batch)
-- =============================================

DROP POLICY IF EXISTS "Users can view batches from their tenant" ON distribution_order_batches;
DROP POLICY IF EXISTS "Managers can manage batches" ON distribution_order_batches;

-- SELECT: Based on order access
CREATE POLICY "distribution_batches_select_policy"
ON distribution_order_batches FOR SELECT
USING (
  distribution_order_id IN (
    SELECT id FROM distribution_orders dist_ord
    WHERE dist_ord.tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
      AND (
        is_distribution_leader(auth.uid())
        OR is_storekeeper(auth.uid())
        OR dist_ord.assigned_to = auth.uid()
        OR dist_ord.created_by = auth.uid()
      )
  )
);

-- INSERT: Only Leaders
CREATE POLICY "distribution_batches_insert_policy"
ON distribution_order_batches FOR INSERT
WITH CHECK (
  distribution_order_id IN (
    SELECT id FROM distribution_orders
    WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  AND is_distribution_leader(auth.uid())
);

-- UPDATE: Storekeepers can hand over, Assignees can receive
CREATE POLICY "distribution_batches_update_policy"
ON distribution_order_batches FOR UPDATE
USING (
  distribution_order_id IN (
    SELECT id FROM distribution_orders dist_ord
    WHERE dist_ord.tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
      AND (
        is_distribution_leader(auth.uid())
        OR is_storekeeper(auth.uid())
        OR dist_ord.assigned_to = auth.uid()
      )
  )
);

-- DELETE: Only Leaders
CREATE POLICY "distribution_batches_delete_policy"
ON distribution_order_batches FOR DELETE
USING (
  distribution_order_id IN (
    SELECT id FROM distribution_orders
    WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  AND is_distribution_leader(auth.uid())
);

-- =============================================
-- distribution_order_rooms policies (Stop)
-- =============================================

DROP POLICY IF EXISTS "Users can view distribution rooms from their tenant" ON distribution_order_rooms;
DROP POLICY IF EXISTS "Managers can manage distribution rooms" ON distribution_order_rooms;

-- SELECT: Based on order access
CREATE POLICY "distribution_rooms_select_policy"
ON distribution_order_rooms FOR SELECT
USING (
  distribution_order_id IN (
    SELECT id FROM distribution_orders dist_ord
    WHERE dist_ord.tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
      AND (
        is_distribution_leader(auth.uid())
        OR is_storekeeper(auth.uid())
        OR dist_ord.assigned_to = auth.uid()
        OR dist_ord.created_by = auth.uid()
      )
  )
);

-- INSERT: Only Leaders
CREATE POLICY "distribution_rooms_insert_policy"
ON distribution_order_rooms FOR INSERT
WITH CHECK (
  distribution_order_id IN (
    SELECT id FROM distribution_orders
    WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  AND is_distribution_leader(auth.uid())
);

-- UPDATE: Assignees can update stops in their routes
CREATE POLICY "distribution_rooms_update_policy"
ON distribution_order_rooms FOR UPDATE
USING (
  distribution_order_id IN (
    SELECT id FROM distribution_orders dist_ord
    WHERE dist_ord.tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
      AND (
        is_distribution_leader(auth.uid())
        OR dist_ord.assigned_to = auth.uid()
      )
  )
);

-- DELETE: Only Leaders
CREATE POLICY "distribution_rooms_delete_policy"
ON distribution_order_rooms FOR DELETE
USING (
  distribution_order_id IN (
    SELECT id FROM distribution_orders
    WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  AND is_distribution_leader(auth.uid())
);

-- =============================================
-- distribution_order_items policies
-- =============================================

DROP POLICY IF EXISTS "Users can view distribution items from their tenant" ON distribution_order_items;
DROP POLICY IF EXISTS "Managers can manage distribution items" ON distribution_order_items;

-- SELECT: Based on room access
CREATE POLICY "distribution_items_select_policy"
ON distribution_order_items FOR SELECT
USING (
  distribution_order_room_id IN (
    SELECT dor.id FROM distribution_order_rooms dor
    JOIN distribution_orders dist_ord ON dist_ord.id = dor.distribution_order_id
    WHERE dist_ord.tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
      AND (
        is_distribution_leader(auth.uid())
        OR is_storekeeper(auth.uid())
        OR dist_ord.assigned_to = auth.uid()
        OR dist_ord.created_by = auth.uid()
      )
  )
);

-- INSERT: Only Leaders
CREATE POLICY "distribution_items_insert_policy"
ON distribution_order_items FOR INSERT
WITH CHECK (
  distribution_order_room_id IN (
    SELECT dor.id FROM distribution_order_rooms dor
    JOIN distribution_orders dist_ord ON dist_ord.id = dor.distribution_order_id
    WHERE dist_ord.tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  AND is_distribution_leader(auth.uid())
);

-- UPDATE: Assignees can confirm items
CREATE POLICY "distribution_items_update_policy"
ON distribution_order_items FOR UPDATE
USING (
  distribution_order_room_id IN (
    SELECT dor.id FROM distribution_order_rooms dor
    JOIN distribution_orders dist_ord ON dist_ord.id = dor.distribution_order_id
    WHERE dist_ord.tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
      AND (
        is_distribution_leader(auth.uid())
        OR dist_ord.assigned_to = auth.uid()
      )
  )
);

-- DELETE: Only Leaders
CREATE POLICY "distribution_items_delete_policy"
ON distribution_order_items FOR DELETE
USING (
  distribution_order_room_id IN (
    SELECT dor.id FROM distribution_order_rooms dor
    JOIN distribution_orders dist_ord ON dist_ord.id = dor.distribution_order_id
    WHERE dist_ord.tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  AND is_distribution_leader(auth.uid())
);

-- =============================================
-- Grant execute on RPC functions
-- =============================================
GRANT EXECUTE ON FUNCTION handover_batch TO authenticated;
GRANT EXECUTE ON FUNCTION receive_batch TO authenticated;
GRANT EXECUTE ON FUNCTION deliver_stop TO authenticated;
GRANT EXECUTE ON FUNCTION mark_cannot_access TO authenticated;
GRANT EXECUTE ON FUNCTION retry_stop TO authenticated;
GRANT EXECUTE ON FUNCTION return_to_stock_for_stop TO authenticated;
GRANT EXECUTE ON FUNCTION handover_stop_create_next_route TO authenticated;
GRANT EXECUTE ON FUNCTION close_route_if_complete TO authenticated;
GRANT EXECUTE ON FUNCTION is_storekeeper TO authenticated;
GRANT EXECUTE ON FUNCTION is_route_assignee TO authenticated;
GRANT EXECUTE ON FUNCTION is_distribution_leader TO authenticated;
GRANT EXECUTE ON FUNCTION check_and_update_batch_status TO authenticated;
GRANT EXECUTE ON FUNCTION check_and_update_order_status TO authenticated;