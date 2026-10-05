
-- Add guest identification columns to room_bookings
ALTER TABLE public.room_bookings 
  ADD COLUMN IF NOT EXISTS guest_id_type TEXT,
  ADD COLUMN IF NOT EXISTS guest_id_number TEXT,
  ADD COLUMN IF NOT EXISTS guest_nationality TEXT,
  ADD COLUMN IF NOT EXISTS guest_date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS guest_gender TEXT,
  ADD COLUMN IF NOT EXISTS guest_address TEXT,
  ADD COLUMN IF NOT EXISTS guest_id_image_url TEXT;

-- Create private storage bucket for guest documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('guest-documents', 'guest-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for guest-documents bucket
CREATE POLICY "Authenticated users can upload guest documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'guest-documents' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can view guest documents from same tenant"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'guest-documents'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete guest documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'guest-documents'
  AND auth.role() = 'authenticated'
);
