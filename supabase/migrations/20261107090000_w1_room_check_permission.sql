-- W1-D4 (decided 2026-11-07): staff check rooms through a dedicated
-- "room_checks.create" permission instead of rooms:update, so checking a room
-- never implies editing room data (price, type, layout).

INSERT INTO public.permissions (code, name, description, module, action)
VALUES ('room_checks.create', 'Kiểm phòng', 'Thực hiện kiểm phòng; không cho sửa thông tin phòng', 'room_checks', 'create')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description,
      module = EXCLUDED.module, action = EXCLUDED.action, updated_at = now();

-- Default roles of every existing tenant receive the new permission.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE p.code = 'room_checks.create'
  AND r.code IN ('owner', 'hotel_manager', 'department_manager', 'staff')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- New tenants: same defaults as before plus room_checks.create.
CREATE OR REPLACE FUNCTION public.on_tenant_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM create_default_tenant_roles(NEW.id);

  -- Assign default permissions
  PERFORM assign_default_permissions_to_role(
    NEW.id, 'owner',
    ARRAY[
      'dashboard.view',
      'items.view', 'items.create', 'items.edit', 'items.delete', 'items.export',
      'rooms.view', 'rooms.create', 'rooms.edit', 'rooms.delete',
      'room_checks.create',
      'laundry.view', 'laundry.create', 'laundry.edit', 'laundry.delete',
      'maintenance.view', 'maintenance.create', 'maintenance.edit', 'maintenance.delete',
      'inventory.view', 'inventory.create', 'inventory.edit',
      'vendors.view', 'vendors.create', 'vendors.edit', 'vendors.delete',
      'purchase_orders.view', 'purchase_orders.create', 'purchase_orders.edit',
      'reports.view', 'reports.export',
      'users.view', 'users.create', 'users.edit', 'users.delete',
      'settings.view', 'settings.edit',
      'hotels.view', 'hotels.create', 'hotels.edit'
    ]
  );

  PERFORM assign_default_permissions_to_role(
    NEW.id, 'hotel_manager',
    ARRAY[
      'dashboard.view',
      'items.view', 'items.create', 'items.edit',
      'rooms.view', 'rooms.create', 'rooms.edit',
      'room_checks.create',
      'laundry.view', 'laundry.create', 'laundry.edit',
      'maintenance.view', 'maintenance.create', 'maintenance.edit',
      'inventory.view', 'inventory.create',
      'vendors.view',
      'purchase_orders.view', 'purchase_orders.create',
      'reports.view',
      'users.view'
    ]
  );

  PERFORM assign_default_permissions_to_role(
    NEW.id, 'staff',
    ARRAY[
      'dashboard.view',
      'items.view',
      'rooms.view',
      'room_checks.create',
      'laundry.view', 'laundry.create',
      'maintenance.view', 'maintenance.create',
      'inventory.view'
    ]
  );

  -- department_manager is seeded elsewhere; add the room check grant if the
  -- role exists for this tenant.
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT r.id, p.id
  FROM public.roles r
  JOIN public.permissions p ON p.code = 'room_checks.create'
  WHERE r.tenant_id = NEW.id AND r.code = 'department_manager'
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
