import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const candidate=read('20261020093925_platform_mutation_live_session_fencing.sql');
const fn=(source,name)=>{
  const start=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'('),end=source.indexOf('$fn$;',start);
  assert.ok(start>=0&&end>start,name);return source.slice(start,end+5);
};
test('sensitive mutations fence live Auth, profile, role and session in the reviewed lock order without new browser helper privileges',()=>{
  const helper=fn(candidate,'private.lock_live_role_actor');
  const tokens=['FROM auth.users','FROM public.users','FROM public.user_roles','FROM auth.sessions'];
  let previous=-1;for(const token of tokens){const offset=helper.indexOf(token);assert.ok(offset>previous,token);previous=offset}
  assert.equal((helper.match(/FOR SHARE/g)??[]).length,4);
  for(const token of ["VOLATILE SECURITY INVOKER SET search_path=''","v_auth.deleted_at IS NOT NULL","v_auth.email_confirmed_at IS NULL",
    "v_auth.banned_until>now()","v_profile.status IS DISTINCT FROM 'active'","v_profile.deleted_at IS NOT NULL",
    'COALESCE(v_profile.account_locked,false)',"role::text=p_role","id::text=auth.jwt()->>'session_id'",
    '(not_after IS NULL OR not_after>now())'])assert.ok(helper.includes(token),token);
  assert.ok(candidate.includes('REVOKE ALL ON FUNCTION private.lock_live_role_actor(text) FROM PUBLIC,anon,authenticated,service_role;'));
  assert.equal(/GRANT[^;]*lock_live_role_actor/i.test(candidate),false);
  assert.equal(/user_metadata/.test(helper),false);
  assert.equal((candidate.match(/PERFORM private.lock_live_role_actor\(/g)??[]).length,9);
});
test('forward replacements preserve reviewed business behavior and existing endpoint grants',()=>{
  const cases=[
    ['20261015133049_hotel_setup_rooms.sql','public.save_hotel_room_setup','owner'],
    ['20261015133049_hotel_setup_rooms.sql','public.complete_hotel_room_setup','owner'],
    ['20261017043645_subscription_quotes_foundation.sql','public.create_subscription_quote','owner'],
    ['20261017061421_subscription_checkout_drafts.sql','public.create_subscription_checkout_draft','owner'],
    ['20261017032842_tenant_entitlement_permissions.sql','public.admin_manage_tenant','super_admin'],
    ['20261017063536_subscription_checkout_client_cutover.sql','public.settle_subscription_payment','super_admin'],
    ['20261017063536_subscription_checkout_client_cutover.sql','public.cancel_subscription_payment','owner'],
    ['20261017145741_subscription_reconciliation_cases_foundation.sql','public.admin_mutate_subscription_reconciliation_case','super_admin'],
    ['20261018012924_subscription_job_recovery_monitor.sql','public.admin_recover_subscription_status_run','super_admin']
  ];
  for(const [file,name,role]of cases){
    const original=read(file).replace('CREATE FUNCTION '+name+'(','CREATE OR REPLACE FUNCTION '+name+'(');
    let expected=fn(original,name);
    if(name.endsWith('admin_manage_tenant'))expected=expected.replace(/  IF auth\.uid\(\) IS NULL[\s\S]*?  END IF;\n/,"  PERFORM private.lock_live_role_actor('super_admin');\n");
    else if(name.endsWith('settle_subscription_payment'))expected=expected.replace(/  IF NOT public\.rpc_request_is_trusted\(\) AND[\s\S]*?  END IF;\n/,"  IF NOT public.rpc_request_is_trusted() THEN\n    PERFORM private.lock_live_role_actor('super_admin');\n  END IF;\n");
    else if(name.endsWith('cancel_subscription_payment'))expected=expected.replace('  v_invoice public.invoices%ROWTYPE;','  v_invoice public.invoices%ROWTYPE;\n  v_owner_tenant uuid;')
      .replace('BEGIN\n',"BEGIN\n  IF NOT public.rpc_request_is_trusted() THEN\n    PERFORM private.lock_live_role_actor('owner');\n    v_owner_tenant := private.subscription_quote_actor();\n  END IF;\n")
      .replace('IF private.subscription_quote_actor() IS DISTINCT FROM v_payment.tenant_id THEN','IF v_owner_tenant IS DISTINCT FROM v_payment.tenant_id THEN');
    else if(name.includes('admin_'))expected=expected.replace('  v_actor := private.require_reconciliation_case_actor();',"  PERFORM private.lock_live_role_actor('super_admin');\n  v_actor := private.require_reconciliation_case_actor();");
    else if(name.includes('subscription')){
      const variable=name.endsWith('create_subscription_quote')?'v_tenant_id':'v_tenant';
      expected=expected.replace(variable+' uuid := private.subscription_quote_actor();',variable+' uuid;')
        .replace('BEGIN\n',"BEGIN\n  PERFORM private.lock_live_role_actor('owner');\n  "+variable+" := private.subscription_quote_actor();\n");
    }else expected=expected.replace('  v_tenant := private.room_setup_owner(p_hotel_id);',"  PERFORM private.lock_live_role_actor('owner');\n  v_tenant := private.room_setup_owner(p_hotel_id);");
    assert.equal(fn(candidate,name),expected,name+' changes only reviewed authorization/fencing');
  }
  assert.equal(/GRANT EXECUTE ON FUNCTION public/.test(candidate),false);
  assert.equal(/ALTER FUNCTION|DROP FUNCTION/.test(candidate),false);
});
test('owned caller harness covers public mutation roots, invalid live states, snapshots, logout replay and real lock overlap',()=>{
  const source=readFileSync(new URL('../../scripts/control-backend-mutation-checks.mjs',import.meta.url),'utf8');
  for(const token of ['unconfirmed','banned','auth-deleted','profile-deleted','locked','inactive','null-status','role-revoked','expired-session',
    'complete_hotel_room_setup','create_subscription_checkout_draft','admin_manage_tenant','settle_subscription_payment',
    'cancel_subscription_payment','admin_mutate_subscription_reconciliation_case','admin_recover_subscription_status_run',
    'pg_blocking_pids','wait_event_type','no-side-effects','logout-before-replay','providerEnabled:false',
    "initialRecoveryExecutionVerified:true","trustedServiceDraftStillNonPayable:true"])assert.ok(source.includes(token),token);
});
test('caller proof requires actual job recovery/replay and both authority serialization orders without renewing entitlement',()=>{
  const source=readFileSync(new URL('../../scripts/control-backend-mutation-checks.mjs',import.meta.url),'utf8');
  for(const token of ['begin_atomic_subscription_status_run','deadline_at::text AS deadline','actual-recovery-positive',
    'actual-recovery-replay-no-side-effects',"'role-revoke'","'session-delete'",'mutation-first-race',
    'pg_blocking_pids(pid)','mutationCommittedBeforeRevocation:true','nextCommandDenied:true',
    'reactivation-does-not-renew-subscription-or-trial','recoveryReplayNoSideEffects:true'])assert.ok(source.includes(token),token);
  assert.ok(source.includes("entitlementBefore.subscription_end_date===null?'trial':'active'"));
});
