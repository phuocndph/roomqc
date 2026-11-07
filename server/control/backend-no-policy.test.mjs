import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildNoPolicyChecks,noPolicyExpectedTargets,noPolicyFailureCodes} from '../../scripts/control-backend-no-policy-checks.mjs';
const fixture={owner:{id:'11111111-1111-4111-8111-111111111111',sessionId:'22222222-2222-4222-8222-222222222222'}};
test('no-policy controls reject missing or injected installer fixture identifiers',()=>{
  for(const input of [undefined,{}, {owner:{...fixture.owner,id:"'; RESET ROLE;--"}}])assert.throws(()=>buildNoPolicyChecks(input));
});
test('no-policy controls assume roles before exact 42501 checks and preserve before/after snapshots',()=>{
  const sql=buildNoPolicyChecks(fixture);
  assert.match(sql,/current_user<>actor/);assert.match(sql,/EXCEPTION WHEN insufficient_privilege/);
  assert.match(sql,/denials<>528/);assert.match(sql,/service_denials<>164/);assert.match(sql,/NO_POLICY_TABLE_CHANGED/);
  assert.match(sql,/denials-employee_denials-password_denials-authority_denials-workflow_denials-room_denials-check_denials-booking_denials-notification_denials-target_denials-advice_denials-dispatch_denials-support_denials-summary_denials<>216/);
  assert.match(sql,/service_denials-employee_service_denials-password_service_denials-authority_service_denials-workflow_service_denials-room_service_denials-check_service_denials-booking_service_denials-notification_service_denials-target_service_denials-advice_service_denials-dispatch_service_denials-support_service_denials-summary_service_denials<>60/);
  assert.match(sql,/support_denials<>12/);assert.match(sql,/support_service_denials<>4/);
  assert.match(sql,/dispatch_denials<>12/);assert.match(sql,/dispatch_service_denials<>4/);
  assert.match(sql,/employee_denials<>12/);assert.match(sql,/employee_service_denials<>4/);
  assert.match(sql,/password_denials<>12/);assert.match(sql,/password_service_denials<>4/);
  assert.match(sql,/authority_denials<>36/);assert.match(sql,/authority_service_denials<>12/);
  assert.match(sql,/workflow_denials<>24/);assert.match(sql,/workflow_service_denials<>8/);
  assert.match(sql,/room_denials<>12/);assert.match(sql,/room_service_denials<>4/);
  assert.match(sql,/check_denials<>12/);assert.match(sql,/check_service_denials<>4/);
  assert.match(sql,/booking_denials<>12/);assert.match(sql,/booking_service_denials<>4/);
  assert.equal(noPolicyExpectedTargets.length,44);assert.equal(new Set(noPolicyExpectedTargets).size,44);
  assert.deepEqual(noPolicyExpectedTargets,[...noPolicyExpectedTargets].sort());
  assert.match(sql,/seen IS DISTINCT FROM ARRAY/);
  assert.match(sql,/dynamic_denials<>3/);assert.match(sql,/'indirectPathsProven',false/);
  assert.equal((sql.match(/generate_unique_code\('OWNED-AUDIT','email_deliveries','status'\)/g)??[]).length,3);
  assert.ok(sql.trim().endsWith('ROLLBACK;'));assert.doesNotMatch(sql,/TRUNCATE|CASCADE/);
});

test('current no-policy reasons are a closed allowlist and repeatability binds the reviewed source',async()=>{
  const sql=buildNoPolicyChecks(fixture);
  assert.deepEqual([...new Set(sql.match(/NO_POLICY_[A-Z_]+/g))].sort(),[...noPolicyFailureCodes].sort());
  const runner=await readFile(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url),'utf8');
  assert.match(runner,/noPolicyFailureCodes.includes\(code\)/);
  assert.match(runner,/previous.noPolicySourceHash,state.noPolicySourceHash/);
  assert.match(runner,/previous.noPolicyControls\?\.tables,44/);
  assert.match(runner,/previous.noPolicyControls\?\.supportAcceptanceDirectDenials,12/);
  assert.match(runner,/previous.noPolicyControls\?\.supportAcceptanceServiceDenials,4/);
  assert.match(runner,/buildNoPolicyChecks\(access.sessionFixtures\),\{privateDiagnostics:true\}/);
  assert.match(runner,/privateDiagnostics\?'verbose':'sqlstate'/);
});

test('actual forty-four-table direct ACL drill detects drift, unauthorized grants and an unknown target, then recovers',
  {skip:process.env.ROOMQC_CONTROL_DB_TEST!=='true'},async()=>{
  const {spawnSync}=await import('node:child_process'),{randomBytes}=await import('node:crypto');
  const run=randomBytes(6).toString('hex'),name='roomqc-no-policy-'+run,label='roomqc.no-policy-test';
  const password=randomBytes(32).toString('hex');
  const image='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
  // Independent reviewed fixture inventory, never derived from the builder under test.
  const targets=[
    'private.booking_no_show_resolutions',
    'private.booking_notification_attempts','private.booking_notification_channel_config','private.booking_notification_events',
    'private.booking_notification_operator_commands','private.booking_notification_outbox','private.booking_notification_receipts','private.booking_notification_targets',
    'private.booking_room_commands',
    'private.employee_authority_cancellations','private.employee_authority_receipts','private.employee_authority_versions',
    'private.employee_profile_edit_receipts','private.hotel_room_setup','private.operations_advice_commands','private.operations_advice_policy','private.operations_advice_policy_commands','private.password_change_receipts','private.platform_support_acceptances',
    'private.report_target_commands','private.report_target_revisions','private.roomqc_cluster_config','private.subscription_checkout_drafts','private.subscription_lifecycle_batch_receipts',
    'private.subscription_lifecycle_commands','private.subscription_lifecycle_notification_outbox',
    'private.subscription_lifecycle_progress','private.subscription_quotes','private.subscription_reconciliation_case_events',
    'private.subscription_reconciliation_case_receipts','private.subscription_reconciliation_cases',
    'private.subscription_status_job_recoveries','private.subscription_status_job_runs','private.tenant_summary_authority','private.tenant_summary_credentials',
    'private.workflow_delivery_results','private.workflow_delivery_sources','private.workflow_room_check_commands','private.workflow_room_transition_commands','private.workspace_provisioning','private.workspace_setup_dispatches',
    'public.email_admin_actions','public.email_deliveries','public.email_provider_events'];
  const docker=(args,input)=>{
    const r=spawnSync('docker',args,{input,encoding:'utf8',timeout:30000,windowsHide:true,
      env:{...process.env,POSTGRES_PASSWORD:password},maxBuffer:1000000});
    if(r.status!==0){
      const e=new Error('Owned no-policy fixture command failed');
      e.reason=r.stderr?.match(/\b(NO_POLICY_[A-Z_]+)\b/)?.[1]??'OWNED_COMMAND_FAILED';throw e;
    }
    return r.stdout;
  };
  const sql=source=>docker(['exec','-i',name,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
    '-U','postgres','-d','postgres'],source).trim();
  let created=false;
  try{
    docker(['run','-d','--name',name,'--label',label+'='+run,'--network','none','--env','POSTGRES_PASSWORD',
      '--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=192m',image]);created=true;
    let ready=false;for(let i=0;i<80;i++){
      try{sql('SELECT 1');ready=true;break}catch{await new Promise(r=>setTimeout(r,100))}
    }
    assert.ok(ready,'Exact-owned isolated PostgreSQL must be ready');
    sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE roomqc_control_probe NOINHERIT;
      CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA private;CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA private TO authenticated,roomqc_control_probe,service_role;
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
      INSERT INTO auth.sessions VALUES('${fixture.owner.sessionId}','${fixture.owner.id}');
      CREATE FUNCTION public.generate_unique_code(text,text,text) RETURNS text LANGUAGE plpgsql
        SECURITY INVOKER SET search_path='' AS $fn$ BEGIN
        EXECUTE format('SELECT count(*) FROM public.%I',$2);RETURN 'owned';END;$fn$;
      ${targets.map(t=>`CREATE TABLE ${t}(value text NOT NULL DEFAULT 'owned');
        ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
        REVOKE ALL ON ${t} FROM PUBLIC,anon,authenticated,roomqc_control_probe,service_role;
        INSERT INTO ${t} DEFAULT VALUES;${t.startsWith('public.')?'GRANT SELECT ON '+t+' TO service_role;':''}`).join('\n')}`);
    const verify=()=>{
      const raw=sql(buildNoPolicyChecks(fixture)),result=JSON.parse(raw);
      assert.equal(result.verified,true);assert.equal(result.tables,44);
      assert.equal(result.adviceDirectDenials,36);assert.equal(result.adviceServiceDenials,12);
      assert.equal(result.browserAndProbeDenials,528);assert.equal(result.privateServiceDirectDenials,164);
      assert.equal(result.supportAcceptanceDirectDenials,12);assert.equal(result.supportAcceptanceServiceDenials,4);
      assert.equal(result.setupDispatchDirectDenials,12);assert.equal(result.setupDispatchServiceDenials,4);
      assert.equal(result.legacyBrowserAndProbeDenials,216);assert.equal(result.legacyPrivateServiceDenials,60);
      assert.equal(result.employeeReceiptDirectDenials,12);assert.equal(result.employeeReceiptServiceDenials,4);
      assert.equal(result.passwordReceiptDirectDenials,12);assert.equal(result.passwordReceiptServiceDenials,4);
      assert.equal(result.employeeAuthorityDirectDenials,36);assert.equal(result.employeeAuthorityServiceDenials,12);
      assert.equal(result.workflowDeliveryDirectDenials,24);assert.equal(result.workflowDeliveryServiceDenials,8);
      assert.equal(result.roomTransitionDirectDenials,12);assert.equal(result.roomTransitionServiceDenials,4);
      assert.equal(result.roomCheckDirectDenials,12);assert.equal(result.roomCheckServiceDenials,4);
      assert.equal(result.bookingRoomDirectDenials,12);assert.equal(result.bookingRoomServiceDenials,4);
      assert.equal(result.bookingNotificationDirectDenials,84);assert.equal(result.bookingNotificationServiceDenials,28);
      assert.equal(result.installerAndServiceReadPositives,91);assert.equal(result.unchangedSnapshots,44);
      assert.equal(result.populatedTables.length,44);assert.equal(result.sqlActorAssumptionOnly,true);
      assert.equal(result.tenantSummaryDirectDenials,24);assert.equal(result.tenantSummaryServiceDenials,8);
      assert.equal(result.indirectPathsProven,false);return result;
    };
    try{verify()}catch(e){assert.fail('Initial forty-four-table drill: '+(e.reason??e.code??e.message))}
    sql('GRANT SELECT ON private.password_change_receipts TO authenticated;');
    assert.throws(()=>verify(),e=>e.reason==='NO_POLICY_UNEXPECTED_ALLOW','A newly reachable receipt must fail, even with no RLS policy');
    sql('REVOKE SELECT ON private.password_change_receipts FROM authenticated;');verify();
    for(const table of ['operations_advice_commands','operations_advice_policy','operations_advice_policy_commands','booking_notification_attempts','booking_notification_channel_config','booking_notification_events','booking_notification_operator_commands','booking_notification_outbox','booking_notification_receipts','booking_notification_targets','booking_no_show_resolutions','booking_room_commands','employee_authority_cancellations','employee_authority_receipts','employee_authority_versions',
      'workflow_delivery_results','workflow_delivery_sources','workflow_room_check_commands','workflow_room_transition_commands','workspace_setup_dispatches','platform_support_acceptances','tenant_summary_authority','tenant_summary_credentials']){
      sql('GRANT SELECT ON private.'+table+' TO authenticated;');
      assert.throws(()=>verify(),e=>e.reason==='NO_POLICY_UNEXPECTED_ALLOW','New authority table SELECT must remain denied');
      sql('REVOKE SELECT ON private.'+table+' FROM authenticated;');verify();
      sql('GRANT UPDATE(value) ON private.'+table+' TO authenticated;');
      assert.throws(()=>verify(),e=>e.reason==='NO_POLICY_UNEXPECTED_ALLOW','Column grants cannot bypass the authority boundary');
      sql('REVOKE UPDATE(value) ON private.'+table+' FROM authenticated;');verify();
      sql('GRANT DELETE ON private.'+table+' TO service_role;');
      assert.throws(()=>verify(),e=>e.reason==='NO_POLICY_UNEXPECTED_ALLOW','Service role cannot directly delete authority outcomes');
      sql('REVOKE DELETE ON private.'+table+' FROM service_role;');verify();
    }
    sql('CREATE TABLE private.unreviewed(value integer);ALTER TABLE private.unreviewed ENABLE ROW LEVEL SECURITY;');
    assert.throws(()=>verify(),e=>e.reason==='NO_POLICY_CONTROL_COUNT_MISMATCH','Do not silently accept a newly discovered no-policy target');
    sql('DROP TABLE private.unreviewed;');verify();
    assert.deepEqual(JSON.parse(sql('SELECT json_agg(row_to_json(s)) FROM auth.sessions s')),[
      {id:fixture.owner.sessionId,user_id:fixture.owner.id}]);
  }finally{
    if(created){
      const info=JSON.parse(docker(['inspect',name]))[0];
      assert.equal(info.Name,'/'+name);assert.equal(info.Config.Labels[label],run);
      assert.equal(info.HostConfig.NetworkMode,'none');assert.deepEqual(info.HostConfig.PortBindings,{});
      docker(['rm','-f',name]);
    }
  }
});

