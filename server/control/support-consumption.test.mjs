import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {consumeSupportAcceptance,supportAttemptId} from './support-consumption.mjs';
import {commitSupportTransaction,supportCommandAuthorizer} from './support-authority.mjs';
import {fixtureSupportAcceptance} from './support-authority-fixtures.mjs';
const actor={id:randomUUID(),clusterId:'authority'};
const command=()=>({kind:'control',commandId:randomUUID(),operation:'cluster_command',target:'cluster-a',key:randomUUID().toUpperCase(),payloadHash:'a'.repeat(64)});
function fixture(){
 const audience=randomUUID(),queries=[],provider=[];
 const client={query:async(sql,args)=>{queries.push({sql,args});return {rows:sql.startsWith('SELECT audience')?[{audience}]:[]}}};
 const authorize=async()=>actor;authorize.acceptCommand=async scope=>{provider.push(scope);return fixtureSupportAcceptance(actor,scope)};
 return {client,authorize,queries,provider,audience};
}
test('directory acceptance requires a scoped provider and server-owned identity, never a caller receipt',async()=>{
 const f=fixture(),c=command();await assert.rejects(()=>consumeSupportAcceptance(f.client,actor,async()=>actor,c),{code:'SUPPORT_ACCEPTANCE_REQUIRED'});
 assert.equal(f.queries.length,0);
 await assert.rejects(()=>consumeSupportAcceptance({query:async()=>({rows:[]})},actor,f.authorize,c),{code:'SUPPORT_ACCEPTANCE_REQUIRED'});
 assert.equal(f.provider.length,0);
});
test('handoff binds the exact parent and persists the verified receipt before COMMIT',async()=>{
 const f=fixture(),c=command();await commitSupportTransaction(f.client,actor,f.authorize,c);
 assert.equal(f.provider.length,1);assert.equal(f.provider[0].audience,f.audience);assert.equal(f.provider[0].key,c.key);
 const insert=f.queries.find(q=>q.sql.startsWith('INSERT'));assert.ok(insert.sql.includes('control_command_id'));assert.equal(insert.args.at(-1),c.commandId);
 assert.equal(insert.args[3],actor.id);assert.equal(insert.args[4],actor.clusterId);assert.equal(insert.args[9],c.key);
 assert.equal(f.queries.at(-1).sql,'COMMIT');
});
test('attempt identity survives retries and changed body conflicts at the same attempt rather than renewing',()=>{
 const c=command(),a=supportAttemptId(actor,c);
 assert.equal(supportAttemptId(actor,{...c,commandId:randomUUID()}),a);
 assert.equal(supportAttemptId(actor,{...c,payloadHash:'b'.repeat(64)}),a);
 for(const patch of [{key:c.key.toLowerCase()},{target:'cluster-b'},{operation:'register_cluster'}])assert.notEqual(supportAttemptId(actor,{...c,...patch}),a);
});
test('mismatched receipt scope cannot insert a consumption or commit',async()=>{
 const f=fixture();f.authorize.acceptCommand=async scope=>({...fixtureSupportAcceptance(actor,scope),audience:randomUUID()});
 await assert.rejects(()=>commitSupportTransaction(f.client,actor,f.authorize,command()),{code:'SUPPORT_ACCEPTANCE_INVALID'});
 assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT')||q.sql==='COMMIT'),false);
});
test('handoff uses remote remaining lifetime and elapsed RPC time, independent of local wall-clock skew',async()=>{
 const f=fixture();f.authorize.acceptCommand=async scope=>{
  const r=fixtureSupportAcceptance(actor,scope);r.acceptedAtMs=1000000;r.observedAtMs=1004900;r.expiresAtMs=1005000;
  await new Promise(resolve=>setTimeout(resolve,130));return r;
 };
 await assert.rejects(()=>commitSupportTransaction(f.client,actor,f.authorize,command()),{code:'SUPPORT_ACCEPTANCE_EXPIRED'});
 assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT')||q.sql==='COMMIT'),false);
});
test('SQL delay after receipt acquisition is included before commit, and current rights remain required on replay',async()=>{
 const f=fixture(),query=f.client.query;f.authorize.acceptCommand=async scope=>{
  const r=fixtureSupportAcceptance(actor,scope);return {...r,observedAtMs:r.expiresAtMs-100};
 };
 f.client.query=async(sql,args)=>{if(sql.startsWith('INSERT'))await new Promise(resolve=>setTimeout(resolve,130));return query(sql,args)};
 await assert.rejects(()=>commitSupportTransaction(f.client,actor,f.authorize,command()),{code:'SUPPORT_ACCEPTANCE_EXPIRED'});
 assert.equal(f.queries.some(q=>q.sql==='COMMIT'),false);
 await assert.rejects(()=>commitSupportTransaction(f.client,actor,async()=>{throw Object.assign(Error('revoked'),{code:'fixture-revoked'})}),{code:'SUPPORT_AUTHORITY_UNAVAILABLE'});
});
test('production authorizer forwards the operator token only to the canonical verified gateway',async()=>{
 const calls=[],gateway={supportActor:async token=>{calls.push(token);return actor},acceptSupportCommand:async(a,token,scope)=>{
  assert.deepEqual(a,actor);calls.push(token);return fixtureSupportAcceptance(a,scope);
 }};
 const authorize=supportCommandAuthorizer(gateway,actor,'operator-token');await authorize();await authorize.acceptCommand({});
 assert.deepEqual(calls,['operator-token','operator-token']);assert.equal(JSON.stringify(authorize),undefined);
});
