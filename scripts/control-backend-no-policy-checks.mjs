import assert from 'node:assert/strict';
export const noPolicyFailureCodes=Object.freeze([
  'NO_POLICY_LIVE_OWNER_REQUIRED','NO_POLICY_ACTOR_NOT_ASSUMED','NO_POLICY_UNEXPECTED_ALLOW',
  'NO_POLICY_TABLE_CHANGED','NO_POLICY_CONTROL_COUNT_MISMATCH','NO_POLICY_DYNAMIC_ACTOR_NOT_ASSUMED',
  'NO_POLICY_DYNAMIC_UNEXPECTED_ALLOW','NO_POLICY_DYNAMIC_COUNT_MISMATCH',
]);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const noPolicyExpectedTargets=Object.freeze([
  'private.booking_no_show_resolutions',
  'private.booking_notification_attempts','private.booking_notification_channel_config','private.booking_notification_events',
  'private.booking_notification_operator_commands','private.booking_notification_outbox','private.booking_notification_receipts','private.booking_notification_targets',
  'private.booking_room_commands',
  'private.employee_authority_cancellations','private.employee_authority_receipts','private.employee_authority_versions',
  'private.employee_profile_edit_receipts','private.hotel_room_setup','private.operations_advice_commands','private.operations_advice_policy','private.operations_advice_policy_commands','private.password_change_receipts','private.platform_support_acceptances',
  'private.report_target_commands','private.report_target_revisions','private.roomqc_cluster_config',
  'private.subscription_checkout_drafts','private.subscription_lifecycle_batch_receipts',
  'private.subscription_lifecycle_commands','private.subscription_lifecycle_notification_outbox',
  'private.subscription_lifecycle_progress','private.subscription_quotes',
  'private.subscription_reconciliation_case_events','private.subscription_reconciliation_case_receipts',
  'private.subscription_reconciliation_cases','private.subscription_status_job_recoveries',
  'private.subscription_status_job_runs','private.tenant_summary_authority','private.tenant_summary_credentials',
  'private.workflow_delivery_results','private.workflow_delivery_sources',
  'private.workflow_room_check_commands','private.workflow_room_transition_commands','private.workspace_provisioning','private.workspace_setup_dispatches',
  'public.email_admin_actions','public.email_deliveries','public.email_provider_events',
]);

// Installer channel of the exact-owned disposable backend only. This proves
// direct denials, not the safety of RPC/trigger/FK paths that bypass table grants.
export function buildNoPolicyChecks({owner}={}){
  for(const field of ['id','sessionId'])assert.match(owner?.[field]??'',uuid);
  return `BEGIN;
SET LOCAL statement_timeout='30s';
DO $checks$
DECLARE target record; actor text; operation text; command text; amount integer:=0;
  denials integer:=0; service_denials integer:=0; positives integer:=0; dynamic_denials integer:=0;
  before_hash text; after_hash text; populated jsonb:='[]'; seen text[]:='{}';
  employee_denials integer:=0; employee_service_denials integer:=0;
  password_denials integer:=0; password_service_denials integer:=0;
  authority_denials integer:=0; authority_service_denials integer:=0;
  workflow_denials integer:=0; workflow_service_denials integer:=0;
  room_denials integer:=0; room_service_denials integer:=0;
  check_denials integer:=0; check_service_denials integer:=0;
  booking_denials integer:=0; booking_service_denials integer:=0;
  notification_denials integer:=0; notification_service_denials integer:=0;
  target_denials integer:=0; target_service_denials integer:=0;
  advice_denials integer:=0; advice_service_denials integer:=0;
  dispatch_denials integer:=0; dispatch_service_denials integer:=0;
  support_denials integer:=0; support_service_denials integer:=0;
  summary_denials integer:=0; summary_service_denials integer:=0;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id='${owner.sessionId}'::uuid AND user_id='${owner.id}'::uuid) THEN
    RAISE EXCEPTION 'NO_POLICY_LIVE_OWNER_REQUIRED'; END IF;
  FOR target IN SELECT n.nspname AS schema,c.relname AS name,
    (SELECT a.attname FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LIMIT 1) AS first_column
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private') AND c.relkind='r' AND c.relrowsecurity
      -- These two private relations now have policies only for the NOLOGIN
      -- maintenance-function owner. Keep their direct-denial drill after the
      -- transition; a policy must never silently remove an audited target.
      AND (NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)
        OR n.nspname='private' AND c.relname IN ('tenant_summary_authority','tenant_summary_credentials'))
    ORDER BY n.nspname,c.relname LOOP
    amount:=amount+1;
    seen:=array_append(seen,target.schema||'.'||target.name);
    EXECUTE format('SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),''[]''::jsonb)::text) FROM %I.%I r',target.schema,target.name) INTO before_hash;
    IF before_hash<>md5('[]') THEN populated:=populated||jsonb_build_array(target.schema||'.'||target.name); END IF;
    positives:=positives+1;
    FOREACH actor IN ARRAY ARRAY['anon','authenticated','roomqc_control_probe','service_role'] LOOP
      IF actor='service_role' AND target.schema='public' THEN
        EXECUTE 'SET LOCAL ROLE service_role';
        EXECUTE format('SELECT count(*) FROM %I.%I',target.schema,target.name);
        RESET ROLE; positives:=positives+1; CONTINUE;
      END IF;
      PERFORM set_config('request.jwt.claims',CASE WHEN actor='authenticated'
        THEN jsonb_build_object('role',actor,'sub','${owner.id}','session_id','${owner.sessionId}')::text
        ELSE jsonb_build_object('role',actor)::text END,true);
      -- SET ROLE is outside the exception block: an inability to assume the
      -- actor can never count as a denial of the actual table operation.
      EXECUTE format('SET LOCAL ROLE %I',actor);
      IF current_user<>actor THEN RAISE EXCEPTION 'NO_POLICY_ACTOR_NOT_ASSUMED'; END IF;
      FOREACH operation IN ARRAY ARRAY['select','insert','update','delete'] LOOP
        command:=CASE operation
          WHEN 'select' THEN format('SELECT count(*) FROM %I.%I',target.schema,target.name)
          WHEN 'insert' THEN format('INSERT INTO %I.%I DEFAULT VALUES',target.schema,target.name)
          WHEN 'update' THEN format('UPDATE %I.%I SET %I=NULL WHERE false',target.schema,target.name,target.first_column)
          WHEN 'delete' THEN format('DELETE FROM %I.%I WHERE false',target.schema,target.name) END;
        BEGIN
          EXECUTE command;
          RAISE EXCEPTION 'NO_POLICY_UNEXPECTED_ALLOW';
        EXCEPTION WHEN insufficient_privilege THEN
          IF actor='service_role' THEN
            service_denials:=service_denials+1;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.tenant_summary_authority','private.tenant_summary_credentials']) THEN summary_service_denials:=summary_service_denials+1; END IF;
            IF target.schema||'.'||target.name='private.platform_support_acceptances' THEN support_service_denials:=support_service_denials+1; END IF;
            IF target.schema||'.'||target.name='private.workspace_setup_dispatches' THEN dispatch_service_denials:=dispatch_service_denials+1; END IF;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.report_target_commands','private.report_target_revisions']) THEN target_service_denials:=target_service_denials+1; END IF;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.operations_advice_commands','private.operations_advice_policy','private.operations_advice_policy_commands']) THEN advice_service_denials:=advice_service_denials+1; END IF;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.booking_notification_attempts','private.booking_notification_channel_config','private.booking_notification_events','private.booking_notification_operator_commands','private.booking_notification_outbox','private.booking_notification_receipts','private.booking_notification_targets']) THEN notification_service_denials:=notification_service_denials+1; END IF;
            IF target.schema||'.'||target.name='private.employee_profile_edit_receipts' THEN employee_service_denials:=employee_service_denials+1; END IF;
            IF target.schema||'.'||target.name='private.password_change_receipts' THEN password_service_denials:=password_service_denials+1; END IF;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.employee_authority_cancellations','private.employee_authority_receipts','private.employee_authority_versions']) THEN authority_service_denials:=authority_service_denials+1; END IF;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.workflow_delivery_results','private.workflow_delivery_sources']) THEN workflow_service_denials:=workflow_service_denials+1; END IF;
            IF target.schema||'.'||target.name='private.workflow_room_transition_commands' THEN room_service_denials:=room_service_denials+1; END IF;
            IF target.schema||'.'||target.name='private.workflow_room_check_commands' THEN check_service_denials:=check_service_denials+1; END IF;
            IF target.schema||'.'||target.name='private.booking_room_commands' THEN booking_service_denials:=booking_service_denials+1; END IF;
          ELSE
            denials:=denials+1;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.tenant_summary_authority','private.tenant_summary_credentials']) THEN summary_denials:=summary_denials+1; END IF;
            IF target.schema||'.'||target.name='private.platform_support_acceptances' THEN support_denials:=support_denials+1; END IF;
            IF target.schema||'.'||target.name='private.workspace_setup_dispatches' THEN dispatch_denials:=dispatch_denials+1; END IF;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.report_target_commands','private.report_target_revisions']) THEN target_denials:=target_denials+1; END IF;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.operations_advice_commands','private.operations_advice_policy','private.operations_advice_policy_commands']) THEN advice_denials:=advice_denials+1; END IF;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.booking_notification_attempts','private.booking_notification_channel_config','private.booking_notification_events','private.booking_notification_operator_commands','private.booking_notification_outbox','private.booking_notification_receipts','private.booking_notification_targets']) THEN notification_denials:=notification_denials+1; END IF;
            IF target.schema||'.'||target.name='private.employee_profile_edit_receipts' THEN employee_denials:=employee_denials+1; END IF;
            IF target.schema||'.'||target.name='private.password_change_receipts' THEN password_denials:=password_denials+1; END IF;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.employee_authority_cancellations','private.employee_authority_receipts','private.employee_authority_versions']) THEN authority_denials:=authority_denials+1; END IF;
            IF target.schema||'.'||target.name=ANY(ARRAY['private.workflow_delivery_results','private.workflow_delivery_sources']) THEN workflow_denials:=workflow_denials+1; END IF;
            IF target.schema||'.'||target.name='private.workflow_room_transition_commands' THEN room_denials:=room_denials+1; END IF;
            IF target.schema||'.'||target.name='private.workflow_room_check_commands' THEN check_denials:=check_denials+1; END IF;
            IF target.schema||'.'||target.name='private.booking_room_commands' THEN booking_denials:=booking_denials+1; END IF;
          END IF;
        END;
      END LOOP;
      RESET ROLE;
    END LOOP;
    EXECUTE format('SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),''[]''::jsonb)::text) FROM %I.%I r',target.schema,target.name) INTO after_hash;
    IF before_hash IS DISTINCT FROM after_hash THEN RAISE EXCEPTION 'NO_POLICY_TABLE_CHANGED'; END IF;
    positives:=positives+1;
  END LOOP;
  IF seen IS DISTINCT FROM ARRAY[${noPolicyExpectedTargets.map(t=>"'"+t+"'").join(',')} ]::text[]
    OR amount<>44 OR denials<>528 OR service_denials<>164 OR positives<>91
    OR summary_denials<>24 OR summary_service_denials<>8
    OR support_denials<>12 OR support_service_denials<>4
    OR denials-employee_denials-password_denials-authority_denials-workflow_denials-room_denials-check_denials-booking_denials-notification_denials-target_denials-advice_denials-dispatch_denials-support_denials-summary_denials<>216
    OR service_denials-employee_service_denials-password_service_denials-authority_service_denials-workflow_service_denials-room_service_denials-check_service_denials-booking_service_denials-notification_service_denials-target_service_denials-advice_service_denials-dispatch_service_denials-support_service_denials-summary_service_denials<>60
    OR dispatch_denials<>12 OR dispatch_service_denials<>4
    OR target_denials<>24 OR target_service_denials<>8
    OR advice_denials<>36 OR advice_service_denials<>12
    OR notification_denials<>84 OR notification_service_denials<>28
    OR employee_denials<>12 OR employee_service_denials<>4
    OR password_denials<>12 OR password_service_denials<>4
    OR authority_denials<>36 OR authority_service_denials<>12
    OR workflow_denials<>24 OR workflow_service_denials<>8
    OR room_denials<>12 OR room_service_denials<>4
    OR check_denials<>12 OR check_service_denials<>4
    OR booking_denials<>12 OR booking_service_denials<>4 THEN
    RAISE EXCEPTION 'NO_POLICY_CONTROL_COUNT_MISMATCH' USING DETAIL=jsonb_build_object(
      'targets',seen,'tables',amount,'browserAndProbeDenials',denials,'privateServiceDirectDenials',service_denials,'positives',positives)::text; END IF;
  PERFORM public.generate_unique_code('OWNED-AUDIT','email_deliveries','status');
  FOREACH actor IN ARRAY ARRAY['anon','authenticated','roomqc_control_probe'] LOOP
    EXECUTE format('SET LOCAL ROLE %I',actor);
    IF current_user<>actor THEN RAISE EXCEPTION 'NO_POLICY_DYNAMIC_ACTOR_NOT_ASSUMED'; END IF;
    BEGIN
      PERFORM public.generate_unique_code('OWNED-AUDIT','email_deliveries','status');
      RAISE EXCEPTION 'NO_POLICY_DYNAMIC_UNEXPECTED_ALLOW';
    EXCEPTION WHEN insufficient_privilege THEN dynamic_denials:=dynamic_denials+1;
    END;
    RESET ROLE;
  END LOOP;
  IF dynamic_denials<>3 THEN RAISE EXCEPTION 'NO_POLICY_DYNAMIC_COUNT_MISMATCH'; END IF;
  PERFORM public.generate_unique_code('OWNED-AUDIT','email_deliveries','status');
  PERFORM set_config('roomqc.fixture_no_policy_result',jsonb_build_object('verified',true,
    'tables',amount,'adviceDirectDenials',advice_denials,'adviceServiceDenials',advice_service_denials,'browserAndProbeDenials',denials,'privateServiceDirectDenials',service_denials,
    'legacyBrowserAndProbeDenials',denials-employee_denials-password_denials-authority_denials-workflow_denials-room_denials-check_denials-booking_denials-notification_denials-target_denials-advice_denials-dispatch_denials-support_denials-summary_denials,
    'legacyPrivateServiceDenials',service_denials-employee_service_denials-password_service_denials-authority_service_denials-workflow_service_denials-room_service_denials-check_service_denials-booking_service_denials-notification_service_denials-target_service_denials-advice_service_denials-dispatch_service_denials-support_service_denials-summary_service_denials,
    'tenantSummaryDirectDenials',summary_denials,'tenantSummaryServiceDenials',summary_service_denials,
    'supportAcceptanceDirectDenials',support_denials,'supportAcceptanceServiceDenials',support_service_denials,
    'setupDispatchDirectDenials',dispatch_denials,'setupDispatchServiceDenials',dispatch_service_denials,
    'reportTargetDirectDenials',target_denials,'reportTargetServiceDenials',target_service_denials,
    'bookingNotificationDirectDenials',notification_denials,'bookingNotificationServiceDenials',notification_service_denials,
    'employeeReceiptDirectDenials',employee_denials,'employeeReceiptServiceDenials',employee_service_denials,
    'passwordReceiptDirectDenials',password_denials,'passwordReceiptServiceDenials',password_service_denials,
    'employeeAuthorityDirectDenials',authority_denials,'employeeAuthorityServiceDenials',authority_service_denials,
    'workflowDeliveryDirectDenials',workflow_denials,'workflowDeliveryServiceDenials',workflow_service_denials,
    'roomTransitionDirectDenials',room_denials,'roomTransitionServiceDenials',room_service_denials,
    'roomCheckDirectDenials',check_denials,'roomCheckServiceDenials',check_service_denials,
    'bookingRoomDirectDenials',booking_denials,'bookingRoomServiceDenials',booking_service_denials,
    'installerAndServiceReadPositives',positives,'populatedTables',populated,
    'dynamicInvokerDenials',dynamic_denials,'dynamicPositiveBeforeAfter',true,
    'unchangedSnapshots',amount,'sqlActorAssumptionOnly',true,'indirectPathsProven',false)::text,true);
END;
$checks$;
SELECT current_setting('roomqc.fixture_no_policy_result');
ROLLBACK;`;
}
