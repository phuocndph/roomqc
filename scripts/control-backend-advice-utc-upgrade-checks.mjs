// Populated575 ->576 transaction rehearsal. Private fixture output never leaves
// the exact-owned runner. No external provider, SMTP, VPS or serving DB is used.
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_ADVICE_UTC_UPGRADE_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(['seed575','rollback576','post576','afterEdge'].includes(input.phase));
const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,max:4,statement_timeout:20000,connectionTimeoutMillis:5000});
const checks=[],hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');let stage=input.phase;
const rec=(label,passed)=>{checks.push({label:'advice-utc-upgrade-'+label,passed,actualNative:true});assert.ok(passed,'OWNED_UTC_UPGRADE_CHECK_FAILED')};
async function call(path,token,body){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),
  headers:{apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify(body)});
  let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};}
const rpc=(name,a,args)=>call('/rest/v1/rpc/'+name,a.token??a,args);
async function account(label){const email='advice-utc-'+input.run+'-'+label+'@roomqc.invalid',password=createHmac('sha256',input.serviceKey).update(email).digest('hex');
  const made=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(made.status,200);
  const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);
  return{id:made.data.id,email,token:login.data.access_token,sessionId:JSON.parse(Buffer.from(login.data.access_token.split('.')[1],'base64url')).session_id};}
async function owner(label){const a=await account(label),r=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:a.id,
  p_fields:{fullName:'Owned UTC upgrade',phone:'0901234567',tenantName:'Owned UTC upgrade',hotelName:'Owned UTC upgrade',hotelAddress:'123 Fixture Road',
    hotelPhone:'0281234567',hotelEmail:a.email,totalRooms:5}});assert.equal(r.status,200);assert.equal(r.data.success,true);return{...a,tenantId:r.data.tenant_id,hotelId:r.data.hotel_id};}
async function insert(table,body){const r=await call('/rest/v1/'+table,input.serviceKey,body);assert.equal(r.status,201);return r.data[0];}
const scope=a=>({p_start_date:'2026-10-01',p_end_date:'2026-10-31',p_hotel_id:a.hotelId,p_timezone:'Asia/Ho_Chi_Minh'});
const prepare=(a,id)=>rpc('prepare_operations_advice',a,{p_command_id:id,...scope(a)});
const lookup=(a,id)=>rpc('get_operations_advice_command',a,{p_command_id:id});
const dispatch=(a,id)=>rpc('dispatch_operations_advice',input.serviceKey,{p_actor_id:a.id,p_command_id:id,p_session_id:a.sessionId});
const output=Array.from({length:3},(_,i)=>({title:'Upgrade '+i,description:'Owned scoped evidence.',action:'Review receipt.',priority:'medium'}));
const finish=(a,id,nonce,advice=output)=>rpc('finish_operations_advice',input.serviceKey,{p_actor_id:a.id,p_command_id:id,p_dispatch_token:nonce,p_advice:advice});
const history=async()=>(await db.query('SELECT version,name,statements FROM supabase_migrations.schema_migrations ORDER BY version')).rows;
async function snapshot(s,advice=false){const tables=advice?['private.operations_advice_commands','private.operations_advice_policy']:
  ['public.tenants','public.users','public.rooms','public.room_bookings','public.booking_payments','public.guest_invoices','public.financial_targets',
   'private.workspace_provisioning','private.booking_room_commands','private.report_target_commands','private.booking_notification_events'];
  const result={};for(const table of tables){const key=table==='public.tenants'?'id':'tenant_id',projection='to_jsonb(t)';result[table]=(await db.query(
    `SELECT COALESCE(jsonb_agg(${projection} ORDER BY ${projection}::text),'[]'::jsonb) AS value FROM ${table} t WHERE ${key}=ANY($1::uuid[])`,[[s.owner.tenantId,s.foreign.tenantId]])).rows[0].value;}
  if(advice)result.audit=(await db.query("SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) AS value FROM public.activity_logs t WHERE tenant_id=ANY($1::uuid[]) AND entity_type='operations_advice'",[[s.owner.tenantId,s.foreign.tenantId]])).rows[0].value;
  else for(const table of ['public.user_roles','public.user_hotels','public.user_permissions'])result[table]=(await db.query(
    `SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS value FROM ${table} t WHERE user_id=ANY($1::uuid[])`,[[s.owner.id,s.foreign.id,s.staff.id]])).rows[0].value;
  return hash(result);}
try{
  if(input.phase==='seed575'){
    const h=await history();rec('seed-exact575-history',h.length===575&&h.at(-1).version==='20261027140057');
    const a=await owner('owner'),b=await owner('foreign'),u=await account('staff'),s={owner:a,foreign:b,staff:{...u,tenantId:a.tenantId,hotelId:a.hotelId}};
    await insert('users',{id:u.id,email:u.email,full_name:'Owned UTC staff',tenant_id:a.tenantId,hotel_id:a.hotelId,role:'staff',user_level_code:'staff',status:'active',created_by:a.id,must_change_password:false,account_locked:false});
    await insert('user_roles',{user_id:u.id,role:'staff'});await insert('user_hotels',{user_id:u.id,hotel_id:a.hotelId,assigned_by:a.id});
    await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'reports','view',true)",[u.id,a.tenantId]);
    const room=await insert('rooms',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,room_number:'CLOSURE-101',room_type:'standard',floor:1,status:'occupied_clean'});
    const booking=await insert('room_bookings',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,room_id:room.id,guest_name:'Owned upgrade guest',guest_phone:'0909876543',
      check_in_date:'2026-10-13T00:00:00Z',check_out_date:'2026-10-15T00:00:00Z',status:'checked_in',created_by:a.id,booking_type:'daily',
      room_price:200000,subtotal:200000,total_amount:200000,amount_paid:200000,vat_rate:0,service_fee_rate:0,ota_commission_amount:0});
    await insert('booking_payments',{tenant_id:a.tenantId,hotel_id:a.hotelId,booking_id:booking.id,amount:200000,payment_method:'cash',payment_status:'completed',paid_at:'2026-10-15T00:00:00Z',created_by:a.id});
    const request={p_booking_id:booking.id,p_room_id:room.id,p_subtotal:200000,p_command_id:randomUUID(),p_adjustment_notes:'Owned UTC upgrade receipt'};
    const checkout=await rpc('perform_checkout',a,request);assert.equal(checkout.status,200);assert.ok(checkout.data.invoice_id);s.checkout={request,result:checkout.data};
    await db.query("UPDATE public.room_bookings SET check_out_date='2026-10-15T00:00:00Z' WHERE id=$1",[booking.id]);
    const report=await rpc('get_operations_report_scoped',a,scope(a));rec('seed-money-and-invoice-nonzero',report.status===200&&report.data.current.recognized_revenue===200000);s.reportHash=hash(report.data);
    const configured=await rpc('configure_operations_advice_policy',input.serviceKey,{p_tenant_id:a.tenantId,p_enabled:true,p_daily_limit:100,p_daily_budget_units:500,p_units_per_request:5,
      p_valid_until:new Date(Date.now()+3600000).toISOString(),p_reason:'Owned populated closure upgrade'});assert.equal(configured.status,200);
    s.completed={id:randomUUID()};assert.equal((await prepare(a,s.completed.id)).status,200);const d=await dispatch(a,s.completed.id);assert.equal(d.data.state,'dispatch');
    const done=await finish(a,s.completed.id,d.data.dispatch_token);assert.equal(done.data.state,'completed');s.completed.receipt=done.data;
    s.unknown={id:randomUUID()};assert.equal((await prepare(a,s.unknown.id)).status,200);const unknown=await dispatch(a,s.unknown.id);assert.equal(unknown.data.state,'dispatch');
    assert.equal((await finish(a,s.unknown.id,unknown.data.dispatch_token,null)).data.state,'unknown');s.unknown.nonce=unknown.data.dispatch_token;
    s.reserved={id:randomUUID()};assert.equal((await prepare(s.staff,s.reserved.id)).data.state,'reserved');
    rec('seed-completed-unknown-and-staff-reserved-commands',true);
    s.cancelled={id:randomUUID()};assert.equal((await rpc('cancel_operations_advice',a,{p_command_id:s.cancelled.id,...scope(a)})).data.state,'cancelled');
    rec('seed-cancelled-terminal-receipt',true);
    s.closed={id:randomUUID()};assert.equal((await prepare(a,s.closed.id)).status,200);
    const closedDispatch=await dispatch(a,s.closed.id);assert.equal(closedDispatch.data.state,'dispatch');
    await finish(a,s.closed.id,closedDispatch.data.dispatch_token,null);
    await db.query("UPDATE private.operations_advice_commands SET deadline=clock_timestamp()-interval '1 millisecond' WHERE actor_id=$1 AND command_id=$2",[a.id,s.closed.id]);
    const closedReceipt=await rpc('close_operations_advice',a,{p_command_id:s.closed.id,...scope(a)});
    rec('seed-already-closed-unknown-with-retained-charge',closedReceipt.data.state==='closed_unknown');
    s.closed.rowHash=hash((await db.query('SELECT to_jsonb(c) AS value FROM private.operations_advice_commands c WHERE actor_id=$1 AND command_id=$2',[a.id,s.closed.id])).rows[0].value);
    s.requestDefinitionHash=hash((await db.query("SELECT pg_get_functiondef('private.request_operations_advice(text,uuid,date,date,uuid,text)'::regprocedure) AS value")).rows[0].value);
    s.historyHash=hash(h);s.protectedHash=await snapshot(s);s.adviceHash=await snapshot(s,true);
    console.log(JSON.stringify({verified:true,checks,fixture:s}));
  }else{
    const s=input.seed;assert.ok(s?.owner?.id);const h=await history();
    if(input.phase==='rollback576'){
      rec('rollback-history-exact575',h.length===575&&hash(h)===s.historyHash);
      rec('rollback-original-quota-request-definition-restored',hash((await db.query("SELECT pg_get_functiondef('private.request_operations_advice(text,uuid,date,date,uuid,text)'::regprocedure) AS value")).rows[0].value)===s.requestDefinitionHash);
      rec('rollback-existing-closure-rpc-preserved',(await db.query("SELECT to_regprocedure('public.close_operations_advice(uuid,date,date,uuid,text)') IS NOT NULL AS yes")).rows[0].yes);
    }else rec('forward-exact576-history-with575-prefix',h.length===576&&h.at(-1).version==='20261027144833'&&hash(h.slice(0,-1))===s.historyHash);
    if(input.phase!=='rollback576')rec('forward-quota-request-definition-changed',hash((await db.query("SELECT pg_get_functiondef('private.request_operations_advice(text,uuid,date,date,uuid,text)'::regprocedure) AS value")).rows[0].value)!==s.requestDefinitionHash);
    rec('preexisting-closed-terminal-readable',(await lookup(s.owner,s.closed.id)).data.state==='closed_unknown');
    rec('preexisting-closed-journal-and-charge-exactly-preserved',hash((await db.query('SELECT to_jsonb(c) AS value FROM private.operations_advice_commands c WHERE actor_id=$1 AND command_id=$2',[s.owner.id,s.closed.id])).rows[0].value)===s.closed.rowHash);
    rec('money-trial-roles-mapping-and-old-receipts-preserved',await snapshot(s)===s.protectedHash);
    if(input.phase!=='afterEdge')rec('advice-policy-charge-journal-and-audit-preserved',await snapshot(s,true)===s.adviceHash);
    const done=await lookup(s.owner,s.completed.id),unknown=await lookup(s.owner,s.unknown.id),reserved=await lookup(s.staff,s.reserved.id);
    rec('original-completed-advice-receipt-readable',done.status===200&&hash(done.data)===hash(s.completed.receipt));
    rec('unknown-fence-and-staff-reservation-readable',unknown.data.state===(input.phase==='afterEdge'?'closed_unknown':'unknown')&&reserved.data.state==='reserved');
    rec('cancelled-terminal-preserved',(await lookup(s.owner,s.cancelled.id)).data.state==='cancelled');
    const replay=await dispatch(s.owner,s.unknown.id);rec('unknown-dispatch-replay-does-not-reopen',replay.status===200&&replay.data.state===(input.phase==='afterEdge'?'closed_unknown':'unknown')&&replay.data.advice===null);
    const checkout=await rpc('perform_checkout',s.owner,s.checkout.request);rec('original-invoice-replay-preserved',checkout.status===200&&checkout.data.invoice_id===s.checkout.result.invoice_id);
    const report=await rpc('get_operations_report_scoped',s.owner,scope(s.owner));rec('report-values-and-money-preserved',report.status===200&&hash(report.data)===s.reportHash);
    const denied=await prepare(s.foreign,randomUUID());rec('foreign-tenant-stays-disabled',denied.status===403);
    rec('read-replays-have-no-business-effects',await snapshot(s)===s.protectedHash);
    if(input.phase==='afterEdge'){
      const row=(await db.query('SELECT * FROM private.operations_advice_commands WHERE actor_id=$1 AND command_id=$2',[s.owner.id,s.unknown.id])).rows[0];
      rec('upgraded-closure-keeps-original-dispatch-and-charge',row.state==='unknown'&&row.units===5&&row.dispatch_token===s.unknown.nonce&&row.closed_by===s.owner.id&&!!row.closed_at);
    }
    if(input.phase!=='afterEdge')rec('read-replays-have-no-advice-or-quota-effects',await snapshot(s,true)===s.adviceHash);
    console.log(JSON.stringify({verified:true,checks,priorMigrations:575,targetMigrations:576,actualOldBinaryRollback:false,productAccepted:false}));
  }
}catch(e){console.log(JSON.stringify({verified:false,stage,checks,errorCode:/^[A-Z0-9_]{3,80}$/.test(e.code??'')?e.code:'UTC_UPGRADE_ASSERTION'}));process.exitCode=1}
finally{await db.end()}

