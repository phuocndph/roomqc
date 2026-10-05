
-- Create hotel-logos storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('hotel-logos', 'hotel-logos', true);

-- Allow anyone to view hotel logos (public bucket)
CREATE POLICY "Hotel logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'hotel-logos');

-- Allow authenticated users to upload logos for their tenant
CREATE POLICY "Tenant users can upload hotel logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'hotel-logos'
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update their uploads
CREATE POLICY "Tenant users can update hotel logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'hotel-logos'
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete hotel logos
CREATE POLICY "Tenant users can delete hotel logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'hotel-logos'
  AND auth.role() = 'authenticated'
);
