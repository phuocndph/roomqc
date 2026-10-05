-- Add INSERT policy for in_app_notifications to allow users to create notifications
CREATE POLICY "Users can insert notifications for their tenant"
ON public.in_app_notifications
FOR INSERT
WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND user_level_code = 'super_admin')
);

-- Also add a policy to allow service role / edge functions to insert
CREATE POLICY "Service role can insert notifications"
ON public.in_app_notifications
FOR INSERT
WITH CHECK (true);