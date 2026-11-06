// Real Auth + REST; all data and lock/fault controls belong to this disposable
// backend. Credentials and raw server responses never leave the private client.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_WORKFLOW_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);
const db=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,
  max:5,statement_timeout:25000,connectionTimeoutMillis:5000});
const checks=[],races=[];let serial=0,stage='accounts';
const record=(label,passed,details={})=>checks.push({label:'revenue-report-'+label,passed,actualNative:true,...details});
async function call(url,token,body,method='POST'){
  const r=await fetch('http://127.0.0.1:8000'+url,{method,signal:AbortSignal.timeout(35000),headers:{
    apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},
    body:body===undefined?undefined:JSON.stringify(body)});
  let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};
}
const rpc=(name,a,body={})=>call('/rest/v1/rpc/'+name,a.token??a,body);
const query={p_period:'month',p_today:'2026-10-01',p_timezone:'Asia/Ho_Chi_Minh'};
const report=(a,extra={})=>rpc('get_revenue_report',a,{...query,...extra});
async function insert(table,body){const r=await call('/rest/v1/'+table,input.serviceKey,body);assert.equal(r.status,201,'Owned revenue seed '+table);return r.data[0];}
async function account(label){
  const email='revenue-'+input.run+'-'+label+'@roomqc.invalid',password=randomBytes(32).toString('hex');
  const r=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(r.status,200);
  const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(login.status,200);
  const token=login.data.access_token;return{id:r.data.id,email,token,sessionId:JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id};
}
async function owner(label){const a=await account(label),p=await rpc('provision_workspace_registration',input.serviceKey,{
  p_workspace_id:randomUUID(),p_owner_id:a.id,p_fields:{fullName:'Owned revenue fixture',phone:'0901234567',tenantName:'Owned revenue fixture',
    hotelName:'Owned revenue fixture',hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:a.email,totalRooms:5}});
  assert.equal(p.status,200);assert.equal(p.data.success,true);return{...a,tenantId:p.data.tenant_id,hotelId:p.data.hotel_id};}
async function booking(a,status='confirmed',extra={}){
  const room=await insert('rooms',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,room_number:'RF'+(++serial),room_type:'standard',floor:1,status:'vacant_clean'});
  const b=await insert('room_bookings',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,room_id:room.id,guest_name:'Owned synthetic report guest',
    check_in_date:'2026-09-01T00:00:00Z',check_out_date:'2026-11-02T00:00:00Z',status,created_by:a.id,booking_type:'daily',
    room_price:200000,subtotal:200000,total_amount:200000,vat_rate:0,service_fee_rate:0,...extra});return{...b,roomId:room.id};
}
async function classified(a,decision,amount,at,advance=0){
  const b=await booking(a,'confirmed',{deposit_amount:amount,amount_paid:advance});
  await insert('booking_payments',{tenant_id:a.tenantId,hotel_id:a.hotelId,booking_id:b.id,amount:amount+advance,
    payment_method:'cash',payment_status:'completed',paid_at:'2026-09-01T00:00:00Z',created_by:a.id});
  const r=await rpc('resolve_booking_no_show',a,{p_booking_id:b.id,p_refund_deposit:decision==='refund_due',p_reason:'Owned report fixture',p_command_id:randomUUID()});
  assert.equal(r.status,200);await db.query('UPDATE private.booking_no_show_resolutions SET recorded_at=$2 WHERE booking_id=$1',[b.id,at]);return b;
}
async function snapshot(){return createHash('sha256').update(JSON.stringify((await db.query(`SELECT jsonb_build_object(
  'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.booking_payments p),
  'invoices',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.guest_invoices p),
  'resolutions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY booking_id) FROM private.booking_no_show_resolutions p),
  'commands',(SELECT count(*) FROM private.booking_room_commands),
  'audit',(SELECT count(*) FROM public.audit_log),
  'shifts',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.shift_history p),
  'wages',(SELECT jsonb_agg(jsonb_build_object('id',u.id,'hourly',u.hourly_wage_vnd,'monthly',u.monthly_salary_vnd) ORDER BY u.id) FROM public.users u),
  'costs',jsonb_build_object(
    'purchase',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.inventory_transactions p),
    'laundry',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.laundry_batches p),
    'maintenance',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.maintenance_requests p),
    'fixed',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.hotel_fixed_expenses p))) AS value`)).rows[0].value)).digest('hex');}
async function denied(label,fn,statuses=[401,403]){const before=await snapshot(),r=await fn(),unchanged=before===await snapshot();
  record(label,statuses.includes(r.status)&&unchanged,{status:r.status,effectsUnchanged:unchanged});}
async function waitOnLock(functionName='get_revenue_report'){const end=Date.now()+7000;while(Date.now()<end){
  const r=await db.query("SELECT count(*) AS n FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND wait_event_type='Lock' AND query LIKE $1",['%'+functionName+'%']);
  if(Number(r.rows[0].n)>0)return;await new Promise(r=>setTimeout(r,20));}throw new Error('REVENUE_REAL_LOCK_NOT_OBSERVED');}
try{
  const a=await owner('a'),b=await owner('b'),staff=await account('accountant');
  const h=await insert('hotels',{tenant_id:a.tenantId,name:'Owned unassigned hotel',address:'Owned fixture',status:'active'}),other={...a,hotelId:h.id};
  await insert('users',{id:staff.id,email:staff.email,full_name:'Owned report-only accountant',tenant_id:a.tenantId,hotel_id:a.hotelId,
    role:'staff',user_level_code:'staff',status:'active',created_by:a.id,must_change_password:false,account_locked:false});
  await insert('user_roles',{user_id:staff.id,role:'staff'});
  await insert('user_hotels',{user_id:staff.id,hotel_id:a.hotelId,assigned_by:a.id});
  // Fixture-only: remove inherited staff report/booking grants before proving
  // that read-only access is sufficient. Disabled direct grants don't override inheritance.
  await db.query(`DELETE FROM public.role_permissions rp USING public.roles r,public.permissions p
    WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='staff' AND p.module IN('reports','bookings')`);
  stage='accountant-capability';
  await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'reports','view',true)",[staff.id,a.tenantId]);
  const capabilities=(await db.query(`SELECT public.has_user_permission($1,'reports','view') AS view,
    public.has_user_permission($1,'reports','export') AS export,public.has_user_permission($1,'bookings','update') AS update,
    public.has_user_permission($1,'bookings','manage') AS manage`,[staff.id])).rows[0];
  record('accountant-has-view-without-export-or-booking-write',capabilities.view&&!capabilities.export&&!capabilities.update&&!capabilities.manage);
  stage='business-seed';
  const targetBoundaryExists=(await db.query("SELECT to_regprocedure('public.get_report_targets(text,date,uuid)') IS NOT NULL AS ready")).rows[0].ready;
  {
    stage='target-legacy-baseline';
    const manager=await account('target-manager');
    await insert('users',{id:manager.id,email:manager.email,full_name:'Owned target manager',tenant_id:a.tenantId,hotel_id:a.hotelId,
      role:'hotel_manager',user_level_code:'manager',status:'active',created_by:a.id,must_change_password:false,account_locked:false});
    await insert('user_roles',{user_id:manager.id,role:'hotel_manager'});
    await insert('user_hotels',{user_id:manager.id,hotel_id:a.hotelId,assigned_by:a.id});
    await db.query("INSERT INTO public.financial_targets(tenant_id,hotel_id,period_month,metric,target_value) VALUES($1,$2,'2026-10-01','adr',123)",[a.tenantId,other.hotelId]);
    await db.query("INSERT INTO public.monthly_targets(tenant_id,hotel_id,month,revenue_target) VALUES($1,$2,'2026-10-01',123)",[a.tenantId,other.hotelId]);
    const financialRead=await call('/rest/v1/financial_targets?select=target_value&hotel_id=eq.'+other.hotelId,staff.token,undefined,'GET');
    record('targets-baseline-unassigned-financial-read-denied',financialRead.status===403,{status:financialRead.status,returnedRows:Array.isArray(financialRead.data)?financialRead.data.length:null});
    const monthlyRead=await call('/rest/v1/monthly_targets?select=revenue_target&hotel_id=eq.'+other.hotelId,staff.token,undefined,'GET');
    record('targets-baseline-unassigned-monthly-read-denied',monthlyRead.status===403,{status:monthlyRead.status,returnedRows:Array.isArray(monthlyRead.data)?monthlyRead.data.length:null});
    const financialWrite=await call('/rest/v1/financial_targets',manager.token,{tenant_id:a.tenantId,hotel_id:other.hotelId,period_month:'2026-11-01',metric:'adr',target_value:456});
    record('targets-baseline-manager-unassigned-financial-write-denied',financialWrite.status===403,{status:financialWrite.status});
    const monthlyWrite=await call('/rest/v1/monthly_targets',manager.token,{tenant_id:a.tenantId,hotel_id:other.hotelId,month:'2026-11-01',revenue_target:456});
    record('targets-baseline-manager-unassigned-monthly-write-denied',monthlyWrite.status===403,{status:monthlyWrite.status});
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=$1",[staff.sessionId]);
    const expiredRead=await call('/rest/v1/financial_targets?select=target_value',staff.token,undefined,'GET');
    record('targets-baseline-expired-session-table-read-denied',expiredRead.status===403,{status:expiredRead.status});
    await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[staff.sessionId]);
    await db.query("INSERT INTO public.financial_targets(tenant_id,hotel_id,period_month,metric,target_value) VALUES($1,NULL,'2026-10-01','adr',1)",[a.tenantId]);
    let duplicateRejected=false;
    try{await db.query("INSERT INTO public.financial_targets(tenant_id,hotel_id,period_month,metric,target_value) VALUES($1,NULL,'2026-10-01','adr',2)",[a.tenantId]);}
    catch(e){assert.equal(e.code,'23505');duplicateRejected=true;}
    const duplicates=Number((await db.query("SELECT count(*) AS n FROM public.financial_targets WHERE tenant_id=$1 AND hotel_id IS NULL AND period_month='2026-10-01' AND metric='adr'",[a.tenantId])).rows[0].n);
    record('targets-baseline-null-hotel-has-one-canonical-value',duplicates===1,{canonicalRows:duplicates});
    if(targetBoundaryExists){
      stage='target-command-controls';
      const args={p_kind:'financial',p_period_month:'2026-10-01',p_hotel_id:a.hotelId};
      const readTarget=(actor,extra={})=>rpc('get_report_targets',actor,{...args,...extra});
      const writeTarget=(actor,values,revision,extra={})=>rpc('replace_report_targets',actor,{
        ...args,p_values:values,p_expected_revision:revision,p_command_id:randomUUID(),...extra});
      const targetSnapshot=async()=>createHash('sha256').update(JSON.stringify((await db.query(`SELECT jsonb_build_object(
        'financial',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.financial_targets t),
        'monthly',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.monthly_targets t),
        'versions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY scope_key) FROM private.report_target_revisions t),
        'commands',(SELECT jsonb_agg(to_jsonb(t) ORDER BY actor_id,command_id) FROM private.report_target_commands t),
        'audit',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.activity_logs t WHERE entity_type='report_targets')) AS value`)).rows[0].value)).digest('hex');
      const targetDenied=async(label,fn,statuses=[401,403])=>{const before=await targetSnapshot(),r=await fn();
        record('targets-'+label,statuses.includes(r.status)&&before===await targetSnapshot(),{status:r.status,effectsUnchanged:before===await targetSnapshot()});return r;};
      const original=await targetSnapshot(),empty=await readTarget(staff);
      record('targets-reader-uses-assigned-hotel-without-write-capability',empty.status===200&&empty.data.values&&Object.keys(empty.data.values).length===0&&!empty.data.can_manage);
      record('targets-empty-read-does-not-initialize-versions-or-audit',original===await targetSnapshot());
      await targetDenied('foreign-hotel-read-denied',()=>readTarget(b));
      await targetDenied('unassigned-hotel-read-denied',()=>readTarget(staff,{p_hotel_id:other.hotelId}));
      await targetDenied('staff-cannot-read-tenant-wide-targets',()=>readTarget(staff,{p_hotel_id:null}));
      await targetDenied('monthly-null-hotel-is-invalid',()=>readTarget(a,{p_kind:'monthly',p_hotel_id:null}),[400]);
      for(const extra of [{p_kind:'other'},{p_period_month:'2026-10-02'},{p_period_month:null},{p_period_month:'2101-01-01'}])
        await targetDenied('invalid-read-scope-'+Object.keys(extra)[0]+'-'+String(Object.values(extra)[0]),()=>readTarget(a,extra),[400]);
      await targetDenied('anonymous-rpc-denied',()=>readTarget(input.publishableKey));
      await targetDenied('machine-rpc-denied',()=>readTarget(input.serviceKey));
      await targetDenied('staff-write-denied',()=>writeTarget(staff,{adr:100},empty.data.revision));
      await targetDenied('manager-unassigned-command-denied',()=>writeTarget(manager,{adr:100},empty.data.revision,{p_hotel_id:other.hotelId}));
      await targetDenied('manager-tenant-wide-command-denied',()=>writeTarget(manager,{adr:100},empty.data.revision,{p_hotel_id:null}));
      const key=randomUUID(),first=await writeTarget(a,{adr:123.45,occupancy:80,net_revenue:1000000,gop:-20},empty.data.revision,{p_command_id:key});
      record('targets-owner-batch-replaces-atomically-with-completed-result',first.status===200&&first.data.state==='completed'
        &&first.data.report.values.adr===123.45&&first.data.report.values.gop===-20&&first.data.report.revision!==empty.data.revision,{status:first.status});
      const afterFirst=await targetSnapshot(),replay=await writeTarget(a,{adr:123.45,occupancy:80,net_revenue:1000000,gop:-20},empty.data.revision,{p_command_id:key});
      record('targets-same-key-replay-keeps-result-without-effects',replay.status===200&&JSON.stringify(replay.data)===JSON.stringify(first.data)&&afterFirst===await targetSnapshot());
      await targetDenied('same-key-different-values-conflicts',()=>writeTarget(a,{adr:999},empty.data.revision,{p_command_id:key}),[409]);
      await targetDenied('stale-revision-conflicts',()=>writeTarget(a,{adr:999},empty.data.revision),[409]);
      const recovered=await rpc('get_report_target_command',a,{p_command_id:key});
      record('targets-commit-response-loss-recovers-by-key',recovered.status===200&&JSON.stringify(recovered.data)===JSON.stringify(first.data));
      const foreignLookup=await rpc('get_report_target_command',b,{p_command_id:key});
      record('targets-command-lookup-is-actor-bound',foreignLookup.status===200&&foreignLookup.data.state==='not_found');
      const missing=await rpc('get_report_target_command',a,{p_command_id:randomUUID()});
      record('targets-unknown-key-is-not-found-without-effects',missing.status===200&&missing.data.state==='not_found'&&afterFirst===await targetSnapshot());
      const invalid=[{occupancy:101},{occupancy:-1},{adr:-1},{adr:0.001},{net_revenue:'123'},{net_revenue:null},{other:1},{adr:1000000000000}];
      for(let i=0;i<invalid.length;i++)await targetDenied('invalid-value-'+i,()=>writeTarget(a,invalid[i],first.data.report.revision),[400]);
      const monthly=await readTarget(manager,{p_kind:'monthly'});
      const monthlySaved=await writeTarget(manager,{revenue_target:5000000,occupancy_target:75.5},monthly.data.revision,{p_kind:'monthly'});
      record('targets-assigned-manager-can-save-monthly-values',monthlySaved.status===200&&monthlySaved.data.report.values.occupancy_target===75.5,{status:monthlySaved.status});
      await targetDenied('monthly-rejects-fractional-vnd',()=>writeTarget(manager,{revenue_target:1.5},monthlySaved.data.report.revision,{p_kind:'monthly'}),[400]);
      const tenant=await readTarget(a,{p_hotel_id:null});
      const tenantSaved=await writeTarget(a,{adr:200},tenant.data.revision,{p_hotel_id:null});
      record('targets-null-hotel-owner-replaces-canonical-group',duplicateRejected&&tenantSaved.status===200&&tenantSaved.data.report.values.adr===200);
      await db.query("DELETE FROM public.financial_targets WHERE tenant_id=$1 AND hotel_id IS NULL AND period_month='2026-10-01'",[a.tenantId]);
      await db.query("INSERT INTO public.financial_targets(tenant_id,hotel_id,period_month,metric,target_value,legacy_review) VALUES($1,NULL,'2026-10-01','adr',1,true),($1,NULL,'2026-10-01','adr',2,true)",[a.tenantId]);
      const legacy=await readTarget(a,{p_hotel_id:null});
      record('targets-legacy-ambiguity-is-visible-not-arbitrarily-selected',legacy.status===200&&legacy.data.review_required===true&&legacy.data.values.adr===undefined);
      await targetDenied('legacy-review-requires-explicit-owner-decision',()=>writeTarget(a,{adr:300},legacy.data.revision,{p_hotel_id:null}),[409]);
      const resolutionKey=randomUUID(),resolved=await writeTarget(a,{adr:300},legacy.data.revision,{p_hotel_id:null,p_resolve_legacy:true,p_command_id:resolutionKey});
      const archived=(await db.query('SELECT jsonb_array_length(previous_rows) AS n FROM private.report_target_commands WHERE actor_id=$1 AND command_id=$2',[a.id,resolutionKey])).rows[0];
      record('targets-explicit-review-keeps-both-old-rows-in-private-history',resolved.status===200&&!resolved.data.report.review_required&&archived.n===2);
      const revision=(await readTarget(a)).data.revision,scope=(await db.query("SELECT private.report_target_key($1,'financial','2026-10-01',$2) AS key",[a.tenantId,a.hotelId])).rows[0].key;
      const barrier=await db.connect();try{
        await barrier.query('BEGIN');await barrier.query("SELECT pg_advisory_xact_lock(hashtextextended('report-targets:'||$1,0))",[scope]);
        const p1=writeTarget(a,{adr:401},revision),p2=writeTarget(a,{adr:402},revision);await waitOnLock('replace_report_targets');
        await barrier.query('COMMIT');const results=await Promise.all([p1,p2]);
        const passed=results.filter(r=>r.status===200).length===1&&results.filter(r=>r.status===409).length===1;
        record('targets-two-writers-same-version-only-one-commits',passed,{realLockBarrier:true,statuses:results.map(r=>r.status)});
        races.push({kind:'target-same-version',passed,realLockBarrier:true});
      }finally{await barrier.query('ROLLBACK');barrier.release();}
      const replayRevision=(await readTarget(a)).data.revision,replayKey=randomUUID(),beforeReplay=await targetSnapshot();
      const batch=await Promise.all(Array.from({length:12},()=>writeTarget(a,{adr:500},replayRevision,{p_command_id:replayKey})));
      const count=(await db.query('SELECT count(*) AS n FROM private.report_target_commands WHERE actor_id=$1 AND command_id=$2',[a.id,replayKey])).rows[0].n;
      record('targets-twelve-replays-one-receipt-one-version',batch.every(r=>r.status===200)&&new Set(batch.map(r=>r.data.report.revision)).size===1&&Number(count)===1&&beforeReplay!==await targetSnapshot());
      for(const [table,condition,label]of [['public.activity_logs',"NEW.entity_type='report_targets'",'audit'],
        ['private.report_target_commands','true','receipt']]){
        const faultKey=randomUUID(),faultRevision=(await readTarget(a)).data.revision;
        await db.query(`CREATE FUNCTION private.owned_report_target_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$
          BEGIN IF ${condition} THEN RAISE EXCEPTION 'OWNED_TARGET_FAULT' USING ERRCODE='23514'; END IF; RETURN NEW; END; $fault$`);
        await db.query(`CREATE TRIGGER owned_report_target_fault BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION private.owned_report_target_fault()`);
        try{
          await targetDenied(label+'-failure-rolls-back-values-version-audit-and-result',()=>writeTarget(a,{adr:700},faultRevision,{p_command_id:faultKey}),[400]);
        }finally{
          await db.query(`DROP TRIGGER owned_report_target_fault ON ${table}`);await db.query('DROP FUNCTION private.owned_report_target_fault()');
        }
        const noResult=await rpc('get_report_target_command',a,{p_command_id:faultKey});
        const retry=await writeTarget(a,{adr:700},faultRevision,{p_command_id:faultKey});
        record('targets-'+label+'-failure-key-retries-once-after-fault-removed',noResult.status===200&&noResult.data.state==='not_found'
          &&retry.status===200&&retry.data.report.values.adr===700);
      }
      const grantLock=await db.connect();try{
        await grantLock.query('BEGIN');await grantLock.query("UPDATE public.user_permissions SET enabled=false WHERE user_id=$1 AND module='reports' AND action='view'",[staff.id]);
        const pending=readTarget(staff);await waitOnLock('get_report_targets');await grantLock.query('COMMIT');const r=await pending;
        record('targets-reader-grant-revoked-while-waiting-is-denied',r.status===403,{status:r.status,realLockBarrier:true});
        races.push({kind:'target-reader-revocation',passed:r.status===403,realLockBarrier:true});
      }finally{await grantLock.query('ROLLBACK');grantLock.release();}
      await db.query("UPDATE public.user_permissions SET enabled=true WHERE user_id=$1 AND module='reports' AND action='view'",[staff.id]);
      const managerRevision=(await readTarget(manager)).data.revision,assignmentLock=await db.connect();try{
        await assignmentLock.query('BEGIN');await assignmentLock.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2',[manager.id,a.hotelId]);
        const before=await targetSnapshot(),pending=writeTarget(manager,{adr:600},managerRevision);await waitOnLock('replace_report_targets');
        await assignmentLock.query('COMMIT');const r=await pending;
        record('targets-writer-assignment-revoked-while-waiting-is-denied',r.status===403&&before===await targetSnapshot(),{status:r.status,realLockBarrier:true});
        races.push({kind:'target-assignment-revocation',passed:r.status===403,realLockBarrier:true});
      }finally{await assignmentLock.query('ROLLBACK');assignmentLock.release();}
      await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)',[manager.id,a.hotelId,a.id]);
      const roleRevision=(await readTarget(manager)).data.revision,roleLock=await db.connect();try{
        await roleLock.query('BEGIN');await roleLock.query("UPDATE public.users SET role='staff',user_level_code='staff' WHERE id=$1",[manager.id]);
        await roleLock.query('DELETE FROM public.user_roles WHERE user_id=$1',[manager.id]);
        await roleLock.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'staff')",[manager.id]);
        const before=await targetSnapshot(),pending=writeTarget(manager,{adr:800},roleRevision);await waitOnLock('replace_report_targets');
        await roleLock.query('COMMIT');const r=await pending;
        record('targets-manager-role-dropped-while-waiting-is-denied',r.status===403&&before===await targetSnapshot(),{status:r.status,realLockBarrier:true});
        races.push({kind:'target-role-drop',passed:r.status===403,realLockBarrier:true});
      }finally{await roleLock.query('ROLLBACK');roleLock.release();}
      await db.query("UPDATE public.users SET role='hotel_manager',user_level_code='manager' WHERE id=$1",[manager.id]);
      await db.query('DELETE FROM public.user_roles WHERE user_id=$1',[manager.id]);await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'hotel_manager')",[manager.id]);
      const sessionBarrier=await db.connect();try{
        await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1 second' WHERE id=$1",[staff.sessionId]);
        await sessionBarrier.query('BEGIN');await sessionBarrier.query('SELECT id FROM public.hotels WHERE id=$1 FOR UPDATE',[a.hotelId]);
        const before=await targetSnapshot(),pending=readTarget(staff);await waitOnLock('get_report_targets');await new Promise(r=>setTimeout(r,1200));
        await sessionBarrier.query('COMMIT');const r=await pending;
        record('targets-reader-session-expires-while-waiting-is-denied',r.status===403&&before===await targetSnapshot(),{status:r.status,realLockBarrier:true});
        races.push({kind:'target-session-expiry',passed:r.status===403,realLockBarrier:true});
      }finally{await sessionBarrier.query('ROLLBACK');sessionBarrier.release();await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[staff.sessionId]);}
      await db.query("UPDATE public.users SET account_locked=true WHERE id=$1",[manager.id]);
      await targetDenied('locked-manager-read-denied',()=>readTarget(manager));
      await targetDenied('locked-manager-result-lookup-denied',()=>rpc('get_report_target_command',manager,{p_command_id:key}));
      await db.query("UPDATE public.users SET account_locked=false WHERE id=$1",[manager.id]);
      await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=$1",[a.sessionId]);
      await targetDenied('expired-owner-replay-denied',()=>writeTarget(a,{adr:123.45,occupancy:80,net_revenue:1000000,gop:-20},empty.data.revision,{p_command_id:key}));
      await targetDenied('expired-owner-result-lookup-denied',()=>rpc('get_report_target_command',a,{p_command_id:key}));
      await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);
      const acl=(await db.query(`SELECT p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
        has_function_privilege('service_role',p.oid,'EXECUTE') AS machine FROM pg_proc p
        WHERE p.oid IN('public.get_report_targets(text,date,uuid)'::regprocedure,
          'public.replace_report_targets(text,date,jsonb,text,uuid,uuid,boolean)'::regprocedure,
          'public.get_report_target_command(uuid)'::regprocedure)`)).rows;
      record('targets-public-wrappers-invoker-anon-and-machine-denied',acl.length===3&&acl.every(x=>!x.prosecdef&&!x.anon&&!x.machine));
      const privateAcl=(await db.query(`SELECT has_table_privilege('authenticated','private.report_target_commands','SELECT') AS command,
        has_table_privilege('authenticated','public.financial_targets','SELECT') AS financial,
        has_table_privilege('authenticated','public.monthly_targets','INSERT') AS monthly`)).rows[0];
      record('targets-private-history-and-direct-tables-are-not-browser-readable',!privateAcl.command&&!privateAcl.financial&&!privateAcl.monthly);
      const noteRevision=(await readTarget(a)).data.revision;
      await db.query("UPDATE public.financial_targets SET notes='Owned existing target note' WHERE tenant_id=$1 AND hotel_id=$2 AND metric='adr'",[a.tenantId,a.hotelId]);
      await targetDenied('trusted-row-change-invalidates-previous-revision',()=>writeTarget(a,{adr:900},noteRevision),[409]);
      const noteCurrent=(await readTarget(a)).data.revision,noteSaved=await writeTarget(a,{adr:900},noteCurrent);
      const note=(await db.query("SELECT notes FROM public.financial_targets WHERE tenant_id=$1 AND hotel_id=$2 AND metric='adr'",[a.tenantId,a.hotelId])).rows[0];
      record('targets-batch-keeps-existing-metric-notes',noteSaved.status===200&&note.notes==='Owned existing target note');
      const deleted=await writeTarget(a,{},noteSaved.data.report.revision);
      record('targets-empty-replacement-explicitly-removes-all-current-values',deleted.status===200&&Object.keys(deleted.data.report.values).length===0);
      if((await db.query("SELECT to_regprocedure('public.cancel_report_target_command(text,date,jsonb,text,uuid,uuid,boolean)') IS NOT NULL AS yes")).rows[0].yes){
        stage='target-terminal-controls';
        const command=(values,revision,extra={})=>({...args,p_values:values,p_expected_revision:revision,p_command_id:randomUUID(),p_resolve_legacy:false,...extra});
        const cancel=(actor,c)=>rpc('cancel_report_target_command',actor,c),save=(actor,c)=>rpc('replace_report_targets',actor,c);
        const config=async()=>createHash('sha256').update(JSON.stringify((await db.query(`SELECT jsonb_build_object(
          'financial',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.financial_targets t),
          'monthly',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.monthly_targets t),
          'versions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY scope_key) FROM private.report_target_revisions t)) AS value`)).rows[0].value)).digest('hex');
        const c=command({adr:100},deleted.data.report.revision),cfg=await config(),cancelled=await cancel(a,c);
        record('targets-cancel-first-returns-durable-not-applied-without-changing-values-or-version',cancelled.status===200&&cancelled.data.state==='cancelled'&&cancelled.data.reason==='not_applied'&&cfg===await config());
        const terminalSnapshot=await targetSnapshot(),late=await save(a,c),look=await rpc('get_report_target_command',a,{p_command_id:c.p_command_id});
        record('targets-cancelled-key-fences-late-save-and-lookup-returns-same-result',late.status===200&&look.status===200&&JSON.stringify(late.data)===JSON.stringify(cancelled.data)&&JSON.stringify(look.data)===JSON.stringify(cancelled.data)&&terminalSnapshot===await targetSnapshot());
        const replayCancel=await cancel(a,c);
        record('targets-cancel-replay-does-not-repeat-audit-or-result',replayCancel.status===200&&JSON.stringify(replayCancel.data)===JSON.stringify(cancelled.data)&&terminalSnapshot===await targetSnapshot());
        await targetDenied('cancelled-key-different-payload-conflicts',()=>cancel(a,{...c,p_values:{adr:101}}),[409]);
        await targetDenied('cancelled-key-different-save-payload-conflicts',()=>save(a,{...c,p_values:{adr:101}}),[409]);
        await targetDenied('cancelled-key-different-scope-conflicts',()=>cancel(a,{...c,p_period_month:'2026-11-01'}),[409]);
        const commit=command({adr:200},(await readTarget(a)).data.revision),committed=await save(a,commit),committedState=await targetSnapshot(),cancelAfter=await cancel(a,commit);
        record('targets-save-first-cancel-returns-original-completed-receipt',committed.status===200&&cancelAfter.status===200&&JSON.stringify(cancelAfter.data)===JSON.stringify(committed.data)&&committedState===await targetSnapshot());
        const stale=command({adr:300},deleted.data.report.revision);
        await targetDenied('terminal-stale-before-cancel-has-no-effects',()=>save(a,stale),[409]);
        const staleCancel=await cancel(a,stale),staleLate=await save(a,stale);
        record('targets-stale-command-can-be-cancelled-without-accepting-new-values',staleCancel.status===200&&staleCancel.data.state==='cancelled'&&staleLate.status===200&&staleLate.data.state==='cancelled');
        const invalid=command({adr:-1},(await readTarget(a)).data.revision);
        await targetDenied('terminal-invalid-range-before-cancel-has-no-effects',()=>save(a,invalid),[400]);
        const invalidCancel=await cancel(a,invalid),invalidLookup=await rpc('get_report_target_command',a,{p_command_id:invalid.p_command_id});
        record('targets-invalid-business-value-can-still-be-fenced-and-looked-up',invalidCancel.status===200&&invalidCancel.data.state==='cancelled'&&JSON.stringify(invalidLookup.data)===JSON.stringify(invalidCancel.data));
        await targetDenied('cancel-anonymous-denied',()=>cancel(input.publishableKey,c));
        await targetDenied('cancel-machine-denied',()=>cancel(input.serviceKey,c));
        await targetDenied('cancel-staff-denied',()=>cancel(staff,c));
        await targetDenied('cancel-foreign-hotel-denied',()=>cancel(b,c));
        await targetDenied('cancel-manager-unassigned-denied',()=>cancel(manager,{...c,p_command_id:randomUUID(),p_hotel_id:other.hotelId}));
        await targetDenied('cancel-manager-tenant-wide-denied',()=>cancel(manager,{...c,p_command_id:randomUUID(),p_hotel_id:null}));
        for(const extra of [{p_expected_revision:'bad'},{p_values:null},{p_values:[]},{p_values:{adr:'x'.repeat(16385)}},{p_resolve_legacy:null}])
          await targetDenied('cancel-invalid-identity-'+Object.keys(extra)[0]+'-'+(Array.isArray(extra.p_values)?'array':String(extra.p_expected_revision??extra.p_resolve_legacy??typeof extra.p_values)),()=>cancel(a,{...c,p_command_id:randomUUID(),...extra}),[400]);
        const parallel=command({adr:400},(await readTarget(a)).data.revision),beforeParallel=await config();
        const many=await Promise.all(Array.from({length:12},()=>cancel(a,parallel)));
        const rows=(await db.query('SELECT count(*) AS n FROM private.report_target_commands WHERE actor_id=$1 AND command_id=$2',[a.id,parallel.p_command_id])).rows[0];
        record('targets-twelve-cancellations-share-one-result-without-target-effects',many.every(r=>r.status===200&&r.data.state==='cancelled')&&new Set(many.map(r=>JSON.stringify(r.data))).size===1&&Number(rows.n)===1&&beforeParallel===await config());
        for(const first of ['cancel','save']){
          const race=command({adr:first==='cancel'?500:501},(await readTarget(a)).data.revision),barrier=await db.connect();
          try{
            await barrier.query('BEGIN');await barrier.query("SELECT pg_advisory_xact_lock(hashtextextended('report-target-command:'||$1||':'||$2,0))",[a.id,race.p_command_id]);
            const p1=first==='cancel'?cancel(a,race):save(a,race);await waitOnLock(first==='cancel'?'cancel_report_target_command':'replace_report_targets');
            const p2=first==='cancel'?save(a,race):cancel(a,race);await waitOnLock(first==='cancel'?'replace_report_targets':'cancel_report_target_command');
            await barrier.query('COMMIT');const results=await Promise.all([p1,p2]),expected=first==='cancel'?'cancelled':'completed';
            const passed=results.every(r=>r.status===200&&r.data.state===expected)&&JSON.stringify(results[0].data)===JSON.stringify(results[1].data);
            record('targets-'+first+'-wins-command-lock-race-with-one-terminal-outcome',passed,{realLockBarrier:true,statuses:results.map(r=>r.status)});
            races.push({kind:'target-terminal-'+first+'-first',passed,realLockBarrier:true});
          }finally{await barrier.query('ROLLBACK');barrier.release();}
        }
        // A trusted note edit can change a fingerprint and then restore it.
        // A cancellation must still fence a delayed request in that case.
        const beforeNote=(await readTarget(a)).data.revision,noteCommand=command({adr:600},beforeNote);
        const oldNote=(await db.query("SELECT notes,updated_at::text FROM public.financial_targets WHERE tenant_id=$1 AND hotel_id=$2 AND metric='adr'",[a.tenantId,a.hotelId])).rows[0];
        await db.query("UPDATE public.financial_targets SET notes='Owned transient note' WHERE tenant_id=$1 AND hotel_id=$2 AND metric='adr'",[a.tenantId,a.hotelId]);
        await targetDenied('terminal-fingerprint-change-rejects-old-version',()=>save(a,noteCommand),[409]);
        const noteCancel=await cancel(a,noteCommand);
        // Exact, fixture-owned restoration; the timestamp trigger would otherwise
        // change the fingerprint. Restore the trigger before exercising the API.
        await db.query('ALTER TABLE public.financial_targets DISABLE TRIGGER trg_financial_targets_updated_at');
        try{await db.query("UPDATE public.financial_targets SET notes=$3,updated_at=$4 WHERE tenant_id=$1 AND hotel_id=$2 AND metric='adr'",[a.tenantId,a.hotelId,oldNote.notes,oldNote.updated_at]);}
        finally{await db.query('ALTER TABLE public.financial_targets ENABLE TRIGGER trg_financial_targets_updated_at');}
        const restoredRevision=(await readTarget(a)).data.revision;
        const noteLate=await save(a,noteCommand);
        record('targets-note-reversion-cannot-revive-cancelled-request',beforeNote===restoredRevision&&noteCancel.status===200&&noteLate.status===200&&noteLate.data.state==='cancelled');
        for(const [table,condition,label]of [['public.activity_logs',"NEW.entity_type='report_targets'",'audit'],['private.report_target_commands','true','result']]){
          const fault=command({adr:700},(await readTarget(a)).data.revision);
          await db.query(`CREATE FUNCTION private.owned_report_cancel_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'OWNED_CANCEL_FAULT' USING ERRCODE='23514'; END IF; RETURN NEW; END; $fault$`);
          await db.query(`CREATE TRIGGER owned_report_cancel_fault BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION private.owned_report_cancel_fault()`);
          try{await targetDenied('cancel-'+label+'-failure-rolls-back-entire-command',()=>cancel(a,fault),[400]);}
          finally{await db.query(`DROP TRIGGER owned_report_cancel_fault ON ${table}`);await db.query('DROP FUNCTION private.owned_report_cancel_fault()');}
          const missing=await rpc('get_report_target_command',a,{p_command_id:fault.p_command_id}),retry=await cancel(a,fault);
          record('targets-cancel-'+label+'-fault-can-retry-same-key-once',missing.status===200&&missing.data.state==='not_found'&&retry.status===200&&retry.data.state==='cancelled');
        }
        const revoke=command({adr:800},(await readTarget(manager)).data.revision),assignment=await db.connect();try{
          await assignment.query('BEGIN');await assignment.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2',[manager.id,a.hotelId]);
          const before=await targetSnapshot(),pending=cancel(manager,revoke);await waitOnLock('cancel_report_target_command');await assignment.query('COMMIT');const r=await pending;
          const passed=r.status===403&&before===await targetSnapshot();record('targets-cancel-assignment-revocation-while-waiting-denied',passed,{realLockBarrier:true,status:r.status});
          races.push({kind:'target-cancel-assignment-revocation',passed,realLockBarrier:true});
        }finally{await assignment.query('ROLLBACK');assignment.release();}
        await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)',[manager.id,a.hotelId,a.id]);
        const expiry=command({adr:900},(await readTarget(a)).data.revision),sessionLock=await db.connect();try{
          await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1 second' WHERE id=$1",[a.sessionId]);
          await sessionLock.query('BEGIN');await sessionLock.query('SELECT id FROM public.hotels WHERE id=$1 FOR UPDATE',[a.hotelId]);
          const before=await targetSnapshot(),pending=cancel(a,expiry);await waitOnLock('cancel_report_target_command');await new Promise(r=>setTimeout(r,1200));await sessionLock.query('COMMIT');const r=await pending;
          const passed=r.status===403&&before===await targetSnapshot();record('targets-cancel-session-expires-while-waiting-denied',passed,{realLockBarrier:true,status:r.status});
          races.push({kind:'target-cancel-session-expiry',passed,realLockBarrier:true});
        }finally{await sessionLock.query('ROLLBACK');sessionLock.release();await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);}
        const cancelAcl=(await db.query(`SELECT p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('service_role',p.oid,'EXECUTE') AS machine
          FROM pg_proc p WHERE p.oid='public.cancel_report_target_command(text,date,jsonb,text,uuid,uuid,boolean)'::regprocedure`)).rows[0];
        record('targets-cancel-wrapper-is-invoker-and-restricted',!cancelAcl.prosecdef&&!cancelAcl.anon&&!cancelAcl.machine);
      }
    }
  }
  stage='business-seed';
  const retain=await classified(a,'retain',100000,'2026-09-30T17:00:00Z');
  await classified(a,'refund_due',100000,'2026-09-30T16:59:59.999999Z',50000);
  const zero=await booking(a);const rz=await rpc('resolve_booking_no_show',a,{p_booking_id:zero.id,p_refund_deposit:false,p_command_id:randomUUID()});assert.equal(rz.status,200);
  await db.query("UPDATE private.booking_no_show_resolutions SET recorded_at='2026-10-15T00:00:00Z' WHERE booking_id=$1",[zero.id]);
  await booking(a,'no_show',{deposit_amount:900000});
  await classified(other,'retain',25000,'2026-10-15T00:00:00Z');
  await classified(b,'retain',700000,'2026-10-15T00:00:00Z');
  const stayed=await booking(a,'checked_out',{check_out_date:'2026-10-15T00:00:00Z',amount_paid:200000,payment_status:'paid'});
  await booking(a,'checked_out',{check_out_date:'2025-01-15T00:00:00Z',amount_paid:200000,payment_status:'paid'});
  await booking(a,'checked_out',{check_out_date:'2026-01-15T00:00:00Z',amount_paid:200000,payment_status:'paid'});
  stage='report';
  const before=await snapshot(),r=await report(staff,{p_hotel_id:a.hotelId});
  record('read-only-report-via-native-auth-rest',r.status===200,{status:r.status});
  assert.equal(r.status,200,'Native revenue report request');
  record('no-show-recognition-uses-ledger-timezone-not-stay-date',r.data.noShow.currentPeriod.retainedAmount===100000&&r.data.noShow.today.retainedAmount===100000);
  record('exclusive-period-end-and-previous-period-microseconds',r.data.noShow.currentPeriod.refundDueAmount===0&&r.data.noShow.previousPeriod.refundDueAmount===100000);
  record('zero-deposit-is-a-resolution-without-revenue',r.data.noShow.currentPeriod.resolutionsCount===2&&r.data.noShow.currentPeriod.cashMovement===0);
  record('legacy-and-other-prepayment-remain-reconciliation',r.data.noShow.review.unclassifiedBookings===1&&r.data.noShow.review.unallocatedPrepaymentAmount===50000);
  record('room-counts-and-net-exclude-no-show-fees',r.data.currentPeriod.bookingsCount===1&&r.data.currentPeriod.netRevenue===200000&&r.data.currentPeriod.paidRevenue===200000,
    {bookings:r.data.currentPeriod.bookingsCount,net:r.data.currentPeriod.netRevenue,paid:r.data.currentPeriod.paidRevenue});
  record('recognized-trend-adds-fee-without-changing-room-trend',r.data.monthlyTrends.at(-1).revenue===200000&&r.data.recognizedMonthlyTrends.at(-1).revenue===300000&&r.data.monthlyTrends.at(-1).bookings===1,
    {roomRevenue:r.data.monthlyTrends.at(-1).revenue,recognizedRevenue:r.data.recognizedMonthlyTrends.at(-1).revenue});
  record('report-does-not-create-cash-invoice-command-or-audit',before===await snapshot());
  const all=await report(staff),ownerAll=await report(a);
  record('all-hotels-is-limited-to-live-assignments',all.status===200&&all.data.noShow.currentPeriod.retainedAmount===100000);
  record('owner-can-aggregate-only-own-tenant-hotels',ownerAll.status===200&&ownerAll.data.noShow.currentPeriod.retainedAmount===125000);
  const history=await rpc('get_booking_no_show_resolution',staff,{p_booking_id:retain.id});
  record('accountant-can-read-resolution-without-booking-update',history.status===200&&history.data.retained_amount===100000);
  await denied('read-right-does-not-authorize-no-show-write',()=>rpc('resolve_booking_no_show',staff,{p_booking_id:retain.id,p_refund_deposit:false,p_command_id:randomUUID()}));
  await denied('unassigned-hotel-report-denied',()=>report(staff,{p_hotel_id:other.hotelId}));
  await denied('foreign-tenant-report-denied',()=>report(staff,{p_hotel_id:b.hotelId}));
  await denied('foreign-resolution-denied',()=>rpc('get_booking_no_show_resolution',b,{p_booking_id:retain.id}));
  await denied('anon-report-denied',()=>report(input.publishableKey));
  await denied('service-key-is-not-a-user-report-reader',()=>report(input.serviceKey));
  await denied('invalid-timezone-rejected',()=>report(staff,{p_timezone:'INVALID/ZONE'}),[400]);
  await denied('reversed-custom-range-rejected',()=>report(staff,{p_period:'custom',p_custom_start:'2026-10-02',p_custom_end:'2026-10-01'}),[400]);
  const utc=await report(staff,{p_timezone:'UTC'});
  record('same-instant-has-correct-calendar-period-in-utc',utc.status===200&&utc.data.noShow.currentPeriod.retainedAmount===0&&utc.data.noShow.previousPeriod.retainedAmount===100000);
  const calendar=await report(staff,{p_period:'custom',p_custom_start:'2026-10-15',p_custom_end:'2026-10-15',p_timezone:'America/New_York'});
  record('room-checkout-calendar-date-is-not-shifted-by-timezone',calendar.status===200&&calendar.data.currentPeriod.bookingsCount===1&&calendar.data.currentPeriod.paidRevenue===200000);
  const year=await report(staff,{p_period:'year'});
  record('year-report-covers-full-current-and-previous-years',year.status===200&&year.data.currentPeriod.bookingsCount===2&&year.data.previousPeriod.bookingsCount===1);
  const custom=await report(staff,{p_period:'custom',p_custom_start:'2026-10-01',p_custom_end:'2026-10-01'});
  record('one-day-custom-has-exact-prior-day',custom.status===200&&custom.data.noShow.currentPeriod.retainedAmount===100000&&custom.data.noShow.previousPeriod.refundDueAmount===100000);
  const legacyFinance={p_tenant_id:a.tenantId,p_hotel_id:a.hotelId,p_start_date:'2026-10-01',p_end_date:'2026-10-31'};
  await denied('legacy-finance-foreign-tenant-denied',()=>rpc('get_financial_report',b,legacyFinance));
  await denied('legacy-finance-unassigned-hotel-denied',()=>rpc('get_financial_report',staff,{...legacyFinance,p_hotel_id:other.hotelId}));
  await denied('legacy-finance-anonymous-denied',()=>rpc('get_financial_report',input.publishableKey,legacyFinance));
  stage='financial-cost-fixture';
  const financeArgs={p_hotel_id:a.hotelId,p_start_date:'2026-10-15',p_end_date:'2026-10-15',p_timezone:'Asia/Ho_Chi_Minh'};
  const finance=(actor,extra={})=>rpc('get_financial_report_scoped',actor,{...financeArgs,...extra});
  const operationsArgs={p_hotel_id:a.hotelId,p_start_date:'2026-10-01',p_end_date:'2026-10-31',p_timezone:'Asia/Ho_Chi_Minh'};
  const operations=(actor,extra={})=>rpc('get_operations_report_scoped',actor,{...operationsArgs,...extra});
  const exportArgs={p_hotel_id:a.hotelId,p_start_date:'2026-10-01',p_end_date:'2026-10-31',p_timezone:'Asia/Ho_Chi_Minh'};
  const exportRevenue=(actor,extra={})=>rpc('export_revenue_report',actor,{...exportArgs,...extra});
  async function maintenance(actor,at,amount){
    await db.query(`INSERT INTO public.maintenance_requests(tenant_id,hotel_id,request_code,location,issue_type,title,description,
      status,reported_by,completed_at,actual_cost) VALUES($1,$2,$3,'Owned fixture','repair','Owned cost','Owned cost','completed',$4,$5,$6)`,
      [actor.tenantId,actor.hotelId,'RF-'+randomUUID(),actor.id,at,amount]);
  }
  for(const [at,cost]of [['2026-10-14T17:00:00Z',1000],['2026-10-15T16:59:59.999999Z',2000],['2026-10-15T17:00:00Z',4000]])
    await maintenance(a,at,cost);
  await maintenance(other,'2026-10-15T00:00:00Z',90000);await maintenance(b,'2026-10-15T00:00:00Z',100000);
  await maintenance(a,'2026-11-02T04:59:59.999999Z',1100);await maintenance(a,'2026-11-02T05:00:00Z',2200);
  const item=(await db.query("INSERT INTO public.items(tenant_id,hotel_id,code,name) VALUES($1,$2,$3,'Owned cost item') RETURNING id",
    [a.tenantId,a.hotelId,'RF-'+randomUUID()])).rows[0];
  for(const [category,value]of [['purchase',300],['return',9000]])await db.query(`INSERT INTO public.inventory_transactions(
    tenant_id,hotel_id,item_id,transaction_code,transaction_type,transaction_category,quantity,unit_price,total_value,
    quantity_before,quantity_after,created_by,transaction_date) VALUES($1,$2,$3,$4,'in',$5,1,$6,$6,0,1,$7,'2026-10-15T00:00:00Z')`,
    [a.tenantId,a.hotelId,item.id,'RF-'+randomUUID(),category,value,a.id]);
  const vendor=(await db.query("INSERT INTO public.laundry_vendors(tenant_id,code,name,type) VALUES($1,$2,'Owned laundry','external') RETURNING id",
    [a.tenantId,'RF-'+randomUUID()])).rows[0];
  for(const [actual,estimate,status]of [[500,999,'received'],[null,700,'washing'],[null,10000,'cancelled']])await db.query(`
    INSERT INTO public.laundry_batches(tenant_id,hotel_id,vendor_id,batch_code,delivery_date,total_weight_kg,total_items,actual_cost,estimated_cost,status)
    VALUES($1,$2,$3,$4,'2026-10-15T00:00:00Z',1,1,$5,$6,$7)`,
    [a.tenantId,a.hotelId,vendor.id,'RF-'+randomUUID(),actual,estimate,status]);
  await db.query(`INSERT INTO public.hotel_fixed_expenses(tenant_id,hotel_id,month,category,amount) VALUES
    ($1,$2,'2026-10-01','rent',31000),($1,$2,'2026-11-01','rent',30000),($1,$3,'2026-10-01','rent',310000)`,
    [a.tenantId,a.hotelId,other.hotelId]);
  stage='financial-read-and-export';
  const monthlyArgs={p_tenant_id:a.tenantId,p_months:12,p_hotel_id:a.hotelId};
  await denied('legacy-monthly-foreign-tenant-denied',()=>rpc('get_monthly_expenses',b,monthlyArgs));
  await denied('legacy-monthly-unassigned-hotel-denied',()=>rpc('get_monthly_expenses',staff,{...monthlyArgs,p_hotel_id:other.hotelId}));
  await denied('legacy-monthly-anonymous-denied',()=>rpc('get_monthly_expenses',input.publishableKey,monthlyArgs));
  await denied('legacy-monthly-machine-key-denied',()=>rpc('get_monthly_expenses',input.serviceKey,monthlyArgs));
  const monthly=(actor,extra={})=>rpc('get_monthly_expenses',actor,{...monthlyArgs,...extra});
  const nativeMonth=(await db.query(`SELECT to_char(date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh'),'YYYY-MM-DD') AS first,
    to_char(date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')+interval '1 month'-interval '1 day','YYYY-MM-DD') AS last`)).rows[0];
  const monthlyAllowed=await monthly(staff),monthlyFinancial=await finance(staff,{p_start_date:nativeMonth.first,p_end_date:nativeMonth.last});
  record('legacy-monthly-compatible-shape-matches-guarded-financial-costs',monthlyAllowed.status===200&&monthlyAllowed.data.length===12
    &&monthlyAllowed.data.at(-1).total===monthlyFinancial.data.summary.total_cost
    &&Object.keys(monthlyAllowed.data.at(-1)).sort().join(',')==='laundry,maintenance,month,purchase,total');
  for(const months of [0,-1,121,null])await denied('legacy-monthly-invalid-month-count-'+String(months),()=>monthly(staff,{p_months:months}),[400]);
  await db.query('UPDATE public.users SET hourly_wage_vnd=60000,monthly_salary_vnd=NULL WHERE id=$1',[a.id]);
  await db.query('UPDATE public.users SET hourly_wage_vnd=NULL,monthly_salary_vnd=12480000 WHERE id=$1',[staff.id]);
  await db.query('UPDATE public.users SET hourly_wage_vnd=90000,monthly_salary_vnd=NULL WHERE id=$1',[b.id]);
  async function shift(actor,user,at,hours=1){await db.query(`INSERT INTO public.shift_history(tenant_id,hotel_id,user_id,start_at,end_at)
    VALUES($1,$2,$3,$4::timestamptz,$4::timestamptz+make_interval(hours=>$5))`,[actor.tenantId,actor.hotelId,user,at,hours]);}
  for(const at of ['2026-10-14T17:00:00Z','2026-10-15T16:59:59.999999Z','2026-10-15T17:00:00Z'])await shift(a,a.id,at);
  await shift(a,staff.id,'2026-10-15T08:00:00Z',2);await shift(other,a.id,'2026-10-15T08:00:00Z');await shift(b,b.id,'2026-10-15T08:00:00Z');
  // Corrupt legacy tenant/user linkage must not import another tenant's wage.
  await shift(a,b.id,'2026-10-15T08:00:00Z');
  await shift(a,a.id,'2026-11-02T04:59:59.999999Z');await shift(a,a.id,'2026-11-02T05:00:00Z');
  const laborArgs={p_hotel_id:a.hotelId,p_start_date:'2026-10-15',p_end_date:'2026-10-15',p_timezone:'Asia/Ho_Chi_Minh'};
  const labor=(actor,extra={})=>rpc('get_labor_cost_scoped',actor,{...laborArgs,...extra});
  const legacyLabor={p_tenant_id:a.tenantId,p_hotel_id:a.hotelId,p_start_date:'2026-10-15',p_end_date:'2026-10-15'};
  const laborBefore=await snapshot(),laborDay=await labor(staff);
  record('labor-view-only-accountant-uses-current-assigned-hotels',laborDay.status===200&&laborDay.data.total_labor_cost===240000,{status:laborDay.status});
  record('labor-estimate-is-labeled-and-does-not-return-individual-wages',laborDay.status===200&&laborDay.data.method==='shift_start_duration_wage_estimate'
    &&laborDay.data.is_estimate===true&&laborDay.data.by_department.other===240000
    &&!('users' in laborDay.data)&&!('hourly_wage_vnd' in laborDay.data));
  record('labor-read-has-no-wage-shift-or-monetary-side-effects',laborBefore===await snapshot());
  const laborLegacy=await rpc('get_labor_cost',staff,legacyLabor);
  record('labor-four-argument-legacy-read-remains-compatible',laborLegacy.status===200&&laborLegacy.data.total_labor_cost===240000);
  const laborDst=await labor(staff,{p_start_date:'2026-11-01',p_end_date:'2026-11-01',p_timezone:'America/New_York'});
  record('labor-local-day-preserves-microsecond-and-dst-exclusive-end',laborDst.status===200&&laborDst.data.total_labor_cost===60000);
  const laborAll=await labor(staff,{p_hotel_id:null}),laborOwner=await labor(a,{p_hotel_id:null});
  record('labor-all-hotel-aggregation-is-assigned-only',laborAll.status===200&&laborAll.data.total_labor_cost===240000);
  record('labor-owner-only-aggregates-own-tenant',laborOwner.status===200&&laborOwner.data.total_labor_cost===300000);
  await denied('labor-legacy-foreign-tenant-denied',()=>rpc('get_labor_cost',b,legacyLabor));
  await denied('labor-legacy-unassigned-hotel-denied',()=>rpc('get_labor_cost',staff,{...legacyLabor,p_hotel_id:other.hotelId}));
  await denied('labor-scoped-unassigned-hotel-denied',()=>labor(staff,{p_hotel_id:other.hotelId}));
  await denied('labor-scoped-foreign-hotel-denied',()=>labor(staff,{p_hotel_id:b.hotelId}));
  await denied('labor-service-key-denied',()=>labor(input.serviceKey));
  await denied('labor-anonymous-denied',()=>labor(input.publishableKey));
  await denied('labor-legacy-service-key-denied',()=>rpc('get_labor_cost',input.serviceKey,legacyLabor));
  await denied('labor-invalid-timezone-denied',()=>labor(staff,{p_timezone:'Invalid/Zone'}),[400]);
  await denied('labor-reversed-dates-denied',()=>labor(staff,{p_end_date:'2026-10-14'}),[400]);
  await denied('labor-excessive-range-denied',()=>labor(staff,{p_start_date:'1900-01-01'}),[400]);
  const financeBefore=await snapshot(),day=await finance(staff);
  record('finance-read-only-accountant-uses-live-server-scope',day.status===200&&day.data.version===2,{status:day.status});
  assert.equal(day.status,200,'Scoped finance request');
  record('finance-half-open-local-day-keeps-last-microsecond',day.data.summary.maintenance_cost===3000);
  record('finance-purchase-only-and-laundry-actual-fallback',day.data.summary.purchase_cost===300&&day.data.summary.laundry_cost===1200&&day.data.summary.total_cost===4500);
  record('finance-cost-summary-legacy-alias-is-identical',JSON.stringify(day.data.summary)===JSON.stringify(day.data.cost_summary));
  record('finance-monthly-trend-clips-to-requested-days',day.data.monthly_trend.length===1&&day.data.monthly_trend[0].maintenance===3000&&day.data.monthly_trend[0].profit===195500);
  record('finance-partial-month-fixed-cost-is-labeled-estimate',day.data.fixed_cost_summary.allocated_amount===1000&&day.data.fixed_cost_summary.is_estimate===true
    &&day.data.fixed_cost_summary.method==='calendar_day_proration'&&day.data.profit_summary.after_allocated_fixed_cost===194500);
  const span=await finance(staff,{p_start_date:'2026-10-31',p_end_date:'2026-11-01'});
  record('finance-fixed-cost-crosses-months-without-whole-month-charge',span.status===200&&span.data.fixed_cost_summary.allocated_amount===2000&&span.data.monthly_trend.length===2);
  const dst=await finance(staff,{p_start_date:'2026-11-01',p_end_date:'2026-11-01',p_timezone:'America/New_York'});
  record('finance-dst-day-covers-25-hours-with-exclusive-end',dst.status===200&&dst.data.summary.maintenance_cost===1100);
  const month=await finance(staff,{p_start_date:'2026-10-01',p_end_date:'2026-10-31'});
  record('finance-recognized-fee-is-separate-from-room-and-cash',month.status===200&&month.data.revenue_summary.net_revenue===200000
    &&month.data.revenue_summary.no_show_fees===100000&&month.data.revenue_summary.recognized_revenue===300000
    &&month.data.revenue_summary.paid_revenue===200000&&month.data.profit_summary.net_profit===291500);
  const legacyAllowed=await rpc('get_financial_report',staff,legacyFinance);
  record('legacy-finance-four-argument-call-remains-compatible',legacyAllowed.status===200&&legacyAllowed.data.summary.total_cost===8500
    &&legacyAllowed.data.revenue_summary.recognized_revenue===300000);
  record('finance-reads-do-not-mutate-ledger-payments-or-commands',financeBefore===await snapshot());
  await denied('finance-explicit-unassigned-hotel-denied',()=>finance(staff,{p_hotel_id:other.hotelId}));
  await denied('finance-foreign-hotel-denied',()=>finance(staff,{p_hotel_id:b.hotelId}));
  const allFinance=await finance(staff,{p_hotel_id:null}),ownerFinance=await finance(a,{p_hotel_id:null});
  record('finance-all-hotels-means-live-assignments',allFinance.status===200&&allFinance.data.summary.total_cost===4500
    &&allFinance.data.fixed_cost_summary.allocated_amount===1000);
  record('finance-owner-own-tenant-only',ownerFinance.status===200&&ownerFinance.data.summary.total_cost===94500);
  await denied('finance-service-key-denied',()=>finance(input.serviceKey));
  await denied('finance-anon-denied',()=>finance(input.publishableKey));
  await denied('finance-invalid-timezone-denied',()=>finance(staff,{p_timezone:'Invalid/Zone'}),[400]);
  await denied('finance-reversed-dates-denied',()=>finance(staff,{p_end_date:'2026-10-14'}),[400]);
  await denied('finance-excessive-range-denied',()=>finance(staff,{p_start_date:'1900-01-01'}),[400]);
  await denied('finance-read-does-not-grant-export',()=>finance(staff,{p_for_export:true}));
  await denied('revenue-read-does-not-grant-export',()=>exportRevenue(staff));
  await denied('revenue-export-service-key-denied',()=>exportRevenue(input.serviceKey));
  await denied('revenue-export-anon-denied',()=>exportRevenue(input.publishableKey));
  await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'reports','export',true)",[staff.id,a.tenantId]);
  const exportBefore=await snapshot(),freshExport=await exportRevenue(staff),costExport=await finance(staff,{p_for_export:true});
  record('authorized-revenue-export-returns-fresh-scoped-data',freshExport.status===200&&freshExport.data.currentPeriod.netRevenue===200000&&freshExport.data.noShow.currentPeriod.retainedAmount===100000);
  record('authorized-financial-export-recomputes-same-DTO',costExport.status===200&&JSON.stringify(costExport.data)===JSON.stringify(day.data));
  record('export-data-requests-have-no-financial-side-effects',exportBefore===await snapshot());
  await denied('authorized-export-still-denies-unassigned-hotel',()=>exportRevenue(staff,{p_hotel_id:other.hotelId}));
  const exportGrantLock=await db.connect();
  try{
    await exportGrantLock.query('BEGIN');await exportGrantLock.query("SELECT id FROM public.user_permissions WHERE user_id=$1 AND action='export' FOR UPDATE",[staff.id]);
    const pending=exportRevenue(staff);await waitOnLock('export_revenue_report');
    await exportGrantLock.query("UPDATE public.user_permissions SET enabled=false WHERE user_id=$1 AND action='export'",[staff.id]);
    await exportGrantLock.query('COMMIT');const revoked=await pending;
    record('export-direct-grant-revoked-before-lock-is-denied',revoked.status===403,{status:revoked.status,realLockBarrier:true});
    races.push({kind:'export-direct-revocation',passed:revoked.status===403,realLockBarrier:true});
  }finally{await exportGrantLock.query('ROLLBACK');exportGrantLock.release();}
  await db.query("INSERT INTO public.roles(tenant_id,code,name) VALUES($1,'hotel_manager','Owned secondary role') ON CONFLICT(tenant_id,code) DO NOTHING",[a.tenantId]);
  const inherited=(await db.query(`SELECT r.id AS role_id,p.id AS permission_id FROM public.roles r CROSS JOIN public.permissions p
    WHERE r.code='hotel_manager' AND r.tenant_id=$1
      AND p.module='reports' AND p.action='export' ORDER BY r.tenant_id DESC LIMIT 1`,[a.tenantId])).rows[0];
  assert.ok(inherited,'Owned secondary role/export catalog');
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'hotel_manager')",[staff.id]);
  await db.query("INSERT INTO public.role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[inherited.role_id,inherited.permission_id]);
  const roleExport=await exportRevenue(staff);
  record('export-uses-effective-secondary-role-not-only-profile-role',roleExport.status===200);
  const inheritedLock=await db.connect();
  try{
    await inheritedLock.query('BEGIN');await inheritedLock.query('SELECT role_id FROM public.role_permissions WHERE role_id=$1 AND permission_id=$2 FOR UPDATE',[inherited.role_id,inherited.permission_id]);
    const pending=exportRevenue(staff);await waitOnLock('export_revenue_report');
    await inheritedLock.query('DELETE FROM public.role_permissions WHERE role_id=$1 AND permission_id=$2',[inherited.role_id,inherited.permission_id]);
    await inheritedLock.query('COMMIT');const revoked=await pending;
    record('export-secondary-role-grant-revocation-is-live',revoked.status===403,{status:revoked.status,realLockBarrier:true});
    races.push({kind:'export-secondary-role-revocation',passed:revoked.status===403,realLockBarrier:true});
  }finally{await inheritedLock.query('ROLLBACK');inheritedLock.release();await db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='hotel_manager'",[staff.id]);}
  await denied('cached-loaded-data-does-not-authorize-new-export',()=>finance(staff,{p_for_export:true}));
  const financialLock=await db.connect();
  try{
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.3 seconds' WHERE id=$1",[staff.sessionId]);
    await financialLock.query('BEGIN');await financialLock.query('SELECT id FROM public.hotels WHERE id=$1 FOR UPDATE',[a.hotelId]);
    const pending=finance(staff);await waitOnLock('get_financial_report_scoped');await db.query('SELECT pg_sleep(1.4)');await financialLock.query('COMMIT');
    const expired=await pending;record('finance-session-expires-during-hotel-lock',expired.status===403,{status:expired.status,realLockBarrier:true});
    races.push({kind:'financial-session-expiry',passed:expired.status===403,realLockBarrier:true});
  }finally{await financialLock.query('ROLLBACK');financialLock.release();await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[staff.sessionId]);}
  for(const [kind,callRead,functionName]of [['monthly-session-expiry',()=>monthly(staff),'get_monthly_expenses'],
    ['labor-session-expiry',()=>labor(staff),'get_labor_cost_scoped'],
    ['operations-session-expiry',()=>operations(staff),'get_operations_report_scoped']]){
    const held=await db.connect();try{
      await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.3 seconds' WHERE id=$1",[staff.sessionId]);
      await held.query('BEGIN');await held.query('SELECT id FROM public.hotels WHERE id=$1 FOR UPDATE',[a.hotelId]);
      const pending=callRead();await waitOnLock(functionName);await db.query('SELECT pg_sleep(1.4)');await held.query('COMMIT');
      const expired=await pending;record(kind+'-during-real-hotel-lock',expired.status===403,{status:expired.status,realLockBarrier:true});
      races.push({kind,passed:expired.status===403,realLockBarrier:true});
    }finally{await held.query('ROLLBACK');held.release();await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[staff.sessionId]);}
  }
  await db.query(`INSERT INTO public.room_bookings(tenant_id,hotel_id,room_id,guest_name,status,booking_type,check_in_date,check_out_date,
    room_price,subtotal,total_amount,amount_paid,payment_status,created_by,vat_rate,service_fee_rate)
    SELECT $1,$2,$3,'Owned aggregate stress','checked_out','daily','2026-10-20T00:00:00Z','2026-10-21T00:00:00Z',10,10,10,10,'paid',$4,0,0
      FROM generate_series(1,10020)`,[a.tenantId,a.hotelId,stayed.roomId,a.id]);
  const bulk=await report(staff);
  record('aggregate-is-not-truncated-by-data-api-or-10000-client-limit',bulk.status===200&&bulk.data.currentPeriod.bookingsCount===10021&&bulk.data.currentPeriod.paidRevenue===300200,
    {seededCompletedBookings:10021});
  stage='operations-aggregates';
  await db.query(`INSERT INTO public.maintenance_requests(tenant_id,hotel_id,request_code,location,issue_type,title,description,
    status,reported_by,completed_at,actual_cost) SELECT $1,$2,'OA-'||gen_random_uuid(),'Owned fixture','repair',
    'Owned bulk cost','Owned bulk cost','completed',$3,'2026-10-22T00:00:00Z',1 FROM generate_series(1,10020)`,[a.tenantId,a.hotelId,a.id]);
  const opsBefore=await snapshot(),ops=await operations(staff);
  record('operations-native-view-only-accountant',ops.status===200&&ops.data.version===1,{status:ops.status});
  assert.equal(ops.status,200,'Operations aggregate native request');
  record('operations-over-10000-bookings-uses-net-and-keeps-fees-separate',ops.data.current.room.bookingsCount===10021
    &&ops.data.current.room.netRevenue===300200&&ops.data.current.no_show.retainedAmount===100000
    &&ops.data.current.recognized_revenue===400200,{seededCompletedBookings:10021});
  record('operations-over-10000-costs-have-complete-profit',ops.data.current.cost_summary.total_cost===18520
    &&ops.data.current.net_profit===381680,{seededExtraMaintenance:10020});
  record('operations-cohort-nights-and-occupancy-have-distinct-denominators',ops.data.current.checkout_room_nights===10064
    &&ops.data.current.occupied_room_days===15&&ops.data.current.earned_checkout_count===10021);
  const roomInventory=Number((await db.query('SELECT count(*) AS n FROM public.rooms WHERE tenant_id=$1 AND hotel_id=$2',[a.tenantId,a.hotelId])).rows[0].n);
  record('operations-capacity-is-current-room-inventory-labeled-estimate',ops.data.capacity.total_rooms===roomInventory
    &&ops.data.capacity.total_rooms!==5&&ops.data.capacity.method==='current_registered_rooms'&&ops.data.capacity.is_estimate===true);
  record('operations-daily-fills-all-days-and-complete-source-sums',ops.data.daily.length===31&&ops.data.daily[0].date==='2026-10-01'
    &&ops.data.daily.at(-1).date==='2026-10-31'&&ops.data.daily.reduce((n,d)=>n+d.recognized_revenue,0)===400200
    &&ops.data.daily.reduce((n,d)=>n+d.total_cost,0)===18520&&ops.data.daily.reduce((n,d)=>n+d.net_profit,0)===381680);
  const d15=ops.data.daily.find(d=>d.date==='2026-10-15'),d21=ops.data.daily.find(d=>d.date==='2026-10-21'),d22=ops.data.daily.find(d=>d.date==='2026-10-22');
  record('operations-daily-uses-purchase-and-laundry-delivery-and-completion',d15.purchase_cost===300&&d15.laundry_cost===1200
    &&d15.maintenance_cost===3000&&d15.recognized_revenue===200000&&d21.room_net_revenue===100200&&d22.maintenance_cost===10020);
  // 14/10 17:00Z is the start of local 15/10, so all 3,000 belongs to that day.
  record('operations-local-midnight-and-zero-day',ops.data.daily.find(d=>d.date==='2026-10-14').total_cost===0
    &&d15.maintenance_cost===3000&&ops.data.daily.find(d=>d.date==='2026-10-02').recognized_revenue===0);
  record('operations-no-show-ledger-day-is-not-checkout-or-cash',ops.data.daily[0].no_show_fees===100000
    &&ops.data.current.no_show.cashMovement===0&&ops.data.previous.no_show.refundDueAmount===100000);
  record('operations-reads-have-no-financial-side-effects',opsBefore===await snapshot());
  const opsFinance=await finance(staff,{p_start_date:'2026-10-01',p_end_date:'2026-10-31'});
  record('operations-and-financial-report-share-recognition',opsFinance.status===200
    &&ops.data.current.recognized_revenue===opsFinance.data.revenue_summary.recognized_revenue
    &&JSON.stringify(ops.data.current.cost_summary)===JSON.stringify(opsFinance.data.cost_summary)
    &&ops.data.current.net_profit===opsFinance.data.profit_summary.net_profit);
  const opsAll=await operations(staff,{p_hotel_id:null}),opsOwner=await operations(a,{p_hotel_id:null});
  record('operations-all-hotels-means-live-assignments',opsAll.status===200&&opsAll.data.current.recognized_revenue===400200&&opsAll.data.capacity.total_rooms===roomInventory);
  record('operations-owner-aggregates-own-tenant-only',opsOwner.status===200&&opsOwner.data.current.recognized_revenue===425200
    &&opsOwner.data.current.cost_summary.total_cost===108520);
  await denied('operations-foreign-hotel-denied',()=>operations(staff,{p_hotel_id:b.hotelId}));
  await denied('operations-unassigned-hotel-denied',()=>operations(staff,{p_hotel_id:other.hotelId}));
  await denied('operations-anon-denied',()=>operations(input.publishableKey));
  await denied('operations-machine-key-denied',()=>operations(input.serviceKey));
  for(const [label,extra] of [['invalid-timezone',{p_timezone:'INVALID/ZONE'}],['null-timezone',{p_timezone:null}],
    ['reverse-current',{p_end_date:'2026-09-30'}],['null-current',{p_start_date:null}],['excessive-current',{p_start_date:'1900-01-01'}],
    ['partial-previous',{p_previous_start_date:'2026-09-01'}],['reverse-previous',{p_previous_start_date:'2026-09-02',p_previous_end_date:'2026-09-01'}],
    ['excessive-previous',{p_previous_start_date:'1900-01-01',p_previous_end_date:'2026-09-30'}],
    ['derived-out-of-bounds',{p_start_date:'1900-01-01',p_end_date:'1900-01-01'}]])
    await denied('operations-'+label,()=>operations(staff,extra),[400]);
  const explicit=await operations(staff,{p_previous_start_date:'2026-10-15',p_previous_end_date:'2026-10-15'});
  record('operations-explicit-previous-range-is-not-silently-replaced',explicit.status===200&&explicit.data.previous.period_start==='2026-10-15'
    &&explicit.data.previous.period_days===1&&explicit.data.previous.recognized_revenue===200000&&explicit.data.previous.cost_summary.total_cost===4500);
  const opsUtc=await operations(staff,{p_timezone:'UTC'}),opsDst=await operations(staff,{p_start_date:'2026-11-01',p_end_date:'2026-11-01',p_timezone:'America/New_York'});
  record('operations-timezone-moves-ledger-event-without-shifting-checkout-date',opsUtc.status===200&&opsUtc.data.current.no_show.retainedAmount===0
    &&opsUtc.data.current.room.netRevenue===300200);
  record('operations-dst-is-one-calendar-day-including-25-hour-window',opsDst.status===200&&opsDst.data.daily.length===1
    &&opsDst.data.current.period_days===1&&opsDst.data.current.cost_summary.maintenance_cost===1100&&opsDst.data.daily[0].total_cost===1100);
  const calendarOps=await operations(staff,{p_start_date:'2026-10-15',p_end_date:'2026-10-15',p_timezone:'America/New_York'});
  record('operations-calendar-checkout-is-not-utc-truncated',calendarOps.status===200&&calendarOps.data.current.room.netRevenue===200000);
  const leap=await operations(staff,{p_start_date:'2024-02-29',p_end_date:'2024-02-29'});
  record('operations-leap-yoy-has-inclusive-calendar-endpoints',leap.status===200&&leap.data.year_ago.period_start==='2023-02-28'
    &&leap.data.year_ago.period_end==='2023-02-28'&&leap.data.year_ago.period_days===1);
  const invalidDates=await operations(staff,{p_start_date:'2026-01-15',p_end_date:'2026-01-15'});
  record('operations-legacy-invalid-dates-flag-reconciliation-without-inventing-nights',invalidDates.status===200
    &&invalidDates.data.current.room.netRevenue===200000&&invalidDates.data.current.earned_checkout_count===1
    &&invalidDates.data.current.invalid_checkout_dates_count===1&&invalidDates.data.current.checkout_room_nights===0
    &&invalidDates.data.current.occupied_room_days===0);
  // Isolated fixture: finished stay spans the boundary; ongoing overlaps it;
  // same-day hourly/day-use shares a room. Neither refunds nor future/no-show
  // reservations may inflate occupancy, nights or earned revenue.
  const dec=await booking(a,'checked_out',{check_in_date:'2026-11-29',check_out_date:'2026-12-01',
    total_amount:100,net_revenue:80,ota_commission_amount:20,amount_paid:100,payment_status:'paid'});
  await booking(a,'confirmed',{check_in_date:'2026-11-30',check_out_date:'2026-12-03',total_amount:9000,net_revenue:9000});
  await db.query(`INSERT INTO public.room_bookings(tenant_id,hotel_id,room_id,guest_name,status,booking_type,check_in_date,check_out_date,
    total_amount,net_revenue,ota_commission_amount,payment_status,created_by) VALUES
    ($1,$2,$3,'Owned same-day','checked_out','hourly','2026-12-01','2026-12-01',50,40,10,'paid',$4),
    ($1,$2,$3,'Owned ongoing','checked_in','daily','2026-11-30','2026-12-03',700,700,0,NULL,$4),
    ($1,$2,$3,'Owned refunded','checked_out','daily','2026-12-01','2026-12-02',5000,5000,0,'refunded',$4),
    ($1,$2,$3,'Owned year ago','checked_out','daily','2025-11-30','2025-12-01',200,160,40,'paid',$4)`,[a.tenantId,a.hotelId,dec.roomId,a.id]);
  const decOps=await operations(staff,{p_start_date:'2026-12-01',p_end_date:'2026-12-02'});
  record('operations-yoy-uses-earned-net-after-commission-not-gross',decOps.status===200&&decOps.data.current.room.netRevenue===120
    &&decOps.data.year_ago.room.netRevenue===160&&decOps.data.current.recognized_revenue===120&&decOps.data.year_ago.recognized_revenue===160);
  record('operations-night-cohort-excludes-ongoing-confirmed-and-refunded',decOps.status===200&&decOps.data.current.checkout_room_nights===3
    &&decOps.data.current.earned_checkout_count===2&&decOps.data.current.room.bookingsCount===3);
  record('operations-occupancy-clips-cross-period-and-unions-same-room-day',decOps.status===200&&decOps.data.current.occupied_room_days===2
    &&decOps.data.previous.period_days===2&&decOps.data.previous.occupied_room_days===2);
  for(const status of ['sleep_out','skipper'])await booking(a,status,{check_in_date:'2026-12-01',check_out_date:'2026-12-03'});
  const flaggedOps=await operations(staff,{p_start_date:'2026-12-01',p_end_date:'2026-12-02'});
  record('operations-active-occupied-flags-hold-capacity-without-earned-checkout-revenue',flaggedOps.status===200
    &&flaggedOps.data.current.occupied_room_days===6&&flaggedOps.data.current.room.netRevenue===120
    &&flaggedOps.data.current.earned_checkout_count===2&&flaggedOps.data.current.checkout_room_nights===3);
  const opsGrantLock=await db.connect();try{
    await opsGrantLock.query('BEGIN');await opsGrantLock.query("SELECT id FROM public.user_permissions WHERE user_id=$1 AND module='reports' FOR UPDATE",[staff.id]);
    const pending=operations(staff);await waitOnLock('get_operations_report_scoped');
    await opsGrantLock.query("UPDATE public.user_permissions SET enabled=false WHERE user_id=$1 AND module='reports'",[staff.id]);
    await opsGrantLock.query('COMMIT');const revoked=await pending;
    record('operations-revocation-before-grant-lock-is-denied',revoked.status===403,{status:revoked.status,realLockBarrier:true});
    races.push({kind:'operations-grant-revocation',passed:revoked.status===403,realLockBarrier:true});
  }finally{await opsGrantLock.query('ROLLBACK');opsGrantLock.release();await db.query("UPDATE public.user_permissions SET enabled=true WHERE user_id=$1 AND module='reports'",[staff.id]);}
  const lock=await db.connect();
  try{
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.3 seconds' WHERE id=$1",[staff.sessionId]);
    await lock.query('BEGIN');await lock.query('SELECT id FROM public.hotels WHERE id=$1 FOR UPDATE',[a.hotelId]);
    const pending=report(staff,{p_hotel_id:a.hotelId});await waitOnLock();await db.query('SELECT pg_sleep(1.4)');await lock.query('COMMIT');
    const expired=await pending;record('session-expiry-after-real-hotel-lock-denies',expired.status===403,{status:expired.status,realLockBarrier:true});
    races.push({kind:'session-expiry',passed:expired.status===403,realLockBarrier:true});
  }finally{await lock.query('ROLLBACK');lock.release();await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[staff.sessionId]);}
  const grantLock=await db.connect();
  try{
    await grantLock.query('BEGIN');await grantLock.query("SELECT id FROM public.user_permissions WHERE user_id=$1 AND module='reports' FOR UPDATE",[staff.id]);
    const pending=report(staff);await waitOnLock();await grantLock.query("UPDATE public.user_permissions SET enabled=false WHERE user_id=$1 AND module='reports'",[staff.id]);
    await grantLock.query('COMMIT');const revoked=await pending;
    record('grant-revocation-before-reader-lock-denies',revoked.status===403,{status:revoked.status,realLockBarrier:true});
    races.push({kind:'grant-revocation',passed:revoked.status===403,realLockBarrier:true});
  }finally{await grantLock.query('ROLLBACK');grantLock.release();}
  await denied('missing-report-capability-denied',()=>report(staff));
  await denied('finance-revoked-view-capability-denied',()=>finance(staff));
  await denied('legacy-finance-revoked-view-capability-denied',()=>rpc('get_financial_report',staff,legacyFinance));
  await denied('legacy-monthly-revoked-view-capability-denied',()=>monthly(staff));
  await denied('labor-revoked-view-capability-denied',()=>labor(staff));
  await denied('operations-revoked-view-capability-denied',()=>operations(staff));
  await call('/auth/v1/user',staff.token,{data:{role:'owner',user_level_code:'tenant_owner',reports:true}},'PUT');
  await denied('user-metadata-cannot-grant-finance-authority',()=>report(staff));
  await db.query("UPDATE public.user_permissions SET enabled=true WHERE user_id=$1 AND module='reports'",[staff.id]);
  for(const [field,value,reset] of [['status','inactive','active'],['account_locked',true,false]]){
    await db.query('UPDATE public.users SET '+field+'=$2 WHERE id=$1',[staff.id,value]);
    await denied('live-'+field+'-denied',()=>report(staff));
    await denied('operations-live-'+field+'-denied',()=>operations(staff));
    await db.query('UPDATE public.users SET '+field+'=$2 WHERE id=$1',[staff.id,reset]);
  }
  await db.query('DELETE FROM public.user_hotels WHERE user_id=$1',[staff.id]);
  await denied('removed-assignment-explicit-hotel-denied',()=>report(staff,{p_hotel_id:a.hotelId}));
  await denied('finance-removed-assignment-explicit-hotel-denied',()=>finance(staff));
  await denied('monthly-removed-assignment-explicit-hotel-denied',()=>monthly(staff));
  await denied('labor-removed-assignment-explicit-hotel-denied',()=>labor(staff));
  await denied('operations-removed-assignment-explicit-hotel-denied',()=>operations(staff));
  const opsEmpty=await operations(staff,{p_hotel_id:null});
  record('operations-no-assignment-returns-zero-current-previous-yoy-and-days',opsEmpty.status===200&&opsEmpty.data.capacity.total_rooms===0
    &&['current','previous','year_ago'].every(k=>opsEmpty.data[k].recognized_revenue===0&&opsEmpty.data[k].occupied_room_days===0&&opsEmpty.data[k].cost_summary.total_cost===0)
    &&opsEmpty.data.daily.length===31&&opsEmpty.data.daily.every(d=>d.recognized_revenue===0&&d.total_cost===0));
  const monthlyEmpty=await monthly(staff,{p_hotel_id:null}),laborEmpty=await labor(staff,{p_hotel_id:null});
  record('monthly-and-labor-empty-assignment-return-no-data',monthlyEmpty.status===200&&monthlyEmpty.data.every(m=>m.total===0)
    &&laborEmpty.status===200&&laborEmpty.data.total_labor_cost===0);
  const emptyFinance=await finance(staff,{p_hotel_id:null});
  record('finance-no-assignment-returns-no-revenue-cost-or-fixed-budget',emptyFinance.status===200&&emptyFinance.data.summary.total_cost===0
    &&emptyFinance.data.revenue_summary.recognized_revenue===0&&emptyFinance.data.fixed_cost_summary.allocated_amount===0);
  const empty=await report(staff);
  record('removed-all-assignments-return-no-business-data',empty.status===200&&empty.data.currentPeriod.bookingsCount===0&&empty.data.noShow.currentPeriod.retainedAmount===0);
  const grants=(await db.query(`SELECT has_table_privilege('authenticated','private.booking_no_show_resolutions','SELECT') AS ledger,
    has_function_privilege('anon','public.get_revenue_report(uuid,text,date,date,date,text)','EXECUTE') AS anon,
    has_function_privilege('service_role','public.get_revenue_report(uuid,text,date,date,date,text)','EXECUTE') AS service,
    p.prosecdef AS public_definer FROM pg_proc p WHERE p.oid='public.get_revenue_report(uuid,text,date,date,date,text)'::regprocedure`)).rows[0];
  record('private-ledger-remains-private-and-public-wrapper-invoker',!grants.ledger&&!grants.anon&&!grants.service&&!grants.public_definer);
  const financialGrants=(await db.query(`SELECT p.prosecdef,
    has_function_privilege('anon',v.name,'EXECUTE') AS anon,
    has_function_privilege('service_role',v.name,'EXECUTE') AS service
    FROM (VALUES('public.get_financial_report(uuid,uuid,date,date)'),
      ('public.get_financial_report_scoped(date,date,uuid,text,boolean)'),
      ('public.export_revenue_report(date,date,uuid,text)')) v(name)
    JOIN pg_proc p ON p.oid=v.name::regprocedure`)).rows;
  record('finance-and-export-public-wrappers-are-invoker-and-deny-machine-keys',financialGrants.length===3&&financialGrants.every(g=>!g.prosecdef&&!g.anon&&!g.service));
  const monthlyLaborGrants=(await db.query(`SELECT p.prosecdef,
    has_function_privilege('anon',v.name,'EXECUTE') AS anon,
    has_function_privilege('service_role',v.name,'EXECUTE') AS service FROM (VALUES
      ('public.get_monthly_expenses(uuid,integer,uuid)'),('public.get_labor_cost(uuid,uuid,date,date)'),
      ('public.get_labor_cost_scoped(date,date,uuid,text)')) v(name) JOIN pg_proc p ON p.oid=v.name::regprocedure`)).rows;
  record('monthly-labor-public-wrappers-are-invoker-and-deny-machine-keys',monthlyLaborGrants.length===3&&monthlyLaborGrants.every(g=>!g.prosecdef&&!g.anon&&!g.service));
  const operationsGrants=(await db.query(`SELECT p.prosecdef,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('service_role',p.oid,'EXECUTE') AS service,
    has_function_privilege('authenticated','private.operations_period_summary(uuid,uuid[],date,date,text)','EXECUTE') AS period,
    has_function_privilege('authenticated','private.operations_daily_series(uuid,uuid[],date,date,text)','EXECUTE') AS daily
    FROM pg_proc p WHERE p.oid='public.get_operations_report_scoped(date,date,uuid,date,date,text)'::regprocedure`)).rows[0];
  record('operations-public-wrapper-invoker-and-private-helpers-not-granted',!operationsGrants.prosecdef&&!operationsGrants.anon
    &&!operationsGrants.service&&!operationsGrants.period&&!operationsGrants.daily);
  console.log(JSON.stringify({verified:checks.every(c=>c.passed),checks,races,
    aclFixture:{tenantId:a.tenantId,hotelId:a.hotelId,id:a.id,sessionId:a.sessionId}}));
}catch(e){console.log(JSON.stringify({verified:false,checks,races,stage,errorCode:/^[A-Z0-9_]{3,80}$/.test(e.code??'')?e.code:'REVENUE_NATIVE_ASSERTION'}));process.exitCode=1;}
finally{await db.end();}
