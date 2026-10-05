-- Enable realtime for payment_transactions table
ALTER TABLE payment_transactions REPLICA IDENTITY FULL;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_transactions;