-- Enable RLS on user_levels table
ALTER TABLE public.user_levels ENABLE ROW LEVEL SECURITY;

-- Allow only authenticated users to view user levels (reference data)
CREATE POLICY "Authenticated users can view user levels" ON public.user_levels
FOR SELECT TO authenticated USING (true);

-- Prevent any modifications - this is a system reference table
-- No INSERT, UPDATE, DELETE policies = no one can modify via API