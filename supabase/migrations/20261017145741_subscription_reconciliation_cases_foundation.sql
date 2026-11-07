-- A2 first slice: an operational notebook, NEVER a payment/entitlement command.
-- Private storage has no Data API grants; live support RPCs are the only entry.
CREATE TABLE private.subscription_reconciliation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL UNIQUE,
  tenant_id uuid NOT NULL,
  invoice_id uuid,
  source_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status='open'),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscription_reconciliation_cases_tenant_idx
  ON private.subscription_reconciliation_cases(tenant_id,created_at DESC,id DESC);
CREATE TABLE private.subscription_reconciliation_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES private.subscription_reconciliation_cases(id),
  version integer NOT NULL CHECK (version>0),
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create','note')),
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 2000),
  before_state jsonb,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id,version),
  UNIQUE(actor_id,request_id)
);
CREATE TABLE private.subscription_reconciliation_case_receipts (
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL,
  arguments jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_id)
);
ALTER TABLE private.subscription_reconciliation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.subscription_reconciliation_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.subscription_reconciliation_case_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.subscription_reconciliation_cases,
  private.subscription_reconciliation_case_events,
  private.subscription_reconciliation_case_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.require_reconciliation_case_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor uuid;
BEGIN
  v_actor := public.platform_support_actor();
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=v_actor
    AND u.email_confirmed_at IS NOT NULL
    AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN
    RAISE EXCEPTION 'ACTIVE_SUPPORT_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN v_actor;
END;
$fn$;
REVOKE ALL ON FUNCTION private.require_reconciliation_case_actor()
  FROM PUBLIC,anon,authenticated,service_role;

-- Prevent accidental privileged UPDATE/DELETE/TRUNCATE as well as browser edits.
-- PostgreSQL owners can still ALTER/DROP objects; this is not cryptographic WORM.
CREATE FUNCTION private.reject_reconciliation_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  RAISE EXCEPTION 'RECONCILIATION_HISTORY_IMMUTABLE' USING ERRCODE='42501';
END;
$fn$;
REVOKE ALL ON FUNCTION private.reject_reconciliation_history_mutation()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER reconciliation_case_events_immutable
  BEFORE UPDATE OR DELETE ON private.subscription_reconciliation_case_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_reconciliation_history_mutation();
CREATE TRIGGER reconciliation_case_events_no_truncate
  BEFORE TRUNCATE ON private.subscription_reconciliation_case_events
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_reconciliation_history_mutation();
CREATE TRIGGER reconciliation_case_receipts_immutable
  BEFORE UPDATE OR DELETE ON private.subscription_reconciliation_case_receipts
  FOR EACH ROW EXECUTE FUNCTION private.reject_reconciliation_history_mutation();
CREATE TRIGGER reconciliation_case_receipts_no_truncate
  BEFORE TRUNCATE ON private.subscription_reconciliation_case_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_reconciliation_history_mutation();

CREATE FUNCTION public.admin_subscription_reconciliation_case(
  p_payment_id uuid, p_before_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_case private.subscription_reconciliation_cases%ROWTYPE;
  v_source jsonb;
  v_events jsonb;
  v_more boolean;
BEGIN
  PERFORM private.require_reconciliation_case_actor();
  IF p_payment_id IS NULL OR (p_before_version IS NOT NULL AND p_before_version<1) THEN
    RAISE EXCEPTION 'INVALID_CASE_PARAMETERS' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_build_object('id',p.id,'tenant_id',p.tenant_id,
    'can_create',p.payment_status IN ('pending','completed')) INTO v_source
    FROM public.payment_transactions p WHERE p.id=p_payment_id;
  SELECT * INTO v_case FROM private.subscription_reconciliation_cases WHERE payment_id=p_payment_id;
  -- Preserve access to evidence if a legacy source disappears. No cascade deletes.
  IF v_source IS NULL AND v_case.id IS NOT NULL THEN
    v_source := jsonb_build_object('id',v_case.payment_id,'tenant_id',v_case.tenant_id,'can_create',false);
  END IF;
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'CASE_SOURCE_NOT_FOUND' USING ERRCODE='PT404';
  END IF;
  IF v_case.id IS NOT NULL AND v_case.tenant_id::text<>(v_source->>'tenant_id') THEN
    RAISE EXCEPTION 'CASE_SOURCE_CHANGED_TENANT' USING ERRCODE='PT409';
  END IF;
  WITH page AS (
    SELECT e.*,row_number() OVER(ORDER BY version DESC) AS rn
    FROM private.subscription_reconciliation_case_events e
    WHERE e.case_id=v_case.id AND (p_before_version IS NULL OR e.version<p_before_version)
    ORDER BY version DESC LIMIT 51
  ) SELECT COALESCE(jsonb_agg(to_jsonb(page)-'rn' ORDER BY version DESC)
      FILTER(WHERE rn<=50),'[]'::jsonb),COALESCE(bool_or(rn>50),false)
    INTO v_events,v_more FROM page;
  RETURN jsonb_build_object('source',v_source,'case',CASE WHEN v_case.id IS NOT NULL THEN to_jsonb(v_case) END,
    'events',v_events,'has_more',v_more,'checked_at',now(),
    'next_before_version',CASE WHEN v_more THEN (v_events->49->>'version')::integer END);
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_subscription_reconciliation_case(uuid,integer)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_subscription_reconciliation_case(uuid,integer) TO authenticated;

CREATE FUNCTION public.admin_mutate_subscription_reconciliation_case(
  p_payment_id uuid, p_request_id uuid, p_action text, p_note text,
  p_expected_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_actor uuid;
  v_args jsonb;
  v_receipt private.subscription_reconciliation_case_receipts%ROWTYPE;
  v_case private.subscription_reconciliation_cases%ROWTYPE;
  v_payment public.payment_transactions%ROWTYPE;
  v_snapshot jsonb;
  v_before jsonb;
  v_created boolean := false;
  v_result jsonb;
BEGIN
  v_actor := private.require_reconciliation_case_actor();
  IF p_payment_id IS NULL OR p_request_id IS NULL OR p_action IS NULL
    OR p_action NOT IN ('create','note') OR p_note IS NULL
    OR char_length(btrim(p_note)) NOT BETWEEN 1 AND 2000
    OR (p_action='create' AND p_expected_version IS NOT NULL)
    OR (p_action='note' AND (p_expected_version IS NULL OR p_expected_version<1)) THEN
    RAISE EXCEPTION 'INVALID_CASE_COMMAND' USING ERRCODE='22023';
  END IF;
  v_args := jsonb_build_object('payment_id',p_payment_id,'action',p_action,
    'note',btrim(p_note),'expected_version',p_expected_version);
  -- Lock receipt first, then case: a fixed order and transaction-scoped locks.
  PERFORM pg_advisory_xact_lock(hashtextextended('reconciliation-case-request:'||v_actor::text||':'||p_request_id::text,0));
  SELECT * INTO v_receipt FROM private.subscription_reconciliation_case_receipts
    WHERE actor_id=v_actor AND request_id=p_request_id;
  IF FOUND THEN
    IF v_receipt.arguments IS DISTINCT FROM v_args THEN
      RAISE EXCEPTION 'CASE_REQUEST_ID_REUSED' USING ERRCODE='PT409';
    END IF;
    RETURN v_receipt.result;
  END IF;
  IF p_action='create' THEN
    -- Never accept tenant, invoice, amount, status or provider payload from client.
    SELECT * INTO v_payment FROM public.payment_transactions WHERE id=p_payment_id FOR SHARE;
    IF NOT FOUND OR v_payment.tenant_id IS NULL THEN
      RAISE EXCEPTION 'CASE_SOURCE_NOT_FOUND' USING ERRCODE='PT404';
    END IF;
    SELECT * INTO v_case FROM private.subscription_reconciliation_cases WHERE payment_id=p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
      IF v_payment.payment_status NOT IN ('pending','completed') THEN
        RAISE EXCEPTION 'CASE_SOURCE_NOT_ELIGIBLE' USING ERRCODE='PT409';
      END IF;
      SELECT jsonb_build_object('captured_at',now(),'payment_status',v_payment.payment_status,
        'amount',v_payment.amount,'currency',v_payment.currency,
        'invoice_status',CASE WHEN i.tenant_id=v_payment.tenant_id THEN i.status END,
        'invoice_same_tenant',COALESCE(i.tenant_id=v_payment.tenant_id,false))
        INTO v_snapshot FROM (SELECT 1) seed LEFT JOIN public.invoices i ON i.id=v_payment.invoice_id;
      INSERT INTO private.subscription_reconciliation_cases(payment_id,tenant_id,invoice_id,source_snapshot,created_by)
        VALUES(p_payment_id,v_payment.tenant_id,
          CASE WHEN (v_snapshot->>'invoice_same_tenant')::boolean THEN v_payment.invoice_id END,
          v_snapshot,v_actor)
        ON CONFLICT(payment_id) DO NOTHING RETURNING * INTO v_case;
      v_created := FOUND;
      IF NOT v_created THEN
        SELECT * INTO v_case FROM private.subscription_reconciliation_cases WHERE payment_id=p_payment_id FOR UPDATE;
      END IF;
    END IF;
    IF v_case.tenant_id<>v_payment.tenant_id THEN
      RAISE EXCEPTION 'CASE_SOURCE_CHANGED_TENANT' USING ERRCODE='PT409';
    END IF;
  ELSE
    SELECT * INTO v_case FROM private.subscription_reconciliation_cases WHERE payment_id=p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CASE_NOT_FOUND' USING ERRCODE='PT404';
    END IF;
    IF EXISTS(SELECT 1 FROM public.payment_transactions p WHERE p.id=p_payment_id AND p.tenant_id<>v_case.tenant_id) THEN
      RAISE EXCEPTION 'CASE_SOURCE_CHANGED_TENANT' USING ERRCODE='PT409';
    END IF;
    IF v_case.version<>p_expected_version THEN
      RAISE EXCEPTION 'CASE_VERSION_CONFLICT' USING ERRCODE='PT409';
    END IF;
    v_before := to_jsonb(v_case);
    UPDATE private.subscription_reconciliation_cases SET version=version+1,updated_at=now()
      WHERE id=v_case.id RETURNING * INTO v_case;
  END IF;
  IF v_created OR p_action='note' THEN
    INSERT INTO private.subscription_reconciliation_case_events
      (case_id,version,actor_id,request_id,action,note,before_state,after_state)
      VALUES(v_case.id,v_case.version,v_actor,p_request_id,p_action,btrim(p_note),v_before,to_jsonb(v_case));
  END IF;
  v_result := jsonb_build_object('case',to_jsonb(v_case),'created',v_created);
  INSERT INTO private.subscription_reconciliation_case_receipts(actor_id,request_id,arguments,result)
    VALUES(v_actor,p_request_id,v_args,v_result);
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_mutate_subscription_reconciliation_case(uuid,uuid,text,text,integer)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.admin_mutate_subscription_reconciliation_case(uuid,uuid,text,text,integer) TO authenticated;
COMMENT ON TABLE private.subscription_reconciliation_cases IS
  'Operational case only; no settlement. One retained case per payment, immutable source snapshot. No browser DML.';
NOTIFY pgrst,'reload schema';
