import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ClusterGateway } from './cluster.mjs';
import { bindingMatches, supportSnapshot } from './store.mjs';
import { reconcileSupport } from './support.mjs';
import { runSupport } from './support-cli.mjs';

test('receipt validation checks all binding fields and never serializes secrets',()=>{
  const workspace={id:randomUUID(),owner_id:randomUUID(),tenant_id:randomUUID(),hotel_id:randomUUID(),email_hash:'secret'};
  const binding={workspace_id:workspace.id,owner_id:workspace.owner_id,tenant_id:workspace.tenant_id,hotel_id:workspace.hotel_id};
  assert.ok(bindingMatches(workspace,binding));
  for(const key of Object.keys(binding)) assert.equal(bindingMatches(workspace,{...binding,[key]:randomUUID()}),false);
  for(const key of ['owner_id','tenant_id','hotel_id']) assert.equal(bindingMatches(workspace,{...binding,[key]:null}),false);
  assert.equal(supportSnapshot(workspace).email_hash,undefined);
});

test('support authorization always uses the configured canonical cluster with user credentials',async()=>{
  const calls=[];const actorId=randomUUID();
  const config={supportClusterId:'authority',clusters:[{id:'authority',url:'https://authority.invalid',publishableKey:'public',serviceKey:'private'},
    {id:'tenant',url:'https://tenant.invalid',publishableKey:'tenant-public',serviceKey:'tenant-private'}]};
  const gateway=new ClusterGateway(config,async(url,init)=>{calls.push({url,init});return Response.json(actorId)});
  assert.deepEqual(await gateway.supportActor('user-session'),{id:actorId,clusterId:'authority'});
  assert.equal(calls[0].url,'https://authority.invalid/rest/v1/rpc/platform_support_actor');
  assert.equal(calls[0].init.headers.apikey,'public');
  assert.equal(calls[0].init.headers.Authorization,'Bearer user-session');
  assert.equal(calls[0].init.body,'{}');
  config.supportClusterId=null;
  await assert.rejects(()=>gateway.supportActor('user-session'),{code:'SUPPORT_DISABLED'});
  assert.equal(calls.length,1);
});

test('support never probes or mutates without durable started audit and expected identity',async()=>{
  const workspace={id:randomUUID(),routing_version:1,status:'provisioning',owner_id:randomUUID()};
  let probes=0,mutations=0,failures=0;
  const store={supportFind:async()=>workspace,startSupportAction:async()=>{throw new Error('Audit unavailable')},
    activate:async()=>mutations++,failSupportAction:async()=>failures++};
  const gateway={binding:async()=>probes++};
  const body={query:'example-hotel',workspaceId:workspace.id,routingVersion:1,reason:'Support request'};
  await assert.rejects(()=>reconcileSupport(store,gateway,{},body,randomUUID()),/Audit unavailable/);
  assert.equal(probes,0);assert.equal(mutations,0);
  store.startSupportAction=async()=>randomUUID();
  await assert.rejects(()=>reconcileSupport(store,gateway,{},{...body,routingVersion:2},randomUUID()),{code:'WORKSPACE_CHANGED'});
  assert.equal(probes,0);assert.equal(failures,1);
});

test('support CLI uses explicit intent and private environment token, with safe origin and errors',async()=>{
  const calls=[];
  const env={ROOMQC_SUPPORT_ACCESS_TOKEN:'confidential',ROOMQC_PUBLIC_URL:'https://roomqc.com',ROOMQC_CONTROL_URL:'https://roomqc.com'};
  const fetcher=async(url,init)=>{calls.push({url,init});return Response.json({workspace:{slug:'an-thuy'}})};
  assert.deepEqual(await runSupport(['lookup','--query','an-thuy'],env,fetcher),{workspace:{slug:'an-thuy'}});
  assert.equal(calls[0].url,'https://roomqc.com/api/control/support/lookup');
  assert.equal(calls[0].init.headers.Origin,'https://roomqc.com');
  assert.equal(calls[0].init.headers.Authorization,'Bearer confidential');
  assert.equal(calls[0].init.redirect,'error');
  for(const args of [[],['delete'],['lookup','--token','bad'],['lookup','--query','a','--query','b'],['reconcile','--query','an-thuy']]) {
    await assert.rejects(()=>runSupport(args,env,fetcher));
  }
  for(const url of ['http://external.invalid','https://user:secret@example.com','https://example.com/path']) {
    await assert.rejects(()=>runSupport(['lookup','--query','an-thuy'],{...env,ROOMQC_CONTROL_URL:url},fetcher));
  }
  await assert.rejects(()=>runSupport(['lookup','--query','an-thuy'],{},fetcher));
  await assert.rejects(()=>runSupport(['lookup','--query','an-thuy'],env,async()=>Response.json(
    {message:'Not authorized',requestId:'test-id'},{status:401})),/Not authorized \(Mã hỗ trợ: test-id\)/);
  assert.equal(calls.length,1,'Invalid local arguments never contact a service');
});
