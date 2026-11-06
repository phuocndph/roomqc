-- W1 remediation: Storage tenant, role and live-session isolation.
-- Keep paths tenant-prefixed; deny all authenticated Storage operations for
-- inactive/locked/deleted actors and sessions that are no longer valid.

UPDATE storage.buckets
SET public = false
WHERE id = 'room-check-photos';

-- Backups are restricted to live owners/super-admins of the path tenant.
DROP POLICY IF EXISTS "Admins can upload backups" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view backups" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete backups" ON storage.objects;

CREATE POLICY "w1_backups_live_tenant_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'backups'
  AND private.business_actor_is_live()
  AND EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE u.id = (SELECT auth.uid())
      AND ur.role::text IN ('owner', 'super_admin')
      AND u.tenant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "w1_backups_live_tenant_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'backups'
  AND private.business_actor_is_live()
  AND EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE u.id = (SELECT auth.uid())
      AND ur.role::text IN ('owner', 'super_admin')
      AND u.tenant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "w1_backups_live_tenant_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'backups'
  AND private.business_actor_is_live()
  AND EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE u.id = (SELECT auth.uid())
      AND ur.role::text IN ('owner', 'super_admin')
      AND u.tenant_id::text = (storage.foldername(name))[1]
  )
);

-- Guest documents remain tenant-scoped, but now require a live actor/session.
DROP POLICY IF EXISTS "guest_documents_tenant_select" ON storage.objects;
DROP POLICY IF EXISTS "guest_documents_tenant_insert" ON storage.objects;
DROP POLICY IF EXISTS "guest_documents_tenant_delete" ON storage.objects;

CREATE POLICY "w1_guest_documents_live_tenant_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'guest-documents'
  AND private.business_actor_is_live()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.tenant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "w1_guest_documents_live_tenant_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'guest-documents'
  AND private.business_actor_is_live()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.tenant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "w1_guest_documents_live_tenant_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'guest-documents'
  AND private.business_actor_is_live()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.tenant_id::text = (storage.foldername(name))[1]
  )
);

-- Room-check photos must never be readable through an unsigned public URL.
DROP POLICY IF EXISTS "room_check_photos_tenant_select" ON storage.objects;
DROP POLICY IF EXISTS "room_check_photos_tenant_insert" ON storage.objects;
DROP POLICY IF EXISTS "room_check_photos_tenant_update" ON storage.objects;
DROP POLICY IF EXISTS "room_check_photos_tenant_delete" ON storage.objects;

CREATE POLICY "w1_room_check_photos_live_tenant_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'room-check-photos'
  AND private.business_actor_is_live()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.tenant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "w1_room_check_photos_live_tenant_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'room-check-photos'
  AND private.business_actor_is_live()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.tenant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "w1_room_check_photos_live_tenant_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'room-check-photos'
  AND private.business_actor_is_live()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.tenant_id::text = (storage.foldername(name))[1]
  )
)
WITH CHECK (
  bucket_id = 'room-check-photos'
  AND private.business_actor_is_live()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.tenant_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "w1_room_check_photos_live_tenant_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'room-check-photos'
  AND private.business_actor_is_live()
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.tenant_id::text = (storage.foldername(name))[1]
  )
);
