-- Keep polling/early webhook reconciliation bounded as history grows.
CREATE INDEX email_deliveries_due ON public.email_deliveries(next_attempt_at) WHERE status='queued';
CREATE INDEX email_deliveries_leases ON public.email_deliveries(lease_until) WHERE status='processing';
CREATE INDEX email_provider_events_message ON public.email_provider_events(provider_id,created_at);
CREATE INDEX staff_invitations_identity ON public.staff_invitations(auth_user_id,created_at DESC);
CREATE TABLE public.email_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL, delivery_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('retry')), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_admin_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_admin_actions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.email_admin_actions TO service_role;

CREATE OR REPLACE FUNCTION public.retry_roomqc_email(p_id uuid,p_actor uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor AND is_super_admin AND status='active'
    AND NOT COALESCE(account_locked,false) AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  -- Lock/update serializes duplicate clicks. Keep the original event/provider key and attempt budget.
  UPDATE public.email_deliveries SET status='queued',error_code=NULL,next_attempt_at=now(),updated_at=now()
    WHERE id=p_id AND status='failed' AND provider_id IS NULL AND accepted_at IS NULL
      AND expires_at>now() AND attempts<5;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pgmq.send('transactional_emails',jsonb_build_object('delivery_id',p_id));
  INSERT INTO public.email_admin_actions(actor_id,delivery_id,action) VALUES(p_actor,p_id,'retry');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_roomqc_email(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_roomqc_email(uuid,uuid) TO service_role;
