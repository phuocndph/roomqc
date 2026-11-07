// RW5 baseline through native Auth/REST in the owned disposable fixture.
// A red assertion describes an open contract; it must not be waived to pass.
async function bookingFlagBaselineChecks({a,b,manager,other,db,record,races,rpc,room,booking,checkout,checkin,snapshot,lockBarrier,account,insert}) {
  const rec=(label,passed,details={})=>record('booking-flag-'+label,passed,{actualNative:true,...details});
  const flag=(actor,book,to,extra={})=>rpc('transition_booking_status',actor,{_booking_id:book.id,_to_status:to,_reason:'Owned RW5 baseline',...extra});
  const noShow=(actor,book,refund=true)=>rpc('mark_booking_no_show',actor,{_booking_id:book.id,_reason:'Owned RW5 overdue',_refund_deposit:refund});
  const effects=async()=>JSON.stringify([await snapshot(),(await db.query('SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY id),\'[]\'::jsonb)::text AS value FROM public.booking_payments p')).rows[0].value]);
  const state=async(book)=> (await db.query(`SELECT b.status AS booking_status,r.status AS room_status,
    (SELECT count(*)::int FROM private.workflow_room_transition_commands c WHERE c.room_id=r.id AND c.event_id IS NOT NULL) AS room_events,
    (SELECT count(*)::int FROM public.guest_invoices i WHERE i.booking_id=b.id) AS invoices,
    (SELECT count(*)::int FROM private.booking_no_show_resolutions p WHERE p.booking_id=b.id AND p.retained_amount>0) AS no_show_fees,
    (SELECT count(*)::int FROM private.booking_no_show_resolutions p WHERE p.booking_id=b.id) AS no_show_resolutions
    FROM public.room_bookings b JOIN public.rooms r ON r.id=b.room_id WHERE b.id=$1`,[book.id])).rows[0];
  const fresh=async(status='checked_in',hotel=a.hotelId)=>{
    const r=await room(a,hotel,status==='checked_in'?'occupied_clean':'vacant_clean');return {r,book:await booking(a,r,status)};
  };
  const deny=async(label,action)=>{
    const before=await effects(),res=await action(),unchanged=before===await effects();
    rec(label,[400,401,403,409].includes(res.status)&&unchanged,{status:res.status,effectsUnchanged:unchanged,
      serverCode:/^[A-Z0-9]{5}$/.test(res.data?.code??'')?res.data.code:null});return res;
  };
  const staff=await account('rw5-no-capability');
  await insert('users',{id:staff.id,email:staff.email,full_name:'Owned RW5 staff',tenant_id:a.tenantId,hotel_id:a.hotelId,
    role:'staff',user_level_code:'staff',status:'active',created_by:a.id,must_change_password:false,account_locked:false});
  await insert('user_roles',{user_id:staff.id,role:'staff'});
  await insert('user_hotels',{user_id:staff.id,hotel_id:a.hotelId,assigned_by:a.id});
  await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'bookings','update',false),($1,$2,'bookings','manage',false)",[staff.id,a.tenantId]);
  const authority=(await db.query("SELECT public.has_user_permission($1,'bookings','update') AS can_update,public.has_user_permission($1,'bookings','manage') AS can_manage",[staff.id])).rows[0];
  rec('staff-negative-fixture-has-no-booking-capability',authority.can_update===false&&authority.can_manage===false);

  const coherentRoom=await room(a),coherentBooking=await booking(a,coherentRoom);
  const entered=await checkin(a,coherentBooking,coherentRoom),beforeFlag=await state(coherentBooking);
  rec('canonical-checkin-positive-fixture',entered.status===200&&beforeFlag.booking_status==='checked_in'&&beforeFlag.room_status==='occupied_clean',{status:entered.status});
  const slept=await flag(a,coherentBooking,'sleep_out'),afterFlag=await state(coherentBooking);
  rec('owner-sleep-out-positive',slept.status===200&&afterFlag.booking_status==='sleep_out'&&afterFlag.room_status==='sleep_out',{status:slept.status});
  rec('sleep-out-creates-canonical-room-source',afterFlag.room_events===beforeFlag.room_events+1,{beforeEvents:beforeFlag.room_events,afterEvents:afterFlag.room_events});
  const audit=(await db.query("SELECT old_data,new_data FROM public.audit_log WHERE record_id=$1 AND table_name='room_bookings' AND action='booking_transition' ORDER BY created_at DESC,id DESC LIMIT 1",[coherentBooking.id])).rows[0];
  rec('audit-preserves-actual-old-and-new-status',audit?.old_data?.state==='checked_in'&&audit?.new_data?.state==='sleep_out',
    {oldStatus:audit?.old_data?.state??null,newStatus:audit?.new_data?.state??null});
  const cleared=await flag(a,coherentBooking,'checked_in'),afterClear=await state(coherentBooking);
  rec('clear-sleep-out-restores-room-occupancy',cleared.status===200&&afterClear.booking_status==='checked_in'&&afterClear.room_status==='occupied_clean',
    {status:cleared.status,bookingStatus:afterClear.booking_status,roomStatus:afterClear.room_status});

  for(const status of ['checked_out','cancelled','no_show']){
    const f=await fresh(status==='checked_out'?'checked_in':'confirmed');
    await deny('staff-without-capability-'+status+'-denied',()=>flag(staff,f.book,status));
  }
  const deniedFlag=await fresh();await deny('staff-without-capability-sleep-out-denied',()=>flag(staff,deniedFlag.book,'sleep_out'));
  const unassigned=await fresh('confirmed',other.id);await deny('unassigned-hotel-cancel-denied',()=>flag(manager,unassigned.book,'cancelled'));
  const foreign=await fresh('confirmed');await deny('foreign-tenant-cancel-denied',()=>flag(b,foreign.book,'cancelled'));
  const locked=await fresh('confirmed');
  await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]);
  try{await deny('locked-owner-cancel-denied',()=>flag(a,locked.book,'cancelled'));}
  finally{await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);}
  const expired=await fresh('confirmed');
  await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=$1",[a.sessionId]);
  try{await deny('expired-live-session-cancel-denied',()=>flag(a,expired.book,'cancelled'));}
  finally{await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);}
  const inactive=await fresh('confirmed',other.id);
  await db.query("UPDATE public.hotels SET status='inactive' WHERE id=$1",[other.id]);
  try{await deny('inactive-hotel-owner-cancel-denied',()=>flag(a,inactive.book,'cancelled'));}
  finally{await db.query("UPDATE public.hotels SET status='active' WHERE id=$1",[other.id]);}

  const legacy=await fresh(),beforeLegacy=await effects(),legacyResult=await flag(a,legacy.book,'checked_out'),legacyState=await state(legacy.book);
  const legacyNoEffects=beforeLegacy===await effects();
  rec('legacy-checkout-cannot-bypass-checkout-core',([400,401,403,409].includes(legacyResult.status)&&legacyNoEffects)
    ||(legacyResult.status===200&&legacyState.booking_status==='checked_out'&&legacyState.room_status==='vacant_dirty'&&legacyState.invoices===1&&legacyState.room_events===1),
    {status:legacyResult.status,effectsUnchanged:legacyNoEffects,bookingStatus:legacyState.booking_status,roomStatus:legacyState.room_status,invoices:legacyState.invoices,roomEvents:legacyState.room_events});
  for(const kind of ['sleep_out','skipper']){
    const f=await fresh(),set=await flag(a,f.book,kind),out=await checkout(a,f.book,f.r),s=await state(f.book);
    rec(kind+'-can-finish-via-canonical-checkout',set.status===200&&out.status===200&&s.booking_status==='checked_out'&&s.room_status==='vacant_dirty'&&s.invoices===1,
      {flagStatus:set.status,checkoutStatus:out.status,bookingStatus:s.booking_status,roomStatus:s.room_status,invoices:s.invoices});
  }
  const dnd=await fresh();await db.query("UPDATE public.rooms SET status='dnd' WHERE id=$1",[dnd.r.id]);
  await deny('dnd-room-flag-cannot-desynchronise-booking',()=>flag(a,dnd.book,'sleep_out'));
  const negative=await fresh();await deny('negative-skipper-debt-rejected',()=>flag(a,negative.book,'skipper',{_amount_owed:-1}));

  // A genuine blocked SQL call; the session expires while its booking lock is held.
  const raceFixture=await fresh('confirmed'),lock=await db.connect();
  try{
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1",[a.sessionId]);
    const before=await effects();await lock.query('BEGIN');await lock.query('SELECT id FROM public.room_bookings WHERE id=$1 FOR UPDATE',[raceFixture.book.id]);
    const pending=flag(a,raceFixture.book,'cancelled');await lockBarrier('transition_booking_status');await db.query('SELECT pg_sleep(1.6)');
    await lock.query('COMMIT');const res=await pending,unchanged=before===await effects(),passed=[401,403].includes(res.status)&&unchanged;
    rec('session-expiry-after-real-lock-denied',passed,{status:res.status,effectsUnchanged:unchanged,realLockBarrier:true});
    races.push({label:'booking-flag-session-expiry-after-real-lock-denied',passed,realLockBarrier:true});
  }finally{await lock.query('ROLLBACK');lock.release();await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);}

  const fault=await fresh(),beforeFault=await effects();
  await db.query(`CREATE FUNCTION private.owned_rw5_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.record_id='${fault.book.id}'::uuid AND NEW.action='booking_transition' THEN RAISE EXCEPTION 'OWNED_RW5_FAULT'; END IF;RETURN NEW;END;$f$;
    CREATE TRIGGER owned_rw5_fault BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION private.owned_rw5_fault()`);
  let faultResult;try{faultResult=await flag(a,fault.book,'sleep_out');}
  finally{await db.query('DROP TRIGGER owned_rw5_fault ON public.audit_log;DROP FUNCTION private.owned_rw5_fault()');}
  const faultUnchanged=beforeFault===await effects();rec('audit-fault-rolls-back-booking-room-and-audit',faultResult.status>=400&&faultUnchanged,{status:faultResult.status,effectsUnchanged:faultUnchanged});
  const recovered=await flag(a,fault.book,'sleep_out');rec('audit-fault-recovery-positive',recovered.status===200,{status:recovered.status});

  const overdue=async()=>{const r=await room(a);return booking(a,r,'confirmed',{check_in_date:new Date(Date.now()-86400000).toISOString().slice(0,10),deposit_amount:100000});};
  const ns=await overdue(),beforeRetained=await effects();
  // The old broken implementation failed accidentally at a payment CHECK.
  // Deliberately fault the new classification write to retain rollback proof
  // after the positive path is fixed, rather than requiring a successful call to fail.
  await db.query(`CREATE FUNCTION private.owned_no_show_resolution_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.booking_id='${ns.id}'::uuid THEN RAISE EXCEPTION 'OWNED_NO_SHOW_RESOLUTION_FAULT'; END IF;RETURN NEW;END;$f$;
    CREATE TRIGGER owned_no_show_resolution_fault BEFORE INSERT ON private.booking_no_show_resolutions FOR EACH ROW EXECUTE FUNCTION private.owned_no_show_resolution_fault()`);
  let failedRetained;try{failedRetained=await noShow(a,ns,false);}
  finally{await db.query('DROP TRIGGER owned_no_show_resolution_fault ON private.booking_no_show_resolutions;DROP FUNCTION private.owned_no_show_resolution_fault()');}
  rec('no-show-retained-deposit-error-has-no-partial-effects',failedRetained.status>=400&&beforeRetained===await effects(),{status:failedRetained.status,effectsUnchanged:beforeRetained===await effects(),deliberateFault:true});
  const first=await noShow(a,ns,false),firstState=await state(ns);
  rec('no-show-owner-overdue-retained-deposit-positive',first.status===200&&firstState.booking_status==='no_show'&&firstState.no_show_fees===1,
    {status:first.status,bookingStatus:firstState.booking_status,noShowFees:firstState.no_show_fees,
      serverCode:/^[A-Z0-9]{5}$/.test(first.data?.code??'')?first.data.code:null});
  const noFee=await overdue(),noFeeFirst=await noShow(a,noFee,true),noFeeState=await state(noFee);
  rec('no-show-owner-overdue-without-fee-positive',noFeeFirst.status===200&&noFeeState.booking_status==='no_show'&&noFeeState.no_show_fees===0,
    {status:noFeeFirst.status,bookingStatus:noFeeState.booking_status,noShowFees:noFeeState.no_show_fees});
  const beforeReplay=await effects(),replay=await noShow(a,noFee,true),replayUnchanged=beforeReplay===await effects();
  rec('no-show-retry-returns-stable-outcome-without-new-fee',noFeeFirst.status===200&&replay.status===200&&replay.data?.id===noFeeFirst.data?.id&&replayUnchanged,
    {firstStatus:noFeeFirst.status,status:replay.status,effectsUnchanged:replayUnchanged,noShowFees:(await state(noFee)).no_show_fees});
  const future=await fresh('confirmed');await db.query("UPDATE public.room_bookings SET check_in_date=(current_date+2),check_out_date=(current_date+3) WHERE id=$1",[future.book.id]);
  await deny('legacy-no-show-cannot-bypass-overdue-policy',()=>flag(a,future.book,'no_show'));
  const lockedNs=await overdue();await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]);
  try{await deny('active-no-show-locked-owner-denied',()=>noShow(a,lockedNs,true));}
  finally{await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);}
  const concurrent=await overdue(),nsLock=await db.connect();
  try{
    await nsLock.query('BEGIN');await nsLock.query('SELECT id FROM public.room_bookings WHERE id=$1 FOR UPDATE',[concurrent.id]);
    const pending=[noShow(a,concurrent,false),noShow(a,concurrent,false)];let observed=false;
    try{await lockBarrier('mark_booking_no_show',2);observed=true;}
    catch(error){if(error.message!=='ROOM_WRITER_LOCK_BARRIER_NOT_OBSERVED')throw error;}
    await nsLock.query('COMMIT');const results=await Promise.all(pending),s=await state(concurrent);
    rec('concurrent-no-show-reaches-two-real-lock-waits',observed,{statuses:results.map(x=>x.status),realLockBarrier:observed,
      serverCodes:results.map(x=>/^[A-Z0-9]{5}$/.test(x.data?.code??'')?x.data.code:null)});
    const passed=observed&&results.every(x=>x.status===200)&&results[0].data.id===results[1].data.id&&s.no_show_fees===1&&s.no_show_resolutions===1&&s.booking_status==='no_show';
    rec('concurrent-no-show-keeps-one-fee',passed,{statuses:results.map(x=>x.status),noShowFees:s.no_show_fees,realLockBarrier:observed});
    if(observed)races.push({label:'booking-flag-concurrent-no-show-keeps-one-fee',passed,realLockBarrier:true});
  }finally{await nsLock.query('ROLLBACK');nsLock.release();}
  const concurrentNoFee=await overdue(),noFeeLock=await db.connect();
  try{
    await noFeeLock.query('BEGIN');await noFeeLock.query('SELECT id FROM public.room_bookings WHERE id=$1 FOR UPDATE',[concurrentNoFee.id]);
    const pending=[noShow(a,concurrentNoFee,true),noShow(a,concurrentNoFee,true)];let observed=false;
    try{await lockBarrier('mark_booking_no_show',2);observed=true;}
    catch(error){if(error.message!=='ROOM_WRITER_LOCK_BARRIER_NOT_OBSERVED')throw error;}
    await noFeeLock.query('COMMIT');const results=await Promise.all(pending),s=await state(concurrentNoFee);
    const passed=observed&&results.every(x=>x.status===200)&&s.no_show_fees===0&&s.no_show_resolutions===1&&s.booking_status==='no_show';
    rec('concurrent-no-show-without-fee-serializes-booking',passed,{statuses:results.map(x=>x.status),noShowFees:s.no_show_fees,realLockBarrier:observed});
    if(observed)races.push({label:'booking-flag-concurrent-no-show-without-fee-serializes-booking',passed,realLockBarrier:true});
  }finally{await noFeeLock.query('ROLLBACK');noFeeLock.release();}
  await bookingFlagCommandChecks({a,b,manager,other,staff,db,record,races,rpc,room,booking,effects,state,fresh,lockBarrier,account,insert});
  await bookingNoShowCommandChecks({a,b,manager,other,staff,db,record,races,rpc,room,booking,effects,state,lockBarrier,insert});
}

async function bookingNoShowCommandChecks({a,b,manager,other,staff,db,record,races,rpc,room,booking,effects,state,lockBarrier,insert}) {
  const rec=(label,passed,details={})=>record('booking-no-show-command-'+label,passed,{actualNative:true,...details});
  const fresh=async(actor=a,hotel=actor.hotelId,extra={})=>{const r=await room(actor,hotel);return {r,book:await booking(actor,r,'confirmed',{
    check_in_date:new Date(Date.now()-86400000).toISOString().slice(0,10),deposit_amount:100000,amount_paid:0,room_price:200000,...extra})};};
  const q=(f,refund=false)=>({booking_id:f.book.id,refund_deposit:refund,reason:'Owned financial no-show'});
  const run=(actor,id,request)=>rpc('resolve_booking_no_show',actor,{p_booking_id:request.booking_id,p_refund_deposit:request.refund_deposit,p_reason:request.reason,p_command_id:id});
  const cancel=(actor,id,request)=>rpc('cancel_booking_room_command',actor,{p_operation:'no_show',p_command_id:id,p_request:request});
  const lookup=(actor,id)=>rpc('get_booking_room_command_result',actor,{p_command_id:id});
  const read=(actor,f)=>rpc('get_booking_no_show_resolution',actor,{p_booking_id:f.book.id});
  const deny=async(label,action,statuses=[403])=>{const before=await effects(),r=await action(),unchanged=before===await effects();rec(label,statuses.includes(r.status)&&unchanged,{status:r.status,effectsUnchanged:unchanged});return r;};
  const ledger=async f=>(await db.query(`SELECT r.deposit_amount::float8,r.amount_paid::float8,r.retained_amount::float8,r.refund_due_amount::float8,r.cash_movement::float8,
    (SELECT count(*)::int FROM public.booking_payments p WHERE p.booking_id=r.booking_id) AS payment_rows,
    (SELECT COALESCE(sum(amount),0)::float8 FROM public.booking_payments p WHERE p.booking_id=r.booking_id AND payment_status='completed') AS cash_total,
    (SELECT count(*)::int FROM public.audit_log a WHERE a.record_id=r.booking_id AND a.action='booking_transition') AS audit
    FROM private.booking_no_show_resolutions r WHERE r.booking_id=$1`,[f.book.id])).rows[0];
  const f=await fresh(),id=randomUUID(),request=q(f);
  await insert('booking_payments',{tenant_id:a.tenantId,hotel_id:a.hotelId,booking_id:f.book.id,amount:100000,payment_method:'cash',payment_status:'completed',paid_at:new Date().toISOString(),created_by:a.id,metadata:{type:'owned_original_deposit'}});
  const lock=await db.connect();let results;
  try{await lock.query('BEGIN');await lock.query('SELECT id FROM public.room_bookings WHERE id=$1 FOR UPDATE',[f.book.id]);
    const pending=Array.from({length:20},()=>run(a,id,request));await lockBarrier('resolve_booking_no_show',2);await lock.query('COMMIT');results=await Promise.all(pending);
  }finally{await lock.query('ROLLBACK');lock.release();}
  const l=await ledger(f),s=await state(f.book),r0=results[0].data;
  const passed=results.every(r=>r.status===200&&r.data?.command_id===id&&r.data?.deposit_resolution?.id===r0.deposit_resolution.id)
    &&s.booking_status==='no_show'&&s.no_show_resolutions===1&&l.retained_amount===100000&&l.refund_due_amount===0&&l.cash_movement===0&&l.cash_total===100000&&l.payment_rows===1&&l.audit===1;
  rec('twenty-same-key-retains-original-cash-once',passed,{requests:20,retainedAmount:l.retained_amount,cashTotal:l.cash_total,cashMovement:l.cash_movement,paymentRows:l.payment_rows,audit:l.audit,realLockBarrier:true});
  races.push({label:'booking-no-show-command-twenty-same-key-retains-original-cash-once',passed,realLockBarrier:true});
  rec('retained-deposit-preserves-booking-money-and-room',r0.booking.deposit_amount===100000&&r0.booking.amount_paid===0&&s.room_status==='vacant_clean'&&s.room_events===0&&r0.room_status_changed===false,{roomEvents:s.room_events});
  await deny('same-key-different-money-decision-conflicts',()=>run(a,id,q(f,true)),[409]);
  const beforeReplay=await effects(),replayed=await run(a,id,request),got=await lookup(a,id);
  rec('replay-and-lookup-same-financial-snapshot',replayed.status===200&&got.status===200&&got.data?.deposit_resolution?.id===r0.deposit_resolution.id&&got.data?.replayed===true&&beforeReplay===await effects(),{effectsUnchanged:beforeReplay===await effects()});
  const readback=await read(a,f);rec('live-authorized-financial-readback',readback.status===200&&readback.data?.id===r0.deposit_resolution.id&&readback.data?.cash_movement===0,{status:readback.status});
  await deny('foreign-financial-readback-denied',()=>read(b,f));await deny('staff-without-capability-readback-denied',()=>read(staff,f));
  const foreignLookup=await lookup(b,id);rec('foreign-command-lookup-isolated',foreignLookup.status===200&&foreignLookup.data===null,{status:foreignLookup.status});
  const second=await run(a,randomUUID(),request);rec('different-key-same-business-resolution-is-stable',second.status===200&&second.data?.already_resolved===true&&second.data?.deposit_resolution?.id===r0.deposit_resolution.id&&(await ledger(f)).audit===1,{status:second.status});
  await deny('different-key-cannot-change-existing-decision',()=>run(a,randomUUID(),q(f,true)),[409]);
  const committedBefore=await effects(),committedCancel=await cancel(a,id,request);rec('commit-wins-cancellation-without-financial-change',committedCancel.status===200&&committedCancel.data?.success===true&&committedBefore===await effects(),{status:committedCancel.status,effectsUnchanged:committedBefore===await effects()});
  const refund=await fresh(),refundResult=await run(a,randomUUID(),q(refund,true)),rl=await ledger(refund);
  rec('refund-choice-records-liability-without-executed-refund',refundResult.status===200&&rl.refund_due_amount===100000&&rl.retained_amount===0&&rl.cash_movement===0&&rl.payment_rows===0&&refundResult.data?.deposit_resolution?.decision==='refund_due',{status:refundResult.status,refundDue:rl.refund_due_amount,cashMovement:rl.cash_movement,paymentRows:rl.payment_rows});
  const zero=await fresh(a,a.hotelId,{deposit_amount:0}),zeroResult=await run(a,randomUUID(),q(zero));rec('zero-deposit-produces-no-fake-fee',zeroResult.status===200&&(await ledger(zero)).retained_amount===0&&(await ledger(zero)).payment_rows===0,{status:zeroResult.status});
  for(const [name,actor,hotel]of [['foreign',b,a.hotelId],['no-capability',staff,a.hotelId],['unassigned',manager,other.id]]){
    const denied=await fresh(a,hotel);await deny(name+'-writer-denied',()=>run(actor,randomUUID(),q(denied)));
  }
  const cancelled=await fresh(),cid=randomUUID(),cq=q(cancelled),stopped=await cancel(a,cid,cq),afterStop=await effects(),late=await run(a,cid,cq);
  rec('pre-cancel-fences-late-no-show-writer',stopped.status===200&&stopped.data?.state==='cancelled'&&late.status===200&&late.data?.state==='cancelled'
    &&afterStop===await effects()&&(await state(cancelled.book)).booking_status==='confirmed'&&(await state(cancelled.book)).no_show_resolutions===0,{effectsUnchanged:afterStop===await effects()});
  const future=await fresh(a,a.hotelId,{check_in_date:new Date(Date.now()+172800000).toISOString().slice(0,10),check_out_date:new Date(Date.now()+259200000).toISOString().slice(0,10)});
  await deny('future-arrival-denied-at-server',()=>run(a,randomUUID(),q(future)),[409]);
  const legacyRoom=await room(a),legacy={r:legacyRoom,book:await booking(a,legacyRoom,'no_show',{deposit_amount:100000})};
  await deny('legacy-no-show-not-silently-reclassified',()=>run(a,randomUUID(),q(legacy)),[409]);
  const fault=await fresh(),faultId=randomUUID(),faultQ=q(fault),faultBefore=await effects();
  await db.query(`CREATE FUNCTION private.owned_no_show_receipt_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.command_id='${faultId}'::uuid THEN RAISE EXCEPTION 'OWNED_NO_SHOW_RECEIPT_FAULT'; END IF;RETURN NEW;END;$f$;
    CREATE TRIGGER owned_no_show_receipt_fault BEFORE INSERT ON private.booking_room_commands FOR EACH ROW EXECUTE FUNCTION private.owned_no_show_receipt_fault()`);
  let failed;try{failed=await run(a,faultId,faultQ);}finally{await db.query('DROP TRIGGER owned_no_show_receipt_fault ON private.booking_room_commands;DROP FUNCTION private.owned_no_show_receipt_fault()');}
  rec('receipt-fault-rolls-back-booking-ledger-and-audit',failed.status>=400&&faultBefore===await effects(),{status:failed.status,effectsUnchanged:faultBefore===await effects()});
  const recovered=await run(a,faultId,faultQ);rec('same-key-recovers-after-receipt-rollback',recovered.status===200&&(await ledger(fault)).audit===1,{status:recovered.status});
  const cross=await fresh(),one=randomUUID(),two=randomUUID(),crossLock=await db.connect();
  try{await crossLock.query('BEGIN');await crossLock.query('SELECT id FROM public.room_bookings WHERE id=$1 FOR UPDATE',[cross.book.id]);
    const pending=[run(a,one,q(cross)),run(manager,two,q(cross))];await lockBarrier('resolve_booking_no_show',2);await crossLock.query('COMMIT');const rr=await Promise.all(pending),ll=await ledger(cross);
    const passed=rr.every(r=>r.status===200)&&rr[0].data.deposit_resolution.id===rr[1].data.deposit_resolution.id&&ll.audit===1&&(await state(cross.book)).no_show_resolutions===1;
    rec('two-actors-two-keys-one-financial-resolution',passed,{statuses:rr.map(r=>r.status),audit:ll.audit,realLockBarrier:true});races.push({label:'booking-no-show-command-two-actors-two-keys-one-financial-resolution',passed,realLockBarrier:true});
  }finally{await crossLock.query('ROLLBACK');crossLock.release();}
  const pending=await fresh(),payment=await insert('booking_payments',{tenant_id:a.tenantId,hotel_id:a.hotelId,booking_id:pending.book.id,amount:100000,payment_method:'cash',payment_status:'pending',created_by:a.id});
  const terminal=await run(a,randomUUID(),q(pending));assert.equal(terminal.status,200);
  await deny('pending-cash-settlement-cannot-charge-terminal-no-show',()=>rpc('settle_booking_payment',a,{p_payment_id:payment.id}),[400,409]);
  await deny('new-payment-request-cannot-charge-terminal-no-show',()=>rpc('create_booking_payment_pending',a,{p_booking_id:pending.book.id,p_tenant_id:a.tenantId,p_hotel_id:a.hotelId,p_amount:100000,p_payment_method:'cash'}),[409]);
  const raw=async(path,method,body)=>{const r=await fetch('http://127.0.0.1:8000/rest/v1/'+path,{method,headers:{apikey:input.publishableKey,authorization:'Bearer '+input.serviceKey,'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify(body)});return{status:r.status};};
  await deny('raw-service-cannot-change-classified-deposit',()=>raw('room_bookings?id=eq.'+f.book.id,'PATCH',{deposit_amount:200000}),[409]);
  await deny('raw-service-cannot-reopen-financially-terminal-booking',()=>raw('room_bookings?id=eq.'+f.book.id,'PATCH',{status:'confirmed'}),[409]);
  await deny('raw-service-cannot-insert-second-cash-receipt',()=>raw('booking_payments','POST',{tenant_id:a.tenantId,hotel_id:a.hotelId,booking_id:f.book.id,amount:100000,payment_method:'cash',payment_status:'completed'}),[409]);
  const differentRoom=await room(a);
  await deny('raw-service-cannot-move-a-classified-booking-to-another-room',()=>raw('room_bookings?id=eq.'+f.book.id,'PATCH',{room_id:differentRoom.id}),[409]);
  await deny('anonymous-no-show-execution-denied',()=>run(input.publishableKey,randomUUID(),q(f)),[401,403]);
  await deny('service-key-no-show-execution-denied',()=>run(input.serviceKey,randomUUID(),q(f)),[401,403]);
  await deny('malformed-no-show-cancellation-denied',()=>cancel(a,randomUUID(),{...q(f),refund_deposit:'true'}),[400]);
  const legacyStop=await fresh(),legacyReason='Owned legacy terminal fence',legacyId=(await db.query("SELECT md5('roomqc:legacy-no-show:'||$1::text)::uuid AS id",[legacyStop.book.id])).rows[0].id;
  const stoppedLegacy=await cancel(a,legacyId,{booking_id:legacyStop.book.id,refund_deposit:true,reason:legacyReason});assert.equal(stoppedLegacy.status,200);
  await deny('legacy-row-api-does-not-report-null-success-after-terminal-cancel',()=>rpc('mark_booking_no_show',a,{_booking_id:legacyStop.book.id,_reason:legacyReason,_refund_deposit:true}),[409]);
  const legacyMismatch=await fresh(b,b.hotelId);
  await db.query(`INSERT INTO private.booking_no_show_resolutions(booking_id,tenant_id,hotel_id,room_id,actor_id,session_id,command_id,
    decision,deposit_amount,amount_paid,retained_amount,refund_due_amount,request,booking_snapshot,recorded_at)
    SELECT $1,tenant_id,hotel_id,room_id,actor_id,session_id,command_id,decision,deposit_amount,amount_paid,retained_amount,
      refund_due_amount,request,booking_snapshot,recorded_at FROM private.booking_no_show_resolutions WHERE booking_id=$2`,[legacyMismatch.book.id,f.book.id]);
  const quarantined=await read(b,legacyMismatch);
  rec('legacy-ledger-scope-mismatch-does-not-leak-another-tenant-finances',quarantined.status===200&&quarantined.data===null,{status:quarantined.status,sqlSeedOnly:true});
  const expiry=await fresh(),expiryLock=await db.connect();
  try{
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1",[a.sessionId]);
    const before=await effects();await expiryLock.query('BEGIN');await expiryLock.query('SELECT id FROM public.room_bookings WHERE id=$1 FOR UPDATE',[expiry.book.id]);
    const pending=run(a,randomUUID(),q(expiry));await lockBarrier('resolve_booking_no_show');await db.query('SELECT pg_sleep(1.6)');await expiryLock.query('COMMIT');const r=await pending;
    const passed=r.status===403&&before===await effects();rec('expiry-after-real-booking-lock-denies-all-financial-effects',passed,{status:r.status,effectsUnchanged:before===await effects(),realLockBarrier:true});races.push({label:'booking-no-show-command-expiry-after-real-booking-lock-denies-all-financial-effects',passed,realLockBarrier:true});
  }finally{await expiryLock.query('ROLLBACK');expiryLock.release();await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);}
  const nativeApp=await fresh(),appKey=randomUUID(),storage=operationTabStorage();let lose=true;
  const client=RoomQCOperationCaller.createRoomOperationClient({endpoint:'http://127.0.0.1:8000',publishableKey:input.publishableKey,storage:()=>storage,
    newId:()=>appKey,getSession:async()=>({data:{session:{access_token:a.token,user:{id:a.id}}},error:null}),fetch:async(url,options)=>{
      const response=await fetch(url,options);if(lose&&String(url).endsWith('/resolve_booking_no_show')){await response.text();throw new Error('OWNED_RESPONSE_LOSS');}return response;
    }});
  const context={actorId:a.id,sessionId:a.sessionId,tenantId:a.tenantId,runtime:'owned-no-show-'+input.run};let unknownCode;
  try{await client.save(context,'resolve_booking_no_show',{p_booking_id:nativeApp.book.id,p_refund_deposit:false,p_reason:'Owned actual app recovery'},{roomIds:[nativeApp.r.id]});}
  catch(error){unknownCode=error.code;}
  rec('actual-app-client-retains-key-after-committed-response-loss',unknownCode==='outcome_unknown'&&client.pending(context).length===1&&(await state(nativeApp.book)).no_show_resolutions===1,{pending:client.pending(context).length});
  lose=false;const recoveredApp=await client.recover(context,appKey),appLedger=await ledger(nativeApp);
  rec('actual-app-client-recovers-same-verified-financial-receipt',recoveredApp.command_id===appKey&&recoveredApp.replayed===true&&client.pending(context).length===0&&appLedger.audit===1&&appLedger.payment_rows===0,{audit:appLedger.audit,paymentRows:appLedger.payment_rows,pending:client.pending(context).length,actualApplicationClient:true});
}

async function bookingFlagCommandChecks({a,b,manager,other,staff,db,record,races,rpc,room,booking,effects,state,fresh,lockBarrier,account,insert}) {
  const rec=(label,passed,details={})=>record('booking-flag-command-'+label,passed,{actualNative:true,...details});
  const request=(f,to='sleep_out')=>({booking_id:f.book.id,to_status:to,reason:'Owned command flag',amount_owed:null});
  const run=(actor,id,q)=>rpc('transition_booking_flag',actor,{p_booking_id:q.booking_id,p_to_status:q.to_status,p_reason:q.reason,p_amount_owed:q.amount_owed,p_command_id:id});
  const cancel=(actor,id,q)=>rpc('cancel_booking_room_command',actor,{p_command_id:id,p_operation:'booking_flag',p_request:q});
  const lookup=(actor,id)=>rpc('get_booking_room_command_result',actor,{p_command_id:id});
  const denied=async(label,action,statuses=[401,403,409])=>{const before=await effects(),r=await action(),unchanged=before===await effects();rec(label,statuses.includes(r.status)&&unchanged,{status:r.status,effectsUnchanged:unchanged});return r;};
  const f=await fresh(),id=randomUUID(),q=request(f),lock=await db.connect();
  let many,observed=false;
  try{
    await lock.query('BEGIN');await lock.query('SELECT id FROM public.room_bookings WHERE id=$1 FOR UPDATE',[f.book.id]);
    const pending=Array.from({length:20},()=>run(a,id,q));await lockBarrier('transition_booking_flag',2);observed=true;
    await lock.query('COMMIT');many=await Promise.all(pending);
  }finally{await lock.query('ROLLBACK');lock.release();}
  const s=await state(f.book),audit=(await db.query("SELECT count(*)::int AS n FROM public.audit_log WHERE record_id=$1 AND action='booking_transition'",[f.book.id])).rows[0].n;
  const passed=many.every(r=>r.status===200&&r.data?.command_id===id&&r.data?.operation==='booking_flag'&&r.data?.booking?.status==='sleep_out')
    &&s.booking_status==='sleep_out'&&s.room_status==='sleep_out'&&s.room_events===1&&audit===1;
  rec('twenty-same-key-one-booking-room-source-audit',passed,{requests:20,roomEvents:s.room_events,audit,realLockBarrier:observed});
  races.push({label:'booking-flag-command-twenty-same-key-one-booking-room-source-audit',passed,realLockBarrier:observed});
  await denied('same-key-different-payload-conflict',()=>run(a,id,{...q,reason:'Different intent'}),[409]);
  const got=await lookup(a,id),foreign=await lookup(b,id);
  rec('lookup-same-snapshot-and-foreign-isolation',got.status===200&&got.data?.command_id===id&&got.data?.booking?.status==='sleep_out'&&got.data?.replayed===true&&foreign.status===200&&foreign.data===null,{status:got.status,foreignStatus:foreign.status});
  const beforeCancel=await effects(),lateCancel=await cancel(a,id,q);
  rec('committed-outcome-wins-over-cancellation',lateCancel.status===200&&lateCancel.data?.success===true&&lateCancel.data?.command_id===id&&beforeCancel===await effects(),{status:lateCancel.status,effectsUnchanged:beforeCancel===await effects()});
  const cf=await fresh(),cid=randomUUID(),cq=request(cf),before=await effects(),cancelled=await cancel(a,cid,cq);
  const afterCancel=await effects(),late=await run(a,cid,cq),cs=await state(cf.book);
  rec('terminal-cancellation-blocks-late-writer',cancelled.status===200&&cancelled.data?.state==='cancelled'&&late.status===200&&late.data?.state==='cancelled'
    &&afterCancel===await effects()&&cs.booking_status==='checked_in'&&cs.room_status==='occupied_clean'&&cs.room_events===0,{cancelStatus:cancelled.status,writerStatus:late.status,effectsUnchanged:afterCancel===await effects()});
  rec('cancellation-only-adds-terminal-command',before!==afterCancel&&cs.room_events===0,{roomEvents:cs.room_events});
  const staffF=await fresh();await denied('staff-without-capability-denied',()=>run(staff,randomUUID(),request(staffF)));
  const foreignF=await fresh();await denied('foreign-tenant-denied',()=>run(b,randomUUID(),request(foreignF)));
  const unassigned=await fresh('checked_in',other.id);await denied('unassigned-hotel-denied',()=>run(manager,randomUUID(),request(unassigned)));
  const front=await account('rw5-authorized-front');
  await insert('users',{id:front.id,email:front.email,full_name:'Owned RW5 front office',tenant_id:a.tenantId,hotel_id:a.hotelId,
    role:'staff',user_level_code:'staff',status:'active',created_by:a.id,must_change_password:false,account_locked:false});
  await insert('user_roles',{user_id:front.id,role:'staff'});await insert('user_hotels',{user_id:front.id,hotel_id:a.hotelId,assigned_by:a.id});
  await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'bookings','update',true)",[front.id,a.tenantId]);
  const ff=await fresh(),frontFlag=await run(front,randomUUID(),request(ff)),frontClear=await run(front,randomUUID(),request(ff,'checked_in'));
  rec('assigned-staff-with-booking-capability-can-flag-and-clear',frontFlag.status===200&&frontClear.status===200&&(await state(ff.book)).room_status==='occupied_clean',{flagStatus:frontFlag.status,clearStatus:frontClear.status});
  const sf=await fresh();await denied('staff-skipper-role-boundary',()=>run(front,randomUUID(),request(sf,'skipper')),[403]);
  const mf=await fresh(),managerFlag=await run(manager,randomUUID(),request(mf,'skipper'));
  rec('assigned-manager-skipper-positive',managerFlag.status===200&&(await state(mf.book)).room_status==='skipper',{status:managerFlag.status});
  const dirty=await fresh();await db.query("UPDATE public.rooms SET status='occupied_dirty' WHERE id=$1",[dirty.r.id]);
  const dirtyFlag=await run(a,randomUUID(),request(dirty)),dirtyClear=await run(a,randomUUID(),request(dirty,'checked_in'));
  rec('clear-preserves-dirty-occupancy',dirtyFlag.status===200&&dirtyClear.status===200&&(await state(dirty.book)).room_status==='occupied_dirty',{flagStatus:dirtyFlag.status,clearStatus:dirtyClear.status});
  const legacy=await fresh();await db.query('ALTER TABLE public.room_bookings DISABLE TRIGGER trg_sync_room_status_on_booking_flag');
  try{await db.query("UPDATE public.room_bookings SET status='sleep_out' WHERE id=$1;",[legacy.book.id]);await db.query("UPDATE public.rooms SET status='sleep_out' WHERE id=$1",[legacy.r.id]);}
  finally{await db.query('ALTER TABLE public.room_bookings ENABLE TRIGGER trg_sync_room_status_on_booking_flag');}
  const oldClear=await run(a,randomUUID(),request(legacy,'checked_in'));
  rec('legacy-flag-without-cleanliness-proof-restores-dirty',oldClear.status===200&&(await state(legacy.book)).room_status==='occupied_dirty',{status:oldClear.status});
  const mismatch=await fresh(),guardBefore=await effects();let directCode=null;
  try{await db.query("UPDATE public.room_bookings SET status='sleep_out' WHERE id=$1",[mismatch.book.id]);}
  catch(e){directCode=e.code;}
  rec('uncoordinated-direct-flag-write-is-rejected',directCode==='42501'&&guardBefore===await effects(),{sqlstate:directCode,effectsUnchanged:guardBefore===await effects(),sqlActorAssumptionOnly:true});
  const spoof=await db.connect();let spoofCode=null;
  try{
    await spoof.query('BEGIN');await spoof.query("SELECT set_config('request.jwt.claims',$1,true),set_config('roomqc.booking_flag_command',$2,true)",[JSON.stringify({sub:a.id,role:'authenticated',session_id:a.sessionId}),id]);
    await spoof.query("UPDATE public.room_bookings SET status='skipper' WHERE id=$1",[f.book.id]);
  }catch(e){spoofCode=e.code;}finally{await spoof.query('ROLLBACK');spoof.release();}
  rec('completed-receipt-guc-cannot-authorize-another-write',spoofCode==='42501'&&(await state(f.book)).booking_status==='sleep_out',{sqlstate:spoofCode,sqlActorAssumptionOnly:true});
  const fault=await fresh(),faultId=randomUUID(),faultQ=request(fault),faultBefore=await effects();
  await db.query(`CREATE FUNCTION private.owned_rw5_result_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.command_id='${faultId}'::uuid AND NEW.result->>'success'='true' THEN RAISE EXCEPTION 'OWNED_RW5_RESULT_FAULT'; END IF;RETURN NEW;END;$f$;
    CREATE TRIGGER owned_rw5_result_fault BEFORE UPDATE ON private.booking_room_commands FOR EACH ROW EXECUTE FUNCTION private.owned_rw5_result_fault()`);
  let failed;try{failed=await run(a,faultId,faultQ);}finally{await db.query('DROP TRIGGER owned_rw5_result_fault ON private.booking_room_commands;DROP FUNCTION private.owned_rw5_result_fault()');}
  rec('final-receipt-fault-rolls-back-all-effects',failed.status>=400&&faultBefore===await effects(),{status:failed.status,effectsUnchanged:faultBefore===await effects()});
  const recovered=await run(a,faultId,faultQ);rec('same-key-recovers-after-rolled-back-receipt-fault',recovered.status===200&&(await state(fault.book)).room_events===1,{status:recovered.status});
  const race=await fresh('checked_in',other.id),raceLock=await db.connect();
  try{
    const before=await effects();await raceLock.query('BEGIN');await raceLock.query('SELECT id FROM public.rooms WHERE id=$1 FOR UPDATE',[race.r.id]);
    const pending=run(a,randomUUID(),request(race));await lockBarrier('transition_booking_flag');
    await db.query("UPDATE public.hotels SET status='inactive' WHERE id=$1",[other.id]);await raceLock.query('COMMIT');const r=await pending;
    const passed=r.status===403&&before===await effects();rec('inactive-hotel-after-real-room-lock-denied',passed,{status:r.status,effectsUnchanged:before===await effects(),realLockBarrier:true});
    races.push({label:'booking-flag-command-inactive-hotel-after-real-room-lock-denied',passed,realLockBarrier:true});
  }finally{await raceLock.query('ROLLBACK');raceLock.release();await db.query("UPDATE public.hotels SET status='active' WHERE id=$1",[other.id]);}
  const reservation=await fresh('confirmed'),oldRoom=(await state(reservation.book)).room_status;
  const can=await rpc('cancel_booking',a,{p_booking_id:reservation.book.id,p_room_id:reservation.r.id,p_reason:'Owned legitimate cancel',p_refund_deposit:false});
  rec('canonical-cancel-reservation-preserves-room',can.status===200&&(await state(reservation.book)).booking_status==='cancelled'&&(await state(reservation.book)).room_status===oldRoom,{status:can.status});
  const deniedCancel=await fresh('confirmed');await denied('cancel-rpc-enforces-booking-capability',()=>rpc('cancel_booking',staff,{p_booking_id:deniedCancel.book.id}));
  const rawRest=async(actor,method,path,body)=>{
    const r=await fetch('http://127.0.0.1:8000/rest/v1/'+path,{method,signal:AbortSignal.timeout(25000),
      headers:{apikey:input.publishableKey,authorization:'Bearer '+(actor.token??actor),'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify(body)});
    return {status:r.status};
  };
  for(const actor of [a,staff,input.serviceKey]){
    const raw=await fresh();await denied('raw-rest-'+(actor===a?'owner':actor===staff?'staff':'service')+'-cannot-bypass-checkout',()=>rawRest(actor,'PATCH','room_bookings?id=eq.'+raw.book.id,{status:'checked_out'}),[403]);
  }
  const meta=await fresh(),metaFlag=await run(a,randomUUID(),request(meta));assert.equal(metaFlag.status,200);
  await denied('raw-rest-cannot-forge-flag-cleanliness',()=>rawRest(a,'PATCH','room_bookings?id=eq.'+meta.book.id,{booking_flag_room_status:'occupied_dirty'}),[403]);
  const rawRoom=await room(a,a.hotelId,'occupied_clean');
  const rawBooking={id:randomUUID(),tenant_id:a.tenantId,hotel_id:a.hotelId,room_id:rawRoom.id,guest_name:'Owned raw status fixture',
    check_in_date:new Date().toISOString().slice(0,10),check_out_date:new Date(Date.now()+86400000).toISOString().slice(0,10),created_by:a.id,booking_type:'daily',status:'checked_in'};
  await denied('raw-rest-staff-cannot-create-active-stay',()=>rawRest(staff,'POST','room_bookings',rawBooking),[403]);
  await denied('raw-rest-service-cannot-seed-protected-cleanliness',()=>rawRest(input.serviceKey,'POST','room_bookings',{...rawBooking,id:randomUUID(),status:'sleep_out',booking_flag_room_status:'occupied_clean'}),[403]);
}
