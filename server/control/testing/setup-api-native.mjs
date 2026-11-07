// Real HTTP/Auth/REST/PG plus real API/worker SIGKILL. Exact-owned diagnostic;
// release approval, health and confirmed Auth accounts remain fixture setup.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import http from 'node:http';
import {fork} from 'node:child_process';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry,migrationManifest} from '../migrate.mjs';
import {fixtureConfig,seedOperationalCluster} from '../test-fixtures.mjs';
import {fixtureReleaseApproval,fixtureReleaseContext,fixtureReleaseTrustRaw} from '../release-test-fixtures.mjs';
import {syntheticRelease,syntheticBundle} from '../probe-test-fixtures.mjs';
import {runSupportAuthorityNativeChecks} from './setup-support-authority-native.mjs';
import {runSupportLegacyBinaryNativeChecks} from './setup-support-legacy-binary-native.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=20000){
  const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(value)return value;await sleep(20)}
  throw new Error('OWNED_NATIVE_TIMEOUT_'+label);
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
export async function runSetupApiNativeChecks({input,db,recoveryCluster,recoveryExpected,recoveryToken,account,metadata,provision,snapshot,record}){
  assert.match(input.run,/^[a-f0-9]{12}$/);
  const database='roomqc_api_'+input.run,apiRole='setup_api_'+input.run,workerRole='setup_api_worker_'+input.run;
  const password=randomBytes(32).toString('hex'),children=new Set(),checks=[],barriers=[],kills=[],workerEvents=[];
  let maintenance,directory,apiDirectory,created=false,baselineRoles,api,proxy,apiOrigin,fault,result,phase='prepare';
  const check=(label,condition=true)=>{assert.ok(condition,'NATIVE_SETUP_API_'+label);record('native-api-'+label);checks.push({label,passed:true})};
  const barrier=label=>{barriers.push({label,observed:true});check(label)};
  async function child(mode,extra={}){
    const messages=[],process=fork(new URL('./setup-api-native-child.mjs',import.meta.url),[],{
      execArgv:[],stdio:['ignore','ignore','pipe','ipc'],env:{PATH:globalThis.process.env.PATH}});
    // Child errors stay private; only known phase/exit/labels leave this runner.
    const errorCodes=new Set();process.stderr.on('data',bytes=>{for(const code of bytes.toString().match(/ERR_[A-Z_]+/g)??[])errorCodes.add(code)});
    const handle={process,messages,exit:null};children.add(handle);
    handle.finished=new Promise(resolve=>process.once('close',(code,signal)=>{handle.exit={code,signal};children.delete(handle);resolve(handle.exit)}));
    process.on('message',message=>messages.push(message));process.on('error',()=>messages.push({type:'failed'}));
    handle.wait=type=>until(()=>{assert.ok(!messages.some(x=>x.type==='failed'),'NATIVE_CHILD_'+phase);
      const found=messages.find(x=>x.type===type);
      if(!found&&handle.exit)globalThis.process.stderr.write(JSON.stringify({event:'owned_native_child_early_exit',mode,...handle.exit,errorCodes:[...errorCodes]})+'\n');
      assert.ok(found||!handle.exit,'NATIVE_CHILD_EARLY_EXIT_'+phase);return found},type);
    const target=new URL('postgresql://db/'+database);target.username=mode==='api'?apiRole:workerRole;target.password=password;
    process.send({run:input.run,mode,databaseUrl:target.href,...extra});return handle;
  }
  async function kill(handle,label){
    assert.equal(handle.exit,null);assert.equal(handle.process.kill('SIGKILL'),true);
    const exit=await handle.finished;assert.equal(exit.signal,'SIGKILL');kills.push({label,signal:exit.signal});barrier(label);
  }
  async function stopApi(){
    if(!api||api.exit)return;
    api.process.send({type:'stop'});await until(()=>api.exit,'api-stop',4000);assert.equal(api.exit.code,0);
  }
  const arm=(path,stage)=>{assert.equal(fault,undefined);fault={path,stage,seen:deferred(),release:deferred()};return fault};
  async function request(path,{token,body,key,method=body===undefined?'GET':'POST',origin=proxyOrigin}={}){
    try{
      const response=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{
        ...(token?{authorization:'Bearer '+token}:{}),...(key?{'idempotency-key':key}:{}),
        ...(body===undefined?{}:{origin:'http://localhost:8082','content-type':'application/json'})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')};
    }catch{return {networkError:true}}
  }
  let proxyOrigin;
  try{
    proxy=http.createServer(async(req,res)=>{
      try{
        let body=Buffer.alloc(0);for await(const bytes of req){body=Buffer.concat([body,bytes]);assert.ok(body.length<=16384)}
        const current=fault?.path===req.url?fault:null;if(current)current.response=res;
        if(current?.stage==='before'){
          current.seen.resolve();await current.release.promise;if(res.destroyed)return;
        }
        const target=req.url.startsWith('/api/control/')?apiOrigin:'http://127.0.0.1:8000';assert.ok(target);
        const upstream=await new Promise((resolve,reject)=>{
          const send=http.request(target+req.url,{method:req.method,headers:{...req.headers,host:new URL(target).host,connection:'close'}},response=>{
            let bytes=Buffer.alloc(0);response.on('data',chunk=>{bytes=Buffer.concat([bytes,chunk]);if(bytes.length>1024*1024)response.destroy()});
            response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:bytes}));response.on('error',reject);
          });send.on('error',reject);send.end(body);
        });
        if(current?.stage==='drop_after'){
          if(current.path==='/rest/v1/rpc/accept_platform_support_command')current.acceptance=JSON.parse(upstream.body.toString('utf8'));
          current.seen.resolve();res.destroy();return;
        }
        if(current?.stage==='after'){current.seen.resolve();await current.release.promise;if(res.destroyed)return}
        res.writeHead(upstream.status,upstream.headers);res.end(upstream.body);
      }catch{if(!res.destroyed&&!res.writableEnded){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"OWNED_PROXY_UNAVAILABLE"}')}}
    });
    await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));proxyOrigin='http://127.0.0.1:'+proxy.address().port;
    maintenance=new pg.Pool({host:'db',database:'postgres',user:'supabase_admin',password:input.databasePassword,max:1,statement_timeout:12000});
    baselineRoles=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
    await maintenance.query('CREATE DATABASE '+database);created=true;
    directory=new pg.Pool({host:'db',database,user:'supabase_admin',password:input.databasePassword,max:3,statement_timeout:12000});
    const migration=await migrateDirectory(directory);
    const cluster={...recoveryCluster,internalUrl:proxyOrigin,serviceKey:input.serviceKey,publishableKey:input.publishableKey,vapidPublicKey:'owned-fixture',maxWorkspaces:99};
    await importInitialRegistry(directory,[cluster]);await seedOperationalCluster(directory,cluster.id,{cluster});
    await directory.query(`CREATE ROLE ${apiRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
    await directory.query(`CREATE ROLE ${workerRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_setup_runtime`);
    apiDirectory=new pg.Pool({host:'db',database,user:apiRole,password,max:1,statement_timeout:12000});
    const cfg=fixtureConfig('unused',[cluster]),releaseCatalog={version:2,entries:[{inventoryRef:cluster.id,
      approval:fixtureReleaseApproval(fixtureReleaseContext(cluster,syntheticRelease)),
      credential:{...syntheticBundle().credential,publishableKey:input.publishableKey}}]};
    const publicationInventory=['closure','generation'].flatMap(stage=>['commit','kill'].map(outcome=>'replica-pub-'+stage[0]+'-'+outcome));
    const writerInventory=['writer-commit','writer-rollback','initial-same','initial-conflict'].map(mode=>'replica-'+mode);
    const registrationInventory=input.supportAuthorityOnly===true?['ok','revoke','replica-expired','replica-commit','replica-revoked',...publicationInventory,...writerInventory].map((label,index)=>({
      id:'native-register-'+label,hostId:'native-host-'+label,hostName:'Owned native '+label,environment:'local',backendKind:'self_hosted',
      url:'http://127.0.0.1:'+(18083+index),internalUrl:null,credentialRef:cluster.credentialRef||cluster.id,approvedAddresses:['127.0.0.1'],frontendReady:false})):[];
    for(const entry of registrationInventory)cfg.inventory.set(entry.id,entry);
    const bindings=(await directory.query(`SELECT r.cluster_id AS "clusterId",r.approval_id AS "approvalId",r.epoch::integer AS epoch,
      a.envelope_digest AS "envelopeDigest",c.credential_ref AS "credentialRef" FROM roomqc_control.release_authority r
      JOIN roomqc_control.release_approvals a ON a.approval_id=r.approval_id JOIN roomqc_control.clusters c ON c.id=r.cluster_id`)).rows;
    const apiOptions=()=>({emailKey:cfg.emailKey,cluster,inventory:[...cfg.inventory.values()],releaseCatalog,trust:fixtureReleaseTrustRaw,
      poolMax:input.supportAuthorityOnly===true?1:3});
    async function startApi(){api=await child('api',apiOptions());
      const ready=await api.wait('ready');apiOrigin='http://127.0.0.1:'+ready.port;return api}
    async function withSupportReplica(run){
      const secondary=await child('api',apiOptions()),ready=await secondary.wait('ready');
      const secondaryOrigin='http://127.0.0.1:'+ready.port;
      assert.notEqual(api.process.pid,secondary.process.pid);assert.notEqual(apiOrigin,secondaryOrigin);
      try{return await run({requestPrimary:request,requestReplica:(path,options)=>request(path,{...options,origin:secondaryOrigin}),
        processes:()=>({primary:api.process.pid,secondary:secondary.process.pid,primaryAlive:api.exit===null,secondaryAlive:secondary.exit===null})})}
      finally{if(!secondary.exit){secondary.process.send({type:'stop'});await until(()=>secondary.exit,'secondary-api-stop',4000);assert.equal(secondary.exit.code,0)}}
    }
    const startWorker=pause=>child('worker',{pause,bindings,recoveryCluster,recoveryExpected,recoveryToken,publishableKey:input.publishableKey});
    const tick=async()=>{const handle=await startWorker();await handle.wait('done');await handle.finished;assert.equal(handle.exit.code,0);
      workerEvents.push(...handle.messages.filter(x=>x.type==='worker_event').map(x=>x.event))};
    const fields=(owner,label)=>({fullName:'Owned API '+label,phone:'0901234567',tenantName:'Owned API '+label,
      hotelName:'Owned API '+label,hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:owner.email,totalRooms:3});
    const operator=await account('api-operator'),opProvision=await provision(metadata(operator));assert.equal(opProvision.data.state,'committed');
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin')",[operator.id]);
    await db.query('UPDATE public.users SET is_super_admin=true WHERE id=$1',[operator.id]);
    const other=await account('api-other-operator');
    await db.query(`INSERT INTO public.users(id,email,full_name,tenant_id,hotel_id,role,user_level_code,status,must_change_password,is_super_admin)
      VALUES($1,$2,'Owned API operator',$3,$4,'staff','super_admin','active',false,true)`,[other.id,other.email,opProvision.data.tenant_id,opProvision.data.hotel_id]);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin')",[other.id]);
    await startApi();
    const expectedDirectory=await migrationManifest();
    assert.deepEqual(migration.applied,expectedDirectory.map(m=>m.version));
    assert.deepEqual((await directory.query('SELECT version,checksum FROM roomqc_control.schema_migrations ORDER BY version')).rows,
      expectedDirectory.map(({version,checksum})=>({version,checksum})));
    check('real-api-runtime-login-and-complete-directory-migrations');
    const freshHealth=()=>directory.query(`UPDATE roomqc_control.cluster_health_current SET observed_at=clock_timestamp(),valid_until=clock_timestamp()+interval '120 seconds',
      evaluator_state=jsonb_set(evaluator_state,'{probeEvidence,checkedAt}',to_jsonb(clock_timestamp()))`);
    async function registration(label){
      await freshHealth();const owner=await account('api-'+label),slug='api-'+input.run+'-'+label;
      const reserved=await request('/api/control/signup-intents',{body:{slug,email:owner.email,displayName:'Owned API '+label}});
      assert.equal(reserved.status,201,'HTTP_RESERVE_'+label+':'+(reserved.data?.error??'no_error_code'));
      const workspace=(await directory.query('SELECT id,slug,status FROM roomqc_control.workspaces WHERE slug=$1',[slug])).rows[0];assert.equal(workspace.status,'reserved');
      return {label,owner,workspace,fields:fields(owner,label),path:'/api/control/workspaces/'+slug};
    }
    const state=async item=>(await directory.query(`SELECT w.status,w.tenant_id,w.hotel_id,j.id AS job_id,j.state,j.lease_until,d.id AS dispatch_id,d.terminal_state
      ,j.last_error_code,j.next_attempt_at FROM roomqc_control.workspaces w LEFT JOIN LATERAL(SELECT * FROM roomqc_control.provisioning_jobs WHERE workspace_id=w.id
        ORDER BY(state NOT IN('succeeded','cancelled')) DESC,created_at DESC,id DESC LIMIT 1)j ON true
      LEFT JOIN roomqc_control.setup_dispatches d ON d.id=j.dispatch_id WHERE w.id=$1`,[item.workspace.id])).rows[0];
    const counts=async item=>(await directory.query(`SELECT (SELECT count(*)::int FROM roomqc_control.setup_dispatches WHERE workspace_id=$1) AS dispatches,
      (SELECT count(*)::int FROM roomqc_control.workspace_recheck_commands WHERE workspace_id=$1) AS commands,
      (SELECT count(*)::int FROM roomqc_control.workspace_recheck_events WHERE workspace_id=$1) AS events,
      (SELECT count(*)::int FROM roomqc_control.attempts WHERE workspace_id=$1 AND outcome='setup_recovery_succeeded') AS recovered`,[item.workspace.id])).rows[0];
    async function awaitJobDue(item){
      const row=await state(item);assert.equal(row.state,'queued');
      // API grants its original request a real 30-second settlement window.
      // Do not overwrite next_attempt_at or substitute a synthetic clock.
      await until(async()=>(await directory.query('SELECT clock_timestamp()>=$1 AS due',[row.next_attempt_at])).rows[0].due,
        'actual-dispatch-grace-'+item.label,35000);
      barrier('db-clock-dispatch-grace-elapsed-'+item.label);
    }
    async function abandon(item,stage){
      const wire=arm('/rest/v1/rpc/provision_workspace_setup_dispatch',stage),pending=request(item.path+'/provision',{token:item.owner.token,body:item.fields});
      await until(()=>Promise.race([wire.seen.promise.then(()=>true),sleep(5).then(()=>false)]),'api-wire-'+stage);
      barrier('wire-'+stage+'-observed');assert.equal((await state(item)).status,'provisioning');
      await kill(api,'api-SIGKILL-'+stage);
      await until(()=>wire.response.destroyed,'killed-api-remote-socket-closed');
      wire.release.resolve();fault=undefined;await pending;await startApi();
    }
    async function loseAcceptanceResponse(invoke){
      const wire=arm('/rest/v1/rpc/accept_platform_support_command','drop_after');
      const pending=invoke().then(value=>({value}),error=>({error}));
      try{
        await until(()=>Promise.race([wire.seen.promise.then(()=>true),sleep(5).then(()=>false)]),'auth-acceptance-postcommit-response-drop');
        barrier('wire-auth-acceptance-response-dropped-after-commit');return {...await pending,acceptance:wire.acceptance};
      }finally{wire.release.resolve();fault=undefined;await pending}
    }
    async function loseControlResponse(path,invoke){
      const wire=arm(path,'drop_after'),pending=invoke();
      try{
        await until(()=>Promise.race([wire.seen.promise.then(()=>true),sleep(5).then(()=>false)]),'control-postcommit-response-drop');
        barrier('wire-directory-command-response-dropped-after-commit');return await pending;
      }finally{wire.release.resolve();fault=undefined;await pending}
    }
    async function holdAcceptanceResponse(invoke,whileHeld){
      const wire=arm('/rest/v1/rpc/accept_platform_support_command','after'),pending=invoke();
      try{
        await until(()=>Promise.race([wire.seen.promise.then(()=>true),sleep(5).then(()=>false)]),'held-auth-postcommit-response');
        // Capture only this response. Recovery calls must reach canonical Auth.
        fault=undefined;barrier('wire-auth-acceptance-committed-response-held');
        return await whileHeld(pending,()=>wire.release.resolve());
      }finally{fault=undefined;wire.release.resolve();await pending}
    }
    const restartSupportApi=async(label,{graceful=false}={})=>{
      if(graceful){await stopApi();barrier(label)}else await kill(api,label);
      await startApi();
    };
    if(input.supportCutoverOnly===true){
      phase='support-cutover-old-binary-live-auth-http';
      result={...await runSupportLegacyBinaryNativeChecks({input,db,actor:other,cluster,snapshot,check,barrier,until}),checks,barriers,kills,
        directoryMigrations:migration.applied.length};
      return result;
    }
    if(input.supportAuthorityOnly===true){
      phase='support-authority-live-auth-http';
      result={...await runSupportAuthorityNativeChecks({db,directory,apiDirectory,database,apiRole,operator,other,cluster,request,snapshot,check,barrier,until,
        registrationInventory,registration,abandon,metadata,provision,account,loseAcceptanceResponse,loseControlResponse,restartSupportApi,
        holdAcceptanceResponse,withSupportReplica,apiOrigin:proxyOrigin}),checks,barriers,kills,directoryMigrations:migration.applied.length};
      return result;
    }
    phase='happy';const happy=await registration('happy');
    assert.equal((await request(happy.path+'/setup-status',{token:happy.owner.token})).data.step,'ready_to_setup');
    const happyResult=await request(happy.path+'/provision',{token:happy.owner.token,body:happy.fields});assert.equal(happyResult.status,200);
    const happySnapshot=await snapshot();assert.equal((await state(happy)).status,'active');
    assert.equal((await request(happy.path+'/setup-status',{token:happy.owner.token})).data.step,'active');
    await request(happy.path+'/provision',{token:happy.owner.token,body:happy.fields});assert.deepEqual(await snapshot(),happySnapshot);
    check('reserve-owner-provision-status-and-replay-use-real-auth-and-one-business-effect');
    assert.ok([401,403].includes((await request(happy.path+'/setup-status',{token:other.token})).status));
    assert.ok([401,403].includes((await request('/api/control/admin/workspaces/'+happy.workspace.id,{token:happy.owner.token})).status));
    assert.deepEqual(await snapshot(),happySnapshot);check('owner-and-platform-boundaries-deny-other-real-sessions');

    phase='lost-response';const lost=await registration('lost');
    let wire=arm('/rest/v1/rpc/provision_workspace_setup_dispatch','drop_after');
    const lostResult=await request(lost.path+'/provision',{token:lost.owner.token,body:lost.fields});await wire.seen.promise;fault=undefined;
    assert.equal(lostResult.status,503);let row=await state(lost);assert.equal(row.status,'provisioning');assert.equal(row.terminal_state,null);
    const committedSnapshot=await snapshot();check('tcp-response-loss-after-real-business-commit-leaves-durable-dispatch');
    const detail=await request('/api/control/admin/workspaces/'+lost.workspace.id+'?limit=25',{token:operator.token});assert.equal(detail.status,200);
    assert.equal(detail.data.receipt.status,'verified');assert.ok(detail.data.recheck.snapshotSha256);check('real-platform-detail-fingerprint-and-generic-receipt');
    const command={expectedVersion:detail.data.recheck.routingVersion,expectedSnapshotSha256:detail.data.recheck.snapshotSha256,reason:'Owned real Auth recovery'},key=randomUUID();
    const recheckPath='/api/control/admin/workspaces/'+lost.workspace.id;
    wire=arm(recheckPath+'/recheck','drop_after');
    const unknown=await request(recheckPath+'/recheck',{token:operator.token,body:command,key});await wire.seen.promise;fault=undefined;
    assert.equal(unknown.networkError,true);assert.equal((await counts(lost)).commands,1);assert.equal((await counts(lost)).events,1);
    check('tcp-lost-recheck-result-commits-one-command-and-audit');
    await kill(api,'api-SIGKILL-after-recheck-commit');await startApi();
    const lookup=await request(recheckPath+'/recheck-result',{token:operator.token,key});assert.equal(lookup.status,200);assert.equal(lookup.cache,'no-store');
    assert.equal(lookup.data.requestKey,key);assert.equal(lookup.data.outcome,'reused_job');
    assert.equal((await request(recheckPath+'/recheck-result',{token:other.token,key})).status,404);
    const replay=await request(recheckPath+'/recheck',{token:operator.token,body:command,key});assert.equal(replay.data.commandId,lookup.data.commandId);
    check('real-operator-lookup-replay-and-cross-actor-result-isolation-after-process-restart');
    await awaitJobDue(lost);await tick();assert.equal((await state(lost)).status,'active');assert.deepEqual(await snapshot(),committedSnapshot);
    assert.equal((await counts(lost)).recovered,1);check('separate-worker-process-recovers-remote-commit-without-owner-token-or-business-replay');
    const historical=await request(recheckPath+'/recheck-result',{token:operator.token,key});assert.equal(historical.data.outcome,'reused_job');
    check('historical-command-remains-queued-decision-after-workspace-becomes-active');

    phase='api-kill';const before=await registration('before');await abandon(before,'before');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM private.workspace_setup_dispatches WHERE workspace_id=$1',[before.workspace.id])).rows[0].n,0);
    const beforeSnapshot=await snapshot();await awaitJobDue(before);await tick();assert.equal((await state(before)).state,'waiting_owner');assert.deepEqual(await snapshot(),beforeSnapshot);
    assert.equal((await request(before.path+'/setup-status',{token:before.owner.token})).data.step,'waiting_owner');
    check('api-kill-before-remote-call-recovers-proven-close-and-owner-status');
    await freshHealth();assert.equal((await request(before.path+'/provision',{token:before.owner.token,body:before.fields})).status,200);
    assert.equal((await counts(before)).dispatches,2);assert.equal((await state(before)).status,'active');check('owner-resumes-same-workspace-after-proven-close');
    const after=await registration('after');await abandon(after,'after');const afterSnapshot=await snapshot();await awaitJobDue(after);await tick();
    assert.equal((await state(after)).status,'active');assert.deepEqual(await snapshot(),afterSnapshot);check('api-kill-after-real-remote-commit-recovers-same-tenant-hotel-trial-and-outbox');

    phase='worker-kills';
    for(const pause of ['after_claim','after_close','after_settle']){
      const item=await registration(pause.replaceAll('_','-'));await abandon(item,pause==='after_settle'?'after':'before');
      const business=await snapshot();await awaitJobDue(item);const handle=await startWorker(pause);const reached=await handle.wait('barrier');assert.equal(reached.phase,pause);
      barrier('worker-'+pause+'-observed');await kill(handle,'worker-SIGKILL-'+pause);
      row=await state(item);
      if(pause==='after_settle'){assert.equal(row.status,'active');assert.equal(row.state,'succeeded')}
      else{
        assert.equal(row.state,'leased');await until(async()=>(await directory.query('SELECT clock_timestamp()>$1 AS expired',[row.lease_until])).rows[0].expired,'actual-lease-clock',26000);
        barrier('db-clock-lease-expired-'+pause);
      }
      await tick();row=await state(item);assert.equal(row.state,pause==='after_settle'?'succeeded':'waiting_owner');
      assert.deepEqual(await snapshot(),business);check('worker-process-recovery-'+pause+'-preserves-business-and-terminal-proof');
      if(pause==='after_settle')assert.equal((await counts(item)).recovered,1);
    }

    phase='live-revoke';const revoke=await registration('revoke');await abandon(revoke,'before');
    const revokePath='/api/control/admin/workspaces/'+revoke.workspace.id;
    const revDetail=await request(revokePath,{token:operator.token});assert.equal(revDetail.status,200);
    const revCommand={expectedVersion:revDetail.data.recheck.routingVersion,expectedSnapshotSha256:revDetail.data.recheck.snapshotSha256,reason:'Owned live revoke barrier'};
    const holder=await directory.connect(),businessBeforeRevoke=await snapshot(),countsBeforeRevoke=await counts(revoke);
    try{
      await holder.query('BEGIN');await holder.query('SELECT id FROM roomqc_control.workspaces WHERE id=$1 FOR UPDATE',[revoke.workspace.id]);
      const pending=request(revokePath+'/recheck',{token:operator.token,body:revCommand,key:randomUUID()});
      await until(async()=>(await directory.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND usename=$2
        AND wait_event_type='Lock' AND query LIKE 'SELECT id,cluster_id FROM roomqc_control.workspaces%') AS waiting`,[database,apiRole])).rows[0].waiting,'real-directory-lock');
      barrier('real-recheck-blocked-on-directory-workspace-lock');
      await db.query('DELETE FROM auth.sessions WHERE id=$1',[operator.session]);await holder.query('COMMIT');
      const denied=await pending;assert.ok([401,403].includes(denied.status));
      assert.deepEqual(await counts(revoke),countsBeforeRevoke);assert.deepEqual(await snapshot(),businessBeforeRevoke);
      check('live-auth-session-revoke-during-directory-lock-denies-command-with-zero-effects');
      assert.ok([401,403].includes((await request(recheckPath+'/recheck-result',{token:operator.token,key})).status));
      check('revoked-real-platform-session-cannot-read-previous-command');
    }finally{await holder.query('ROLLBACK');holder.release()}
    result={verified:true,checks,barriers,kills,directoryMigrations:migration.applied.length,
      actualAuth:true,actualRest:true,actualApiRuntimeRole:true,actualWorkerRuntimeRole:true,separateProcesses:true,
      directoryWorkspaceCreation:'POST control signup-intents; no SQL workspace/job/dispatch seed',
      releaseAndHealth:'synthetic signed approval and health; not target installer or five-service live proof',
      authAccounts:'GoTrue admin-created confirmed fixtures; no public signup/email verification journey',
      limits:['Directory and business databases share one disposable PostgreSQL host. Not independent A/B or VPS.',
        'Core worker store uses a 22-second lease/5-second request timeout to observe real clock expiry; not a production worker configuration/capacity proof.',
        'Observed revoke-before-final-check window is not globally atomic revocation across Auth and directory.',
        'No browser/Android, native backfill CLI, full-default/rebuild, provider email, load, DR or product acceptance.']};
    return result;
  }catch(error){
    await new Promise(resolve=>process.stderr.write(JSON.stringify({event:'native_setup_api_failed',phase,checks,barriers,kills,workerEvents})+'\n',resolve));throw error;
  }finally{
    fault?.release.resolve();fault=undefined;
    for(const handle of [...children]){handle.process.kill('SIGKILL');await handle.finished}
    proxy?.closeAllConnections();if(proxy)await new Promise(resolve=>proxy.close(resolve));
    await apiDirectory?.end();await directory?.end();
    try{
      if(created)await maintenance.query('DROP DATABASE '+database);
      if(baselineRoles){
        const after=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
        const added=after.filter(name=>!baselineRoles.includes(name));
        const allowed=new Set(['roomqc_control_api','roomqc_control_worker','roomqc_control_metrics','roomqc_control_probe_runtime',
          'roomqc_control_probe_installer','roomqc_control_release_installer','roomqc_control_release_writer','roomqc_control_alerts',
          'roomqc_control_setup_runtime','roomqc_control_setup_writer','roomqc_control_backfill_reader','roomqc_control_backfill_runtime','roomqc_control_backfill_writer',
          'roomqc_control_setup_credential_observer','roomqc_control_deployer','roomqc_control_host_observer',apiRole,workerRole]);
        if(!added.every(name=>allowed.has(name)))
          await new Promise(resolve=>process.stderr.write(JSON.stringify({event:'native_role_cleanup_mismatch',added,allowed:[...allowed],baselineCount:baselineRoles.length,afterCount:after.length})+'\n',resolve));
        assert.ok(added.every(name=>allowed.has(name)),'EXACT_OWNED_NATIVE_ROLE_CLEANUP:'+added.filter(name=>!allowed.has(name)).join(','));for(const name of added)await maintenance.query('DROP ROLE '+name);
        const restored=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);assert.deepEqual(restored,baselineRoles);
        if(result)result.directoryRoleCleanup={verified:true,baselineSha256:createHash('sha256').update(JSON.stringify(baselineRoles)).digest('hex'),removed:added.length};
      }
    }finally{await maintenance?.end()}
  }
}
