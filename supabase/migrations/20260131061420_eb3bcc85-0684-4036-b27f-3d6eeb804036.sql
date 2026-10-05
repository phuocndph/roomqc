-- Xóa function deliver_stop cũ (2 tham số) để tránh conflict ambiguous function call
DROP FUNCTION IF EXISTS public.deliver_stop(uuid, uuid);