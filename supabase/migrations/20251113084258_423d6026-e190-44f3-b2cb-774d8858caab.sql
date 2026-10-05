-- Enable RLS on rooms table if not already enabled
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to recreate clean)
DROP POLICY IF EXISTS "Users can view rooms in their tenant" ON rooms;
DROP POLICY IF EXISTS "Users can insert rooms in their tenant" ON rooms;
DROP POLICY IF EXISTS "Users can update rooms in their tenant" ON rooms;
DROP POLICY IF EXISTS "Managers can delete rooms" ON rooms;

-- CREATE POLICY for SELECT: Users can view rooms from their tenant
CREATE POLICY "Users can view rooms in their tenant"
ON rooms
FOR SELECT
USING (
  is_super_admin() OR 
  tenant_id IN (
    SELECT tenant_id 
    FROM users 
    WHERE id = auth.uid()
  )
);

-- CREATE POLICY for INSERT: Users can create rooms in their tenant
CREATE POLICY "Users can insert rooms in their tenant"
ON rooms
FOR INSERT
WITH CHECK (
  is_super_admin() OR
  (
    tenant_id IN (
      SELECT tenant_id 
      FROM users 
      WHERE id = auth.uid()
    )
    AND hotel_id IN (
      SELECT id 
      FROM hotels 
      WHERE tenant_id IN (
        SELECT tenant_id 
        FROM users 
        WHERE id = auth.uid()
      )
    )
  )
);

-- CREATE POLICY for UPDATE: Users can update rooms in their tenant
CREATE POLICY "Users can update rooms in their tenant"
ON rooms
FOR UPDATE
USING (
  is_super_admin() OR
  tenant_id IN (
    SELECT tenant_id 
    FROM users 
    WHERE id = auth.uid()
  )
)
WITH CHECK (
  is_super_admin() OR
  tenant_id IN (
    SELECT tenant_id 
    FROM users 
    WHERE id = auth.uid()
  )
);

-- CREATE POLICY for DELETE: Managers and owners can delete rooms
CREATE POLICY "Managers can delete rooms"
ON rooms
FOR DELETE
USING (
  is_super_admin() OR
  (
    tenant_id IN (
      SELECT tenant_id 
      FROM users 
      WHERE id = auth.uid()
    )
    AND (
      EXISTS (
        SELECT 1 
        FROM users 
        WHERE id = auth.uid() 
        AND user_level_code IN ('tenant_owner', 'hotel_manager')
      )
    )
  )
);