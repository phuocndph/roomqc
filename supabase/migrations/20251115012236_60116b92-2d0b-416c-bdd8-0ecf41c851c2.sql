-- Prevent duplicate checks trong cùng 1 khoảng thời gian (5 phút)
-- Tạo function để check duplicate
CREATE OR REPLACE FUNCTION check_duplicate_room_check()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM room_checks
    WHERE room_id = NEW.room_id
      AND check_type = NEW.check_type
      AND checked_by = NEW.checked_by
      AND checked_at > NOW() - INTERVAL '5 minutes'
      AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'Duplicate check detected. Please wait 5 minutes before creating another check of the same type for this room.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tạo trigger
DROP TRIGGER IF EXISTS prevent_duplicate_room_checks ON room_checks;
CREATE TRIGGER prevent_duplicate_room_checks
  BEFORE INSERT ON room_checks
  FOR EACH ROW
  EXECUTE FUNCTION check_duplicate_room_check();