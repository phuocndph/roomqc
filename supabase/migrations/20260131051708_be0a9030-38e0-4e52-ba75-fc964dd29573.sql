-- Xóa function cũ (2 tham số) để tránh ambiguous function call
DROP FUNCTION IF EXISTS public.confirm_receive_order(uuid, uuid);