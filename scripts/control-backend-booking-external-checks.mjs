// Concatenated native fixture only. No public ports or real providers.
import externalHttp from 'node:http';
import {createECDH as externalECDH} from 'node:crypto';
import {spawn as externalSpawn} from 'node:child_process';
import externalFs from 'node:fs/promises';
import {bookingNotificationOperatorMain as externalOperatorMain} from '/control/booking-notification-operator.mjs';
import {BookingExternalWorker as ExternalBookingWorker} from '/control/workers/booking-external-worker.mjs';
import {resourceBudget as externalResourceBudget} from '/control/resource-budget.mjs';
import {readResourceDatabaseCatalog as externalReadDatabaseCatalog,resourceDatabaseObservationDigests as externalDatabaseDigests} from '/control/resource-database.mjs';
import {validateResourcePoolSample as externalValidatePoolSample} from '/control/resource-pool-observation.mjs';
import {createNotificationTransport as externalTransport,createWebPushBookingAdapter as externalPushAdapter,
  createTelegramBookingAdapter as externalTelegramAdapter} from '/control/booking-notification-providers.mjs';

async function bookingExternalNotificationChecks({a,b,manager,db,record,races,rpc,room,booking,checkout,checkin,snapshot,lockBarrier,input}) {
  const rec=(name,passed,details={})=>{
    record('external-'+name,passed,{actualNative:true,...details});
    // Stop at the original failed expectation; later operator commands cannot
    // diagnose an earlier transport/worker outcome from the wrong state.
    if(!passed)throw new Error('OWNED_EXTERNAL_CHECK_FAILED:'+name+':'+JSON.stringify(details));
  };
  const connection={host:'db',port:5432,database:'postgres'};
  const login='owned_external_worker_'+input.run,opLogin='owned_external_operator_'+input.run;
  const password=randomBytes(32).toString('hex'),opPassword=randomBytes(32).toString('hex');
  await db.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    GRANT roomqc_booking_external_notifier TO ${login};
    CREATE ROLE ${opLogin} LOGIN PASSWORD '${opPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    GRANT roomqc_booking_notification_operator TO ${opLogin}`);
  const manual=new pg.Pool({...connection,user:login,password,max:3,statement_timeout:8000,connectionTimeoutMillis:3000});
  const operator=new pg.Pool({...connection,user:opLogin,password:opPassword,max:2,statement_timeout:8000,connectionTimeoutMillis:3000});
  // The normal postgres fixture login is not the owner of upstream catalog
  // functions. Keep exact-owned catalog preparation on a separate admin pool;
  // the daemon only receives its restricted worker DSN.
  const catalogAdmin=new pg.Pool({...connection,user:'supabase_admin',password:input.databasePassword,max:1,statement_timeout:8000,connectionTimeoutMillis:3000});
  const workers=[],children=new Set(),createdPush=[],createdGroups=[],requests=[],journals=[],events=[],modes=new Map(),ownedFiles=[];
  const fileRoot='/dev/shm/roomqc-booking-'+input.run;let filesCreated=false,catalogBaseline;
  const catalogAcl=async()=>(await catalogAdmin.query(`SELECT a.grantor::text AS grantor,a.grantee::text AS grantee,
    a.privilege_type AS privilege,a.is_grantable AS grantable FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid='pg_catalog.pg_control_system()'::regprocedure ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable`)).rows;
  const vapid=externalECDH('prime256v1');vapid.generateKeys();
  const subscriber=externalECDH('prime256v1');subscriber.generateKeys();const auth=randomBytes(16).toString('base64url');
  const botToken='123456789:'+randomBytes(24).toString('base64url');let groupSerial=0,pause=null;
  const server=externalHttp.createServer(async(req,res)=>{
    try{
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const isPush=req.url.startsWith('/push/'),body=isPush?null:JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const ref=isPush?req.url.slice('/push/'.length):body.chat_id;
      const channel=isPush?'push':'telegram';
      const active=(await db.query(`SELECT t.id,(SELECT count(*)::int FROM private.booking_notification_attempts q
        WHERE q.target_id=t.id AND q.lease_id=t.lease_id AND q.outcome='started') AS n
        FROM private.booking_notification_targets t LEFT JOIN public.telegram_groups g ON t.channel='telegram' AND g.id=t.target_ref
        WHERE t.channel=$1 AND t.state='leased' AND CASE WHEN $1='push' THEN t.target_ref::text=$2 ELSE g.chat_id=$2 END`,[channel,ref])).rows;
      journals.push(active.length===1&&active[0].n===1);
      const row={channel,ref,bodyBytes:Buffer.concat(chunks).length,journalVisible:active.length===1&&active[0].n===1};requests.push(row);
      const mode=modes.get(ref)??'accepted';if(mode.startsWith('pause')&&pause){pause.enter();await pause.wait}
      if(mode==='drop'){req.socket.destroy();return}if(mode==='hang')return;
      if(mode==='oversize'){res.writeHead(200);res.end('x'.repeat(20000));return}
      const status=mode==='rate'?429:mode==='reject'?403:['gone','pause-gone'].includes(mode)?410:mode==='server'?500:isPush?201:200;
      res.writeHead(status,{'content-type':'application/json','retry-after':'45'});
      if(isPush){res.end();return}
      if(mode==='malformed'){res.end('{');return}
      res.end(JSON.stringify(status===200?{ok:true,result:{message_id:41,chat:{id:mode==='wrong-chat'?'-999999':body.chat_id}}}:
        {ok:false,error_code:status,parameters:{retry_after:45}}));
    }catch{res.destroy()}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const transport=externalTransport({developmentOrigins:[origin],timeoutMs:1800});
  const adapters=[externalPushAdapter({publicKey:vapid.getPublicKey().toString('base64url'),privateKey:vapid.getPrivateKey().toString('base64url'),
    subject:'mailto:ops@roomqc.invalid',transport}),externalTelegramAdapter({botToken,appOrigin:'https://roomqc.invalid',apiOrigin:origin,transport})];
  const config=async(channel,enabled=true,configuration=adapters.find(x=>x.channel===channel).configurationId,key=randomUUID(),reason='Owned configuration check')=>
    (await operator.query('SELECT private.configure_booking_notification_channel($1,$2,$3,$4,$5) AS result',[channel,configuration,enabled,key,reason])).rows[0].result;
  const resolve=async(id,resolution='retry',risk=false,key=randomUUID(),reason='Owned target resolution')=>
    (await operator.query('SELECT private.resolve_booking_notification_target($1,$2,$3,$4,$5) AS result',[id,key,resolution,reason,risk])).rows[0].result;
  const makeWorker=(overrides={})=>{
    const worker=new ExternalBookingWorker({Pool:pg.Pool,connection:{...connection,user:login,password},adapters,limit:50,onEvent:e=>events.push(e),...overrides});
    workers.push(worker);return worker;
  };
  let worker=makeWorker();
  const hits=target=>requests.filter(r=>r.ref===(target.channel==='push'?target.id:target.chat)).length;
  const target=async(channel,user=manager)=>{
    const id=randomUUID();
    if(channel==='push'){
      await db.query(`INSERT INTO public.push_subscriptions(id,tenant_id,user_id,endpoint,p256dh_key,auth_key,is_active)
        VALUES($1,$2,$3,$4,$5,$6,true)`,[id,user.id===b.id?b.tenantId:a.tenantId,user.id,origin+'/push/'+id,subscriber.getPublicKey().toString('base64url'),auth]);
      createdPush.push(id);return {id,channel,user};
    }
    const chat='-10000000'+String(++groupSerial).padStart(4,'0');
    await db.query(`INSERT INTO public.telegram_groups(id,tenant_id,hotel_id,chat_id,chat_title,group_type,notification_types,is_active,added_by)
      VALUES($1,$2,$3,$4,'Owned internal sink','staff',ARRAY['all'],true,$5)`,[id,a.tenantId,a.hotelId,chat,a.id]);
    createdGroups.push(id);return {id,channel,chat};
  };
  const only=async(list)=>{
    await db.query('UPDATE public.push_subscriptions SET is_active=(id=ANY($1::uuid[])) WHERE id=ANY($2::uuid[])',[list.filter(t=>t.channel==='push').map(t=>t.id),createdPush]);
    await db.query('UPDATE public.telegram_groups SET is_active=(id=ANY($1::uuid[])) WHERE id=ANY($2::uuid[])',[list.filter(t=>t.channel==='telegram').map(t=>t.id),createdGroups]);
  };
  const prepareBooking=async(list,operation='checkout')=>{
    await only(list);const r=await room(a,a.hotelId,operation==='checkin'?'vacant_clean':'occupied_clean');
    const bk=await booking(a,r,operation==='checkin'?'confirmed':'checked_in',{room_price:1000,subtotal:1000}),key=randomUUID();
    const invoke=()=>operation==='checkin'?checkin(a,bk,r,{p_command_id:key}):checkout(a,bk,r,{p_command_id:key,p_subtotal:1000});
    return {r,bk,key,invoke};
  };
  const fresh=async(list,operation='checkout')=>{const f=await prepareBooking(list,operation),res=await f.invoke();
    assert.equal(res.status,200,'Owned external source must succeed');assert.ok(res.data.notification_event_id);return {...f,id:res.data.notification_event_id,res}};
  const states=async f=>(await db.query('SELECT * FROM private.booking_notification_targets WHERE event_id=$1 ORDER BY channel,target_ref',[f.id])).rows;
  const state=async(f,t)=>(await states(f)).find(row=>row.target_ref===t.id);
  const channelState=async(f,channel)=>(await db.query('SELECT state FROM private.booking_notification_outbox WHERE event_id=$1 AND channel=$2',[f.id,channel])).rows[0]?.state;
  const due=async id=>db.query('UPDATE private.booking_notification_targets SET available_at=clock_timestamp() WHERE id=$1',[id]);
  const expire=async id=>db.query("UPDATE private.booking_notification_targets SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1 AND state='leased'",[id]);
  const deniedSql=async(pool,query,params=[])=>{const before=await snapshot();let code=null;try{await pool.query(query,params)}catch(error){code=error.code}
    return {code,unchanged:before===await snapshot()}};
  const barrier=()=>{let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);return {enter,entered,wait,release}};
  const waitUntil=async(fn)=>{const deadline=Date.now()+6000;while(Date.now()<deadline){if(await fn())return;await new Promise(r=>setTimeout(r,20))}throw new Error('EXTERNAL_FIXTURE_BARRIER_MISSING')};
  try{
    await config('push');await config('telegram');
    await worker.tick(); // Close only planned empty channels from prior controls.
    const p=await target('push'),g=await target('telegram'),foreign=await target('push',b);
    const accepted=await fresh([p,g,foreign]),planned=await states(accepted);
    rec('atomic-target-snapshot-has-exact-two-channels-and-no-foreign-tenant',planned.length===2&&planned.every(t=>t.event_id===accepted.id)
      &&planned.some(t=>t.channel==='push'&&t.user_id===manager.id)&&planned.some(t=>t.channel==='telegram'&&t.user_id===null));
    const old=await snapshot(),replayed=await Promise.all(Array.from({length:20},()=>accepted.invoke()));
    rec('twenty-source-replays-never-add-targets-or-effects',replayed.every(r=>r.status===200&&r.data.replayed===true)&&old===await snapshot(),
      {requests:20,effectsUnchanged:old===await snapshot()});
    const sent=await worker.tick();
    rec('restricted-actual-worker-accepts-push-and-telegram',!sent.failed&&sent.accepted===2&&(await states(accepted)).every(t=>t.state==='accepted'&&t.attempts===1),
      {accepted:sent.accepted,processed:sent.processed});
    rec('channel-accepted-only-after-own-target-completion',await channelState(accepted,'push')==='accepted'&&await channelState(accepted,'telegram')==='accepted');
    rec('foreign-tenant-target-was-never-contacted',hits(foreign)===0);
    const stable=await snapshot(),requestCount=requests.length;await worker.tick();await worker.shutdown();worker=makeWorker();await worker.tick();
    rec('restart-after-accepted-never-resends-or-adds-receipts',stable===await snapshot()&&requests.length===requestCount,{effectsUnchanged:stable===await snapshot()});
    const visible=await rpc('get_booking_notification_status',a,{p_command_id:accepted.key});
    rec('status-exposes-target-outcomes-without-private-destinations',visible.status===200
      &&visible.data?.events[0]?.external_plan_version===1&&visible.data.events[0].channels.filter(c=>c.channel!=='in_app').every(c=>c.state==='accepted'&&c.targets.length===1)
      &&![origin,g.chat,auth,subscriber.getPublicKey().toString('base64url'),botToken,'destination_hash','fingerprint'].some(v=>JSON.stringify(visible.data).includes(v)));
    const other=await rpc('get_booking_notification_status',b,{p_command_id:accepted.key});
    rec('status-keeps-cross-tenant-command-hidden',other.status===200&&other.data===null);
    const ci=await fresh([p,g],'checkin');await worker.tick();
    rec('checkin-plans-and-sends-telegram-only',(await states(ci)).length===1&&(await states(ci))[0].channel==='telegram'
      &&(await states(ci))[0].state==='accepted'&&hits(p)===1&&hits(g)===2);
    for(const operation of ['checkin','checkout','group_checkout']){
      const f=await prepareBooking([p,g],operation==='checkin'?'checkin':'checkout');let invoke=f.invoke,second=null;
      if(operation==='group_checkout'){
        second=await prepareBooking([p,g]);
        invoke=()=>rpc('perform_group_checkout',a,{p_command_id:f.key,p_checkouts:[
          {booking_id:f.bk.id,room_id:f.r.id,subtotal:1000,damage_charges:0},
          {booking_id:second.bk.id,room_id:second.r.id,subtotal:1000,damage_charges:0}]});
      }
      const faultBooking=second?.bk.id??f.bk.id,before=await snapshot();
      await db.query(`CREATE FUNCTION private.owned_external_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
        BEGIN IF EXISTS(SELECT 1 FROM private.booking_notification_events WHERE id=NEW.event_id AND booking_id='${faultBooking}'::uuid)
        THEN RAISE EXCEPTION 'OWNED_EXTERNAL_TARGET_FAULT';END IF;RETURN NEW;END;$f$;
        CREATE TRIGGER owned_external_fault BEFORE INSERT ON private.booking_notification_targets FOR EACH ROW EXECUTE FUNCTION private.owned_external_fault()`);
      let failed;try{failed=await invoke()}finally{await db.query('DROP TRIGGER owned_external_fault ON private.booking_notification_targets;DROP FUNCTION private.owned_external_fault()')}
      rec(operation+'-target-planning-fault-rolls-back-whole-core',failed.status>=400&&before===await snapshot(),{status:failed.status,effectsUnchanged:before===await snapshot()});
      const recovered=await invoke();
      const ids=operation==='group_checkout'?recovered.data?.results?.map(r=>r.notification_event_id):[recovered.data?.notification_event_id];
      const count=Number((await db.query('SELECT count(*) AS n FROM private.booking_notification_targets WHERE event_id=ANY($1::uuid[])',[ids])).rows[0].n);
      rec(operation+'-same-key-recovers-exact-target-plan',recovered.status===200&&count===(operation==='group_checkout'?4:operation==='checkin'?1:2),{targets:count});
      await worker.tick();
    }
    const duplicate=await target('push',a),duplicate2=await target('push',manager);
    await db.query('UPDATE public.push_subscriptions SET endpoint=$2 WHERE id=$1',[duplicate2.id,origin+'/push/'+duplicate.id]);
    const dedup=await fresh([duplicate,duplicate2]);
    rec('same-destination-snapshot-is-deduplicated-within-event',(await states(dedup)).length===1);
    await only([]);await worker.tick(); // Obsolete this intentionally duplicated fixture, no send.
    const empty=await fresh([]);await worker.tick();
    rec('planned-empty-channels-close-as-no-recipients',await channelState(empty,'push')==='no_recipients'&&await channelState(empty,'telegram')==='no_recipients');
    const rejected=await target('push');modes.set(rejected.id,'reject');const rejectedEvent=await fresh([rejected]);await worker.tick();
    rec('definitive-provider-rejection-is-terminal',(await state(rejectedEvent,rejected)).state==='rejected'&&hits(rejected)===1);
    const gone=await target('push');modes.set(gone.id,'gone');const goneEvent=await fresh([gone]);await worker.tick();
    rec('push410-deactivates-only-the-unchanged-subscription',(await state(goneEvent,gone)).state==='rejected'
      &&(await db.query('SELECT is_active FROM public.push_subscriptions WHERE id=$1',[gone.id])).rows[0].is_active===false);
    const partialA=await target('push'),partialB=await target('push',a);modes.set(partialB.id,'reject');
    const partial=await fresh([partialA,partialB]);await worker.tick();
    rec('same-channel-partial-failure-keeps-per-target-outcomes',await channelState(partial,'push')==='partial'
      &&(await state(partial,partialA)).state==='accepted'&&(await state(partial,partialB)).state==='rejected');
    const rate=await target('telegram');modes.set(rate.chat,'rate');const rateEvent=await fresh([rate]);await worker.tick();
    const rateState=await state(rateEvent,rate),backoffHits=hits(rate);await worker.tick();
    rec('429-persists-bounded-backoff-and-honors-retry-after',rateState.state==='pending'&&rateState.attempts===1
      &&new Date(rateState.available_at).getTime()>Date.now()+35000&&hits(rate)===backoffHits);
    for(let n=1;n<5;n++){await due(rateState.id);await worker.tick()}
    const exhausted=await state(rateEvent,rate);await due(rateState.id);await worker.tick();
    rec('429-stops-after-five-durable-attempts',exhausted.state==='rejected'&&exhausted.last_error_code==='RETRY_EXHAUSTED'
      &&exhausted.attempts===5&&hits(rate)===5);
    const exhaustedRetry=await deniedSql(operator,'SELECT private.resolve_booking_notification_target($1,$2,$3,$4,true)',
      [exhausted.id,randomUUID(),'retry','Owned exhausted retry denied']);
    rec('operator-cannot-bypass-attempt-budget',exhaustedRetry.code==='42501'&&exhaustedRetry.unchanged);
    const unknowns=[];
    for(const [channel,mode]of [['push','drop'],['push','server'],['push','oversize'],['telegram','wrong-chat'],['telegram','malformed'],['telegram','hang']]){
      const t=await target(channel);modes.set(channel==='push'?t.id:t.chat,mode);const f=await fresh([t]);await worker.tick();
      const outcome=await state(f,t),before=hits(t);await worker.tick();await worker.shutdown();worker=makeWorker();await worker.tick();
      rec(channel+'-'+mode+'-unknown-never-auto-resends-across-restart',outcome.state==='unknown'&&outcome.attempts===1
        &&outcome.last_error_code==='OUTCOME_UNKNOWN'&&before===1&&hits(t)===1&&await channelState(f,channel)==='unknown',
        {state:outcome.state,attempts:outcome.attempts,lastErrorCode:outcome.last_error_code,providerRequests:before,requestsAfterRestart:hits(t)});
      unknowns.push({f,t,id:outcome.id});
    }
    const unknown=unknowns[0],unsafeRetry=await deniedSql(operator,'SELECT private.resolve_booking_notification_target($1,$2,$3,$4,false)',
      [unknown.id,randomUUID(),'retry','Owned unknown duplicate risk denied']);
    rec('unknown-retry-requires-explicit-duplicate-risk',unsafeRetry.code==='42501'&&unsafeRetry.unchanged&&hits(unknown.t)===1);
    await only([unknown.t]);modes.set(unknown.t.id,'accepted');const retryKey=randomUUID();
    const explicit=await resolve(unknown.id,'retry',true,retryKey),replayBefore=await snapshot(),explicitReplay=await resolve(unknown.id,'retry',true,retryKey);
    rec('operator-resolution-is-audited-idempotent',explicit.state==='pending'&&explicitReplay.replayed===true&&replayBefore===await snapshot(),
      {effectsUnchanged:replayBefore===await snapshot()});
    const resolutionConflict=await deniedSql(operator,'SELECT private.resolve_booking_notification_target($1,$2,$3,$4,true)',
      [unknown.id,retryKey,'suppress','Owned target resolution']);
    rec('operator-reused-key-different-intent-conflicts',resolutionConflict.code==='23505'&&resolutionConflict.unchanged);
    await worker.tick();rec('explicit-risk-retry-sends-once-more-with-new-attempt',(await state(unknown.f,unknown.t)).state==='accepted'
      &&(await state(unknown.f,unknown.t)).attempts===2&&hits(unknown.t)===2);
    const suppress=unknowns[1],suppressed=await resolve(suppress.id,'suppress');await worker.tick();
    rec('operator-suppression-does-not-fake-provider-acceptance',suppressed.state==='resolved'&&(await state(suppress.f,suppress.t)).state==='resolved'
      &&await channelState(suppress.f,'push')==='resolved'&&hits(suppress.t)===1);
    const disabled=await target('telegram');await config('telegram',false);const blocked=await fresh([disabled]);await worker.tick();
    const blockedState=await state(blocked,disabled);
    rec('disabled-channel-blocks-before-journal-or-http',blockedState.state==='blocked'&&blockedState.last_error_code==='CHANNEL_UNCONFIGURED'
      &&blockedState.attempts===0&&hits(disabled)===0);
    await config('telegram',true);await worker.tick();
    rec('enable-does-not-silently-resend-blocked-targets',hits(disabled)===0&&(await state(blocked,disabled)).state==='blocked');
    await resolve(blockedState.id);await worker.tick();
    rec('enabled-channel-needs-explicit-audited-target-retry',(await state(blocked,disabled)).state==='accepted'&&hits(disabled)===1);
    const changed=await target('push'),changedEvent=await fresh([changed]);await config('push',true,'0'.repeat(64));await worker.tick();
    const changedState=await state(changedEvent,changed);
    rec('configuration-drift-blocks-without-http',changedState.state==='blocked'&&changedState.last_error_code==='CONFIG_CHANGED'&&hits(changed)===0);
    await config('push');await resolve(changedState.id);await worker.tick();
    rec('configuration-recovery-needs-explicit-resolution',(await state(changedEvent,changed)).state==='accepted'&&hits(changed)===1);
    const configKey=randomUUID(),cfg=adapters[0].configurationId;
    await config('push',true,cfg,configKey);const configBefore=await snapshot(),configReplay=await config('push',true,cfg,configKey);
    rec('operator-config-replay-has-no-second-effect',configReplay.replayed===true&&configBefore===await snapshot());
    const configConflict=await deniedSql(operator,'SELECT private.configure_booking_notification_channel($1,$2,false,$3,$4)',
      ['push',cfg,configKey,'Owned configuration check']);
    rec('operator-config-key-conflict-has-no-effects',configConflict.code==='23505'&&configConflict.unchanged);
    const dns=await target('push');await db.query('UPDATE public.push_subscriptions SET endpoint=$2 WHERE id=$1',[dns.id,'https://updates.push.services.mozilla.com/'+dns.id]);
    const dnsEvent=await fresh([dns]),dnsAdapter=externalPushAdapter({publicKey:vapid.getPublicKey().toString('base64url'),privateKey:vapid.getPrivateKey().toString('base64url'),
      subject:'mailto:ops@roomqc.invalid',transport:externalTransport({origins:['https://updates.push.services.mozilla.com'],lookup:async()=>{throw new Error('Owned DNS failure')}})});
    const dnsWorker=makeWorker({adapters:[dnsAdapter]});await dnsWorker.tick();const dnsState=await state(dnsEvent,dns);
    rec('dns-preparation-failure-retries-before-any-attempt-or-http',dnsState.state==='pending'&&dnsState.prepare_failures===1&&dnsState.attempts===0&&hits(dns)===0);
    for(let n=1;n<5;n++){await due(dnsState.id);await dnsWorker.tick()}
    const dnsFinal=await state(dnsEvent,dns);
    rec('dns-preparation-budget-exhausts-without-provider-attempt',dnsFinal.state==='rejected'&&dnsFinal.prepare_failures===5&&dnsFinal.attempts===0&&hits(dns)===0);
    const badKey=await target('push');await db.query('UPDATE public.push_subscriptions SET p256dh_key=$2 WHERE id=$1',[badKey.id,'invalid']);
    const invalid=await fresh([badKey]);await worker.tick();
    rec('invalid-crypto-target-rejected-before-journal-and-http',(await state(invalid,badKey)).state==='rejected'
      &&(await state(invalid,badKey)).last_error_code==='INVALID_TARGET'&&(await state(invalid,badKey)).attempts===0&&hits(badKey)===0);
    for(const change of ['locked-user','removed-membership','inactive-hotel','destination-changed']){
      const t=await target('push'),f=await fresh([t]);
      if(change==='locked-user')await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[manager.id]);
      if(change==='removed-membership')await db.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2',[manager.id,a.hotelId]);
      if(change==='inactive-hotel')await db.query("UPDATE public.hotels SET status='inactive' WHERE id=$1",[a.hotelId]);
      if(change==='destination-changed')await db.query('UPDATE public.push_subscriptions SET endpoint=$2 WHERE id=$1',[t.id,origin+'/push/'+t.id+'/changed']);
      try{await worker.tick();const s=await state(f,t);rec(change+'-obsoletes-before-journal-and-http',s.state==='obsolete'&&s.attempts===0&&hits(t)===0)}
      finally{
        if(change==='locked-user')await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[manager.id]);
        if(change==='removed-membership')await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)',[manager.id,a.hotelId,a.id]);
        if(change==='inactive-hotel')await db.query("UPDATE public.hotels SET status='active' WHERE id=$1",[a.hotelId]);
      }
    }
    const revoked=await target('push'),revokedEvent=await fresh([revoked]),profileLock=await db.connect();
    try{
      await profileLock.query('BEGIN');await profileLock.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[manager.id]);
      const pending=worker.tick();await lockBarrier('private.prepare_booking_external_target');
      await profileLock.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2',[manager.id,a.hotelId]);
      await profileLock.query('COMMIT');await pending;
    }finally{await profileLock.query('ROLLBACK');profileLock.release();await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)',[manager.id,a.hotelId,a.id])}
    const revokedPass=(await state(revokedEvent,revoked)).state==='obsolete'&&hits(revoked)===0;
    rec('membership-revocation-wins-real-prepare-lock',revokedPass,{realLockBarrier:true});
    races.push({label:'external-membership-revocation-wins-real-prepare-lock',passed:revokedPass,realLockBarrier:true});
    const contested=await target('push'),contestedEvent=await fresh([contested]),scopeLock=await db.connect(),secondWorker=makeWorker();
    let contestedRuns;
    try{
      await scopeLock.query('BEGIN');await scopeLock.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[manager.id]);
      const first=worker.tick();await lockBarrier('private.prepare_booking_external_target');const second=secondWorker.tick();
      await scopeLock.query('COMMIT');contestedRuns=await Promise.all([first,second]);
    }finally{await scopeLock.query('ROLLBACK');scopeLock.release()}
    const once=contestedRuns.every(r=>!r.failed)&&contestedRuns.reduce((n,r)=>n+r.accepted,0)===1
      &&(await state(contestedEvent,contested)).attempts===1&&hits(contested)===1;
    rec('two-actual-workers-share-one-target-after-real-scope-lock',once,{realLockBarrier:true});
    races.push({label:'external-two-actual-workers-share-one-target-after-real-scope-lock',passed:once,realLockBarrier:true});
    const held=await target('push'),heldEvent=await fresh([held]);modes.set(held.id,'pause');pause=barrier();
    const heldRun=worker.tick();await Promise.race([pause.entered,new Promise((_,reject)=>setTimeout(()=>reject(new Error('EXTERNAL_SINK_NOT_REACHED')),6000))]);
    let configDone=false,userDone=false;
    const changingConfig=config('push',false).then(r=>{configDone=true;return r});
    const changingUser=db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[manager.id]).then(r=>{userDone=true;return r});
    try{
      await lockBarrier('private.configure_booking_notification_channel');await lockBarrier('UPDATE public.users SET account_locked');
      const holding=!configDone&&!userDone&&(await state(heldEvent,held)).state==='leased';
      rec('live-config-and-recipient-locks-held-through-real-http',holding,{realLockBarrier:true});
      races.push({label:'external-live-config-and-recipient-locks-held-through-real-http',passed:holding,realLockBarrier:true});
    }finally{pause.release();await Promise.all([heldRun,changingConfig,changingUser]);pause=null;await config('push');await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[manager.id])}
    rec('concurrent-config-disable-and-user-lock-commit-after-send',(await state(heldEvent,held)).state==='accepted'&&hits(held)===1&&journals.every(Boolean));
    const rotating=await target('push'),rotateEvent=await fresh([rotating]);modes.set(rotating.id,'pause-gone');pause=barrier();
    const rotateRun=worker.tick();await Promise.race([pause.entered,new Promise((_,reject)=>setTimeout(()=>reject(new Error('EXTERNAL_ROTATION_SINK_MISSING')),6000))]);
    const rotation=db.query('UPDATE public.push_subscriptions SET auth_key=$2,is_active=true WHERE id=$1',[rotating.id,randomBytes(16).toString('base64url')]);
    try{await lockBarrier('UPDATE public.push_subscriptions SET auth_key');rec('subscription-key-rotation-waits-for-live-target-lock',true,{realLockBarrier:true});
      races.push({label:'external-subscription-key-rotation-waits-for-live-target-lock',passed:true,realLockBarrier:true});}
    finally{pause.release();await Promise.all([rotateRun,rotation]);pause=null}
    rec('old410-cannot-disable-subscription-renewed-after-live-lock',(await state(rotateEvent,rotating)).state==='rejected'
      &&(await db.query('SELECT is_active FROM public.push_subscriptions WHERE id=$1',[rotating.id])).rows[0].is_active===true);
    const historical=await fresh([]),historicRequests=requests.length;
    await db.query('UPDATE private.booking_notification_events SET external_plan_version=0,external_payload=NULL WHERE id=$1',[historical.id]);await worker.tick();
    rec('historical-version-zero-source-is-never-silently-backfilled',await channelState(historical,'push')==='pending'
      &&await channelState(historical,'telegram')==='pending'&&(await states(historical)).length===0&&requests.length===historicRequests);

    const killAt=async(stage)=>{
      const t=await target('push'),f=await fresh([t]);
      const childSource=`import pg from '/control/node_modules/pg/lib/index.js';
        import {BookingExternalWorker} from '/control/workers/booking-external-worker.mjs';
        import {createNotificationTransport,createWebPushBookingAdapter} from '/control/booking-notification-providers.mjs';
        const c=JSON.parse(process.env.ROOMQC_OWNED_EXTERNAL_CONFIG);
        const actual=createWebPushBookingAdapter({...c.keys,subject:'mailto:ops@roomqc.invalid',transport:createNotificationTransport({developmentOrigins:[c.origin],timeoutMs:1800})});
        const signal=()=>{process.stdout.write('OWNED_EXTERNAL_STAGE\\n');return new Promise(()=>{})};
        const adapter={channel:actual.channel,configurationId:actual.configurationId,async prepare(t,p){
          const request=await actual.prepare(t,p);if(c.stage==='before-journal')await signal();
          return {async send(abort){if(c.stage==='after-journal')await signal();const result=await request.send(abort);if(c.stage==='after-http')await signal();return result}};
        }};
        const worker=new BookingExternalWorker({Pool:pg.Pool,connection:c.connection,adapters:[adapter],limit:1});
        await worker.tick();await worker.shutdown();`;
      const child=externalSpawn(process.execPath,['--input-type=module','-e',childSource],{stdio:['ignore','pipe','pipe'],env:{...process.env,
        ROOMQC_OWNED_EXTERNAL_CONFIG:JSON.stringify({stage,origin,connection:{...connection,user:login,password},
          keys:{publicKey:vapid.getPublicKey().toString('base64url'),privateKey:vapid.getPrivateKey().toString('base64url')}})}});
      children.add(child);let output='';const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
      child.stdout.on('data',chunk=>{output=(output+chunk.toString()).slice(-4096)});child.stderr.on('data',()=>{});
      let journalBefore,kill;
      try{
        await waitUntil(()=>output.includes('OWNED_EXTERNAL_STAGE'));
        const s=await state(f,t);journalBefore=Number((await db.query('SELECT count(*) AS n FROM private.booking_notification_attempts WHERE target_id=$1',[s.id])).rows[0].n);
        child.kill('SIGKILL');kill=await closed;
      }finally{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await closed}children.delete(child)}
      const s=await state(f,t),beforeHits=hits(t);await expire(s.id);await worker.tick();
      const after=await state(f,t),postHits=hits(t);await worker.shutdown();worker=makeWorker();await worker.tick();
      rec('actual-process-kill-'+stage+'-has-expected-durable-journal',kill.signal==='SIGKILL'&&journalBefore===(stage==='before-journal'?0:1)
        &&beforeHits===(stage==='after-http'?1:0),{actualProcessKilled:true,journalBefore,hitsBeforeRecovery:beforeHits});
      rec('actual-process-kill-'+stage+'-safe-recovery-without-ambiguous-resend',after.state===(stage==='before-journal'?'accepted':'unknown')
        &&after.attempts===1&&postHits===(stage==='after-journal'?0:1)&&hits(t)===postHits,{actualProcessKilled:true});
    };
    for(const stage of ['before-journal','after-journal','after-http'])await killAt(stage);
    const commitLost=await target('push'),commitEvent=await fresh([commitLost]);
    class CommitDropPool{
      constructor(options){this.inner=new pg.Pool(options)}on(...args){return this.inner.on(...args)}query(...args){return this.inner.query(...args)}end(){return this.inner.end()}
      async connect(){const client=await this.inner.connect();let finishing=false;return {
        async query(...args){const sql=typeof args[0]==='string'?args[0]:args[0]?.text;if(sql?.startsWith('SELECT private.finish_booking_external_attempt'))finishing=true;
          const result=await client.query(...args);if(finishing&&sql==='COMMIT')throw new Error('OWNED_COMMIT_RESPONSE_LOST');return result},release:()=>client.release()}}
    }
    const commitWorker=makeWorker({Pool:CommitDropPool,adapters:[adapters[0]],limit:1}),commitRun=await commitWorker.tick();await worker.tick();
    rec('lost-real-commit-response-keeps-accepted-receipt-and-never-resends',commitRun.unconfirmed===1&&(await state(commitEvent,commitLost)).state==='accepted'
      &&(await state(commitEvent,commitLost)).attempts===1&&hits(commitLost)===1,{actualCommitResponseLoss:true});
    await externalFs.mkdir(fileRoot,{mode:0o700});filesCreated=true;
    const put=async(name,value)=>{const file=fileRoot+'/'+name;await externalFs.writeFile(file,typeof value==='string'?value:JSON.stringify(value),{mode:0o600,flag:'wx'});ownedFiles.push(file);return file};
    const opDsn=await put('operator-dsn','postgres://'+opLogin+':'+opPassword+'@db/postgres?sslmode=disable');
    const workerDsn=await put('worker-dsn','postgres://'+login+':'+password+'@db/postgres?sslmode=disable');
    const opFile=await put('operator.json',{version:1,databaseUrlFile:opDsn});
    const workerAsOp=await put('worker-as-operator.json',{version:1,databaseUrlFile:workerDsn});
    const pubFile=await put('vapid-public',vapid.getPublicKey().toString('base64url')),privateFile=await put('vapid-private',vapid.getPrivateKey().toString('base64url'));
    const tokenFile=await put('telegram-token',botToken);
    const workerConfiguration={version:1,instanceId:'owned-booking-worker',databaseUrlFile:workerDsn,channels:['push','telegram'],
      push:{publicKeyFile:pubFile,privateKeyFile:privateFile,subject:'mailto:ops@roomqc.invalid'},telegram:{botTokenFile:tokenFile,appOrigin:'https://roomqc.invalid',apiOrigin:origin},
      connectionBudget:{maxConnections:40,reservedConnections:3,otherConnections:25,workerInstances:1,workerPoolMax:2},developmentOrigins:[origin]};
    const workerFile=await put('worker.json',workerConfiguration),cliOutputs=[];
    const runCli=async(script,args,extraEnv={})=>{
      const child=externalSpawn(process.execPath,[script,...args],{stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'development',ROOMQC_BOOKING_ALLOW_LOCAL:'true',...extraEnv}});
      children.add(child);let stdout='',stderr='';const timer=setTimeout(()=>child.kill('SIGKILL'),25000);
      child.stdout.on('data',chunk=>stdout=(stdout+chunk.toString()).slice(-65536));child.stderr.on('data',chunk=>stderr=(stderr+chunk.toString()).slice(-8192));
      const exit=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));clearTimeout(timer);children.delete(child);
      cliOutputs.push(stdout+stderr);let data;try{data=JSON.parse((stdout.trim()||stderr.trim()))}catch{data=null}return {...exit,data};
    };
    const operatorCli=async(command,configPath=opFile)=>runCli('/control/booking-notification-operator.mjs',
      ['--config-file',configPath,'--command-file',await put('command-'+randomUUID()+'.json',command)]);
    const opChannels=await operatorCli({version:1,operation:'channels'});
    rec('actual-cli-reads-only-safe-channel-metadata',opChannels.code===0&&opChannels.data?.channels.length===2
      &&opChannels.data.channels.every(c=>c.enabled&&/^[a-f0-9]{64}$/.test(c.configurationId)),{actualCliProcess:true});
    let after=null,hasMore=true;const pageIds=[];
    while(hasMore&&pageIds.length<500){
      const page=await operatorCli({version:1,operation:'list',state:null,eventId:null,after,limit:7});
      assert.equal(page.code,0,'Owned operator page must succeed');pageIds.push(...page.data.rows.map(r=>r.targetId));hasMore=page.data.hasMore;after=page.data.nextAfter;
    }
    const expectedPages=Number((await db.query('SELECT count(*) AS n FROM private.booking_notification_targets')).rows[0].n);
    rec('actual-cli-keyset-pages-cover-every-target-once',!hasMore&&pageIds.length===expectedPages&&new Set(pageIds).size===expectedPages
      &&pageIds.every((id,n)=>n===0||id>pageIds[n-1]),{actualCliProcess:true,targets:expectedPages,pageLimit:7});
    const unknownPage=await operatorCli({version:1,operation:'list',state:'unknown',eventId:null,after:null,limit:2});
    rec('actual-cli-filters-unknown-targets-server-side',unknownPage.code===0&&unknownPage.data.rows.length===2&&unknownPage.data.rows.every(r=>r.state==='unknown'),{actualCliProcess:true});
    const cliKey=randomUUID(),configureCommand={version:1,operation:'configure',commandId:cliKey,channel:'push',configurationId:adapters[0].configurationId,enabled:true,reason:'Owned CLI channel command'};
    const configured=await operatorCli(configureCommand),configuredBefore=await snapshot(),configuredReplay=await operatorCli(configureCommand);
    const configuredReceipt=await operatorCli({version:1,operation:'receipt',commandId:cliKey});
    rec('actual-cli-configure-replay-and-receipt-have-one-effect',configured.code===0&&configuredReplay.data?.result.replayed===true
      &&configuredReceipt.data?.state==='completed'&&configuredBefore===await snapshot(),{actualCliProcess:true});
    const conflictCli=await operatorCli({...configureCommand,enabled:false});
    rec('actual-cli-mutation-conflict-preserves-effects',conflictCli.code===1&&conflictCli.data?.code==='BOOKING_OPERATOR_COMMAND_CONFLICT'&&configuredBefore===await snapshot(),{actualCliProcess:true});
    const actorHidden=(await db.query('SELECT private.get_booking_notification_operator_result($1) AS result',[cliKey])).rows[0].result;
    rec('operator-receipt-is-hidden-from-different-session-login',actorHidden===null,{differentSessionLogin:true});
    const cliUnknown=unknowns[2],unsafeCli=await operatorCli({version:1,operation:'resolve',commandId:randomUUID(),targetId:cliUnknown.id,resolution:'retry',reason:'Owned CLI unsafe retry',acceptDuplicateRisk:false});
    rec('actual-cli-unknown-retry-without-risk-consent-is-denied',unsafeCli.code===1&&unsafeCli.data?.code==='BOOKING_OPERATOR_NOT_ALLOWED'&&hits(cliUnknown.t)===1,{actualCliProcess:true});
    const suppressedCli=await operatorCli({version:1,operation:'resolve',commandId:randomUUID(),targetId:cliUnknown.id,resolution:'suppress',reason:'Owned CLI suppress without false success',acceptDuplicateRisk:false});
    rec('actual-cli-suppression-keeps-provider-outcome-distinct',suppressedCli.code===0&&suppressedCli.data?.result.state==='resolved'
      &&(await state(cliUnknown.f,cliUnknown.t)).state==='resolved'&&hits(cliUnknown.t)===1,{actualCliProcess:true});
    const wrongLogin=await operatorCli({version:1,operation:'channels'},workerAsOp);
    rec('actual-cli-refuses-worker-credentials-as-operator',wrongLogin.code===1&&wrongLogin.data?.code==='BOOKING_NOTIFICATION_ROLE_UNSAFE',{actualCliProcess:true});
    await externalFs.chmod(opDsn,0o644);const publicSecret=await operatorCli({version:1,operation:'channels'});await externalFs.chmod(opDsn,0o600);
    rec('actual-linux-cli-rejects-world-readable-credential-file',publicSecret.code===1&&publicSecret.data?.code==='BOOKING_NOTIFICATION_CONFIG_INVALID',{actualCliProcess:true,nativeUid:process.getuid()});
    const secretLink=fileRoot+'/dsn-link';await externalFs.symlink(opDsn,secretLink);ownedFiles.push(secretLink);
    const linkFile=await put('operator-link.json',{version:1,databaseUrlFile:secretLink}),linked=await operatorCli({version:1,operation:'channels'},linkFile);
    rec('actual-linux-cli-rejects-symlink-secret-file',linked.code===1&&linked.data?.code==='BOOKING_NOTIFICATION_CONFIG_INVALID',{actualCliProcess:true});
    const parentLink='/dev/shm/roomqc-booking-link-'+input.run;await externalFs.symlink(fileRoot,parentLink);ownedFiles.push(parentLink);
    const parentFile=await put('operator-parent-link.json',{version:1,databaseUrlFile:parentLink+'/operator-dsn'}),linkedParent=await operatorCli({version:1,operation:'channels'},parentFile);
    rec('actual-linux-cli-rejects-symlink-parent-directory',linkedParent.code===1&&linkedParent.data?.code==='BOOKING_NOTIFICATION_CONFIG_INVALID',{actualCliProcess:true});
    const lostKey=randomUUID(),lostCommand={...configureCommand,commandId:lostKey,reason:'Owned actual DB commit before injected reply loss'},lostCommandFile=await put('lost-reply-command.json',lostCommand),lostOutput=[];
    class LostOperatorPool{
      constructor(options){this.inner=new pg.Pool(options)}on(...args){return this.inner.on(...args)}end(){return this.inner.end()}
      async connect(){const client=await this.inner.connect();return {async query(...args){const result=await client.query(...args);
        if(args[0].includes('configure_booking_notification_channel'))throw new Error('OWNED_OPERATOR_REPLY_LOSS_AFTER_COMMIT');return result},release:()=>client.release()}}
    }
    const lostExit=await externalOperatorMain(['--config-file',opFile,'--command-file',lostCommandFile],{NODE_ENV:'development',ROOMQC_BOOKING_ALLOW_LOCAL:'true'},
      {log:v=>lostOutput.push(v),error:v=>lostOutput.push(v)},{Pool:LostOperatorPool});
    const lostValue=JSON.parse(lostOutput.at(-1)),lostBefore=await snapshot(),lostReceipt=await operatorCli({version:1,operation:'receipt',commandId:lostKey}),lostReplay=await operatorCli(lostCommand);
    rec('operator-recovers-committed-command-after-injected-reply-loss',lostExit===1&&lostValue.code==='BOOKING_OPERATOR_OUTCOME_UNCONFIRMED'
      &&lostValue.recovery?.commandId===lostKey&&lostReceipt.data?.state==='completed'&&lostReplay.data?.result.replayed===true&&lostBefore===await snapshot(),
      {actualDatabaseCommitBeforeInjectedReplyLoss:true,notTcpPacketDrop:true});
    const runtimeRequests=requests.length,check=await runCli('/control/workers/booking-external-runtime.mjs',['--check','--config-file',workerFile]);
    rec('actual-runtime-check-reports-config-readiness-without-sending',check.code===0&&check.data?.checkOnly===true&&check.data.ready===true&&requests.length===runtimeRequests,{actualCliProcess:true});
    await config('telegram',false);const disabledCheck=await runCli('/control/workers/booking-external-runtime.mjs',['--check','--config-file',workerFile]);await config('telegram');
    rec('actual-runtime-check-reports-disabled-channel-as-not-ready',disabledCheck.code===2&&disabledCheck.data?.ready===false&&requests.length===runtimeRequests,{actualCliProcess:true});
    const productionCheck=await runCli('/control/workers/booking-external-runtime.mjs',['--check','--config-file',workerFile],{NODE_ENV:'production'});
    rec('actual-runtime-requires-production-shared-budget-before-provider-config',productionCheck.code===1
      &&productionCheck.data?.code==='RESOURCE_BUDGET_REQUIRED'&&requests.length===runtimeRequests,{actualCliProcess:true});
    const consumers=(ids,active)=>ids.map(id=>({id,replicas:active[id]?1:0,pools:active[id]?.pools??[],fixedConnectionsPerReplica:active[id]?.fixed??0}));
    const productionBudget={schemaVersion:1,environment:'production',databases:[
      {id:'owned-directory',kind:'directory',maxConnections:40,reservedConnections:3,
        consumers:consumers(['control-api','provisioning-worker','health-worker','alert-worker','probe-catalog','db-exporter','migration','backup'],
          {'control-api':{pools:[{id:'main',max:1}]}})},
      {id:'owned-business',kind:'business',maxConnections:40,reservedConnections:3,
        consumers:consumers(['auth','rest','realtime','storage','functions','inapp-notifications','external-notifications','reports','db-exporter','migration','backup'],
          {auth:{fixed:25},'external-notifications':{pools:[{id:'main',max:2}]}})}
    ]};
    assert.equal(externalResourceBudget(productionBudget).databases[1].allocatedConnections,27);
    const productionBudgetFile=await put('production-budget.json',productionBudget);
    const productionEnv={NODE_ENV:'production',ROOMQC_RESOURCE_ENVIRONMENT:'production',ROOMQC_RESOURCE_BUDGET_FILE:productionBudgetFile,
      ROOMQC_RESOURCE_DATABASE_ID:'owned-business'};
    const secureDsn=await put('secure-worker-dsn','postgres://'+login+':'+password+'@db/postgres?sslmode=verify-full');
    const productionConfiguration={...workerConfiguration,telegram:{botTokenFile:tokenFile,appOrigin:'https://roomqc.invalid'}};
    delete productionConfiguration.developmentOrigins;
    const productionBefore=await snapshot();
    for(const [label,raw]of [
      ['plain-db',{...productionConfiguration}],
      ['local-provider',{...workerConfiguration,databaseUrlFile:secureDsn}]
    ]){
      const path=await put('production-'+label+'.json',raw),denied=await runCli('/control/workers/booking-external-runtime.mjs',
        ['--check','--config-file',path],productionEnv);
      rec('actual-runtime-rejects-'+label+'-with-valid-production-budget',denied.code===1
        &&denied.data?.code==='BOOKING_NOTIFICATION_CONFIG_INVALID'&&requests.length===runtimeRequests&&productionBefore===await snapshot(),
        {actualCliProcess:true,validProductionBudget:true});
    }
    const downgrade=await runCli('/control/workers/booking-external-runtime.mjs',['--check','--config-file',workerFile],
      {...productionEnv,ROOMQC_RESOURCE_ENVIRONMENT:'local'});
    rec('actual-runtime-rejects-production-environment-downgrade',downgrade.code===1&&downgrade.data?.code==='RESOURCE_RUNTIME_MISMATCH'
      &&requests.length===runtimeRequests&&productionBefore===await snapshot(),{actualCliProcess:true});
    // Allocation applies only to this daemon scenario; auth's fixed allowance
    // is not a measurement of all fixture processes or total server capacity.
    const localBudget={...productionBudget,environment:'local'},localBudgetFile=await put('local-budget.json',localBudget);
    const poolEnv={ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_RESOURCE_BUDGET_FILE:localBudgetFile,
      ROOMQC_RESOURCE_DATABASE_ID:'owned-business',ROOMQC_RESOURCE_POOL_OBSERVATIONS:'true'};
    const runPush=await target('push'),runTelegram=await target('telegram'),runtimeEvent=await fresh([runPush,runTelegram]);
    const daemon=externalSpawn(process.execPath,['/control/workers/booking-external-runtime.mjs','--config-file',workerFile],{stdio:['ignore','pipe','pipe'],
      env:{...process.env,NODE_ENV:'development',ROOMQC_BOOKING_ALLOW_LOCAL:'true',...poolEnv}});children.add(daemon);let daemonOutput='';
    daemon.stdout.on('data',chunk=>daemonOutput=(daemonOutput+chunk.toString()).slice(-16384));daemon.stderr.on('data',chunk=>daemonOutput=(daemonOutput+chunk.toString()).slice(-16384));
    const daemonClosed=new Promise(resolve=>daemon.once('close',(code,signal)=>resolve({code,signal})));
    try{
      let lastReadyCode='NO_RESPONSE';
      try{await waitUntil(async()=>{
        if(daemon.exitCode!==null||daemon.signalCode!==null)throw new Error('EXTERNAL_RUNTIME_EXITED');
        try{const res=await fetch('http://127.0.0.1:8094/readyz',{signal:AbortSignal.timeout(1000)});
          const data=await res.json();lastReadyCode=/^[A-Z_]{1,80}$/.test(data.code??'')?data.code:'NO_CODE';return res.ok}catch{return false}
      })}catch{
        const codes=daemonOutput.split('\n').flatMap(line=>{try{const data=JSON.parse(line);return /^[A-Z_]{1,80}$/.test(data.code??'')?[data.code]:[]}catch{return[]}});
        throw new Error('EXTERNAL_RUNTIME_NOT_READY:'+lastReadyCode+':'+(codes.at(-1)??'NO_RUNTIME_ERROR')+':EXIT_'+daemon.exitCode);
      }
      const readyResponse=await fetch('http://127.0.0.1:8094/readyz'),view=await readyResponse.json();
      rec('actual-runtime-process-drains-both-channels-and-serves-private-readiness',readyResponse.status===200&&view.ready===true&&view.deviceDeliveryProven===false
        &&(await states(runtimeEvent)).every(s=>s.state==='accepted')&&hits(runPush)===1&&hits(runTelegram)===1,{actualRuntimeProcess:true});
      const live=await fetch('http://127.0.0.1:8094/livez'),wrongMethod=await fetch('http://127.0.0.1:8094/readyz',{method:'POST'});
      rec('runtime-health-endpoints-are-read-only-and-not-cached',live.status===200&&wrongMethod.status===404&&live.headers.get('cache-control')==='no-store',{actualRuntimeProcess:true});
      const samplePool=async()=>{const res=await fetch('http://127.0.0.1:8098/resource-targets',{signal:AbortSignal.timeout(6000)});
        return {status:res.status,body:await res.json()}};
      // Catalog observation is opt-in; grant only to the exact-owned fixture
      // LOGIN after proving missing privilege fails closed. No product SQL.
      // The pinned Supabase fixture may inherit catalog EXECUTE from PUBLIC.
      // Isolate denial only inside this disposable database and restore every
      // original effective ACL entry before dropping the fixture LOGIN.
      catalogBaseline=await catalogAcl();
      const catalogOwner=(await catalogAdmin.query(`SELECT current_user::text AS caller,pg_get_userbyid(proowner) AS owner
        FROM pg_proc WHERE oid='pg_catalog.pg_control_system()'::regprocedure`)).rows[0];
      assert.equal(catalogOwner.caller,'supabase_admin');
      await catalogAdmin.query(`REVOKE EXECUTE ON FUNCTION pg_catalog.pg_control_system() FROM PUBLIC,${login}`);
      assert.equal((await catalogAdmin.query('SELECT has_function_privilege($1,\'pg_catalog.pg_control_system()\',\'EXECUTE\') AS allowed',[login])).rows[0].allowed,false);
      const beforePool=await snapshot(),requestsBeforePool=requests.length,deniedPool=await samplePool();
      rec('actual-daemon-pool-catalog-denial-has-no-business-effects-or-provider-sends',deniedPool.status===503
        &&deniedPool.body.code==='RESOURCE_POOL_UNAVAILABLE'&&beforePool===await snapshot()&&requests.length===requestsBeforePool,{actualRuntimeProcess:true});
      await catalogAdmin.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${login}`);
      const firstPool=await samplePool();assert.equal(firstPool.status,200);externalValidatePoolSample(firstPool.body);
      const expectedPool=externalDatabaseDigests({...await externalReadDatabaseCatalog(catalogAdmin),role:login});
      assert.deepEqual(firstPool.body.bindings,[{consumerId:'external-notifications',poolId:'main',poolMax:2,...expectedPool}]);
      assert.equal(firstPool.body.resources.databaseId,'owned-business');
      assert.equal(firstPool.body.resources.budgetSha256,createHash('sha256').update(JSON.stringify(localBudget)).digest('hex'));
      assert.deepEqual(firstPool.body.resources.consumers,[{id:'external-notifications',replicas:1,pools:[{id:'main',max:2}],fixedConnectionsPerReplica:0}]);
      assert.ok(![password,login,botToken,'postgres://'].some(secret=>JSON.stringify(firstPool.body).includes(secret)));
      rec('actual-daemon-shared-two-connection-pool-matches-reviewed-budget-database-and-login',beforePool===await snapshot()
        &&requests.length===requestsBeforePool&&(await fetch('http://127.0.0.1:8094/resource-targets')).status===404,
        {actualRuntimeProcess:true,actualSharedRuntimePool:true,explicitFixtureCatalogGrant:true,scopedFixtureBudget:true,
          catalogPreparationRole:'supabase_admin; fixture catalog only',catalogOwner:catalogOwner.owner,sample:firstPool.body});
      const runningCheck=await runCli('/control/workers/booking-external-runtime.mjs',['--check','--config-file',workerFile],poolEnv);
      rec('runtime-check-can-run-while-daemon-health-port-is-already-bound',runningCheck.code===0&&runningCheck.data?.ready===true,{actualRuntimeProcess:true});
      await config('telegram',false);const disabledSnapshot=await snapshot(),liveDisabled=await fetch('http://127.0.0.1:8094/readyz'),disabledPool=await samplePool();
      assert.equal(disabledPool.status,200);externalValidatePoolSample(disabledPool.body);
      assert.equal(disabledPool.body.processNonce,firstPool.body.processNonce);assert.deepEqual(disabledPool.body.bindings,firstPool.body.bindings);
      rec('healthy-pool-catalog-does-not-override-disabled-channel-readiness',liveDisabled.status===503
        &&disabledSnapshot===await snapshot()&&requests.length===requestsBeforePool,{actualRuntimeProcess:true});
      await config('telegram');
      rec('live-runtime-readiness-rechecks-disabled-metadata',liveDisabled.status===503,{actualRuntimeProcess:true});
      await catalogAdmin.query(`REVOKE EXECUTE ON FUNCTION pg_catalog.pg_control_system() FROM ${login}`);
      const lostPool=await samplePool();assert.equal(lostPool.status,503);
      await catalogAdmin.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${login}`);
      const restoredPool=await samplePool();assert.equal(restoredPool.status,200);externalValidatePoolSample(restoredPool.body);
      assert.equal(restoredPool.body.processNonce,firstPool.body.processNonce);assert.deepEqual(restoredPool.body.bindings,firstPool.body.bindings);
      rec('actual-daemon-pool-catalog-revoke-restore-recovers-without-restart-or-another-send',
        requests.length===requestsBeforePool&&(await fetch('http://127.0.0.1:8094/readyz')).status===200,{actualRuntimeProcess:true});
      daemon.kill('SIGTERM');const stopped=await daemonClosed;children.delete(daemon);
      rec('actual-runtime-sigterm-exits-cleanly-without-another-send',stopped.code===0&&stopped.signal===null&&hits(runPush)===1&&hits(runTelegram)===1,{actualRuntimeProcess:true});
    }finally{if(daemon.exitCode===null&&daemon.signalCode===null){daemon.kill('SIGKILL');await daemonClosed}children.delete(daemon);cliOutputs.push(daemonOutput)}
    rec('operator-and-runtime-outputs-do-not-expose-private-config-or-destinations',![password,opPassword,botToken,auth,origin,vapid.getPrivateKey().toString('base64url')]
      .some(secret=>cliOutputs.some(text=>text.includes(secret))));
    const contractsTarget=await target('telegram'),contractsEvent=await fresh([contractsTarget]);
    const claim=(await manual.query("SELECT private.claim_booking_external_target('telegram') AS result")).rows[0].result;
    const contractClient=await manual.connect(),attemptId=randomUUID();
    try{
      await contractClient.query('BEGIN');const ready=(await contractClient.query('SELECT private.prepare_booking_external_target($1,$2,$3) AS result',
        [claim.target_id,claim.lease_id,adapters[1].configurationId])).rows[0].result;
      const begin=(await manual.query('SELECT private.begin_booking_external_attempt($1,$2,$3) AS result',[claim.target_id,claim.lease_id,attemptId])).rows[0].result;
      const marker=(await db.query('SELECT outcome FROM private.booking_notification_attempts WHERE id=$1',[attemptId])).rows[0];
      rec('separate-journal-commit-coexists-with-live-no-key-update-lock',ready.status==='authorized'&&begin===attemptId&&marker?.outcome==='started');
      const begunAgain=(await manual.query('SELECT private.begin_booking_external_attempt($1,$2,$3) AS result',[claim.target_id,claim.lease_id,attemptId])).rows[0].result;
      const conflict=await deniedSql(manual,'SELECT private.begin_booking_external_attempt($1,$2,$3)',[claim.target_id,claim.lease_id,randomUUID()]);
      rec('journal-attempt-id-replay-is-idempotent-and-conflict-is-denied',begunAgain===attemptId&&conflict.code==='23505'&&conflict.unchanged);
      let invalidResults=0;
      for(const [outcome,status,message]of [['accepted',null,'1'],['accepted',200,'0'],['accepted',201,'1'],['accepted',200,null],
        ['retry',500,null],['rejected',500,null],['rejected',408,null],['rejected',429,null],['unknown',200,'1']]){
        await contractClient.query('SAVEPOINT result_contract');
        try{await contractClient.query('SELECT private.finish_booking_external_attempt($1,$2,$3,$4,$5,$6,0)',
          [claim.target_id,claim.lease_id,attemptId,outcome,status,message])}catch(error){if(error.code==='22023')invalidResults++}
        await contractClient.query('ROLLBACK TO SAVEPOINT result_contract');
      }
      rec('database-rejects-fake-acceptance-and-unsafe-retry-contracts',invalidResults===9,{denials:invalidResults});
      await contractClient.query("SELECT private.finish_booking_external_attempt($1,$2,$3,'unknown',NULL,NULL,0)",[claim.target_id,claim.lease_id,attemptId]);
      await contractClient.query('COMMIT');rec('database-unknown-result-contract-preserves-terminal-outcome',(await state(contractsEvent,contractsTarget)).state==='unknown');
    }finally{await contractClient.query('ROLLBACK');contractClient.release()}
    for(const role of ['anon','authenticated','service_role']){
      const client=await db.connect();let denials=0;
      try{
        await client.query('BEGIN');await client.query('SET LOCAL ROLE '+role);
        for(const sql of ["SELECT private.claim_booking_external_target('push')",
          `SELECT private.prepare_booking_external_target('${randomUUID()}','${randomUUID()}','${adapters[0].configurationId}')`,
          `SELECT private.begin_booking_external_attempt('${randomUUID()}','${randomUUID()}','${randomUUID()}')`,
          `SELECT private.configure_booking_notification_channel('push','${adapters[0].configurationId}',true,'${randomUUID()}','Owned browser denial')`,
          `SELECT private.resolve_booking_notification_target('${randomUUID()}','${randomUUID()}','retry','Owned browser denial',true)`,
          'SELECT private.inspect_booking_notification_channels()',
          'SELECT private.list_booking_notification_targets()',
          `SELECT private.get_booking_notification_operator_result('${randomUUID()}')`]){
          await client.query('SAVEPOINT role_denial');try{await client.query(sql)}catch(error){if(error.code==='42501')denials++}
          await client.query('ROLLBACK TO SAVEPOINT role_denial');
        }
      }finally{await client.query('ROLLBACK');client.release()}
      rec(role+'-cannot-call-worker-or-operator-private-functions',denials===8,{denials});
    }
    const workerConfigure=await deniedSql(manual,'SELECT private.configure_booking_notification_channel($1,$2,true,$3,$4)',
      ['push',adapters[0].configurationId,randomUUID(),'Owned worker must not configure']);
    rec('worker-cannot-configure-or-enable-channel',workerConfigure.code==='42501'&&workerConfigure.unchanged);
    const operatorClaim=await deniedSql(operator,"SELECT private.claim_booking_external_target('push')");
    rec('operator-cannot-claim-or-dispatch',operatorClaim.code==='42501'&&operatorClaim.unchanged);
    const operatorDml=await deniedSql(operator,'UPDATE private.booking_notification_targets SET attempts=0');
    rec('operator-cannot-directly-reset-attempt-budgets',operatorDml.code==='42501'&&operatorDml.unchanged);
    for(const grant of ['table','column','schema','extra-role']){
      const extra='owned_external_extra_'+input.run;
      if(grant==='table')await db.query(`GRANT SELECT ON public.rooms TO ${login}`);
      if(grant==='column')await db.query(`GRANT UPDATE(notes) ON public.room_bookings TO ${login}`);
      if(grant==='schema')await db.query(`GRANT CREATE ON SCHEMA private TO ${login}`);
      if(grant==='extra-role')await db.query(`CREATE ROLE ${extra} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;GRANT ${extra} TO ${login}`);
      const before=await snapshot(),beforeRequests=requests.length;
      try{rec('worker-rejects-unreviewed-'+grant+'-privilege',(await worker.tick()).code==='BOOKING_EXTERNAL_ROLE_UNSAFE'
        &&before===await snapshot()&&requests.length===beforeRequests)}
      finally{
        if(grant==='table')await db.query(`REVOKE SELECT ON public.rooms FROM ${login}`);
        if(grant==='column')await db.query(`REVOKE UPDATE(notes) ON public.room_bookings FROM ${login}`);
        if(grant==='schema')await db.query(`REVOKE CREATE ON SCHEMA private FROM ${login}`);
        if(grant==='extra-role')await db.query(`REVOKE ${extra} FROM ${login};DROP ROLE ${extra}`);
      }
    }
    const unsafe=makeWorker({connection:{...connection,user:'postgres',password:input.databasePassword}}),unsafeBefore=await snapshot();
    rec('worker-refuses-fixture-installer-login-without-effects',(await unsafe.tick()).code==='BOOKING_EXTERNAL_ROLE_UNSAFE'&&unsafeBefore===await snapshot());
    rec('every-real-http-request-had-independently-visible-durable-started-journal',journals.length>0&&journals.every(Boolean),{requests:journals.length});
    const serialized=JSON.stringify(events);
    rec('worker-events-only-safe-aggregates',events.length>0&&![password,opPassword,botToken,auth,origin,a.id,manager.id].some(v=>serialized.includes(v)));
  }finally{
    pause?.release();await Promise.allSettled([...children].map(child=>new Promise(resolve=>{
      if(child.exitCode!==null||child.signalCode!==null){resolve();return}child.once('close',resolve);child.kill('SIGKILL');
    })));
    await Promise.allSettled(workers.map(w=>w.shutdown()));await manual.end();await operator.end();
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    for(const file of ownedFiles.reverse())await externalFs.unlink(file);
    if(filesCreated)await externalFs.rmdir(fileRoot);
    try{
      await catalogAdmin.query(`REVOKE EXECUTE ON FUNCTION pg_catalog.pg_control_system() FROM ${login}`);
      if(catalogBaseline){
        const publicExecute=catalogBaseline.find(a=>a.grantee==='0'&&a.privilege==='EXECUTE');
        if(publicExecute){assert.equal(publicExecute.grantable,false);await catalogAdmin.query('GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO PUBLIC')}
        assert.deepEqual(await catalogAcl(),catalogBaseline);
        rec('fixture-restores-original-catalog-acl-after-pool-observation',true,{actualAclRestored:true});
      }
      await db.query(`DROP ROLE ${login};DROP ROLE ${opLogin}`);
    }finally{await catalogAdmin.end()}
  }
}
