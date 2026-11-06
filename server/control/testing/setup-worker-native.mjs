// Exact-owned diagnostic only. Directory and business are different databases;
// SQL fixture setup is privileged, the worker uses only its separate login.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,createHmac} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rename,stat,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry,migrationManifest} from '../migrate.mjs';
import {fixtureReleaseContext,fixtureReleaseApproval,fixtureReleaseTrust,seedFixtureReleaseAuthority} from '../release-test-fixtures.mjs';
import {SetupWorkerStore} from '../setup-worker-store.mjs';
import {SetupWorker,createSetupReconciler} from '../workers/setup-worker.mjs';
import {SetupRecoveryGateway,recoveryBinding} from '../setup-recovery.mjs';
import {setupConfiguration} from '../workers/setup-config.mjs';
import {startSetupRuntime} from '../workers/setup-runtime.mjs';
import {loadRuntimeResourceContext} from '../resource-runtime.mjs';
import {readResourceDatabaseCatalog,resourceDatabaseObservationDigests} from '../resource-database.mjs';
import {validateResourcePoolSample} from '../resource-pool-observation.mjs';
import {createInstallerPgProxy} from './setup-installer-pg-proxy.mjs';
import {SetupBackfillScanner} from '../setup-backfill.mjs';
import {SetupBackfillApplier,setupBackfillCommandKey} from '../setup-backfill-apply.mjs';
import {runSetupWorkerAuthorityNativeChecks} from './setup-worker-authority-native.mjs';

export async function runSetupWorkerNativeChecks({input,db,recoveryCluster,recoveryExpected,recoveryToken,account,metadata,provision,snapshot,record}){
  assert.match(input.run,/^[a-f0-9]{12}$/);
  const database='roomqc_setup_'+input.run,role='setup_native_'+input.run,readerRole='backfill_native_'+input.run,
    applyRole='backfill_apply_native_'+input.run,password=randomBytes(32).toString('hex');
  let directory,runtimePool,readerPool,applyPool,maintenance,created=false,worker,baselineRoles,nativeResult,httpRuntime,runtimeRoot,runtimeWire,nextCredentialId;
  const checks=[];const check=(name,condition=true)=>{record('native-worker-'+name,condition);checks.push(name)};
  const backfillChecks=[];const backfillCheck=(name,condition=true)=>{record('native-backfill-'+name,condition);backfillChecks.push(name)};
  const applyChecks=[];const applyCheck=(name,condition=true)=>{record('native-backfill-apply-'+name,condition);applyChecks.push(name)};
  try{
    // Pinned Supabase postgres is not the role/extension owner. Only fixture
    // preparation uses its separate maintenance login; runtime never gets it.
    maintenance=new pg.Pool({host:'db',database:'postgres',user:'supabase_admin',password:input.databasePassword,max:1,statement_timeout:12000});
    baselineRoles=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
    assert.ok(!baselineRoles.includes(role));
    await maintenance.query('CREATE DATABASE '+database);created=true;
    directory=new pg.Pool({host:'db',database,user:'supabase_admin',password:input.databasePassword,max:3,statement_timeout:12000});
    const migration=await migrateDirectory(directory);
    const cluster={...recoveryCluster,hostId:recoveryCluster.id,publishableKey:input.publishableKey,vapidPublicKey:'owned-fixture',maxWorkspaces:99};
    await importInitialRegistry(directory,[cluster]);
    await directory.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES($1,$1,'local')",[cluster.id]);
    await directory.query('UPDATE roomqc_control.clusters SET host_id=id,inventory_ref=id');
    const context=fixtureReleaseContext(cluster,recoveryExpected);
    await seedFixtureReleaseAuthority(directory,context);
    // seedFixtureReleaseAuthority returns no credential or signer; independently
    // read only public approval identity from this owned fixture administrator.
    const binding=(await directory.query(`SELECT a.cluster_id AS "clusterId",a.approval_id AS "approvalId",a.epoch::integer AS epoch,
      a.envelope_digest AS "envelopeDigest",c.credential_ref AS "credentialRef" FROM roomqc_control.release_approvals a
      JOIN roomqc_control.release_authority r ON r.approval_id=a.approval_id JOIN roomqc_control.clusters c ON c.id=r.cluster_id`)).rows[0];
    await directory.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_setup_runtime`);
    runtimePool=new pg.Pool({host:'db',database,user:role,password,max:2,statement_timeout:5000,lock_timeout:3000});
    const store=new SetupWorkerStore(runtimePool,{bindings:[binding],retryBaseMs:100});await store.readiness();
    check('real-directory-role-and-complete-migration-history',migration.applied.length===(await migrationManifest()).length);
    await assert.rejects(()=>runtimePool.query('SELECT * FROM roomqc_control.workspaces'),{code:'42501'});
    check('runtime-cannot-read-workspaces');
    const publishableKey=input.publishableKey;
    const gateway=new SetupRecoveryGateway({allowLocal:true,inventory:new Map([[cluster.id,cluster]])},cluster,{
      expected:recoveryExpected,loadCredential:async()=>({publishableKey,token:recoveryToken})});
    await directory.query(`CREATE ROLE ${readerRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_backfill_reader`);
    readerPool=new pg.Pool({host:'db',database,user:readerRole,password,max:1,statement_timeout:5000,lock_timeout:1000});
    const readerExpected=(await readerPool.query(`SELECT s.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid",
      current_database() AS "databaseName",current_user::text AS role FROM pg_catalog.pg_control_system() s
      JOIN pg_catalog.pg_database d ON d.datname=current_database()`)).rows[0];
    const scanner=new SetupBackfillScanner(readerPool,{expected:readerExpected,bindings:[binding],gateways:[[cluster.id,gateway]]});
    await assert.rejects(()=>readerPool.query('SELECT email_hash FROM roomqc_control.workspaces'),{code:'42501'});
    await assert.rejects(()=>readerPool.query("SELECT roomqc_control.claim_setup_recovery(60000,'[]'::jsonb)"),{code:'42501'});
    backfillCheck('dedicated-reader-cannot-read-owner-input-or-claim');
    await directory.query(`CREATE ROLE ${applyRole} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_backfill_runtime`);
    applyPool=new pg.Pool({host:'db',database,user:applyRole,password,max:1,statement_timeout:5000,lock_timeout:1000});
    const applier=new SetupBackfillApplier(applyPool,{expected:{...readerExpected,role:applyRole},bindings:[binding],gateways:[[cluster.id,gateway]]});
    await applier.readiness();
    await assert.rejects(()=>applyPool.query('SELECT * FROM roomqc_control.setup_backfill_commands'),{code:'42501'});
    await assert.rejects(()=>applyPool.query('UPDATE roomqc_control.workspaces SET status=\'expired\''),{code:'42501'});
    const callable=(await applyPool.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='roomqc_control' AND has_function_privilege(current_user,p.oid,'EXECUTE') ORDER BY 1`)).rows.map(r=>r.proname);
    applyCheck('real-writer-only-two-rpcs',JSON.stringify(callable)===JSON.stringify(['apply_setup_backfill','read_setup_backfill_snapshot']));
    const batch=randomUUID(),applyCommand=item=>({key:setupBackfillCommandKey(batch,item.workspaceId),reportSha256:'a'.repeat(64),item});
    const nextWorker=()=>new SetupWorker({store,reconcile:createSetupReconciler([[cluster.id,gateway]]),concurrency:2});
    worker=nextWorker();
    const seed=async(label)=>{
      const owner=await account('worker-'+label),p=metadata(owner);
      await directory.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,owner_id,status)
        VALUES($1,$2,'Owned native worker',$3,$4,$5,'provisioning')`,[p.p_workspace_id,'worker-'+label,
        createHash('sha256').update(owner.email).digest('hex'),cluster.id,owner.id]);
      await directory.query(`INSERT INTO roomqc_control.setup_dispatches(id,workspace_id,cluster_id,owner_id,routing_version,payload_sha256)
        VALUES($1,$2,$3,$4,$5,$6)`,[p.p_dispatch_id,p.p_workspace_id,cluster.id,owner.id,p.p_routing_version,p.p_payload_sha256]);
      const job=randomUUID();await directory.query(`INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,expected_routing_version,dispatch_id)
        VALUES($1,$2,$3,$4)`,[job,p.p_workspace_id,p.p_routing_version,p.p_dispatch_id]);
      return {p,job,owner};
    };
    const state=async f=>(await directory.query(`SELECT w.status,w.tenant_id,w.hotel_id,j.state,j.last_error_code,d.terminal_state
      FROM roomqc_control.workspaces w JOIN roomqc_control.provisioning_jobs j ON j.workspace_id=w.id
      JOIN roomqc_control.setup_dispatches d ON d.id=j.dispatch_id WHERE j.id=$1`,[f.job])).rows[0];
    const dirSnapshot=async()=>Object.fromEntries(await Promise.all(['workspaces','provisioning_jobs','setup_dispatches','setup_recovery_attempts','attempts','setup_backfill_commands']
      .map(async t=>[t,(await directory.query('SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),\'[]\'::jsonb) AS value FROM roomqc_control.'+t+' t')).rows[0].value])));
    const expire=f=>directory.query("UPDATE roomqc_control.provisioning_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[f.job]);

    const remoteJournal=async()=>(await db.query("SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY dispatch_id),'[]'::jsonb) AS value FROM private.workspace_setup_dispatches t")).rows[0].value;
    const closed=await seed('closed'),beforeClosed=await snapshot(),beforeScan=await dirSnapshot(),journalBeforeScan=await remoteJournal();
    const missingReport=await scanner.scan();
    backfillCheck('real-missing-receipt-stays-pending',missingReport.items.find(r=>r.workspaceId===closed.p.p_workspace_id)?.group==='dispatch_pending');
    assert.deepEqual(await dirSnapshot(),beforeScan);assert.deepEqual(await remoteJournal(),journalBeforeScan);assert.deepEqual(await snapshot(),beforeClosed);
    backfillCheck('dry-run-does-not-close-or-mutate-directory-business-journal');
    const missingApplied=await applier.apply(applyCommand(missingReport.items.find(r=>r.workspaceId===closed.p.p_workspace_id)));
    assert.deepEqual(await snapshot(),beforeClosed);assert.deepEqual(await remoteJournal(),journalBeforeScan);
    applyCheck('real-missing-receipt-reuses-job-without-closing',missingApplied.outcome==='reused_job'&&(await state(closed)).terminal_state===null);
    await worker.tick();
    check('real-scoped-close-produces-waiting-owner',(await state(closed)).state==='waiting_owner'&&(await state(closed)).terminal_state==='closed');
    assert.deepEqual(await snapshot(),beforeClosed);check('close-does-not-create-business-data');
    const late=await provision(closed.p);check('late-owner-call-cannot-pass-tombstone',late.status===200&&late.data.state==='closed');
    assert.deepEqual(await snapshot(),beforeClosed);

    const committed=await seed('committed'),result=await provision(committed.p);assert.equal(result.data.state,'committed');
    const beforeRecovery=await snapshot(),beforeCommittedScan=await dirSnapshot(),beforeCommittedJournal=await remoteJournal();
    const pendingReport=await scanner.scan(),pending= pendingReport.items.find(r=>r.workspaceId===committed.p.p_workspace_id);
    backfillCheck('real-committed-receipt-still-needs-dispatch-proof',pending?.group==='dispatch_pending'&&pending.reason==='SETUP_RECEIPT_REQUIRES_DISPATCH_PROOF');
    assert.deepEqual((await scanner.scan()).items,pendingReport.items);
    assert.deepEqual(await dirSnapshot(),beforeCommittedScan);assert.deepEqual(await remoteJournal(),beforeCommittedJournal);assert.deepEqual(await snapshot(),beforeRecovery);
    backfillCheck('repeated-native-dry-run-preserves-snapshot-and-receipt');
    const genericApplied=await applier.apply(applyCommand(pending));
    assert.deepEqual(await snapshot(),beforeRecovery);assert.deepEqual(await remoteJournal(),beforeCommittedJournal);
    applyCheck('generic-real-receipt-does-not-activate',genericApplied.outcome==='reused_job'&&(await state(committed)).status==='provisioning');
    await worker.tick();const activated=await state(committed);
    check('lost-response-recovery-activates-matching-receipt',activated.state==='succeeded'&&activated.status==='active'
      &&activated.tenant_id===result.data.tenant_id&&activated.hotel_id===result.data.hotel_id);
    await worker.tick();assert.deepEqual(await snapshot(),beforeRecovery);check('repeated-worker-tick-does-not-replay-business');
    const recoveredReport=await scanner.scan();
    backfillCheck('real-active-and-closed-classifications',recoveredReport.counts.active_valid===1&&recoveredReport.counts.closed===1);
    const reportText=JSON.stringify(recoveredReport);
    backfillCheck('native-report-drops-owner-token-and-receipt-fields',![recoveryToken,closed.owner.email,committed.owner.email,'owner_id','lease_token','payload_sha256'].some(s=>reportText.includes(s)));
    // Use a fresh reviewed batch for already reconciled states. The previous
    // batch's durable reused-job receipt must not change into an activation.
    const noopBatch=randomUUID(),noops=[];
    for(const item of recoveredReport.items)noops.push(await applier.apply({key:setupBackfillCommandKey(noopBatch,item.workspaceId),reportSha256:'b'.repeat(64),item}));
    applyCheck('real-active-and-closed-are-no-ops',noops.length===2&&noops.every(r=>r.outcome==='no_op'));
    const applyTarget=await seed('backfill-apply'),terminalResult=await provision(applyTarget.p);assert.equal(terminalResult.data.state,'committed');
    const terminalWorkspace={id:applyTarget.p.p_workspace_id,owner_id:applyTarget.owner.id,cluster_id:cluster.id,
      routing_version:applyTarget.p.p_routing_version,api_url:cluster.url};
    const terminalDispatch={id:applyTarget.p.p_dispatch_id,workspace_id:applyTarget.p.p_workspace_id,owner_id:applyTarget.owner.id,
      cluster_id:cluster.id,routing_version:applyTarget.p.p_routing_version,payload_sha256:applyTarget.p.p_payload_sha256};
    const proof=await gateway.close(terminalWorkspace,terminalDispatch);assert.equal(proof.state,'committed');
    // Store an actual scoped protocol proof in the SQL fixture. Applier cannot
    // create this proof or call close; it only reconciles its immutable identity.
    await directory.query(`UPDATE roomqc_control.setup_dispatches SET terminal_state='committed',tenant_id=$2,hotel_id=$3,
      settled_at=clock_timestamp() WHERE id=$1`,[applyTarget.p.p_dispatch_id,proof.tenant_id,proof.hotel_id]);
    const terminalReport=await scanner.scan(),terminalItem=terminalReport.items.find(r=>r.workspaceId===applyTarget.p.p_workspace_id);
    assert.equal(terminalItem.group,'committed_pending');const terminalCommand=applyCommand(terminalItem);
    const beforeApplyBusiness=await snapshot(),beforeApplyJournal=await remoteJournal(),applied=await applier.apply(terminalCommand);
    assert.deepEqual(await snapshot(),beforeApplyBusiness);assert.deepEqual(await remoteJournal(),beforeApplyJournal);
    applyCheck('real-committed-proof-activates-directory-only',applied.outcome==='activated'&&(await state(applyTarget)).state==='succeeded');
    assert.deepEqual(await applier.apply(terminalCommand),applied);
    const oldReplay=await applier.apply(applyCommand(pending));assert.deepEqual(oldReplay,genericApplied);
    applyCheck('replay-preserves-original-result-after-worker-changes-state');
    const commandRows=(await directory.query('SELECT payload,result FROM roomqc_control.setup_backfill_commands')).rows;
    const commandText=JSON.stringify(commandRows);
    applyCheck('command-journal-has-no-owner-token-or-input',![recoveryToken,applyTarget.owner.id,applyTarget.owner.email,'lease_token','Private hotel'].some(s=>commandText.includes(s)));

    const busy=await seed('busy'),holder=await db.connect(),beforeBusy=await snapshot();
    try{
      await holder.query('SELECT pg_advisory_lock(hashtextextended($1::text,727002))',[busy.p.p_workspace_id]);
      await worker.tick();const row=await state(busy);
      check('real-remote-lock-busy-retries-without-closure',row.state==='retry'&&row.last_error_code==='SETUP_BUSY'&&row.terminal_state===null);
    }finally{await holder.query('SELECT pg_advisory_unlock(hashtextextended($1::text,727002))',[busy.p.p_workspace_id]);holder.release()}
    await directory.query('UPDATE roomqc_control.provisioning_jobs SET next_attempt_at=clock_timestamp() WHERE id=$1',[busy.job]);
    await worker.tick();check('busy-recovers-to-proven-close',(await state(busy)).state==='waiting_owner');assert.deepEqual(await snapshot(),beforeBusy);

    const stale=await seed('stale'),old=await store.claim(),terminal=await gateway.close(old.workspace,old.dispatch);
    await expire(stale);const fresh=await store.claim(),beforeStale=await dirSnapshot();
    assert.deepEqual(await store.settle(old,{outcome:'terminal',receipt:terminal}),{settled:false});assert.deepEqual(await dirSnapshot(),beforeStale);
    check('late-worker-result-cannot-overwrite-new-lease');
    const matching=await gateway.close(fresh.workspace,fresh.dispatch);
    check('takeover-settles-same-native-proof',(await store.settle(fresh,{outcome:'terminal',receipt:matching})).state==='waiting_owner');

    const fault=await seed('fault'),faultResult=await provision(fault.p);assert.equal(faultResult.data.state,'committed');
    const beforeFault=await snapshot();
    await directory.query(`CREATE FUNCTION roomqc_control.native_worker_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.outcome='setup_recovery_succeeded' THEN RAISE EXCEPTION 'OWNED_NATIVE_WORKER_AUDIT_FAULT'; END IF; RETURN NEW; END $$;
      REVOKE ALL ON FUNCTION roomqc_control.native_worker_fault() FROM PUBLIC;
      CREATE TRIGGER native_worker_fault BEFORE INSERT ON roomqc_control.attempts FOR EACH ROW EXECUTE FUNCTION roomqc_control.native_worker_fault()`);
    try{await worker.tick();const row=await state(fault);check('audit-fault-rolls-back-directory-activation',row.state==='leased'&&row.status==='provisioning'&&row.terminal_state===null)}
    finally{await directory.query('DROP TRIGGER native_worker_fault ON roomqc_control.attempts; DROP FUNCTION roomqc_control.native_worker_fault()')}
    await worker.shutdown();worker=nextWorker();await expire(fault);await worker.tick();
    check('restart-after-audit-fault-recovers-once',(await state(fault)).state==='succeeded');
    assert.deepEqual(await snapshot(),beforeFault);check('audit-recovery-preserves-business-receipt-and-trial');

    const authorityRecovery=await runSetupWorkerAuthorityNativeChecks({
      input,db,directory,database,role,password,cluster,binding,recoveryExpected,recoveryToken,
      seed,state,snapshot,dirSnapshot,provision,record});
    const revoked=await seed('revoked'),beforeRevoked=await snapshot();
    runtimeRoot=await mkdtemp('/tmp/roomqc-runtime-'+input.run+'-');
    const runtimeFile=join(runtimeRoot,'credential.json'),runtimeCluster={...recoveryCluster,hostId:cluster.id};
    const runtimeCredential={version:1,clusterId:cluster.id,bindingSha256:recoveryBinding(runtimeCluster,recoveryExpected).bindingHash,
      publishableKey,token:recoveryToken};
    await writeFile(runtimeFile,JSON.stringify(runtimeCredential),{flag:'wx',mode:0o600});
    runtimeWire=await createInstallerPgProxy();
    // Scoped fixture allocation, not an inventory of all sandbox services or
    // maintenance connections. Read the same bound example shipped to runners.
    const runtimeBudget=JSON.parse(await readFile('/repository/deploy/control-resource-budget.example.json','utf8'));
    runtimeBudget.environment='local';
    const runtimeDirectory=runtimeBudget.databases.find(d=>d.kind==='directory');runtimeDirectory.id='owned-setup-directory';
    runtimeDirectory.consumers.find(c=>c.id==='provisioning-worker').replicas=1;
    const runtimeBudgetFile=join(runtimeRoot,'budget.json');
    await writeFile(runtimeBudgetFile,JSON.stringify(runtimeBudget),{flag:'wx',mode:0o600});
    const resourceContext=loadRuntimeResourceContext({ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_RESOURCE_BUDGET_FILE:runtimeBudgetFile},{kind:'directory'});
    const runtimeConfig=Object.freeze({...setupConfiguration({schemaVersion:1,instanceId:'setup-native-runtime',poolMax:2,concurrency:2,
      intervalMs:1000,requestTimeoutMs:6000,leaseMs:60000,retryBaseMs:1000,shutdownTimeoutMs:10000,
      targets:[{cluster:runtimeCluster,approval:fixtureReleaseApproval(fixtureReleaseContext(runtimeCluster,recoveryExpected)),credentialFile:runtimeFile}],
      connectionBudget:{maxConnections:100,otherAllocatedConnections:12,instances:1,reservedConnections:5}},
      {databaseUrl:'postgresql://'+role+':'+password+'@127.0.0.1:'+runtimeWire.port+'/'+database,trust:fixtureReleaseTrust,environment:'local',allowLocal:true}),resourceContext});
    httpRuntime=await startSetupRuntime(runtimeConfig,{port:0,autoStart:false,poolObservations:true,poolStatusPort:0});
    const readyOrigin='http://127.0.0.1:'+httpRuntime.server.address().port;
    check('real-http-runtime-starts-with-file-and-live-native-readiness');
    const samplePool=async()=>{const response=await fetch('http://127.0.0.1:'+httpRuntime.poolStatus.server.address().port+'/resource-targets',
      {signal:AbortSignal.timeout(6000)});return {status:response.status,body:await response.json()}};
    // Explicit catalog grant belongs only to this owned directory fixture. It
    // is not a production migration or a new privilege for ordinary runtime.
    await directory.query(`REVOKE EXECUTE ON FUNCTION pg_catalog.pg_control_system() FROM PUBLIC,${role}`);
    const beforePoolDirectory=await dirSnapshot(),beforePoolBusiness=await snapshot(),beforePoolJournal=await remoteJournal();
    const deniedPool=await samplePool();
    assert.equal(deniedPool.status,503);assert.deepEqual(deniedPool.body,{code:'RESOURCE_POOL_UNAVAILABLE'});
    assert.deepEqual(await dirSnapshot(),beforePoolDirectory);assert.deepEqual(await snapshot(),beforePoolBusiness);assert.deepEqual(await remoteJournal(),beforePoolJournal);
    check('real-runtime-pool-catalog-denial-is-bounded-and-has-no-business-or-directory-effects');
    await directory.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${role}`);
    const firstPool=await samplePool();assert.equal(firstPool.status,200);validateResourcePoolSample(firstPool.body);
    const expectedPool=resourceDatabaseObservationDigests({...await readResourceDatabaseCatalog(directory),role});
    assert.deepEqual(firstPool.body.bindings,[{consumerId:'provisioning-worker',poolId:'main',poolMax:2,...expectedPool}]);
    assert.equal(firstPool.body.resources.budgetSha256,resourceContext.budgetSha256);
    assert.equal(firstPool.body.resources.databaseId,'owned-setup-directory');
    assert.deepEqual(firstPool.body.resources.consumers,[{id:'provisioning-worker',replicas:1,pools:[{id:'main',max:2}],fixedConnectionsPerReplica:0}]);
    assert.equal(httpRuntime.pool.options.max,2);assert.ok(httpRuntime.pool.totalCount<=2);assert.equal(httpRuntime.pool.waitingCount,0);
    assert.equal((await fetch(readyOrigin+'/resource-targets')).status,404);
    assert.ok(![password,recoveryToken,role,database,'postgresql://'].some(secret=>JSON.stringify(firstPool.body).includes(secret)));
    assert.deepEqual(await dirSnapshot(),beforePoolDirectory);assert.deepEqual(await snapshot(),beforePoolBusiness);assert.deepEqual(await remoteJournal(),beforePoolJournal);
    check('real-runtime-shared-pool-matches-reviewed-budget-native-database-and-restricted-login-without-effects');
    const jti=JSON.parse(Buffer.from(recoveryToken.split('.')[1],'base64url')).jti;
    await db.query('UPDATE private.setup_recovery_credentials SET revoked_at=clock_timestamp() WHERE id=$1',[jti]);
    const beforeReadinessDenied=await dirSnapshot(),businessReadinessDenied=await snapshot(),journalReadinessDenied=await remoteJournal();
    await httpRuntime.worker.tick();
    assert.deepEqual(await dirSnapshot(),beforeReadinessDenied);assert.deepEqual(await snapshot(),businessReadinessDenied);
    assert.deepEqual(await remoteJournal(),journalReadinessDenied);
    check('real-revoked-file-is-rejected-before-claim-with-no-attempt-or-directory-effects',
      (await fetch(readyOrigin+'/readyz')).status===503&&(await state(revoked)).state==='queued');
    const revokedPool=await samplePool();assert.equal(revokedPool.status,200);validateResourcePoolSample(revokedPool.body);
    assert.equal(revokedPool.body.processNonce,firstPool.body.processNonce);assert.deepEqual(revokedPool.body.bindings,firstPool.body.bindings);
    assert.deepEqual(await dirSnapshot(),beforeReadinessDenied);assert.deepEqual(await snapshot(),businessReadinessDenied);
    assert.deepEqual(await remoteJournal(),journalReadinessDenied);
    check('healthy-pool-catalog-never-overrides-live-recovery-credential-denial');
    await worker.tick();const denied=await state(revoked);
    check('live-revoked-scoped-token-moves-to-review',denied.state==='needs_review'&&denied.last_error_code==='RECOVERY_CREDENTIAL_DENIED'&&denied.terminal_state===null);
    assert.deepEqual(await snapshot(),beforeRevoked);check('revoked-token-does-not-create-business-data');
    const beforeRevokedScan=await dirSnapshot(),beforeRevokedJournal=await remoteJournal(),revokedReport=await scanner.scan();
    backfillCheck('real-revoked-token-reports-unavailable',revokedReport.items.find(r=>r.workspaceId===revoked.p.p_workspace_id)?.group==='unavailable');
    assert.deepEqual(await snapshot(),beforeRevoked);assert.deepEqual(await dirSnapshot(),beforeRevokedScan);assert.deepEqual(await remoteJournal(),beforeRevokedJournal);
    const revokedItem=revokedReport.items.find(r=>r.workspaceId===revoked.p.p_workspace_id),revokedApplied=await applier.apply(applyCommand(revokedItem));
    assert.deepEqual(await snapshot(),beforeRevoked);assert.deepEqual(await remoteJournal(),beforeRevokedJournal);
    applyCheck('live-revoked-remote-token-cannot-activate',revokedApplied.outcome==='unavailable'&&(await state(revoked)).status==='provisioning');
    check('worker-role-cannot-call-directory-release-installer',!(await runtimePool.query(`SELECT has_function_privilege(current_user,
      'roomqc_control.release_approval_command(text,text,bigint,uuid,text,uuid,jsonb)','EXECUTE') AS allowed`)).rows[0].allowed);
    const reload=await seed('runtime-reload'),beforeReload=await snapshot(),beforeReloadDirectory=await dirSnapshot();
    await httpRuntime.worker.tick();assert.deepEqual(await dirSnapshot(),beforeReloadDirectory);
    check('unexpired-revoked-file-stays-unready-across-repeated-cycles');
    const previousClaims=JSON.parse(Buffer.from(recoveryToken.split('.')[1],'base64url'));
    nextCredentialId=randomUUID();
    const issued=Math.floor(Date.now()/1000)-1,expires=issued+1800;
    const signed=[{alg:'HS256',typ:'JWT'},{...previousClaims,jti:nextCredentialId,iat:issued,exp:expires}]
      .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
    const nextToken=signed+'.'+createHmac('sha256',input.jwtSecret).update(signed).digest('base64url');
    // Labelled privileged fixture, not an operational issuer/rotation proof.
    await db.query(`INSERT INTO private.setup_recovery_credentials(id,cluster_id,binding_sha256,not_before,expires_at)
      VALUES($1,$2,$3,to_timestamp($4),to_timestamp($5))`,[nextCredentialId,cluster.id,runtimeCredential.bindingSha256,issued,expires]);
    const oldInode=(await stat(runtimeFile)).ino,stage=join(runtimeRoot,'credential.stage');
    await writeFile(stage,JSON.stringify({...runtimeCredential,token:nextToken}),{flag:'wx',mode:0o600});await rename(stage,runtimeFile);
    assert.notEqual((await stat(runtimeFile)).ino,oldInode);
    await httpRuntime.worker.tick();
    assert.deepEqual(await snapshot(),beforeReload);
    check('real-runtime-reloads-renamed-credential-without-restart-and-closes-one-matching-dispatch',
      (await state(reload)).state==='waiting_owner'&&(await state(reload)).terminal_state==='closed'
      &&(await fetch(readyOrigin+'/readyz')).status===200);
    const beforeReloadSample=await dirSnapshot(),reloadPool=await samplePool();assert.equal(reloadPool.status,200);validateResourcePoolSample(reloadPool.body);
    assert.equal(reloadPool.body.processNonce,firstPool.body.processNonce);assert.deepEqual(reloadPool.body.bindings,firstPool.body.bindings);
    assert.deepEqual(await dirSnapshot(),beforeReloadSample);assert.deepEqual(await snapshot(),beforeReload);
    check('atomic-credential-reload-keeps-the-same-bounded-runtime-pool-and-database-identity');
    const beforeRevokeNew=await dirSnapshot(),beforeRevokeNewJournal=await remoteJournal();
    await db.query('UPDATE private.setup_recovery_credentials SET revoked_at=clock_timestamp() WHERE id=$1',[nextCredentialId]);
    await httpRuntime.worker.tick();assert.deepEqual(await dirSnapshot(),beforeRevokeNew);assert.deepEqual(await remoteJournal(),beforeRevokeNewJournal);
    check('replacement-key-revocation-closes-readiness-again-without-consuming-jobs',(await fetch(readyOrigin+'/readyz')).status===503);
    nativeResult={verified:true,checks,backfillChecks,applyChecks,authorityRecovery,actualBackfillApplyRole:true,actualBackfillReaderRole:true,actualDirectoryRole:true,actualRemoteRecoveryRole:true,actualAuth:true,
      actualRest:true,directoryMigrations:migration.applied.length,separateDatabases:true,
      runtimeLiveReadinessVerified:true,runtimeAtomicFileReloadVerified:true,runtimeReadOnlyMountReloadVerified:false,rotationDaemonVerified:false,
      runtimePoolObservation:{verified:true,poolMax:2,actualSharedRuntimePool:true,scopedFixtureBudget:true,
        explicitFixtureCatalogGrant:true,sample:firstPool.body,sameProcessThroughCredentialReload:true},
      directoryPreparationRole:'supabase_admin; fixture setup only',
      directoryFixtureSeed:'administrator SQL, not control signup API',releaseApproval:'synthetic signed fixture, not production approval',
      limits:['No full control signup API/browser/Android journey, production secret installer, VPS or release acceptance.',
        'Runtime file reload executes the product HTTP runtime in the runner process; no separate non-root container or read-only directory mount proof.',
        'Readiness is a pre-batch live observation; revocation between it and a directory claim is not atomic across the two databases.',
        'Replacement credential was prepared by an explicit privileged fixture; not a rotation daemon or operational key issuer.']};
    nativeResult.limits.push('Pool observation uses an explicit fixture-only catalog grant and scoped allocation; not full sandbox/VPS inventory, TLS, all pool sessions or deployment provenance.');
    return nativeResult;
  }finally{
    await httpRuntime?.shutdown();await runtimeWire?.close();await worker?.shutdown();await runtimePool?.end();await readerPool?.end();await applyPool?.end();await directory?.end();
    if(nextCredentialId)await db.query('DELETE FROM private.setup_recovery_credentials WHERE id=$1',[nextCredentialId]);
    if(runtimeRoot){assert.equal(dirname(runtimeRoot),'/tmp');assert.ok(runtimeRoot.startsWith('/tmp/roomqc-runtime-'+input.run+'-'));await rm(runtimeRoot,{recursive:true,force:true})}
    try{
      if(created)await maintenance.query('DROP DATABASE '+database);
      if(maintenance&&baselineRoles){
        const after=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
        const added=after.filter(name=>!baselineRoles.includes(name));
        const allowed=new Set(['roomqc_control_api','roomqc_control_worker','roomqc_control_metrics','roomqc_control_probe_runtime',
          'roomqc_control_probe_installer','roomqc_control_release_installer','roomqc_control_release_writer','roomqc_control_alerts',
          'roomqc_control_setup_runtime','roomqc_control_setup_writer','roomqc_control_backfill_reader',
          'roomqc_control_backfill_runtime','roomqc_control_backfill_writer','roomqc_control_setup_credential_observer','roomqc_control_deployer','roomqc_control_host_observer',role,readerRole,applyRole]);
        assert.ok(added.every(name=>allowed.has(name)),'Only exact-owned fixture roles may be removed');
        for(const name of added)await maintenance.query('DROP ROLE '+name);
        const restored=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
        assert.deepEqual(restored,baselineRoles);
        if(nativeResult)nativeResult.directoryRoleCleanup={verified:true,removed:added.length,baselineCount:baselineRoles.length,
          restoredCount:restored.length,baselineSha256:createHash('sha256').update(JSON.stringify(baselineRoles)).digest('hex')};
      }
    }finally{await maintenance?.end()}
  }
}
