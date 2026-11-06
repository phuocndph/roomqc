import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {ControlStore} from './store.mjs';
import {fixtureConfig} from './test-fixtures.mjs';
import {fixtureSupportAuthorizer,fixtureSupportGateway} from './support-authority-fixtures.mjs';
import {clusterCommand} from './admin.mjs';
import {DeploymentQueue,executeDeploymentJob} from './deployment-queue.mjs';
import {DeploymentJournal,executeJournaledRelease} from './deployment-journal.mjs';
import {reconciliationEvidence} from './deployment-reconciliation.mjs';
import {adminRead} from './admin-read.mjs';
import {startControl} from './server.mjs';
import {ControlError} from './errors.mjs';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {inventoryFixture} from './vps-onboarding.mjs';
import {publishExecutorSpec,loadExecutorRelease} from '../../scripts/roomqc-vps-executor.mjs';
import {releaseRemoteAdapter} from '../../scripts/lib/vps-release-remote.mjs';
import {seedFixtureReleaseAuthority,fixtureReleaseContext,fixtureReleaseTrust} from './release-test-fixtures.mjs';
import {ReleaseApprovalStore} from './release-authority.mjs';
import {advanceDeploymentPhase} from './deployment-readiness.mjs';
import {releaseApprovalEndpointFingerprint} from './release-approval.mjs';

export function registerDeploymentQueueCases({dbtest,database,cluster,password,directoryContainer}){
  async function fixture(name,{environment='local',approved=false,specFields={}}={}){
    const {pool,url}=await database(name);await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);
    await pool.query('INSERT INTO roomqc_control.hosts(id,name,environment) VALUES($1,$1,$2)',[cluster.id,environment]);
    await pool.query('UPDATE roomqc_control.clusters SET host_id=$1,inventory_ref=$1 WHERE id=$1',[cluster.id]);
    const role='api_'+name;await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
    const workerRole='worker_'+name;await pool.query(`CREATE ROLE ${workerRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_deployer`);
    const apiUrl=new URL(url);apiUrl.username=role;const workerUrl=new URL(url);workerUrl.username=workerRole;
    const config=fixtureConfig(apiUrl.href,[cluster]),store=new ControlStore(config),worker=new pg.Pool({connectionString:workerUrl.href,max:3});
    const spec=(await worker.query(`INSERT INTO roomqc_control.deployment_specs
      (id,cluster_id,host_id,environment,release_id,compose_sha256,execution_sha256,primary_image,service_images,endpoint_fingerprint,expires_at)
      VALUES($1,$2,$2,$5,'release-queue',$3,$4,$6,$7::jsonb,$8,clock_timestamp()+$9*interval '1 millisecond') RETURNING *`,
    [randomUUID(),cluster.id,'a'.repeat(64),'b'.repeat(64),environment,specFields.primaryImage??'roomqc/backend@sha256:'+'c'.repeat(64),
      JSON.stringify(specFields.serviceImages??['roomqc/backend@sha256:'+'c'.repeat(64),'roomqc/web@sha256:'+'d'.repeat(64)]),
      specFields.endpointFingerprint??releaseApprovalEndpointFingerprint({url:cluster.url,internalUrl:cluster.internalUrl??null,
        approvedAddresses:cluster.approvedAddresses??[],credentialRef:cluster.credentialRef??cluster.id}),specFields.lifetimeMs??3600000])).rows[0];
    if(approved){
      const expected={clusterId:cluster.id,releaseId:spec.release_id,artifactDigest:'c'.repeat(64),frontendArtifactDigest:'d'.repeat(64),migrationSetHash:'e'.repeat(64),schemaManifestHash:'f'.repeat(64)};
      await seedFixtureReleaseAuthority(pool,fixtureReleaseContext(cluster,expected,{environment}));
      await pool.query(`UPDATE roomqc_control.clusters SET validation_state='valid',validated_at=clock_timestamp(),
        frontend_ready=true,schema_manifest_hash=$2,release_id='release-before' WHERE id=$1`,[cluster.id,expected.schemaManifestHash]);
      await pool.query(`INSERT INTO roomqc_control.backup_runs(id,cluster_id,scope,backup_id,manifest_hash,completed_at,verification_state,restore_test_at)
        VALUES($1,$2,'bundle',$3,$4,clock_timestamp(),'verified',clock_timestamp())`,[randomUUID(),cluster.id,'backup-'+name,'a'.repeat(64)]);
    }
    const actor={id:randomUUID(),clusterId:cluster.id},authorize=fixtureSupportAuthorizer(actor);
    const command=(version=1,key=randomUUID())=>clusterCommand({operation:'queue_deployment',expectedVersion:version,
      reason:'Verify isolated deployment queue',payload:{specId:spec.id,executionSha256:spec.execution_sha256}},key,cluster.id);
    const submit=cmd=>store.admin.execute(actor,cmd,randomUUID(),null,authorize);
    const plan={kind:'roomqc-vps-release-plan',clusterId:cluster.id,hostId:cluster.id,environment,releaseId:spec.release_id,
      compose:{sha256:spec.compose_sha256},decision:'ready',executeAllowed:true};
    return {pool,config,store,worker,spec,actor,authorize,command,submit,plan,close:async()=>{await store.pool.end();await worker.end()}};
  }
  dbtest('deployment queue DB: atomic canonical acceptance, concurrent original key and least privilege',async()=>{
    const f=await fixture('queue_atomic');try{
      const cmd=f.command(),results=await Promise.all([f.submit(cmd),f.submit(cmd)]);
      assert.equal(results[0].commandId,results[1].commandId);
      assert.equal(Number((await f.pool.query('SELECT count(*) FROM roomqc_control.deployment_jobs')).rows[0].count),1);
      assert.equal(Number((await f.pool.query('SELECT count(*) FROM roomqc_control.support_command_acceptances WHERE control_command_id=$1',[results[0].commandId])).rows[0].count),1);
      await assert.rejects(()=>f.submit({...cmd,payloadHash:'c'.repeat(64)}),{code:'IDEMPOTENCY_CONFLICT'});
      await assert.rejects(()=>f.submit(f.command(2)),{code:'DEPLOYMENT_QUEUE_BLOCKED'});
      await assert.rejects(()=>f.store.pool.query("UPDATE roomqc_control.deployment_jobs SET state='running'"),{code:'42501'});
      await assert.rejects(()=>f.store.pool.query('DELETE FROM roomqc_control.deployment_jobs'),{code:'42501'});
      await assert.rejects(()=>f.worker.query('UPDATE roomqc_control.deployment_specs SET release_id=$1',['tamper']),{code:'42501'});
      await assert.rejects(()=>f.worker.query("UPDATE roomqc_control.clusters SET status='offline'"),{code:'42501'});
      const client=await f.store.pool.connect();try{
        await client.query('BEGIN');await assert.rejects(()=>client.query('INSERT INTO roomqc_control.deployment_jobs(id,command_id,spec_id,cluster_id) VALUES($1,$2,$3,$4)',
          [randomUUID(),results[0].commandId,f.spec.id,cluster.id]),{code:'42501'});await client.query('ROLLBACK');
      }finally{client.release()}
    }finally{await f.close()}
  });
  dbtest('deployment queue DB: acceptance failure leaves no job or deployment run',async()=>{
    const f=await fixture('queue_auth_fail');try{
      const authorize=fixtureSupportAuthorizer(f.actor);authorize.acceptCommand=async()=>{throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Revoked')};
      await assert.rejects(()=>f.store.admin.execute(f.actor,f.command(),randomUUID(),null,authorize),{code:'SUPPORT_ADMIN_REQUIRED'});
      for(const table of ['deployment_jobs','deployment_runs','control_commands'])assert.equal(Number((await f.pool.query(`SELECT count(*) FROM roomqc_control.${table}`)).rows[0].count),0);
    }finally{await f.close()}
  });
  dbtest('deployment queue DB: two executors reserve exactly one run, execute all phases and preserve read-only API',async()=>{
    const f=await fixture('queue_worker');try{
      await f.submit(f.command());const queue=new DeploymentQueue(f.worker),calls=[];
      const remote={stage:async()=>calls.push('stage'),validate:async()=>calls.push('validate'),start:async()=>calls.push('start'),
        health:async()=>{calls.push('health');return true},commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback')};
      const results=await Promise.all([executeDeploymentJob(queue,async()=>({plan:f.plan,remote})),executeDeploymentJob(queue,async()=>({plan:f.plan,remote}))]);
      assert.equal(results.filter(Boolean).length,1);assert.deepEqual(calls,['stage','validate','start','health','commit']);
      const job=(await f.pool.query('SELECT * FROM roomqc_control.deployment_jobs')).rows[0];assert.equal(job.state,'succeeded');
      const history=await adminRead(f.store,'/deployments',new URLSearchParams());assert.equal(history.items[0].id,job.run_id);assert.equal(history.items[0].state,'deployed');
      await queue.settle();assert.equal(await queue.claim(),null);
    }finally{await f.close()}
  });
  dbtest('deployment queue DB: expired executor is never requeued and only reconciliation clears the cluster fence',async()=>{
    const f=await fixture('queue_recovery');try{
      await f.submit(f.command());const queue=new DeploymentQueue(f.worker),job=await queue.claim();
      await f.pool.query("UPDATE roomqc_control.deployment_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[job.id]);
      await assert.rejects(()=>queue.renew(job),{code:'DEPLOYMENT_LEASE_LOST'});
      await queue.settle();assert.equal((await f.pool.query('SELECT state FROM roomqc_control.deployment_jobs')).rows[0].state,'needs_review');
      assert.equal(await queue.claim(),null);await assert.rejects(()=>f.submit(f.command(2)),{code:'DEPLOYMENT_QUEUE_BLOCKED'});
      await assert.rejects(()=>f.worker.query("UPDATE roomqc_control.deployment_jobs SET state='queued',run_id=null WHERE id=$1",[job.id]),{code:'42501'});
      const journal=new DeploymentJournal(f.worker),row=await journal.read(job.run_id);
      const proof=reconciliationEvidence({...f.plan,journalRunId:row.id},{currentRelease:null,candidate:null,current:null,containers:[],observedAt:new Date().toISOString()});
      await journal.resolve(row,proof);await queue.settle();
      assert.equal((await f.pool.query('SELECT state FROM roomqc_control.deployment_jobs')).rows[0].state,'failed');
      await f.submit(f.command(2));assert.ok(await queue.claim());
    }finally{await f.close()}
  });
  dbtest('deployment queue DB: changed private specification fails before remote execution',async()=>{
    const f=await fixture('queue_spec_fail');try{
      await f.submit(f.command());await executeDeploymentJob(new DeploymentQueue(f.worker),async()=>{throw Object.assign(new Error('private path must not leak'),{code:'DEPLOYMENT_SPEC_CHANGED'})});
      const jobs=await adminRead(f.store,'/deployment-jobs',new URLSearchParams());assert.equal(jobs.items[0].state,'failed');assert.equal(jobs.items[0].errorCode,'DEPLOYMENT_SPEC_CHANGED');
      assert.equal((await f.pool.query('SELECT state FROM roomqc_control.deployment_runs')).rows[0].state,'not_started');
      assert.equal(JSON.stringify(jobs).includes('private path'),false);
    }finally{await f.close()}
  });
  dbtest('deployment readiness DB: staging requires primary approval, schema and backup; each phase saves immutable evidence',async()=>{
    const f=await fixture('gate_staging',{environment:'staging',approved:true});try{
      await f.submit(f.command());const queue=new DeploymentQueue(f.worker),calls=[];
      const remote={stage:async()=>calls.push('stage'),validate:async()=>calls.push('validate'),start:async()=>calls.push('start'),
        health:async()=>true,commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback')};
      await executeDeploymentJob(queue,async()=>({plan:f.plan,remote}));
      assert.deepEqual(calls,['stage','validate','start','commit']);
      const history=await adminRead(f.store,'/deployments',new URLSearchParams());assert.equal(history.items[0].state,'deployed');
      assert.equal(history.items[0].lastGate.mode,'primary_directory');assert.equal(history.items[0].lastGate.decision,'ready');
      const gates=(await f.pool.query('SELECT * FROM roomqc_control.deployment_gate_checks ORDER BY phase_index')).rows;
      assert.equal(gates.length,5);assert.ok(gates.every(g=>g.evidence.approvalId&&g.evidence.backupId&&g.evidence.schemaManifestHash==='f'.repeat(64)));
      await assert.rejects(()=>f.store.pool.query('INSERT INTO roomqc_control.deployment_gate_checks(id,run_id,phase_index,evidence) VALUES($1,$2,1,$3)',[randomUUID(),history.items[0].id,'{}']),{code:'42501'});
      await assert.rejects(()=>f.worker.query('UPDATE roomqc_control.deployment_gate_checks SET evidence=$1',['{}']),{code:'42501'});
      await assert.rejects(()=>f.worker.query("UPDATE roomqc_control.backup_runs SET verification_state='verified'"),{code:'42501'});
    }finally{await f.close()}
  });
  dbtest('deployment readiness DB: missing approval blocks before SSH effects and exposes reasons without private configuration',async()=>{
    const f=await fixture('gate_missing',{environment:'staging'});try{
      await f.submit(f.command());let touched=false;
      await executeDeploymentJob(new DeploymentQueue(f.worker),async()=>({plan:f.plan,remote:{stage:async()=>{touched=true},validate:async()=>{},start:async()=>{},health:async()=>true,commit:async()=>{},rollback:async()=>{}}}));
      assert.equal(touched,false);const run=(await adminRead(f.store,'/deployments',new URLSearchParams())).items[0];
      assert.equal(run.state,'not_started');assert.equal(run.lastGate.decision,'blocked');
      for(const reason of ['DEPLOYMENT_RELEASE_NOT_APPROVED','DEPLOYMENT_SCHEMA_UNVERIFIED','DEPLOYMENT_ARTIFACT_MISMATCH','DEPLOYMENT_BACKUP_UNVERIFIED'])assert.ok(run.lastGate.reasons.includes(reason));
      assert.equal(JSON.stringify(run).includes('serviceKey'),false);
    }finally{await f.close()}
  });
  dbtest('deployment readiness DB: approval withdrawn after staging stops the next phase and cannot use a stale ready receipt',async()=>{
    const f=await fixture('gate_withdraw',{environment:'staging',approved:true});try{
      await f.submit(f.command());let started=false,staged=false;
      const remote={stage:async()=>{staged=true;await f.pool.query("UPDATE roomqc_control.release_authority SET state='withdrawn'")},
        validate:async()=>assert.fail('must stop before validate'),start:async()=>{started=true},health:async()=>true,commit:async()=>{},rollback:async()=>{}};
      await executeDeploymentJob(new DeploymentQueue(f.worker),async()=>({plan:f.plan,remote}));assert.equal(staged,true);assert.equal(started,false);
      const run=(await adminRead(f.store,'/deployments',new URLSearchParams())).items[0];assert.equal(run.lastGate.decision,'blocked');assert.ok(run.lastGate.reasons.includes('DEPLOYMENT_RELEASE_NOT_APPROVED'));
    }finally{await f.close()}
  });
  dbtest('deployment readiness DB: direct phase bypass, old schema, stale backup and fabricated evidence are refused',async()=>{
    const f=await fixture('gate_checks',{environment:'staging',approved:true});try{
      await f.submit(f.command());const job=await new DeploymentQueue(f.worker).claim();
      await assert.rejects(()=>new DeploymentJournal(f.worker).phase(job.run_id,'stage_release'),{code:'42501'});
      await f.pool.query("UPDATE roomqc_control.backup_runs SET completed_at=clock_timestamp()-interval '2 days'");
      await f.pool.query("UPDATE roomqc_control.clusters SET schema_manifest_hash=$1",['a'.repeat(64)]);
      await assert.rejects(()=>advanceDeploymentPhase(f.worker,job.run_id,'stage_release'),{code:'DEPLOYMENT_SCHEMA_UNVERIFIED'});
      const last=(await adminRead(f.store,'/deployments',new URLSearchParams())).items[0].lastGate;
      assert.ok(last.reasons.includes('DEPLOYMENT_BACKUP_UNVERIFIED'));assert.ok(last.reasons.includes('DEPLOYMENT_SCHEMA_UNVERIFIED'));
      const client=await f.worker.connect();try{
        await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(727001)');
        await assert.rejects(()=>client.query('INSERT INTO roomqc_control.deployment_gate_checks(id,run_id,phase_index,evidence) VALUES($1,$2,1,$3::jsonb)',
          [randomUUID(),job.run_id,JSON.stringify({...last,decision:'ready',reasons:[]})]),{code:'42501'});await client.query('ROLLBACK');
      }finally{client.release()}
    }finally{await f.close()}
  });
  dbtest('deployment readiness DB: exact endpoint, pinned artifact and primary service membership are mandatory',async()=>{
    const changes=[{endpointFingerprint:'0'.repeat(64)},{primaryImage:'roomqc/backend@sha256:'+'0'.repeat(64)},
      {primaryImage:'c'.repeat(64)},{serviceImages:['roomqc/web@sha256:'+'d'.repeat(64)]},
      {serviceImages:['roomqc/backend@sha256:'+'c'.repeat(64),'roomqc/web:latest']}];
    for(const [index,specFields] of changes.entries()){
      const f=await fixture('gate_binding_'+index,{environment:'staging',approved:true,specFields});try{
        await f.submit(f.command());let touched=false;
        await executeDeploymentJob(new DeploymentQueue(f.worker),async()=>({plan:f.plan,remote:{stage:async()=>{touched=true},validate:async()=>{},start:async()=>{},health:async()=>true,commit:async()=>{},rollback:async()=>{}}}));
        assert.equal(touched,false);const gate=(await adminRead(f.store,'/deployments',new URLSearchParams())).items[0].lastGate;
        assert.ok(gate.reasons.includes(index===0?'DEPLOYMENT_RELEASE_NOT_APPROVED':'DEPLOYMENT_ARTIFACT_MISMATCH'));
      }finally{await f.close()}
    }
  });
  dbtest('deployment readiness DB: real key withdrawal between phases blocks further remote effects',async()=>{
    const f=await fixture('gate_key_revoked',{environment:'staging',approved:true});try{
      const fingerprint=(await f.pool.query('SELECT key_fingerprint FROM roomqc_control.release_approvals')).rows[0].key_fingerprint;
      await f.submit(f.command());let staged=false;
      const remote={stage:async()=>{
        staged=true;await new ReleaseApprovalStore(f.store.pool,fixtureReleaseTrust).withdrawKey(fingerprint,
          {expectedVersion:0,key:randomUUID(),requestId:randomUUID(),reason:'Withdraw synthetic key during isolated rollout'});
      },validate:async()=>assert.fail('revoked key must block validate'),start:async()=>assert.fail('revoked key must block start'),health:async()=>true,commit:async()=>{},rollback:async()=>{}};
      await executeDeploymentJob(new DeploymentQueue(f.worker),async()=>({plan:f.plan,remote}));assert.equal(staged,true);
      const run=(await adminRead(f.store,'/deployments',new URLSearchParams())).items[0];
      assert.equal(run.state,'not_started');assert.ok(run.lastGate.reasons.includes('DEPLOYMENT_RELEASE_NOT_APPROVED'));
      assert.equal(Number((await f.pool.query('SELECT count(*) FROM roomqc_control.release_key_revocations')).rows[0].count),1);
    }finally{await f.close()}
  });
  dbtest('deployment readiness DB: stale or future validation and expiring specifications block the next phase',async()=>{
    for(const [index,offset] of ['-10 minutes','1 minute'].entries()){
      const f=await fixture('gate_clock_'+index,{environment:'staging',approved:true});try{
        await f.submit(f.command());const job=await new DeploymentQueue(f.worker).claim();
        await f.pool.query('UPDATE roomqc_control.clusters SET validated_at=clock_timestamp()+$1::interval',[offset]);
        await assert.rejects(()=>advanceDeploymentPhase(f.worker,job.run_id,'stage_release'),{code:'DEPLOYMENT_SCHEMA_UNVERIFIED'});
      }finally{await f.close()}
    }
    const f=await fixture('gate_expired',{environment:'staging',approved:true,specFields:{lifetimeMs:2000}});try{
      await f.submit(f.command());const job=await new DeploymentQueue(f.worker).claim();assert.ok(job.run_id);
      await f.pool.query('SELECT pg_sleep(2.1)');
      await assert.rejects(()=>advanceDeploymentPhase(f.worker,job.run_id,'stage_release'),{code:'DEPLOYMENT_SPEC_UNAVAILABLE'});
    }finally{await f.close()}
  });
  dbtest('deployment readiness DB: direct operator execution uses the same immutable spec and five primary gates',async()=>{
    const f=await fixture('gate_operator',{environment:'staging',approved:true});try{
      const journal=new DeploymentJournal(f.worker);let started=false;
      await assert.rejects(()=>journal.begin(f.plan),{code:'42501'});
      const result=await executeJournaledRelease({...f.plan,specId:f.spec.id},{journal,
        remote:{stage:async()=>{},validate:async()=>{},start:async()=>{started=true},health:async()=>true,commit:async()=>{},rollback:async()=>{}}});
      assert.equal(result.status,'deployed');assert.equal(started,true);
      assert.equal(Number((await f.pool.query('SELECT count(*) FROM roomqc_control.deployment_gate_checks')).rows[0].count),5);
    }finally{await f.close()}
  });
  dbtest('deployment queue HTTP: authenticated submission, replay, strict projection and authority recheck',async()=>{
    const f=await fixture('queue_http');let authorized=true;
    const gateway=fixtureSupportGateway({supportActor:async token=>{
      if(!token)throw new ControlError(401,'LOGIN_REQUIRED','Login');if(!authorized)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Denied');return f.actor;
    }});
    const runtime=await startControl(f.config,{store:f.store,gateway}),base=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin`;
    const headers={Authorization:'Bearer fixture',Origin:f.config.publicOrigin,'Content-Type':'application/json'};
    try{
      assert.equal((await fetch(base+'/deployment-jobs')).status,401);
      const cmd=f.command(),body=JSON.stringify({operation:cmd.operation,expectedVersion:cmd.expectedVersion,reason:cmd.reason,payload:cmd.payload});
      const post=()=>fetch(base+`/clusters/${cluster.id}/commands`,{method:'POST',headers:{...headers,'Idempotency-Key':cmd.key},body});
      const first=await post();assert.equal(first.status,200);assert.equal((await post()).status,200);
      const response=await fetch(base+'/deployment-jobs',{headers});assert.equal(response.status,200);
      const jobs=await response.json();assert.equal(jobs.items[0].state,'queued');assert.equal(Object.hasOwn(jobs.items[0],'leaseToken'),false);
      assert.equal((await fetch(base+'/deployment-jobs?host=arbitrary',{headers})).status,400);
      const specs=await fetch(base+'/deployment-specs',{headers});assert.equal(specs.status,200);assert.equal((await specs.json()).items[0].id,f.spec.id);
      const query=f.store.pool.query.bind(f.store.pool);f.store.pool.query=async(...args)=>{
        const result=await query(...args);if(String(args[0]).includes('FROM roomqc_control.deployment_jobs d'))authorized=false;return result;
      };
      assert.equal((await fetch(base+'/deployment-jobs',{headers})).status,403);
    }finally{await runtime.shutdown();await f.worker.end()}
  });
  if(process.env.ROOMQC_DEPLOYMENT_QUEUE_SSH==='true')dbtest('deployment queue SSH: HTTP request to packaged executor to verified SSH target and healthy container',async()=>{
    const f=await fixture('queue_ssh');try{
      const {deploymentSshLocalDrill}=await import('../../scripts/lib/deployment-ssh-local-drill.mjs');
      await deploymentSshLocalDrill(f,{directoryContainer,cluster});
    }finally{if(!f.store.pool.ended)await f.store.pool.end();await f.worker.end()}
  });
  if(process.env.ROOMQC_DEPLOYMENT_QUEUE_DOCKER==='true')dbtest('deployment queue Docker: HTTP request to private executor spec to healthy real container and receipt',async()=>{
    const f=await fixture('queue_docker'),tag=randomUUID().replaceAll('-','').slice(0,12),label=`roomqc.deployment-queue-drill=${tag}`;
    const runner='queue-runner-'+tag,temporary=await mkdtemp(resolve('.local/deployment-queue-drill-'));
    const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024,stdio:['pipe','pipe','pipe']});
    const image=JSON.parse(docker(['image','inspect','nginx:1.27-alpine','--format','{{json .RepoDigests}}']))[0];
    const cliImage=JSON.parse(docker(['image','inspect','docker:cli','--format','{{json .RepoDigests}}']))[0];
    let runtime,published;
    try{
      docker(['run','-d','--name',runner,'--label',label,'--network','none','--mount','type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock','--entrypoint','sh',cliImage,'-c','sleep 600']);
      const inventory=inventoryFixture();inventory.inventory[0].id=cluster.id;inventory.inventory[0].hostId=cluster.id;inventory.inventory[0].approvedAddresses=['1.1.1.1'];
      const compose={services:{web:{image,labels:{'roomqc.deployment-queue-drill':tag},healthcheck:{test:['CMD-SHELL','wget -q -O /dev/null http://127.0.0.1/'],interval:'1s',timeout:'1s',retries:2},
        volumes:[{type:'volume',source:'queue-state',target:'/var/lib/queue-state'}]}},volumes:{'queue-state':{labels:{'roomqc.deployment-queue-drill':tag}}},networks:{default:{labels:{'roomqc.deployment-queue-drill':tag}}}};
      await writeFile(resolve(temporary,'inventory.json'),JSON.stringify(inventory),{mode:0o600});await writeFile(resolve(temporary,'compose.json'),JSON.stringify(compose));
      const options={inventoryFile:resolve(temporary,'inventory.json'),composeFile:resolve(temporary,'compose.json'),clusterId:cluster.id,releaseId:'queue-'+tag,image,host:'1.1.1.1',user:'roomqc',identityFile:resolve(temporary,'test-key')};
      published=await publishExecutorSpec(f.worker,temporary,options,{local:true});Object.assign(f.spec,{id:published.id,execution_sha256:published.executionSha256});
      const gateway=fixtureSupportGateway({supportActor:async token=>{if(!token)throw new ControlError(401,'LOGIN_REQUIRED','Login');return f.actor}});
      runtime=await startControl(f.config,{store:f.store,gateway});
      const base=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin`,headers={Authorization:'Bearer fixture',Origin:f.config.publicOrigin,'Content-Type':'application/json'};
      const cmd=f.command(),response=await fetch(base+`/clusters/${cluster.id}/commands`,{method:'POST',headers:{...headers,'Idempotency-Key':cmd.key},
        body:JSON.stringify({operation:cmd.operation,expectedVersion:cmd.expectedVersion,reason:cmd.reason,payload:cmd.payload})});
      assert.equal(response.status,200);
      const remoteRun=async(command,input)=>({stdout:docker(['exec','-i',runner,'sh','-c',command],input),stderr:''});
      await executeDeploymentJob(new DeploymentQueue(f.worker),async job=>{
        const prepared=await loadExecutorRelease(job,temporary,{local:true,probe:async()=>({host:'1.1.1.1',capturedAt:new Date().toISOString(),deploymentAllowed:true,
          rootFilesystem:{freePercent:60},docker:{serverVersion:'fixture-transport'}})});
        // Real Docker/Linux adapter; deliberately no actual SSH or external VPS.
        prepared.remote=releaseRemoteAdapter(remoteRun,prepared.compose);return prepared;
      });
      const jobs=await (await fetch(base+'/deployment-jobs',{headers})).json();assert.equal(jobs.items[0].state,'succeeded',JSON.stringify(jobs));
      const history=await (await fetch(base+'/deployments',{headers})).json();assert.equal(history.items[0].state,'deployed');assert.equal(history.items[0].releaseId,options.releaseId);
      const ids=docker(['ps','-q','--filter',`label=${label}`]).trim().split(/\s+/).filter(Boolean);
      const web=ids.map(id=>JSON.parse(docker(['inspect',id]))[0]).find(item=>item.Config.Labels['com.docker.compose.service']==='web');
      assert.ok(web);assert.equal(web.State.Health.Status,'healthy');
      await writeFile(resolve('artifacts/roomqc-deployment-queue-docker-local-2026-10-31.json'),JSON.stringify({passed:true,scope:{http:true,postgres:true,privateSpec:true,realDocker:true,linuxAdapter:true,ssh:false,fullRoomQCStack:false,production:false},
        jobState:jobs.items[0].state,runState:history.items[0].state,containerHealthy:true,completedAt:new Date().toISOString()},null,2)+'\n');
    }finally{
      await runtime?.shutdown();if(!runtime)await f.store.pool.end();await f.worker.end();
      for(const id of docker(['ps','-aq','--filter',`label=${label}`]).trim().split(/\s+/).filter(Boolean)){
        assert.equal(JSON.parse(docker(['inspect',id]))[0].Config.Labels['roomqc.deployment-queue-drill'],tag);docker(['rm','-f',id]);
      }
      for(const kind of ['network','volume'])for(const name of docker([kind,'ls','--filter',`label=${label}`,'--format','{{.Name}}']).trim().split(/\s+/).filter(Boolean)){
        assert.equal(JSON.parse(docker([kind,'inspect',name]))[0].Labels['roomqc.deployment-queue-drill'],tag);docker([kind,'rm',name]);
      }
      for(const name of ['inventory.json','compose.json',...(published?[published.id+'.json']:[])])await unlink(resolve(temporary,name));await rmdir(temporary);
      for(const args of [['ps','-aq','--filter',`label=${label}`],['volume','ls','--filter',`label=${label}`,'--format','{{.Name}}'],['network','ls','--filter',`label=${label}`,'--format','{{.Name}}']])assert.equal(docker(args).trim(),'');
    }
  });
}
