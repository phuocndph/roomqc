import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../../'+file,import.meta.url),'utf8');
test('owned provider proof exercises signatures, immutable identity, queue and failure recovery on actual Edge',()=>{
  const s=read('scripts/control-backend-email-provider-checks.mjs');
  for(const label of ['missing-signature','wrong-signature','tampered-raw-body','expired-timestamp','oversize-body',
    'signed-malformed','signed-unsupported','signed-valid','exact-duplicate-no-effects',
    'same-event-different-provider-no-effects','same-event-different-type-no-effects','unknown-before-bind',
    'unknown-event-bind-race-no-stranded-event','provider_unknown_bind_race','pg_blocking_pids',
    'terminal-precedence','concurrent-delivery-event-lock-order','claim-lease-fencing',
    'queue-retryable-provider-failure','queue-permanent-provider-failure','accepted-provider-response-loss',
    'durable-finish-response-loss','callback-business-effect-allowlist','providerInternet:false',
    'actualWebhook:true','actualConsumer:true'])assert.ok(s.includes(label),label);
  assert.equal(s.includes('ehjtoajnlnuvuiwkpmbp'),false,'Never address the serving inbox');
});
test('provider build and proof are mandatory before subsequent business checks and in rebuild comparison',()=>{
  const s=read('scripts/test-control-backend-sandbox.mjs');
  for(const part of ['email-provider-webhook/index.ts','process-email-queue/index.ts','state.providerBuild',
    "state.phase='email_provider_checks'",'assert.equal(state.emailProviderControls.verified,true)',
    'previous.providerBuild,state.providerBuild','ROOMQC_EMAIL_WEBHOOK_SECRET'])assert.ok(s.includes(part),part);
  assert.ok(s.indexOf("state.phase='email_provider_checks'")<s.indexOf("state.phase='email_admin_action_checks'"));
  assert.ok(s.indexOf("emit('backend_email_provider_verified'")<s.indexOf("state.phase='hotel_delete_checks'"),
    'Hotel provisioning creates real queue messages and must follow the provider empty-queue drill');
});
test('provider SQL fences immutable identity after delivery lock and preserves early-event replay and service-only grants',()=>{
  const s=read('supabase/migrations/20261021032705_email_provider_immutable_event_identity.sql');
  assert.ok(s.indexOf('WHERE provider_id=p_provider_id FOR UPDATE')<s.indexOf('INSERT INTO public.email_provider_events'));
  for(const part of ['ON CONFLICT(event_id) DO NOTHING','v_event.provider_id IS DISTINCT FROM p_provider_id',
    'v_event.event_type IS DISTINCT FROM p_type',"ERRCODE='PT409'",'IF v_row.id IS NULL THEN RETURN true',
    'IF v_row.status=v_status THEN RETURN true','FROM PUBLIC,anon,authenticated,service_role',
    'TO service_role','SET search_path=\'\''])assert.ok(s.includes(part),part);
  assert.equal(/GRANT[^;]+TO (PUBLIC|anon|authenticated)/.test(s),false);
  const functions=s.split('CREATE OR REPLACE FUNCTION public.').slice(1);
  assert.equal(functions.length,2);
  for(const fn of functions){
    assert.ok(fn.indexOf('pg_advisory_xact_lock')<fn.indexOf('FOR UPDATE'));
    assert.ok(fn.includes("hashtextextended('roomqc-email-provider:'||p_provider_id,0)"));
  }
  const edge=read('supabase/functions/email-provider-webhook/index.ts');
  assert.ok(edge.includes("error?.code === 'PT409'"));
});
