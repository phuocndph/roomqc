// Exact-owned populated572 ->573 rehearsal. Fixture rows and serialized pending
// requests are private runner input/output, never public evidence.
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_ADVICE_UPGRADE_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(['seed572','rollback573','post573','afterEdge'].includes(input.phase));
const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,max:4,
  statement_timeout:15000,connectionTimeoutMillis:5000,application_name:'owned-advice-upgrade-'+input.run});
const origin='http://127.0.0.1:8000',checks=[];let stage=input.phase;
const rec=(label,passed)=>{checks.push({label:'advice-upgrade-'+label,passed,actualNative:true});assert.ok(passed,'OWNED_ADVICE_UPGRADE_CONTROL_FAILED')};
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const credentials=label=>({email:'advice-edge-'+input.run+'-'+label+'@roomqc.invalid',
  password:createHmac('sha256',input.serviceKey).update('owned-advice-edge:'+input.run+':'+label).digest('hex')});
async function call(path,token,body,method='POST'){
  const r=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(25000),headers:{apikey:input.publishableKey,
    authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};
}
const rpc=(name,a,args)=>call('/rest/v1/rpc/'+name,a.token??a,args);
async function login(label,a={}){const r=await call('/auth/v1/token?grant_type=password',input.publishableKey,credentials(label));assert.equal(r.status,200);
  return{...a,id:r.data.user.id,token:r.data.access_token,sessionId:JSON.parse(Buffer.from(r.data.access_token.split('.')[1],'base64url')).session_id};}
async function account(label){const r=await call('/auth/v1/admin/users',input.serviceKey,{...credentials(label),email_confirm:true});assert.equal(r.status,200);return login(label);}
async function owner(label){const a=await account(label),r=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:a.id,
  p_fields:{fullName:'Owned advice upgrade',phone:'0901234567',tenantName:'Owned advice upgrade',hotelName:'Owned advice upgrade',hotelAddress:'123 Fixture Road',
    hotelPhone:'0281234567',hotelEmail:credentials(label).email,totalRooms:5}});assert.equal(r.status,200);assert.equal(r.data.success,true);
  return{...a,tenantId:r.data.tenant_id,hotelId:r.data.hotel_id};}
const actor=a=>({id:a.id,tenantId:a.tenantId,hotelId:a.hotelId,sessionId:a.sessionId});
async function insert(table,body){const r=await call('/rest/v1/'+table,input.serviceKey,body);assert.equal(r.status,201,'OWNED_ADVICE_UPGRADE_SEED_'+table);return r.data[0];}
const history=async()=>(await db.query('SELECT version,name,statements FROM supabase_migrations.schema_migrations ORDER BY version')).rows;
async function protectedState(seed){
  const tenants=[seed.owner.tenantId,seed.foreign.tenantId];
  const tables=['public.tenants','public.users','public.rooms','public.room_bookings','public.booking_payments','public.guest_invoices',
    'public.maintenance_requests','public.shift_history','public.hotel_fixed_expenses','private.booking_no_show_resolutions',
    'private.booking_room_commands','private.workflow_room_transition_commands','private.workspace_provisioning','private.booking_notification_events'];
  const result={};
  for(const table of tables){
    assert.match(table,/^(public|private)\.[a-z_]+$/);
    const column=table==='public.tenants'?'id':'tenant_id';
    result[table]=(await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS value FROM ${table} t WHERE ${column}=ANY($1::uuid[])`,[tenants])).rows[0].value;
  }
  const ids=[seed.owner.id,seed.foreign.id,seed.staff.id];
  for(const table of ['public.user_roles','public.user_hotels','public.user_permissions']){
    result[table]=(await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS value FROM ${table} t WHERE user_id=ANY($1::uuid[])`,[ids])).rows[0].value;
  }
  for(const table of ['private.booking_notification_outbox','private.booking_notification_receipts']){
    result[table]=(await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS value FROM ${table} t WHERE event_id IN
      (SELECT id FROM private.booking_notification_events WHERE tenant_id=ANY($1::uuid[]))`,[tenants])).rows[0].value;
  }
  return hash(result);
}
async function targetState(seed){const value={};for(const table of ['public.financial_targets','public.monthly_targets','private.report_target_commands']){
  value[table]=(await db.query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS value FROM ${table} t WHERE tenant_id=ANY($1::uuid[])`,[[seed.owner.tenantId,seed.foreign.tenantId]])).rows[0].value;
  }value.revisions=(await db.query("SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY scope_key),'[]'::jsonb) AS value FROM private.report_target_revisions t")).rows[0].value;
  value.audit=(await db.query("SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) AS value FROM public.activity_logs t WHERE tenant_id=ANY($1::uuid[]) AND entity_type='report_targets'",[[seed.owner.tenantId,seed.foreign.tenantId]])).rows[0].value;return hash(value);}
const nativeScope=a=>({p_start_date:'2026-10-01',p_end_date:'2026-10-31',p_hotel_id:a.hotelId,p_timezone:'Asia/Ho_Chi_Minh'});
async function booking(a,status,extra={}){const room=await insert('rooms',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,
  room_number:'AU-'+randomUUID().slice(0,8),room_type:'standard',floor:1,status:status==='checked_in'?'occupied_clean':'vacant_clean'});
  const b=await insert('room_bookings',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,room_id:room.id,guest_name:'Owned upgrade synthetic guest',
    guest_phone:'0909876543',check_in_date:'2026-10-13T00:00:00Z',check_out_date:'2026-10-15T00:00:00Z',status,created_by:a.id,
    booking_type:'daily',room_price:200000,subtotal:200000,total_amount:200000,vat_rate:0,service_fee_rate:0,ota_commission_amount:0,...extra});return{id:b.id,roomId:room.id};}
async function cash(a,b,amount){await insert('booking_payments',{tenant_id:a.tenantId,hotel_id:a.hotelId,booking_id:b.id,
  amount,payment_method:'cash',payment_status:'completed',paid_at:'2026-10-15T00:00:00Z',created_by:a.id});}
function memory(records={}){const entries=new Map(Object.entries(records));return{get length(){return entries.size},key:i=>[...entries.keys()][i]??null,
  getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k),records:()=>Object.fromEntries(entries)};}
function app(a,store,endpoint=origin){const context={actorId:a.id,sessionId:a.sessionId,tenantId:a.tenantId,runtime:'owned-advice-upgrade:'+input.run};
  return{context,client:RoomQCReportTargetCaller.createReportTargetClient({endpoint,publishableKey:input.publishableKey,storage:()=>store,
    getSession:async()=>({data:{session:{access_token:a.token,user:{id:a.id}}},error:null})})};}
async function lostTarget(a,month,loss){
  const sockets=new Set();let hit=false,relayFailure=false;
  const server=createServer(async(req,res)=>{try{
    assert.ok(['/rest/v1/rpc/get_report_targets','/rest/v1/rpc/replace_report_targets'].includes(req.url));assert.equal(req.method,'POST');
    const chunks=[];let size=0;for await(const c of req){size+=c.length;assert.ok(size<16384);chunks.push(c)}const raw=Buffer.concat(chunks);
    if(req.url.endsWith('/replace_report_targets')&&loss==='before'){hit=true;req.socket.destroy();return}
    const r=await fetch(origin+req.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{apikey:input.publishableKey,
      authorization:'Bearer '+a.token,'content-type':'application/json'},body:raw});const body=Buffer.from(await r.arrayBuffer());
    if(req.url.endsWith('/replace_report_targets')&&loss==='after'){assert.equal(r.status,200);hit=true;req.socket.destroy();return}
    res.writeHead(r.status,{'content-type':'application/json'});res.end(body);
  }catch{relayFailure=true;res.destroy()}});
  server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('error',()=>{})});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const scope={kind:'financial',month,hotelId:a.hotelId},store=memory(),{client,context}=app(a,store,'http://127.0.0.1:'+server.address().port);
  try{const report=await client.read(context,scope);let code;try{await client.save(context,scope,{adr:234.56},report.revision)}catch(e){code=e.code}
    assert.equal(code,'outcome_unknown');assert.equal(hit,true);assert.equal(relayFailure,false);const pending=client.pending(context,scope);assert.equal(pending.length,1);
    const raw=JSON.stringify(store.records());assert.ok(![a.token,input.serviceKey,input.databasePassword].some(secret=>raw.includes(secret)));
    return{scope,records:store.records(),command:pending[0].command,loss};
  }finally{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r))}
}
async function reports(a){const args=nativeScope(a);const r=await rpc('get_operations_report_scoped',a,args),l=await rpc('get_labor_cost_scoped',a,args);
  assert.equal(r.status,200);assert.equal(l.status,200);return{operations:r.data,labor:l.data};}
try{
  if(input.phase==='seed572'){
    const h=await history();rec('seed-exact572-history',h.length===572&&h.at(-1).version==='20261027094448');
    const a=await owner('owner'),b=await owner('foreign'),staff=await account('staff'),seed={owner:actor(a),foreign:actor(b),staff:{...actor(staff),tenantId:a.tenantId,hotelId:a.hotelId}};
    await insert('users',{id:staff.id,email:credentials('staff').email,full_name:'Owned report staff',tenant_id:a.tenantId,hotel_id:a.hotelId,
      role:'staff',user_level_code:'staff',status:'active',created_by:a.id,must_change_password:false,account_locked:false});
    await insert('user_roles',{user_id:staff.id,role:'staff'});await insert('user_hotels',{user_id:staff.id,hotel_id:a.hotelId,assigned_by:a.id});
    await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'reports','view',true)",[staff.id,a.tenantId]);
    const stay=await booking(a,'checked_in',{amount_paid:200000});await cash(a,stay,200000);
    const request={p_booking_id:stay.id,p_room_id:stay.roomId,p_subtotal:200000,p_command_id:randomUUID(),p_adjustment_notes:'Owned pre573 checkout note'};
    const checkout=await rpc('perform_checkout',a,request);assert.equal(checkout.status,200);assert.ok(checkout.data.invoice_id);seed.checkout={request,result:checkout.data};
    await db.query("UPDATE public.room_bookings SET check_out_date='2026-10-15T00:00:00Z' WHERE id=$1",[stay.id]);
    seed.resolutions=[];
    for(const refund of [false,true]){const bookingId=await booking(a,'confirmed',{deposit_amount:100000});await cash(a,bookingId,100000);
      const request={p_booking_id:bookingId.id,p_refund_deposit:refund,p_reason:'Owned pre573 deposit receipt',p_command_id:randomUUID()};
      const r=await rpc('resolve_booking_no_show',a,request);assert.equal(r.status,200);seed.resolutions.push({request,result:r.data});
      await db.query("UPDATE private.booking_no_show_resolutions SET recorded_at='2026-10-15T00:00:00Z' WHERE booking_id=$1",[bookingId.id]);}
    await db.query(`INSERT INTO public.maintenance_requests(tenant_id,hotel_id,request_code,location,issue_type,title,description,status,reported_by,completed_at,actual_cost)
      VALUES($1,$2,$3,'Owned fixture','repair','Owned upgrade cost','Owned upgrade cost','completed',$4,'2026-10-15T00:00:00Z',1000)`,[a.tenantId,a.hotelId,'AU-'+randomUUID(),a.id]);
    await db.query('UPDATE public.users SET hourly_wage_vnd=100,monthly_salary_vnd=NULL WHERE id=$1',[a.id]);
    await db.query("INSERT INTO public.shift_history(tenant_id,hotel_id,user_id,start_at,end_at) VALUES($1,$2,$3,'2026-10-15T00:00:00Z','2026-10-15T01:00:00Z')",[a.tenantId,a.hotelId,a.id]);
    const store=memory(),{client,context}=app(a,store),scope={kind:'financial',month:'2026-10-01',hotelId:a.hotelId};
    const target=await client.read(context,scope),saved=await client.save(context,scope,{adr:123.45,gop:2000},target.revision);assert.equal(saved.state,'completed');seed.target={scope,receipt:saved};
    seed.pending=[await lostTarget(a,'2026-11-01','after'),await lostTarget(a,'2026-12-01','before')];
    rec('seed-target-completed-and-two-durable-pending-intents',store.length===0&&seed.pending.length===2);
    const report=await reports(a);rec('seed-nonzero-money-and-costs',report.operations.current.recognized_revenue===300000
      &&report.operations.current.room.netRevenue===200000&&report.operations.current.no_show.retainedAmount===100000
      &&report.operations.current.no_show.refundDueAmount===100000&&report.operations.current.cost_summary.total_cost===1000&&report.labor.total_labor_cost===100);
    rec('seed-real-invoice-and-deposit-receipts',Boolean(seed.checkout.result.invoice_id)&&seed.resolutions.every(r=>r.result.deposit_resolution.id));
    const foreign=await rpc('get_operations_report_scoped',b,nativeScope(a));rec('seed-foreign-report-denied',foreign.status===403);
    const absence=(await db.query("SELECT to_regclass('private.operations_advice_commands') IS NULL AND to_regclass('private.operations_advice_policy') IS NULL AS absent")).rows[0].absent;
    rec('seed-no-ai-journal-or-policy-before573',absence);
    seed.protectedHash=await protectedState(seed);seed.targetHash=await targetState(seed);seed.historyHash=hash(h);seed.reportHash=hash(report);
    console.log(JSON.stringify({verified:true,checks,fixture:seed}));
  }else{
    const seed=input.seed;assert.ok(seed?.owner?.id);const h=await history();
    if(input.phase==='rollback573'){
      rec('rollback-exact572-history-and-no573-record',h.length===572&&hash(h)===seed.historyHash);
      rec('rollback-money-trial-authority-source-and-receipts-identical',await protectedState(seed)===seed.protectedHash);
      rec('rollback-target-values-journals-and-audit-identical',await targetState(seed)===seed.targetHash);
      const absent=(await db.query("SELECT to_regclass('private.operations_advice_commands') IS NULL AND to_regclass('private.operations_advice_policy') IS NULL AND to_regprocedure('public.get_operations_advice_command(uuid)') IS NULL AS yes")).rows[0].yes;
      rec('rollback-new-tables-and-api-functions-absent',absent);
      const a=await login('owner',seed.owner);rec('rollback-old-report-contract-values-unchanged',hash(await reports(a))===seed.reportHash);
      const oldTargets=await targetState(seed);const r=await rpc('perform_checkout',a,seed.checkout.request);
      rec('rollback-old-checkout-replays-original-invoice',r.status===200&&r.data.invoice_id===seed.checkout.result.invoice_id&&await protectedState(seed)===seed.protectedHash&&await targetState(seed)===oldTargets);
      console.log(JSON.stringify({verified:true,checks,priorMigrations:572,targetMigrations:573}));
    }else if(input.phase==='post573'){
      rec('forward-exact573-history-with572-prefix-preserved',h.length===573&&h.at(-1).version==='20261027104602'&&hash(h.slice(0,-1))===seed.historyHash);
      rec('forward-money-trial-authority-and-source-identical',await protectedState(seed)===seed.protectedHash);
      rec('forward-old-targets-and-completed-receipts-identical',await targetState(seed)===seed.targetHash);
      const empty=(await db.query('SELECT (SELECT count(*) FROM private.operations_advice_commands)=0 AND (SELECT count(*) FROM private.operations_advice_policy)=0 AS yes')).rows[0].yes;
      rec('forward-no-existing-tenant-autoenabled-or-charged',empty);
      const a=await login('owner',seed.owner),b=await login('foreign',seed.foreign),staff=await login('staff',seed.staff);
      rec('forward-authoritative-report-values-preserved',hash(await reports(a))===seed.reportHash);
      const prepareArgs={p_command_id:randomUUID(),...nativeScope(a)},defaultDenied=await rpc('prepare_operations_advice',a,prepareArgs);
      rec('forward-ai-default-deny-without-effects',defaultDenied.status===403&&(await db.query('SELECT count(*)::int AS n FROM private.operations_advice_commands')).rows[0].n===0);
      const foreign=await rpc('get_operations_report_scoped',b,nativeScope(a)),assigned=await rpc('get_operations_report_scoped',staff,nativeScope(a));
      rec('forward-foreign-denied-assigned-staff-reports-allowed',foreign.status===403&&assigned.status===200&&assigned.data.current.recognized_revenue===300000);
      for(const p of seed.pending){const store=memory(p.records),{client,context}=app(a,store),before=await targetState(seed);
        const r=p.loss==='after'?await client.recover(context,p.scope):await client.cancel(context,p.scope);
        rec('forward-pre573-pending-'+p.loss+'-recovers-with-original-key',r.command_id===p.command.p_command_id&&store.length===0&&r.state===(p.loss==='after'?'completed':'cancelled'));
        if(p.loss==='after')rec('forward-completed-target-recovery-has-no-effects',await targetState(seed)===before);
        else{const beforeLate=await targetState(seed),late=await rpc('replace_report_targets',a,p.command);
          rec('forward-cancel-target-fences-delayed-pre573-request',late.status===200&&late.data.state==='cancelled'&&await targetState(seed)===beforeLate);}}
      const checkout=await rpc('perform_checkout',a,seed.checkout.request),resolutions=await Promise.all(seed.resolutions.map(r=>rpc('resolve_booking_no_show',a,r.request)));
      rec('forward-original-invoice-and-deposit-receipts-replay',checkout.status===200&&checkout.data.invoice_id===seed.checkout.result.invoice_id
        &&checkout.data.notification_event_id===seed.checkout.result.notification_event_id&&resolutions.every((r,i)=>r.status===200&&r.data.deposit_resolution.id===seed.resolutions[i].result.deposit_resolution.id));
      rec('forward-replays-and-target-recovery-preserve-money-and-trial',await protectedState(seed)===seed.protectedHash);
      console.log(JSON.stringify({verified:true,checks,priorMigrations:572,targetMigrations:573,destructiveDownMigrationAttempted:false,actualOldBinaryRollback:false,
        nativeCallerCompatibility:true,fixtureStorageOnly:true,productAccepted:false}));
    }else{
      rec('after-edge-money-trial-authority-source-and-old-receipts-identical',await protectedState(seed)===seed.protectedHash);
      const a=await login('owner',seed.owner);rec('after-edge-authoritative-report-values-identical',hash(await reports(a))===seed.reportHash);
      const before=await targetState(seed),{client,context}=app(a,memory()),target=await client.read(context,seed.target.scope);
      rec('after-edge-original-target-values-still-readable',target.values.adr===123.45&&target.values.gop===2000&&await targetState(seed)===before);
      rec('after-edge-exact573-history-preserved',h.length===573&&h.at(-1).version==='20261027104602'&&hash(h.slice(0,-1))===seed.historyHash);
      console.log(JSON.stringify({verified:true,checks,priorMigrations:572,targetMigrations:573,productAccepted:false}));
    }
  }
}catch(e){console.log(JSON.stringify({verified:false,checks,stage,errorCode:/^[A-Z0-9_]{3,80}$/.test(e.code??'')?e.code:'ADVICE_UPGRADE_ASSERTION'}));process.exitCode=1}
finally{await db.end()}
