-- B1: DROP overload cũ của submit_room_check_lean (bản KHÔNG có _items_sent_to_laundry).
-- Lý do: 2 overload cùng tên khiến PostgREST có thể chọn nhầm theo payload client →
-- mất dữ liệu "đồ gửi giặt" khi nhân viên kiểm phòng. Giữ lại bản canonical có đầy đủ tham số.

DROP FUNCTION IF EXISTS public.submit_room_check_lean(
  _room_id uuid,
  _check_type text,
  _started_at timestamp with time zone,
  _notes text,
  _photos text[],
  _items_missing jsonb,
  _items_damaged jsonb,
  _items_lost jsonb,
  _items_consumed jsonb,
  _items_replaced jsonb,
  _task_id uuid
);

-- Verify: phải còn đúng 1 overload
DO $$
DECLARE
  cnt int;
BEGIN
  SELECT count(*) INTO cnt
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'submit_room_check_lean';
  IF cnt <> 1 THEN
    RAISE EXCEPTION 'submit_room_check_lean phải còn đúng 1 overload sau migration, hiện tại: %', cnt;
  END IF;
END $$;