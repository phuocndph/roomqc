// RW5.7: persisted 564 data, separate transactional faults at 565 and 566.
// Standalone native client, executed only in the exact-owned private fixture.
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_BOOKING_FINANCE_UPGRADE_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);
assert.ok(['seed','rollback565','checkpoint565','rollback566','post'].includes(input.phase));
const expectedBaseMigration=Number(input.expectedBaseMigration??564);
const expectedTargetMigration=Number(input.expectedTargetMigration??566);
const db=new pg.Pool({host:'db',port:5432,database:'postgres',user:'postgres',password:input.databasePassword,
  max:5,statement_timeout:15000,connectionTimeoutMillis:4000});
const checks=[],races=[];let serial=0;
const record=(label,passed,details={})=>checks.push({label:'finance-upgrade-'+label,passed,actualNative:true,...details});
const digest=value=>createHash('sha256').update(value).digest('hex');
const email=label=>'finance-upgrade-'+input.run+'-'+label+'@roomqc.invalid';
const password=label=>createHmac('sha256',input.databasePassword).update('finance-upgrade:'+input.run+':'+label).digest('hex');
const date=days=>new Date(Date.now()+days*86400000).toISOString().slice(0,10);
async function call(path,token,body,method='POST'){
  const r=await fetch('http://127.0.0.1:8000'+path,{method,signal:AbortSignal.timeout(25000),
    headers:{apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},
    body:JSON.stringify(body)});let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};
}
const rpc=(name,actor,body={})=>call('/rest/v1/rpc/'+name,actor.token??actor,body);
async function insert(table,value){const r=await call('/rest/v1/'+table,input.serviceKey,value);
  assert.equal(r.status,201,'Owned finance-upgrade insert '+table+' code='+(/^[A-Z0-9]{5}$/.test(r.data?.code??'')?r.data.code:'NO_SAFE_CODE'));return r.data[0];}
async function login(label){const r=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:email(label),password:password(label)});
  assert.equal(r.status,200,'Owned finance-upgrade login');return r.data.access_token;}
async function owner(label){const created=await call('/auth/v1/admin/users',input.serviceKey,{email:email(label),password:password(label),email_confirm:true});
  assert.equal(created.status,200);const token=await login(label),id=created.data.id;
  const p=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:id,
    p_fields:{fullName:'Owned finance upgrade',phone:'0901234567',tenantName:'Owned finance upgrade',hotelName:'Owned finance upgrade',
      hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:email(label),totalRooms:3}});
  assert.equal(p.status,200);assert.equal(p.data.success,true);
  return{id,tenantId:p.data.tenant_id,hotelId:p.data.hotel_id,sessionId:JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id,token};
}
const publicActor=a=>({id:a.id,tenantId:a.tenantId,hotelId:a.hotelId,sessionId:a.sessionId});
async function fresh(a,status='confirmed',extra={}){
  const roomStatus=status==='checked_in'?'occupied_clean':['sleep_out','skipper'].includes(status)?status:'vacant_clean';
  const room=await insert('rooms',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,room_number:'FU-'+(++serial)+'-'+randomUUID().slice(0,6),room_type:'standard',floor:1,status:roomStatus});
  const book=await insert('room_bookings',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,room_id:room.id,guest_name:'Owned synthetic upgrade guest',
    check_in_date:date(-1),check_out_date:date(1),status,created_by:a.id,booking_type:'daily',room_price:200000,subtotal:200000,...extra});
  return{roomId:room.id,bookingId:book.id};
}
async function migrationCount(){return Number((await db.query('SELECT count(*) AS n FROM supabase_migrations.schema_migrations')).rows[0].n);}
async function oldSnapshot(seed){
  const ids=Object.values(seed.cases).map(v=>v.bookingId),rooms=Object.values(seed.cases).map(v=>v.roomId);
  return digest((await db.query(`SELECT jsonb_build_object(
    'bookings',(SELECT jsonb_agg(to_jsonb(b)-'booking_flag_room_status' ORDER BY id) FROM public.room_bookings b WHERE id=ANY($1::uuid[])),
    'rooms',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.rooms r WHERE id=ANY($2::uuid[])),
    'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.booking_payments p WHERE booking_id=ANY($1::uuid[])),
    'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.guest_invoices i WHERE booking_id=ANY($1::uuid[])),
    'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY actor_id,command_id) FROM private.booking_room_commands c WHERE booking_ids&&$1::uuid[]),
    'room_commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY actor_id,command_id) FROM private.workflow_room_transition_commands c WHERE room_id=ANY($2::uuid[])),
    'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM private.booking_notification_events e WHERE booking_id=ANY($1::uuid[])),
    'outbox',(SELECT jsonb_agg(to_jsonb(o) ORDER BY event_id,channel) FROM private.booking_notification_outbox o
      WHERE event_id IN(SELECT id FROM private.booking_notification_events WHERE booking_id=ANY($1::uuid[]))),
    'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY event_id,user_id) FROM private.booking_notification_receipts r
      WHERE event_id IN(SELECT id FROM private.booking_notification_events WHERE booking_id=ANY($1::uuid[]))),
    'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.audit_log a WHERE record_id=ANY($1::uuid[]) OR record_id=ANY($2::uuid[])),
    'trial',(SELECT jsonb_agg(jsonb_build_object('id',t.id,'policy',(SELECT jsonb_object_agg(key,value) FROM jsonb_each(to_jsonb(t))
      WHERE key~'trial|subscription|plan|^status$')) ORDER BY id) FROM public.tenants t WHERE id=ANY($3::uuid[]))
    )::text AS value`,[ids,rooms,[seed.owner.tenantId,seed.foreign.tenantId]])).rows[0].value);
}
async function newSnapshot(){return digest((await db.query(`SELECT jsonb_build_object(
  'bookings',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.room_bookings b),
  'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.booking_payments p),
  'resolutions',(SELECT jsonb_agg(to_jsonb(r) ORDER BY booking_id) FROM private.booking_no_show_resolutions r),
  'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY actor_id,command_id) FROM private.booking_room_commands c),
  'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.audit_log a))::text AS value`)).rows[0].value);}
const request=(f,refund=false,reason='Owned populated financial upgrade')=>({booking_id:f.bookingId,refund_deposit:refund,reason});
const resolve=(a,id,q)=>rpc('resolve_booking_no_show',a,{p_booking_id:q.booking_id,p_refund_deposit:q.refund_deposit,p_reason:q.reason,p_command_id:id});
const read=(a,f)=>rpc('get_booking_no_show_resolution',a,{p_booking_id:f.bookingId});
async function money(f){return(await db.query(`SELECT b.status,b.deposit_amount::float8,b.amount_paid::float8,r.status AS room_status,
  (SELECT count(*)::int FROM private.booking_no_show_resolutions n WHERE n.booking_id=b.id) AS resolutions,
  (SELECT COALESCE(sum(amount),0)::float8 FROM public.booking_payments p WHERE p.booking_id=b.id AND payment_status='completed') AS cash,
  (SELECT count(*)::int FROM public.booking_payments p WHERE p.booking_id=b.id) AS payment_rows,
  (SELECT count(*)::int FROM public.audit_log a WHERE record_id=b.id AND action='booking_transition') AS audit
  FROM public.room_bookings b JOIN public.rooms r ON r.id=b.room_id WHERE b.id=$1`,[f.bookingId])).rows[0];}
async function denial(label,fn,statuses=[403]){const before=await newSnapshot(),r=await fn(),unchanged=before===await newSnapshot();
  record(label,statuses.includes(r.status)&&unchanged,{status:r.status,effectsUnchanged:unchanged});return r;}
async function lockBarrier(name,expected=1){const deadline=Date.now()+6000;while(Date.now()<deadline){
  const n=(await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND wait_event_type='Lock' AND query LIKE $1",['%'+name+'%'])).rows[0].n;
  if(n>=expected)return;await new Promise(r=>setTimeout(r,20));}throw new Error('FINANCE_UPGRADE_REAL_LOCK_NOT_OBSERVED');}
try{
  if(input.phase==='seed'){
    const currentMigrations=await migrationCount();
    if(currentMigrations!==expectedBaseMigration){
      console.log(JSON.stringify({phase:input.phase,checks:[{label:'finance-upgrade-migration-chain',passed:false,status:'NOT RUN',reason:'MIGRATION_CHAIN_MOVED',expectedBaseMigration,actualMigrationCount:currentMigrations}],verified:false,status:'NOT RUN',productAcceptance:false}));
      await db.end();
      process.exitCode=2;
      process.exit();
    }
    record('seed-exact-migration564',currentMigrations===expectedBaseMigration,{expectedBaseMigration,currentMigrations});
    const a=await owner('a'),b=await owner('b'),seed={owner:publicActor(a),foreign:publicActor(b),cases:{}};
    for(const[name,status,extra]of [
      ['retain','confirmed',{deposit_amount:100000}],['refund','confirmed',{deposit_amount:100000,amount_paid:50000}],
      ['zero','confirmed',{deposit_amount:0}],['future','confirmed',{check_in_date:date(2),check_out_date:date(3)}],
      ['legacy_deposit','no_show',{deposit_amount:100000}],['legacy_zero','no_show',{deposit_amount:0}],
      ['cancelled','cancelled',{}],['checked_in','checked_in',{}],['sleep_out','sleep_out',{}],['skipper','skipper',{}],
      ['pending','confirmed',{deposit_amount:100000}],['checkout','checked_in',{}]
    ])seed.cases[name]=await fresh(a,status,extra);
    record('seed-retains-prior-legacy-statuses-with-no-resolution-schema',
      (await db.query("SELECT to_regclass('private.booking_no_show_resolutions') IS NULL AS absent")).rows[0].absent,
      {legacyStatusFixtures:4,seedViaNativeServiceRest:true});
    for(const[name,amount]of [['retain',100000],['refund',150000],['legacy_deposit',100000]])await insert('booking_payments',{
      tenant_id:a.tenantId,hotel_id:a.hotelId,booking_id:seed.cases[name].bookingId,amount,payment_method:'cash',payment_status:'completed',paid_at:new Date().toISOString(),created_by:a.id,metadata:{type:'owned_original_payment'}});
    const pending=await rpc('create_booking_payment_pending',a,{p_booking_id:seed.cases.pending.bookingId,p_tenant_id:a.tenantId,p_hotel_id:a.hotelId,p_amount:10000,p_payment_method:'cash'});
    assert.equal(pending.status,200);seed.pendingPaymentId=pending.data.id;
    const groupId=randomUUID();seed.cases.group_anchor=await fresh(a,'confirmed',{booking_group_id:groupId});seed.cases.group_member=await fresh(a,'confirmed',{booking_group_id:groupId});
    const group=await rpc('create_booking_payment_pending',a,{p_booking_id:seed.cases.group_anchor.bookingId,p_tenant_id:a.tenantId,p_hotel_id:a.hotelId,p_amount:300000,p_payment_method:'cash',
      p_metadata:{is_group_payment:true,booking_group_id:groupId,booking_ids:[seed.cases.group_anchor.bookingId,seed.cases.group_member.bookingId]}});
    assert.equal(group.status,200);seed.groupPaymentId=group.data.id;
    record('seed-real-old-pending-cash-and-group-api-requests',!!seed.pendingPaymentId&&!!seed.groupPaymentId,{requests:2});
    const q={p_booking_id:seed.cases.checkout.bookingId,p_room_id:seed.cases.checkout.roomId,p_subtotal:200000,p_command_id:randomUUID(),p_adjustment_notes:'Owned persisted pre-upgrade note'};
    const out=await rpc('perform_checkout',a,q);assert.equal(out.status,200);assert.ok(out.data.invoice_id&&out.data.notification_event_id);
    seed.checkout={request:q,invoiceId:out.data.invoice_id,eventId:out.data.notification_event_id};
    record('seed-real-old-checkout-invoice-notes-source-receipt',!!out.data.invoice_id&&!!out.data.notification_event_id);
    seed.oldHash=await oldSnapshot(seed);
    console.log(JSON.stringify({phase:input.phase,checks,verified:checks.every(c=>c.passed),fixture:seed,productAcceptance:false}));
  }else{
    const seed=input.seed;assert.ok(seed.owner?.id&&seed.cases?.retain&&seed.checkout?.invoiceId);
    record(input.phase+'-preserves-prior-business-money-notes-source-and-trial',await oldSnapshot(seed)===seed.oldHash);
    if(input.phase.startsWith('rollback')){
      const n=input.phase==='rollback565'?564:565;
      record(input.phase+'-history-unchanged',await migrationCount()===n,{migrations:n});
      record(input.phase+'-no-half-financial-ledger',(await db.query("SELECT to_regclass('private.booking_no_show_resolutions') IS NULL AS absent")).rows[0].absent);
      const column=(await db.query("SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.room_bookings'::regclass AND attname='booking_flag_room_status' AND NOT attisdropped) AS present")).rows[0].present;
      record(input.phase+'-flag-column-matches-committed-chain',column===(n===565));
      console.log(JSON.stringify({phase:input.phase,checks,verified:checks.every(c=>c.passed),productAcceptance:false}));
    }else if(input.phase==='checkpoint565'){
      record('intermediate-exact565-history',await migrationCount()===565);
      const a={...seed.owner,token:await login('a')},f=await fresh(a,'checked_in'),commandId=randomUUID();
      const q={p_booking_id:f.bookingId,p_to_status:'sleep_out',p_reason:'Owned intermediate565 command',p_amount_owed:null,p_command_id:commandId};
      const r=await rpc('transition_booking_flag',a,q);assert.equal(r.status,200);
      seed.intermediate={...f,commandId,request:q,result:r.data};
      record('intermediate565-actual-flag-command-committed',r.data.success===true&&r.data.status==='sleep_out');
      console.log(JSON.stringify({phase:input.phase,checks,verified:checks.every(c=>c.passed),fixture:seed,productAcceptance:false}));
    }else{
      record('post-exact566-history',await migrationCount()===566);
      record('post-does-not-backfill-legacy-resolution-or-command',Number((await db.query('SELECT count(*) AS n FROM private.booking_no_show_resolutions')).rows[0].n)===0);
      const a={...seed.owner,token:await login('a')},b={...seed.foreign,token:await login('b')};
      const replays=await Promise.all(Array.from({length:20},()=>rpc('perform_checkout',a,seed.checkout.request)));
      record('twenty-pre564-command-replays-keep-invoice-and-source',replays.every(r=>r.status===200&&r.data.replayed===true&&r.data.invoice_id===seed.checkout.invoiceId&&r.data.notification_event_id===seed.checkout.eventId),{requests:20});
      record('pre564-replay-preserves-all-original-row-snapshots',await oldSnapshot(seed)===seed.oldHash);
      const flag=await rpc('transition_booking_flag',a,seed.intermediate.request),flagLookup=await rpc('get_booking_room_command_result',a,{p_command_id:seed.intermediate.commandId});
      record('intermediate565-flag-receipt-and-replay-survive566',flag.status===200&&flagLookup.status===200&&flag.data.command_id===seed.intermediate.commandId&&flag.data.replayed===true&&flagLookup.data.workflow_event_id===seed.intermediate.result.workflow_event_id);
      const retained=seed.cases.retain,id=randomUUID(),q=request(retained),lock=await db.connect();let rr;
      try{await lock.query('BEGIN');await lock.query('SELECT id FROM public.room_bookings WHERE id=$1 FOR UPDATE',[retained.bookingId]);
        const pending=Array.from({length:20},()=>resolve(a,id,q));await lockBarrier('resolve_booking_no_show',2);await lock.query('COMMIT');rr=await Promise.all(pending);
      }finally{await lock.query('ROLLBACK');lock.release();}
      const m=await money(retained),result=rr[0]?.data;
      const retainPassed=rr.every(r=>r.status===200&&r.data.deposit_resolution?.id===result.deposit_resolution?.id)&&m.resolutions===1&&m.audit===1&&m.cash===100000&&m.payment_rows===1&&m.deposit_amount===100000&&m.amount_paid===0&&m.room_status==='vacant_clean'&&result.deposit_resolution?.retained_amount===100000&&result.deposit_resolution?.cash_movement===0;
      record('post-upgrade-twenty-retain-requests-one-resolution-original-cash',retainPassed,{requests:20,realLockBarrier:true});
      races.push({label:'finance-upgrade-post-upgrade-retain-real-lock',passed:retainPassed,realLockBarrier:true});
      const receipt=await rpc('get_booking_room_command_result',a,{p_command_id:id}),readback=await read(a,retained);
      record('post-upgrade-lookup-and-live-readback-stable',receipt.status===200&&readback.status===200&&receipt.data.deposit_resolution?.id===readback.data.id&&readback.data.id===result.deposit_resolution?.id);
      await denial('changed-financial-choice-conflicts',()=>resolve(a,id,request(retained,true)),[409]);
      const otherKey=await resolve(a,randomUUID(),q);record('different-key-reads-same-financial-resolution',otherKey.status===200&&otherKey.data.already_resolved===true&&otherKey.data.deposit_resolution?.id===result.deposit_resolution?.id);
      const refund=await resolve(a,randomUUID(),request(seed.cases.refund,true)),rm=await money(seed.cases.refund);
      record('post-upgrade-refund-due-preserves-other-prepayment-and-old-cash',refund.status===200&&refund.data.deposit_resolution?.decision==='refund_due'&&refund.data.deposit_resolution?.refund_due_amount===100000&&rm.cash===150000&&rm.amount_paid===50000&&rm.deposit_amount===100000&&rm.payment_rows===1&&refund.data.deposit_resolution?.cash_movement===0);
      const zero=await resolve(a,randomUUID(),request(seed.cases.zero)),zm=await money(seed.cases.zero);
      record('post-upgrade-zero-deposit-does-not-create-payment',zero.status===200&&zm.payment_rows===0&&zero.data.deposit_resolution?.retained_amount===0);
      await denial('future-booking-still-denied',()=>resolve(a,randomUUID(),request(seed.cases.future)),[409]);
      for(const name of ['legacy_deposit','legacy_zero']){
        await denial(name+'-requires-reconciliation',()=>resolve(a,randomUUID(),request(seed.cases[name])),[409]);
        const oldRead=await read(a,seed.cases[name]);record(name+'-readback-has-no-invented-classification',oldRead.status===200&&oldRead.data===null);
      }
      await denial('cancelled-stay-not-reclassified',()=>resolve(a,randomUUID(),request(seed.cases.cancelled)),[409]);
      await denial('foreign-owner-cannot-read-financial-decision',()=>read(b,retained));
      await denial('service-key-cannot-execute-financial-command',()=>resolve(input.serviceKey,randomUUID(),request(seed.cases.future)),[401,403]);
      await denial('anonymous-cannot-execute-financial-command',()=>resolve(input.publishableKey,randomUUID(),request(seed.cases.future)),[401,403]);
      for(const name of ['sleep_out','skipper']){
        const f=seed.cases[name],out=await rpc('perform_checkout',a,{p_booking_id:f.bookingId,p_room_id:f.roomId,p_subtotal:200000,p_command_id:randomUUID()});
        record('old-'+name+'-checkout-compatible-after-upgrade',out.status===200&&(await money(f)).status==='checked_out');
      }
      const terminal=await resolve(a,randomUUID(),request(seed.cases.pending));assert.equal(terminal.status,200);
      await denial('old-pending-cash-cannot-settle-after-no-show',()=>rpc('settle_booking_payment',a,{p_payment_id:seed.pendingPaymentId}),[400,409]);
      const groupTerminal=await resolve(a,randomUUID(),request(seed.cases.group_member));assert.equal(groupTerminal.status,200);
      await denial('old-group-pending-cannot-apply-money-to-no-show-member',()=>rpc('settle_booking_payment',a,{p_payment_id:seed.groupPaymentId}),[400,409]);
      const row=(await db.query('SELECT payment_status FROM public.booking_payments WHERE id=$1',[seed.groupPaymentId])).rows[0];
      record('old-group-failed-settlement-remains-pending',row.payment_status==='pending');
      const compatibility=await fresh(a,'confirmed',{deposit_amount:100000}),reason='Owned old client compatibility';
      const oldCalls=[];for(let i=0;i<2;i++)oldCalls.push(await rpc('mark_booking_no_show',a,{_booking_id:compatibility.bookingId,_reason:reason,_refund_deposit:false}));
      record('old-row-rpc-compatible-after-new-ledger-writes',oldCalls.every(r=>r.status===200&&r.data.status==='no_show')&&(await money(compatibility)).resolutions===1);
      const afterWrites=await newSnapshot();const oldAgain=await rpc('mark_booking_no_show',a,{_booking_id:compatibility.bookingId,_reason:reason,_refund_deposit:false});
      record('old-row-rpc-replay-does-not-erase-new-financial-ledger',oldAgain.status===200&&afterWrites===await newSnapshot());
      const transitionCase=await fresh(a,'confirmed',{deposit_amount:100000});
      const tr=[];for(let i=0;i<2;i++)tr.push(await rpc('transition_booking_status',a,{_booking_id:transitionCase.bookingId,_to_status:'no_show',_reason:reason}));
      const trRead=await read(a,transitionCase);
      record('old-transition-rpc-forwarding-compatible-with-financial-contract',tr.every(r=>r.status===200&&r.data.status==='no_show')&&trRead.data?.decision==='refund_due');
      await denial('old-transition-checked-out-bypass-still-blocked',()=>rpc('transition_booking_status',a,{_booking_id:seed.cases.checked_in.bookingId,_to_status:'checked_out'}),[409]);
      await denial('old-client-cannot-mutate-classified-money-via-service-rest',()=>call('/rest/v1/room_bookings?id=eq.'+retained.bookingId,input.serviceKey,{deposit_amount:200000},'PATCH'),[409]);
      const flagAgain=await rpc('transition_booking_flag',a,seed.intermediate.request);
      record('old565-flag-command-survives-subsequent566-money-writes',flagAgain.status===200&&flagAgain.data.replayed===true);
      const retainedAgain=await resolve(a,id,q);
      record('new-financial-receipt-survives-legacy-interface-use',retainedAgain.status===200&&retainedAgain.data.deposit_resolution?.id===result.deposit_resolution?.id&&(await money(retained)).payment_rows===1);
      console.log(JSON.stringify({phase:input.phase,checks,races,verified:checks.every(c=>c.passed)&&races.every(c=>c.passed),
        priorMigrations:expectedBaseMigration,targetMigrations:expectedTargetMigration,oldInterfaceCompatibilityOnly:true,actualOldBinaryRollback:false,destructiveDownMigrationAttempted:false,
        realProviderCalled:false,productAcceptance:false}));
    }
  }
}finally{await db.end();}
