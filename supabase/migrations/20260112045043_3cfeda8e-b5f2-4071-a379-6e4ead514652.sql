-- Thêm cột telegram_username vào bảng users để nhân viên lưu username Telegram cá nhân
ALTER TABLE public.users 
ADD COLUMN telegram_username TEXT;

-- Index để query nhanh
CREATE INDEX idx_users_telegram_username ON public.users(telegram_username) 
WHERE telegram_username IS NOT NULL;