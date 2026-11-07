-- W1-D6 (decided 2026-11-07): room check photos are kept per guest stay.
-- Once the stay a check belongs to has ended and 3 days pass with no feedback
-- (issue, damage/loss, compensation, pending QC), the server deletes the
-- photos. Deletion runs only on the server (edge function
-- room-check-photo-retention), never from the browser.

ALTER TABLE public.room_checks
  ADD COLUMN IF NOT EXISTS photos_purged_at timestamptz;

COMMENT ON COLUMN public.room_checks.photos_purged_at IS
  'Set when photo retention removed this check''s photos (3 days after the related stay ended without feedback).';

CREATE OR REPLACE FUNCTION private.room_check_photo_retention_candidates(p_limit integer DEFAULT 200)
RETURNS TABLE (room_check_id uuid, tenant_id uuid, photos text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT c.id, c.tenant_id, c.photos
  FROM public.room_checks c
  WHERE c.photos_purged_at IS NULL
    AND COALESCE(array_length(c.photos, 1), 0) > 0
    AND c.checked_at < now() - interval '3 days'
    -- Feedback keeps the evidence: recorded damage or loss ...
    AND COALESCE(c.items_damaged, '[]'::jsonb) IN ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb)
    AND COALESCE(c.items_lost, '[]'::jsonb) IN ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb)
    -- ... QC not settled yet ...
    AND COALESCE(c.qc_status, 'not_required') IN ('not_required', 'approved', 'force_approved')
    -- ... any issue raised on the check ...
    AND NOT EXISTS (SELECT 1 FROM public.room_check_issues i WHERE i.room_check_id = c.id)
    -- ... or a compensation request created from it.
    AND NOT EXISTS (SELECT 1 FROM public.compensation_requests cr WHERE cr.source_id = c.id)
    -- The stay this check belongs to (same room, check date inside the stay)
    -- must have ended at least 3 days ago. Checks made while the room had no
    -- guest have no stay and follow the plain 3-day rule above.
    AND NOT EXISTS (
      SELECT 1
      FROM public.room_bookings b
      WHERE b.room_id = c.room_id
        AND b.status NOT IN ('cancelled', 'no_show')
        AND (c.checked_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN b.check_in_date AND b.check_out_date
        AND (
          b.status <> 'checked_out'
          OR COALESCE(b.actual_check_out, (b.check_out_date + 1)::timestamptz) > now() - interval '3 days'
        )
    )
  ORDER BY c.checked_at
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
$$;

REVOKE ALL ON FUNCTION private.room_check_photo_retention_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.room_check_photo_retention_candidates(integer) TO service_role;

-- Public wrappers callable only with the service role (edge function).
CREATE OR REPLACE FUNCTION public.list_room_check_photo_retention_candidates(p_limit integer DEFAULT 200)
RETURNS TABLE (room_check_id uuid, tenant_id uuid, photos text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT * FROM private.room_check_photo_retention_candidates(p_limit);
$$;

REVOKE ALL ON FUNCTION public.list_room_check_photo_retention_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_room_check_photo_retention_candidates(integer) TO service_role;

-- Clears photo references after the files were removed from Storage. Only
-- rows that are still eligible are touched, so a check that gained feedback
-- between listing and marking keeps its references.
CREATE OR REPLACE FUNCTION public.mark_room_check_photos_purged(p_room_check_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.room_checks c
     SET photos = '{}'::text[],
         photos_purged_at = now(),
         updated_at = now()
   WHERE c.id = ANY (COALESCE(p_room_check_ids, '{}'::uuid[]))
     AND c.id IN (SELECT room_check_id FROM private.room_check_photo_retention_candidates(1000));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_room_check_photos_purged(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_room_check_photos_purged(uuid[]) TO service_role;

-- Daily at 02:30 Vietnam time. The command is a no-op until an operator runs
-- setup-cron-auth, which swaps in the authenticated call to the edge function.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'room-check-photo-retention-daily') THEN
    PERFORM cron.schedule('room-check-photo-retention-daily', '30 19 * * *',
      $cmd$SELECT 1 /* configured by setup-cron-auth: room-check-photo-retention */$cmd$);
  END IF;
END;
$$;
