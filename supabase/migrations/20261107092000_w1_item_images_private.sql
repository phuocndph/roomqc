-- W1-D7 (decided 2026-11-07): item-images becomes private. The app shows
-- these files through short-lived signed URLs (src/lib/storageImageUrl.ts);
-- stored values keep their old URL/path shape, so no row rewrite is needed.
-- Objects live under "<tenant_id>/..." (useImageUpload, FileUpload), so read
-- access follows the same tenant-folder rule as the existing write policies.

UPDATE storage.buckets SET public = false WHERE id = 'item-images';

DROP POLICY IF EXISTS "Users can read their tenant item images" ON storage.objects;
CREATE POLICY "Users can read their tenant item images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'item-images'
    AND (storage.foldername(name))[1] IN (
      SELECT u.tenant_id::text FROM public.users u WHERE u.id = auth.uid()
    )
  );

-- Report objects that sit outside a tenant folder: after this migration they
-- are readable only with the service role and need a manual move.
DO $$
DECLARE
  v_outside integer;
BEGIN
  SELECT count(*) INTO v_outside
  FROM storage.objects o
  WHERE o.bucket_id = 'item-images'
    AND NOT EXISTS (
      SELECT 1 FROM public.tenants t WHERE t.id::text = (storage.foldername(o.name))[1]
    );
  IF v_outside > 0 THEN
    RAISE NOTICE 'item-images: % object(s) are outside a tenant folder and are no longer readable by app users', v_outside;
  END IF;
END;
$$;
