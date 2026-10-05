-- ============================================
-- MIGRATION: Enable RLS và Add Policies cho tất cả bảng
-- ============================================

-- 1. ITEMS TABLE
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items from their tenant"
ON items FOR SELECT
TO authenticated
USING (tenant_id IN (
  SELECT tenant_id FROM users WHERE id = auth.uid()
));

CREATE POLICY "Managers can create items"
ON items FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
    OR has_role(auth.uid(), 'department_manager')
  )
);

CREATE POLICY "Managers can update items"
ON items FOR UPDATE
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
    OR has_role(auth.uid(), 'department_manager')
  )
);

CREATE POLICY "Owners can delete items"
ON items FOR DELETE
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'hotel_manager'))
);

-- 2. ITEM_CATEGORIES TABLE
ALTER TABLE item_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view categories from their tenant"
ON item_categories FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage categories"
ON item_categories FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
  )
);

-- 3. INVENTORY_TRANSACTIONS TABLE
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transactions from their tenant"
ON inventory_transactions FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Staff can create transactions"
ON inventory_transactions FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND created_by = auth.uid()
);

CREATE POLICY "Managers can update transactions"
ON inventory_transactions FOR UPDATE
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
    OR has_role(auth.uid(), 'department_manager')
  )
);

-- 4. HOTELS TABLE
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view hotels from their tenant"
ON hotels FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Owners can manage hotels"
ON hotels FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND has_role(auth.uid(), 'owner')
);

-- 5. ROOMS TABLE
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rooms from their tenant"
ON rooms FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage rooms"
ON rooms FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
  )
);

-- 6. ROOM_ITEMS TABLE
ALTER TABLE room_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view room items"
ON room_items FOR SELECT
TO authenticated
USING (
  room_id IN (
    SELECT id FROM rooms WHERE tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Staff can manage room items"
ON room_items FOR ALL
TO authenticated
USING (
  room_id IN (
    SELECT id FROM rooms WHERE tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
);

-- 7. ROOM_TYPE_STANDARDS TABLE
ALTER TABLE room_type_standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view room standards from their tenant"
ON room_type_standards FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage room standards"
ON room_type_standards FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
  )
);

-- 8. ROOM_CHECKS TABLE
ALTER TABLE room_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view room checks"
ON room_checks FOR SELECT
TO authenticated
USING (
  room_id IN (
    SELECT id FROM rooms WHERE tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Staff can create room checks"
ON room_checks FOR INSERT
TO authenticated
WITH CHECK (
  room_id IN (
    SELECT id FROM rooms WHERE tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
  AND checked_by = auth.uid()
);

-- 9. LAUNDRY_BATCHES TABLE
ALTER TABLE laundry_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view laundry batches from their tenant"
ON laundry_batches FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Staff can manage laundry batches"
ON laundry_batches FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
    OR has_role(auth.uid(), 'department_manager')
    OR has_role(auth.uid(), 'staff')
  )
);

-- 10. LAUNDRY_BATCH_ITEMS TABLE
ALTER TABLE laundry_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view laundry batch items"
ON laundry_batch_items FOR SELECT
TO authenticated
USING (
  batch_id IN (
    SELECT id FROM laundry_batches WHERE tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Staff can manage laundry batch items"
ON laundry_batch_items FOR ALL
TO authenticated
USING (
  batch_id IN (
    SELECT id FROM laundry_batches WHERE tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
);

-- 11. LAUNDRY_VENDORS TABLE
ALTER TABLE laundry_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vendors from their tenant"
ON laundry_vendors FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage vendors"
ON laundry_vendors FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
  )
);

-- 12. MAINTENANCE_REQUESTS TABLE
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view maintenance requests from their tenant"
ON maintenance_requests FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Staff can create maintenance requests"
ON maintenance_requests FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND reported_by = auth.uid()
);

CREATE POLICY "Staff can update their maintenance requests"
ON maintenance_requests FOR UPDATE
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    reported_by = auth.uid()
    OR assigned_to = auth.uid()
    OR has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
    OR has_role(auth.uid(), 'department_manager')
  )
);

-- 13. PURCHASE_ORDERS TABLE
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view purchase orders from their tenant"
ON purchase_orders FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage purchase orders"
ON purchase_orders FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
    OR has_role(auth.uid(), 'department_manager')
  )
);

-- 14. PURCHASE_ORDER_ITEMS TABLE
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view PO items"
ON purchase_order_items FOR SELECT
TO authenticated
USING (
  po_id IN (
    SELECT id FROM purchase_orders WHERE tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Managers can manage PO items"
ON purchase_order_items FOR ALL
TO authenticated
USING (
  po_id IN (
    SELECT id FROM purchase_orders WHERE tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
    OR has_role(auth.uid(), 'department_manager')
  )
);

-- 15. NOTIFICATIONS TABLE
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their notifications"
ON notifications FOR SELECT
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (user_id = auth.uid() OR user_id IS NULL)
);

CREATE POLICY "Users can update their notifications"
ON notifications FOR UPDATE
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND user_id = auth.uid()
);

CREATE POLICY "System can create notifications"
ON notifications FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);

-- 16. ACTIVITY_LOGS TABLE (Read-only for users)
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view activity logs from their tenant"
ON activity_logs FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- 17. VENDORS TABLE
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vendors from their tenant"
ON vendors FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage vendors"
ON vendors FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
  )
);

-- 18. STOCK_ADJUSTMENTS TABLE
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stock adjustments from their tenant"
ON stock_adjustments FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Managers can manage stock adjustments"
ON stock_adjustments FOR ALL
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
    OR has_role(auth.uid(), 'department_manager')
  )
);

-- 19. STOCK_ADJUSTMENT_ITEMS TABLE
ALTER TABLE stock_adjustment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view adjustment items"
ON stock_adjustment_items FOR SELECT
TO authenticated
USING (
  adjustment_id IN (
    SELECT id FROM stock_adjustments WHERE tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
);

CREATE POLICY "Managers can manage adjustment items"
ON stock_adjustment_items FOR ALL
TO authenticated
USING (
  adjustment_id IN (
    SELECT id FROM stock_adjustments WHERE tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  )
  AND (
    has_role(auth.uid(), 'owner')
    OR has_role(auth.uid(), 'hotel_manager')
    OR has_role(auth.uid(), 'department_manager')
  )
);

-- 20. DASHBOARD_ACTIVITIES (View - Read-only)
-- Note: This is a view, RLS on underlying tables will apply

-- 21. DASHBOARD_STATS (View - Read-only)
-- Note: This is a view, RLS on underlying tables will apply

-- Grant necessary permissions
GRANT SELECT ON dashboard_activities TO authenticated;
GRANT SELECT ON dashboard_stats TO authenticated;