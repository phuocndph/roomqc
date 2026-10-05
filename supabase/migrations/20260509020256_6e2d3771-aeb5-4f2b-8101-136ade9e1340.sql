ALTER TABLE public.room_checks DROP CONSTRAINT room_checks_status_check;
ALTER TABLE public.room_checks ADD CONSTRAINT room_checks_status_check
  CHECK (status = ANY (ARRAY['submitted'::text, 'reopened'::text, 'undone'::text]));