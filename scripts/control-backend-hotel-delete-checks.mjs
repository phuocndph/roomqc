// Actual REST + GoTrue in the exact-owned offline backend. Installer SQL only
// supplies fixtures/faults and observes effects. Never run against a live tenant.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_HOTEL_DELETE_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(input.publishableKey&&input.serviceKey&&input.databasePassword);
const origin='http://127.0.0.1:8000',checks=[],findings=[],races=[];
const db=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,
  max:6,statement_timeout:12000,connectionTimeoutMillis:5000,application_name:'owned-hotel-delete-'+input.run});
let phase='fixtures';
const result=()=>({verified:findings.length===0,checks,findings,races,snapshotTables:tables.length,actualRest:true,
  actualGoTrueLogout:true,receiptFixtureNonempty:checks.includes('bound-receipt-and-room-draft-nonempty-owner-moved'),
  roomDraftFixtureNonempty:checks.includes('bound-receipt-and-room-draft-nonempty-owner-moved'),
  ownerMovedWithinTenant:checks.includes('bound-receipt-and-room-draft-nonempty-owner-moved'),
  ownerMoveIsInstallerFixture:true,providerEnabled:false});
process.on('uncaughtExceptionMonitor',()=>process.stderr.write(JSON.stringify({event:'hotel_delete_check_failed',phase,checks,findings,races})+'\n'));
const mark=label=>checks.push(label);
async function call(path,token,body,method=body===undefined?'GET':'POST'){
  const response=await fetch(origin+path,{method,signal:AbortSignal.timeout(15000),headers:{apikey:input.publishableKey,
    authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await response.json()}catch{data=null}return {status:response.status,data};
}
async function rpc(name,body,token=input.serviceKey){const r=await call('/rest/v1/rpc/'+name,token,body);
  assert.equal(r.status,200,name);return r.data;}
async function login(u){const r=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:u.email,password:u.password});
  assert.equal(r.status,200);u.token=r.data.access_token;u.sessionId=JSON.parse(Buffer.from(u.token.split('.')[1],'base64url')).session_id;}
async function account(label){const u={email:'hotel-delete-'+input.run+'-'+label+'@roomqc.invalid',password:randomBytes(32).toString('hex')};
  const r=await call('/auth/v1/admin/users',input.serviceKey,{email:u.email,password:u.password,email_confirm:true});
  assert.equal(r.status,200);u.id=r.data.id;await login(u);return u;}
const fields=u=>({fullName:'Owned hotel delete fixture',phone:'0901234567',tenantName:'Owned hotel delete',
  hotelName:'Owned bound hotel',hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:u.email,totalRooms:3});
async function owner(label){const u=await account(label);u.workspaceId=randomUUID();
  const r=await rpc('provision_workspace_registration',{p_workspace_id:u.workspaceId,p_owner_id:u.id,p_fields:fields(u)});
  assert.equal(r.success,true);return {...u,tenantId:r.tenant_id,hotelId:r.hotel_id};}
async function hotel(u,label){const id=randomUUID();const r=await call('/rest/v1/hotels',input.serviceKey,
  {id,name:'Owned empty '+label,tenant_id:u.tenantId,address:'123 Fixture Road',status:'active'});
  if(r.status!==201){const quota=(await db.query(`SELECT sp.max_hotels,u.current_hotels_count,
      (SELECT count(*) FROM public.hotels h WHERE h.tenant_id=t.id AND h.status='active') AS actual_hotels,
      public.check_tenant_can_add(t.id,'hotel') AS can_add FROM public.tenants t
      LEFT JOIN public.subscription_plans sp ON sp.id=t.subscription_plan_id
      LEFT JOIN public.tenant_usage u ON u.tenant_id=t.id WHERE t.id=$1`,[u.tenantId])).rows[0];
    process.stderr.write(JSON.stringify({event:'hotel_fixture_mismatch',status:r.status,code:r.data?.code,
      quota:quota??null,quotaExceeded:/Quota exceeded/.test(r.data?.message??''),tenantMissing:/Tenant not found/.test(r.data?.message??'')})+'\n');}
  assert.equal(r.status,201);return id;}
async function visible(u,id){const r=await call('/rest/v1/hotels?id=eq.'+id+'&select=id',u.token);
  assert.equal(r.status,200);assert.deepEqual(r.data,[{id}]);}
const remove=(id,token)=>call('/rest/v1/hotels?id=eq.'+id+'&select=id',token,undefined,'DELETE');
const denied=r=>(r.status===200&&Array.isArray(r.data)&&r.data.length===0)||([401,403].includes(r.status)&&r.data?.code==='42501');
const targets=['private.hotel_room_setup','private.roomqc_cluster_config','private.subscription_checkout_drafts',
  'private.employee_authority_cancellations','private.employee_authority_receipts','private.employee_authority_versions',
  'private.subscription_lifecycle_batch_receipts','private.subscription_lifecycle_commands','private.subscription_lifecycle_notification_outbox',
  'private.subscription_lifecycle_progress','private.subscription_quotes','private.subscription_reconciliation_case_events',
  'private.subscription_reconciliation_case_receipts','private.subscription_reconciliation_cases','private.subscription_status_job_recoveries',
  'private.subscription_status_job_runs','private.workspace_provisioning','public.email_admin_actions','public.email_deliveries','public.email_provider_events'];
const tables=[...targets,'public.hotels','public.tenants','public.users','public.user_roles','public.user_hotels','public.rooms','public.room_types',
  'public.tenant_usage','public.invoices','public.payment_transactions','public.audit_log','pgmq.q_transactional_emails'];
async function snapshot(){return (await db.query('SELECT jsonb_build_object('+tables.map(t=>"'"+t+"',(SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM "+t+' r)').join(',')+') AS value')).rows[0].value;}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function waitFor(predicate){const until=Date.now()+6000;while(Date.now()<until){if(await predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('HOTEL_DELETE_EXPECTED_LOCK_WAIT_MISSING');}
try{
  const a=await owner('owner'),b=await owner('other'),employee=await account('staff');
  // The actual default trial permits only two hotels. Each denial deliberately
  // retains its hotel, so this drill needs its own bounded fixture plan. Clone
  // metadata into a NEW plan and bind only this owned tenant: never enlarge a
  // shared product plan, bypass the quota trigger or affect subsequent fixtures.
  const plan=(await db.query(`INSERT INTO public.subscription_plans
    SELECT (jsonb_populate_record(NULL::public.subscription_plans,to_jsonb(p)||jsonb_build_object(
      'id',gen_random_uuid(),'code',$2::text,'name','Owned hotel deletion fixture','max_hotels',32))).*
    FROM public.tenants t JOIN public.subscription_plans p ON p.id=t.subscription_plan_id
    WHERE t.id=$1 RETURNING id`,[a.tenantId,'fixture-hotel-delete-'+input.run])).rows[0];
  assert.ok(plan?.id);
  await db.query('UPDATE public.tenants SET subscription_plan_id=$2 WHERE id=$1',[a.tenantId,plan.id]);
  assert.equal((await db.query(`SELECT sp.max_hotels FROM public.tenants t
    JOIN public.subscription_plans sp ON sp.id=t.subscription_plan_id WHERE t.id=$1`,[a.tenantId])).rows[0].max_hotels,32);
  mark('owned-bounded-plan-quota-enabled');
  const fk=(await db.query(`SELECT c.conname,c.confdeltype,c.confrelid::regclass::text AS target
    FROM pg_constraint c WHERE c.conrelid='private.workspace_provisioning'::regclass
      AND c.conname='workspace_provisioning_hotel_id_fkey'`)).rows[0];
  assert.deepEqual(fk,{conname:'workspace_provisioning_hotel_id_fkey',confdeltype:'a',target:'hotels'});
  mark('receipt-hotel-fk-no-action-catalog');
  const staffProfile={id:employee.id,email:employee.email,full_name:'Owned staff',tenant_id:a.tenantId,hotel_id:a.hotelId,
    role:'staff',user_level_code:'staff',status:'active',created_by:a.id,must_change_password:false,account_locked:false};
  for(const [table,body]of [['users',staffProfile],['user_roles',{user_id:employee.id,role:'staff'}],
    ['user_hotels',{user_id:employee.id,hotel_id:a.hotelId,assigned_by:a.id}]])assert.equal((await call('/rest/v1/'+table,input.serviceKey,body)).status,201);
  const cascadeAcl=(await db.query(`SELECT r.rolname AS role,has_function_privilege(r.oid,
    'private.employee_hotel_delete_cascade_allowed(uuid,uuid)','EXECUTE') AS allowed
    FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','roomqc_control_probe') ORDER BY r.rolname`)).rows;
  assert.equal(cascadeAcl.length,4);assert.ok(cascadeAcl.every(r=>r.allowed===false));
  const directClient=await db.connect();
  try{
    await directClient.query('BEGIN');await directClient.query('SET LOCAL ROLE authenticated');
    await assert.rejects(directClient.query('SELECT private.employee_hotel_delete_cascade_allowed($1,$2)',[a.tenantId,a.hotelId]),e=>e.code==='42501');
  }finally{await directClient.query('ROLLBACK');directClient.release();}
  mark('cascade-helper-no-browser-service-or-probe-execute');
  for(const user of [a,employee]){
    const before=await snapshot(),attempt=await call('/rest/v1/user_hotels?user_id=eq.'+user.id+'&hotel_id=eq.'+a.hotelId,a.token,undefined,'DELETE');
    assert.equal(attempt.status,403);assert.equal(attempt.data?.code,'42501');assert.ok(same(await snapshot(),before));
  }
  mark('direct-own-and-staff-membership-delete-still-denied');
  const addMembers=async id=>{
    for(const user of [a,employee])assert.equal((await call('/rest/v1/user_hotels',input.serviceKey,
      {user_id:user.id,hotel_id:id,assigned_by:a.id})).status,201);
  };
  const currentHotel=await hotel(a,'current');
  assert.equal((await call('/rest/v1/user_hotels',input.serviceKey,{user_id:a.id,hotel_id:currentHotel,assigned_by:a.id})).status,201);
  // Primary assignment is not self metadata (the UI selector uses preferences).
  // Keep a direct denial/no-effect control, then install the owned moved-profile
  // fixture explicitly; this is NOT a user-facing transfer-workflow positive.
  const profileBeforeMove=await snapshot();
  const selfMove=await call('/rest/v1/users?id=eq.'+a.id,a.token,{hotel_id:currentHotel},'PATCH');
  assert.equal(selfMove.status,403);assert.equal(selfMove.data?.code,'42501');
  assert.equal(same(await snapshot(),profileBeforeMove),true);
  mark('self-owner-primary-hotel-patch-refused-no-effects');
  // The receipt must not rely on this mutable profile FK to keep its hotel.
  assert.equal((await call('/rest/v1/users?id=eq.'+a.id,input.serviceKey,{hotel_id:currentHotel},'PATCH')).status,200);
  assert.equal((await call('/rest/v1/users?id=eq.'+employee.id,input.serviceKey,{hotel_id:currentHotel},'PATCH')).status,200);
  assert.equal((await db.query('SELECT hotel_id FROM public.users WHERE id=$1',[a.id])).rows[0].hotel_id,currentHotel);
  mark('owner-primary-hotel-installed-within-tenant');
  const draft=await rpc('save_hotel_room_setup',{p_hotel_id:a.hotelId,p_expected_version:0,
    p_rooms:[{room_number:'FK-101',floor:1,room_type:'standard',max_guests:2,base_price:100000,hourly_price:0,monthly_price:0}]},a.token);
  assert.equal(draft.version,1);await visible(a,a.hotelId);await visible(employee,a.hotelId);
  const receipt=await rpc('get_workspace_provisioning',{p_workspace_id:a.workspaceId});assert.equal(receipt.hotel_id,a.hotelId);
  assert.equal(Number((await db.query('SELECT count(*) FROM private.hotel_room_setup WHERE hotel_id=$1',[a.hotelId])).rows[0].count),1);
  mark('bound-receipt-and-room-draft-nonempty-owner-moved');
  phase='foreign-actors';
  for(const [label,token]of [['staff',employee.token],['cross-tenant',b.token],['anon',input.publishableKey]]){
    const before=await snapshot(),r=await remove(a.hotelId,token);
    if(!denied(r)||!same(await snapshot(),before))findings.push({case:label+'-protected-delete',status:r.status,code:r.data?.code??null});
    else mark(label+'-protected-delete-denied-no-effects');
  }
  phase='bound-owner-delete';
  const before=await snapshot(),r=await remove(a.hotelId,a.token),afterReceipt=await rpc('get_workspace_provisioning',{p_workspace_id:a.workspaceId});
  const receiptRefusal=v=>v.status===409&&v.data?.code==='23503'&&
    /workspace_provisioning_hotel_id_fkey/.test(v.data?.message??'');
  if(!receiptRefusal(r)||!same(await snapshot(),before)){
    const roomDraftRows=Number((await db.query('SELECT count(*) FROM private.hotel_room_setup WHERE hotel_id=$1',[a.hotelId])).rows[0].count);
    const replay=await rpc('provision_workspace_registration',{p_workspace_id:a.workspaceId,p_owner_id:a.id,p_fields:fields(a)});
    findings.push({case:'owner-bound-delete',status:r.status,code:r.data?.code??null,receiptLost:afterReceipt===null,
      roomDraftLost:roomDraftRows===0,replaySuccess:replay.success===true});
  }else{assert.deepEqual(afterReceipt,receipt);mark('owner-bound-delete-23503-no-effects');
    const outcomes=await Promise.all(Array.from({length:10},()=>remove(a.hotelId,a.token)));
    assert.ok(outcomes.every(receiptRefusal));assert.ok(same(await snapshot(),before));
    mark('ten-protected-deletes-one-stable-receipt');
    const replay=await rpc('provision_workspace_registration',{p_workspace_id:a.workspaceId,p_owner_id:a.id,p_fields:fields(a)});
    assert.equal(replay.success,true);assert.equal(replay.idempotent,true);assert.equal(replay.hotel_id,a.hotelId);
    assert.ok(same(await snapshot(),before));mark('provision-replay-after-denied-delete-stable');}
  phase='live-authority';
  for(const bad of ['locked','inactive','auth-deleted','banned','unconfirmed','expired-session','role-revoked']){
    const id=await hotel(a,bad);await visible(a,id);let restore;
    if(bad==='role-revoked'){
      const row=(await db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='owner' RETURNING to_jsonb(user_roles) AS row",[a.id])).rows[0].row;
      restore=()=>db.query('INSERT INTO public.user_roles SELECT * FROM jsonb_populate_record(NULL::public.user_roles,$1::jsonb)',[JSON.stringify(row)]);
    }else{const [table,column,value]=bad==='locked'?['public.users','account_locked',true]:bad==='inactive'?['public.users','status','inactive']:
      bad==='auth-deleted'?['auth.users','deleted_at',new Date().toISOString()]:bad==='banned'?['auth.users','banned_until',new Date(Date.now()+3600000).toISOString()]:
      bad==='unconfirmed'?['auth.users','email_confirmed_at',null]:['auth.sessions','not_after',new Date(Date.now()-1000).toISOString()];
      const key=table==='auth.sessions'?a.sessionId:a.id,old=(await db.query('SELECT '+column+' AS value FROM '+table+' WHERE id=$1',[key])).rows[0].value;
      await db.query('UPDATE '+table+' SET '+column+'=$2 WHERE id=$1',[key,value]);restore=()=>db.query('UPDATE '+table+' SET '+column+'=$2 WHERE id=$1',[key,old]);
    }
    try{const s=await snapshot(),v=await remove(id,a.token);if(!denied(v)||!same(await snapshot(),s))findings.push({case:bad+'-unbound-delete',status:v.status,code:v.data?.code??null,deletedRows:Array.isArray(v.data)?v.data.length:null});
      else mark(bad+'-unbound-delete-denied-no-effects');}finally{await restore()}
  }
  const staleId=await hotel(a,'logout');assert.equal((await call('/auth/v1/logout?scope=global',a.token,undefined,'POST')).status,204);
  const logoutBefore=await snapshot(),logoutDelete=await remove(staleId,a.token);
  if(!denied(logoutDelete)||!same(await snapshot(),logoutBefore))findings.push({case:'real-gotrue-logout-stale-jwt-delete',status:logoutDelete.status,deletedRows:Array.isArray(logoutDelete.data)?logoutDelete.data.length:null});
  else mark('real-gotrue-logout-stale-jwt-denied-no-effects');
  phase='relogin-positive';await login(a);const empty=await hotel(a,'positive');await visible(a,empty);
  const positive=await remove(empty,a.token);assert.equal(positive.status,200);assert.deepEqual(positive.data,[{id:empty}]);mark('live-owner-empty-unbound-delete-positive');
  const unbound=await hotel(a,'draft-cascade');await visible(a,unbound);
  const unboundReceipt=await rpc('get_workspace_provisioning',{p_workspace_id:a.workspaceId});
  await rpc('save_hotel_room_setup',{p_hotel_id:unbound,p_expected_version:0,
    p_rooms:[{room_number:'UNBOUND-101',floor:1,room_type:'standard',max_guests:2,base_price:100000,hourly_price:0,monthly_price:0}]},a.token);
  assert.equal(Number((await db.query('SELECT count(*) FROM private.hotel_room_setup WHERE hotel_id=$1',[unbound])).rows[0].count),1);
  await addMembers(unbound);
  const relationState=async()=> (await db.query(`SELECT jsonb_build_object(
    'versions',(SELECT jsonb_object_agg(target_id::text,version::text) FROM private.employee_authority_versions WHERE target_id=ANY($1::uuid[]) AND kind='hotels'),
    'profiles',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u WHERE id=ANY($1::uuid[])),
    'otherMemberships',(SELECT jsonb_agg(to_jsonb(h) ORDER BY user_id,hotel_id) FROM public.user_hotels h WHERE user_id=ANY($1::uuid[]) AND hotel_id<>$2),
    'deletedMemberships',(SELECT count(*) FROM public.user_hotels WHERE hotel_id=$2),
    'receipts',(SELECT count(*) FROM private.employee_authority_receipts),
    'cancellations',(SELECT count(*) FROM private.employee_authority_cancellations)) AS value`,[[a.id,employee.id],unbound])).rows[0].value;
  const cascadeBefore=await relationState();assert.equal(cascadeBefore.deletedMemberships,2);
  assert.deepEqual((await remove(unbound,a.token)).data,[{id:unbound}]);
  const cascadeAfter=await relationState();assert.equal(cascadeAfter.deletedMemberships,0);
  for(const user of [a,employee])assert.equal(BigInt(cascadeAfter.versions[user.id]),BigInt(cascadeBefore.versions[user.id])+1n);
  for(const key of ['profiles','otherMemberships','receipts','cancellations'])assert.deepEqual(cascadeAfter[key],cascadeBefore[key]);
  mark('live-owner-two-membership-cascade-versioned-no-other-authority-effects');
  assert.equal(Number((await db.query('SELECT count(*) FROM private.hotel_room_setup WHERE hotel_id=$1',[unbound])).rows[0].count),0);
  assert.deepEqual(await rpc('get_workspace_provisioning',{p_workspace_id:a.workspaceId}),unboundReceipt);
  mark('live-owner-unbound-draft-delete-cascades-positive');
  if(findings.length===0){
    phase='revoke-first-race';const id=await hotel(a,'revoke-first'),locker=await db.connect();let pending;
    await addMembers(id);
    try{await locker.query('BEGIN');await locker.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]);
      pending=remove(id,a.token);await waitFor(async()=>Number((await db.query('SELECT count(*) FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[locker.processID])).rows[0].count)>0);
      await locker.query('COMMIT');const result=await pending;assert.ok(denied(result));await visible(a,id);
      races.push({case:'revoke-first-delete-waits',actualLockWait:true,denied:true});
    }finally{await locker.query('ROLLBACK');locker.release();await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);if(pending)await pending;}
    const again=await remove(id,a.token);assert.deepEqual(again.data,[{id}]);mark('revoke-first-restored-positive');
    phase='mutation-first-race';const id2=await hotel(a,'mutation-first'),rowLock=await db.connect(),revoker=await db.connect();let removal,revocation;
    await addMembers(id2);
    try{await rowLock.query('BEGIN');await rowLock.query('SELECT id FROM public.hotels WHERE id=$1 FOR UPDATE',[id2]);
      removal=remove(id2,a.token);let deletePid;
      await waitFor(async()=>{deletePid=(await db.query('SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[rowLock.processID])).rows[0]?.pid;return !!deletePid});
      revocation=revoker.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]).then(()=>({ok:true}),()=>({ok:false}));
      await waitFor(async()=>(await db.query('SELECT $1::int=ANY(pg_blocking_pids($2)) AS waiting',[deletePid,revoker.processID])).rows[0].waiting);
      await rowLock.query('COMMIT');assert.deepEqual((await removal).data,[{id:id2}]);assert.equal((await revocation).ok,true);
      const deniedId=await hotel(a,'after-revoke'),s=await snapshot(),v=await remove(deniedId,a.token);assert.ok(denied(v));assert.ok(same(await snapshot(),s));
      races.push({case:'delete-first-revoke-waits',actualLockWait:true,mutationCommittedBeforeRevocation:true,nextDeleteDenied:true});
    }finally{await rowLock.query('ROLLBACK');rowLock.release();if(removal)await removal;if(revocation)await revocation;revoker.release();await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);}
  }
  console.log(JSON.stringify(result()));
}catch(error){
  console.log(JSON.stringify({...result(),verified:false,incomplete:true,failedPhase:phase,
    harnessErrorCode:error.code??error.name??'HOTEL_DELETE_HARNESS_FAILED'}));
  throw error;
}finally{await db.end()}
