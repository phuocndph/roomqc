import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {buildActorSessionChecks} from '../../scripts/control-backend-actor-session-checks.mjs';
const fixture=()=>({owner:{id:randomUUID(),tenantId:randomUUID(),hotelId:randomUUID(),sessionId:randomUUID()},
  admin:{id:randomUUID(),tenantId:randomUUID(),hotelId:randomUUID(),sessionId:randomUUID()}});
test('owned actor checks distinguish Auth/profile deletion and null/locked/session state with rollback positives',()=>{
  const source=buildActorSessionChecks(fixture());
  for(const text of ['email_confirmed_at=NULL','banned_until=','not_after=','wrong-session','missing-session',
    'platform_support_actor()','email_admin_actor()','private.subscription_quote_actor()','private.room_setup_owner(',
    'UPDATE auth.users SET deleted_at=now()','UPDATE public.users SET deleted_at=now()',
    'account_locked=true',"status='inactive'",'status=NULL','DELETE FROM auth.sessions',
    "denials<>44","WHEN SQLSTATE 'Z0001'","ROLLBACK;"]){assert.ok(source.includes(text),text)}
});
test('actor session check builder rejects missing or untrusted SQL inputs before execution',()=>{
  assert.throws(()=>buildActorSessionChecks());
  for(const actor of ['owner','admin'])for(const key of ['id','tenantId','hotelId','sessionId']){
    const input=fixture();input[actor][key]="'; SELECT 1; --";assert.throws(()=>buildActorSessionChecks(input));
  }
});
