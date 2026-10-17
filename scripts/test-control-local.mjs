// Real HTTP -> directory PostgreSQL -> local Supabase Auth/RPC/RLS.
// Owns one temporary PostgreSQL container and only explicitly identified test users.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ControlStore } from '../server/control/store.mjs';
import { ClusterGateway } from '../server/control/cluster.mjs';
import { createControlServer } from '../server/control/app.mjs';
import { runSupport } from '../server/control/support-cli.mjs';
import { reconcileSupport } from '../server/control/support.mjs';

const statusText=process.platform==='win32'
  ? execFileSync('cmd.exe',['/d','/s','/c','npx supabase status --output json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})
  : execFileSync('npx',['supabase','status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const local=JSON.parse(statusText.slice(statusText.indexOf('{')));
for(const value of [local.API_URL,local.DB_URL]) assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(value).hostname),'Only local Supabase is allowed');
const credentials={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(local.API_URL,local.SERVICE_ROLE_KEY,credentials);
const anon=createClient(local.API_URL,local.ANON_KEY,credentials);
const ownedUsers=[];const ownedTenants=[];
const container=`roomqc-control-test-${randomUUID().slice(0,8)}`;
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
let started=false,store,server,clusterDb,checks=0,previousDirectoryRequired;
const check=(condition,message)=>{assert.ok(condition,message);checks++;console.log(`PASS ${message}`)};
const options={signupEnabled:true,supportClusterId:'cluster-a',publicOrigin:'http://localhost:8082',emailKey:randomUUID(),clusters:[{id:'cluster-a',url:new URL(local.API_URL).origin,
  publishableKey:local.ANON_KEY,serviceKey:local.SERVICE_ROLE_KEY,vapidPublicKey:'local-test-vapid',maxWorkspaces:100}]};

async function createOwner(verified=true){
  const email=`control-test-${randomUUID()}@example.invalid`;const password=`QC!${randomUUID()}a9`;
  const created=await admin.auth.admin.createUser({email,password,email_confirm:verified});assert.ifError(created.error);
  ownedUsers.push(created.data.user.id);
  if(!verified)return{id:created.data.user.id,email};
  const client=createClient(local.API_URL,local.ANON_KEY,credentials);
  const login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);
  return{id:created.data.user.id,email,token:login.data.session.access_token,client};
}
try{
  // Tests must exercise the current migrated schema. Replaying the original
  // directory migration here used to overwrite later invitation/email guards.
  // Fail with a prerequisite instead of silently downgrading live local RPCs.
  clusterDb=new ControlStore({...options,databaseUrl:local.DB_URL});
  const prerequisites=await clusterDb.pool.query(`SELECT
    to_regclass('private.workspace_provisioning') IS NOT NULL AS receipt_exists,
    to_regprocedure('public.platform_support_actor()') IS NOT NULL AS support_guard,
    position('roomqc.email_workspace_slug' IN pg_get_functiondef(
      'public.provision_workspace_registration(uuid,uuid,jsonb)'::regprocedure))>0 AS email_guard,
    position('staff_invitations' IN pg_get_functiondef(
      'public.complete_registration(uuid,text,text,text,text,text,text,text,text,integer)'::regprocedure))>0 AS invite_guard`);
  assert.ok(prerequisites.rows[0].receipt_exists&&prerequisites.rows[0].support_guard&&prerequisites.rows[0].email_guard&&prerequisites.rows[0].invite_guard,
    'Apply current local migrations before control tests; do not replay legacy RPC definitions');
  previousDirectoryRequired=(await clusterDb.pool.query('SELECT directory_required FROM private.roomqc_cluster_config WHERE singleton')).rows[0].directory_required;
  await clusterDb.pool.query('UPDATE private.roomqc_cluster_config SET directory_required=true WHERE singleton');
  const password=randomUUID();
  docker('run','-d','--name',container,'-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=roomqc_control','-p','127.0.0.1::5432','postgres:16-alpine');started=true;
  const port=docker('port',container,'5432/tcp').split(':').at(-1);
  store=new ControlStore({...options,databaseUrl:`postgresql://postgres:${password}@127.0.0.1:${port}/roomqc_control`});
  for(let i=0;i<40;i++){try{await store.pool.query('SELECT 1');break}catch(error){if(i===39)throw error;await new Promise(resolve=>setTimeout(resolve,500))}}
  await store.migrate();
  const gateway=new ClusterGateway(options);
  server=createControlServer({config:options,store,gateway});server.listen(0,'127.0.0.1');await once(server,'listening');
  const api=`http://127.0.0.1:${server.address().port}/api/control`;
  const post=async(path,body,token)=>fetch(`${api}${path}`,{method:'POST',headers:{Origin:options.publicOrigin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  const owner=await createOwner();const outsider=await createOwner();
  const slug=`test-${randomUUID().slice(0,8)}`;
  const reservation={slug,email:owner.email,displayName:'Test An Thủy'};
  const attempts=await Promise.all(Array.from({length:20},()=>post('/signup-intents',reservation)));
  check(attempts.every(r=>r.status===201),'Concurrent reservation retries share one workspace');
  const workspaces=await store.pool.query('SELECT * FROM roomqc_control.workspaces WHERE slug=$1',[slug]);
  check(workspaces.rowCount===1,'One durable directory row is created');
  const workspaceId=workspaces.rows[0].id;
  check(workspaces.rows[0].expires_at && new Date(workspaces.rows[0].expires_at)>Date.now(),'New reservations have a server-defined expiry');
  const sameIntent=await store.reserve(reservation,randomUUID());
  check(sameIntent.id===workspaceId&&sameIntent.expires_at.getTime()===workspaces.rows[0].expires_at.getTime(),'Retry does not extend the reservation deadline');
  check((await post('/signup-intents',{...reservation,email:outsider.email})).status===409,'Another email cannot claim a reserved slug');
  const bootstrap=await(await fetch(`${api}/workspaces/${slug}/bootstrap`)).json();
  check(bootstrap.workspace.status==='reserved' && bootstrap.cluster.id==='cluster-a','Bootstrap selects the assigned cluster before onboarding');
  const serialized=JSON.stringify(bootstrap);
  check(!serialized.includes(local.SERVICE_ROLE_KEY)&&!serialized.includes(owner.email)&&!serialized.includes('email_hash'),'Bootstrap exposes no server key, owner email, or email hash');
  const fields={fullName:'Test Owner',phone:'0901234567',tenantName:'Test Company',hotelName:'Test Hotel',hotelAddress:'123 Test Road',hotelPhone:'0281234567',hotelEmail:owner.email,totalRooms:12};
  const direct=await owner.client.rpc('complete_registration',{p_user_id:owner.id,p_full_name:fields.fullName,p_phone:fields.phone,
    p_tenant_name:fields.tenantName,p_email:owner.email,p_hotel_name:fields.hotelName,p_hotel_address:fields.hotelAddress,
    p_hotel_phone:fields.hotelPhone,p_hotel_email:owner.email,p_total_rooms:fields.totalRooms});
  check(!direct.error&&direct.data?.success===false&&direct.data?.error?.includes('directory'),'Directory cutover blocks direct legacy registration');
  const unverified=await createOwner(false);
  const unverifiedResult=await admin.rpc('provision_workspace_registration',{p_workspace_id:randomUUID(),p_owner_id:unverified.id,p_fields:fields});
  check(!unverifiedResult.error&&unverifiedResult.data?.success===false,'Cluster rejects provisioning for an unverified owner');
  check((await post(`/workspaces/${slug}/provision`,fields)).status===401,'Provisioning requires a valid cluster session');
  check((await post(`/workspaces/${slug}/provision`,fields,outsider.token)).status===403,'Verified account with another email cannot provision the workspace');
  const bypass=await owner.client.rpc('provision_workspace_registration',{p_workspace_id:workspaceId,p_owner_id:owner.id,p_fields:fields});
  check(!!bypass.error,'Browser cannot directly call server-only workspace provisioning');
  const receiptBypass=await anon.rpc('get_workspace_provisioning',{p_workspace_id:workspaceId});
  check(!!receiptBypass.error,'Anonymous browser cannot read cluster receipts');
  check((await post(`/workspaces/${slug}/provision`,{...fields,totalRooms:-1},owner.token)).status===422,'Invalid setup is rejected');
  const before=await admin.from('tenants').select('id').eq('email',owner.email);assert.ifError(before.error);
  check(before.data.length===0,'Invalid setup leaves no business tenant');
  const gated=(await store.pool.query('SELECT status,owner_id,expires_at FROM roomqc_control.workspaces WHERE id=$1',[workspaceId])).rows[0];
  check(gated.status==='provisioning'&&gated.owner_id===owner.id&&gated.expires_at===null,'Verified provisioning is durably gated before calling the cluster');
  check((await store.pool.query('SELECT last_error_code FROM roomqc_control.workspaces WHERE id=$1',[workspaceId])).rows[0].last_error_code==='PROVISIONING_REJECTED',
    'Provisioning rejection has a durable support error code');
  await store.sweepReservations();
  check((await post('/signup-intents',{...reservation,email:outsider.email})).status===409,'Cleanup never releases a workspace once verified provisioning has started');
  // Deliberately lose directory activation after the cluster commits.
  const activate=store.activate.bind(store);let loseOnce=true;
  store.activate=async(...args)=>{if(loseOnce){loseOnce=false;throw new Error('Simulated directory outage after cluster commit')}return activate(...args)};
  const lost=await post(`/workspaces/${slug}/provision`,fields,owner.token);
  const lostError=await lost.json();
  const committed=await admin.from('tenants').select('id').eq('email',owner.email);assert.ifError(committed.error);
  ownedTenants.push(...committed.data.map(t=>t.id));
  check(lost.status===503&&committed.data.length===1,`Cluster commit survives a lost directory confirmation (HTTP ${lost.status}; tenants ${committed.data.length})`);
  await store.pool.query("UPDATE roomqc_control.workspaces SET created_at=now()-interval '30 days',expires_at=now()-interval '1 day' WHERE id=$1",[workspaceId]);
  await store.sweepReservations();
  check((await store.pool.query('SELECT status FROM roomqc_control.workspaces WHERE id=$1',[workspaceId])).rows[0].status==='provisioning','A lost cluster response remains protected regardless of reservation age');
  const recovered=await(await fetch(`${api}/workspaces/${slug}/bootstrap`)).json();
  check(recovered.workspace.status==='active'&&recovered.workspace.tenantId===committed.data[0].id,'Bootstrap reconciles the durable cluster receipt');
  const trialBeforeRetries=await admin.from('tenants').select('trial_ends_at').eq('id',committed.data[0].id).single();assert.ifError(trialBeforeRetries.error);
  const retries=await Promise.all(Array.from({length:20},()=>post(`/workspaces/${slug}/provision`,{...fields,hotelName:'Must not overwrite'},owner.token)));
  const results=await Promise.all(retries.map(r=>r.json()));
  check(retries.every(r=>r.status===200)&&results.every(r=>r.tenant_id===committed.data[0].id&&r.idempotent),'20 concurrent provisioning retries return one tenant without overwriting');
  const hotels=await admin.from('hotels').select('id,name').eq('tenant_id',committed.data[0].id);assert.ifError(hotels.error);
  check(hotels.data.length===1&&hotels.data[0].name===fields.hotelName,'Only one hotel with original customer data exists');
  const tenant=await admin.from('tenants').select('subscription_status,trial_ends_at').eq('id',committed.data[0].id).single();assert.ifError(tenant.error);
  check(tenant.data.subscription_status==='trial'&&new Date(tenant.data.trial_ends_at)>Date.now(),'Trial is provisioned server-side');
  check(tenant.data.trial_ends_at===trialBeforeRetries.data.trial_ends_at,'20 retries do not restart or extend the trial');
  const noLeak=await outsider.client.from('hotels').select('id').eq('tenant_id',committed.data[0].id);assert.ifError(noLeak.error);
  check(noLeak.data.length===0,'RLS isolates the new tenant from another authenticated account');
  const binding=await admin.rpc('get_workspace_provisioning',{p_workspace_id:workspaceId});assert.ifError(binding.error);
  check(binding.data.owner_id===owner.id&&binding.data.tenant_id===committed.data[0].id,'Cluster receipt binds the verified owner and workspace');

  // Minimum support console is the CLI + authenticated same-origin endpoints.
  check((await post('/support/lookup',{query:slug})).status===401,'Support lookup rejects anonymous requests');
  check((await anon.rpc('platform_support_actor')).error,'Anonymous callers cannot execute the support authority RPC');
  check((await admin.rpc('platform_support_actor')).error,'A service key alone is not a logged-in support administrator');
  check((await post('/support/lookup',{query:slug},owner.token)).status===401,'Workspace owner cannot access platform support');
  check((await post('/support/lookup',{query:slug},outsider.token)).status===401,'Another account cannot inspect workspace receipts');
  assert.ifError((await owner.client.auth.updateUser({data:{role:'super_admin',is_super_admin:true}})).error);
  const refreshed=await owner.client.auth.refreshSession();assert.ifError(refreshed.error);
  owner.token=refreshed.data.session.access_token;
  assert.equal(JSON.parse(Buffer.from(owner.token.split('.')[1],'base64url').toString()).user_metadata.role,'super_admin');
  check((await post('/support/lookup',{query:slug},owner.token)).status===401,'User-editable metadata does not grant support access');
  assert.ifError((await admin.from('user_roles').insert({user_id:owner.id,role:'super_admin'})).error);
  assert.ifError((await admin.from('users').update({is_super_admin:true}).eq('id',owner.id)).error);
  const looked=await post('/support/lookup',{query:slug},owner.token);
  const inspected=await looked.json();
  check(looked.status===200&&inspected.receipt.status==='verified'&&inspected.workspace.id===workspaceId,'Live super admin can inspect directory and cluster receipt');
  const cliResult=await runSupport(['lookup','--query',slug],{ROOMQC_CONTROL_URL:api.replace('/api/control',''),
    ROOMQC_PUBLIC_URL:options.publicOrigin,ROOMQC_SUPPORT_ACCESS_TOKEN:owner.token});
  check(cliResult.workspace.id===workspaceId&&cliResult.receipt.status==='verified','Support CLI can inspect the real HTTP service with an active admin session');
  check(!JSON.stringify(inspected).includes(local.SERVICE_ROLE_KEY)&&!JSON.stringify(inspected).includes(owner.email)
    &&!JSON.stringify(inspected).includes('email_hash'),'Support output contains no raw email, hash or service credential');
  check(inspected.attempts.length<=20,'Support history is bounded to 20 recent attempts');
  const byId=await(await post('/support/lookup',{query:lostError.requestId},owner.token)).json();
  check(byId.workspace.id===workspaceId,'Lost response request ID locates the original workspace');
  const reconcileBody={query:slug,workspaceId,routingVersion:inspected.workspace.routing_version,reason:'Investigate lost confirmation'};
  check((await post('/support/reconcile',{...reconcileBody,reason:''},owner.token)).status===400,'Reconciliation requires a reason');
  check((await post('/support/reconcile',{...reconcileBody,workspaceId:randomUUID()},owner.token)).status===409,'Stale or recycled workspace identity cannot be reconciled');
  check((await post('/support/reconcile',{...reconcileBody,routingVersion:99},owner.token)).status===409,'Stale routing version is rejected');
  const originalBinding=gateway.binding.bind(gateway);
  for(const field of ['workspace_id','tenant_id','hotel_id','owner_id']) {
    gateway.binding=async()=>({...binding.data,[field]:randomUUID()});
    const mismatch=await post('/support/reconcile',reconcileBody,owner.token);
    check(mismatch.status===409&&(await mismatch.json()).error==='RECEIPT_CONFLICT',`Support cannot overwrite mismatched ${field}`);
  }
  gateway.binding=async()=>null;
  check((await post('/support/reconcile',reconcileBody,owner.token)).status===409,'Missing receipt never triggers creation of a tenant');
  gateway.binding=async()=>{throw new Error('Simulated connection failure')};
  check((await post('/support/reconcile',reconcileBody,owner.token)).status===503,'Unreachable cluster keeps the existing mapping');
  gateway.binding=originalBinding;
  for(const status of ['suspended','migrating','expired','reserved']) {
    await store.pool.query('UPDATE roomqc_control.workspaces SET status=$2 WHERE id=$1',[workspaceId,status]);
    check((await post('/support/reconcile',reconcileBody,owner.token)).status===409,`Support cannot reactivate ${status} workspaces`);
  }
  await store.pool.query("UPDATE roomqc_control.workspaces SET status='provisioning',tenant_id=NULL,hotel_id=NULL,last_error_code='CONTROL_UNAVAILABLE' WHERE id=$1",[workspaceId]);
  await assert.rejects(async()=>activate(await store.workspace(slug),binding.data,randomUUID(),randomUUID()),{code:'SUPPORT_AUDIT_CONFLICT'});
  const unchanged=(await store.pool.query('SELECT status,tenant_id FROM roomqc_control.workspaces WHERE id=$1',[workspaceId])).rows[0];
  check(unchanged.status==='provisioning'&&unchanged.tenant_id===null,'Binding update rolls back if successful support audit cannot commit');
  const recovery=await post('/support/reconcile',reconcileBody,owner.token);
  const recoveredSupport=await recovery.json();
  check(recovery.status===200&&recoveredSupport.workspace.tenant_id===committed.data[0].id&&recoveredSupport.workspace.status==='active',
    'Support recovers an existing receipt without provisioning or changing the trial');
  check((await(await post('/support/lookup',{query:recoveredSupport.requestId},owner.token)).json()).workspace.id===workspaceId,
    'Support action request ID can be looked up again');
  const action=(await store.pool.query('SELECT * FROM roomqc_control.support_actions WHERE id=$1',[recoveredSupport.actionId])).rows[0];
  check(action.actor_id===owner.id&&action.authority_cluster_id==='cluster-a'&&action.reason===reconcileBody.reason
    &&action.before_state.status==='provisioning'&&action.after_state.status==='active'&&action.outcome==='reconciled',
    'Successful recovery has atomic actor, authority, reason and before/after audit');
  check((await post('/support/reconcile',reconcileBody,owner.token)).status===200,'Replaying support recovery is safe and creates no second tenant');
  await store.recordFailure(workspaceId,randomUUID(),'CLUSTER_UNAVAILABLE');
  check((await store.pool.query('SELECT last_error_code FROM roomqc_control.workspaces WHERE id=$1',[workspaceId])).rows[0].last_error_code===null,
    'Late failure does not replace an already active workspace with an error');
  const failedActions=await store.pool.query("SELECT count(*)::int AS n FROM roomqc_control.support_actions WHERE workspace_id=$1 AND outcome='failed' AND finished_at IS NOT NULL",[workspaceId]);
  check(failedActions.rows[0].n>=10,'Rejected recovery attempts retain finished failure audits');
  const stable=await admin.from('tenants').select('id,trial_ends_at').eq('email',owner.email);assert.ifError(stable.error);
  check(stable.data.length===1&&stable.data[0].trial_ends_at===tenant.data.trial_ends_at,'All support actions preserve one tenant and the original trial deadline');
  // Exercise documented production-style grants, not only a PostgreSQL owner.
  // This role exists only inside the disposable directory test database.
  const runtimeRole=`control_runtime_${randomUUID().slice(0,8)}`;
  const runtimePassword=randomUUID();
  await store.pool.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}';
    GRANT USAGE ON SCHEMA roomqc_control TO ${runtimeRole};
    GRANT SELECT ON roomqc_control.clusters TO ${runtimeRole};
    GRANT SELECT,INSERT,UPDATE ON roomqc_control.workspaces TO ${runtimeRole};
    GRANT SELECT,INSERT ON roomqc_control.attempts TO ${runtimeRole};
    GRANT USAGE,SELECT ON SEQUENCE roomqc_control.attempts_id_seq TO ${runtimeRole};
    GRANT SELECT,INSERT ON roomqc_control.support_actions TO ${runtimeRole};
    GRANT UPDATE(outcome,after_state,error_code,finished_at) ON roomqc_control.support_actions TO ${runtimeRole}`);
  const runtimeUrl=new URL(store.config.databaseUrl);runtimeUrl.username=runtimeRole;runtimeUrl.password=runtimePassword;
  const runtimeStore=new ControlStore({...store.config,databaseUrl:runtimeUrl.href});
  try {
    const runtimeResult=await reconcileSupport(runtimeStore,gateway,{id:owner.id,clusterId:'cluster-a'},reconcileBody,randomUUID());
    check(runtimeResult.success&&(await runtimeStore.supportHistory(workspaceId)).actions.some(a=>a.id===runtimeResult.actionId),
      'Least-privilege runtime can lookup, recover and commit an atomic support audit');
    await assert.rejects(()=>runtimeStore.pool.query('UPDATE roomqc_control.support_actions SET actor_id=$2 WHERE id=$1',[runtimeResult.actionId,randomUUID()]),{code:'42501'});
    check(true,'Runtime cannot rewrite the recorded support actor');
    await assert.rejects(()=>runtimeStore.pool.query('DELETE FROM roomqc_control.support_actions WHERE id=$1',[runtimeResult.actionId]),{code:'42501'});
    check(true,'Runtime cannot delete support audit history');
  } finally {await runtimeStore.close()}
  assert.ifError((await admin.from('users').update({account_locked:true}).eq('id',owner.id)).error);
  check((await post('/support/lookup',{query:slug},owner.token)).status===401,'Locking admin revokes support access with an existing token');
  assert.ifError((await admin.from('users').update({account_locked:false,status:'inactive'}).eq('id',owner.id)).error);
  check((await post('/support/lookup',{query:slug},owner.token)).status===401,'Inactive admin cannot use support');
  assert.ifError((await admin.from('users').update({status:'active'}).eq('id',owner.id)).error);
  assert.ifError((await admin.from('user_roles').delete().eq('user_id',owner.id).eq('role','super_admin')).error);
  check((await post('/support/lookup',{query:slug},owner.token)).status===401,'Removing live admin role immediately revokes support access');
  assert.ifError((await admin.from('user_roles').insert({user_id:owner.id,role:'super_admin'})).error);
  await clusterDb.pool.query("UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE user_id=$1",[owner.id]);
  check((await post('/support/lookup',{query:slug},owner.token)).status===401,'Expired database session cannot use a still-valid access token');
  await clusterDb.pool.query('UPDATE auth.sessions SET not_after=NULL WHERE user_id=$1',[owner.id]);
  options.supportClusterId=null;
  check((await post('/support/lookup',{query:slug},owner.token)).status===503,'Support API defaults closed without canonical authority');
  options.supportClusterId='cluster-a';
  assert.ifError((await owner.client.auth.signOut()).error);
  check((await post('/support/lookup',{query:slug},owner.token)).status===401,'Logged-out admin JWT is denied by the live auth.sessions guard');

  // Race the initial commit too, not only retries of an existing receipt.
  const firstOwner=await createOwner();
  const firstSlug=`initial-${randomUUID().slice(0,8)}`;
  const firstWorkspace=await store.reserve({slug:firstSlug,email:firstOwner.email,displayName:'Concurrent initial setup'},randomUUID());
  const firstResponses=await Promise.all(Array.from({length:20},()=>post(`/workspaces/${firstSlug}/provision`,{...fields,hotelEmail:firstOwner.email},firstOwner.token)));
  const firstResults=await Promise.all(firstResponses.map(r=>r.json()));
  check(firstResponses.every(r=>r.status===200)&&new Set(firstResults.map(r=>r.tenant_id)).size===1
    &&firstResults.filter(r=>!r.idempotent).length===1,'20 concurrent initial provisioning requests commit exactly one tenant/trial');
  const receiptCount=(await clusterDb.pool.query('SELECT count(*)::int AS n FROM private.workspace_provisioning WHERE workspace_id=$1',[firstWorkspace.id])).rows[0].n;
  const firstHotels=await admin.from('hotels').select('id').eq('tenant_id',firstResults[0].tenant_id);assert.ifError(firstHotels.error);
  check(receiptCount===1&&firstHotels.data.length===1,'Initial provisioning race leaves one durable receipt and one hotel');

  // Expiry applies only to unused intents created with the new gate protocol.
  const expiringEmail=`${randomUUID()}@example.invalid`;
  const expiring=await store.reserve({slug:`expiry-${randomUUID().slice(0,8)}`,email:expiringEmail,displayName:'Expires unused'},randomUUID());
  await store.pool.query("UPDATE roomqc_control.workspaces SET expires_at=now()-interval '1 minute' WHERE id=$1",[expiring.id]);
  check((await fetch(`${api}/workspaces/${expiring.slug}/bootstrap`)).status===410,'Unused expired reservations return a clear 410 before cleanup');
  await assert.rejects(()=>store.beginProvision(expiring,{id:owner.id,email:expiringEmail},randomUUID()),{code:'RESERVATION_CHANGED'});
  check(true,'A stale request cannot start provisioning after its deadline');
  const reclaim=await Promise.allSettled(Array.from({length:5},()=>store.reserve({slug:expiring.slug,email:`${randomUUID()}@example.invalid`,displayName:'Replacement intent'},randomUUID())));
  check(reclaim.filter(result=>result.status==='fulfilled').length===1&&reclaim.filter(result=>result.status==='rejected').every(result=>result.reason.code==='RESERVATION_CONFLICT'),'Concurrent claims of an expired slug produce exactly one new reservation');
  const renewed=reclaim.find(result=>result.status==='fulfilled').value;
  check(renewed.id!==expiring.id,'Unused expired slug can be reserved with a new workspace ID');
  const history=await store.pool.query("SELECT w.status,count(a.id)::int AS events FROM roomqc_control.workspaces w JOIN roomqc_control.attempts a ON a.workspace_id=w.id AND a.outcome='reservation_expired' WHERE w.id=$1 GROUP BY w.id",[expiring.id]);
  check(history.rows[0].status==='expired'&&history.rows[0].events===1,'Expiry preserves the old intent and one audit event');
  await assert.rejects(()=>store.activate(expiring,{tenant_id:randomUUID(),hotel_id:randomUUID(),owner_id:owner.id},randomUUID()),{code:'BINDING_CONFLICT'});
  check(true,'Stale activation cannot resurrect an expired workspace');
  const legacy=await store.reserve({slug:`legacy-${randomUUID().slice(0,8)}`,email:`${randomUUID()}@example.invalid`,displayName:'Legacy intent'},randomUUID());
  await store.pool.query("UPDATE roomqc_control.workspaces SET expires_at=NULL,created_at=now()-interval '30 days' WHERE id=$1",[legacy.id]);
  await store.sweepReservations();
  check((await store.workspace(legacy.slug)).id===legacy.id,'Legacy reservations without a safe expiry remain protected');
  await store.migrate();
  check((await store.workspace(legacy.slug)).expires_at===null,'Rerunning migration never enables expiry for legacy rows');

  const budgetEmail=`${randomUUID()}@example.invalid`;
  const budgetIntent=await store.reserve({slug:`budget-${randomUUID().slice(0,8)}`,email:budgetEmail,displayName:'Budget test'},randomUUID());
  await store.pool.query("UPDATE roomqc_control.workspaces SET expires_at=now()-interval '1 minute' WHERE id=$1",[budgetIntent.id]);
  store.config.emailDayLimit=1;
  await assert.rejects(()=>store.reserve({slug:`budget-${randomUUID().slice(0,8)}`,email:budgetEmail,displayName:'Budget test'},randomUUID()),{code:'SIGNUP_LIMIT'});
  check(true,'Per-email daily limit includes abandoned and expired registrations');
  store.config.emailDayLimit=3;
  const repeatEmail=await store.reserve({slug:`budget-${randomUUID().slice(0,8)}`,email:budgetEmail,displayName:'Budget retry'},randomUUID());
  check(repeatEmail.id!==budgetIntent.id,'The same email can restart an expired unused registration within its daily limit');
  await store.migrate();
  check((await store.workspace(repeatEmail.slug)).id===repeatEmail.id,'Schema upgrade remains repeatable when expired history shares an email with a live reservation');
  store.config.signupHourLimit=1;
  check((await store.reserve(reservation,randomUUID())).id===workspaceId,'Existing customer retry still works while the new-signup budget is exhausted');
  const replica=new ControlStore({...store.config});
  try {
    await assert.rejects(()=>replica.reserve({slug:`hour-${randomUUID().slice(0,8)}`,email:`${randomUUID()}@example.invalid`,displayName:'Budget test'},randomUUID()),{code:'SIGNUP_LIMIT'});
  } finally {await replica.close()}
  check(true,'Global signup budget persists in PostgreSQL across service instances');
  const hourly=(await store.pool.query("SELECT count(*)::int AS count FROM roomqc_control.workspaces WHERE created_at>now()-interval '1 hour'")).rows[0].count;
  store.config.signupHourLimit=hourly+1;
  const concurrentReplica=new ControlStore({...store.config});
  try {
    const competing=await Promise.allSettled([store,concurrentReplica].map(instance=>instance.reserve({slug:`last-${randomUUID().slice(0,8)}`,email:`${randomUUID()}@example.invalid`,displayName:'Last signup slot'},randomUUID())));
    check(competing.filter(result=>result.status==='fulfilled').length===1&&competing.some(result=>result.status==='rejected'&&result.reason.code==='SIGNUP_LIMIT'),'Two service instances racing for the last hourly slot cannot exceed the budget');
  } finally {await concurrentReplica.close()}
  store.config.signupHourLimit=100;
  // Isolate capacity checks from the additional lifecycle fixtures above.
  await store.pool.query("UPDATE roomqc_control.workspaces SET expires_at=now()-interval '1 minute' WHERE status='reserved' AND id<>$1",[legacy.id]);
  await store.sweepReservations();
  await store.pool.query("UPDATE roomqc_control.workspaces SET status='expired' WHERE id=$1",[legacy.id]);

  // Database-level placement tests, not a claim that two real backend clusters exist.
  options.clusters.push({...options.clusters[0],id:'cluster-b',url:'https://cluster-b.example.invalid',maxWorkspaces:1});
  await store.migrate();
  await store.pool.query(`UPDATE roomqc_control.clusters SET max_workspaces=
    (SELECT count(*)+1 FROM roomqc_control.workspaces WHERE cluster_id='cluster-a' AND status<>'expired') WHERE id='cluster-a'`);
  const placements=await Promise.allSettled(Array.from({length:3},(_,i)=>store.reserve({slug:`capacity-${i}-${randomUUID().slice(0,8)}`,email:`${randomUUID()}@example.invalid`,displayName:'Capacity test'},randomUUID())));
  const allocated=placements.filter(r=>r.status==='fulfilled').map(r=>r.value.cluster_id);
  check(allocated.length===2&&new Set(allocated).size===2,'Concurrent placement fills A/B without exceeding reserved capacity');
  check(placements.some(r=>r.status==='rejected'&&r.reason.code==='NO_CAPACITY'),'New signup stops when no cluster has capacity');
  await store.pool.query("UPDATE roomqc_control.clusters SET status='offline' WHERE id='cluster-a'");
  check((await fetch(`${api}/workspaces/${slug}/bootstrap`)).status===503,'Offline cluster does not silently redirect a customer to another database');
  console.log(`Directory integration verified: ${checks} checks passed.`);
}finally{
  const cleanupErrors=[];
  const cleanup=async(action)=>{try{await action()}catch{cleanupErrors.push('A cleanup step failed; inspect the named local test resources.')}};
  // Include an exact email lookup for accounts that committed before an unexpected error.
  for(const id of ownedUsers){
    await cleanup(async()=>{
      const user=await admin.auth.admin.getUserById(id);
      assert.ifError(user.error);
      if(user.data.user?.email){const tenants=await admin.from('tenants').select('id').eq('email',user.data.user.email);assert.ifError(tenants.error);ownedTenants.push(...tenants.data.map(t=>t.id))}
    });
  }
  for(const id of new Set(ownedTenants))await cleanup(async()=>{const result=await admin.from('tenants').delete().eq('id',id);assert.ifError(result.error)});
  for(const id of ownedUsers)await cleanup(async()=>{const result=await admin.auth.admin.deleteUser(id);assert.ifError(result.error)});
  if(server)await cleanup(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
  if(clusterDb&&previousDirectoryRequired!==undefined)await cleanup(()=>clusterDb.pool.query('UPDATE private.roomqc_cluster_config SET directory_required=$1 WHERE singleton',[previousDirectoryRequired]));
  if(store)await cleanup(()=>store.close());if(clusterDb)await cleanup(()=>clusterDb.close());
  if(started)await cleanup(()=>docker('rm','-f',container));
  if(cleanupErrors.length){console.error(`Cleanup incomplete for ${container}: ${cleanupErrors.length} steps failed.`);process.exitCode=1}
  else console.log('Temporary directory database, container, tenants, and test users removed; local cutover flag restored.');
}
