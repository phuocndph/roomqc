import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildRegistrationSessionChecks} from '../../scripts/control-backend-registration-sessions.mjs';
const actor=()=>({id:randomUUID(),sessionId:randomUUID(),workspaceId:randomUUID()});
test('registration SQL controls cover all three paths, live account/session and rollback',()=>{
  const source=buildRegistrationSessionChecks(actor());
  for(const part of ['registration_actor()','complete_registration(','provision_workspace_registration(',
    'registrationSessionId','auth-deleted','profile-deleted','banned','unconfirmed','locked','inactive','null-status','staff-profile','admin-profile',
    'wrong-session','missing-session','expired-session','owner-role-revoked','DIRECTORY_GATE_REQUIRED','denials<>39','ROLLBACK;']){
    assert.ok(source.includes(part),part);
  }
});
test('registration SQL controls reject missing or non-UUID installer inputs',()=>{
  assert.throws(()=>buildRegistrationSessionChecks());
  for(const key of ['id','sessionId','workspaceId'])assert.throws(()=>buildRegistrationSessionChecks({...actor(),[key]:'not-a-uuid'}));
});
