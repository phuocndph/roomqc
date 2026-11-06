// Real Auth/REST/Postgres authority and wall-clock fences. Only disposable
// exact-owned fixtures are supplied. No provider or external service is used.
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
import {createAdvicePolicyFixture} from '/control/testing/advice-policy-fixture.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_ADVICE_AUTHORITY_INPUT??'null');assert.match(input?.run??'',/^[a-f0-9]{12}$/);
const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,max:6,statement_timeout:25000,
  connectionTimeoutMillis:5000,application_name:'owned-advice-authority-'+input.run});
const checks=[],races=[],origin='http://127.0.0.1:8000';let stage='accounts';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rec=(label,passed,details={})=>{checks.push({label:'advice-authority-'+label,passed,actualNative:true,...details});assert.ok(passed,'OWNED_ADVICE_AUTHORITY_CONTROL_FAILED')};
async function call(path,token,body){const r=await fetch(origin+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{
  apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify(body)});
  let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};}
const rpc=(name,a,args)=>call('/rest/v1/rpc/'+name,a.token??a,args);
async function account(label){const email='advice-authority-'+input.run+'-'+label+'@roomqc.invalid',password=createHmac('sha256',input.serviceKey).update(email).digest('hex');
  const created=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(created.status,200);
  const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);
  return{id:created.data.id,email,token:login.data.access_token,sessionId:JSON.parse(Buffer.from(login.data.access_token.split('.')[1],'base64url')).session_id};}
async function owner(label){const a=await account(label),p=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:a.id,
  p_fields:{fullName:'Owned advice authority',phone:'0901234567',tenantName:'Owned advice authority',hotelName:'Owned advice authority',hotelAddress:'123 Fixture Road',
    hotelPhone:'0281234567',hotelEmail:a.email,totalRooms:5}});assert.equal(p.status,200);assert.equal(p.data.success,true);
  return{...a,tenantId:p.data.tenant_id,hotelId:p.data.hotel_id};}
const scope=a=>({p_start_date:'2026-10-01',p_end_date:'2026-10-31',p_hotel_id:a.hotelId,p_timezone:'Asia/Ho_Chi_Minh'});
const prepare=(a,id)=>rpc('prepare_operations_advice',a,{p_command_id:id,...scope(a)});
const lookup=(a,id)=>rpc('get_operations_advice_command',a,{p_command_id:id});
const dispatch=(a,id)=>rpc('dispatch_operations_advice',input.serviceKey,{p_actor_id:a.id,p_command_id:id,p_session_id:a.sessionId});
const advice=Array.from({length:3},(_,i)=>({title:'Authority '+i,description:'Owned scoped result.',action:'Review recorded evidence.',priority:'medium'}));
const finish=(a,id,nonce,body=advice)=>rpc('finish_operations_advice',input.serviceKey,{p_actor_id:a.id,p_command_id:id,p_dispatch_token:nonce,p_advice:body});
const policyFixture=createAdvicePolicyFixture({db,input,call,rpc});
const policy=a=>policyFixture.configure({p_tenant_id:a.tenantId,p_enabled:true,p_daily_limit:1000,p_daily_budget_units:10000,
  p_units_per_request:5,p_valid_until:new Date(Date.now()+3600000).toISOString(),p_reason:'Owned advice authority checks'});
async function completed(a){const id=randomUUID();assert.equal((await prepare(a,id)).status,200);const d=await dispatch(a,id);assert.equal(d.data.state,'dispatch');
  assert.equal((await finish(a,id,d.data.dispatch_token)).data.state,'completed');return{id,nonce:d.data.dispatch_token};}
async function journal(a){return hash((await db.query(`SELECT jsonb_build_object(
  'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY actor_id,command_id) FROM private.operations_advice_commands c WHERE tenant_id=$1),
  'audit',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.activity_logs l WHERE tenant_id=$1 AND entity_type='operations_advice')) AS value`,[a.tenantId])).rows[0].value);}
async function blockedClock(a,kind,action){
  const before=await journal(a),holder=await db.connect(),start=Date.now(),clock=action.clock??'trial';let task,waiting=0,result,restore;
  try{
    if(clock==='trial'){
      const saved=(await db.query('SELECT subscription_status,trial_ends_at FROM public.tenants WHERE id=$1',[a.tenantId])).rows[0];
      restore=()=>db.query('UPDATE public.tenants SET subscription_status=$2,trial_ends_at=$3 WHERE id=$1',[a.tenantId,saved.subscription_status,saved.trial_ends_at]);
      await db.query("UPDATE public.tenants SET subscription_status='trial',trial_ends_at=clock_timestamp()+interval '3 seconds' WHERE id=$1",[a.tenantId]);
    }else if(clock==='session'){
      const saved=(await db.query('SELECT not_after FROM auth.sessions WHERE id=$1',[a.sessionId])).rows[0];
      restore=()=>db.query('UPDATE auth.sessions SET not_after=$2 WHERE id=$1',[a.sessionId,saved.not_after]);
      await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '3 seconds' WHERE id=$1",[a.sessionId]);
    }else{
      assert.equal(clock,'policy');const saved=(await db.query('SELECT valid_until FROM private.operations_advice_policy WHERE tenant_id=$1',[a.tenantId])).rows[0];
      restore=()=>db.query('UPDATE private.operations_advice_policy SET valid_until=$2 WHERE tenant_id=$1',[a.tenantId,saved.valid_until]);
      await db.query("UPDATE private.operations_advice_policy SET valid_until=clock_timestamp()+interval '3 seconds' WHERE tenant_id=$1",[a.tenantId]);
    }
    await holder.query('BEGIN');const pid=Number((await holder.query('SELECT pg_backend_pid() AS id')).rows[0].id);
    if(kind==='policy')await holder.query('SELECT tenant_id FROM private.operations_advice_policy WHERE tenant_id=$1 FOR UPDATE',[a.tenantId]);
    if(kind==='command')await holder.query('SELECT command_id FROM private.operations_advice_commands WHERE actor_id=$1 AND command_id=$2 FOR UPDATE',[a.id,action.id]);
    if(kind==='audit')await holder.query('LOCK TABLE public.activity_logs IN ACCESS EXCLUSIVE MODE');
    task=action.run();
    const until=Date.now()+2000;while(Date.now()<until){const q=await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'",[pid]);
      waiting=q.rows[0].n;if(waiting>=1)break;await new Promise(r=>setTimeout(r,20));}
    assert.ok(waiting>=1,'OWNED_REQUEST_MUST_WAIT_ON_HELD_LOCK');
    await db.query('SELECT pg_sleep(3.5)');const query=clock==='trial'?'SELECT trial_ends_at<=clock_timestamp() AS yes FROM public.tenants WHERE id=$1':
      clock==='session'?'SELECT not_after<=clock_timestamp() AS yes FROM auth.sessions WHERE id=$1':'SELECT valid_until<=clock_timestamp() AS yes FROM private.operations_advice_policy WHERE tenant_id=$1';
    const expired=(await db.query(query,[clock==='session'?a.sessionId:a.tenantId])).rows[0].yes;
    assert.equal(expired,true);await holder.query('COMMIT');result=await task;
    const elapsedMs=Date.now()-start,unchanged=await journal(a)===before;
    races.push({kind:'real-'+clock+'-expiry-'+kind,path:action.label,observedLockWaiters:waiting,elapsedMs,status:result.status,realClock:true,journalUnchanged:unchanged});
    rec(clock+'-expired-after-'+kind+'-lock-denies-'+action.label,result.status===403&&unchanged,{status:result.status,elapsedMs,observedLockWaiters:waiting,realClock:true,journalUnchanged:unchanged});
  }finally{await holder.query('ROLLBACK').catch(()=>{});holder.release();if(task)await task.catch(()=>{});
    if(restore)await restore();}
}
async function mutation(table,id,changes){assert.match(table,/^(auth|public)\.[a-z_]+$/);const keys=Object.keys(changes);assert.ok(keys.every(k=>/^[a-z_]+$/.test(k)));
  const before=(await db.query('SELECT * FROM '+table+' WHERE id=$1',[id])).rows[0];assert.ok(before);
  const write=values=>db.query('UPDATE '+table+' SET '+keys.map((k,i)=>k+'=$'+(i+2)).join(',')+' WHERE id=$1',[id,...values]);
  await write(keys.map(k=>changes[k]));return()=>write(keys.map(k=>before[k]));}
async function deleteRows(table,where,args){assert.ok(['auth.sessions','public.user_roles','public.user_hotels','public.hotels'].includes(table));
  const saved=(await db.query('DELETE FROM '+table+' WHERE '+where+' RETURNING *',args)).rows;assert.ok(saved.length);
  return async()=>{for(const row of saved)await db.query('INSERT INTO '+table+' SELECT * FROM json_populate_record(NULL::'+table+',$1::json)',[JSON.stringify(row)])};}
try{
  const a=await owner('owner');assert.equal((await policy(a)).status,200);const done=await completed(a);
  rec('native-completed-receipt-before-authority-tests',(await lookup(a,done.id)).data.state==='completed');
  stage='trial-policy-wait';await blockedClock(a,'policy',{id:done.id,label:'completed-read',run:()=>lookup(a,done.id)});
  stage='trial-command-wait';await blockedClock(a,'command',{id:done.id,label:'completed-read',run:()=>lookup(a,done.id)});
  stage='trial-audit-wait';const pendingId=randomUUID();await blockedClock(a,'audit',{label:'new-reservation',run:()=>prepare(a,pendingId)});
  stage='trial-dispatch-audit-wait';const dispatchId=randomUUID();assert.equal((await prepare(a,dispatchId)).status,200);
  await blockedClock(a,'audit',{label:'new-dispatch',run:()=>dispatch(a,dispatchId)});
  stage='trial-finish-audit-wait';const finishId=randomUUID();assert.equal((await prepare(a,finishId)).status,200);const finishing=await dispatch(a,finishId);
  assert.equal(finishing.data.state,'dispatch');await blockedClock(a,'audit',{label:'new-result',run:()=>finish(a,finishId,finishing.data.dispatch_token)});
  for(const clock of ['trial','session','policy']){
    stage=clock+'-dispatch-replay-command-wait';await blockedClock(a,'command',{id:done.id,clock,label:'completed-dispatch-replay',run:()=>dispatch(a,done.id)});
    stage=clock+'-finish-replay-command-wait';await blockedClock(a,'command',{id:done.id,clock,label:'completed-finish-replay',run:()=>finish(a,done.id,done.nonce)});
  }
  rec('trial-restored-can-read-original-without-journal-change',(await lookup(a,done.id)).data.state==='completed');
  stage='staff-setup';const staff=await account('staff');const hotelId=randomUUID();
  const hotel=await call('/rest/v1/hotels',input.serviceKey,{id:hotelId,tenant_id:a.tenantId,name:'Owned authority secondary',address:'Owned fixture',status:'active'});assert.equal(hotel.status,201);
  const user=await call('/rest/v1/users',input.serviceKey,{id:staff.id,email:staff.email,full_name:'Owned report-only staff',tenant_id:a.tenantId,hotel_id:a.hotelId,
    role:'staff',user_level_code:'staff',status:'active',created_by:a.id,must_change_password:false,account_locked:false});assert.equal(user.status,201);
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'staff')",[staff.id]);
  await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)',[staff.id,hotelId,a.id]);
  await db.query("DELETE FROM public.role_permissions rp USING public.roles r,public.permissions p WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='staff' AND p.module='reports'");
  const perm=(await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'reports','view',true) RETURNING id",[staff.id,a.tenantId])).rows[0].id;
  const s={...staff,hotelId,tenantId:a.tenantId},staffDone=await completed(s),reservedId=randomUUID(),dispatchedId=randomUUID();
  assert.equal((await prepare(s,reservedId)).data.state,'reserved');assert.equal((await prepare(s,dispatchedId)).data.state,'reserved');
  const dispatched=await dispatch(s,dispatchedId);assert.equal(dispatched.data.state,'dispatch');
  const cases=[
    ['auth-softdelete',()=>mutation('auth.users',s.id,{deleted_at:new Date()})],
    ['auth-email-unconfirmed',()=>mutation('auth.users',s.id,{email_confirmed_at:null})],
    ['auth-banned',()=>mutation('auth.users',s.id,{banned_until:new Date(Date.now()+3600000)})],
    ['profile-inactive',()=>mutation('public.users',s.id,{status:'inactive'})],
    ['profile-softdelete',()=>mutation('public.users',s.id,{deleted_at:new Date()})],
    ['profile-locked',()=>mutation('public.users',s.id,{account_locked:true})],
    ['profile-super-admin',()=>mutation('public.users',s.id,{is_super_admin:true})],
    ['role-missing',()=>deleteRows('public.user_roles','user_id=$1',[s.id])],
    ['role-level-mismatch',()=>mutation('public.users',s.id,{user_level_code:'department_manager'})],
    ['session-expired',()=>mutation('auth.sessions',s.sessionId,{not_after:new Date(Date.now()-1000)})],
    ['session-deleted',()=>deleteRows('auth.sessions','id=$1',[s.sessionId])],
    ['reports-view-revoked',()=>mutation('public.user_permissions',perm,{enabled:false})],
    ['hotel-assignment-removed',()=>deleteRows('public.user_hotels','user_id=$1 AND hotel_id=$2',[s.id,hotelId])],
    ['hotel-inactive',()=>mutation('public.hotels',hotelId,{status:'inactive'})],
    ['tenant-read-only',()=>mutation('public.tenants',a.tenantId,{is_read_only:true})],
    ['tenant-trial-expired',()=>mutation('public.tenants',a.tenantId,{subscription_status:'trial',trial_ends_at:new Date(Date.now()-1000)})],
    ['tenant-active-expired',async()=>{const date=(await db.query("SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-1)::text AS value")).rows[0].value;
      return mutation('public.tenants',a.tenantId,{subscription_status:'active',subscription_end_date:date})}],
  ];
  for(const[label,revoke]of cases){stage='matrix-'+label;const restore=await revoke();try{
    const before=await journal(s),newId=randomUUID();const results=[await prepare(s,newId),await lookup(s,staffDone.id),await dispatch(s,reservedId),await finish(s,dispatchedId,dispatched.data.dispatch_token)];
    for(const[r,index]of results.map((r,i)=>[r,i]))rec(label+'-'+['prepare','read','dispatch','finish'][index]+'-denied',r.status===403,{status:r.status});
    rec(label+'-denials-preserve-journal-advice-charge-and-audit',await journal(s)===before);
  }finally{await restore()}
    rec(label+'-restored-positive-read',(await lookup(s,staffDone.id)).data.state==='completed');}
  stage='matrix-hotel-deleted';
  const assignments=(await db.query('SELECT * FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2',[s.id,hotelId])).rows;
  const restoreHotel=await deleteRows('public.hotels','id=$1',[hotelId]);
  try{const before=await journal(s);const results=[await prepare(s,randomUUID()),await lookup(s,staffDone.id),await dispatch(s,reservedId),await finish(s,dispatchedId,dispatched.data.dispatch_token)];
    rec('hotel-deleted-all-four-paths-denied',results.every(r=>r.status===403));rec('hotel-deleted-denials-preserve-original-journal',await journal(s)===before);
  }finally{
    // The existing quota trigger reads tenant_usage. Refresh fixture usage after
    // the synthetic hard delete before reinsertion; never bypass its quota.
    stage='matrix-hotel-restore-usage';await db.query('SELECT public.update_tenant_usage($1)',[a.tenantId]);
    stage='matrix-hotel-restore-row';await restoreHotel();
    stage='matrix-hotel-restore-assignments';for(const row of assignments)await db.query('INSERT INTO public.user_hotels SELECT * FROM json_populate_record(NULL::public.user_hotels,$1::json)',[JSON.stringify(row)]);
  }
  rec('hotel-restored-original-receipt-readable',(await lookup(s,staffDone.id)).data.state==='completed');
  rec('restored-dispatch-completes-without-new-command',(await finish(s,dispatchedId,dispatched.data.dispatch_token)).data.state==='completed');
  console.log(JSON.stringify({verified:true,checks,races,matrix:{reversibleCases:cases.length,pathsPerCase:4,hotelHardDelete:true},externalProviderCalls:0,
    aclFixture:{id:a.id,sessionId:a.sessionId},productAccepted:false}));
}catch(e){console.log(JSON.stringify({verified:false,stage,checks,races,failureCode:/^[A-Z0-9_]{3,80}$/.test(e.code??'')?e.code:'ADVICE_AUTHORITY_ASSERTION'}));process.exitCode=1}
finally{await db.end()}
