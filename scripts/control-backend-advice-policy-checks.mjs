// Actual Auth/REST/Postgres policy commands and populated576->577 rehearsal.
// Tokens/fixture data stay inside the exact-owned harness; output is sanitized.
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import pg from '/control/node_modules/pg/lib/index.js';
import {createAdvicePolicyFixture} from '/control/testing/advice-policy-fixture.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_ADVICE_POLICY_INPUT??'null');assert.match(input?.run??'',/^[a-f0-9]{12}$/);
assert.ok(['current','seed576','rollback577','post577'].includes(input.phase));
const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,max:6,statement_timeout:25000,connectionTimeoutMillis:5000});
const checks=[],barriers=[];let stage=input.phase,aclFixture;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const rec=(label,passed,details={})=>{checks.push({label:'advice-policy-'+label,passed,actualNative:true,...details});assert.ok(passed,'OWNED_POLICY_CONTROL_FAILED')};
async function call(path,token,body,method='POST'){const r=await fetch('http://127.0.0.1:8000'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),
 headers:{apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify(body)});
 let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};}
const rpc=(name,a,args={})=>call('/rest/v1/rpc/'+name,a.token??a,args);
const fixture=createAdvicePolicyFixture({db,input,call,rpc});
async function account(label){const email='policy-'+input.run+'-'+label+'@roomqc.invalid',password=createHmac('sha256',input.serviceKey).update(email).digest('hex');
 const created=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(created.status,200);
 const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);
 return{id:created.data.id,email,token:login.data.access_token,sessionId:JSON.parse(Buffer.from(login.data.access_token.split('.')[1],'base64url')).session_id};}
async function owner(label){const a=await account(label),p=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:a.id,p_fields:{
 fullName:'Owned policy checks',phone:'0901234567',tenantName:'Owned policy checks',hotelName:'Owned policy checks',hotelAddress:'123 Fixture Road',
 hotelPhone:'0281234567',hotelEmail:a.email,totalRooms:5}});assert.equal(p.status,200);assert.equal(p.data.success,true);return{...a,tenantId:p.data.tenant_id,hotelId:p.data.hotel_id};}
const policy=(extra={})=>({enabled:true,daily_limit:100,daily_budget_units:1000,units_per_request:5,valid_until:new Date(Date.now()+3600000).toISOString(),reason:'Owned live policy checks',...extra});
const args=(a,id,version,p)=>({p_tenant_id:a.tenantId,p_command_id:id,p_expected_version:version,p_policy:p});
const read=(op,a)=>rpc('get_operations_advice_policy',op,{p_tenant_id:a.tenantId});
const set=(op,a,id,v,p)=>rpc('set_operations_advice_policy',op,args(a,id,v,p));
const cancel=(op,a,id,v,p)=>rpc('cancel_operations_advice_policy_command',op,args(a,id,v,p));
const lookup=(op,a,id)=>rpc('get_operations_advice_policy_command',op,{p_tenant_id:a.tenantId,p_command_id:id});
const denied=r=>[401,403].includes(r.status)&&r.data?.code==='42501';
const snapshot=async a=>(await db.query(`SELECT jsonb_build_object(
 'policy',(SELECT to_jsonb(p) FROM private.operations_advice_policy p WHERE tenant_id=$1),
 'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY actor_id,command_id) FROM private.operations_advice_policy_commands c WHERE tenant_id=$1),
 'audit',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.activity_logs l WHERE tenant_id=$1 AND entity_type='operations_advice_policy')) AS value`,[a.tenantId])).rows[0].value;
const countAudit=s=>s.audit?.length??0;
async function held(kind,a,id,op,tasksFactory,whileHeld){const holder=await db.connect();let tasks=[];
 try{await holder.query('BEGIN');const pid=Number((await holder.query('SELECT pg_backend_pid() AS id')).rows[0].id);
  if(kind==='audit')await holder.query('LOCK TABLE public.activity_logs IN ACCESS EXCLUSIVE MODE');
  // A table lock blocks the command's early receipt lookup and never proves
  // that the final INSERT was reached. The fixture trigger below waits on
  // this command-specific advisory key at BEFORE INSERT instead.
  else if(kind==='receipt')await holder.query('SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1,0))',['operations-advice-policy-receipt:'+op.id+':'+id]);
  else if(kind==='command')await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['operations-advice-policy-command:'+op.id+':'+id]);
  else await holder.query('SELECT tenant_id FROM private.operations_advice_policy WHERE tenant_id=$1 FOR UPDATE',[a.tenantId]);
  tasks=tasksFactory();let waiters=0;const until=Date.now()+5000;
  while(Date.now()<until){const q=await db.query(`WITH RECURSIVE blocked(pid) AS(
   SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'
   UNION SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid=ANY(pg_blocking_pids(a.pid)) WHERE a.wait_event_type='Lock')
   SELECT count(DISTINCT pid)::int AS n FROM blocked`,[pid]);waiters=q.rows[0].n;if(waiters>=tasks.length)break;await new Promise(r=>setTimeout(r,20));}
  assert.ok(waiters>=tasks.length,'OWNED_POLICY_WAITER_REQUIRED');barriers.push({stage,kind,observedLockWaiters:waiters,requests:tasks.length});
  if(whileHeld)await whileHeld();await holder.query('COMMIT');return await Promise.all(tasks);
 }finally{await holder.query('ROLLBACK').catch(()=>{});holder.release();await Promise.allSettled(tasks);}
}
const scope=a=>({p_start_date:'2026-10-01',p_end_date:'2026-10-31',p_hotel_id:a.hotelId,p_timezone:'Asia/Ho_Chi_Minh'});
const prepare=(a,id)=>rpc('prepare_operations_advice',a,{p_command_id:id,...scope(a)});
const dispatch=(a,id)=>rpc('dispatch_operations_advice',input.serviceKey,{p_actor_id:a.id,p_command_id:id,p_session_id:a.sessionId});
const advice=Array.from({length:3},(_,i)=>({title:'Policy '+i,description:'Owned scoped result.',action:'Review receipt.',priority:'medium'}));
const finish=(a,id,nonce,output=advice)=>rpc('finish_operations_advice',input.serviceKey,{p_actor_id:a.id,p_command_id:id,p_dispatch_token:nonce,p_advice:output});
async function exercise(){
 const a=await owner('new-owner'),b=await owner('new-foreign'),op=await fixture.operator();aclFixture={id:a.id,sessionId:a.sessionId};
 rec('real-platform-operator',Boolean(op.sessionId)&&(await rpc('platform_support_actor',op)).data===op.id);
 const empty=await read(op,a);rec('default-missing-policy-is-disabled',empty.status===200&&empty.data.revision===0&&empty.data.policy===null);
 const p=policy(),id=randomUUID(),opPaths=()=>[
  ['read',actor=>read(actor,a)],['apply',actor=>set(actor,a,id,0,p)],['lookup',actor=>lookup(actor,a,id)],['cancel',actor=>cancel(actor,a,id,0,p)]];
 stage='denials';const deniedBefore=await snapshot(a);
 for(const [label,actor]of [['owner',a],['service',input.serviceKey],['anon',input.publishableKey]])for(const[path,run]of opPaths()){
  const result=await run(actor);rec(label+'-cannot-'+path,denied(result)&&isDeepStrictEqual(await snapshot(a),deniedBefore),{status:result.status});}
 const legacy=await rpc('configure_operations_advice_policy',input.serviceKey,{p_tenant_id:a.tenantId,p_enabled:true,p_daily_limit:100,p_daily_budget_units:1000,
  p_units_per_request:5,p_valid_until:p.valid_until,p_reason:p.reason});rec('legacy-service-config-is-closed',denied(legacy)&&isDeepStrictEqual(await snapshot(a),deniedBefore));
 await call('/auth/v1/user',a.token,{data:{role:'super_admin',is_super_admin:true}},'PUT');
 rec('editable-metadata-does-not-grant-policy-write',denied(await set(a,a,id,0,p)));
 stage='idempotency';const made=await set(op,a,id,0,p);assert.equal(made.status,200);
 rec('live-command-creates-version1-and-attributed-audit',made.data.state==='succeeded'&&made.data.result.revision===1
  &&(await snapshot(a)).audit[0].user_id===op.id);
 const first=await snapshot(a),replays=[];for(let i=0;i<20;i++)replays.push(await set(op,a,id,0,p));
 rec('twenty-same-key-replays-one-version-audit-receipt',replays.every(r=>r.status===200&&isDeepStrictEqual(r.data,made.data))&&isDeepStrictEqual(await snapshot(a),first));
 const reordered={reason:'  '+p.reason+'  ',valid_until:p.valid_until.replace('Z','+00:00'),units_per_request:5,daily_budget_units:1000,daily_limit:100,enabled:true};
 rec('canonical-key-order-reason-and-offset-replay',isDeepStrictEqual((await set(op,a,id,0,reordered)).data,made.data)&&isDeepStrictEqual(await snapshot(a),first));
 rec('same-key-different-payload-conflicts',(await set(op,a,id,0,{...p,daily_limit:101})).status===409&&isDeepStrictEqual(await snapshot(a),first));
 rec('same-key-different-base-version-conflicts',(await set(op,a,id,1,p)).status===409&&isDeepStrictEqual(await snapshot(a),first));
 rec('same-key-different-tenant-conflicts',(await set(op,b,id,0,p)).status===409&&(await read(op,b)).data.policy===null);
 rec('lookup-wrong-tenant-denied',denied(await lookup(op,b,id)));
 rec('lookup-recovers-original-receipt',isDeepStrictEqual((await lookup(op,a,id)).data,made.data));
 rec('cancel-cannot-undo-success',isDeepStrictEqual((await cancel(op,a,id,0,p)).data,made.data)&&isDeepStrictEqual(await snapshot(a),first));
 stage='validation';const invalids=[{...p,extra:true},{...p,enabled:'true'},{...p,daily_limit:0},{...p,daily_budget_units:0},{...p,units_per_request:1001},
  {...p,daily_limit:1.1},{...p,valid_until:'infinity'},{...p,valid_until:'2026-02-30T00:00:00Z'},{...p,reason:'x'},{...p,reason:'x'.repeat(1001)}];
 for(let i=0;i<invalids.length;i++)rec('invalid-policy-'+i+'-no-effects',(await set(op,a,randomUUID(),1,invalids[i])).status===400&&isDeepStrictEqual(await snapshot(a),first));
 stage='two-editors';const keys=[randomUUID(),randomUUID()],edits=[{...p,daily_limit:101},{...p,daily_limit:102}];
 const results=await held('policy',a,keys[0],op,()=>keys.map((key,i)=>set(op,a,key,1,edits[i])));
 rec('two-stale-editors-one-success-one409',results.filter(r=>r.status===200).length===1&&results.filter(r=>r.status===409).length===1);
 const afterRace=await snapshot(a);rec('stale-editor-does-not-overwrite-version-or-audit',afterRace.policy.version===2&&countAudit(afterRace)===2&&afterRace.commands.length===2);
 const loser=results.findIndex(r=>r.status===409);rec('conflicting-uncommitted-command-can-be-cancelled',(await cancel(op,a,keys[loser],1,edits[loser])).data.state==='cancelled');
 const afterCancel=await snapshot(a);rec('late-loser-apply-is-fenced-by-cancel',(await set(op,a,keys[loser],1,edits[loser])).data.state==='cancelled'&&isDeepStrictEqual(await snapshot(a),afterCancel));
 stage='cancel-first';const phantom=randomUUID();rec('cancel-before-apply-creates-terminal-tombstone',(await cancel(op,b,phantom,0,p)).data.state==='cancelled');
 rec('late-apply-never-creates-policy',(await set(op,b,phantom,0,p)).data.state==='cancelled'&&(await read(op,b)).data.policy===null);
 stage='apply-cancel-race';const both=randomUUID(),beforeBoth=await snapshot(a);
 const raceBoth=await held('command',a,both,op,()=>[set(op,a,both,2,p),cancel(op,a,both,2,p)]);
 rec('apply-cancel-same-key-share-one-terminal-result',raceBoth.every(r=>r.status===200)&&isDeepStrictEqual(raceBoth[0].data,raceBoth[1].data));
 const afterBoth=await snapshot(a);rec('apply-cancel-one-audit-and-no-double-version',countAudit(afterBoth)===countAudit(beforeBoth)+1
  &&afterBoth.policy.version===beforeBoth.policy.version+(raceBoth[0].data.state==='succeeded'?1:0));
 rec('historical-receipt-is-not-current-policy-read',isDeepStrictEqual((await lookup(op,a,id)).data,made.data)&&(await read(op,a)).data.revision>=2);
 for(const kind of ['audit','receipt']){
  stage=kind+'-fault';const before=await snapshot(a),key=randomUUID(),v=before.policy.version;let failed;
  const table=kind==='audit'?'public.activity_logs':'private.operations_advice_policy_commands';
  try{await db.query(`CREATE FUNCTION private.roomqc_owned_policy_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN ${kind==='audit'?"IF NEW.entity_type='operations_advice_policy' THEN RAISE EXCEPTION 'OWNED_POLICY_FAULT' USING ERRCODE='P0001';END IF;":"RAISE EXCEPTION 'OWNED_POLICY_FAULT' USING ERRCODE='P0001';"} RETURN NEW;END;$f$;
    CREATE TRIGGER roomqc_owned_policy_fault BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION private.roomqc_owned_policy_fault();`);
   failed=await set(op,a,key,v,p);
  }finally{await db.query(`DROP TRIGGER IF EXISTS roomqc_owned_policy_fault ON ${table};DROP FUNCTION IF EXISTS private.roomqc_owned_policy_fault()`)}
  rec(kind+'-fault-rolls-back-policy-audit-and-receipt',failed.status>=400&&isDeepStrictEqual(await snapshot(a),before));
  rec(kind+'-restored-same-command-succeeds',(await set(op,a,key,v,p)).data.state==='succeeded');
 }
 stage='offboarding';
 const cases=[['auth-softdelete','auth.users','deleted_at',op.id,"clock_timestamp()"],['auth-unconfirmed','auth.users','email_confirmed_at',op.id,'NULL'],
  ['auth-banned','auth.users','banned_until',op.id,"clock_timestamp()+interval '1 hour'"],['profile-inactive','public.users','status',op.id,"'inactive'"],
  ['profile-deleted','public.users','deleted_at',op.id,'clock_timestamp()'],['profile-locked','public.users','account_locked',op.id,'true'],
  ['session-expired','auth.sessions','not_after',op.sessionId,"clock_timestamp()-interval '1 second'"]];
 for(const [label,table,column,key,expression]of cases){
  const saved=(await db.query(`SELECT ${column} AS value FROM ${table} WHERE id=$1`,[key])).rows[0].value,before=await snapshot(a);
  try{await db.query(`UPDATE ${table} SET ${column}=${expression} WHERE id=$1`,[key]);
   for(const[path,run]of opPaths())rec(label+'-denies-'+path,denied(await run(op))&&isDeepStrictEqual(await snapshot(a),before));
  }finally{await db.query(`UPDATE ${table} SET ${column}=$2 WHERE id=$1`,[key,saved])}
 }
 for(const which of ['role','session']){
  const table=which==='role'?'public.user_roles':'auth.sessions',query=which==='role'?"user_id=$1 AND role='super_admin'":'id=$1',key=which==='role'?op.id:op.sessionId;
  const saved=(await db.query(`SELECT to_jsonb(t) AS value FROM ${table} t WHERE ${query}`,[key])).rows[0].value,before=await snapshot(a);
  try{await db.query(`DELETE FROM ${table} WHERE ${query}`,[key]);for(const[path,run]of opPaths())rec(which+'-removed-denies-'+path,denied(await run(op))&&isDeepStrictEqual(await snapshot(a),before));}
  finally{await db.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table},$1::jsonb)`,[JSON.stringify(saved)])}
 }
 rec('operator-restored-positive-original-receipt',isDeepStrictEqual((await lookup(op,a,id)).data,made.data));
 for(const [kind,clock]of [['audit','policy'],['receipt','policy'],['command','session'],['audit','session'],['receipt','session'],['audit','jwt']]){
  stage=clock+'-expiry-after-'+kind;const before=await snapshot(a),v=before.policy.version,key=randomUUID(),started=Date.now();let targetOp=op,targetPolicy=p,savedSession;
  if(clock==='policy')targetPolicy={...p,valid_until:new Date(Date.now()+3000).toISOString()};
  if(clock==='session'){savedSession=(await db.query('SELECT not_after FROM auth.sessions WHERE id=$1',[op.sessionId])).rows[0].not_after;
   await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '3 seconds' WHERE id=$1",[op.sessionId]);}
  if(clock==='jwt'){assert.ok(input.jwtSecret);const parts=op.token.split('.'),claims=JSON.parse(Buffer.from(parts[1],'base64url'));claims.exp=Math.floor(Date.now()/1000)+3;
   const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify(claims)).toString('base64url');
   targetOp={...op,token:head+'.'+body+'.'+createHmac('sha256',input.jwtSecret).update(head+'.'+body).digest('base64url')};}
  let response;
  try{
   if(kind==='receipt'){
    await db.query(`CREATE FUNCTION private.roomqc_owned_policy_receipt_wait() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
      BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('operations-advice-policy-receipt:'||NEW.actor_id::text||':'||NEW.command_id::text,0)); RETURN NEW; END;$f$;
      CREATE TRIGGER roomqc_owned_policy_receipt_wait BEFORE INSERT ON private.operations_advice_policy_commands
      FOR EACH ROW EXECUTE FUNCTION private.roomqc_owned_policy_receipt_wait()`);
   }
   [response]=await held(kind,a,key,op,()=>[set(targetOp,a,key,v,targetPolicy)],()=>db.query('SELECT pg_sleep(3.5)'));
  }finally{
   if(kind==='receipt')await db.query('DROP TRIGGER IF EXISTS roomqc_owned_policy_receipt_wait ON private.operations_advice_policy_commands;DROP FUNCTION IF EXISTS private.roomqc_owned_policy_receipt_wait()');
   if(clock==='session')await db.query('UPDATE auth.sessions SET not_after=$2 WHERE id=$1',[op.sessionId,savedSession])
  }
  rec(clock+'-expiry-after-'+kind+'-rolls-back',response.status===(clock==='policy'?400:403)&&isDeepStrictEqual(await snapshot(a),before),
   {status:response.status,realClock:true,elapsedMs:Date.now()-started});
  rec(clock+'-expiry-after-'+kind+'-restored-same-key',(await set(op,a,key,v,p)).data.state==='succeeded');
 }
 stage='disabled-expired';let current=await read(op,a),disabled=await set(op,a,randomUUID(),current.data.revision,{...p,enabled:false,valid_until:'2000-01-01T00:00:00Z'});
 rec('expired-policy-can-be-explicitly-disabled',disabled.data.state==='succeeded'&&disabled.data.result.policy.enabled===false);
 rec('disabled-policy-still-blocks-new-advice',denied(await prepare(a,randomUUID())));
 stage='policy-advice-integration';current=await read(op,a);await set(op,a,randomUUID(),current.data.revision,p);
 const adviceId=randomUUID();rec('enabled-policy-allows-real-owner-prepare',(await prepare(a,adviceId)).data.state==='reserved');
 current=await read(op,a);await set(op,a,randomUUID(),current.data.revision,{...p,daily_limit:101});
 rec('policy-version-change-cancels-stale-advice-reservation',(await dispatch(a,adviceId)).data.state==='cancelled');
 const charged=randomUUID();await prepare(a,charged);const claimed=await dispatch(a,charged);assert.equal(claimed.data.state,'dispatch');
 const journal=()=>db.query('SELECT to_jsonb(c) AS value FROM private.operations_advice_commands c WHERE actor_id=$1 AND command_id=$2',[a.id,charged]).then(r=>r.rows[0].value),chargedBefore=await journal();
 current=await read(op,a);await set(op,a,randomUUID(),current.data.revision,{...p,enabled:false});
 rec('disabled-policy-denies-inflight-result-with-charge-retained',denied(await finish(a,charged,claimed.data.dispatch_token))&&isDeepStrictEqual(await journal(),chargedBefore));
 current=await read(op,a);await set(op,a,randomUUID(),current.data.revision,p);
 rec('reenabled-policy-does-not-redispatch-old-command',(await dispatch(a,charged)).data.state==='unknown'&&isDeepStrictEqual(await journal(),chargedBefore));
 const finished=await finish(a,charged,claimed.data.dispatch_token);rec('positive-result-uses-original-dispatch',finished.data.state==='completed');
 const completedBefore=await journal();current=await read(op,a);await set(op,a,randomUUID(),current.data.revision,{...p,daily_limit:1,daily_budget_units:5});
 rec('lowered-quota-keeps-charge-and-blocks-new-reservation',(await prepare(a,randomUUID())).status===429&&isDeepStrictEqual(await journal(),completedBefore));
 rec('old-completed-receipt-readable-without-extra-charge',(await rpc('get_operations_advice_command',a,{p_command_id:charged})).data.state==='completed'&&isDeepStrictEqual(await journal(),completedBefore));
 return {verified:true,checks,barriers,externalProviderCalls:0,actualUtcMidnight:false,hostClockChanged:false,aclFixture};
}
const history=async()=>(await db.query('SELECT version,name,statements FROM supabase_migrations.schema_migrations ORDER BY version')).rows;
async function seedSnapshot(s){const result={};for(const table of ['public.tenants','public.users','public.rooms','public.room_bookings','public.booking_payments','public.guest_invoices',
 'private.workspace_provisioning','private.operations_advice_commands','private.operations_advice_policy']){
  const key=table==='public.tenants'?'id':'tenant_id';result[table]=(await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS value FROM ${table} t WHERE ${key}=ANY($1::uuid[])`,[[s.owner.tenantId,s.foreign.tenantId]])).rows[0].value;}
 result.audit=(await db.query("SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) AS value FROM public.activity_logs t WHERE tenant_id=ANY($1::uuid[])",[[s.owner.tenantId,s.foreign.tenantId]])).rows[0].value;
 return hash(result);}
try{
 if(input.phase==='seed576'){
  const h=await history();rec('seed-exact576-history',h.length===576&&h.at(-1).version==='20261027144833');
  const a=await owner('seed-owner'),b=await owner('seed-foreign'),op=await fixture.operator(),s={owner:a,foreign:b,operator:op};
  const u=await account('seed-staff');s.staff={...u,tenantId:a.tenantId,hotelId:a.hotelId};
  await db.query("INSERT INTO public.users(id,email,full_name,tenant_id,hotel_id,role,user_level_code,status,must_change_password,created_by) VALUES($1,$2,'Owned policy staff',$3,$4,'staff','staff','active',false,$5)",[u.id,u.email,a.tenantId,a.hotelId,a.id]);
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'staff');",[u.id]);
  await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)',[u.id,a.hotelId,a.id]);
  const room=randomUUID(),booking=randomUUID();
  await db.query("INSERT INTO public.rooms(id,tenant_id,hotel_id,room_number,room_type,floor,status) VALUES($1,$2,$3,'POLICY-UPGRADE','standard',1,'occupied_clean')",[room,a.tenantId,a.hotelId]);
  await db.query(`INSERT INTO public.room_bookings(id,tenant_id,hotel_id,room_id,guest_name,check_in_date,check_out_date,status,created_by,booking_type,room_price,subtotal,total_amount,amount_paid,vat_rate,service_fee_rate,ota_commission_amount)
   VALUES($1,$2,$3,$4,'Owned policy upgrade','2026-10-13T00:00:00Z','2026-10-15T00:00:00Z','checked_in',$5,'daily',200000,200000,200000,200000,0,0,0)`,[booking,a.tenantId,a.hotelId,room,a.id]);
  await db.query("INSERT INTO public.booking_payments(tenant_id,hotel_id,booking_id,amount,payment_method,payment_status,paid_at,created_by) VALUES($1,$2,$3,200000,'cash','completed','2026-10-15T00:00:00Z',$4)",[a.tenantId,a.hotelId,booking,a.id]);
  const checkout=await rpc('perform_checkout',a,{p_booking_id:booking,p_room_id:room,p_subtotal:200000,p_command_id:randomUUID(),p_adjustment_notes:'Owned policy upgrade'});
  rec('seed-real-payment-checkout-invoice',checkout.status===200&&Boolean(checkout.data.invoice_id));
  const old=await rpc('configure_operations_advice_policy',input.serviceKey,{p_tenant_id:a.tenantId,p_enabled:true,p_daily_limit:100,p_daily_budget_units:1000,p_units_per_request:5,
   p_valid_until:new Date(Date.now()+3600000).toISOString(),p_reason:'Owned pre-command policy'});assert.equal(old.status,200);
  s.completed=randomUUID();await prepare(a,s.completed);const d=await dispatch(a,s.completed);assert.equal((await finish(a,s.completed,d.data.dispatch_token)).data.state,'completed');
  s.unknown=randomUUID();await prepare(a,s.unknown);const unknown=await dispatch(a,s.unknown);await finish(a,s.unknown,unknown.data.dispatch_token,null);
  s.closed=randomUUID();await prepare(a,s.closed);const closed=await dispatch(a,s.closed);await finish(a,s.closed,closed.data.dispatch_token,null);
  await db.query("UPDATE private.operations_advice_commands SET deadline=clock_timestamp()-interval '1 millisecond' WHERE actor_id=$1 AND command_id=$2",[a.id,s.closed]);
  assert.equal((await rpc('close_operations_advice',a,{p_command_id:s.closed,...scope(a)})).data.state,'closed_unknown');
  s.reserved=randomUUID();assert.equal((await prepare(a,s.reserved)).data.state,'reserved');
  s.cancelled=randomUUID();assert.equal((await rpc('cancel_operations_advice',a,{p_command_id:s.cancelled,...scope(a)})).data.state,'cancelled');
  rec('seed-all-advice-states-and-retained-closure-charge',true);s.historyHash=hash(h);s.protectedHash=await seedSnapshot(s);
  s.legacyHash=hash((await db.query("SELECT pg_get_functiondef('public.configure_operations_advice_policy(uuid,boolean,integer,integer,integer,timestamptz,text)'::regprocedure) AS value")).rows[0].value);
  process.stdout.write(JSON.stringify({verified:true,checks,fixture:s}));
 }else if(input.phase==='rollback577'||input.phase==='post577'){
  const s=input.seed;assert.ok(s?.owner?.id);aclFixture={id:s.owner.id,sessionId:s.owner.sessionId};const h=await history();
  if(input.phase==='rollback577'){
   rec('rollback-exact576-history',h.length===576&&hash(h)===s.historyHash);
   rec('rollback-new-journal-and-rpc-absent',(await db.query("SELECT to_regclass('private.operations_advice_policy_commands') IS NULL AND to_regprocedure('public.set_operations_advice_policy(uuid,uuid,bigint,jsonb)') IS NULL AS yes")).rows[0].yes);
   rec('rollback-legacy-definition-and-service-grant-restored',hash((await db.query("SELECT pg_get_functiondef('public.configure_operations_advice_policy(uuid,boolean,integer,integer,integer,timestamptz,text)'::regprocedure) AS value")).rows[0].value)===s.legacyHash
    &&(await db.query("SELECT has_function_privilege('service_role','public.configure_operations_advice_policy(uuid,boolean,integer,integer,integer,timestamptz,text)','EXECUTE') AS yes")).rows[0].yes);
  }else{
   rec('forward-exact577-with-history-prefix',h.length===577&&h.at(-1).version==='20261027153807'&&hash(h.slice(0,-1))===s.historyHash);
   rec('forward-legacy-service-execute-revoked',!(await db.query("SELECT has_function_privilege('service_role','public.configure_operations_advice_policy(uuid,boolean,integer,integer,integer,timestamptz,text)','EXECUTE') AS yes")).rows[0].yes);
   rec('forward-does-not-create-or-enable-extra-policies',(await read(s.operator,s.foreign)).data.policy===null&&(await read(s.operator,s.owner)).data.revision===1);
  }
  rec('money-trial-roles-policy-and-advice-journal-preserved',await seedSnapshot(s)===s.protectedHash);
  for(const [name,state]of [['completed','completed'],['unknown','unknown'],['closed','closed_unknown'],['reserved','reserved'],['cancelled','cancelled']]){
   rec('old-'+name+'-receipt-readable',(await rpc('get_operations_advice_command',s.owner,{p_command_id:s[name]})).data.state===state);}
  rec('old-unknown-dispatch-never-reopens',(await dispatch(s.owner,s.unknown)).data.state==='unknown');
  rec('old-reads-and-replays-no-effects',await seedSnapshot(s)===s.protectedHash);
  process.stdout.write(JSON.stringify({verified:true,checks,priorMigrations:576,targetMigrations:577,actualOldBinaryRollback:false,aclFixture}));
 }else process.stdout.write(JSON.stringify(await exercise()));
}catch(error){process.stdout.write(JSON.stringify({verified:false,stage,checks,barriers,
 failureCode:/^[A-Z0-9_]{3,80}$/.test(error.code??'')?error.code:'ADVICE_POLICY_ASSERTION',externalProviderCalls:0}));process.exitCode=1}
finally{await db.end()}
