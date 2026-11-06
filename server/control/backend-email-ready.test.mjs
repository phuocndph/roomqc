import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildEmailReadyChecks} from '../../scripts/control-backend-email-ready-checks.mjs';
const actor=()=>({id:randomUUID(),tenantId:randomUUID(),hotelId:randomUUID()});
const fixture=()=>({owner:actor(),emailFixtures:[{...actor(),path:'/auth/login'},
  {...actor(),path:'/app/owned-fixture/auth/login'},{...actor(),path:'/auth/login'}]});
test('email-ready SQL controls use fresh events, real trigger, queue and rollback without disabling guards',()=>{
  const source=buildEmailReadyChecks(fixture());
  for(const part of ['pg_trigger','EMAIL_READY_EVENT_MUST_BE_FRESH','pgmq.q_transactional_emails','EMAIL_READY_HTTP_REGISTRATION_QUEUE',
    'null-status','null-level','banned','auth-deleted','profile-deleted','locked','inactive','staff-role','staff-level',
    'not-primary','null-primary','platform-profile','email-mismatch','wrong-hotel','inactive-hotel','missing-hotel','owner-role-revoked',
    'EMAIL_READY_INVALID_STATE_ENQUEUED','EMAIL_READY_DUPLICATE_QUEUE','EMAIL_READY_ROLLBACK_CHANGED_ROWS',
    'deny_count<>18','positive_count<>23','ROLLBACK;'])assert.ok(source.includes(part),part);
  assert.doesNotMatch(source,/DISABLE\s+TRIGGER|session_replication_role|DELETE FROM public\.email_deliveries/i);
});
test('email-ready SQL builder rejects unsafe installer identity/path inputs',()=>{
  assert.throws(()=>buildEmailReadyChecks());
  for(const key of ['id','tenantId','hotelId'])assert.throws(()=>buildEmailReadyChecks({...fixture(),owner:{...actor(),[key]:"' OR true"}}));
  for(const path of ['https://outside.invalid','/app/../auth/login',"/auth/login';SELECT 1;--"]){
    const f=fixture();f.emailFixtures[0].path=path;assert.throws(()=>buildEmailReadyChecks(f));
  }
  const f=fixture();f.emailFixtures[1].id='invalid';assert.throws(()=>buildEmailReadyChecks(f));
});
