// Persisted 566 -> 572 rehearsal. Called in separate containers per phase;
// raw fixture records remain inside the exact-owned runner's private directory.
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_REPORT_UPGRADE_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.match(input.phase,/^(seed566|rollback56[7-9]|rollback57[0-2]|checkpoint571|post572)$/);
const db=new pg.Pool({host:'db',database:'postgres',user:'postgres',password:input.databasePassword,max:4,
  statement_timeout:15000,connectionTimeoutMillis:5000,application_name:'owned-report-upgrade-'+input.run});
const checks=[],origin='http://127.0.0.1:8000';let stage=input.phase;
const rec=(label,passed)=>{checks.push({label:'report-upgrade-'+label,passed,actualNative:true});assert.ok(passed,'OWNED_REPORT_UPGRADE_CONTROL_FAILED')};
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const password=label=>createHmac('sha256',input.databasePassword).update('report-upgrade:'+input.run+':'+label).digest('hex');
const email=label=>'report-upgrade-'+input.run+'-'+label+'@roomqc.invalid';
async function call(path,token,body,method='POST'){const r=await fetch(origin+path,{method,headers:{apikey:input.publishableKey,
  authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},signal:AbortSignal.timeout(25000),
  ...(body===undefined?{}:{body:JSON.stringify(body)})});let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};}
const rpc=(name,a,args)=>call('/rest/v1/rpc/'+name,a.token??a,args);
async function login(label,a){const r=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:email(label),password:password(label)});
  assert.equal(r.status,200);return{...a,token:r.data.access_token,sessionId:JSON.parse(Buffer.from(r.data.access_token.split('.')[1],'base64url')).session_id};}
async function owner(label){const r=await call('/auth/v1/admin/users',input.serviceKey,{email:email(label),password:password(label),email_confirm:true});assert.equal(r.status,200);
  const a=await login(label,{id:r.data.id}),p=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:a.id,
    p_fields:{fullName:'Owned report upgrade',phone:'0901234567',tenantName:'Owned report upgrade',hotelName:'Owned report upgrade',hotelAddress:'123 Fixture Road',
      hotelPhone:'0281234567',hotelEmail:email(label),totalRooms:5}});assert.equal(p.status,200);assert.equal(p.data.success,true);
  return{...a,tenantId:p.data.tenant_id,hotelId:p.data.hotel_id};}
const publicActor=a=>({id:a.id,tenantId:a.tenantId,hotelId:a.hotelId,sessionId:a.sessionId});
async function insert(table,body,a=input.serviceKey){const r=await call('/rest/v1/'+table,a.token??a,body);assert.equal(r.status,201,'OWNED_REPORT_UPGRADE_SEED_'+table);return r.data[0];}
const count=async()=>Number((await db.query('SELECT count(*) AS n FROM supabase_migrations.schema_migrations')).rows[0].n);
async function booking(a,status,extra={}){const room=await insert('rooms',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,room_number:'RU-'+randomUUID().slice(0,8),
  room_type:'standard',floor:1,status:status==='checked_in'?'occupied_clean':'vacant_clean'});
  const b=await insert('room_bookings',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,room_id:room.id,guest_name:'Owned synthetic upgrade guest',
    check_in_date:'2026-10-01',check_out_date:'2026-10-15',status,created_by:a.id,booking_type:'daily',room_price:200000,subtotal:200000,total_amount:200000,
    vat_rate:0,service_fee_rate:0,ota_commission_amount:0,...extra});return{id:b.id,roomId:room.id};}
async function cash(a,b,amount){await insert('booking_payments',{tenant_id:a.tenantId,hotel_id:a.hotelId,booking_id:b.id,
  amount,payment_method:'cash',payment_status:'completed',paid_at:'2026-10-15T00:00:00Z',created_by:a.id});}
async function business(seed){return hash((await db.query(`SELECT jsonb_build_object(
  'bookings',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.room_bookings t WHERE tenant_id=ANY($1::uuid[])),
  'rooms',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.rooms t WHERE tenant_id=ANY($1::uuid[])),
  'payments',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.booking_payments t WHERE tenant_id=ANY($1::uuid[])),
  'invoices',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.guest_invoices t WHERE tenant_id=ANY($1::uuid[])),
  'resolutions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY booking_id) FROM private.booking_no_show_resolutions t WHERE tenant_id=ANY($1::uuid[])),
  'commands',(SELECT jsonb_agg(to_jsonb(t) ORDER BY actor_id,command_id) FROM private.booking_room_commands t WHERE tenant_id=ANY($1::uuid[])),
  'room_commands',(SELECT jsonb_agg(to_jsonb(t) ORDER BY actor_id,command_id) FROM private.workflow_room_transition_commands t WHERE tenant_id=ANY($1::uuid[])),
  'events',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.booking_notification_events t WHERE tenant_id=ANY($1::uuid[])),
  'outbox',(SELECT jsonb_agg(to_jsonb(t) ORDER BY event_id,channel) FROM private.booking_notification_outbox t
    WHERE event_id IN(SELECT id FROM private.booking_notification_events WHERE tenant_id=ANY($1::uuid[]))),
  'receipts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY event_id,user_id) FROM private.booking_notification_receipts t
    WHERE event_id IN(SELECT id FROM private.booking_notification_events WHERE tenant_id=ANY($1::uuid[]))),
  'audit',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.audit_log t WHERE tenant_id=ANY($1::uuid[])),
  'tenants',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tenants t WHERE id=ANY($1::uuid[])),
  'wages',(SELECT jsonb_agg(jsonb_build_object('id',id,'hourly',hourly_wage_vnd,'monthly',monthly_salary_vnd) ORDER BY id) FROM public.users WHERE tenant_id=ANY($1::uuid[])),
  'shifts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.shift_history t WHERE tenant_id=ANY($1::uuid[])),
  'maintenance',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.maintenance_requests t WHERE tenant_id=ANY($1::uuid[])),
  'fixed',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.hotel_fixed_expenses t WHERE tenant_id=ANY($1::uuid[]))) AS value`,
  [[seed.owner.tenantId,seed.foreign.tenantId]])).rows[0].value);}
async function allState(seed){const targets=(await db.query(`SELECT jsonb_build_object(
  'financial',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.financial_targets t),
  'monthly',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.monthly_targets t),
  'activity',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.activity_logs t WHERE user_id=$1 AND entity_type='report_targets')) AS value`,[seed.owner.id])).rows[0].value;
  const present=(await db.query("SELECT to_regclass('private.report_target_commands') IS NOT NULL AS yes")).rows[0].yes;
  const journal=present?(await db.query(`SELECT jsonb_build_object(
    'commands',(SELECT jsonb_agg(to_jsonb(t) ORDER BY actor_id,command_id) FROM private.report_target_commands t),
    'versions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY scope_key) FROM private.report_target_revisions t)) AS value`)).rows[0].value:null;
  return hash({business:await business(seed),targets,journal});}
async function seedTargets(seed,a){const rows=[];
  for(const[hotel,metric,value,note]of[[null,'occupancy',75,'Owned duplicate A'],[null,'occupancy',85,'Owned duplicate B'],
    [null,'gop',2000,'Owned tenant GOP note'],[a.hotelId,'adr',123.45,'Owned valid ADR note'],[a.hotelId,'occupancy',105,'Owned invalid occupancy note']]){
    rows.push(await insert('financial_targets',{tenant_id:a.tenantId,hotel_id:hotel,period_month:'2026-10-01',metric,target_value:value,notes:note,created_by:a.id},a));}
  seed.financialRows=rows;seed.monthlyRow=await insert('monthly_targets',{tenant_id:a.tenantId,hotel_id:a.hotelId,month:'2026-10-01',revenue_target:300000,occupancy_target:105},a);
  seed.financialSnapshot=(await db.query('SELECT to_jsonb(t) AS value FROM public.financial_targets t WHERE id=ANY($1::uuid[]) ORDER BY id',[rows.map(r=>r.id)])).rows.map(r=>r.value);
  seed.monthlySnapshot=(await db.query('SELECT to_jsonb(t) AS value FROM public.monthly_targets t WHERE id=$1',[seed.monthlyRow.id])).rows[0].value;
}
function memory(records={}){const map=new Map(Object.entries(records));return{get length(){return map.size},key:i=>[...map.keys()][i]??null,
  getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),records:()=>Object.fromEntries(map)};}
const args=s=>({p_kind:s.kind,p_period_month:s.month,p_hotel_id:s.hotelId});
function app(a,store,endpoint=origin){const context={actorId:a.id,sessionId:a.sessionId,tenantId:a.tenantId,runtime:'owned-report-upgrade:'+input.run};
  return{context,client:RoomQCReportTargetCaller.createReportTargetClient({endpoint,publishableKey:input.publishableKey,storage:()=>store,
    getSession:async()=>({data:{session:{access_token:a.token,user:{id:a.id}}},error:null})})};}
async function lostSave(a,scope,values,kind){let hit=false;const sockets=new Set();const server=createServer(async(req,res)=>{try{
  const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
  if(req.url==='/rest/v1/rpc/replace_report_targets'&&kind==='before'){hit=true;req.socket.destroy();return;}
  const r=await fetch(origin+req.url,{method:'POST',headers:{apikey:input.publishableKey,authorization:'Bearer '+a.token,'content-type':'application/json'},
    body,signal:AbortSignal.timeout(20000)}),bytes=Buffer.from(await r.arrayBuffer());
  if(req.url==='/rest/v1/rpc/replace_report_targets'&&kind==='after'){assert.equal(r.status,200);const b=JSON.parse(body);
    const n=(await db.query('SELECT count(*) AS n FROM private.report_target_commands WHERE actor_id=$1 AND command_id=$2',[a.id,b.p_command_id])).rows[0];
    assert.equal(Number(n.n),1);hit=true;req.socket.destroy();return;}
  res.writeHead(r.status,{'content-type':'application/json'});res.end(bytes);
 }catch{res.destroy()}});server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('error',()=>{})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const store=memory(),{client,context}=app(a,store,'http://127.0.0.1:'+server.address().port);
  try{const report=await client.read(context,scope);let code;try{await client.save(context,scope,values,report.revision)}catch(e){code=e.code}
    assert.equal(code,'outcome_unknown');assert.equal(hit,true);const pending=client.pending(context,scope);assert.equal(pending.length,1);
    const serialized=JSON.stringify(store.records());
    assert.ok(!serialized.includes('access_token')&&![a.token,input.serviceKey,input.databasePassword].some(secret=>serialized.includes(secret)));
    return{scope,records:store.records(),command:pending[0].command};
  }finally{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}}
async function target(a,s){const r=await rpc('get_report_targets',a,args(s));assert.equal(r.status,200);return r.data;}
try{
  if(input.phase==='seed566'){
    rec('seed-exact566-history',await count()===566);const a=await owner('a'),b=await owner('b'),seed={owner:publicActor(a),foreign:publicActor(b),cases:{}};
    seed.cases.checkout=await booking(a,'checked_in',{amount_paid:200000});await cash(a,seed.cases.checkout,200000);
    const q={p_booking_id:seed.cases.checkout.id,p_room_id:seed.cases.checkout.roomId,p_subtotal:200000,p_command_id:randomUUID(),p_adjustment_notes:'Owned original checkout note'};
    const out=await rpc('perform_checkout',a,q);assert.equal(out.status,200);assert.ok(out.data.invoice_id);seed.checkout={request:q,result:out.data};
    await db.query("UPDATE public.room_bookings SET check_out_date='2026-10-15' WHERE id=$1",[seed.cases.checkout.id]);
    seed.resolutions=[];
    for(const[name,refund,advance]of[['retain',false,0],['refund',true,50000]]){const stay=await booking(a,'confirmed',{deposit_amount:100000,amount_paid:advance});seed.cases[name]=stay;await cash(a,stay,100000+advance);
      const request={p_booking_id:stay.id,p_refund_deposit:refund,p_reason:'Owned original no-show classification',p_command_id:randomUUID()},r=await rpc('resolve_booking_no_show',a,request);
      assert.equal(r.status,200);seed.resolutions.push({request,result:r.data});
      await db.query("UPDATE private.booking_no_show_resolutions SET recorded_at='2026-10-15T00:00:00Z' WHERE booking_id=$1",[stay.id]);}
    await seedTargets(seed,a);
    await db.query('UPDATE public.users SET hourly_wage_vnd=100,monthly_salary_vnd=NULL WHERE id=$1',[a.id]);
    await db.query("INSERT INTO public.shift_history(tenant_id,hotel_id,user_id,start_at,end_at) VALUES($1,$2,$3,'2026-10-15T00:00:00Z','2026-10-15T01:00:00Z')",[a.tenantId,a.hotelId,a.id]);
    await db.query(`INSERT INTO public.maintenance_requests(tenant_id,hotel_id,request_code,location,issue_type,title,description,status,reported_by,completed_at,actual_cost)
      VALUES($1,$2,$3,'Owned fixture','repair','Owned upgrade cost','Owned upgrade cost','completed',$4,'2026-10-15T00:00:00Z',1000)`,[a.tenantId,a.hotelId,'RU-'+randomUUID(),a.id]);
    await db.query("INSERT INTO public.hotel_fixed_expenses(tenant_id,hotel_id,month,category,amount) VALUES($1,$2,'2026-10-01','rent',31000)",[a.tenantId,a.hotelId]);
    const cashTotal=Number((await db.query('SELECT sum(amount) AS n FROM public.booking_payments WHERE tenant_id=$1',[a.tenantId])).rows[0].n);
    rec('seed-real-checkout-invoice-two-classifications-and450000-cash',cashTotal===450000&&seed.resolutions.length===2);
    rec('seed-legacy-duplicate-invalid-decimal-notes-and-monthly-targets',seed.financialRows.length===5&&seed.monthlyRow.occupancy_target===105);
    seed.businessHash=await business(seed);seed.stateHash=await allState(seed);console.log(JSON.stringify({verified:true,checks,fixture:seed}));
  }else{
    const seed=input.seed;assert.ok(seed?.owner?.id&&seed?.businessHash);
    if(input.phase.startsWith('rollback')){
      const expected=Number(input.phase.slice(8))-1;rec(input.phase+'-history-preserved',await count()===expected);
      rec(input.phase+'-money-trial-receipts-and-target-state-preserved',await allState(seed)===seed.stateHash);
      console.log(JSON.stringify({verified:true,checks}));
    }else if(input.phase==='checkpoint571'){
      rec('checkpoint-exact571-history',await count()===571);rec('checkpoint-business-data-preserved',await business(seed)===seed.businessHash);
      const a=await login('a',seed.owner);
      const legacy=(await db.query('SELECT to_jsonb(t) AS value FROM public.financial_targets t WHERE id=ANY($1::uuid[]) ORDER BY id',[seed.financialRows.map(r=>r.id)])).rows.map(r=>r.value);
      rec('checkpoint571-preserves-legacy-values-notes-and-metadata-with-review-flags',legacy.length===5&&legacy.every(r=>{
        const original=seed.financialSnapshot.find(x=>x.id===r.id),duplicate=r.hotel_id===null&&r.metric==='occupancy';
        return r.legacy_review===duplicate&&Object.keys(r).length===Object.keys(original).length+1
          &&Object.keys(original).every(k=>duplicate&&k==='updated_at'||r[k]===original[k]);}));
      const tenantReview=await target(a,{kind:'financial',month:'2026-10-01',hotelId:null});
      rec('checkpoint571-requires-review-instead-of-choosing-a-duplicate',tenantReview.review_required&&tenantReview.values.occupancy===undefined&&tenantReview.values.gop===2000);
      const oldInterface=await call('/rest/v1/financial_targets?select=id',a.token,undefined,'GET');
      rec('checkpoint571-closes-old-direct-target-interface',[401,403].includes(oldInterface.status));
      seed.targetPending=[];
      for(const[month,kind,loss,values]of[['2026-11-01','financial','after',{adr:200}],['2026-12-01','financial','before',{adr:300}],['2026-11-01','monthly','before',{revenue_target:400000,occupancy_target:80}]]){
        const pending=await lostSave(a,{kind,month,hotelId:a.hotelId},values,loss);seed.targetPending.push({...pending,loss});}
      rec('checkpoint-actual-caller-persists-one-committed-and-two-unknown-keys',seed.targetPending.length===3);
      const rows=(await db.query('SELECT * FROM private.report_target_commands WHERE actor_id=$1',[a.id])).rows;
      rec('checkpoint-only-durable-save-has-journal',rows.length===1&&rows[0].result.state==='completed');seed.completedRowsHash=hash(rows);
      seed.stateHash=await allState(seed);console.log(JSON.stringify({verified:true,checks,fixture:seed}));
    }else{
      rec('post-exact572-history',await count()===572);rec('post-money-trial-source-invoice-and-notes-preserved',await business(seed)===seed.businessHash);
      const a=await login('a',seed.owner),b=await login('b',seed.foreign);
      const oldRows=(await db.query('SELECT to_jsonb(t) AS value FROM public.financial_targets t WHERE id=ANY($1::uuid[]) ORDER BY id',[seed.financialRows.map(r=>r.id)])).rows.map(r=>r.value);
      // Only the duplicate group receives a review flag and its normal UPDATE
      // timestamp. All other metadata, including IDs/creator/dates, must survive.
      rec('post-preserves-all-five-legacy-target-values-notes-and-metadata',oldRows.length===5&&oldRows.every(r=>{const original=seed.financialSnapshot.find(x=>x.id===r.id);
        const duplicate=r.hotel_id===null&&r.metric==='occupancy';
        return Object.keys(r).length===Object.keys(original).length+1&&Object.keys(original).every(k=>duplicate&&k==='updated_at'||r[k]===original[k]);}));
      rec('post-marks-only-duplicate-null-scope-rows-for-review',oldRows.every(r=>r.legacy_review===(r.hotel_id===null&&r.metric==='occupancy')));
      const month=(await db.query('SELECT to_jsonb(t) AS value FROM public.monthly_targets t WHERE id=$1',[seed.monthlyRow.id])).rows[0].value;
      rec('post-monthly-invalid-row-is-not-silently-repaired',hash(month)===hash(seed.monthlySnapshot)&&Number(month.revenue_target)===300000&&Number(month.occupancy_target)===105);
      const nullScope={kind:'financial',month:'2026-10-01',hotelId:null},hotelScope={...nullScope,hotelId:a.hotelId},monthlyScope={...hotelScope,kind:'monthly'};
      const tenantReport=await target(a,nullScope),hotelReport=await target(a,hotelScope),monthlyReport=await target(a,monthlyScope);
      rec('post-readers-distinguish-ambiguous-invalid-and-valid-values',tenantReport.review_required&&tenantReport.values.gop===2000&&tenantReport.values.occupancy===undefined
        &&hotelReport.review_required&&hotelReport.values.adr===123.45&&hotelReport.values.occupancy===undefined&&monthlyReport.review_required&&monthlyReport.values.revenue_target===300000&&monthlyReport.values.occupancy_target===undefined);
      const before=await allState(seed),denied=await rpc('get_report_targets',b,args(hotelScope));
      const rawRead=await call('/rest/v1/financial_targets?select=id',a.token,undefined,'GET');
      rec('post-foreign-target-and-old-direct-table-interface-denied-without-effects',denied.status===403&&[401,403].includes(rawRead.status)&&before===await allState(seed));
      const completed=(await db.query('SELECT * FROM private.report_target_commands WHERE actor_id=$1 ORDER BY actor_id,command_id',[a.id])).rows;
      rec('post571-completed-receipt-preserved-through572',hash(completed)===seed.completedRowsHash);
      for(const p of seed.targetPending){const store=memory(p.records),{client,context}=app(a,store),old=await allState(seed);
        const result=p.scope.month==='2026-12-01'?await client.cancel(context,p.scope):await client.recover(context,p.scope);
        rec('post-client-'+p.scope.kind+'-'+p.scope.month+'-uses-original-key',result.command_id===p.command.p_command_id&&store.length===0);
        if(p.loss==='after')rec('post-recover-completed-does-not-repeat-effects',result.state==='completed'&&old===await allState(seed));
        if(result.state==='cancelled'){const snapshot=await allState(seed),late=await rpc('replace_report_targets',a,p.command);
          rec('post-cancel-pending-fences-delayed-pre572-save',late.status===200&&late.data.state==='cancelled'&&snapshot===await allState(seed));}
        if(p.scope.kind==='monthly')rec('post-recovered-monthly-values-match-original-intent',(await target(a,p.scope)).values.revenue_target===400000);
      }
      const beforeReplay=await business(seed),checkout=await rpc('perform_checkout',a,seed.checkout.request);
      const resolutions=await Promise.all(seed.resolutions.map(v=>rpc('resolve_booking_no_show',a,v.request)));
      rec('post-old-checkout-and-noshow-replay-preserve-original-receipt',checkout.status===200&&checkout.data.invoice_id===seed.checkout.result.invoice_id
        &&checkout.data.notification_event_id===seed.checkout.result.notification_event_id&&resolutions.every((r,i)=>r.status===200&&r.data.deposit_resolution.id===seed.resolutions[i].result.deposit_resolution.id));
      rec('post-old-financial-command-replay-does-not-change-cash-or-sources',beforeReplay===await business(seed));
      const period={p_hotel_id:a.hotelId,p_start_date:'2026-10-01',p_end_date:'2026-10-31',p_timezone:'Asia/Ho_Chi_Minh'};
      const finance=await rpc('get_financial_report_scoped',a,period),revenue=await rpc('get_revenue_report',a,{p_hotel_id:a.hotelId,p_period:'custom',p_custom_start:'2026-10-01',p_custom_end:'2026-10-31',p_today:'2026-10-31',p_timezone:'Asia/Ho_Chi_Minh'});
      const operations=await rpc('get_operations_report_scoped',a,period),labor=await rpc('get_labor_cost_scoped',a,period),exported=await rpc('export_revenue_report',a,period);
      rec('post-reports-recognize-room200000-and-retained100000-without-refund-as-cash',finance.status===200&&finance.data.revenue_summary.net_revenue===200000&&finance.data.revenue_summary.no_show_fees===100000
        &&finance.data.revenue_summary.recognized_revenue===300000&&revenue.status===200&&revenue.data.noShow.currentPeriod.refundDueAmount===100000);
      rec('post-finance-operations-cost-and-labor-use-preserved-sources',operations.status===200&&operations.data.current.recognized_revenue===300000&&operations.data.current.cost_summary.total_cost===1000
        &&finance.data.summary.total_cost===1000&&finance.data.fixed_cost_summary.allocated_amount===31000&&labor.status===200&&labor.data.total_labor_cost===100);
      rec('post-export-uses-current-authority-and-same-recognized-values',exported.status===200&&exported.data.noShow.currentPeriod.retainedAmount===100000);
      const legacyReport=await rpc('get_financial_report',a,{p_tenant_id:a.tenantId,p_hotel_id:a.hotelId,p_start_date:'2026-10-01',p_end_date:'2026-10-31'});
      const monthly=await rpc('get_monthly_expenses',a,{p_tenant_id:a.tenantId,p_hotel_id:a.hotelId,p_months:12});
      rec('post-legacy-financial-and-monthly-read-contracts-remain-compatible',legacyReport.status===200&&legacyReport.data.revenue_summary.recognized_revenue===300000
        &&monthly.status===200&&monthly.data.at(-1).month==='Oct'&&monthly.data.at(-1).total===1000);
      const deniedBefore=await allState(seed);const foreign=await rpc('get_financial_report_scoped',b,period),machine=await rpc('export_revenue_report',input.serviceKey,period);
      rec('post-foreign-and-machine-report-denials-have-no-effects',foreign.status===403&&[401,403].includes(machine.status)&&deniedBefore===await allState(seed));
      const noResolve={...args(nullScope),p_values:{occupancy:80,gop:2000},p_expected_revision:tenantReport.revision,p_command_id:randomUUID(),p_resolve_legacy:false};
      const refused=await rpc('replace_report_targets',a,noResolve);rec('post-legacy-review-cannot-be-silently-overwritten',refused.status===409&&deniedBefore===await allState(seed));
      const resolved=await rpc('replace_report_targets',a,{...noResolve,p_command_id:randomUUID(),p_resolve_legacy:true});assert.equal(resolved.status,200);
      const saved=(await db.query('SELECT previous_rows FROM private.report_target_commands WHERE actor_id=$1 AND command_id=$2',[a.id,resolved.data.command_id])).rows[0];
      rec('post-explicit-owner-resolution-archives-both-duplicate-notes',saved.previous_rows.length===3&&['Owned duplicate A','Owned duplicate B','Owned tenant GOP note'].every(note=>saved.previous_rows.some(r=>r.notes===note)));
      let duplicate=false;try{await db.query("INSERT INTO public.financial_targets(tenant_id,hotel_id,period_month,metric,target_value) VALUES($1,NULL,'2026-10-01','occupancy',90)",[a.tenantId]);}catch(e){duplicate=e.code==='23505'}
      rec('post-canonical-null-scope-uniqueness-rejects-new-duplicates',duplicate&&!resolved.data.report.review_required&&resolved.data.report.values.occupancy===80);
      rec('post-protected-money-trial-and-source-snapshot-still-identical',await business(seed)===seed.businessHash);
      console.log(JSON.stringify({verified:true,checks,priorMigrations:566,targetMigrations:572,actualOldBinaryRollback:false,destructiveDownMigrationAttempted:false,
        nativeCallerCompatibility:true,fixtureStorageOnly:true,productAcceptance:false,owner:publicActor(a)}));
    }
  }
}catch(e){console.log(JSON.stringify({verified:false,checks,stage,errorCode:/^[A-Z0-9_]{3,80}$/.test(e.code??'')?e.code:'REPORT_UPGRADE_ASSERTION'}));process.exitCode=1;}
finally{await db.end();}
