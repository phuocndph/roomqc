
-- Server-side enforcement: photo_evidence_mode cho INSERT room_checks (full path)
-- Phase 2 RoomCheck — ngăn ngừa client bypass
CREATE OR REPLACE FUNCTION public.enforce_room_check_photos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode text;
  v_photo_count int;
  v_has_issues boolean;
BEGIN
  -- Lấy mode của hotel (qua room_id)
  SELECT h.photo_evidence_mode
    INTO v_mode
  FROM rooms r
  JOIN hotels h ON h.id = r.hotel_id
  WHERE r.id = NEW.room_id;

  -- Mặc định 'none' nếu null
  v_mode := COALESCE(v_mode, 'none');

  IF v_mode = 'none' THEN
    RETURN NEW;
  END IF;

  v_photo_count := COALESCE(array_length(NEW.photos, 1), 0);

  -- Mode 'always': mọi check đều cần ≥1 ảnh
  IF v_mode = 'always' AND v_photo_count = 0 THEN
    RAISE EXCEPTION 'photo_required: Khách sạn yêu cầu chụp ảnh bằng chứng cho mọi lần kiểm phòng'
      USING ERRCODE = 'P0001';
  END IF;

  -- Mode 'on_issue': có sự cố damaged/lost/missing thì cần ảnh
  IF v_mode = 'on_issue' THEN
    v_has_issues :=
      (NEW.items_damaged IS NOT NULL AND jsonb_array_length(COALESCE(NEW.items_damaged, '[]'::jsonb)) > 0)
      OR (NEW.items_lost IS NOT NULL AND jsonb_array_length(COALESCE(NEW.items_lost, '[]'::jsonb)) > 0)
      OR (NEW.items_missing IS NOT NULL AND jsonb_array_length(COALESCE(NEW.items_missing, '[]'::jsonb)) > 0);

    IF v_has_issues AND v_photo_count = 0 THEN
      RAISE EXCEPTION 'photo_required: Phòng có sự cố — cần ít nhất 1 ảnh bằng chứng'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_room_check_photos ON public.room_checks;
CREATE TRIGGER trg_enforce_room_check_photos
  BEFORE INSERT ON public.room_checks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_room_check_photos();

COMMENT ON FUNCTION public.enforce_room_check_photos() IS
  'Phase 2 RoomCheck: enforce photo evidence theo hotels.photo_evidence_mode. Mode none=skip, always=mọi check, on_issue=khi có damaged/lost/missing.';
