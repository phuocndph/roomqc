-- 1. Update INSERT policy to include staff
DROP POLICY IF EXISTS "Managers can insert room bookings" ON room_bookings;

CREATE POLICY "Staff and managers can insert room bookings"
ON room_bookings FOR INSERT
WITH CHECK (
  (tenant_id IN (SELECT users.tenant_id FROM users WHERE users.id = auth.uid()))
  AND (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'hotel_manager'::app_role)
    OR has_role(auth.uid(), 'department_manager'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
  )
);

-- 2. Update UPDATE policy to include staff
DROP POLICY IF EXISTS "Managers can update room bookings" ON room_bookings;

CREATE POLICY "Staff and managers can update room bookings"
ON room_bookings FOR UPDATE
USING (
  (tenant_id IN (SELECT users.tenant_id FROM users WHERE users.id = auth.uid()))
  AND (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'hotel_manager'::app_role)
    OR has_role(auth.uid(), 'department_manager'::app_role)
    OR has_role(auth.uid(), 'staff'::app_role)
  )
);