ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS inapp_booking_events boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inapp_laundry_delayed boolean NOT NULL DEFAULT true;