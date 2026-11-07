// Actual application client in fresh child processes, real Auth/REST and TCP
// response cuts. Runs only inside the exact-owned internal Docker fixture.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs';
import pg from '/control/node_modules/pg/lib/index.js';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_TARGET_TRANSPORT_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);
assert.equal(typeof roomqcTransportCallerSource,'string');
const origin='http://127.0.0.1:8000',checks=[],barriers=[],children=new Set(),sockets=new Set(),requests=[];
const root='/dev/shm/roomqc-target-transport-'+input.run;
const db=new pg.Pool({host:'db',port:5432,database:'postgres',user:'postgres',password:input.databasePassword,
  max:4,statement_timeout:15000,connectionTimeoutMillis:5000,application_name:'owned-target-transport-'+input.run});
let stage='setup',endpoint,mode=null,created=false,proxyFailure=false,childRuntimeChecks=0;
const rec=(label,passed)=>{checks.push({label:'target-transport-'+label,passed,actualNative:true,actualTcp:true});assert.ok(passed,'OWNED_TARGET_TRANSPORT_CONTROL_FAILED')};
async function call(path,token,body){const r=await fetch(origin+path,{method:'POST',headers:{apikey:input.publishableKey,
  authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});
  return{status:r.status,data:await r.json()};}
const rpc=(name,a,body)=>call('/rest/v1/rpc/'+name,a.token,body);
async function login(a){const r=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:a.email,password:a.password});
  assert.equal(r.status,200);a.token=r.data.access_token;a.sessionId=JSON.parse(Buffer.from(a.token.split('.')[1],'base64url')).session_id;return a;}
async function owner(){const a={email:'target-transport-'+randomUUID()+'@roomqc.invalid',password:randomBytes(32).toString('hex')};
  const r=await call('/auth/v1/admin/users',input.serviceKey,{email:a.email,password:a.password,email_confirm:true});assert.equal(r.status,200);a.id=r.data.id;await login(a);
  const p=await call('/rest/v1/rpc/provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:a.id,
    p_fields:{fullName:'Owned target transport',phone:'0901234567',tenantName:'Owned target transport',hotelName:'Owned target transport',
      hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:a.email,totalRooms:5}});
  assert.equal(p.status,200);assert.equal(p.data.success,true);a.tenantId=p.data.tenant_id;a.hotelId=p.data.hotel_id;return a;}
const scopeArgs=s=>({p_kind:s.kind,p_period_month:s.month,p_hotel_id:s.hotelId});
async function read(a,s){const r=await rpc('get_report_targets',a,scopeArgs(s));assert.equal(r.status,200);return r.data;}
async function journal(a,id){return(await db.query('SELECT request,result FROM private.report_target_commands WHERE actor_id=$1 AND command_id=$2',[a.id,id])).rows;}
async function effects(a){return(await db.query(`SELECT jsonb_build_object(
  'commands',(SELECT count(*) FROM private.report_target_commands WHERE actor_id=$1),
  'audit',(SELECT count(*) FROM public.activity_logs WHERE user_id=$1 AND entity_type='report_targets')) AS value`,[a.id])).rows[0].value;}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const increments=(a,b,n=1)=>Number(b.commands)===Number(a.commands)+n&&Number(b.audit)===Number(a.audit)+n;
function arm(rpcName,kind){assert.equal(mode,null);let hit,release;
  const seen=new Promise(r=>{hit=r}),wait=new Promise(r=>{release=r});
  const plan={rpc:rpcName,kind,seen,hit,wait,release,used:false};mode=plan;return plan;}
async function reached(plan){let timeout;try{await Promise.race([plan.seen,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('OWNED_PROXY_BARRIER_TIMEOUT')),15000)})]);}
  finally{clearTimeout(timeout)}}
const proxy=createServer(async(req,res)=>{
  try{
    assert.equal(req.method,'POST');assert.match(req.url??'',/^\/rest\/v1\/rpc\/(get_report_targets|replace_report_targets|get_report_target_command|cancel_report_target_command)$/);
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;assert.ok(size<=16384);chunks.push(chunk)}
    const body=Buffer.concat(chunks),args=JSON.parse(body),name=req.url.split('/').at(-1),active=mode?.rpc===name?mode:null;
    requests.push({rpc:name,command:args.p_command_id??null,payloadHash:createHash('sha256').update(body).digest('hex')});
    if(active){active.used=true;mode=null;}
    if(active?.kind==='drop-before'){active.hit();req.socket.destroy();return;}
    if(active?.kind==='hold-before'){active.hit();await active.wait;}
    const upstream=await fetch(origin+req.url,{method:'POST',headers:{apikey:req.headers.apikey,authorization:req.headers.authorization,
      'content-type':'application/json'},body,signal:AbortSignal.timeout(20000),redirect:'error'});
    const bytes=Buffer.from(await upstream.arrayBuffer());
    if(active&&['drop-after','hold-after'].includes(active.kind)){
      assert.equal(upstream.status,200);const result=JSON.parse(bytes);
      if(['replace_report_targets','cancel_report_target_command'].includes(name)){
        const found=(await db.query('SELECT result FROM private.report_target_commands WHERE command_id=$1',[args.p_command_id])).rows;
        assert.equal(found.length,1);assert.ok(same(found[0].result,result),'OWNED_RESULT_NOT_DURABLE');
      }
      active.hit();if(active.kind==='drop-after'){req.socket.destroy();return;}await active.wait;
    }
    res.writeHead(upstream.status,{'content-type':'application/json','cache-control':'no-store'});res.end(bytes);
  }catch{proxyFailure=true;res.destroy();}
});
proxy.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('error',()=>{})});

// The storage implementation is fixture-only. Each process reloads the same
// command records. No access/refresh token or password is written to this file.
const childMain=`
import fs from 'node:fs';
const x=JSON.parse(process.env.ROOMQC_TARGET_CALLER_INPUT);
const contents=()=>fs.existsSync(x.file)?JSON.parse(fs.readFileSync(x.file,'utf8')):{};
const write=v=>{const tmp=x.file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v),{mode:0o600});fs.renameSync(tmp,x.file)};
const storage={get length(){return Object.keys(contents()).length},key:i=>Object.keys(contents())[i]??null,
  getItem:k=>contents()[k]??null,setItem:(k,v)=>{const all=contents();all[k]=v;write(all)},removeItem:k=>{const all=contents();delete all[k];write(all)}};
const client=RoomQCReportTargetCaller.createReportTargetClient({endpoint:x.endpoint,publishableKey:x.publishableKey,storage:()=>storage,
  getSession:async()=>({data:{session:{access_token:x.token,user:{id:x.context.actorId}}},error:null})});
let result;
try{const value=x.operation==='save'?await client.save(x.context,x.scope,x.values,x.revision):
  x.operation==='cancel'?await client.cancel(x.context,x.scope):x.operation==='recover'?await client.recover(x.context,x.scope):client.pending(x.context,x.scope);
  result={ok:true,state:value.state??null,commandId:value.command_id??null};}
catch(e){result={ok:false,code:typeof e?.code==='string'&&/^[a-z_]{3,50}$/.test(e.code)?e.code:'fixture_error'};}
console.log(JSON.stringify({...result,pending:client.pending(x.context,x.scope).length,
  minimalRuntime:Object.keys(process.env).length===1&&Object.hasOwn(process.env,'ROOMQC_TARGET_CALLER_INPUT')
    &&!Object.hasOwn(x,'serviceKey')&&!Object.hasOwn(x,'databasePassword')}));
`;
function start(a,s,file,operation,extra={}){
  const context={actorId:a.id,sessionId:a.sessionId,tenantId:a.tenantId,runtime:'owned-target-transport:'+input.run};
  const c=spawn(process.execPath,['--input-type=module'],{stdio:['pipe','pipe','pipe'],env:{ROOMQC_TARGET_CALLER_INPUT:JSON.stringify({
    endpoint,publishableKey:input.publishableKey,token:a.token,context,scope:s,file,operation,...extra})}});
  children.add(c);const out=[],err=[];let bytes=0,spawnFailed=false;const timeout=setTimeout(()=>c.kill(),30000);
  c.stdout.on('data',v=>{bytes+=v.length;if(bytes>16384)c.kill();else out.push(v)});c.stderr.on('data',v=>{if(err.length<4)err.push(v)});
  const done=new Promise((resolve,reject)=>{c.once('error',()=>{spawnFailed=true});c.once('close',(code,signal)=>{clearTimeout(timeout);children.delete(c);
    try{assert.equal(spawnFailed,false);assert.equal(code,0);assert.equal(signal,null);assert.ok(bytes<=16384);const value=JSON.parse(Buffer.concat(out).toString());
      assert.equal(typeof value.ok,'boolean');assert.ok(Number.isInteger(value.pending));assert.equal(value.minimalRuntime,true);childRuntimeChecks++;resolve({...value,pid:c.pid,terminal:true});}
    catch{reject(new Error('OWNED_CALLER_PROCESS_FAILED'))}})});
  c.stdin.on('error',()=>{});c.stdin.end(roomqcTransportCallerSource+'\n'+childMain);
  return{done,pid:c.pid};
}
const run=(...args)=>start(...args).done;
function stored(file){assert.ok(file.startsWith(root+'/'));const values=Object.values(JSON.parse(fs.readFileSync(file,'utf8')));assert.equal(values.length,1);
  const record=JSON.parse(values[0]);assert.equal(record.version,1);assert.ok(!fs.readFileSync(file,'utf8').includes('access_token'));return record.command;}
async function pendingBefore(a,s,file,values){const report=await read(a,s),gate=arm('replace_report_targets','drop-before');
  const r=await run(a,s,file,'save',{values,revision:report.revision});assert.equal(gate.used,true);
  assert.equal(r.code,'outcome_unknown');assert.equal(r.pending,1);return{report,command:stored(file),result:r};}
try{
  fs.mkdirSync(root,{mode:0o700});created=true;
  await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve)});endpoint='http://127.0.0.1:'+proxy.address().port;
  const a=await owner();
  for(const [label,kind,hotel]of [['financial-hotel','financial',a.hotelId],['financial-tenant','financial',null],['monthly','monthly',a.hotelId]]){
    const s={kind,month:'2026-10-01',hotelId:hotel},values=n=>kind==='monthly'?{revenue_target:n,occupancy_target:75.25}:{adr:n,occupancy:75.25};
    stage=label+'-lost-save';
    const file=root+'/'+randomUUID()+'.json',report=await read(a,s),before=await effects(a),cut=arm('replace_report_targets','drop-after');
    const lost=await run(a,s,file,'save',{values:values(101),revision:report.revision}),command=stored(file),committed=await journal(a,command.p_command_id);
    rec(label+'-tcp-cut-after-durable-save-leaves-unknown-and-pending',cut.used&&lost.code==='outcome_unknown'&&lost.pending===1&&committed.length===1&&committed[0].result.state==='completed'&&increments(before,await effects(a)));
    const requestCount=requests.length,blocked=await run(a,s,file,'save',{values:values(102),revision:report.revision});
    rec(label+'-new-process-cannot-open-new-key-while-unknown',blocked.code==='pending_command'&&requests.length===requestCount);
    const afterCommit=await effects(a),recovered=await run(a,s,file,'recover');
    rec(label+'-process-restart-recovers-completed-by-original-key-without-resave',recovered.terminal&&recovered.pid!==lost.pid&&recovered.ok&&recovered.state==='completed'&&recovered.commandId===command.p_command_id&&recovered.pending===0&&same(afterCommit,await effects(a)));

    stage=label+'-before-dispatch';
    const beforeFile=root+'/'+randomUUID()+'.json',emptyBefore=await effects(a),p=await pendingBefore(a,s,beforeFile,values(103));
    rec(label+'-tcp-cut-before-dispatch-has-no-journal-or-effects',(await journal(a,p.command.p_command_id)).length===0&&same(emptyBefore,await effects(a)));
    const replayed=await run(a,s,beforeFile,'recover'),calls=requests.filter(r=>r.command===p.command.p_command_id&&r.rpc==='replace_report_targets');
    rec(label+'-not-found-replays-exact-key-payload-in-new-process',replayed.state==='completed'&&replayed.pending===0&&calls.length===2&&calls[0].payloadHash===calls[1].payloadHash&&increments(emptyBefore,await effects(a)));

    stage=label+'-lost-cancel';
    const cancelFile=root+'/'+randomUUID()+'.json',c=await pendingBefore(a,s,cancelFile,values(104)),beforeCancel=await effects(a),cancelCut=arm('cancel_report_target_command','drop-after');
    const cancelLost=await run(a,s,cancelFile,'cancel'),cancelJournal=await journal(a,c.command.p_command_id);
    rec(label+'-tcp-cut-after-durable-cancel-retains-pending',cancelCut.used&&cancelLost.code==='outcome_unknown'&&cancelLost.pending===1&&cancelJournal.length===1&&cancelJournal[0].result.state==='cancelled'&&increments(beforeCancel,await effects(a)));
    const currentBefore=await read(a,s),afterCancel=await effects(a),cancelRecovery=await run(a,s,cancelFile,'recover');
    const late=await rpc('replace_report_targets',a,c.command);
    rec(label+'-restart-lookup-and-late-save-preserve-cancelled-result',cancelRecovery.ok&&cancelRecovery.state==='cancelled'&&cancelRecovery.pending===0&&late.status===200&&late.data.state==='cancelled'&&same(afterCancel,await effects(a))&&same(currentBefore,await read(a,s))&&same(c.report,currentBefore));

    stage=label+'-two-process-cancel-wins';
    const raceFile=root+'/'+randomUUID()+'.json',raceReport=await read(a,s),raceBefore=await effects(a),hold=arm('replace_report_targets','hold-before');
    const writer=start(a,s,raceFile,'save',{values:values(105),revision:raceReport.revision});
    let winner,loser;try{await reached(hold);assert.ok(children.size>0);winner=await run(a,s,raceFile,'cancel');}finally{hold.release();loser=await writer.done;}
    const cancelledRace=winner.state==='cancelled'&&loser.state==='cancelled'&&winner.commandId===loser.commandId&&winner.pid!==loser.pid&&increments(raceBefore,await effects(a))&&same(raceReport,await read(a,s));
    rec(label+'-two-live-processes-cancel-fences-delayed-save',cancelledRace);barriers.push({kind:label+'-cancel-first',passed:cancelledRace,actualTcpBarrier:true});

    stage=label+'-two-process-save-wins';
    const winFile=root+'/'+randomUUID()+'.json',winReport=await read(a,s),winBefore=await effects(a),holdReply=arm('replace_report_targets','hold-after');
    const first=start(a,s,winFile,'save',{values:values(106),revision:winReport.revision});
    let completion,cancelAfter;try{await reached(holdReply);assert.ok(children.size>0);cancelAfter=await run(a,s,winFile,'cancel');}finally{holdReply.release();completion=await first.done;}
    const completedRace=completion.state==='completed'&&cancelAfter.state==='completed'&&completion.commandId===cancelAfter.commandId&&completion.pid!==cancelAfter.pid&&increments(winBefore,await effects(a));
    rec(label+'-two-live-processes-cancel-observes-committed-save',completedRace);barriers.push({kind:label+'-save-first',passed:completedRace,actualTcpBarrier:true});
  }
  stage='session-and-relogin';
  const s={kind:'financial',month:'2026-11-01',hotelId:a.hotelId},file=root+'/'+randomUUID()+'.json';
  const p=await pendingBefore(a,s,file,{adr:200}),before=await effects(a),oldSession=a.sessionId;
  await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=$1",[oldSession]);
  const denied=await run(a,s,file,'recover'),cancelDenied=await run(a,s,file,'cancel');
  rec('expired-native-session-denies-recovery-and-cancel-without-losing-pending',denied.code==='permission_denied'&&cancelDenied.code==='permission_denied'&&denied.pending===1&&cancelDenied.pending===1&&same(before,await effects(a)));
  await login(a);const fresh=await run(a,s,file,'recover');
  rec('fresh-auth-login-recovers-original-command-from-expired-session',a.sessionId!==oldSession&&fresh.state==='completed'&&fresh.commandId===p.command.p_command_id&&fresh.pending===0&&increments(before,await effects(a)));
  stage='caller-boundary';
  rec('child-processes-verify-minimal-runtime-without-machine-credentials',childRuntimeChecks>0);
  rec('all-response-cuts-used-real-http-and-all-child-processes-terminated',requests.length>0&&!proxyFailure&&mode===null&&children.size===0);
  console.log(JSON.stringify({verified:true,checks,barriers,actualApplicationClient:true,actualTcpResponseLoss:true,
    actualProcessRestart:true,publicPorts:0,browserE2e:false,storageIsFixtureFile:true}));
}catch(e){console.log(JSON.stringify({verified:false,checks,barriers,stage,errorCode:/^[A-Z0-9_]{3,80}$/.test(e.code??'')?e.code:'TARGET_TRANSPORT_ASSERTION'}));process.exitCode=1;}
finally{
  if(mode)mode.release();for(const c of children)c.kill();
  for(const s of sockets)s.destroy();await new Promise(resolve=>proxy.close(resolve));await db.end();
  if(created){assert.equal(fs.realpathSync(root),root);for(const name of fs.readdirSync(root)){assert.match(name,/^[a-f0-9-]{36}\.json(?:\.\d+\.tmp)?$/);const p=root+'/'+name;assert.ok(fs.lstatSync(p).isFile());fs.unlinkSync(p);}fs.rmdirSync(root);}
}
