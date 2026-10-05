-- Create storage bucket for item images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'item-images',
  'item-images',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public Access to Item Images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload item images to their tenant" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their tenant item images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their tenant item images" ON storage.objects;

-- Policy: Anyone can view images (bucket is public)
CREATE POLICY "Public Access to Item Images"
ON storage.objects FOR SELECT
USING (bucket_id = 'item-images');

-- Policy: Authenticated users can upload images to their tenant folder
CREATE POLICY "Users can upload item images to their tenant"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'item-images' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM users WHERE id = auth.uid()
  )
);

-- Policy: Users can update their tenant's images
CREATE POLICY "Users can update their tenant item images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'item-images'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM users WHERE id = auth.uid()
  )
);

-- Policy: Users can delete their tenant's images
CREATE POLICY "Users can delete their tenant item images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'item-images'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT tenant_id::text FROM users WHERE id = auth.uid()
  )
);