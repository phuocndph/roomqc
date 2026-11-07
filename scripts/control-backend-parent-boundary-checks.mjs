// Exact-owned installer transaction only. Exercise real populated FK parents;
// never accept a production URL, SQL identifier or arbitrary target as input.
import assert from 'node:assert/strict';
import {parentBoundaryForeignKeys} from './control-backend-parent-boundary-review.mjs';
export const parentBoundaryFailureCodes=Object.freeze([
  'PARENT_BOUNDARY_LIVE_FIXTURES_REQUIRED','PARENT_OWNER_POSITIVE_MISSING','PARENT_ADMIN_POSITIVE_MISSING',
  'PARENT_BOUNDARY_FK_REVIEW_CHANGED','PARENT_BOUNDARY_TUPLE_POSITIVE_MISSING','PARENT_BOUNDARY_COMPOSITE_SIBLING_MISSING',
  'PARENT_BOUNDARY_UNSCOPED_PARENT_GRANT','PARENT_BOUNDARY_SNAPSHOT_OBSERVER_FAILED',
  'PARENT_HOTEL_OWNER_ROW_NOT_VISIBLE','PARENT_BOUNDARY_ROLE_NOT_ASSUMED','PARENT_BOUNDARY_SNAPSHOT_CHANGED',
  'PARENT_TRUSTED_DELETE_NOT_APPLIED','PARENT_TRUSTED_CASCADE_INCOMPLETE','PARENT_TRUSTED_ROLLBACK_CHANGED_SNAPSHOT',
  'PARENT_BOUNDARY_ROOM_FIXTURE_REQUIRED','PARENT_BOUNDARY_CASE_FIXTURE_REQUIRED',
]);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function buildParentBoundaryChecks({owner,admin}={}){
  for(const actor of [owner,admin])for(const field of ['id','sessionId','tenantId','hotelId'])
    assert.match(actor?.[field]??'',uuid,'Owned live fixture identity required');
  assert.notEqual(owner.id,admin.id);
  const reviewed=JSON.stringify(parentBoundaryForeignKeys).replaceAll("'","''");
  return `BEGIN;
SET LOCAL statement_timeout='120s';
SET LOCAL lock_timeout='2s';
DO $checks$
DECLARE
  fk record; actor_label text; actor_role text; actor_claims jsonb; child_key jsonb; operation text;
  actual_catalog jsonb; reviewed_catalog jsonb:='${reviewed}'::jsonb;
  nonnull_sql text; key_sql text; parent_where text; child_where text; assignment_sql text; scope_sql text; sibling_sql text;
  arity integer; key_index integer; snapshot_tables integer; expected_denials integer:=0;
  composite_keys integer:=0; composite_denials integer:=0; composite_integrity integer:=0;
  deferred_staged integer:=0; inserted boolean; child_row jsonb; mutated_row jsonb; observer_checks integer:=0;
  affected integer; error_state text; error_constraint text; outcome text;
  entries jsonb:='[]'; missing jsonb:='[]'; findings jsonb:='[]';
  checked integer:=0; denied integer:=0; before_hash text; after_hash text;
  snapshot_sql text; live_result jsonb; owned_counts jsonb; remaining bigint;
  checkout_payment uuid; case_result jsonb;
  rollback_observed boolean; service_cascade boolean:=false;
  password_fks integer:=0; password_denials integer:=0;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id='${owner.sessionId}'::uuid AND user_id='${owner.id}'::uuid)
    OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id='${admin.sessionId}'::uuid AND user_id='${admin.id}'::uuid) THEN
    RAISE EXCEPTION 'PARENT_BOUNDARY_LIVE_FIXTURES_REQUIRED'; END IF;
  -- Nonempty and live positive controls precede every permission conclusion.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','${owner.id}',
    'session_id','${owner.sessionId}')::text,true);
  SET LOCAL ROLE authenticated;
  SELECT public.get_hotel_room_setup('${owner.hotelId}'::uuid) INTO live_result;
  IF live_result->>'hotel_id' IS DISTINCT FROM '${owner.hotelId}' THEN RAISE EXCEPTION 'PARENT_OWNER_POSITIVE_MISSING'; END IF;
  -- The access stage deliberately leaves this owner's initial room draft open.
  -- Complete it through the real owner RPC inside this rolled-back transaction;
  -- a direct confirmed_by assignment would hide an invalid setup fixture.
  IF live_result->>'completed_at' IS NULL THEN
    IF live_result->>'request_id' IS NULL OR COALESCE((live_result->>'version')::integer,0)<1 THEN
      RAISE EXCEPTION 'PARENT_BOUNDARY_ROOM_FIXTURE_REQUIRED'; END IF;
    SELECT public.complete_hotel_room_setup('${owner.hotelId}'::uuid,
      (live_result->>'request_id')::uuid,(live_result->>'version')::integer,true) INTO live_result;
  END IF;
  RESET ROLE;
  IF NOT EXISTS(SELECT 1 FROM private.hotel_room_setup d JOIN public.rooms r ON r.hotel_id=d.hotel_id
    WHERE d.hotel_id='${owner.hotelId}'::uuid AND d.tenant_id='${owner.tenantId}'::uuid
      AND d.confirmed_by='${owner.id}'::uuid AND d.completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PARENT_BOUNDARY_ROOM_FIXTURE_REQUIRED'; END IF;
  SELECT d.payment_id INTO checkout_payment FROM private.subscription_checkout_drafts d
    JOIN public.payment_transactions p ON p.id=d.payment_id AND p.tenant_id=d.tenant_id
    WHERE d.tenant_id='${owner.tenantId}'::uuid AND p.payment_status IN ('pending','completed')
    ORDER BY d.payment_id LIMIT 1;
  IF checkout_payment IS NULL THEN RAISE EXCEPTION 'PARENT_BOUNDARY_CASE_FIXTURE_REQUIRED'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','${admin.id}',
    'session_id','${admin.sessionId}')::text,true);
  SET LOCAL ROLE authenticated;
  IF public.platform_support_actor()<>'${admin.id}'::uuid THEN RAISE EXCEPTION 'PARENT_ADMIN_POSITIVE_MISSING'; END IF;
  SELECT public.admin_mutate_subscription_reconciliation_case(checkout_payment,gen_random_uuid(),
    'create','Owned parent-boundary fixture',NULL) INTO case_result;
  RESET ROLE;
  IF NOT EXISTS(SELECT 1 FROM private.subscription_reconciliation_cases c
    JOIN private.subscription_reconciliation_case_events e ON e.case_id=c.id
    WHERE c.id=(case_result->'case'->>'id')::uuid AND c.payment_id=checkout_payment
      AND c.tenant_id='${owner.tenantId}'::uuid AND e.action='create' AND e.actor_id='${admin.id}'::uuid) THEN
    RAISE EXCEPTION 'PARENT_BOUNDARY_CASE_FIXTURE_REQUIRED'; END IF;

  -- Every business table is included, including indirect cascade/trigger effects.
  -- Auth identities/sessions and the transactional queue are hashed privately;
  -- no row content or credentials are returned in evidence.
  CREATE TEMP TABLE roomqc_parent_snapshot_observer(id integer PRIMARY KEY,payload text) ON COMMIT DROP;
  INSERT INTO roomqc_parent_snapshot_observer VALUES(1,'initial');
  -- Hash each full row before aggregation, then reuse one prepared plan. This
  -- preserves all fields and duplicate-row multiplicity without repeatedly
  -- building and serializing one enormous JSON document for every attempt.
  SELECT count(*),'SELECT md5(COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.name),''[]''::jsonb)::text) FROM ('||
    string_agg(format('SELECT %L AS name,md5(COALESCE(jsonb_agg(md5(to_jsonb(r)::text) ORDER BY md5(to_jsonb(r)::text)),''[]''::jsonb)::text) AS row_hash FROM %I.%I r',
      n.nspname||'.'||c.relname,n.nspname,c.relname),' UNION ALL ' ORDER BY n.nspname,c.relname)||
      ' UNION ALL SELECT ''pg_temp.roomqc_parent_snapshot_observer'' AS name,md5(COALESCE(jsonb_agg(md5(to_jsonb(r)::text) ORDER BY md5(to_jsonb(r)::text)),''[]''::jsonb)::text) AS row_hash FROM pg_temp.roomqc_parent_snapshot_observer r) s'
    INTO snapshot_tables,snapshot_sql
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND (n.nspname IN ('public','private')
      OR (n.nspname='auth' AND c.relname IN ('users','sessions','identities'))
      OR (n.nspname='pgmq' AND c.relname='q_transactional_emails'));
  WITH targets AS (
    SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private') AND c.relkind='r' AND c.relrowsecurity
      AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
  ), catalog AS (
    SELECT n.nspname AS source_schema,c.relname AS source_table,k.conname AS constraint_name,
      rn.nspname AS parent_schema,rc.relname AS parent_table,
      (SELECT array_agg(a.attname::text ORDER BY x.ord) FROM unnest(k.conkey) WITH ORDINALITY x(num,ord)
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.num) AS child_columns,
      (SELECT array_agg(a.attname::text ORDER BY x.ord) FROM unnest(k.confkey) WITH ORDINALITY x(num,ord)
        JOIN pg_attribute a ON a.attrelid=rc.oid AND a.attnum=x.num) AS parent_columns,
      k.confdeltype::text AS delete_action,k.confupdtype::text AS update_action,
      k.condeferrable AS deferrable,k.condeferred AS initially_deferred,
      (SELECT bool_and(a.atttypid='uuid'::regtype) FROM unnest(k.conkey) x(num)
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.num)
      AND (SELECT bool_and(a.atttypid='uuid'::regtype) FROM unnest(k.confkey) x(num)
        JOIN pg_attribute a ON a.attrelid=rc.oid AND a.attnum=x.num) AS uuid_columns
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class rc ON rc.oid=k.confrelid
      JOIN pg_namespace rn ON rn.oid=rc.relnamespace
    WHERE k.contype='f' AND (k.conrelid IN (SELECT oid FROM targets) OR k.confrelid IN (SELECT oid FROM targets))
  ) SELECT jsonb_agg(to_jsonb(catalog) ORDER BY source_schema,source_table,constraint_name) INTO actual_catalog FROM catalog;
  IF actual_catalog IS DISTINCT FROM reviewed_catalog THEN
    RAISE EXCEPTION 'PARENT_BOUNDARY_FK_REVIEW_CHANGED'; END IF;
  EXECUTE 'PREPARE roomqc_parent_snapshot AS '||snapshot_sql;
  snapshot_sql:='EXECUTE roomqc_parent_snapshot';
  EXECUTE snapshot_sql INTO before_hash;
  -- Prove the observer changes for INSERT/UPDATE/DELETE and returns to the
  -- baseline on rollback. The observer is session-local and never a migration.
  FOREACH operation IN ARRAY ARRAY['insert','update','delete'] LOOP
    rollback_observed:=false;
    BEGIN
      CASE operation
        WHEN 'insert' THEN INSERT INTO pg_temp.roomqc_parent_snapshot_observer VALUES(2,'new');
        WHEN 'update' THEN UPDATE pg_temp.roomqc_parent_snapshot_observer SET payload='changed' WHERE id=1;
        ELSE DELETE FROM pg_temp.roomqc_parent_snapshot_observer WHERE id=1;
      END CASE;
      EXECUTE snapshot_sql INTO after_hash;
      IF after_hash IS NOT DISTINCT FROM before_hash THEN RAISE EXCEPTION 'PARENT_BOUNDARY_SNAPSHOT_OBSERVER_FAILED';END IF;
      RAISE EXCEPTION 'OWNED_PARENT_ROLLBACK' USING ERRCODE='RQ001';
    EXCEPTION WHEN SQLSTATE 'RQ001' THEN rollback_observed:=true;
    END;
    EXECUTE snapshot_sql INTO after_hash;
    IF NOT rollback_observed OR after_hash IS DISTINCT FROM before_hash THEN
      RAISE EXCEPTION 'PARENT_BOUNDARY_SNAPSHOT_OBSERVER_FAILED';END IF;
    observer_checks:=observer_checks+1;
  END LOOP;
  FOR fk IN SELECT * FROM jsonb_to_recordset(actual_catalog) AS f(
    source_schema text,source_table text,constraint_name text,parent_schema text,parent_table text,
    child_columns text[],parent_columns text[],delete_action text,update_action text,
    "deferrable" boolean,initially_deferred boolean,uuid_columns boolean) LOOP
    checked:=checked+1;arity:=cardinality(fk.child_columns);
    expected_denials:=expected_denials+4*(CASE WHEN arity=1 THEN 2 ELSE arity+2 END);
    SELECT string_agg(format('%I IS NOT NULL',col),' AND ' ORDER BY ord),
      'jsonb_build_array('||string_agg(format('%I::text',col),',' ORDER BY ord)||')'
      INTO nonnull_sql,key_sql FROM unnest(fk.child_columns) WITH ORDINALITY x(col,ord);
    -- Use owner-scoped rows for mutable business parents. Auth/billing parents
    -- deny browser DML at the grant boundary, independently of row ownership;
    -- fail closed if that assumption changes rather than masking it with RLS.
    IF (fk.parent_schema='auth' AND fk.parent_table='users') OR
      (fk.parent_schema='public' AND fk.parent_table IN ('invoices','payment_transactions')) THEN
      IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','roomqc_control_probe']) roles(role_name)
        WHERE has_table_privilege(role_name,format('%I.%I',fk.parent_schema,fk.parent_table),'DELETE,UPDATE')
          OR has_any_column_privilege(role_name,format('%I.%I',fk.parent_schema,fk.parent_table),'UPDATE')) THEN
        RAISE EXCEPTION 'PARENT_BOUNDARY_UNSCOPED_PARENT_GRANT';END IF;
    END IF;
    scope_sql:=CASE
      WHEN fk.parent_schema='public' AND fk.parent_table='tenants'
        THEN format(' AND %I=%L::uuid',fk.child_columns[1],'${owner.tenantId}')
      WHEN fk.parent_schema='public' AND fk.parent_table='hotels'
        THEN format(' AND tenant_id=%L::uuid','${owner.tenantId}') ELSE '' END;
    -- Random UUID ordering must not pick a composite prefix having only one
    -- command when the populated fixture includes other prefixes with siblings.
    -- Select an eligible tuple, then independently verify its sibling below.
    sibling_sql:='';
    IF arity>1 THEN
      sibling_sql:=format(' AND EXISTS(SELECT 1 FROM %I.%I sibling WHERE sibling.%I=c.%I AND sibling.%I<>c.%I)',
        fk.parent_schema,fk.parent_table,fk.parent_columns[1],fk.child_columns[1],fk.parent_columns[2],fk.child_columns[2]);
    END IF;
    EXECUTE format('SELECT %s,to_jsonb(c) FROM %I.%I c WHERE %s%s%s ORDER BY %s LIMIT 1',
      key_sql,fk.source_schema,fk.source_table,nonnull_sql,scope_sql,sibling_sql,key_sql) INTO child_key,child_row;
    IF child_key IS NULL THEN
      missing:=missing||jsonb_build_array(fk.source_schema||'.'||fk.source_table||':'||fk.constraint_name);CONTINUE;
    END IF;
    SELECT string_agg(format('%I=%L::uuid',col,child_key->>(ord::integer-1)),' AND ' ORDER BY ord)
      INTO parent_where FROM unnest(fk.parent_columns) WITH ORDINALITY x(col,ord);
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE %s',fk.parent_schema,fk.parent_table,parent_where) INTO affected;
    IF affected<>1 THEN RAISE EXCEPTION 'PARENT_BOUNDARY_TUPLE_POSITIVE_MISSING'; END IF;
    IF arity>1 THEN
      composite_keys:=composite_keys+1;
      -- Same prefix with a different second key proves that a one-column
      -- predicate would address extra rows. Never use a prefix as the target.
      EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I=%L::uuid AND %I<>%L::uuid',
        fk.parent_schema,fk.parent_table,fk.parent_columns[1],child_key->>0,
        fk.parent_columns[2],child_key->>1) INTO affected;
      IF affected<1 THEN RAISE EXCEPTION 'PARENT_BOUNDARY_COMPOSITE_SIBLING_MISSING'; END IF;
      -- Exercise the actual FK independently of parent permission denials.
      -- A new child clone has a fresh PK; invoice booking is NULL to avoid
      -- the existing one-issued-receipt uniqueness rule. All changes roll back.
      FOR key_index IN 1..arity LOOP
        inserted:=false;error_state:=NULL;error_constraint:=NULL;
        mutated_row:=child_row||jsonb_build_object('id',gen_random_uuid(),fk.child_columns[key_index],gen_random_uuid());
        IF fk.source_schema='public' AND fk.source_table='guest_invoices' THEN
          mutated_row:=mutated_row||jsonb_build_object('booking_id',NULL,'invoice_number','PB-'||gen_random_uuid()::text);
        END IF;
        BEGIN
          EXECUTE format('INSERT INTO %I.%I SELECT (jsonb_populate_record(NULL::%I.%I,$1)).*',
            fk.source_schema,fk.source_table,fk.source_schema,fk.source_table) USING mutated_row;
          inserted:=true;
          EXECUTE format('SET CONSTRAINTS %I.%I IMMEDIATE',fk.source_schema,fk.constraint_name);
          RAISE EXCEPTION 'OWNED_PARENT_ROLLBACK' USING ERRCODE='RQ001';
        EXCEPTION WHEN SQLSTATE 'RQ001' THEN NULL;
          WHEN OTHERS THEN GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_constraint=CONSTRAINT_NAME;
        END;
        IF error_state='23503' AND error_constraint=fk.constraint_name AND inserted=fk.initially_deferred THEN
          composite_integrity:=composite_integrity+1;
          IF inserted THEN deferred_staged:=deferred_staged+1;END IF;
        ELSE findings:=findings||jsonb_build_array(jsonb_build_object('constraint',fk.constraint_name,
          'path','composite-child-integrity','column',key_index,'sqlstate',error_state,'staged',inserted));END IF;
        EXECUTE snapshot_sql INTO after_hash;
        IF before_hash IS DISTINCT FROM after_hash THEN RAISE EXCEPTION 'PARENT_BOUNDARY_SNAPSHOT_CHANGED';END IF;
      END LOOP;
    END IF;
    IF fk.source_table='password_change_receipts' THEN password_fks:=password_fks+1;END IF;
    IF fk.parent_schema='public' AND fk.parent_table='hotels' THEN
      PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','${owner.id}',
        'session_id','${owner.sessionId}')::text,true);
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT count(*) FROM public.hotels WHERE %s',parent_where) INTO affected;
      RESET ROLE;
      IF affected<>1 THEN RAISE EXCEPTION 'PARENT_HOTEL_OWNER_ROW_NOT_VISIBLE';END IF;
    END IF;
    FOREACH actor_label IN ARRAY ARRAY['anon','owner','platform_admin','probe'] LOOP
      actor_role:=CASE actor_label WHEN 'owner' THEN 'authenticated' WHEN 'platform_admin' THEN 'authenticated'
        WHEN 'probe' THEN 'roomqc_control_probe' ELSE 'anon' END;
      actor_claims:=CASE actor_label
        WHEN 'owner' THEN jsonb_build_object('role',actor_role,'sub','${owner.id}','session_id','${owner.sessionId}')
        WHEN 'platform_admin' THEN jsonb_build_object('role',actor_role,'sub','${admin.id}','session_id','${admin.sessionId}')
        ELSE jsonb_build_object('role',actor_role) END;
      PERFORM set_config('request.jwt.claim.role',actor_role,true);
      PERFORM set_config('request.jwt.claims',actor_claims::text,true);
      FOREACH operation IN ARRAY CASE WHEN arity=1 THEN ARRAY['delete','update_key']
        ELSE ARRAY['delete','update_key_1','update_key_2','update_key'] END LOOP
        EXECUTE format('SET LOCAL ROLE %I',actor_role);
        IF current_user<>actor_role THEN RAISE EXCEPTION 'PARENT_BOUNDARY_ROLE_NOT_ASSUMED';END IF;
        affected:=NULL;error_state:=NULL;error_constraint:=NULL;
        BEGIN
          IF operation='delete' THEN
            EXECUTE format('DELETE FROM %I.%I WHERE %s',fk.parent_schema,fk.parent_table,parent_where);
          ELSE
            SELECT string_agg(format('%I=gen_random_uuid()',col),',' ORDER BY ord) INTO assignment_sql
              FROM unnest(fk.parent_columns) WITH ORDINALITY x(col,ord)
              WHERE operation='update_key' OR ord=CASE WHEN operation='update_key' THEN NULL ELSE right(operation,1)::integer END;
            EXECUTE format('UPDATE %I.%I SET %s WHERE %s',fk.parent_schema,fk.parent_table,assignment_sql,parent_where);
          END IF;
          GET DIAGNOSTICS affected=ROW_COUNT;
          SET CONSTRAINTS ALL IMMEDIATE;
          RAISE EXCEPTION 'OWNED_PARENT_ROLLBACK' USING ERRCODE='RQ001';
        EXCEPTION WHEN SQLSTATE 'RQ001' THEN NULL;
          WHEN OTHERS THEN GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_constraint=CONSTRAINT_NAME;
        END;
        RESET ROLE;
        EXECUTE snapshot_sql INTO after_hash;
        IF before_hash IS DISTINCT FROM after_hash THEN RAISE EXCEPTION 'PARENT_BOUNDARY_SNAPSHOT_CHANGED';END IF;
        outcome:=CASE WHEN error_state='42501' THEN 'permission_denied'
          WHEN error_state IS NULL AND affected=0 THEN 'row_policy_filtered'
          WHEN error_state='23503' AND actor_label='owner' AND fk.parent_schema='public' AND fk.parent_table='hotels'
            AND operation='delete' AND error_constraint='workspace_provisioning_hotel_id_fkey' THEN 'receipt_fk_refused'
          WHEN error_state='23503' AND operation LIKE 'update_key%' AND EXISTS(SELECT 1 FROM pg_constraint c
            JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace n ON n.oid=parent.relnamespace
            WHERE c.contype='f' AND c.conname=error_constraint AND n.nspname=fk.parent_schema
              AND parent.relname=fk.parent_table AND c.confupdtype IN ('a','r')) THEN 'parent_key_fk_refused'
          ELSE 'unexpected' END;
        IF outcome='unexpected' THEN findings:=findings||jsonb_build_array(jsonb_build_object(
          'constraint',fk.constraint_name,'operation',operation,'actor',actor_label,'sqlstate',error_state,'affected',affected));
        ELSE denied:=denied+1;
          IF fk.source_table='password_change_receipts' THEN password_denials:=password_denials+1;END IF;
          IF arity>1 THEN composite_denials:=composite_denials+1;END IF;
        END IF;
        entries:=entries||jsonb_build_array(jsonb_build_object('constraint',fk.constraint_name,
          'source',fk.source_schema||'.'||fk.source_table,'parent',fk.parent_schema||'.'||fk.parent_table,
          'tupleArity',arity,'deferrable',fk.deferrable,'initiallyDeferred',fk.initially_deferred,
          'deleteAction',fk.delete_action,'operation',operation,'actor',actor_label,'outcome',outcome,'snapshotUnchanged',true));
      END LOOP;
    END LOOP;
    RAISE NOTICE 'PARENT_BOUNDARY_PROGRESS checked=% denials=%',checked,denied;
  END LOOP;

  -- Distinguish blocked browser access from the trusted destructive FK contract.
  -- This is an installer-observed service-role transaction, not a production
  -- offboarding command or authorization to expose one.
  SELECT jsonb_build_object(
    'room_setup',(SELECT count(*) FROM private.hotel_room_setup WHERE tenant_id='${owner.tenantId}'),
    'quote',(SELECT count(*) FROM private.subscription_quotes WHERE tenant_id='${owner.tenantId}'),
    'checkout',(SELECT count(*) FROM private.subscription_checkout_drafts WHERE tenant_id='${owner.tenantId}'),
    'workspace',(SELECT count(*) FROM private.workspace_provisioning WHERE tenant_id='${owner.tenantId}'),
    'delivery',(SELECT count(*) FROM public.email_deliveries WHERE tenant_id='${owner.tenantId}')) INTO owned_counts;
  IF EXISTS(SELECT 1 FROM jsonb_each_text(owned_counts) v WHERE v.value::bigint<1) THEN
    missing:=missing||jsonb_build_array('trusted-tenant-delete-nonempty-fixture');
  ELSE
    EXECUTE snapshot_sql INTO before_hash;
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
    PERFORM set_config('request.jwt.claim.role','service_role',true);
    SET LOCAL ROLE service_role;
    rollback_observed:=false;
    BEGIN
      DELETE FROM public.tenants WHERE id='${owner.tenantId}';
      GET DIAGNOSTICS affected=ROW_COUNT;
      IF affected<>1 THEN RAISE EXCEPTION 'PARENT_TRUSTED_DELETE_NOT_APPLIED'; END IF;
      RESET ROLE;
      SELECT (SELECT count(*) FROM private.hotel_room_setup WHERE tenant_id='${owner.tenantId}')
        +(SELECT count(*) FROM private.subscription_quotes WHERE tenant_id='${owner.tenantId}')
        +(SELECT count(*) FROM private.subscription_checkout_drafts WHERE tenant_id='${owner.tenantId}')
        +(SELECT count(*) FROM private.workspace_provisioning WHERE tenant_id='${owner.tenantId}')
        +(SELECT count(*) FROM public.email_deliveries WHERE tenant_id='${owner.tenantId}') INTO remaining;
      IF remaining<>0 THEN RAISE EXCEPTION 'PARENT_TRUSTED_CASCADE_INCOMPLETE'; END IF;
      service_cascade:=true;
      RAISE EXCEPTION 'OWNED_PARENT_ROLLBACK' USING ERRCODE='RQ001';
    EXCEPTION WHEN SQLSTATE 'RQ001' THEN rollback_observed:=true;
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_constraint=CONSTRAINT_NAME;
        findings:=findings||jsonb_build_array(jsonb_build_object('path','trusted-tenant-delete',
          'sqlstate',error_state,'constraint',error_constraint));
    END;
    RESET ROLE;
    EXECUTE snapshot_sql INTO after_hash;
    IF before_hash IS DISTINCT FROM after_hash THEN RAISE EXCEPTION 'PARENT_TRUSTED_ROLLBACK_CHANGED_SNAPSHOT'; END IF;
    service_cascade:=service_cascade AND rollback_observed;
  END IF;
  PERFORM set_config('roomqc.fixture_parent_boundary_result',jsonb_build_object(
    'verified',checked=jsonb_array_length(reviewed_catalog) AND denied=expected_denials
      AND password_fks=1 AND password_denials=8 AND composite_keys=2
      AND composite_integrity=4 AND deferred_staged=2 AND composite_denials=32 AND observer_checks=3
      AND jsonb_array_length(missing)=0 AND jsonb_array_length(findings)=0 AND service_cascade,
    'foreignKeys',checked,'denials',denied,'entries',entries,'missingFixtures',missing,'findings',findings,
    'legacyForeignKeys',checked-password_fks,'legacyDenials',denied-password_denials,
    'passwordReceiptForeignKeys',password_fks,'passwordReceiptDenials',password_denials,
    'reviewedCatalogMatched',true,'expectedDenials',expected_denials,
    'compositeForeignKeys',composite_keys,'compositeDenials',composite_denials,
    'compositeIntegrityChecks',composite_integrity,'deferredInsertThenConstraintRefusals',deferred_staged,
    'snapshotTables',snapshot_tables,'snapshotObserverChecks',observer_checks,'preparedSnapshot',true,
    'allRowMutationsRolledBack',true,'sequenceGapsAllowed',true,
    'ownerAndAdminLivePositives',true,'trustedTenantCascade',service_cascade,'trustedFixtureCounts',owned_counts,
    'completedRoomFixtureVerified',true,'reconciliationEventFixtureVerified',true,
    'sqlActorAssumptionOnly',true,'parentDeleteAndKeyUpdateBoundariesOnly',true,
    'parentKeyUpdateBoundariesVerified',true,'fullIndirectDispositionVerified',false,'productionOffboardingApproved',false)::text,true);
END;
$checks$;
SELECT current_setting('roomqc.fixture_parent_boundary_result');
ROLLBACK;`;
}
