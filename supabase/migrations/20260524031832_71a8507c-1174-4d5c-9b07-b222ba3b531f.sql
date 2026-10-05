-- Create bucket for room check photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('room-check-photos', 'room-check-photos', true);

-- SELECT policy: tenant-based for authenticated users
CREATE POLICY "room_check_photos_tenant_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'room-check-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT (u.tenant_id)::text
    FROM users u
    WHERE u.id = auth.uid()
  )
);

-- INSERT policy: tenant-based for authenticated users
CREATE POLICY "room_check_photos_tenant_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'room-check-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT (u.tenant_id)::text
    FROM users u
    WHERE u.id = auth.uid()
  )
);

-- UPDATE policy: tenant-based for authenticated users
CREATE POLICY "room_check_photos_tenant_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'room-check-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT (u.tenant_id)::text
    FROM users u
    WHERE u.id = auth.uid()
  )
);

-- DELETE policy: tenant-based for authenticated users
CREATE POLICY "room_check_photos_tenant_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'room-check-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT (u.tenant_id)::text
    FROM users u
    WHERE u.id = auth.uid()
  )
);