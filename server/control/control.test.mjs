import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { loadConfig } from './config.mjs';
import { validateSlug } from './store.mjs';
import { ClusterGateway } from './cluster.mjs';
import { createControlServer } from './app.mjs';

function configuration() {
  return {NODE_ENV:'test',ROOMQC_CONTROL_ALLOW_LOCAL:'true',ROOMQC_CONTROL_SIGNUP_ENABLED:'true',ROOMQC_CONTROL_DATABASE_URL:'postgresql://test@localhost/test',
    ROOMQC_CONTROL_EMAIL_HASH_KEY:'test-key-'.repeat(6),ROOMQC_PUBLIC_URL:'http://localhost:8082',
    ROOMQC_CONTROL_CLUSTERS:JSON.stringify([{id:'cluster-a',url:'http://127.0.0.1:54321',publishableKey:'public',serviceKey:'server-secret',vapidPublicKey:'public-vapid',maxWorkspaces:10}])};
}

test('registry validates origins, public keys, cluster IDs, production TLS and shared push key',()=>{
  const env=configuration(); assert.equal(loadConfig(env).clusters.length,1);
  assert.equal(loadConfig({...env,ROOMQC_CONTROL_SIGNUP_ENABLED:undefined}).signupEnabled,false);
  assert.equal(loadConfig(env).supportClusterId,null);
  assert.equal(loadConfig(env).port,8091);
  assert.equal(loadConfig(env).poolMax,5);
  assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_POOL_MAX:'20',ROOMQC_CONTROL_POOL_BUDGET:'20'}));
  assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_SHUTDOWN_TIMEOUT_MS:'0'}));
  assert.equal(loadConfig({...env,ROOMQC_CONTROL_SUPPORT_CLUSTER_ID:'cluster-a'}).supportClusterId,'cluster-a');
  assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_SUPPORT_CLUSTER_ID:'injected-cluster'}));
  for(const port of ['0','-1','bad','65536']) assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_PORT:port}));
  assert.throws(()=>loadConfig({...env,NODE_ENV:'production'}));
  assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_EMAIL_HASH_KEY:'short'}));
  assert.equal(loadConfig(env).reservationMinutes,1440);
  for(const key of ['ROOMQC_CONTROL_RESERVATION_MINUTES','ROOMQC_CONTROL_SIGNUP_HOUR_LIMIT','ROOMQC_CONTROL_EMAIL_DAY_LIMIT']) {
    for(const value of ['0','abc','1.5','1000000'])assert.throws(()=>loadConfig({...env,[key]:value}));
  }
  const clusters=JSON.parse(env.ROOMQC_CONTROL_CLUSTERS);
  for(const change of [{url:'http://external.invalid'},{publishableKey:'sb_secret_private'},{url:'https://example.com/api'},{id:'bad/id'},{maxWorkspaces:0},
    {publishableKey:`e.${Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')}.s`}]) {
    assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_CLUSTERS:JSON.stringify([{...clusters[0],...change}])}));
  }
  assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_CLUSTERS:JSON.stringify([...clusters,{...clusters[0],id:'cluster-b',vapidPublicKey:'other'}])}));
  const internalUrl='http://host.docker.internal:54321';
  assert.equal(loadConfig({...env,ROOMQC_CONTROL_CLUSTERS:JSON.stringify([{...clusters[0],internalUrl}])}).clusters[0].internalUrl,internalUrl);
  for(const internalUrl of ['http://metadata.google.internal','http://169.254.169.254','http://host.docker.internal:54321/path','https://user:password@example.invalid']){
    assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_CLUSTERS:JSON.stringify([{...clusters[0],internalUrl}])}));
  }
});

test('slug validation rejects ambiguous, reserved and non-ASCII slugs',()=>{
  assert.equal(validateSlug('an-thuy-01'),'an-thuy-01');
  for(const slug of ['app','admin','api','ABC','an--thuy','abc-','a','an_thuy','ánthuy','../abc','a/bc']) assert.throws(()=>validateSlug(slug));
});

test('gateway uses the selected cluster, validates Auth remotely, and never sends server credentials on user requests',async()=>{
  const config=loadConfig(configuration());
  const calls=[];
  const gateway=new ClusterGateway(config,async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({id:'user',email:'owner@example.com',email_confirmed_at:'2026-10-15'}),{status:200})});
  const workspace={cluster_id:'cluster-a',api_url:'http://127.0.0.1:54321'};
  await gateway.user(workspace,'user-token');
  assert.equal(calls[0].url,'http://127.0.0.1:54321/auth/v1/user');
  assert.equal(calls[0].init.headers.Authorization,'Bearer user-token');
  assert.equal(calls[0].init.headers.apikey,'public');
  await gateway.binding({...workspace,id:'workspace'});
  assert.equal(calls[1].init.headers.apikey,'server-secret');
  assert.throws(()=>gateway.cluster({...workspace,api_url:'https://injected.invalid'}));
  await assert.rejects(()=>gateway.user(workspace,''));
  config.clusters[0].internalUrl='http://host.docker.internal:54321';
  await gateway.binding({...workspace,id:'workspace'});
  assert.ok(calls.at(-1).url.startsWith('http://host.docker.internal:54321/'));
});

test('HTTP boundary rejects origin spoofing, unauthenticated provisioning and strips privileged body fields',async()=>{
  const config=loadConfig(configuration());
  const workspace={id:'workspace',slug:'anthuy',display_name:'An Thuy',email_hash:'owner',cluster_id:'cluster-a',api_url:'http://127.0.0.1:54321',status:'reserved'};
  let received;
  const store={pool:{query:async()=>{}},workspace:async()=>workspace,hashEmail:email=>email==='owner@example.com'?'owner':'other',
    reserve:async()=>workspace,activate:async()=>workspace,beginProvision:async()=>workspace,audit:async()=>{}};
  const gateway={binding:async()=>null,user:async(w,token)=>{if(token!=='valid')throw Object.assign(new Error('auth'),{status:401});return{id:'owner-id',email:'owner@example.com'}},
    provision:async(w,user,fields)=>{received=fields;return{success:true,tenant_id:'tenant',hotel_id:'hotel',owner_id:user.id}}};
  const server=createControlServer({config,store,gateway}); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/api/control`;
  const post=(path,body,headers={})=>fetch(`${base}${path}`,{method:'POST',headers:{Origin:config.publicOrigin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  try{
    config.signupEnabled=false;
    assert.equal((await post('/signup-intents',{})).status,503);
    config.signupEnabled=true;
    assert.equal((await post('/signup-intents',{}, {Origin:'https://other.invalid'})).status,403);
    assert.equal((await post('/signup-intents',{}, {'Content-Type':'text/plain'})).status,415);
    assert.equal((await post('/workspaces/anthuy/provision',{})).ok,false);
    const response=await post('/workspaces/anthuy/provision',{tenantName:'An Thuy',p_owner_id:'forged',role:'super_admin',subscription_status:'active'},{Authorization:'Bearer valid'});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(received.tenantName,'An Thuy');assert.equal(received.p_owner_id,undefined);assert.equal(received.role,undefined);
    received=undefined;
    store.beginProvision=async()=>{throw new Error('Directory write unavailable')};
    assert.equal((await post('/workspaces/anthuy/provision',{}, {Authorization:'Bearer valid'})).status,503);
    assert.equal(received,undefined,'Remote provisioning must not start before the durable reservation gate');
    const text=await (await fetch(`${base}/workspaces/anthuy/bootstrap`)).text();
    assert.equal(text.includes('server-secret'),false);assert.equal(text.includes('email_hash'),false);
    assert.equal((await post('/signup-intents',{large:'x'.repeat(17000)})).status,413);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
