-- Enable realtime for room_checks table so Group Checkout can receive updates immediately
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_checks;