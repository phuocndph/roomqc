import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../../'+file,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261021012120_email_admin_atomic_action_context.sql');
test('email actions fence live Auth/profile/session without merging platform role authority or exposing helper',()=>{
  const helper=sql.slice(0,sql.indexOf('CREATE OR REPLACE FUNCTION public.execute_email_admin_action'));
  let previous=-1;for(const part of ['FROM auth.users','FROM public.users','FROM auth.sessions']){
    const offset=helper.indexOf(part);assert.ok(offset>previous);previous=offset;
  }
  assert.equal((helper.match(/FOR SHARE/g)??[]).length,3);
  for(const part of ['VOLATILE SECURITY INVOKER',"SET search_path=''",'v_auth.deleted_at IS NOT NULL','v_auth.email_confirmed_at IS NULL',
    'v_auth.banned_until>clock_timestamp()','v_profile.is_super_admin IS DISTINCT FROM true',"v_profile.status IS DISTINCT FROM 'active'",
    'v_profile.deleted_at IS NOT NULL','COALESCE(v_profile.account_locked,false)','id=p_session AND user_id=p_actor',
    'v_session.not_after<=clock_timestamp()','FROM PUBLIC,anon,authenticated,service_role'])assert.ok(helper.includes(part),part);
  assert.equal(/FROM public.user_roles|user_metadata/.test(helper),false);
});
test('service-only action wrapper preserves bounded status, existing retry and server-owned test dedupe',()=>{
  for(const part of ['IF NOT public.rpc_request_is_trusted()','PERFORM private.lock_live_email_administrator(p_actor,p_session)',
    'ORDER BY created_at DESC,id DESC LIMIT 100','public.retry_roomqc_email(p_delivery_id,p_actor)',
    "floor(extract(epoch FROM clock_timestamp())/60)","'system_test'",'FROM PUBLIC,anon,authenticated,service_role',
    'GRANT EXECUTE ON FUNCTION public.execute_email_admin_action(uuid,uuid,text,uuid,text) TO service_role;'])assert.ok(sql.includes(part),part);
  assert.equal(/GRANT[^;]+TO (authenticated|anon|PUBLIC)/.test(sql),false);
  assert.equal(/CREATE TABLE|ALTER TABLE|DROP/.test(sql),false);
});
test('Edge action context follows verified preflight; provider and recipient gates precede server test enqueue',()=>{
  const source=read('supabase/functions/email-admin/index.ts');
  assert.ok(source.indexOf('await superAdmin(req, client)')<source.indexOf('verifiedEmailAdministratorContext(getBearerToken(req), user.id)'));
  assert.ok(source.includes('...fields, p_actor: context.actorId, p_session: context.sessionId, p_action: action'));
  assert.ok(source.includes("error?.code === '42501'"));
  const testStart=source.indexOf("if (body.action === 'test')"),test=source.slice(testStart);
  assert.ok(test.indexOf("config.provider === 'disabled'")<test.indexOf("await execute('test'"));
  assert.ok(test.indexOf('assertRecipient(config, email)')<test.indexOf("await execute('test'"));
  assert.equal(/client\.from\(|rpc\('retry_roomqc_email'|rpc\('enqueue_roomqc_email'/.test(source),false);
});
test('actual Edge fixture proves preflight races, state matrix, duplicate commands and both row-lock orders without external delivery',()=>{
  const source=read('scripts/control-backend-email-admin-checks.mjs');
  for(const part of ['actual-session-delete-after-preflight','DELETE FROM auth.sessions','platform-role-only-not-email-',
    'unconfirmed','auth-deleted','profile-deleted','null-status','email-admin-revoked','expired-session',
    'concurrent-retry-one-success','retry-one-queue-and-audit','same-minute-test-deduped-one-queue',
    'provider-disabled-and-recipient-allowlist-no-effects','pg_blocking_pids','profile-lock-after-preflight',
    'mutation-first-profile-revoke-waits','providerDelivery:false'])assert.ok(source.includes(part),part);
  const runner=read('scripts/test-control-backend-sandbox.mjs');
  assert.ok(runner.includes("state.phase='email_admin_action_checks'"));
  assert.ok(runner.includes("SUPABASE_URL:'http://api-gw:9080'"));
  assert.ok(runner.includes("ROOMQC_MAILPIT_URL:'http://api-gw:9'"));
});
