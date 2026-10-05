DROP POLICY IF EXISTS "Active campaigns are viewable by authenticated users" ON public.marketing_campaigns;

CREATE POLICY "Super admins manage marketing campaigns"
ON public.marketing_campaigns
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));