import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {fixtureConfig,fixtureTarget,seedOperationalCluster} from './test-fixtures.mjs';
import {ProbeKeyring} from './probe-secrets.mjs';
import {ProbeCredentialStore} from './probe-credentials.mjs';
import {ProbeSessionManager,managedHealthProbe} from './probe-session.mjs';
import {syntheticBundle,syntheticRelease} from './probe-test-fixtures.mjs';
import {telemetryTargetFingerprint} from './telemetry-source.mjs';
import {HealthStore} from './telemetry.mjs';
import {ControlStore} from './store.mjs';
import {publicCluster} from './admin.mjs';
import {HealthWorker} from './workers/health-worker.mjs';
import {healthConfiguration} from './workers/health-config.mjs';
import {loadManagedHealthConfiguration} from './workers/health-probes.mjs';
import {startHealthRuntime} from './workers/health-runtime.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {createServer} from 'node:http';
import {fixtureReleaseTrust,fixtureReleaseTrustRaw,fixtureReleaseMaximumValidityMs,fixtureReleaseContext,
  fixtureReleaseApproval} from './release-test-fixtures.mjs';
import {ReleaseApprovalStore,releaseApprovalIdentity} from './release-authority.mjs';
import {ReleaseValidationCatalog} from './release-validation.mjs';

const probes={auth:true,rest:true,storage:true,realtime:true,functions:true};
const approvalOptions=expectedVersion=>({expectedVersion,key:randomUUID(),requestId:randomUUID(),reason:'Owned health release authority fixture'});
const sample=evidence=>({observedAt:new Date(Date.now()+20).toISOString(),schemaVersion:2,
  targetFingerprint:telemetryTargetFingerprint(fixtureTarget('cluster-a')),measurementScope:'docker-desktop-vm',
  requiredMountIds:['database'],dataDisks:[{id:'database',freeBytes:100*1024**3,totalBytes:200*1024**3,inodeFreePercent:80}],
  metrics:{cpuUsedPercent:30,memoryAvailableBytes:8*1024**3,memoryTotalBytes:16*1024**3,dataDiskFreeBytes:100*1024**3,
    dataDiskTotalBytes:200*1024**3,dataDiskInodeFreePercent:80,dbConnectionsUsed:10,dbConnectionBudget:100},
  probes:{...probes},probeEvidence:evidence});
const state=async pool=>({health:(await pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows,
  policy:(await pool.query('SELECT * FROM roomqc_control.cluster_policies')).rows,
  generation:(await pool.query('SELECT last_value,is_called FROM roomqc_control.health_generation_seq')).rows,
  events:(await pool.query("SELECT id,type,before_state,after_state FROM roomqc_control.cluster_events WHERE source='collector' ORDER BY id")).rows});

export function registerHealthEvidenceCases({dbtest,database,password,cluster}){
  let serial=0;
  async function fixture(label,selected=cluster){
    const {pool,url}=await database(label);await migrateDirectory(pool);await importInitialRegistry(pool,[selected]);
    await seedOperationalCluster(pool,'cluster-a',{probeSeed:false});
    const prefix='health_evidence_'+(++serial);
    for(const [suffix,group]of [['metrics','metrics'],['probe','probe_runtime'],['installer','probe_installer'],['api','api'],['release','release_installer']]){
      await pool.query(`CREATE ROLE ${prefix}_${suffix} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_${group}`);
    }
    const pools={};
    for(const suffix of ['metrics','probe','installer','release']){
      const target=new URL(url);target.username=prefix+'_'+suffix;
      pools[suffix]=new pg.Pool({connectionString:target.href,max:3,statement_timeout:7000});
    }
    const keyBytes=randomBytes(32),keyring=new ProbeKeyring({activeKeyId:'health-key',keys:new Map([['health-key',keyBytes]])});
    const credentials=new ProbeCredentialStore(pools.probe,keyring),installer=new ProbeCredentialStore(pools.installer,keyring);
    const manager=new ProbeSessionManager({store:credentials,config:fixtureConfig(url,[selected]),cluster:selected,expected:syntheticRelease});
    const bundle=syntheticBundle();await installer.install(manager.binding,bundle,{expectedRevision:0});
    const writer=new HealthStore(pools.metrics);
    const apiUrl=new URL(url);apiUrl.username=prefix+'_api';
    const api=new ControlStore(fixtureConfig(apiUrl.href,[selected]));pools.api=api.pool;
    const releaseContext=fixtureReleaseContext(selected,syntheticRelease);
    let approval=fixtureReleaseTrust.verify(fixtureReleaseApproval(releaseContext),releaseContext);
    const authority=new ReleaseApprovalStore(pools.release,fixtureReleaseTrust),releaseApi=new ReleaseApprovalStore(pools.api,fixtureReleaseTrust);
    const proof=async()=>{
      const context=await writer.assertTarget(fixtureTarget('cluster-a'));
      const run=await manager.run(async()=>({...probes}));
      return {version:2,binding:manager.binding,releaseApproval:releaseApprovalIdentity(approval),credentialRevision:run.credentialRevision,policyVersion:context.policyVersion,
        targetFingerprint:context.fingerprint,targetVersion:context.targetVersion,checkedAt:new Date().toISOString()};
    };
    const waiters=async count=>{
      for(let i=0;i<100;i++){
        const result=await pool.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=727001 AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())");
        if(Number(result.rows[0].count)>=count)return;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.fail('Expected both real transactions to queue on the directory lock');
    };
    return {pool,pools,credentials,installer,manager,bundle,writer,proof,waiters,api,authority,releaseApi,releaseContext,keyBytes,
      get approval(){return approval},setApproval:(envelope,context)=>{approval=fixtureReleaseTrust.verify(envelope,context)},
      close:()=>Promise.all(Object.values(pools).map(p=>p.end()))};
  }
  dbtest('managed health DB: private files wire separate real role pools, persist proof, expire stale during excessive probe grants, and recover',async()=>{
    const f=await fixture('health_managed_runtime'),dir=await mkdtemp(join(tmpdir(),'roomqc-managed-db-'));
    let runtime,collections=0;
    try{
      const target=fixtureTarget('cluster-a');
      const config=healthConfiguration({schemaVersion:2,instanceId:'managed-db-fixture',targets:[{target,
        prometheus:{url:'http://127.0.0.1:9090',approvedAddresses:['127.0.0.1']}}],
      connectionBudget:{maxConnections:40,reservedConnections:5,apiInstances:1,apiPoolMax:4,reconcileInstances:1,reconcilePoolMax:2,
        healthInstances:1,healthPoolMax:2,probeInstances:1,probePoolMax:2,exporterConnections:1,migrationConnections:1}},
      {databaseUrl:f.pools.metrics.options.connectionString,production:false,allowLocal:true});
      const env={ROOMQC_HEALTH_PROBE_CONFIG_FILE:join(dir,'metadata.json'),ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE:join(dir,'probe-dsn'),
        ROOMQC_HEALTH_PROBE_KEYRING_FILE:join(dir,'keyring.json'),ROOMQC_HEALTH_RELEASE_TRUST_FILE:join(dir,'trust.json'),
        ROOMQC_HEALTH_RELEASE_APPROVAL_MAX_VALIDITY_MS:String(fixtureReleaseMaximumValidityMs)};
      const approvedCluster={id:'cluster-a',hostId:'cluster-a',
        url:cluster.url,internalUrl:null,inventoryRef:'cluster-a',credentialRef:'cluster-a',approvedAddresses:['127.0.0.1'],
        publishableKey:f.bundle.credential.publishableKey};
      const releaseContext=fixtureReleaseContext(approvedCluster,syntheticRelease),approval=fixtureReleaseApproval(releaseContext,{epoch:2});
      await f.authority.install(approval,releaseContext,{expectedVersion:1,key:randomUUID(),requestId:randomUUID(),reason:'Owned managed target approval'});
      await writeFile(env.ROOMQC_HEALTH_RELEASE_TRUST_FILE,JSON.stringify(fixtureReleaseTrustRaw),{mode:0o600});
      await writeFile(env.ROOMQC_HEALTH_PROBE_CONFIG_FILE,JSON.stringify({version:2,targets:[{cluster:approvedCluster,
        expected:syntheticRelease,approval,storage:{sha256:'a'.repeat(64)}}]}),{mode:0o600});
      await writeFile(env.ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE,f.pools.probe.options.connectionString,{mode:0o600});
      await writeFile(env.ROOMQC_HEALTH_PROBE_KEYRING_FILE,JSON.stringify({version:1,activeKeyId:'managed-db-key',
        keys:{'managed-db-key':randomBytes(32).toString('hex')}}),{mode:0o600});
      const managed=await loadManagedHealthConfiguration(env,config);
      const approvedManager=new ProbeSessionManager({store:f.installer,...managed.catalog.get(target)});
      f.installer.keyring=managed.keyring;await f.installer.install(approvedManager.binding,f.bundle,{expectedRevision:1});
      f.api.config.inventory.get('cluster-a').approvedAddresses=['127.0.0.1'];
      f.api.config.releaseValidation=new ReleaseValidationCatalog({version:2,entries:[{inventoryRef:'cluster-a',approval,
        credential:f.bundle.credential}]},{trust:fixtureReleaseTrust});
      runtime=await startHealthRuntime(config,{managed,port:0,autoStart:false,
        // This case proves real DB roles/runtime wiring, not five-service vendor
        // transport or measured host metrics. The full-vendor drill remains separate.
        collect:async(config_,cluster_,input)=>{
          collections++;assert.equal(input.auth.refreshToken,undefined);assert.equal(input.auth.sessionId,undefined);
          assert.equal(cluster_.serviceKey,undefined);assert.equal(config_.serviceKey,undefined);return {probes};
        },sourceFor:()=>({collect:async(target_,results)=>({...sample(undefined),probes:results})})});
      const metricsRole=(await runtime.pool.query('SELECT current_user AS role')).rows[0].role;
      const probeRole=(await runtime.probePool.query('SELECT current_user AS role')).rows[0].role;
      assert.notEqual(metricsRole,probeRole);
      await assert.rejects(()=>runtime.pool.query('SELECT envelope FROM roomqc_control.probe_credentials'),{code:'42501'});
      const first=await runtime.worker.tick();assert.equal(first.ready,true,JSON.stringify(first));assert.equal(collections,1);
      const saved=(await f.pool.query('SELECT evaluator_state FROM roomqc_control.cluster_health_current')).rows[0].evaluator_state;
      assert.equal(saved.probeEvidence.credentialRevision,2);assert.equal(saved.probes.storage,true);
      assert.ok(!JSON.stringify(saved).includes(f.bundle.auth.refreshToken));assert.ok(!JSON.stringify(saved).includes(f.bundle.auth.userId));
      assert.ok(publicCluster(await f.api.admin.cluster('cluster-a'),f.api.config).admission.reasonCodes.includes('METRICS_WARMING'));
      assert.match(probeRole,/^health_evidence_[0-9]+_probe$/);
      await f.pool.query(`GRANT roomqc_control_metrics TO ${probeRole}`);
      await f.pool.query("UPDATE roomqc_control.cluster_health_current SET observed_at=clock_timestamp()-interval '121 seconds',valid_until=clock_timestamp()-interval '1 second'");
      const failed=await runtime.worker.tick();assert.equal(failed.ready,false);assert.equal(failed.sweepSucceeded,true);
      assert.equal(failed.lastErrorCode,'PROBE_RUNTIME_PRIVILEGES');assert.equal(collections,1);
      const stale=(await f.pool.query('SELECT metric_status,reason_codes FROM roomqc_control.cluster_health_current')).rows[0];
      assert.equal(stale.metric_status,'unknown');assert.ok(stale.reason_codes.includes('METRICS_STALE'));
      await f.pool.query(`REVOKE roomqc_control_metrics FROM ${probeRole}`);
      assert.equal((await runtime.worker.tick()).ready,true);assert.equal(collections,2);
      assert.equal((await runtime.shutdown()).timedOut,false);assert.equal(runtime.pool.ended,true);assert.equal(runtime.probePool.ended,true);
    }finally{await runtime?.shutdown();await f.close();await rm(dir,{recursive:true})}
  });
  dbtest('health proof DB: rotate between manager assertion and health commit fences the old result atomically',async()=>{
    const f=await fixture('health_evidence_rotate');
    try{
      const evidence=await f.proof(),before=await state(f.pool),lock=await f.pool.connect();
      let rotation,write;
      try{
        await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(727001)');
        rotation=f.installer.install(f.manager.binding,f.bundle,{expectedRevision:1}).then(value=>({value}),error=>({code:error.code}));
        await f.waiters(1);
        write=f.writer.record('cluster-a',sample(evidence)).then(value=>({value}),error=>({code:error.code}));
        await f.waiters(2);
      }finally{await lock.query('ROLLBACK');lock.release()}
      const results=await Promise.all([rotation,write]);assert.equal(results[0].value?.revision,2);
      assert.deepEqual(results[1],{code:'HEALTH_PROOF_CHANGED'});
      assert.deepEqual(await state(f.pool),before,'Rejected proof must not modify snapshot, policy, generation or health audit');
      const recovered=await f.writer.record('cluster-a',sample(await f.proof()));assert.equal(recovered.accepted,true);
      const saved=(await f.pool.query('SELECT evaluator_state FROM roomqc_control.cluster_health_current')).rows[0].evaluator_state;
      assert.equal(saved.probeEvidence.credentialRevision,2);assert.ok(saved.blockedReasons.includes('METRICS_WARMING'));
      assert.ok(!JSON.stringify(saved).includes(f.bundle.auth.userId));assert.ok(!JSON.stringify(saved).includes(f.bundle.auth.refreshToken));
    }finally{await f.close()}
  });
  dbtest('health proof DB: durable release withdrawal fences queued old samples before generation and next collection, including restart',async()=>{
    const f=await fixture('health_release_withdraw');
    try{
      const evidence=await f.proof();await f.writer.record('cluster-a',sample(evidence));
      const lock=await f.pool.connect();let withdrawal,write;
      try{
        await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(727001)');
        withdrawal=f.releaseApi.withdraw('cluster-a',f.approval.approvalId,approvalOptions(1));
        await f.waiters(1);
        write=f.writer.record('cluster-a',sample(evidence)).then(value=>({value}),error=>({code:error.code}));
        await f.waiters(2);
      }finally{await lock.query('ROLLBACK');lock.release()}
      const result=await withdrawal;assert.equal(result.state,'withdrawn');
      const before=await state(f.pool);
      assert.deepEqual(await write,{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      assert.deepEqual(await state(f.pool),before,'Denied sample cannot allocate a generation or alter health/policy/collector events');
      const collect=()=>assert.fail('Withdrawn release must reject before remote collection');
      const old=managedHealthProbe({managerFor:()=>f.manager,approvalFor:()=>f.approval,storageFor:()=>({sha256:'f'.repeat(64)}),collect});
      await assert.rejects(()=>old(fixtureTarget('cluster-a'),new AbortController().signal,{}),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      const restartedManager=new ProbeSessionManager({store:f.credentials,config:f.manager.config,cluster,expected:syntheticRelease});
      const restarted=managedHealthProbe({managerFor:()=>restartedManager,approvalFor:()=>f.approval,
        storageFor:()=>({sha256:'f'.repeat(64)}),collect});
      await assert.rejects(()=>restarted(fixtureTarget('cluster-a'),new AbortController().signal,{}),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      assert.deepEqual(await state(f.pool),before);
    }finally{await f.close()}
  });
  dbtest('health proof DB: new signed approval invalidates old snapshot and proof, starts warmup and preserves critical/manual/backup gates',async()=>{
    const f=await fixture('health_release_reapprove');
    try{
      const evidence=await f.proof();await f.writer.record('cluster-a',sample(evidence));
      // Deliberately seeded evaluator history isolates proof identity from timed
      // policy tests. The production write below must discard these old windows.
      await f.pool.query(`UPDATE roomqc_control.cluster_health_current SET metric_status='healthy',reason_codes='{}',
        evaluator_state=evaluator_state||'{"warming":false,"blockedReasons":[],"healthySince":1,"latchedReasons":["DISK_CRITICAL"]}'::jsonb;
        UPDATE roomqc_control.cluster_policies SET manual_closed=false,operator_reopen_required=false`);
      const envelope=fixtureReleaseApproval(f.releaseContext,{epoch:2}),installed=await f.authority.install(envelope,f.releaseContext,approvalOptions(1));
      assert.equal(installed.version,2);assert.equal(installed.epoch,2);
      const current=publicCluster(await f.api.admin.cluster('cluster-a'),f.api.config);
      assert.ok(current.admission.reasonCodes.includes('HEALTH_PROOF_CHANGED'));
      const before=await state(f.pool);
      await assert.rejects(()=>f.writer.record('cluster-a',sample(evidence)),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      assert.deepEqual(await state(f.pool),before);
      f.setApproval(envelope,f.releaseContext);
      f.api.config.releaseValidation=new ReleaseValidationCatalog({version:2,entries:[{inventoryRef:'cluster-a',approval:envelope,
        credential:f.bundle.credential}]},{trust:fixtureReleaseTrust});
      await f.pool.query("UPDATE roomqc_control.backup_runs SET verification_state='failed'");
      const policy=(await f.pool.query('SELECT * FROM roomqc_control.cluster_policies')).rows;
      const fresh=sample(await f.proof());fresh.observedAt=new Date(Date.now()+50).toISOString();
      assert.equal((await f.writer.record('cluster-a',fresh)).accepted,true);
      const saved=(await f.pool.query('SELECT evaluator_state FROM roomqc_control.cluster_health_current')).rows[0].evaluator_state;
      assert.deepEqual(saved.probeEvidence.releaseApproval,releaseApprovalIdentity(f.approval));
      assert.equal(saved.warming,true);assert.ok(saved.latchedReasons.includes('DISK_CRITICAL'));
      assert.notEqual(saved.healthySince,1);
      assert.deepEqual((await f.pool.query('SELECT * FROM roomqc_control.cluster_policies')).rows,policy);
      const view=publicCluster(await f.api.admin.cluster('cluster-a'),f.api.config);
      assert.notEqual(view.admission.decision,'open');
      assert.ok(view.admission.reasonCodes.includes('METRICS_WARMING'));
      assert.ok(view.admission.reasonCodes.some(reason=>reason.startsWith('BACKUP_')));
    }finally{await f.close()}
  });
  dbtest('health proof DB: primary clock after the effect lock rejects approval expiring while queued, without sequence effects',async()=>{
    const f=await fixture('health_release_expiry');
    try{
      const expiresAt=Date.now()+500,context=f.releaseContext;
      const envelope=fixtureReleaseApproval(context,{epoch:2,notBefore:Date.now()-1000,expiresAt});
      await f.authority.install(envelope,context,approvalOptions(1));f.setApproval(envelope,context);
      const evidence=await f.proof(),before=await state(f.pool),lock=await f.pool.connect();let pending;
      try{
        await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(727001)');
        pending=f.writer.record('cluster-a',sample(evidence)).then(value=>({value}),error=>({code:error.code}));
        await f.waiters(1);
        await lock.query('SELECT pg_sleep(greatest(0,($1::bigint-extract(epoch FROM clock_timestamp())*1000)/1000)+0.03)',[expiresAt]);
      }finally{await lock.query('ROLLBACK');lock.release()}
      assert.deepEqual(await pending,{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      assert.deepEqual(await state(f.pool),before);
    }finally{await f.close()}
  });
  for(const withdrawalMode of ['approval','key'])dbtest('health proof DB: two real worker processes reject held HTTP after '+withdrawalMode+' withdrawal, old-config restart stays blocked and fresh-key approval recovers',async()=>{
    let requests=0,release,entered;
    const held=new Promise(resolve=>{release=resolve}),bothEntered=new Promise(resolve=>{entered=resolve});
    const server=createServer(async(req,res)=>{
      assert.equal(req.url,'/fixture-health');requests++;if(requests===2)entered();
      await held;res.setHeader('content-type','application/json');res.end(JSON.stringify({probes}));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const selected={...cluster,url:'http://127.0.0.1:'+server.address().port},f=await fixture('health_release_processes_'+withdrawalMode,selected);
    const children=[];
    async function launch(envelope){
      const child=fork(new URL('./testing/health-release-process.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']});
      let sequence=0;const pending=new Map();
      const terminal=new Promise(resolve=>child.once('exit',(code,signal)=>{
        for(const p of pending.values())p.reject(new Error('HEALTH_PROCESS_EARLY_EXIT'));pending.clear();resolve({code,signal});
      }));
      child.on('message',message=>{const p=pending.get(message?.id);if(!p)return;pending.delete(message.id);p.resolve(message)});
      const send=(operation,input={})=>new Promise((resolve,reject)=>{
        const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('HEALTH_PROCESS_REPLY_TIMEOUT'))},10000);
        pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});
        child.send({id,operation,...input});
      });
      const handle={child,send,terminal};children.push(handle);
      const metadata={version:2,targets:[{cluster:{id:selected.id,url:selected.url,hostId:'cluster-a',inventoryRef:'cluster-a',credentialRef:'cluster-a',
        internalUrl:null,approvedAddresses:['127.0.0.1'],publishableKey:f.bundle.credential.publishableKey},expected:syntheticRelease,
        approval:envelope,storage:{sha256:'a'.repeat(64)}}]};
      assert.equal((await send('init',{input:{metricsDsn:f.pools.metrics.options.connectionString,probeDsn:f.pools.probe.options.connectionString,
        key:f.keyBytes.toString('hex'),target:fixtureTarget('cluster-a'),metadata,trust:fixtureReleaseTrustRaw,
        maximumValidityMs:fixtureReleaseMaximumValidityMs,sample:sample(null)}})).ready,true);
      return handle;
    }
    try{
      // Managed metadata requires explicit addresses; install that exact signed
      // binding through its real restricted installer, then rebind credential.
      const approvedCluster={...selected,hostId:'cluster-a',credentialRef:'cluster-a',inventoryRef:'cluster-a',approvedAddresses:['127.0.0.1']};
      const context=fixtureReleaseContext(approvedCluster,syntheticRelease),envelope=fixtureReleaseApproval(context,{epoch:2});
      await f.authority.install(envelope,context,approvalOptions(1));
      const manager=new ProbeSessionManager({store:f.installer,cluster:approvedCluster,expected:syntheticRelease});
      await f.installer.install(manager.binding,f.bundle,{expectedRevision:1});
      const a=await launch(envelope),b=await launch(envelope),at=a.send('tick'),bt=b.send('tick');
      await Promise.race([bothEntered,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('HEALTH_HTTP_OVERLAP_TIMEOUT')),8000);timer.unref()})]);
      assert.equal(requests,2);
      if(withdrawalMode==='key')await f.releaseApi.withdrawKey(fixtureReleaseTrust.verify(envelope,context).keyFingerprint,approvalOptions(0));
      else await f.releaseApi.withdraw('cluster-a',envelope.payload.approvalId,approvalOptions(2));
      const before=await state(f.pool);release();
      for(const result of await Promise.all([at,bt])){
        assert.equal(result.status.lastErrorCode,'RELEASE_APPROVAL_NOT_CURRENT');assert.equal(result.status.targetsSucceeded,0);
      }
      assert.deepEqual(await state(f.pool),before,'Neither process may write a late health result or allocate sequence after withdrawal');
      for(const worker of [a,b])assert.equal((await worker.send('tick')).status.lastErrorCode,'RELEASE_APPROVAL_NOT_CURRENT');
      assert.equal(requests,2);
      await b.send('close');assert.deepEqual(await b.terminal,{code:0,signal:null});
      const restarted=await launch(envelope);
      assert.equal((await restarted.send('tick')).status.lastErrorCode,'RELEASE_APPROVAL_NOT_CURRENT');assert.equal(requests,2);
      assert.deepEqual(await state(f.pool),before);
      const fresh=fixtureReleaseApproval(context,{epoch:4},withdrawalMode==='key'?'test-rotated-key':'test-key');
      await f.authority.install(fresh,context,approvalOptions(3));
      // The still-running process retains the superseded envelope and cannot
      // borrow the new authority. A new readonly signed configuration is needed.
      assert.equal((await a.send('tick')).status.lastErrorCode,'RELEASE_APPROVAL_NOT_CURRENT');assert.equal(requests,2);
      const recovered=await launch(fresh),result=await recovered.send('tick');
      assert.equal(result.status.ready,true);assert.equal(result.status.targetsSucceeded,1);assert.equal(requests,3);
      const saved=(await f.pool.query('SELECT evaluator_state FROM roomqc_control.cluster_health_current')).rows[0].evaluator_state;
      assert.equal(saved.warming,true);assert.equal(saved.probeEvidence.releaseApproval.approvalId,fresh.payload.approvalId);
      const policy=(await f.pool.query('SELECT manual_closed,operator_reopen_required FROM roomqc_control.cluster_policies')).rows[0];
      assert.deepEqual(policy,{manual_closed:true,operator_reopen_required:true});
    }finally{
      release();
      for(const handle of children){
        if(handle.child.exitCode===null){
          await handle.send('close').catch(()=>handle.child.kill());
          const terminal=await Promise.race([handle.terminal,new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),2000);timer.unref()})]);
          if(!terminal){handle.child.kill();await handle.terminal}
        }
      }
      server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await f.close();
    }
  });
  dbtest('health proof DB: explicit disable fences old commits and admission immediately; fresh-session recovery warms up',async()=>{
    const f=await fixture('health_disable_boundary');
    try{
      const old=await f.proof();await f.writer.record('cluster-a',sample(old));
      const before=await state(f.pool),existing=(await f.pool.query('SELECT * FROM roomqc_control.workspaces')).rows;
      await f.installer.disable(f.manager.binding,{expectedRevision:1});
      await assert.rejects(()=>f.writer.record('cluster-a',sample(old)),{code:'HEALTH_PROOF_CHANGED'});
      assert.deepEqual(await state(f.pool),before,'Rejected old result cannot change snapshot, generation, policy or collector audit');
      const view=publicCluster(await f.api.admin.cluster('cluster-a'),f.api.config);
      assert.equal(view.health.status,'unknown');assert.ok(view.admission.reasonCodes.includes('HEALTH_PROOF_CHANGED'));
      await assert.rejects(()=>f.api.reserve({slug:'disabled-canary',email:'disabled-canary@example.invalid',displayName:'Disabled canary'},randomUUID()),{code:'NO_CAPACITY'});
      assert.deepEqual((await f.pool.query('SELECT * FROM roomqc_control.workspaces')).rows,existing);
      await assert.rejects(()=>f.manager.run(()=>assert.fail('Disabled credential must never collect')),{code:'PROBE_CREDENTIAL_DISABLED'});
      await assert.rejects(()=>f.installer.install(f.manager.binding,f.bundle,{expectedRevision:2}),{code:'PROBE_NEW_SESSION_REQUIRED'});
      const fresh=syntheticBundle({userId:f.bundle.auth.userId});
      await f.installer.install(f.manager.binding,fresh,{expectedRevision:2});
      const recovered=await f.writer.record('cluster-a',sample(await f.proof()));
      assert.equal(recovered.accepted,true);assert.ok(recovered.reasonCodes.includes('METRICS_WARMING'));
      const saved=(await f.pool.query('SELECT evaluator_state FROM roomqc_control.cluster_health_current')).rows[0].evaluator_state;
      assert.equal(saved.probeEvidence.credentialRevision,3);assert.equal(saved.warming,true);
    }finally{await f.close()}
  });
  dbtest('health proof DB: a committed snapshot becomes inadmissible immediately on rotation, expiry, recovery or approval drift',async()=>{
    const f=await fixture('health_evidence_admission');
    try{
      await f.writer.record('cluster-a',sample(await f.proof()));
      // This case isolates admission, not five-minute timing. The timing suite
      // separately proves warmup; only this disposable fixture is fast-forwarded.
      await f.pool.query(`UPDATE roomqc_control.cluster_health_current SET evaluator_state=evaluator_state||'{"warming":false,"blockedReasons":[]}'::jsonb,metric_status='healthy',reason_codes='{}';
        UPDATE roomqc_control.cluster_policies SET operator_reopen_required=false`);
      const view=async()=>publicCluster(await f.api.admin.cluster('cluster-a'),f.api.config);
      assert.equal((await view()).admission.decision,'open');
      const active=await f.api.reserve({slug:'proof-existing',email:'proof-existing@example.invalid',displayName:'Proof fixture'},randomUUID());
      await f.pool.query("UPDATE roomqc_control.workspaces SET status='active',tenant_id=$2,hotel_id=$3,owner_id=$4 WHERE id=$1",
        [active.id,randomUUID(),randomUUID(),randomUUID()]);
      const before=(await f.pool.query('SELECT * FROM roomqc_control.workspaces')).rows;
      const snapshot=(await f.pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows;
      const expiry=(await f.pool.query('SELECT auth_expires_at FROM roomqc_control.probe_credentials')).rows[0].auth_expires_at;
      await f.pool.query("UPDATE roomqc_control.probe_credentials SET auth_expires_at=clock_timestamp()+interval '29 seconds'");
      assert.ok((await view()).admission.reasonCodes.includes('HEALTH_PROOF_EXPIRED'));
      await f.pool.query('UPDATE roomqc_control.probe_credentials SET auth_expires_at=$1',[expiry]);
      const entry=f.api.config.inventory.get('cluster-a');entry.internalUrl='http://127.0.0.1:54322';
      assert.ok((await view()).admission.reasonCodes.includes('HEALTH_PROOF_CHANGED'));delete entry.internalUrl;
      const catalog=f.api.config.releaseValidation;f.api.config.releaseValidation=null;
      assert.ok((await view()).admission.reasonCodes.includes('HEALTH_PROOF_CHANGED'));f.api.config.releaseValidation=catalog;
      assert.equal((await view()).admission.decision,'open');
      await f.installer.install(f.manager.binding,f.bundle,{expectedRevision:1});
      const rotated=await view();assert.equal(rotated.health.status,'unknown');assert.ok(rotated.admission.reasonCodes.includes('HEALTH_PROOF_CHANGED'));
      await assert.rejects(()=>f.api.reserve({slug:'proof-blocked',email:'proof-blocked@example.invalid',displayName:'Blocked fixture'},randomUUID()),{code:'NO_CAPACITY'});
      await f.pool.query("UPDATE roomqc_control.probe_credentials SET state='needs_recovery',reason_code='REFRESH_UNCERTAIN'");
      assert.ok((await view()).admission.reasonCodes.includes('HEALTH_PROOF_CHANGED'));
      assert.deepEqual((await f.pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows,snapshot);
      assert.deepEqual((await f.pool.query('SELECT * FROM roomqc_control.workspaces')).rows,before);
    }finally{await f.close()}
  });
  dbtest('health proof DB: missing, altered, stale, policy and release proofs reject without health side effects; valid proof recovers',async()=>{
    const f=await fixture('health_evidence_reject');
    try{
      const evidence=await f.proof(),before=await state(f.pool);
      const bad=[undefined,{...evidence,credentialRevision:0},{...evidence,extra:'unexpected'},
        {...evidence,binding:{...evidence.binding,bindingHash:'0'.repeat(64)}}];
      for(const input of bad){await assert.rejects(()=>f.writer.record('cluster-a',sample(input)),{code:'INVALID_HEALTH_PROOF'});assert.deepEqual(await state(f.pool),before)}
      for(const input of [{...evidence,policyVersion:evidence.policyVersion+1},{...evidence,targetVersion:evidence.targetVersion+1}]){
        await assert.rejects(()=>f.writer.record('cluster-a',sample(input)),{code:'HEALTH_PROOF_CHANGED'});assert.deepEqual(await state(f.pool),before);
      }
      for(const at of [Date.now()-31000,Date.now()+6000]){
        await assert.rejects(()=>f.writer.record('cluster-a',sample({...evidence,checkedAt:new Date(at).toISOString()})),{code:'HEALTH_PROOF_EXPIRED'});
        assert.deepEqual(await state(f.pool),before);
      }
      await f.pool.query("UPDATE roomqc_control.clusters SET release_id='new-approved-release'");
      await assert.rejects(()=>f.writer.record('cluster-a',sample(evidence)),{code:'HEALTH_PROOF_CHANGED'});assert.deepEqual(await state(f.pool),before);
      await f.pool.query("UPDATE roomqc_control.clusters SET release_id='fixture-v3'");
      assert.equal((await f.writer.record('cluster-a',sample(await f.proof()))).accepted,true);
    }finally{await f.close()}
  });
  dbtest('health proof DB: post-lock DB time fences proof that expires while queued; inverse lock order and recovery are safe',async()=>{
    const f=await fixture('health_evidence_time');
    try{
      const evidence={...await f.proof(),checkedAt:new Date(Date.now()-29500).toISOString()},before=await state(f.pool),blocker=await f.pool.connect();
      let pending;
      try{
        await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(727001)');
        pending=f.writer.record('cluster-a',sample(evidence)).then(value=>({value}),error=>({code:error.code}));
        await f.waiters(1);await new Promise(resolve=>setTimeout(resolve,700));
      }finally{await blocker.query('ROLLBACK');blocker.release()}
      assert.deepEqual(await pending,{code:'HEALTH_PROOF_EXPIRED'});assert.deepEqual(await state(f.pool),before);
      const current=await f.proof(),lock=await f.pool.connect();let write,rotation;
      try{
        await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(727001)');
        write=f.writer.record('cluster-a',sample(current)).then(value=>({value}),error=>({code:error.code}));await f.waiters(1);
        rotation=f.installer.install(f.manager.binding,f.bundle,{expectedRevision:1}).then(value=>({value}),error=>({code:error.code}));await f.waiters(2);
      }finally{await lock.query('ROLLBACK');lock.release()}
      const results=await Promise.all([write,rotation]);assert.equal(results[0].value?.accepted,true);assert.equal(results[1].value?.revision,2);
      assert.ok(publicCluster(await f.api.admin.cluster('cluster-a'),f.api.config).admission.reasonCodes.includes('HEALTH_PROOF_CHANGED'));
      await f.pool.query(`UPDATE roomqc_control.cluster_health_current SET evaluator_state=evaluator_state||jsonb_build_object(
        'firstValidAt',0,'recoverySince',0,'latchedReasons',jsonb_build_array('DISK_CRITICAL'))`);
      const next=await f.writer.record('cluster-a',sample(await f.proof()));assert.ok(next.reasonCodes.includes('METRICS_WARMING'));
      const recovered=(await f.pool.query('SELECT evaluator_state FROM roomqc_control.cluster_health_current')).rows[0].evaluator_state;
      assert.equal(recovered.firstValidAt,Date.parse(next.observedAt));assert.equal(recovered.recoverySince,Date.parse(next.observedAt));
      assert.ok(recovered.latchedReasons.includes('DISK_CRITICAL'),'Credential changes cannot erase a latched resource fault');
    }finally{await f.close()}
  });
  dbtest('health proof DB: live credential expiry and a policy commit while health waits cannot be checked against pre-lock time or version',async()=>{
    const f=await fixture('health_evidence_policy');
    try{
      for(const mutation of ['policy','expiry']){
        const evidence=await f.proof(),lock=await f.pool.connect();let pending,expected;
        try{
          await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(727001)');
          if(mutation==='expiry')await lock.query("UPDATE roomqc_control.probe_credentials SET auth_expires_at=clock_timestamp()+interval '30.4 seconds'");
          pending=f.writer.record('cluster-a',sample(evidence)).then(value=>({value}),error=>({code:error.code}));await f.waiters(1);
          if(mutation==='policy')await lock.query('UPDATE roomqc_control.cluster_policies SET row_version=row_version+1');
          else await new Promise(resolve=>setTimeout(resolve,650));
          expected=await state(lock);await lock.query('COMMIT');
        }finally{await lock.query('ROLLBACK');lock.release()}
        assert.deepEqual(await pending,{code:mutation==='policy'?'HEALTH_PROOF_CHANGED':'HEALTH_PROOF_EXPIRED'});
        assert.deepEqual(await state(f.pool),expected);
      }
      await f.installer.install(f.manager.binding,f.bundle,{expectedRevision:1});
      assert.equal((await f.writer.record('cluster-a',sample(await f.proof()))).accepted,true);
    }finally{await f.close()}
  });
  dbtest('health proof DB: direct installer writes serialize before row locks and metadata readers cannot access credential material',async()=>{
    const f=await fixture('health_evidence_grants');
    try{
      for(const suffix of ['metrics','api']){
        assert.equal((await f.pools[suffix].query('SELECT cluster_id,revision,state,binding_hash FROM roomqc_control.probe_credentials')).rowCount,1);
        for(const sql of ['SELECT * FROM roomqc_control.probe_credentials','SELECT envelope FROM roomqc_control.probe_credentials',
          'SELECT auth_user_id,auth_session_id FROM roomqc_control.probe_credentials',
          'UPDATE roomqc_control.probe_credentials SET revision=revision+1','SELECT roomqc_control.fence_probe_credentials()']){
          await assert.rejects(()=>f.pools[suffix].query(sql),{code:'42501'});
        }
      }
      const lock=await f.pool.connect();let direct;
      try{
        await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(727001)');
        direct=f.pools.installer.query('UPDATE roomqc_control.probe_credentials SET revision=revision+1').then(()=>({ok:true}),error=>({code:error.code}));
        await f.waiters(1);
        // BEFORE STATEMENT waits before taking the row lock, avoiding reversed
        // lock-order deadlocks with API/health holders of the advisory lock.
        await lock.query('SET LOCAL lock_timeout=500');
        assert.equal((await lock.query('SELECT revision FROM roomqc_control.probe_credentials FOR UPDATE NOWAIT')).rows[0].revision,'1');
      }finally{await lock.query('ROLLBACK');lock.release()}
      assert.deepEqual(await direct,{ok:true});
    }finally{await f.close()}
  });
  dbtest('health proof DB: managed worker transports revision evidence, runs without a network-held transaction and refuses legacy bare booleans',async()=>{
    const f=await fixture('health_evidence_worker');let worker;
    try{
      let calls=0;
      const probe=managedHealthProbe({managerFor:()=>f.manager,approvalFor:()=>f.approval,storageFor:()=>({sha256:'f'.repeat(64)}),collect:async(config,cluster,settings)=>{
        assert.equal(settings.storage.sha256,'f'.repeat(64));assert.equal(settings.auth.refreshToken,undefined);
        calls++;const check=await f.pool.connect();
        try{await check.query('BEGIN');assert.equal((await check.query('SELECT pg_try_advisory_xact_lock(727001) AS ok')).rows[0].ok,true)}
        finally{await check.query('ROLLBACK');check.release()}
        return {probes:{...probes}};
      }});
      worker=new HealthWorker({store:f.writer,targets:[fixtureTarget('cluster-a')],probe,sourceFor:()=>({collect:async()=>sample(null)})});
      await worker.tick();assert.equal(worker.status().targetsSucceeded,1);assert.equal(calls,1);
      assert.equal((await f.pool.query('SELECT evaluator_state FROM roomqc_control.cluster_health_current')).rows[0].evaluator_state.probeEvidence.credentialRevision,1);
      await worker.shutdown();
      const before=await state(f.pool);
      worker=new HealthWorker({store:f.writer,targets:[fixtureTarget('cluster-a')],probe:async()=>({...probes}),sourceFor:()=>({collect:async()=>{throw new Error('must not collect without proof')}})});
      await worker.tick();assert.equal(worker.status().lastErrorCode,'INVALID_HEALTH_PROOF');assert.equal(worker.status().targetsSucceeded,0);
      assert.deepEqual(await state(f.pool),before);
    }finally{await worker?.shutdown();await f.close()}
  });
}
