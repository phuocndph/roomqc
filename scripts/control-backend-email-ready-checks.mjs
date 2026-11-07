import assert from 'node:assert/strict';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const invalidStates=['unconfirmed','banned','auth-deleted','profile-deleted','locked','inactive','null-status',
  'null-level','staff-role','staff-level','not-primary','null-primary','platform-profile','email-mismatch',
  'wrong-hotel','inactive-hotel','missing-hotel','owner-role-revoked'];
export function buildEmailReadyChecks({owner,emailFixtures}={}){
  for(const key of ['id','tenantId','hotelId'])assert.match(owner?.[key]??'',uuid);
  assert.equal(emailFixtures?.length,3);
  for(const fixture of emailFixtures){
    for(const key of ['id','tenantId','hotelId'])assert.match(fixture[key]??'',uuid);
    assert.match(fixture.path??'',/^\/(?:auth\/login|app\/[a-z][a-z0-9-]{2,47}\/auth\/login)$/);
  }
  const tables=['auth.users','public.users','public.user_roles','public.user_hotels','public.tenants',
    'public.hotels','public.tenant_usage','public.staff_status','public.email_deliveries','pgmq.q_transactional_emails'];
  const snapshot=`SELECT jsonb_build_object(${tables.map(table=>`'${table}',(SELECT COALESCE(jsonb_agg(v ORDER BY v::text),'[]'::jsonb) FROM (SELECT to_jsonb(t) AS v FROM ${table} t) rows)`).join(',')})`;
  return `BEGIN;
DO $checks$
DECLARE bad text; fresh_tenant uuid; fresh_hotel uuid; other_tenant uuid; other_hotel uuid;
  auth_row auth.users%ROWTYPE; profile_row public.users%ROWTYPE; fixture jsonb; delivery public.email_deliveries%ROWTYPE;
  baseline jsonb; current_state jsonb; queued_before bigint; deny_count integer:=0; positive_count integer:=0;
  expected_path text; source_trigger text;
BEGIN
  PERFORM set_config('request.jwt.claims','{}',true);
  PERFORM set_config('request.jwt.claim.role','',true);
  PERFORM set_config('roomqc.registration_provisioning','false',true);
  SELECT * INTO STRICT auth_row FROM auth.users WHERE id='${owner.id}';
  SELECT * INTO STRICT profile_row FROM public.users WHERE id='${owner.id}';
  IF profile_row.tenant_id IS DISTINCT FROM '${owner.tenantId}'::uuid
    OR profile_row.hotel_id IS DISTINCT FROM '${owner.hotelId}'::uuid THEN RAISE EXCEPTION 'EMAIL_READY_FIXTURE_BINDING'; END IF;
  SELECT pg_get_functiondef('private.queue_owner_workspace_ready()'::regprocedure) INTO source_trigger;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.users'::regclass
    AND tgfoid='private.queue_owner_workspace_ready()'::regprocedure AND tgenabled='O' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'EMAIL_READY_REAL_TRIGGER_REQUIRED'; END IF;
  -- Actual earlier HTTP registration commits must have queued exactly one message,
  -- including first INSERT before user_roles exists and session-free service calls.
  FOR fixture IN SELECT value FROM jsonb_array_elements($fixtures$${JSON.stringify(emailFixtures)}$fixtures$::jsonb) LOOP
    SELECT * INTO STRICT delivery FROM public.email_deliveries WHERE event_key='workspace-ready:'||(fixture->>'tenantId');
    IF delivery.recipient_email IS DISTINCT FROM (SELECT lower(email) FROM auth.users WHERE id=(fixture->>'id')::uuid)
      OR delivery.tenant_id IS DISTINCT FROM (fixture->>'tenantId')::uuid OR delivery.template_name<>'workspace_ready'
      OR delivery.template_data->>'path' IS DISTINCT FROM fixture->>'path'
      OR delivery.template_data->>'hotel_name' IS DISTINCT FROM (SELECT name FROM public.hotels WHERE id=(fixture->>'hotelId')::uuid)
      OR delivery.status<>'queued' OR delivery.attempts<>0
      OR (SELECT count(*) FROM pgmq.q_transactional_emails WHERE message->>'delivery_id'=delivery.id::text)<>1 THEN
      RAISE EXCEPTION 'EMAIL_READY_HTTP_REGISTRATION_QUEUE' USING ERRCODE='P4101'; END IF;
    positive_count:=positive_count+1;
  END LOOP;
  ${snapshot} INTO baseline;
  FOREACH bad IN ARRAY ARRAY['valid',${invalidStates.map(s=>`'${s}'`).join(',')},'invalid-slug'] LOOP
    BEGIN
      fresh_tenant:=gen_random_uuid(); fresh_hotel:=gen_random_uuid();
      -- Free the UNIQUE email only inside this rollback subtransaction. No old
      -- delivery/event is deleted: each test has a new tenant and new event key.
      UPDATE public.tenants SET email='retired-'||fresh_tenant::text||'@roomqc.invalid' WHERE id='${owner.tenantId}';
      INSERT INTO public.tenants(id,name,email,subscription_plan,subscription_plan_id,subscription_status,approval_status)
        SELECT fresh_tenant,'Owned email-ready fixture',auth_row.email,subscription_plan,subscription_plan_id,'trial','approved'
        FROM public.tenants WHERE id='${owner.tenantId}';
      INSERT INTO public.hotels(id,tenant_id,code,name,total_rooms,type,country,status)
        VALUES(fresh_hotel,fresh_tenant,'HTL-'||upper(substr(replace(fresh_hotel::text,'-',''),1,8)),
          'Owned email-ready hotel',3,'hotel','VN','active');
      IF EXISTS(SELECT 1 FROM public.email_deliveries WHERE event_key='workspace-ready:'||fresh_tenant::text) THEN
        RAISE EXCEPTION 'EMAIL_READY_EVENT_MUST_BE_FRESH'; END IF;
      SELECT count(*) INTO queued_before FROM pgmq.q_transactional_emails;
      expected_path:=CASE WHEN bad='invalid-slug' THEN '/auth/login' ELSE '/app/ready-fixture/auth/login' END;
      PERFORM set_config('roomqc.email_workspace_slug',CASE WHEN bad='invalid-slug' THEN 'https://outside.invalid' ELSE 'ready-fixture' END,true);
      CASE bad
        WHEN 'unconfirmed' THEN UPDATE auth.users SET email_confirmed_at=NULL WHERE id='${owner.id}';
        WHEN 'banned' THEN UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id='${owner.id}';
        WHEN 'auth-deleted' THEN UPDATE auth.users SET deleted_at=now() WHERE id='${owner.id}';
        WHEN 'owner-role-revoked' THEN DELETE FROM public.user_roles WHERE user_id='${owner.id}' AND role::text='owner';
        WHEN 'inactive-hotel' THEN UPDATE public.hotels SET status='inactive' WHERE id=fresh_hotel;
        WHEN 'wrong-hotel' THEN
          other_tenant:=gen_random_uuid();other_hotel:=gen_random_uuid();
          INSERT INTO public.tenants(id,name,email,subscription_plan,subscription_plan_id,subscription_status,approval_status)
            SELECT other_tenant,'Other owned fixture',other_tenant::text||'@roomqc.invalid',subscription_plan,subscription_plan_id,'trial','approved'
            FROM public.tenants WHERE id='${owner.tenantId}';
          INSERT INTO public.hotels(id,tenant_id,code,name,type,country,status) VALUES(other_hotel,other_tenant,
            'HTL-'||upper(substr(replace(other_hotel::text,'-',''),1,8)),'Other owned hotel','hotel','VN','active');
        ELSE NULL;
      END CASE;
      -- These are installer mutations of a real provisioned owner. All normal
      -- row/quota/protected-field triggers remain enabled; tenant never NULL.
      UPDATE public.users SET tenant_id=fresh_tenant,
        hotel_id=CASE WHEN bad='missing-hotel' THEN NULL WHEN bad='wrong-hotel' THEN other_hotel ELSE fresh_hotel END,
        status=CASE WHEN bad='null-status' THEN NULL WHEN bad='inactive' THEN 'inactive' ELSE 'active' END,
        user_level_code=CASE WHEN bad='null-level' THEN NULL WHEN bad='staff-level' THEN 'staff' ELSE 'tenant_owner' END,
        role=CASE WHEN bad='staff-role' THEN 'staff' ELSE 'owner' END,
        created_by=CASE WHEN bad='staff-level' THEN id ELSE NULL END,
        is_primary_owner=CASE WHEN bad='null-primary' THEN NULL ELSE bad<>'not-primary' END,
        is_super_admin=(bad='platform-profile'),account_locked=(bad='locked'),
        deleted_at=CASE WHEN bad='profile-deleted' THEN now() ELSE NULL END,
        email=CASE WHEN bad='email-mismatch' THEN fresh_tenant::text||'@roomqc.invalid' ELSE auth_row.email END
        WHERE id='${owner.id}';
      IF bad NOT IN ('valid','invalid-slug') THEN
        IF EXISTS(SELECT 1 FROM public.email_deliveries WHERE event_key='workspace-ready:'||fresh_tenant::text)
          OR (SELECT count(*) FROM pgmq.q_transactional_emails)<>queued_before THEN
          RAISE EXCEPTION 'EMAIL_READY_INVALID_STATE_ENQUEUED: %',bad
            USING ERRCODE='P42'||lpad(array_position(ARRAY[${invalidStates.map(s=>`'${s}'`).join(',')}],bad)::text,2,'0'); END IF;
        deny_count:=deny_count+1;
        UPDATE auth.users SET email_confirmed_at=auth_row.email_confirmed_at,banned_until=auth_row.banned_until,
          deleted_at=auth_row.deleted_at WHERE id='${owner.id}';
        INSERT INTO public.user_roles(user_id,role) VALUES('${owner.id}','owner') ON CONFLICT DO NOTHING;
        UPDATE public.hotels SET status='active' WHERE id=fresh_hotel;
        UPDATE public.users SET hotel_id=fresh_hotel,status='active',user_level_code='tenant_owner',role='owner',
          is_primary_owner=true,is_super_admin=false,account_locked=false,deleted_at=NULL,email=auth_row.email WHERE id='${owner.id}';
      END IF;
      SELECT * INTO STRICT delivery FROM public.email_deliveries WHERE event_key='workspace-ready:'||fresh_tenant::text;
      IF delivery.recipient_email IS DISTINCT FROM lower(auth_row.email) OR delivery.tenant_id IS DISTINCT FROM fresh_tenant
        OR delivery.template_name<>'workspace_ready' OR delivery.template_data->>'path' IS DISTINCT FROM expected_path
        OR delivery.template_data->>'hotel_name' IS DISTINCT FROM 'Owned email-ready hotel'
        OR delivery.template_data->>'name' IS DISTINCT FROM profile_row.full_name OR delivery.status<>'queued' OR delivery.attempts<>0
        OR (SELECT count(*) FROM pgmq.q_transactional_emails)<>queued_before+1
        OR (SELECT count(*) FROM pgmq.q_transactional_emails WHERE message->>'delivery_id'=delivery.id::text)<>1 THEN
        RAISE EXCEPTION 'EMAIL_READY_POSITIVE_QUEUE_REQUIRED' USING ERRCODE='P4301'; END IF;
      UPDATE public.users SET status=status WHERE id='${owner.id}';
      IF (SELECT count(*) FROM public.email_deliveries WHERE event_key='workspace-ready:'||fresh_tenant::text)<>1
        OR (SELECT count(*) FROM pgmq.q_transactional_emails)<>queued_before+1 THEN RAISE EXCEPTION 'EMAIL_READY_DUPLICATE_QUEUE'; END IF;
      positive_count:=positive_count+1;
      RAISE SQLSTATE 'Z0001';
    EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; END;
    ${snapshot} INTO current_state;
    IF current_state IS DISTINCT FROM baseline THEN RAISE EXCEPTION 'EMAIL_READY_ROLLBACK_CHANGED_ROWS'; END IF;
  END LOOP;
  IF deny_count<>18 OR positive_count<>23 THEN RAISE EXCEPTION 'EMAIL_READY_CHECK_COUNT'; END IF;
END;
$checks$;
ROLLBACK;
SELECT json_build_object('verified',true,'freshEvents',20,'invalidStates',18,'denials',18,'positiveQueues',23,
  'httpCommittedQueues',3,'positiveAfterRecovery',true,'deliveryAndPgmqDedupe',true,'rollbackTables',10,
  'allRowMutationsRolledBack',true,'sequenceGapsAllowed',true,'consumerDisabled',true);`;
}
