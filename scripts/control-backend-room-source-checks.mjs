// Real Auth/REST source commands on the exact-owned disposable backend only.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_WORKFLOW_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);
const db=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,
  max:5,statement_timeout:15000,connectionTimeoutMillis:5000,application_name:'owned-room-source-'+input.run});
const checks=[],races=[];let serial=0;
async function call(path,token,body){
  const r=await fetch('http://127.0.0.1:8000'+path,{method:'POST',signal:AbortSignal.timeout(25000),headers:{
    apikey:input.publishableKey,authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation'},body:JSON.stringify(body)});
  let data;try{data=await r.json()}catch{data=null}return{status:r.status,data};
}
async function login(u){const r=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:u.email,password:u.password});
  assert.equal(r.status,200);u.token=r.data.access_token;u.sessionId=JSON.parse(Buffer.from(u.token.split('.')[1],'base64url')).session_id;}
async function account(label){const u={email:'room-source-'+input.run+'-'+label+'@roomqc.invalid',password:randomBytes(32).toString('hex')};
  const r=await call('/auth/v1/admin/users',input.serviceKey,{email:u.email,password:u.password,email_confirm:true});assert.equal(r.status,200);u.id=r.data.id;await login(u);return u;}
async function insert(table,body){const r=await call('/rest/v1/'+table,input.serviceKey,body);assert.equal(r.status,201,'Owned room fixture '+table);return r.data[0];}
async function owner(label){const u=await account(label),r=await call('/rest/v1/rpc/provision_workspace_registration',input.serviceKey,{
  p_workspace_id:randomUUID(),p_owner_id:u.id,p_fields:{fullName:'Owned room source fixture',phone:'0901234567',
    tenantName:'Owned room source fixture',hotelName:'Owned room source fixture',hotelAddress:'123 Fixture Road',
    hotelPhone:'0281234567',hotelEmail:u.email,totalRooms:3}});assert.equal(r.status,200);assert.equal(r.data.success,true);
  return{...u,tenantId:r.data.tenant_id,hotelId:r.data.hotel_id};}
async function room(a,hotelId=a.hotelId,status='vacant_clean'){return insert('rooms',{id:randomUUID(),tenant_id:a.tenantId,hotel_id:hotelId,
  room_number:'S'+(++serial),room_type:'standard',floor:1,status});}
const transition=(u,r,to='occupied_clean',extra={})=>call('/rest/v1/rpc/transition_room_status',u.token,{_room_id:r.id,_to_status:to,...extra});
const lookup=(u,id)=>call('/rest/v1/rpc/get_room_transition_result',u.token,{p_command_id:id});
const cancelCommand=(u,r,to,id,extra={})=>call('/rest/v1/rpc/cancel_room_transition_command',u.token,{_room_id:r.id,_to_status:to,_command_id:id,...extra});
function record(label,passed,details={}){checks.push({label,passed,...details});}
async function snapshot(){return(await db.query(`SELECT jsonb_build_object(
  'rooms',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.rooms r),
  'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.audit_log a),
  'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY actor_id,command_id) FROM private.workflow_room_transition_commands c)
  )::text AS value`)).rows[0].value;}
async function denied(label,fn,statuses=[401,403]){const before=await snapshot(),r=await fn(),unchanged=before===await snapshot();
  record(label,statuses.includes(r.status)&&unchanged,{status:r.status,effectsUnchanged:unchanged});return r;}
async function counts(r){return(await db.query(`SELECT
  (SELECT count(*) FROM public.audit_log WHERE table_name='rooms' AND record_id=$1 AND action='state_change')::integer AS audit,
  (SELECT count(*) FROM public.audit_log WHERE table_name='rooms' AND record_id=$1 AND action='update')::integer AS updates,
  (SELECT count(*) FROM private.workflow_room_transition_commands WHERE room_id=$1)::integer AS commands,
  (SELECT count(*) FROM private.workflow_room_transition_commands WHERE room_id=$1 AND event_id IS NOT NULL)::integer AS events`,[r.id])).rows[0];}
async function waitOnLock(name='transition_room_status'){const end=Date.now()+6000;while(Date.now()<end){const q=await db.query(`SELECT count(*) AS n FROM pg_stat_activity
  WHERE pid<>pg_backend_pid() AND state='active' AND wait_event_type='Lock' AND query LIKE $1`,['%'+name+'%']);
  if(Number(q.rows[0].n)>0)return;await new Promise(r=>setTimeout(r,20));}throw new Error('ROOM_NATIVE_LOCK_BARRIER_NOT_OBSERVED');}
async function expiryRace(label,a,r,kind){
  const commandId=randomUUID(),before=await snapshot(),lock=await db.connect();
  try{
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1",[a.sessionId]);
    await lock.query('BEGIN');
    if(kind==='room')await lock.query('SELECT id FROM public.rooms WHERE id=$1 FOR UPDATE',[r.id]);
    else if(kind==='hotel')await lock.query('SELECT id FROM public.hotels WHERE id=$1 FOR UPDATE',[r.hotel_id]);
    else await lock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a.id+':'+commandId]);
    const pending=transition(a,r,'occupied_clean',{_command_id:commandId});await waitOnLock();
    await db.query('SELECT pg_sleep(1.6)');await lock.query('COMMIT');const res=await pending,unchanged=before===await snapshot();
    const passed=res.status===403&&unchanged;record(label,passed,{status:res.status,effectsUnchanged:unchanged,realLockBarrier:true});
    races.push({label,passed,realLockBarrier:true,kind});
  }finally{await lock.query('ROLLBACK');lock.release();await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);}
}
async function fault(label,a,r,target){
  const before=await snapshot(),id=randomUUID();
  const table=target==='audit'?'public.audit_log':'private.workflow_room_transition_commands';
  const condition=target==='audit'?"NEW.table_name='rooms' AND NEW.record_id='"+r.id+"'::uuid":"NEW.command_id='"+id+"'::uuid";
  await db.query(`CREATE FUNCTION private.owned_room_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF ${condition} THEN RAISE EXCEPTION 'OWNED_ROOM_SOURCE_FAULT'; END IF; RETURN NEW; END;$f$;
    CREATE TRIGGER owned_room_source_fault BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION private.owned_room_fault()`);
  let failed;try{failed=await transition(a,r,'occupied_clean',{_command_id:id});}
  finally{await db.query(`DROP TRIGGER owned_room_source_fault ON ${table};DROP FUNCTION private.owned_room_fault()`);}
  const unchanged=before===await snapshot();record(label+'-rolls-back-room-audit-and-command',failed.status>=400&&unchanged,{status:failed.status,effectsUnchanged:unchanged});
  const recovered=await transition(a,r,'occupied_clean',{_command_id:id}),c=await counts(r);
  record(label+'-same-command-recovers-once',recovered.status===200&&c.audit===1&&c.commands===1&&c.events===1,{status:recovered.status,...c});
}
async function cancellationRace(a,r,cancelFirst){
  const id=randomUUID(),lock=await db.connect(),label=cancelFirst?'cancel-before-source':'source-before-cancel';
  try{
    await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a.id+':'+id]);
    const first=cancelFirst?cancelCommand(a,r,'occupied_clean',id):transition(a,r,'occupied_clean',{_command_id:id});
    await waitOnLock(cancelFirst?'cancel_room_transition_command':'transition_room_status');
    const second=cancelFirst?transition(a,r,'occupied_clean',{_command_id:id}):cancelCommand(a,r,'occupied_clean',id);
    await waitOnLock(cancelFirst?'transition_room_status':'cancel_room_transition_command');
    await lock.query('COMMIT');const responses=await Promise.all([first,second]),c=await counts(r);
    const passed=responses.every(x=>x.status===200)&&c.commands===1&&c.audit===(cancelFirst?0:1)&&c.events===(cancelFirst?0:1)
      &&(cancelFirst?responses.every(x=>x.data?.state==='cancelled'):responses.every(x=>x.data?.workflow_event_id===responses[0].data?.workflow_event_id));
    record(label+'-actual-lock-race',passed,{...c,realLockBarrier:true});races.push({label,passed,realLockBarrier:true,kind:'source-cancel'});
  }finally{await lock.query('ROLLBACK');lock.release();}
}
function tabStorage(){const rows=new Map();return {get length(){return rows.size},key:i=>[...rows.keys()][i]??null,
  getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};}
function appClient(a,storage,mode){
  const requests=[];
  const client=RoomQCRoomCaller.createRoomTransitionClient({endpoint:'http://127.0.0.1:8000',publishableKey:input.publishableKey,storage:()=>storage,
    getSession:async()=>({data:{session:{access_token:a.token,user:{id:a.id}}},error:null}),
    fetch:async(url,options)=>{
      const rpc=String(url).split('/').at(-1);requests.push({rpc,body:options.body});
      if(rpc==='transition_room_status'&&mode.value==='before')throw new Error('Owned simulated request loss');
      const response=await fetch(url,options);
      if(rpc==='transition_room_status'&&mode.value==='after'){await response.arrayBuffer();throw new Error('Owned simulated response loss');}
      return response;
    }});
  return {client,requests,context:()=>({actorId:a.id,sessionId:a.sessionId,tenantId:a.tenantId,runtime:'owned-room-'+input.run})};
}
async function errorCode(fn){try{await fn();return null}catch(error){return error.code??'unexpected_error'}}
async function actualClientChecks(a){
  const r=await room(a),storage=tabStorage(),mode={value:'after'},first=appClient(a,storage,mode),body={roomId:r.id,toStatus:'occupied_clean',reason:'Owned client response loss'};
  const code=await errorCode(()=>first.client.save(first.context(),body)),pending=first.client.pending(first.context(),r.id)[0];
  record('application-client-lost-response-keeps-exact-command',code==='outcome_unknown'&&!!pending&&storage.length===1&&(await counts(r)).events===1);
  await login(a);mode.value='';const reloaded=appClient(a,storage,mode),recovered=await reloaded.client.recover(reloaded.context(),r.id),c=await counts(r);
  record('application-client-reload-and-relogin-reads-real-receipt-once',recovered.command_id===pending.command._command_id&&reloaded.requests.length===1
    &&reloaded.requests[0].rpc==='get_room_transition_result'&&c.audit===1&&c.events===1&&c.commands===1&&storage.length===0,{...c});
  const r2=await room(a),s2=tabStorage(),m2={value:'before'},f2=appClient(a,s2,m2);
  const beforeCode=await errorCode(()=>f2.client.save(f2.context(),{roomId:r2.id,toStatus:'occupied_clean'}));
  m2.value='';const fixed=await f2.client.recover(f2.context(),r2.id),c2=await counts(r2);
  record('application-client-missing-receipt-resends-exact-body-and-key',beforeCode==='outcome_unknown'&&fixed.to==='occupied_clean'
    &&f2.requests.length===3&&f2.requests[1].rpc==='get_room_transition_result'&&f2.requests[0].body===f2.requests[2].body
    &&c2.commands===1&&c2.audit===1&&c2.events===1,{...c2});
  const r3=await room(a),s3=tabStorage(),f3=appClient(a,s3,{value:''});
  const invalidCode=await errorCode(()=>f3.client.save(f3.context(),{roomId:r3.id,toStatus:'skipper'}));
  const request=JSON.parse(f3.requests[0].body),cancelled=await lookup(a,request._command_id),c3=await counts(r3);
  record('application-client-validation-error-is-terminally-fenced',invalidCode==='command_cancelled'&&s3.length===0&&cancelled.data?.state==='cancelled'
    &&f3.requests.map(x=>x.rpc).join(',')==='transition_room_status,cancel_room_transition_command'&&c3.audit===0&&c3.events===0&&c3.commands===1,{...c3});
  const late=await call('/rest/v1/rpc/transition_room_status',a.token,request);
  record('application-client-cancelled-body-cannot-late-commit',late.status===200&&late.data?.state==='cancelled'&&(await counts(r3)).events===0,{status:late.status});
  const valid=await f3.client.save(f3.context(),{roomId:r3.id,toStatus:'occupied_clean'});
  record('application-client-new-intent-after-fence-can-complete',valid.to==='occupied_clean'&&valid.command_id!==request._command_id&&(await counts(r3)).events===1);
  const r4=await room(a),s4=tabStorage(),m4={value:'after'},f4=appClient(a,s4,m4);
  await errorCode(()=>f4.client.save(f4.context(),{roomId:r4.id,toStatus:'occupied_clean'}));m4.value='';const existing=await f4.client.cancel(f4.context(),r4.id),c4=await counts(r4);
  record('application-client-cancel-after-commit-returns-success-without-undo',existing.to==='occupied_clean'&&existing.replayed&&s4.length===0&&c4.audit===1&&c4.events===1&&c4.commands===1,{...c4});
  const r5=await room(a),s5=tabStorage(),m5={value:'before'},f5=appClient(a,s5,m5);
  await errorCode(()=>f5.client.save(f5.context(),{roomId:r5.id,toStatus:'occupied_clean'}));m5.value='';
  const explicitCode=await errorCode(()=>f5.client.cancel(f5.context(),r5.id)),c5=await counts(r5);
  record('application-client-explicit-cancel-before-dispatch-is-safe',explicitCode==='command_cancelled'&&s5.length===0&&c5.events===0&&c5.audit===0&&c5.commands===1,{...c5});
}
try{
  const a=await owner('a'),b=await owner('b'),staff=await account('staff');
  await insert('users',{id:staff.id,email:staff.email,full_name:'Owned room source staff',tenant_id:a.tenantId,hotel_id:a.hotelId,
    role:'staff',user_level_code:'staff',status:'active',created_by:a.id,must_change_password:false,account_locked:false});
  await insert('user_roles',{user_id:staff.id,role:'staff'});await insert('user_hotels',{user_id:staff.id,hotel_id:a.hotelId,assigned_by:a.id});
  const other=await insert('hotels',{id:randomUUID(),tenant_id:a.tenantId,name:'Owned other room hotel',address:'123 Fixture Road',status:'active'});
  const otherRoom=await room(a,other.id),permissionRoom=await room(a);
  const deadline=Date.now()+10000;
  while(true){const r=await transition(a,{id:randomUUID()});if(r.status===403&&r.data?.message==='ROOM_SCOPE_NOT_ALLOWED')break;
    assert.ok(Date.now()<deadline&&r.data?.code==='PGRST202','Room command schema must become ready');await new Promise(r=>setTimeout(r,25));}
  const first=await room(a),firstId=randomUUID(),positive=await transition(a,first,'occupied_clean',{_command_id:firstId,_reason:'Owned source reason'});
  record('owner-canonical-room-transition-positive',positive.status===200&&positive.data?.from==='vacant_clean'&&positive.data?.to==='occupied_clean',{status:positive.status});
  const canonical=(await db.query('SELECT * FROM private.workflow_room_transition_commands WHERE actor_id=$1 AND command_id=$2',[a.id,firstId])).rows[0];
  record('canonical-event-identity-and-scope-from-database',typeof positive.data?.workflow_event_id==='string'&&canonical?.event_id===positive.data.workflow_event_id
    &&canonical.tenant_id===a.tenantId&&canonical.hotel_id===a.hotelId&&canonical.source_snapshot.room_number===first.room_number);
  record('canonical-source-preserves-request-reason',canonical?.source_snapshot.context.reason==='Owned source reason'&&canonical.request.reason==='Owned source reason');
  record('actual-source-is-pending-not-claimed-dispatched',canonical?.dispatch_state==='pending'&&positive.data?.workflow_dispatch_state==='pending');
  const staffRoom=await room(a),staffId=randomUUID(),sp=await transition(staff,staffRoom,'occupied_clean',{_command_id:staffId});
  record('staff-assigned-hotel-positive',sp.status===200,{status:sp.status});
  await denied('staff-unassigned-hotel-denied-without-effects',()=>transition(staff,otherRoom));
  const ownDenial=await room(a);
  await denied('foreign-tenant-denied-with-safe-status',()=>transition(b,ownDenial));
  for(const [label,patch,restore]of [
    ['locked-owner',"account_locked=true","account_locked=false"],['inactive-owner',"status='inactive'","status='active'"],
    ['deleted-profile',"deleted_at=clock_timestamp()","deleted_at=NULL"]]){
    await db.query('UPDATE public.users SET '+patch+' WHERE id=$1',[a.id]);
    await denied(label,()=>transition(a,ownDenial));await denied(label+'-receipt-denied',()=>lookup(a,firstId));
    await db.query('UPDATE public.users SET '+restore+' WHERE id=$1',[a.id]);
  }
  await db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='owner'",[a.id]);
  await denied('removed-live-role',()=>transition(a,ownDenial));
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'owner')",[a.id]);
  await db.query("UPDATE public.hotels SET status='inactive' WHERE id=$1",[a.hotelId]);
  await denied('inactive-hotel',()=>transition(a,ownDenial));await denied('inactive-hotel-receipt',()=>lookup(a,firstId));
  await db.query("UPDATE public.hotels SET status='active' WHERE id=$1",[a.hotelId]);
  await db.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2',[staff.id,a.hotelId]);
  await denied('removed-assignment-replay',()=>transition(staff,staffRoom,'occupied_clean',{_command_id:staffId}));
  await denied('removed-assignment-receipt',()=>lookup(staff,staffId));
  await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)',[staff.id,a.hotelId,a.id]);
  const parallel=await room(a),parallelId=randomUUID();
  const twenty=await Promise.all(Array.from({length:20},()=>transition(a,parallel,'occupied_clean',{_command_id:parallelId})));
  const pc=await counts(parallel);
  record('twenty-concurrent-command-replays-one-audit-event-result',twenty.every(x=>x.status===200&&x.data?.command_id===parallelId&&x.data?.workflow_event_id===twenty[0].data?.workflow_event_id)
    &&pc.audit===1&&pc.commands===1&&pc.events===1,{requests:20,...pc});
  await denied('same-command-different-payload-conflict',()=>transition(a,parallel,'occupied_dirty',{_command_id:parallelId}),[409]);
  const replay=await lookup(a,parallelId);record('lost-response-durable-result-lookup',replay.status===200&&replay.data?.workflow_event_id===twenty[0].data?.workflow_event_id,{status:replay.status});
  const hidden=await lookup(b,parallelId);record('foreign-actor-cannot-read-command-result',hidden.status===200&&hidden.data===null,{status:hidden.status});
  const noop=await transition(a,parallel),nc=await counts(parallel);
  record('same-state-new-command-is-noop-not-event',noop.status===200&&noop.data?.changed===false&&noop.data?.workflow_event_id===null&&nc.audit===1&&nc.events===1,{status:noop.status,...nc});
  const legacy=await room(a),legacyResults=await Promise.all(Array.from({length:20},()=>transition(a,legacy))),lc=await counts(legacy);
  record('twenty-legacy-six-argument-calls-one-state-change-audit',legacyResults.every(x=>x.status===200)&&lc.audit===1&&lc.events===1&&lc.commands===20,{requests:20,...lc});
  const continued=await transition(a,parallel,'occupied_dirty'),oldReplay=await transition(a,parallel,'occupied_clean',{_command_id:parallelId});
  const live=(await db.query('SELECT status FROM public.rooms WHERE id=$1',[parallel.id])).rows[0];
  record('old-command-replay-does-not-revert-later-room-state',continued.status===200&&oldReplay.status===200&&oldReplay.data?.replayed===true&&live.status==='occupied_dirty');
  const dnd=await room(a,a.hotelId,'occupied_clean'),dndId=randomUUID();
  const d1=await transition(staff,dnd,'dnd',{_command_id:dndId,_reason:'Owned quiet time'});
  const d0=(await db.query('SELECT dnd_until FROM public.rooms WHERE id=$1',[dnd.id])).rows[0];
  const d2=await transition(staff,dnd,'dnd',{_reason:'Owned quiet time'}),dc=await counts(dnd);
  const dAfter=(await db.query('SELECT dnd_until FROM public.rooms WHERE id=$1',[dnd.id])).rows[0];
  record('repeated-legacy-dnd-does-not-extend-deadline',d1.status===200&&d2.status===200&&d2.data?.changed===false&&+d0.dnd_until===+dAfter.dnd_until&&dc.audit===1&&dc.updates===0,{...dc});
  const future=new Date(Date.now()+6*3600000).toISOString(),extended=await transition(staff,dnd,'dnd',{_dnd_until:future,_reason:'Owned extension'}),ec=await counts(dnd);
  record('explicit-dnd-extension-audited-as-update-without-status-event',extended.status===200&&extended.data?.changed===true&&extended.data?.status_changed===false
    &&extended.data?.workflow_event_id===null&&ec.audit===1&&ec.updates===1&&ec.events===1,{status:extended.status,...ec});
  await denied('staff-cannot-force-room-transition',()=>transition(staff,permissionRoom,'skipper',{_force:true}));
  await denied('staff-cannot-mark-out-of-service',()=>transition(staff,permissionRoom,'out_of_service'));
  await denied('invalid-transition-does-not-mutate',()=>transition(a,permissionRoom,'skipper'),[400]);
  const forced=await transition(a,permissionRoom,'skipper',{_force:true});record('owner-force-keeps-business-path',forced.status===200&&forced.data?.to==='skipper',{status:forced.status});
  for(const [label,extra,to]of [['past-dnd',{_dnd_until:'2000-01-01T00:00:00Z'},'dnd'],
    ['past-oos',{_oos_until:'2000-01-01T00:00:00Z'},'out_of_service'],['unknown-status',{},'invented_status'],['oversized-reason',{_reason:'x'.repeat(4001)},'occupied_clean']]){
    await denied(label,()=>transition(a,ownDenial,to,extra),[400]);
  }
  const oos=await room(a),o1=await transition(a,oos,'out_of_service',{_oos_until:future,_reason:'Owned maintenance'});
  const o2=await transition(a,oos,'out_of_service',{_oos_until:new Date(Date.now()+8*3600000).toISOString(),_reason:'Owned extension'});
  const o3=await transition(a,oos,'vacant_clean'),oc=await counts(oos),deep=(await db.query('SELECT last_deep_clean_at FROM public.rooms WHERE id=$1',[oos.id])).rows[0];
  record('oos-extension-and-deep-clean-return-preserved',o1.status===200&&o2.status===200&&o3.status===200&&deep.last_deep_clean_at!==null&&oc.audit===2&&oc.updates===1,{...oc});
  await fault('source-result-insert-fault',a,await room(a),'command');await fault('audit-insert-fault',a,await room(a),'audit');
  await expiryRace('session-expiry-during-actual-room-lock-denied',a,await room(a),'room');
  await expiryRace('session-expiry-during-actual-hotel-lock-denied',a,await room(a),'hotel');
  await expiryRace('session-expiry-during-actual-command-lock-denied',a,await room(a),'command');
  const slow=await room(a),slowId=randomUUID(),beforeSlow=await snapshot();
  await db.query(`CREATE FUNCTION private.owned_room_sleep() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.command_id='${slowId}'::uuid THEN PERFORM pg_sleep(1.6); END IF; RETURN NEW; END;$f$;
    CREATE TRIGGER owned_room_source_sleep AFTER INSERT ON private.workflow_room_transition_commands
      FOR EACH ROW EXECUTE FUNCTION private.owned_room_sleep()`);
  let slowResult;try{await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1",[a.sessionId]);
    slowResult=await transition(a,slow,'occupied_clean',{_command_id:slowId});}
  finally{await db.query('DROP TRIGGER owned_room_source_sleep ON private.workflow_room_transition_commands;DROP FUNCTION private.owned_room_sleep()');
    await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);}
  record('expiry-during-source-result-insert-rolls-back-all-effects',slowResult.status===403&&beforeSlow===await snapshot(),{status:slowResult.status,effectsUnchanged:beforeSlow===await snapshot()});
  const slowRecovery=await transition(a,slow,'occupied_clean',{_command_id:slowId}),sc=await counts(slow);
  record('expiry-fault-same-command-recovers-once',slowRecovery.status===200&&sc.audit===1&&sc.commands===1&&sc.events===1,{status:slowRecovery.status,...sc});
  const oldToken={...staff};await db.query('DELETE FROM auth.sessions WHERE id=$1',[staff.sessionId]);
  await denied('logged-out-session',()=>transition(oldToken,permissionRoom));await denied('logged-out-session-cannot-read-result',()=>lookup(oldToken,staffId));await login(staff);
  const acl=(await db.query(`SELECT has_table_privilege('authenticated','private.workflow_room_transition_commands','SELECT') AS browser,
    has_table_privilege('service_role','private.workflow_room_transition_commands','INSERT') AS service,
    has_function_privilege('authenticated','private.transition_room_status(uuid,text,text,timestamptz,timestamptz,boolean)','EXECUTE') AS legacy,
    has_function_privilege('service_role','private.assert_room_transition_session()','EXECUTE') AS helper,
    to_regprocedure('public.transition_room_status(uuid,text,text,timestamptz,timestamptz,boolean)') IS NULL AS no_ambiguous_signature`)).rows[0];
  record('private-source-and-old-function-denied-no-public-overload',!acl.browser&&!acl.service&&!acl.legacy&&!acl.helper&&acl.no_ambiguous_signature);
  await denied('anonymous-source-denied',()=>transition({token:input.publishableKey},ownDenial));
  await denied('service-role-is-not-a-browser-actor',()=>transition({token:input.serviceKey},ownDenial));
  await denied('service-role-cannot-use-result-lookup',()=>lookup({token:input.serviceKey},firstId));
  const unknown=await lookup(a,randomUUID());record('unknown-command-result-is-null-not-a-new-mutation',unknown.status===200&&unknown.data===null,{status:unknown.status});
  const cancelledRoom=await room(a),cancelledId=randomUUID(),cancelledResult=await cancelCommand(a,cancelledRoom,'occupied_clean',cancelledId),cc=await counts(cancelledRoom);
  record('absent-command-cancellation-is-terminal-without-room-effects',cancelledResult.status===200&&cancelledResult.data?.state==='cancelled'
    &&cc.audit===0&&cc.events===0&&cc.commands===1,{status:cancelledResult.status,...cc});
  const cancelReplayBefore=await snapshot(),cancelReplay=await cancelCommand(a,cancelledRoom,'occupied_clean',cancelledId);
  record('cancellation-replay-preserves-single-result',cancelReplay.status===200&&cancelReplay.data?.replayed===true&&cancelReplayBefore===await snapshot());
  const lateCancelled=await Promise.all(Array.from({length:20},()=>transition(a,cancelledRoom,'occupied_clean',{_command_id:cancelledId}))),cl=await counts(cancelledRoom);
  record('twenty-late-source-requests-after-cancel-have-no-effects',lateCancelled.every(x=>x.status===200&&x.data?.state==='cancelled')
    &&cl.audit===0&&cl.events===0&&cl.commands===1,{requests:20,...cl});
  await denied('cancel-same-key-different-payload-conflicts',()=>cancelCommand(a,cancelledRoom,'occupied_dirty',cancelledId),[409]);
  const committedBefore=await snapshot(),committedCancel=await cancelCommand(a,parallel,'occupied_clean',parallelId);
  record('cancellation-returns-existing-committed-event-without-undo',committedCancel.status===200&&committedCancel.data?.workflow_event_id===twenty[0].data?.workflow_event_id
    &&committedCancel.data?.replayed===true&&committedBefore===await snapshot());
  await denied('foreign-tenant-cannot-cancel-command',()=>cancelCommand(b,cancelledRoom,'occupied_clean',cancelledId));
  await denied('staff-unassigned-hotel-cannot-cancel-command',()=>cancelCommand(staff,otherRoom,'occupied_clean',randomUUID()));
  await denied('anonymous-cannot-cancel-command',()=>cancelCommand({token:input.publishableKey},ownDenial,'occupied_clean',randomUUID()));
  await denied('service-role-cannot-cancel-command',()=>cancelCommand({token:input.serviceKey},ownDenial,'occupied_clean',randomUUID()));
  await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]);
  await denied('locked-actor-cannot-cancel-command',()=>cancelCommand(a,cancelledRoom,'occupied_clean',cancelledId));
  await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);
  await cancellationRace(a,await room(a),true);await cancellationRace(a,await room(a),false);
  const cancelFaultRoom=await room(a),cancelFaultId=randomUUID(),cancelFaultBefore=await snapshot();
  await db.query(`CREATE FUNCTION private.owned_cancel_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.command_id='${cancelFaultId}'::uuid THEN RAISE EXCEPTION 'OWNED_CANCEL_FAULT'; END IF; RETURN NEW; END;$f$;
    CREATE TRIGGER owned_cancel_fault BEFORE INSERT ON private.workflow_room_transition_commands FOR EACH ROW EXECUTE FUNCTION private.owned_cancel_fault()`);
  let cancelFault;try{cancelFault=await cancelCommand(a,cancelFaultRoom,'occupied_clean',cancelFaultId)}
  finally{await db.query('DROP TRIGGER owned_cancel_fault ON private.workflow_room_transition_commands;DROP FUNCTION private.owned_cancel_fault()')}
  record('cancellation-insert-fault-rolls-back-terminal-row',cancelFault.status>=400&&cancelFaultBefore===await snapshot(),{status:cancelFault.status});
  const cancelFaultRecovered=await cancelCommand(a,cancelFaultRoom,'occupied_clean',cancelFaultId);
  record('cancellation-insert-fault-same-key-recovers-once',cancelFaultRecovered.status===200&&(await counts(cancelFaultRoom)).commands===1);
  const cancelSlowRoom=await room(a),cancelSlowId=randomUUID(),cancelSlowBefore=await snapshot();
  await db.query(`CREATE FUNCTION private.owned_cancel_sleep() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.command_id='${cancelSlowId}'::uuid THEN PERFORM pg_sleep(1.6); END IF; RETURN NEW; END;$f$;
    CREATE TRIGGER owned_cancel_sleep AFTER INSERT ON private.workflow_room_transition_commands FOR EACH ROW EXECUTE FUNCTION private.owned_cancel_sleep()`);
  let cancelSlow;try{
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1",[a.sessionId]);
    cancelSlow=await cancelCommand(a,cancelSlowRoom,'occupied_clean',cancelSlowId);
  }finally{await db.query('DROP TRIGGER owned_cancel_sleep ON private.workflow_room_transition_commands;DROP FUNCTION private.owned_cancel_sleep()');
    await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);}
  record('expiry-during-cancel-insert-rolls-back-terminal-row',cancelSlow.status===403&&cancelSlowBefore===await snapshot(),{status:cancelSlow.status});
  const cancelSlowRecovery=await cancelCommand(a,cancelSlowRoom,'occupied_clean',cancelSlowId);
  record('expiry-during-cancel-insert-recovers-on-same-key',cancelSlowRecovery.status===200&&(await counts(cancelSlowRoom)).commands===1);
  const expiringCancelRoom=await room(a),expiringCancelId=randomUUID(),expiringBefore=await snapshot(),cancelLock=await db.connect();
  try{
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1",[a.sessionId]);
    await cancelLock.query('BEGIN');await cancelLock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[a.id+':'+expiringCancelId]);
    const pendingCancel=cancelCommand(a,expiringCancelRoom,'occupied_clean',expiringCancelId);await waitOnLock('cancel_room_transition_command');
    await db.query('SELECT pg_sleep(1.6)');await cancelLock.query('COMMIT');const response=await pendingCancel;
    const passed=response.status===403&&expiringBefore===await snapshot();record('expiry-during-actual-cancel-lock-denied',passed,{status:response.status,realLockBarrier:true});
    races.push({label:'expiry-during-actual-cancel-lock-denied',passed,realLockBarrier:true,kind:'cancel-expiry'});
  }finally{await cancelLock.query('ROLLBACK');cancelLock.release();await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);}
  await actualClientChecks(a);
  console.log(JSON.stringify({verified:checks.every(c=>c.passed),checks,races,actualAuth:true,actualRest:true,
    actualApplicationClient:true,actualCancellation:true,actualConfiguredEngine:false,asyncDispatcher:false,aclFixture:{id:a.id,sessionId:a.sessionId},productAcceptance:false}));
}finally{await db.end();}
