-- Enable realtime for room_items table
ALTER TABLE room_items REPLICA IDENTITY FULL;

-- Add room_items to realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'room_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE room_items;
  END IF;
END $$;