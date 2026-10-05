
-- Đợt 2 — Bật realtime cho các bảng còn thiếu để có thể gỡ polling refetch
-- Chỉ ADD nếu chưa có để tránh lỗi duplicate

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'room_bookings',
    'item_categories',
    'stock_adjustments',
    'user_hotels',
    'telegram_connections',
    'activity_logs',
    'maintenance_requests',
    'invoices',
    'payment_transactions',
    'tenants'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- chỉ ADD nếu bảng tồn tại và chưa nằm trong publication
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;

    -- Đảm bảo REPLICA IDENTITY FULL để event UPDATE/DELETE có đủ dữ liệu cũ
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;
