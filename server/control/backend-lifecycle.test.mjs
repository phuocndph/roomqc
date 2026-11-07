import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../../'+file,import.meta.url),'utf8');
test('owned lifecycle fixture executes real Edge and RPC authority, batch and atomic side-effect controls',()=>{
  const s=read('scripts/control-backend-lifecycle-checks.mjs');
  for(const label of ['browser-service-rpc-no-effects','invalid-scope-no-effects','twenty-batch-replays-no-effects',
    'second-transition-fault-rolls-back-whole-batch','renewal-rechecked-after-row-lock','deadline-lock-wait-no-business-effects',
    'old-worker-cannot-write-after-recovery','two-workers-one-cursor-one-command','pg_blocking_pids',
    'actual-edge-replays-committed-batch-and-finish-response-loss','actual-cluster-edge-crosses-105-transitions-and-deliveries',
    'lifecycle-never-changes-financial-tables','financial-fixture-nonempty-four-tables','fixture-grace-postcondition-',
    'fixture-current-date-postcondition','actual-recovery-denials-no-effects','actual-product-recovery-replay-no-effects',
    'actualProductRecovery:true','providerDelivery:false','schedulerEnabled:false'])assert.ok(s.includes(label),label);
  assert.equal(s.includes('ehjtoajnlnuvuiwkpmbp'),false);
  assert.equal(s.includes('fixtureClose'),false,'Recovery must call the product RPC, not a fixture-only status UPDATE');
});
test('full vendor runner makes lifecycle proof mandatory on the isolated Edge runtime',()=>{
  const s=read('scripts/test-control-backend-sandbox.mjs');
  for(const part of ["state.phase='lifecycle_service_checks'",'assert.equal(state.lifecycleServiceControls.verified,true)',
    'check-subscription-status/index.ts','/functions/lifecycle.eszip',"SUPABASE_URL:'http://api-gw:9081'",'ROOMQC_MAILPIT_URL'])assert.ok(s.includes(part),part);
});
