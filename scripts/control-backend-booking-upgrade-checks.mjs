// Two-phase native rehearsal: persisted migration563 data, then real migration564.
// Run only inside the exact-owned private vendor fixture, never a serving DB.
import assert from 'node:assert/strict';
import {createHash,createHmac,createECDH,randomBytes,randomUUID} from 'node:crypto';
import http from 'node:http';
import pg from '/control/node_modules/pg/lib/index.js';
import {BookingNotificationWorker} from '/control/workers/booking-notification-worker.mjs';
import {BookingExternalWorker} from '/control/workers/booking-external-worker.mjs';
import {createNotificationTransport,createWebPushBookingAdapter,createTelegramBookingAdapter} from '/control/booking-notification-providers.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_BOOKING_UPGRADE_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(['seed','rollback','post'].includes(input.phase));
const connection={host:'db',port:5432,database:'postgres'},checks=[];
const db=new pg.Pool({...connection,user:'postgres',password:input.databasePassword,max:4,statement_timeout:12000,connectionTimeoutMillis:3000});
const record=(label,passed,details={})=>checks.push({label,passed,...details});
const digest=value=>createHash('sha256').update(value).digest('hex');
const email='upgrade-'+input.run+'@roomqc.invalid',password=createHmac('sha256',input.databasePassword).update('booking-upgrade:'+input.run).digest('hex');
async function call(path,token,body){const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',signal:AbortSignal.timeout(20000),
  headers:{apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify(body)});
  let data;try{data=await r.json()}catch{data=null}return {status:r.status,data}}
const rpc=(name,token,body={})=>call('/rest/v1/rpc/'+name,token,body);
const insert=async(table,body)=>{const r=await call('/rest/v1/'+table,input.serviceKey,body);const code=/^[A-Z0-9]{5,12}$/.test(r.data?.code??'')?r.data.code:'NO_SAFE_CODE';
  assert.equal(r.status,201,'Owned upgrade insert '+table+' code='+code);return r.data[0]};
const login=async()=>{const r=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(r.status,200,'Owned upgrade login');return r.data.access_token};
async function migrationCount(){return Number((await db.query('SELECT count(*) AS n FROM supabase_migrations.schema_migrations')).rows[0].n)}
async function legacySnapshot(seed){
  const ids=seed.commands.map(c=>c.bookingId),events=seed.commands.map(c=>c.eventId),commands=seed.commands.map(c=>c.commandId),rooms=seed.commands.map(c=>c.roomId);
  const value=(await db.query(`SELECT jsonb_build_object(
    'rooms',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.rooms r WHERE id=ANY($4::uuid[])),
    'bookings',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.room_bookings b WHERE id=ANY($1::uuid[])),
    'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.guest_invoices i WHERE booking_id=ANY($1::uuid[])),
    'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY command_id) FROM private.booking_room_commands c WHERE command_id=ANY($3::uuid[])),
    'room_commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY command_id) FROM private.workflow_room_transition_commands c WHERE room_id=ANY($4::uuid[])),
    'events',(SELECT jsonb_agg(to_jsonb(e)-'external_plan_version'-'external_payload' ORDER BY id) FROM private.booking_notification_events e WHERE id=ANY($2::uuid[])),
    'outbox',(SELECT jsonb_agg(to_jsonb(o) ORDER BY event_id,channel) FROM private.booking_notification_outbox o WHERE event_id=ANY($2::uuid[])),
    'receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY event_id,user_id) FROM private.booking_notification_receipts r WHERE event_id=ANY($2::uuid[])),
    'notifications',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM public.in_app_notifications n WHERE id IN
      (SELECT notification_id FROM private.booking_notification_receipts WHERE event_id=ANY($2::uuid[]))),
    'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.audit_log a WHERE record_id=ANY($1::uuid[]) OR record_id=ANY($4::uuid[]))
    )::text AS value`,[ids,events,commands,rooms])).rows[0].value;
  return digest(value);
}
async function legacyExternalSnapshot(seed){return digest((await db.query(`SELECT jsonb_agg(to_jsonb(o) ORDER BY event_id,channel)::text AS value
  FROM private.booking_notification_outbox o WHERE event_id=ANY($1::uuid[]) AND channel IN('push','telegram')`,[seed.commands.map(c=>c.eventId)])).rows[0].value)}
const roleNames={inapp:'owned_upgrade_inapp_'+input.run,external:'owned_upgrade_external_'+input.run,operator:'owned_upgrade_operator_'+input.run};
const roles=[],workers=[],pools=[];let sink;
async function role(kind,base){const name=roleNames[kind],secret=randomBytes(32).toString('hex');await db.query(`CREATE ROLE ${name} LOGIN PASSWORD '${secret}'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;GRANT ${base} TO ${name}`);roles.push(name);return {...connection,user:name,password:secret}}
async function inapp(){const c=await role('inapp','roomqc_booking_notifier'),worker=new BookingNotificationWorker({Pool:pg.Pool,connection:c,limit:50});workers.push(worker);return worker}
async function checkout(seed,token,label){const roomId=randomUUID(),bookingId=randomUUID(),commandId=randomUUID();
  await insert('rooms',{id:roomId,tenant_id:seed.tenantId,hotel_id:seed.hotelId,room_number:'U-'+label,room_type:'standard',floor:1,status:'occupied_clean'});
  await insert('room_bookings',{id:bookingId,tenant_id:seed.tenantId,hotel_id:seed.hotelId,room_id:roomId,guest_name:'Owned upgrade fixture',
    check_in_date:new Date().toISOString().slice(0,10),check_out_date:new Date().toISOString().slice(0,10),status:'checked_in',created_by:seed.ownerId,
    booking_type:'daily',room_price:1000,subtotal:1000});
  const request={p_booking_id:bookingId,p_room_id:roomId,p_subtotal:1000,p_command_id:commandId,p_adjustment_notes:'Owned pre-upgrade note '+label};
  const r=await rpc('perform_checkout',token,request);assert.equal(r.status,200,'Owned upgrade checkout');assert.ok(r.data.invoice_id&&r.data.notification_event_id);
  return {roomId,bookingId,commandId,eventId:r.data.notification_event_id,invoiceId:r.data.invoice_id,request};
}
try{
  if(input.phase==='seed'){
    record('seed-replays-exact-prior563-schema',await migrationCount()===563);
    const created=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(created.status,200);
    const token=await login(),ownerId=created.data.id;
    const provision=await rpc('provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:ownerId,
      p_fields:{fullName:'Owned upgrade fixture',phone:'0901234567',tenantName:'Owned upgrade fixture',hotelName:'Owned upgrade fixture',hotelAddress:'123 Fixture Road',
        hotelPhone:'0281234567',hotelEmail:email,totalRooms:3}});assert.equal(provision.status,200);assert.equal(provision.data.success,true);
    const seed={ownerId,sessionId:JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id,
      tenantId:provision.data.tenant_id,hotelId:provision.data.hotel_id,commands:[]};
    const oldSub=randomUUID(),oldGroup=randomUUID();
    const subscriber=createECDH('prime256v1');subscriber.generateKeys();
    await db.query(`INSERT INTO public.push_subscriptions(id,tenant_id,user_id,endpoint,p256dh_key,auth_key,is_active)
      VALUES($1,$2,$3,$4,$5,$6,true)`,[oldSub,seed.tenantId,ownerId,'https://fcm.googleapis.com/owned-'+input.run,subscriber.getPublicKey().toString('base64url'),randomBytes(16).toString('base64url')]);
    await db.query(`INSERT INTO public.telegram_groups(id,tenant_id,hotel_id,chat_id,chat_title,group_type,notification_types,is_active,added_by)
      VALUES($1,$2,$3,'-1000000000001','Owned upgrade old group','staff',ARRAY['all'],true,$4)`,[oldGroup,seed.tenantId,seed.hotelId,ownerId]);
    seed.oldSub=oldSub;seed.oldGroup=oldGroup;
    const worker=await inapp();
    seed.commands.push(await checkout(seed,token,'delivered'));const first=await worker.tick();assert.equal(first.failed,undefined);
    const firstState=(await db.query("SELECT state FROM private.booking_notification_outbox WHERE event_id=$1 AND channel='in_app'",[seed.commands[0].eventId])).rows[0]?.state;
    record('seed-actual-prior-worker-has-delivered-receipt',firstState==='delivered'&&Number((await db.query('SELECT count(*) AS n FROM private.booking_notification_receipts WHERE event_id=$1',[seed.commands[0].eventId])).rows[0].n)>0);
    seed.commands.push(await checkout(seed,token,'empty'));
    await db.query("UPDATE private.booking_notification_events SET recipient_ids='{}' WHERE id=$1",[seed.commands[1].eventId]);await worker.tick();
    record('seed-persists-prior-no-recipients-outcome',(await db.query("SELECT state FROM private.booking_notification_outbox WHERE event_id=$1 AND channel='in_app'",[seed.commands[1].eventId])).rows[0]?.state==='no_recipients');
    seed.commands.push(await checkout(seed,token,'pending'));seed.commands.push(await checkout(seed,token,'deferred'));
    await db.query("UPDATE private.booking_notification_outbox SET attempts=2,last_error_code='DELIVERY_FAILED',available_at=clock_timestamp()+interval '1 day' WHERE event_id=$1 AND channel='in_app'",[seed.commands[3].eventId]);
    record('seed-has-real-booking-invoice-command-and-source-for-each-event',seed.commands.length===4
      &&Number((await db.query('SELECT count(*) AS n FROM public.guest_invoices WHERE id=ANY($1::uuid[])',[seed.commands.map(c=>c.invoiceId)])).rows[0].n)===4);
    record('seed-has-four-pending-legacy-external-pairs',Number((await db.query("SELECT count(*) AS n FROM private.booking_notification_outbox WHERE channel IN('push','telegram') AND state='pending'",[])).rows[0].n)===8);
    seed.legacyHash=await legacySnapshot(seed);seed.externalHash=await legacyExternalSnapshot(seed);
    console.log(JSON.stringify({phase:'seed',verified:checks.every(c=>c.passed),checks,fixture:seed,productAcceptance:false}));
  }else{
    const seed=input.seed;assert.equal(seed?.commands?.length,4);
    record(input.phase+'-preserves-all-legacy-business-and-notification-rows',await legacySnapshot(seed)===seed.legacyHash);
    if(input.phase==='rollback'){
      record('faulted-upgrade-leaves-migration-ledger-at563',await migrationCount()===563);
      const absent=(await db.query(`SELECT to_regclass('private.booking_notification_targets') IS NULL AS no_targets,
        to_regclass('private.booking_notification_attempts') IS NULL AS no_attempts,
        NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='private.booking_notification_events'::regclass AND attname='external_plan_version' AND NOT attisdropped) AS no_column`)).rows[0];
      record('faulted-upgrade-rolls-back-new-tables-and-columns',absent.no_targets&&absent.no_attempts&&absent.no_column);
      console.log(JSON.stringify({phase:'rollback',verified:checks.every(c=>c.passed),checks,productAcceptance:false}));
    }else{
      record('upgrade-commits-exact-migration564',await migrationCount()===564);
      const version=(await db.query('SELECT external_plan_version,external_payload FROM private.booking_notification_events WHERE id=ANY($1::uuid[])',[seed.commands.map(c=>c.eventId)])).rows;
      record('upgrade-defaults-existing-sources-to-version-zero-with-no-payload',version.length===4&&version.every(v=>v.external_plan_version===0&&v.external_payload===null));
      record('upgrade-creates-no-legacy-targets-or-attempts',Number((await db.query('SELECT (SELECT count(*) FROM private.booking_notification_targets)+(SELECT count(*) FROM private.booking_notification_attempts) AS n')).rows[0].n)===0);
      const token=await login();
      for(const [index,c]of seed.commands.entries()){const result=await rpc('get_booking_room_command_result',token,{p_command_id:c.commandId}),status=await rpc('get_booking_notification_status',token,{p_command_id:c.commandId});
        record('legacy-result-and-status-'+index,result.status===200&&result.data?.invoice_id===c.invoiceId&&result.data?.notification_event_id===c.eventId
          &&status.status===200&&status.data.events[0]?.external_plan_version===0&&status.data.events[0].channels.filter(x=>x.channel!=='in_app').every(x=>x.targets.length===0));}
      const replay=await Promise.all(Array.from({length:20},(_,i)=>rpc('perform_checkout',token,seed.commands[i%4].request)));
      record('twenty-legacy-api-replays-return-the-original-command-source-and-invoice',replay.every((r,i)=>r.status===200&&r.data?.replayed===true
        &&r.data.notification_event_id===seed.commands[i%4].eventId&&r.data.invoice_id===seed.commands[i%4].invoiceId));
      record('legacy-replay-does-not-upgrade-or-backfill-historical-targets',await legacySnapshot(seed)===seed.legacyHash
        &&Number((await db.query('SELECT count(*) AS n FROM private.booking_notification_targets')).rows[0].n)===0);
      const received=[],journal=[];sink=http.createServer(async(req,res)=>{const chunks=[];for await(const part of req)chunks.push(part);const telegram=req.url.startsWith('/bot');
        const body=telegram?JSON.parse(Buffer.concat(chunks).toString('utf8')):null;received.push(telegram?'telegram':'push');
        journal.push(Number((await db.query("SELECT count(*) AS n FROM private.booking_notification_attempts WHERE outcome='started'")).rows[0].n)===1);
        res.writeHead(telegram?200:201,{'content-type':'application/json'});res.end(telegram?JSON.stringify({ok:true,result:{message_id:91,chat:{id:body.chat_id}}}):'');});
      await new Promise(resolve=>sink.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+sink.address().port;
      const vapid=createECDH('prime256v1');vapid.generateKeys();const transport=createNotificationTransport({developmentOrigins:[origin],timeoutMs:1800});
      const adapters=[createWebPushBookingAdapter({publicKey:vapid.getPublicKey().toString('base64url'),privateKey:vapid.getPrivateKey().toString('base64url'),subject:'mailto:ops@roomqc.invalid',transport}),
        createTelegramBookingAdapter({botToken:'123456789:'+randomBytes(24).toString('base64url'),appOrigin:'https://roomqc.invalid',apiOrigin:origin,transport})];
      const op=new pg.Pool({...await role('operator','roomqc_booking_notification_operator'),max:1});pools.push(op);
      for(const a of adapters)await op.query('SELECT private.configure_booking_notification_channel($1,$2,true,$3,$4)',[a.channel,a.configurationId,randomUUID(),'Owned populated upgrade rehearsal']);
      const externalConnection=await role('external','roomqc_booking_external_notifier');
      const external=new BookingExternalWorker({Pool:pg.Pool,connection:externalConnection,adapters,limit:20});workers.push(external);
      const empty1=await external.tick(),empty2=await external.tick();
      record('enabled-external-workers-never-claim-historical-version-zero-sources',!empty1.failed&&!empty2.failed&&empty1.processed===0&&empty2.processed===0&&received.length===0);
      record('enabled-worker-leaves-legacy-external-outbox-byte-equivalent',await legacyExternalSnapshot(seed)===seed.externalHash);
      const inappWorker=await inapp(),deferred=await inappWorker.tick();
      record('prior-pending-inapp-job-is-still-dispatched-after-upgrade',!deferred.failed&&(await db.query("SELECT state FROM private.booking_notification_outbox WHERE event_id=$1 AND channel='in_app'",[seed.commands[2].eventId])).rows[0]?.state==='delivered');
      const retry=(await db.query("SELECT state,attempts,last_error_code FROM private.booking_notification_outbox WHERE event_id=$1 AND channel='in_app'",[seed.commands[3].eventId])).rows[0];
      record('prior-deferred-inapp-job-honors-its-persisted-backoff',retry.state==='pending'&&retry.attempts===2&&retry.last_error_code==='DELIVERY_FAILED');
      await db.query("UPDATE private.booking_notification_outbox SET available_at=clock_timestamp() WHERE event_id=$1 AND channel='in_app'",[seed.commands[3].eventId]);await inappWorker.tick();
      const receiptBefore=(await db.query('SELECT jsonb_agg(to_jsonb(r) ORDER BY event_id,user_id)::text AS value FROM private.booking_notification_receipts r WHERE event_id=ANY($1::uuid[])',[seed.commands.map(c=>c.eventId)])).rows[0].value;
      await inappWorker.tick();record('prior-deferred-inapp-job-recovers-without-repeating-existing-receipts',
        (await db.query("SELECT state FROM private.booking_notification_outbox WHERE event_id=$1 AND channel='in_app'",[seed.commands[3].eventId])).rows[0]?.state==='delivered'
        &&receiptBefore===(await db.query('SELECT jsonb_agg(to_jsonb(r) ORDER BY event_id,user_id)::text AS value FROM private.booking_notification_receipts r WHERE event_id=ANY($1::uuid[])',[seed.commands.map(c=>c.eventId)])).rows[0].value);
      // Fixture-only destination changes AFTER the preservation assertions.
      await db.query('UPDATE public.push_subscriptions SET is_active=false WHERE id=$1',[seed.oldSub]);await db.query('UPDATE public.telegram_groups SET is_active=false WHERE id=$1',[seed.oldGroup]);
      const sub=randomUUID(),group=randomUUID(),subscriber=createECDH('prime256v1');subscriber.generateKeys();
      await db.query(`INSERT INTO public.push_subscriptions(id,tenant_id,user_id,endpoint,p256dh_key,auth_key,is_active) VALUES($1,$2,$3,$4,$5,$6,true)`,
        [sub,seed.tenantId,seed.ownerId,origin+'/push/'+sub,subscriber.getPublicKey().toString('base64url'),randomBytes(16).toString('base64url')]);
      await db.query(`INSERT INTO public.telegram_groups(id,tenant_id,hotel_id,chat_id,chat_title,group_type,notification_types,is_active,added_by)
        VALUES($1,$2,$3,'-1000000000002','Owned current sink','staff',ARRAY['all'],true,$4)`,[group,seed.tenantId,seed.hotelId,seed.ownerId]);
      const fresh=await checkout(seed,token,'after-upgrade'),targets=(await db.query('SELECT channel,state FROM private.booking_notification_targets WHERE event_id=$1',[fresh.eventId])).rows;
      record('new-source-after-populated-upgrade-has-version-one-and-two-exact-targets',targets.length===2&&new Set(targets.map(t=>t.channel)).size===2
        &&(await db.query('SELECT external_plan_version FROM private.booking_notification_events WHERE id=$1',[fresh.eventId])).rows[0].external_plan_version===1);
      const sent=await external.tick();await external.shutdown();const restarted=new BookingExternalWorker({Pool:pg.Pool,connection:externalConnection,adapters,limit:20});workers.push(restarted);await restarted.tick();
      record('new-source-is-sent-once-per-channel-after-upgrade-and-restart',!sent.failed&&sent.accepted===2&&received.length===2&&received.includes('push')&&received.includes('telegram')&&journal.every(Boolean));
      record('processing-new-sources-does-not-create-targets-or-touch-old-external-outbox',await legacyExternalSnapshot(seed)===seed.externalHash
        &&Number((await db.query('SELECT count(*) AS n FROM private.booking_notification_targets WHERE event_id=ANY($1::uuid[])',[seed.commands.map(c=>c.eventId)])).rows[0].n)===0);
      record('old-no-recipients-state-is-retained',(await db.query("SELECT state FROM private.booking_notification_outbox WHERE event_id=$1 AND channel='in_app'",[seed.commands[1].eventId])).rows[0]?.state==='no_recipients');
      console.log(JSON.stringify({phase:'post',verified:checks.every(c=>c.passed),checks,legacyEvents:4,legacyExternalJobs:8,newExternalTargets:2,realInternalHttpRequests:received.length,
        freshReplayOnly:false,realProviderCalled:false,productAcceptance:false}));
    }
  }
}finally{
  await Promise.allSettled(workers.map(w=>w.shutdown()));await Promise.allSettled(pools.map(p=>p.end()));
  if(sink){sink.closeAllConnections();await new Promise(resolve=>sink.close(resolve))}
  for(const name of roles.reverse())await db.query('DROP ROLE '+name);await db.end();
}
