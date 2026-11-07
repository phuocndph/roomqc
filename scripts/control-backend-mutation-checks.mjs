// Exact-owned Docker fixture only. No external origins, provider or business DB.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_MUTATION_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);
assert.ok(input.publishableKey&&input.serviceKey&&input.databasePassword);
const checks=[],races=[],origin='http://127.0.0.1:8000';
let phase='fixtures';
process.on('uncaughtExceptionMonitor',()=>process.stderr.write(JSON.stringify({event:'mutation_caller_failed',phase,checks,races})+'\n'));
const db=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,
  max:4,statement_timeout:10000,connectionTimeoutMillis:5000,application_name:'owned-mutation-'+input.run});
async function call(name,body,token,{method='POST',path='/rest/v1/rpc/'+name}={}){
  const response=await fetch(origin+path,{method,signal:AbortSignal.timeout(8000),headers:{apikey:input.publishableKey,
    authorization:'Bearer '+token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await response.json()}catch{data=null}
  return {status:response.status,data};
}
async function good(label,name,body,token){
  const r=await call(name,body,token);
  if(r.status!==200)process.stderr.write(JSON.stringify({event:'mutation_positive_mismatch',label,status:r.status,sqlstate:r.data?.code??null})+'\n');
  assert.equal(r.status,200,label);checks.push(label);return r.data;
}
async function rejected(label,name,body,token,codes=['42501'],statuses=[401,403]){
  const r=await call(name,body,token);
  if(!statuses.includes(r.status)||!codes.includes(r.data?.code))process.stderr.write(JSON.stringify({event:'mutation_denial_mismatch',label,status:r.status,sqlstate:r.data?.code??null})+'\n');
  assert.ok(statuses.includes(r.status)&&codes.includes(r.data?.code),label);checks.push(label);
}
async function authAccount(label){
  const email='mut-'+input.run+'-'+label+'@roomqc.invalid',password=randomBytes(32).toString('hex');
  const u=await call('',{email,password,email_confirm:true},input.serviceKey,{path:'/auth/v1/admin/users'});
  assert.equal(u.status,200);const account={id:u.data.id,email,password};await login(account);return account;
}
async function login(account){
  const r=await call('',{email:account.email,password:account.password},input.publishableKey,{path:'/auth/v1/token?grant_type=password'});
  assert.equal(r.status,200);account.token=r.data.access_token;
  account.claims=JSON.parse(Buffer.from(account.token.split('.')[1],'base64url'));account.sessionId=account.claims.session_id;
}
async function owner(label){
  const u=await authAccount(label),r=await good('provision-'+label,'provision_workspace_registration',
    {p_workspace_id:randomUUID(),p_owner_id:u.id,p_fields:{fullName:'Owned mutation fixture',phone:'0901234567',
      tenantName:'Owned mutation fixture',hotelName:'Owned mutation hotel',hotelAddress:'123 Fixture Road',
      hotelPhone:'0281234567',hotelEmail:u.email,totalRooms:3}},input.serviceKey);
  assert.equal(r.success,true);return {...u,tenantId:r.tenant_id,hotelId:r.hotel_id};
}
async function staff(label,parent,role){
  const u=await authAccount(label);
  const profile={id:u.id,email:u.email,full_name:'Owned mutation '+label,tenant_id:parent.tenantId,hotel_id:parent.hotelId,
    role:'staff',user_level_code:role==='super_admin'?'super_admin':'staff',
    status:'active',created_by:parent.id,must_change_password:false,account_locked:false,is_super_admin:role==='super_admin'};
  for(const [table,body]of [['users',profile],['user_roles',{user_id:u.id,role}],['user_hotels',{user_id:u.id,hotel_id:parent.hotelId,assigned_by:parent.id}]]){
    const r=await call('',body,input.serviceKey,{path:'/rest/v1/'+table});assert.equal(r.status,201);
  }
  return {...u,tenantId:parent.tenantId,hotelId:parent.hotelId,role};
}
const tables=['auth.users','auth.sessions','public.users','public.user_roles','public.user_hotels',
  'private.hotel_room_setup','private.subscription_quotes','private.subscription_checkout_drafts','private.workspace_provisioning',
  'public.tenants','public.hotels','public.rooms','public.room_types','public.room_type_rates','public.tenant_usage',
  'public.invoices','public.payment_transactions','public.audit_log','public.email_deliveries','pgmq.q_transactional_emails',
  'private.subscription_reconciliation_cases','private.subscription_reconciliation_case_events','private.subscription_reconciliation_case_receipts',
  'private.subscription_status_job_runs','private.subscription_status_job_recoveries','private.subscription_lifecycle_progress',
  'private.subscription_lifecycle_commands','private.subscription_lifecycle_notification_outbox','public.staff_status'];
const snapshotSql="SELECT jsonb_build_object("+tables.map(t=>"'"+t+"',(SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM "+t+" r)").join(',')+") AS hashes";
const snapshot=async()=>(await db.query(snapshotSql)).rows[0].hashes;
const same=(before,after,label)=>{assert.deepEqual(after,before,label);checks.push(label)};
const a=await owner('owner'),b=await owner('other'),admin=await staff('admin',b,'super_admin'),employee=await staff('staff',a,'staff');
const rooms=[{room_number:'MUT-101',floor:1,room_type:'standard',max_guests:2,base_price:100000,hourly_price:0,monthly_price:0}];
const saveBody={p_hotel_id:a.hotelId,p_expected_version:0,p_rooms:rooms};
const draft=await good('room-save-positive','save_hotel_room_setup',saveBody,a.token);
const completeBody={p_hotel_id:a.hotelId,p_request_id:draft.request_id,p_version:draft.version,p_confirm_prices:true};
const quoteBody={p_request_id:randomUUID(),p_kind:'extend',p_rooms:3,p_duration_days:30};
const quote=await good('quote-create-positive','create_subscription_quote',quoteBody,a.token);
const checkoutBody={p_quote_id:quote.quote_id,p_request_id:randomUUID()};
const checkout=await good('checkout-create-positive','create_subscription_checkout_draft',checkoutBody,a.token);
assert.equal(checkout.non_payable,true);assert.equal(checkout.checkout_enabled,false);
const nextQuoteBody={...quoteBody,p_request_id:randomUUID()};
const nextQuote=await good('quote-next-positive','create_subscription_quote',nextQuoteBody,a.token);
const caseBody={p_payment_id:checkout.payment_id,p_request_id:randomUUID(),p_action:'create',p_note:'Owned caller review',p_expected_version:null};
const caseResult=await good('case-create-positive','admin_mutate_subscription_reconciliation_case',caseBody,admin.token);
assert.equal(caseResult.created,true);assert.ok(caseResult.case.id);
const ownerOperations=[
 ['room-read','get_hotel_room_setup',{p_hotel_id:a.hotelId}],
 ['room-save','save_hotel_room_setup',saveBody],
 ['room-complete','complete_hotel_room_setup',completeBody],
 ['quote-read','get_subscription_quote',{p_quote_id:quote.quote_id}],
 ['quote-replay','create_subscription_quote',quoteBody],
 ['quote-new','create_subscription_quote',{...quoteBody,p_request_id:randomUUID()}],
 ['checkout-read','get_subscription_checkout_draft',{p_request_id:checkoutBody.p_request_id}],
 ['checkout-replay','create_subscription_checkout_draft',checkoutBody],
 ['checkout-new','create_subscription_checkout_draft',{p_quote_id:nextQuote.quote_id,p_request_id:randomUUID()}],
 ['cancel','cancel_subscription_payment',{p_payment_id:checkout.payment_id}]
];
const manageBody={p_tenant_id:b.tenantId,p_action:'suspend',p_reason:'Owned caller permission review'};
const recoveryBody={p_run_id:randomUUID(),p_request_id:randomUUID(),p_expected_deadline_at:'2000-01-01T00:00:00Z',p_reason:'Owned missing run authorization'};
const adminOperations=[
 ['tenant-manage','admin_manage_tenant',manageBody],
 ['settle','settle_subscription_payment',{p_payment_id:checkout.payment_id,p_gateway_transaction_id:null}],
 ['reconciliation-read','admin_subscription_reconciliation',{p_tenant_id:a.tenantId}],
 ['case-read','admin_subscription_reconciliation_case',{p_payment_id:checkout.payment_id}],
 ['case-replay','admin_mutate_subscription_reconciliation_case',caseBody],
 ['case-note','admin_mutate_subscription_reconciliation_case',{...caseBody,p_request_id:randomUUID(),p_action:'note',p_expected_version:1}],
 ['job-monitor','admin_subscription_job_monitor',{}],
 ['job-recover','admin_recover_subscription_status_run',recoveryBody]
];
const invalidStates=['unconfirmed','banned','auth-deleted','profile-deleted','locked','inactive','null-status','role-revoked','expired-session'];
async function invalidate(u,state){
  let table,key,value;
  if(state==='unconfirmed'){table='auth.users';key='email_confirmed_at';value=null}
  if(state==='banned'){table='auth.users';key='banned_until';value=new Date(Date.now()+3600000).toISOString()}
  if(state==='auth-deleted'){table='auth.users';key='deleted_at';value=new Date().toISOString()}
  if(state==='profile-deleted'){table='public.users';key='deleted_at';value=new Date().toISOString()}
  if(state==='locked'){table='public.users';key='account_locked';value=true}
  if(state==='inactive'||state==='null-status'){table='public.users';key='status';value=state==='inactive'?'inactive':null}
  if(state==='expired-session'){table='auth.sessions';key='not_after';value=new Date(Date.now()-1000).toISOString()}
  if(state==='role-revoked'){
    const row=(await db.query('DELETE FROM public.user_roles WHERE user_id=$1 AND role::text=$2 RETURNING to_jsonb(user_roles) AS row',[u.id,u.role??'owner'])).rows[0]?.row;
    assert.ok(row);return async()=>{await db.query('INSERT INTO public.user_roles SELECT * FROM jsonb_populate_record(NULL::public.user_roles,$1::jsonb)',[JSON.stringify(row)])};
  }
  const id=table==='auth.sessions'?u.sessionId:u.id;
  const previous=(await db.query('SELECT '+key+' AS value FROM '+table+' WHERE id=$1',[id])).rows[0];
  assert.ok(previous);assert.equal((await db.query('UPDATE '+table+' SET '+key+'=$2 WHERE id=$1',[id,value])).rowCount,1);
  return async()=>{await db.query('UPDATE '+table+' SET '+key+'=$2 WHERE id=$1',[id,previous.value])};
}
async function ownerPositive(label){
  assert.equal((await good(label+'-room','get_hotel_room_setup',{p_hotel_id:a.hotelId},a.token)).version,draft.version);
  assert.equal((await good(label+'-checkout','create_subscription_checkout_draft',checkoutBody,a.token)).draft_id,checkout.draft_id);
}
async function adminPositive(label){
  assert.equal((await good(label+'-case','admin_mutate_subscription_reconciliation_case',caseBody,admin.token)).case.id,caseResult.case.id);
  await good(label+'-monitor','admin_subscription_job_monitor',{},admin.token);
}
try{
  phase='invalid-state-matrix';
  for(const [u,operations,positive]of [[a,ownerOperations,ownerPositive],[admin,adminOperations,adminPositive]]){
    for(const state of invalidStates){
      const restore=await invalidate(u,state);
      try{
        const before=await snapshot();
        for(const [label,name,body]of operations)await rejected((u===a?'owner-':'admin-')+state+'-'+label,name,body,u.token);
        same(before,await snapshot(),'no-side-effects-'+(u===a?'owner-':'admin-')+state);
      }finally{await restore()}
      await positive('restored-'+(u===a?'owner-':'admin-')+state);
    }
  }
  phase='scope-and-service';
  const beforeScope=await snapshot();
  for(const [label,name,body]of ownerOperations)await rejected('staff-'+label,name,body,employee.token);
  for(const [label,name,body]of adminOperations)await rejected('owner-not-platform-'+label,name,body,a.token);
  for(const [label,name,body]of ownerOperations.filter(x=>!['quote-new','quote-replay'].includes(x[0]))){
    await rejected('other-tenant-'+label,name,body,b.token,
      label.startsWith('room-')||label==='cancel'?['42501']:['PT404'],label.startsWith('room-')||label==='cancel'?[401,403]:[404]);
  }
  await rejected('browser-helper-inaccessible','lock_live_role_actor',{p_role:'super_admin'},a.token,['PGRST202'],[404]);
  same(beforeScope,await snapshot(),'scope-denials-no-side-effects');
  await rejected('service-draft-not-payable','settle_subscription_payment',{p_payment_id:checkout.payment_id},input.serviceKey,['PT409'],[409]);
  await rejected('live-admin-draft-not-payable','settle_subscription_payment',{p_payment_id:checkout.payment_id},admin.token,['PT409'],[409]);
  await good('admin-reconciliation-positive','admin_subscription_reconciliation',{p_tenant_id:a.tenantId},admin.token);
  await good('admin-case-read-positive','admin_subscription_reconciliation_case',{p_payment_id:checkout.payment_id},admin.token);
  await rejected('live-admin-missing-recovery-explicit','admin_recover_subscription_status_run',recoveryBody,admin.token,['PT404'],[404]);
  phase='actual-job-recovery';
  const recoveryRun=randomUUID();
  assert.equal((await good('begin-owned-atomic-run','begin_atomic_subscription_status_run',
    {p_run_id:recoveryRun,p_scope:{kind:'tenants',tenant_ids:[b.tenantId]}},input.serviceKey)).acquired,true);
  const expiredRun=await db.query("UPDATE private.subscription_status_job_runs SET started_at=statement_timestamp()-interval '16 minutes', deadline_at=statement_timestamp()-interval '1 minute' WHERE id=$1 RETURNING deadline_at::text AS deadline",[recoveryRun]);
  assert.equal(expiredRun.rowCount,1);
  // Keep full timestamp precision: pg's Date conversion would lose microseconds.
  Object.assign(recoveryBody,{p_run_id:recoveryRun,p_expected_deadline_at:expiredRun.rows[0].deadline,
    p_reason:'Owned expired atomic run reviewed for recovery'});
  const beforeRecovery=await snapshot();
  const recovered=await good('actual-recovery-positive','admin_recover_subscription_status_run',recoveryBody,admin.token);
  assert.equal(recovered.released,true);assert.equal(recovered.replayed,false);
  const recoveredSnapshot=await snapshot();
  for(const table of tables.filter(t=>!['private.subscription_status_job_runs','private.subscription_status_job_recoveries'].includes(t)))
    assert.equal(recoveredSnapshot[table],beforeRecovery[table],'recovery-only-run-and-receipt-'+table);
  assert.notEqual(recoveredSnapshot['private.subscription_status_job_runs'],beforeRecovery['private.subscription_status_job_runs']);
  assert.notEqual(recoveredSnapshot['private.subscription_status_job_recoveries'],beforeRecovery['private.subscription_status_job_recoveries']);
  assert.equal((await good('actual-recovery-replay','admin_recover_subscription_status_run',recoveryBody,admin.token)).replayed,true);
  same(recoveredSnapshot,await snapshot(),'actual-recovery-replay-no-side-effects');
  phase='revocation-races';
  async function blockedBy(pid,queryName){
    const deadline=Date.now()+4500;
    while(Date.now()<deadline){
      const rows=await db.query("SELECT pid FROM pg_stat_activity WHERE wait_event_type='Lock' AND $1::integer=ANY(pg_blocking_pids(pid)) AND query LIKE $2",[pid,'%'+queryName+'%']);
      if(rows.rowCount)return rows.rows[0].pid;
      await new Promise(r=>setTimeout(r,20));
    }
    assert.fail('Expected actual overlapping row-lock wait for '+queryName);
  }
  async function race(u,operation,mutation,restore,authorityChange='profile-lock'){
    const [label,name,body]=operation,writer=await db.connect();let pending;
    try{
      await writer.query('BEGIN');const pid=(await writer.query('SELECT pg_backend_pid() AS id')).rows[0].id;
      assert.equal((await writer.query(mutation,[u.id,u.sessionId])).rowCount,1);
      const before=await snapshot();
      pending=call(name,body,u.token).then(value=>({value}),error=>({error}));
      await blockedBy(pid,name);await writer.query('COMMIT');
      const result=await pending;assert.ifError(result.error);
      assert.ok([401,403].includes(result.value.status)&&result.value.data?.code==='42501',label+' race must deny');
      // Snapshot taken before the held authority change: compare only business rows.
      const after=await snapshot();for(const table of Object.keys(before).filter(t=>!['auth.users','auth.sessions','public.users','public.user_roles'].includes(t)))assert.equal(after[table],before[table],label+' race '+table);
      races.push({caller:name,mutation:label,authorityChange,overlapVerified:true,denied:true,businessUnchanged:true});
    }finally{await writer.query('ROLLBACK');writer.release();await pending;await restore()}
  }
  for(const op of ownerOperations.filter(x=>['room-save','room-complete','quote-replay','checkout-replay','cancel'].includes(x[0])))
    await race(a,op,'UPDATE public.users SET account_locked=true WHERE id=$1 AND $2::uuid IS NOT NULL',()=>db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]));
  for(const op of adminOperations.filter(x=>['tenant-manage','settle','case-replay','job-recover'].includes(x[0])))
    await race(admin,op,'UPDATE public.users SET account_locked=true WHERE id=$1 AND $2::uuid IS NOT NULL',()=>db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[admin.id]));
  await race(admin,adminOperations[0],'UPDATE auth.users SET banned_until=now()+interval \'1 hour\' WHERE id=$1 AND $2::uuid IS NOT NULL',
    ()=>db.query('UPDATE auth.users SET banned_until=NULL WHERE id=$1',[admin.id]),'auth-ban');
  for(const [u,operation]of [[a,ownerOperations[1]],[admin,adminOperations[0]]]){
    const role=u.role??'owner';
    const original=(await db.query('SELECT to_jsonb(r) AS row FROM public.user_roles r WHERE user_id=$1 AND role::text=$2',[u.id,role])).rows[0].row;
    await race(u,operation,"DELETE FROM public.user_roles WHERE user_id=$1 AND $2::uuid IS NOT NULL AND role::text='"+role+"'",
      ()=>db.query('INSERT INTO public.user_roles SELECT * FROM jsonb_populate_record(NULL::public.user_roles,$1::jsonb)',[JSON.stringify(original)]),'role-revoke');
  }
  for(const [u,operation]of [[a,ownerOperations[1]],[admin,adminOperations[0]]])
    await race(u,operation,'DELETE FROM auth.sessions WHERE user_id=$1 AND id=$2',()=>login(u),'session-delete');
  // Opposite serialization order: mutation owns the authority lock first, so
  // revocation must wait. It takes effect for the NEXT command, not retroactively.
  phase='mutation-first-race';
  const holder=await db.connect(),revoker=await db.connect();let mutationPending,revocationPending;
  try{
    await holder.query('BEGIN');
    const holderPid=(await holder.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    await holder.query('SELECT id FROM public.tenants WHERE id=$1 FOR UPDATE',[b.tenantId]);
    mutationPending=call('admin_manage_tenant',manageBody,admin.token).then(value=>({value}),error=>({error}));
    const mutationPid=await blockedBy(holderPid,'admin_manage_tenant');
    await revoker.query('BEGIN');
    const revokerPid=(await revoker.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    revocationPending=revoker.query('UPDATE public.users SET account_locked=true WHERE id=$1',[admin.id]).then(value=>({value}),error=>({error}));
    const deadline=Date.now()+4500;let overlap=false;
    while(Date.now()<deadline){
      overlap=(await db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock' AND $2::integer=ANY(pg_blocking_pids(pid))",[revokerPid,mutationPid])).rowCount===1;
      if(overlap)break;await new Promise(r=>setTimeout(r,20));
    }
    assert.equal(overlap,true,'revocation must actually wait for mutation authority lock');
    await holder.query('COMMIT');
    const mutationResult=await mutationPending;assert.ifError(mutationResult.error);
    assert.equal(mutationResult.value.status,200);assert.equal(mutationResult.value.data.subscription_status,'suspended');
    const revoked=await revocationPending;assert.ifError(revoked.error);assert.equal(revoked.value.rowCount,1);
    await revoker.query('COMMIT');
    const beforeDenied=await snapshot();
    await rejected('mutation-first-next-command-denied','admin_manage_tenant',manageBody,admin.token);
    same(beforeDenied,await snapshot(),'mutation-first-next-command-no-side-effects');
    races.push({caller:'admin_manage_tenant',authorityChange:'profile-lock',mutationFirst:true,overlapVerified:true,
      mutationCommittedBeforeRevocation:true,nextCommandDenied:true});
  }finally{
    await holder.query('ROLLBACK');await revoker.query('ROLLBACK');
    await mutationPending;await revocationPending;holder.release();revoker.release();
    await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[admin.id]);
  }
  await ownerPositive('race-restored-owner');await adminPositive('race-restored-admin');
  phase='completion-and-cancel';
  const beforeComplete=await snapshot();
  const complete=await good('room-complete-positive','complete_hotel_room_setup',completeBody,a.token);
  assert.equal(complete.actual_rooms,1);assert.equal(complete.idempotent,false);
  const completeSnapshot=await snapshot();
  assert.equal((await good('room-complete-replay','complete_hotel_room_setup',completeBody,a.token)).idempotent,true);
  same(completeSnapshot,await snapshot(),'room-replay-no-side-effects');
  assert.notEqual(beforeComplete['public.rooms'],completeSnapshot['public.rooms']);
  const cancellation=await good('cancel-positive','cancel_subscription_payment',{p_payment_id:checkout.payment_id},a.token);
  assert.equal(cancellation.already_cancelled,false);
  const cancelledSnapshot=await snapshot();
  assert.equal((await good('cancel-replay','cancel_subscription_payment',{p_payment_id:checkout.payment_id},a.token)).already_cancelled,true);
  same(cancelledSnapshot,await snapshot(),'cancel-replay-no-side-effects');
  const nextCheckout=await good('checkout-new-after-cancel','create_subscription_checkout_draft',{p_quote_id:nextQuote.quote_id,p_request_id:randomUUID()},a.token);
  assert.equal(nextCheckout.non_payable,true);
  const entitlementBefore=(await db.query('SELECT subscription_end_date,trial_ends_at FROM public.tenants WHERE id=$1',[b.tenantId])).rows[0];
  const suspended=await good('tenant-suspend-positive','admin_manage_tenant',manageBody,admin.token);
  assert.equal(suspended.subscription_status,'suspended');
  const active=await good('tenant-reactivate-positive','admin_manage_tenant',{...manageBody,p_action:'reactivate'},admin.token);
  assert.equal(active.subscription_status,entitlementBefore.subscription_end_date===null?'trial':'active');
  same(entitlementBefore,(await db.query('SELECT subscription_end_date,trial_ends_at FROM public.tenants WHERE id=$1',[b.tenantId])).rows[0],
    'reactivation-does-not-renew-subscription-or-trial');
  phase='logout-before-replay';
  for(const [u,operations]of [[a,[
    ['complete-replay','complete_hotel_room_setup',completeBody],['cancel-replay','cancel_subscription_payment',{p_payment_id:checkout.payment_id}],
    ['quote-replay','create_subscription_quote',quoteBody],['checkout-replay','create_subscription_checkout_draft',checkoutBody]
  ]],[admin,adminOperations]]){
    const logout=await call('',undefined,u.token,{path:'/auth/v1/logout?scope=global'});assert.equal(logout.status,204);
    const before=await snapshot();for(const [label,name,body]of operations)await rejected('logged-out-'+label,name,body,u.token);
    same(before,await snapshot(),'logout-replay-no-side-effects-'+(u===a?'owner':'admin'));await login(u);
  }
  await adminPositive('new-session-admin');
  assert.equal((await good('new-session-recovery-replay','admin_recover_subscription_status_run',recoveryBody,admin.token)).replayed,true);
  assert.equal((await good('new-session-owner-complete-replay','complete_hotel_room_setup',completeBody,a.token)).idempotent,true);
  console.log(JSON.stringify({verified:true,checks,fixtures:4,invalidStates:invalidStates.length,
    ownerCallerOperations:ownerOperations.length,adminCallerOperations:adminOperations.length,
    matrixDenials:invalidStates.length*(ownerOperations.length+adminOperations.length),snapshotTables:tables.length,
    realHttp:true,denialBusinessSnapshotsVerified:true,revocationRaces:races,trustedServiceDraftStillNonPayable:true,
    initialRecoveryExecutionVerified:true,recoveryReplayNoSideEffects:true,reactivationDoesNotRenew:true,providerEnabled:false}));
}finally{await db.end()}
