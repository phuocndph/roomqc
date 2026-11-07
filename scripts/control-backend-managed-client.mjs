// Exact-owned acceptance client. Installer and worker execute in DIFFERENT
// containers with different inputs. No Docker socket, provider or public port.
import assert from 'node:assert/strict';
import {createServer as tcpServer,connect} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {readFile,writeFile,chown,chmod} from 'node:fs/promises';
// This fixture entry is evaluated at /[eval1] or /managed-client.mjs, outside
// the control package. Its pinned dependencies belong to /control, not the
// frontend's independently mounted /node_modules directory.
import pg from '/control/node_modules/pg/lib/index.js';
import {migrateDirectory,importInitialRegistry} from '/control/migrate.mjs';
import {telemetryTargetFingerprint} from '/control/telemetry-source.mjs';
import {ProbeKeyring} from '/control/probe-secrets.mjs';
import {ProbeCredentialStore} from '/control/probe-credentials.mjs';
import {ProbeSessionManager} from '/control/probe-session.mjs';
import {loadHealthConfiguration} from '/control/workers/health-config.mjs';
import {loadManagedHealthConfiguration,ManagedHealthCatalog} from '/control/workers/health-probes.mjs';
import {startHealthRuntime} from '/control/workers/health-runtime.mjs';
import {AdminDirectory,clusterCommand,clusterSelect,publicCluster} from '/control/admin.mjs';
import {ClusterGateway} from '/control/cluster.mjs';
import {supportCommandAuthorizer} from '/control/support-authority.mjs';
import {ReleaseValidationCatalog} from '/control/release-validation.mjs';
import {ReleaseApprovalTrust,releaseApprovalEndpointFingerprint} from '/control/release-approval.mjs';
import {ReleaseApprovalStore} from '/control/release-authority.mjs';
import {ControlStore} from '/control/store.mjs';
import {releaseExpectationFingerprint} from '/control/release-manifest.mjs';
import {createMetricsResponseRelay} from '/control/testing/metrics-response-relay.mjs';

const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(server.fixturePort,'127.0.0.1',resolve)});
const approvalContext=(cluster,expected,target)=>({inventoryRef:cluster.inventoryRef,clusterId:cluster.id,hostId:target.hostId,
  environment:target.environment,expected,endpointFingerprint:releaseApprovalEndpointFingerprint({url:cluster.url,
    internalUrl:cluster.internalUrl??null,approvedAddresses:cluster.approvedAddresses,credentialRef:cluster.credentialRef})});
const approvalCommand=expectedVersion=>({expectedVersion,key:randomUUID(),requestId:randomUUID(),reason:'Exact-owned managed signed release fixture'});
function signedObservationConfiguration(metadata,target,input){
  // Read-only observer has public trust and signed metadata, no manifest JWT.
  // Reuse managed validation, then verify the actual requested context on every
  // authorization read; never substitute a plain expected-hash callback.
  const trust=new ReleaseApprovalTrust(input.publicTrust,{maximumValidityMs:input.maximumValidityMs});
  const catalog=new ManagedHealthCatalog(metadata,{schemaVersion:2,allowLocal:true,targets:[{target}]},trust);
  const {cluster,expected}=catalog.get(target),entry={...cluster,environment:target.environment,releaseId:expected.releaseId,
    schemaManifestHash:expected.schemaManifestHash,frontendReady:true,telemetryTarget:target};
  return {allowLocal:true,clusters:[cluster],supportClusterId:cluster.id,inventory:new Map([[cluster.inventoryRef,entry]]),
    credentials:new Map([[cluster.credentialRef,{publishableKey:cluster.publishableKey}]]),releaseValidation:{
      expectation:inventoryRef=>{assert.equal(inventoryRef,cluster.inventoryRef);return catalog.get(target).expected},
      authorization:(inventoryRef,context,options)=>{assert.equal(inventoryRef,cluster.inventoryRef);
        return trust.verify(metadata.targets[0].approval,context,options)}
    }};
}
async function installSupportAuthority(){
  // Privileged, short-lived setup for this disposable backend only. Neither
  // this input nor its account tokens are mounted in the monitoring worker.
  const input=JSON.parse(process.env.ROOMQC_MANAGED_AUTHORITY_INPUT);
  assert.match(input.run,/^[a-f0-9]{12}$/);
  const db=new pg.Pool({connectionString:input.databaseUrl,max:1,connectionTimeoutMillis:2000,statement_timeout:5000});
  const request=async(path,key,body)=>{
    const response=await fetch('http://127.0.0.1:8000'+path,{method:'POST',
      headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
    assert.ok(response.ok,'MANAGED_AUTHORITY_SETUP_REJECTED_'+response.status);return response.json();
  };
  const account=async label=>{
    const email='managed-'+input.run+'-'+label+'@roomqc.invalid',password=randomUUID()+randomUUID();
    const user=await request('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});
    const login=await request('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});
    assert.equal(login.user.id,user.id);assert.ok(login.user.email_confirmed_at);
    const sessionId=JSON.parse(Buffer.from(login.access_token.split('.')[1],'base64url')).session_id;
    assert.match(user.id,/^[a-f0-9-]{36}$/);assert.match(sessionId,/^[a-f0-9-]{36}$/);
    return {id:user.id,email,token:login.access_token,sessionId};
  };
  try{
    const authority=(await db.query('SELECT current_user AS role,current_database() AS database')).rows[0];
    assert.deepEqual(authority,{role:'postgres',database:'postgres'});
    const operator=await account('operator'),revoked=await account('revoked');
    const binding=await request('/rest/v1/rpc/provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:operator.id,
      p_fields:{fullName:'Owned managed authority',phone:'0901234567',tenantName:'Owned managed authority',hotelName:'Owned managed authority',
        hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:operator.email,totalRooms:3}});
    assert.equal(binding.success,true,'MANAGED_AUTHORITY_PROFILE_REQUIRED');
    await db.query(`INSERT INTO public.users(id,email,full_name,tenant_id,hotel_id,role,user_level_code,status,must_change_password,is_super_admin)
      VALUES($1,$2,'Owned managed revoked authority',$3,$4,'staff','super_admin','active',false,true)`,
    [revoked.id,revoked.email,binding.tenant_id,binding.hotel_id]);
    await db.query('UPDATE public.users SET is_super_admin=true WHERE id=$1',[operator.id]);
    for(const actor of [operator,revoked])await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'super_admin')",[actor.id]);
    assert.equal((await db.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[revoked.sessionId,revoked.id])).rowCount,1);
    console.log(JSON.stringify({verified:true,operator,revoked,actualAuth:true,revokedSessionRemoved:true,
      accounts:'admin-created confirmed disposable fixtures; not public signup/email verification'}));
  }finally{await db.end()}
}
async function managedAuthority(config,input){
  const gateway=new ClusterGateway(config),actor=await gateway.supportActor(input.operator.token);
  assert.equal(actor.id,input.operator.id);assert.equal(gateway.supportSessionId(input.operator.token),input.operator.sessionId);
  return {actor,authorize:supportCommandAuthorizer(gateway,actor,input.operator.token),
    revokedActor:{id:input.revoked.id,clusterId:actor.clusterId},
    revokedAuthorize:supportCommandAuthorizer(gateway,{id:input.revoked.id,clusterId:actor.clusterId},input.revoked.token)};
}
async function deniedAuthorityChecks(admin,command,{actor,revokedActor,revokedAuthorize},validation){
  const journal=async()=>{
    const result={};
    for(const table of ['control_commands','support_command_intents','support_command_attempts','support_command_acceptances',
      'support_attempt_closures','support_intent_results'])
      result[table]=Number((await admin.pool.query('SELECT count(*) FROM roomqc_control.'+table)).rows[0].count);
    return result;
  };
  const before=await journal();
  await assert.rejects(()=>admin.execute(actor,command,randomUUID(),validation),{code:'SUPPORT_AUTHORITY_REQUIRED'});
  await assert.rejects(()=>admin.execute(revokedActor,command,randomUUID(),validation,revokedAuthorize),
    error=>[401,403].includes(error.status)&&error.code==='CLUSTER_REQUEST_FAILED');
  assert.deepEqual(await journal(),before,'DENIED_AUTHORITY_CREATED_COMMAND_OR_JOURNAL');
}
async function supportReceipt(pool,actor,command,sessionId){
  const rows=(await pool.query(`SELECT a.*,i.audience AS installed_audience FROM roomqc_control.support_command_acceptances a
    JOIN roomqc_control.support_authority_identity i ON i.singleton=true
    JOIN roomqc_control.control_commands c ON c.id=a.control_command_id
    WHERE c.actor_id=$1 AND c.operation=$2 AND c.idempotency_key=$3`,[actor.id,command.operation,command.key])).rows;
  assert.equal(rows.length,1,'MANAGED_CANONICAL_ACCEPTANCE_REQUIRED');const receipt=rows[0];
  assert.equal(receipt.actor_id,actor.id);assert.equal(receipt.authority_cluster_id,actor.clusterId);
  assert.equal(receipt.session_id,sessionId);assert.equal(receipt.audience,receipt.installed_audience);
  assert.equal(receipt.operation,'cluster_command');assert.equal(receipt.target,command.targetId);
  assert.equal(receipt.request_key,command.key);assert.equal(receipt.payload_hash,command.payloadHash);
  return receipt;
}
async function directoryRelay(){
  const sockets=new Set();
  const server=tcpServer(client=>{
    const upstream=connect({host:'managed-directory',port:5432});sockets.add(client);sockets.add(upstream);
    for(const socket of [client,upstream]){socket.on('error',()=>{client.destroy();upstream.destroy()});socket.on('close',()=>sockets.delete(socket))}
    client.pipe(upstream);upstream.pipe(client);
  });
  server.fixturePort=15432;await listen(server);
  return {close:async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve))}};
}
async function install(){
  const input=JSON.parse(process.env.ROOMQC_MANAGED_INSTALL_INPUT),relay=await directoryRelay();
  const pool=new pg.Pool({connectionString:input.databaseUrl,max:1,statement_timeout:10000});
  try{
    await migrateDirectory(pool);await importInitialRegistry(pool,[input.cluster]);
    for(const [suffix,group]of [['metrics','metrics'],['probe','probe_runtime'],['reader','api'],['installer','probe_installer'],['operator','api'],['release','release_installer']]){
      assert.match(input.passwords[suffix],/^[a-f0-9]{64}$/);
      await pool.query(`CREATE ROLE roomqc_managed_${suffix} LOGIN PASSWORD '${input.passwords[suffix]}' IN ROLE roomqc_control_${group}`);
    }
    const {cluster,expected,target}=input;
    await pool.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES($1,$1,'local')",[target.hostId]);
    await pool.query(`UPDATE roomqc_control.clusters SET host_id=$2,validation_state='valid',release_id=$3,
      schema_manifest_hash=$4,frontend_ready=true,inventory_ref=$1,telemetry_target_fingerprint=$5,
      telemetry_target_definition=$6::jsonb WHERE id=$1`,[cluster.id,target.hostId,expected.releaseId,
      expected.schemaManifestHash,telemetryTargetFingerprint(target),JSON.stringify(target)]);
    // No synthetic healthy snapshot, backdated binding or fake backup row.
    await pool.query('UPDATE roomqc_control.cluster_policies SET manual_closed=true WHERE cluster_id=$1',[cluster.id]);
    const keyring=new ProbeKeyring({activeKeyId:'managed-fixture',keys:new Map([['managed-fixture',Buffer.from(input.key,'hex')]])});
    const installer=new ProbeCredentialStore(pool,keyring);
    const manager=new ProbeSessionManager({store:installer,cluster,expected});
    await installer.install(manager.binding,input.bundle,{expectedRevision:0});
    const dsn=suffix=>`postgresql://roomqc_managed_${suffix}:${input.passwords[suffix]}@127.0.0.1:15432/roomqc_managed_fixture`;
    const releasePool=new pg.Pool({connectionString:dsn('release'),max:1,connectionTimeoutMillis:2000,statement_timeout:5000});
    try{
      const trust=new ReleaseApprovalTrust(input.publicTrust,{maximumValidityMs:input.maximumValidityMs});
      const approvalInstaller=new ReleaseApprovalStore(releasePool,trust);
      await approvalInstaller.install(input.metadata.targets[0].approval,approvalContext(cluster,expected,target),approvalCommand(0));
    }finally{await releasePool.end()}
    const values={
      'health.json':input.health,'health-alternate.json':input.alternateHealth,'metadata.json':input.metadata,
      'metadata-release.json':input.releaseMetadata,
      'release-trust.json':input.publicTrust,
      'metrics-dsn':dsn('metrics'),'probe-dsn':dsn('probe'),
      'keyring.json':{version:1,activeKeyId:'managed-fixture',keys:{'managed-fixture':input.key}}
    };
    for(const [name,value]of Object.entries(values)){
      const file='/managed/'+name;await writeFile(file,typeof value==='string'?value:JSON.stringify(value),{mode:0o600,flag:'wx'});
      await chmod(file,0o600);await chown(file,1000,1000);
    }
    assert.equal(Number((await pool.query('SELECT count(*) FROM roomqc_control.cluster_health_current')).rows[0].count),0);
    console.log(JSON.stringify({installed:true,syntheticHealthRows:0,backupEvidenceFixture:false}));
  }finally{await pool.end();await relay.close()}
}
async function snapshot(pool,metadata,target,input){
    const {cluster}=metadata.targets[0],config=signedObservationConfiguration(metadata,target,input);
    const row=(await pool.query(clusterSelect+' WHERE c.id=$1',[cluster.id])).rows[0];assert.ok(row);
    const view=publicCluster(row,config),state=row.evaluator_state;
    const response=await fetch('http://127.0.0.1:8093/readyz',{signal:AbortSignal.timeout(3000)}),worker=await response.json();
    const counts=(await pool.query(`SELECT
      (SELECT count(*)::integer FROM roomqc_control.cluster_events WHERE cluster_id=$1 AND source='collector') AS collector,
      (SELECT count(*)::integer FROM roomqc_control.cluster_events WHERE cluster_id=$1 AND source='admin') AS admin,
      (SELECT count(*)::integer FROM roomqc_control.control_commands WHERE target_id=$1) AS commands`,[cluster.id])).rows[0];
    const collectorEvents=counts.collector;
    return {at:Date.now(),worker:{ready:response.ok,alive:worker.alive,active:worker.active,
      lastErrorCode:worker.lastErrorCode,lastStartedAt:worker.lastStartedAt,lastFinishedAt:worker.lastFinishedAt,
      consecutiveFailures:worker.consecutiveFailures,targetsSucceeded:worker.targetsSucceeded,targetsFailed:worker.targetsFailed},
      health:view.health,admission:view.admission,state:state?{firstValidAt:state.firstValidAt,lastObservedAt:state.lastObservedAt,
        warming:state.warming,recoverySince:state.recoverySince,latchedReasons:state.latchedReasons,
        probes:state.probes,probeFailures:state.probeFailures,proofCredentialRevision:state.probeEvidence?.credentialRevision,
        proofPolicyVersion:state.probeEvidence?.policyVersion,proofTargetVersion:state.probeEvidence?.targetVersion}:null,
      guard:{generation:Number(row.source_generation),observedAt:row.health_observed_at,
        evaluatorHash:createHash('sha256').update(JSON.stringify(state)).digest('hex'),collectorEvents,
        policyVersion:Number(row.policy_version),credentialRevision:Number(row.probe_revision),credentialState:row.probe_state,
        clusterVersion:Number(row.row_version),targetVersion:Number(row.telemetry_target_version),
        targetFingerprint:row.telemetry_target_fingerprint,targetBoundAt:row.telemetry_target_bound_at,
        commandCount:counts.commands,adminEvents:counts.admin,releaseId:row.release_id,
        schemaManifestHash:row.schema_manifest_hash,probeBindingHash:row.probe_binding_hash}};
}
async function observe(){
  const input=JSON.parse(process.env.ROOMQC_MANAGED_OBSERVER_INPUT),{databaseUrl,metadata,target}=input;
  const pool=new pg.Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:2000,statement_timeout:3000});
  try{console.log(JSON.stringify(await snapshot(pool,metadata,target,input)));
  }finally{await pool.end()}
}
async function credentialDrill(){
  // Dedicated restricted installer/reader logins only; never passed to worker.
  const input=JSON.parse(process.env.ROOMQC_MANAGED_DRILL_INPUT);
  assert.ok(['rotate','disable','recover','rebind'].includes(input.operation));
  const options=connectionString=>({connectionString,max:1,connectionTimeoutMillis:2000,statement_timeout:3000,lock_timeout:2000});
  const pool=new pg.Pool(options(input.databaseUrl)),reader=new pg.Pool(options(input.readerDatabaseUrl));
  const {cluster,expected}=input.metadata.targets[0],manager=new ProbeSessionManager({store:null,cluster,expected});
  let held;
  const gate=async(path,body)=>{
    const response=await fetch('http://127.0.0.1:19091'+path,{method:body===undefined?'GET':'POST',
      headers:{authorization:'Bearer '+input.gateToken,'content-type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(1500)});
    assert.equal(response.status,200,'MANAGED_GATE_REQUEST_REJECTED');return response.json();
  };
  const identity=value=>({epoch:value.epoch,generation:value.generation});
  const read=()=>snapshot(reader,input.metadata,input.target,input);
  try{
    const authority=(await pool.query("SELECT pg_has_role(current_user,'roomqc_control_probe_installer','USAGE') AS installer,rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert.deepEqual(authority,{installer:true,rolsuper:false,rolcreaterole:false,rolbypassrls:false});
    const old=(await pool.query('SELECT revision,state,auth_user_id,auth_session_id,binding_hash FROM roomqc_control.probe_credentials WHERE cluster_id=$1',[cluster.id])).rows[0];
    assert.ok(old);let bundle;
    if(input.operation!=='disable'){
      // Password is an exact-owned fixture secret, not an owner impersonation.
      // Sign in BEFORE holding metrics so no Auth call spends the hold budget.
      const response=await fetch(cluster.url+'/auth/v1/token?grant_type=password',{method:'POST',
        headers:{apikey:cluster.publishableKey,'content-type':'application/json'},body:JSON.stringify(input.login),signal:AbortSignal.timeout(5000)});
      assert.equal(response.status,200,'MANAGED_FRESH_SESSION_FAILED');const fresh=await response.json();
      const claims=JSON.parse(Buffer.from(fresh.access_token.split('.')[1],'base64url'));
      assert.ok(fresh.user.id===old.auth_user_id&&claims.session_id!==old.auth_session_id,'MANAGED_FRESH_SESSION_IDENTITY_REQUIRED');
      bundle={credential:input.credential,auth:{token:fresh.access_token,refreshToken:fresh.refresh_token,userId:fresh.user.id,sessionId:claims.session_id}};
    }
    const keyring=input.operation==='disable'?null:new ProbeKeyring({activeKeyId:'managed-fixture',keys:new Map([['managed-fixture',Buffer.from(input.key,'hex')]])});
    const installer=new ProbeCredentialStore(pool,keyring),revision=Number(old.revision);
    if(input.operation==='recover'||input.operation==='rebind'){
      assert.equal(old.state,input.operation==='recover'?'disabled':'ready');
      if(input.operation==='rebind')assert.notEqual(old.binding_hash,manager.binding.bindingHash,'REAL_RELEASE_REBIND_REQUIRED');
      const changed=await installer.install(manager.binding,bundle,{expectedRevision:revision});
      assert.equal(changed.revision,revision+1);console.log(JSON.stringify({operation:input.operation,at:Date.now(),beforeRevision:revision,
        afterRevision:changed.revision,sameUserNewSession:true,bindingHash:manager.binding.bindingHash}));return;
    }
    assert.equal(old.state,'ready');const armed=await gate('/arm',identity(await gate('/status')));
    held=armed;const deadline=Date.now()+76000;
    while(Date.now()<deadline){
      const value=await gate('/status');assert.equal(value.epoch,armed.epoch);assert.equal(value.generation,armed.generation);
      if(value.phase==='held'){held=value;break}assert.equal(value.phase,'armed','MANAGED_GATE_NOT_HELD');await delay(25);
    }
    assert.equal(held.phase,'held','MANAGED_METRICS_OVERLAP_NOT_OBSERVED');
    assert.equal(held.upstreamStatus,200);assert.ok(held.byteLength>0&&/^[a-f0-9]{64}$/.test(held.sha256));
    const before=await read();assert.equal(before.worker.active,true);assert.equal(before.guard.credentialRevision,revision);
    // A second connection can take the common transaction lock while remote
    // collection is held: the worker is not holding SQL locks across HTTP.
    assert.equal((await pool.query('SELECT pg_try_advisory_xact_lock(727001) AS unlocked')).rows[0].unlocked,true);
    assert.equal((await gate('/status')).phase,'held');
    const changed=input.operation==='disable'?await installer.disable(manager.binding,{expectedRevision:revision})
      :await installer.install(manager.binding,bundle,{expectedRevision:revision});
    const mutatedAt=Date.now();assert.equal(changed.revision,revision+1);
    const released=await gate('/release',identity(held));assert.equal(released.releaseReason,'operator');
    assert.ok(held.heldAt<=mutatedAt&&mutatedAt<=released.releasedAt);held=null;
    let after;const end=Date.now()+15000;
    while(Date.now()<end){after=await read();if(after.worker.lastFinishedAt>=released.releasedAt)break;await delay(25)}
    assert.equal(after.worker.lastErrorCode,'HEALTH_PROOF_CHANGED');assert.equal(after.worker.targetsSucceeded,0);
    assert.equal(after.worker.ready,false);assert.equal(after.admission.decision,'manual_closed');
    assert.ok(after.admission.reasonCodes.includes('HEALTH_PROOF_CHANGED'));
    for(const field of ['generation','observedAt','evaluatorHash','collectorEvents','policyVersion'])
      assert.deepEqual(after.guard[field],before.guard[field],'MANAGED_REJECTED_SAMPLE_CHANGED_'+field);
    assert.equal(after.guard.credentialRevision,revision+1);
    console.log(JSON.stringify({operation:input.operation,observedAt:held?.heldAt??released.heldAt,mutatedAt,releasedAt:released.releasedAt,
      rejectedAt:after.worker.lastFinishedAt,beforeRevision:revision,afterRevision:revision+1,generationUnchanged:true,
      collectorAuditUnchanged:true,errorCode:after.worker.lastErrorCode,admissionDecision:after.admission.decision,
      authenticResponseSha256:released.sha256,syntheticMetrics:false}));
  }finally{
    if(held)await gate('/release',identity(held)).catch(()=>{});
    await Promise.all([pool.end(),reader.end()]);
  }
}
async function configurationDrill(){
  // Canonical Auth/acceptance with exact-owned confirmed fixture accounts.
  // Operator tokens never enter the collector or its mounted configuration.
  const input=JSON.parse(process.env.ROOMQC_MANAGED_CONFIG_INPUT);
  assert.ok(['policy','target'].includes(input.operation));
  const options=connectionString=>({connectionString,max:1,connectionTimeoutMillis:2000,statement_timeout:3000,lock_timeout:2000});
  const pool=new pg.Pool(options(input.databaseUrl)),reader=new pg.Pool(options(input.readerDatabaseUrl));
  const {cluster,expected}=input.metadata.targets[0],approvedTarget=input.operation==='target'?input.approvedTarget:input.target;
  const config=signedObservationConfiguration(input.metadata,approvedTarget,input);
  const admin=new AdminDirectory({pool,config});
  const read=()=>snapshot(reader,input.metadata,input.target,input);
  const gate=async(path,body)=>{
    const response=await fetch('http://127.0.0.1:19091'+path,{method:body===undefined?'GET':'POST',
      headers:{authorization:'Bearer '+input.gateToken,'content-type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(1500)});
    assert.equal(response.status,200,'MANAGED_GATE_REQUEST_REJECTED');return response.json();
  };
  const identity=value=>({epoch:value.epoch,generation:value.generation});let held;
  try{
    const authority=(await pool.query("SELECT pg_has_role(current_user,'roomqc_control_api','USAGE') AS operator,rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert.deepEqual(authority,{operator:true,rolsuper:false,rolcreaterole:false,rolbypassrls:false});
    const support=await managedAuthority(config,input),{actor,authorize}=support;
    const armed=await gate('/arm',identity(await gate('/status')));held=armed;
    const deadline=Date.now()+76000;
    while(Date.now()<deadline){
      const value=await gate('/status');assert.equal(value.epoch,armed.epoch);assert.equal(value.generation,armed.generation);
      if(value.phase==='held'){held=value;break}assert.equal(value.phase,'armed','MANAGED_GATE_NOT_HELD');await delay(25);
    }
    assert.equal(held.phase,'held','MANAGED_METRICS_OVERLAP_NOT_OBSERVED');
    assert.equal(held.upstreamStatus,200);assert.ok(held.byteLength>0&&/^[a-f0-9]{64}$/.test(held.sha256));
    const before=await read();assert.equal(before.worker.active,true);assert.equal(before.guard.credentialState,'ready');
    assert.equal((await pool.query('SELECT pg_try_advisory_xact_lock(727001) AS unlocked')).rows[0].unlocked,true);
    const operation=input.operation==='policy'?'update_policy':'bind_telemetry_target';
    const payload=input.operation==='policy'?{tenantLimit:6,reopenMode:'manual'}:{targetFingerprint:telemetryTargetFingerprint(approvedTarget)};
    if(input.operation==='target')assert.notEqual(payload.targetFingerprint,before.guard.targetFingerprint,'REAL_TARGET_CHANGE_REQUIRED');
    const command=clusterCommand({operation,expectedVersion:before.guard.clusterVersion,
      reason:'Exact-owned managed configuration acceptance',payload},randomUUID(),cluster.id);
    assert.equal((await gate('/status')).phase,'held');
    await deniedAuthorityChecks(admin,command,support);
    assert.deepEqual((await read()).guard,before.guard,'DENIED_AUTHORITY_CHANGED_CONFIGURATION');
    const result=await admin.execute(actor,command,randomUUID(),undefined,authorize),mutatedAt=Date.now(),committed=await read();
    const accepted=await supportReceipt(pool,actor,command,input.operator.sessionId);
    assert.equal(accepted.control_command_id,result.commandId);
    assert.equal(committed.guard.clusterVersion,before.guard.clusterVersion+1);
    assert.equal(committed.guard.commandCount,before.guard.commandCount+1);
    assert.equal(committed.guard.adminEvents,before.guard.adminEvents+1);
    assert.equal(committed.guard.policyVersion,before.guard.policyVersion+(input.operation==='policy'?1:0));
    assert.equal(committed.guard.targetVersion,before.guard.targetVersion+(input.operation==='target'?1:0));
    assert.equal(committed.admission.decision,'manual_closed');
    const released=await gate('/release',identity(held));assert.equal(released.releaseReason,'operator');
    assert.ok(held.heldAt<=mutatedAt&&mutatedAt<=released.releasedAt);held=null;
    let after;const end=Date.now()+15000;
    while(Date.now()<end){after=await read();if(after.worker.lastFinishedAt>=released.releasedAt)break;await delay(25)}
    const code=input.operation==='policy'?'HEALTH_PROOF_CHANGED':'TELEMETRY_TARGET_MISMATCH';
    assert.equal(after.worker.lastErrorCode,code);assert.equal(after.worker.targetsSucceeded,0);assert.equal(after.worker.ready,false);
    assert.equal(after.admission.decision,'manual_closed');
    assert.ok(after.admission.reasonCodes.includes(input.operation==='policy'?'METRICS_POLICY_CHANGED':'METRICS_TARGET_CHANGED'));
    // A target bind intentionally invalidates health in its transaction. Compare
    // the late sample against THAT committed baseline, not the pre-command row.
    assert.deepEqual(after.guard,committed.guard,'REJECTED_SAMPLE_CHANGED_COMMITTED_CONFIGURATION');
    assert.deepEqual(JSON.parse(JSON.stringify(await admin.execute(actor,command,randomUUID(),undefined,authorize))),
      JSON.parse(JSON.stringify(result)),'COMMAND_REPLAY_CHANGED_RESULT');
    assert.deepEqual(await supportReceipt(pool,actor,command,input.operator.sessionId),accepted,'REPLAY_CHANGED_ACCEPTANCE');
    await authorize();
    const receipt=await admin.commandResult(actor,{targetId:cluster.id,operation,key:command.key});
    assert.equal(receipt.commandId,result.commandId);
    assert.deepEqual((await read()).guard,committed.guard,'COMMAND_REPLAY_CHANGED_DATABASE');
    console.log(JSON.stringify({operation:input.operation,observedAt:released.heldAt,mutatedAt,releasedAt:released.releasedAt,
      rejectedAt:after.worker.lastFinishedAt,beforePolicyVersion:before.guard.policyVersion,afterPolicyVersion:committed.guard.policyVersion,
      beforeTargetVersion:before.guard.targetVersion,afterTargetVersion:committed.guard.targetVersion,
      beforeTargetFingerprint:before.guard.targetFingerprint,afterTargetFingerprint:committed.guard.targetFingerprint,
      beforeGeneration:before.guard.generation,committedGeneration:committed.guard.generation,
      afterGeneration:after.guard.generation,lateSampleUnchanged:true,commandAuditDelta:1,commandReplayVerified:true,
      errorCode:code,authenticResponseSha256:released.sha256,syntheticMetrics:false,syntheticPlatformActor:false,
      actualCanonicalAuth:true,canonicalAcceptanceConsumed:true,missingAuthorityDenied:true,revokedSessionDenied:true,denialEffects:0}));
  }finally{
    if(held)await gate('/release',identity(held)).catch(()=>{});
    await Promise.all([pool.end(),reader.end()]);
  }
}
async function releaseDrill(){
  // This short-lived fixture process holds three bounded pools. Business
  // installer authority never enters the runtime container or directory API.
  const input=JSON.parse(process.env.ROOMQC_MANAGED_RELEASE_INPUT);
  const options=connectionString=>({connectionString,max:1,connectionTimeoutMillis:2000,statement_timeout:3000,lock_timeout:2000});
  const pool=new pg.Pool(options(input.databaseUrl)),reader=new pg.Pool(options(input.readerDatabaseUrl)),
    business=new pg.Pool(options(input.businessInstallerDatabaseUrl)),releasePool=new pg.Pool(options(input.releaseInstallerDatabaseUrl));
  const {cluster,expected}=input.metadata.targets[0],next=input.approvedExpected;
  const trust=new ReleaseApprovalTrust(input.publicTrust,{maximumValidityMs:input.maximumValidityMs});
  const configFor=(approved,envelope)=>{
    const entry={...cluster,environment:input.target.environment,releaseId:approved.releaseId,
      schemaManifestHash:approved.schemaManifestHash,frontendReady:true,telemetryTarget:input.target};
    return {allowLocal:true,databaseUrl:input.databaseUrl,poolMax:1,clusters:[cluster],supportClusterId:cluster.id,inventory:new Map([[cluster.inventoryRef,entry]]),
      credentials:new Map([[cluster.credentialRef,{publishableKey:cluster.publishableKey,vapidPublicKey:'fixture-vapid'}]]),
      releaseValidation:new ReleaseValidationCatalog({version:2,entries:[{inventoryRef:cluster.inventoryRef,
        approval:envelope,credential:input.credential}]},{trust})};
  };
  const oldConfig=configFor(expected,input.metadata.targets[0].approval),config=configFor(next,input.approvedMetadata.targets[0].approval),
    store=new ControlStore(config),oldStore=new ControlStore(oldConfig),admin=new AdminDirectory({pool,config}),
    gateway=new ClusterGateway(config,undefined,store),oldGateway=new ClusterGateway(oldConfig,undefined,oldStore),
    approvalInstaller=new ReleaseApprovalStore(releasePool,trust);
  let observationMetadata=input.metadata;
  const read=()=>snapshot(reader,observationMetadata,input.target,input);
  const gate=async(path,body)=>{
    const response=await fetch('http://127.0.0.1:19091'+path,{method:body===undefined?'GET':'POST',
      headers:{authorization:'Bearer '+input.gateToken,'content-type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(1500)});
    assert.equal(response.status,200,'MANAGED_GATE_REQUEST_REJECTED');return response.json();
  };
  const identity=value=>({epoch:value.epoch,generation:value.generation});let held;
  try{
    assert.notEqual(releaseExpectationFingerprint(next),releaseExpectationFingerprint(expected),'REAL_RELEASE_CHANGE_REQUIRED');
    assert.notEqual(next.releaseId,expected.releaseId);assert.equal(next.clusterId,expected.clusterId);
    assert.equal(next.migrationSetHash,expected.migrationSetHash);assert.equal(next.schemaManifestHash,expected.schemaManifestHash);
    const authority=(await pool.query("SELECT pg_has_role(current_user,'roomqc_control_api','USAGE') AS operator,rolsuper,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
    assert.deepEqual(authority,{operator:true,rolsuper:false,rolcreaterole:false,rolbypassrls:false});
    const support=await managedAuthority(config,input),{actor,authorize}=support;
    const businessAuthority=(await business.query('SELECT current_user AS role,current_database() AS database')).rows[0];
    assert.deepEqual(businessAuthority,{role:'postgres',database:'postgres'});
    // Positive transport on the original approved release, before the gate.
    const positive=await oldGateway.validateCluster(await admin.cluster(cluster.id));
    assert.equal(positive.releaseId,expected.releaseId);
    const armed=await gate('/arm',identity(await gate('/status')));held=armed;
    const deadline=Date.now()+76000;
    while(Date.now()<deadline){
      const value=await gate('/status');assert.equal(value.epoch,armed.epoch);assert.equal(value.generation,armed.generation);
      if(value.phase==='held'){held=value;break}assert.equal(value.phase,'armed','MANAGED_GATE_NOT_HELD');await delay(25);
    }
    assert.equal(held.phase,'held','MANAGED_METRICS_OVERLAP_NOT_OBSERVED');
    assert.equal(held.upstreamStatus,200);assert.ok(held.byteLength>0&&/^[a-f0-9]{64}$/.test(held.sha256));
    const before=await read();assert.equal(before.worker.active,true);assert.equal(before.guard.releaseId,expected.releaseId);
    assert.equal((await pool.query('SELECT pg_try_advisory_xact_lock(727001) AS unlocked')).rows[0].unlocked,true);
    // Data-only deployment identity replacement on the exact-owned business DB.
    // No schema/role/grant changes and no direct directory revision bump.
    const changed=await business.query(`UPDATE private.roomqc_release_manifest SET release_id=$1,artifact_digest=$2,
      frontend_artifact_digest=$3,installed_at=clock_timestamp() WHERE singleton AND cluster_id=$4
      AND release_id=$5 AND artifact_digest=$6 AND frontend_artifact_digest=$7
      AND migration_set_hash=$8 AND expected_schema_hash=$9 RETURNING release_id`,
    [next.releaseId,next.artifactDigest,next.frontendArtifactDigest,cluster.id,expected.releaseId,
      expected.artifactDigest,expected.frontendArtifactDigest,expected.migrationSetHash,expected.schemaManifestHash]);
    assert.equal(changed.rowCount,1,'MANAGED_MANIFEST_INSTALL_CONFLICT');
    await assert.rejects(oldGateway.validateCluster(await admin.cluster(cluster.id)),{code:'RELEASE_MANIFEST_MISMATCH'});
    await approvalInstaller.install(input.approvedMetadata.targets[0].approval,approvalContext(cluster,next,input.target),approvalCommand(1));
    await assert.rejects(oldGateway.validateCluster(await admin.cluster(cluster.id)),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
    const validation=await gateway.validateCluster(await admin.cluster(cluster.id));
    assert.equal(validation.manifest.expectationFingerprint,releaseExpectationFingerprint(next));
    const command=clusterCommand({operation:'validate',expectedVersion:before.guard.clusterVersion,
      reason:'Exact-owned managed release/catalog acceptance',payload:{}},randomUUID(),cluster.id);
    assert.equal((await gate('/status')).phase,'held');
    await deniedAuthorityChecks(admin,command,support,validation);
    assert.deepEqual((await read()).guard,before.guard,'DENIED_AUTHORITY_CHANGED_RELEASE');
    const result=await admin.execute(actor,command,randomUUID(),validation,authorize),mutatedAt=Date.now();
    const accepted=await supportReceipt(pool,actor,command,input.operator.sessionId);
    assert.equal(accepted.control_command_id,result.commandId);
    observationMetadata=input.approvedMetadata;
    const committed=await read();
    assert.equal(committed.guard.clusterVersion,before.guard.clusterVersion+1);
    assert.equal(committed.guard.releaseId,next.releaseId);assert.equal(committed.guard.schemaManifestHash,expected.schemaManifestHash);
    assert.equal(committed.guard.commandCount,before.guard.commandCount+1);assert.equal(committed.guard.adminEvents,before.guard.adminEvents+1);
    assert.equal(committed.admission.decision,'manual_closed');
    assert.ok(committed.admission.reasonCodes.includes('HEALTH_PROOF_CHANGED'));
    const released=await gate('/release',identity(held));assert.equal(released.releaseReason,'operator');
    assert.ok(held.heldAt<=mutatedAt&&mutatedAt<=released.releasedAt);held=null;
    let after;const end=Date.now()+15000;
    while(Date.now()<end){after=await read();if(after.worker.lastFinishedAt>=released.releasedAt)break;await delay(25)}
    assert.equal(after.worker.lastErrorCode,'HEALTH_PROOF_CHANGED');assert.equal(after.worker.targetsSucceeded,0);
    assert.equal(after.worker.ready,false);assert.equal(after.admission.decision,'manual_closed');
    assert.deepEqual(after.guard,committed.guard,'REJECTED_SAMPLE_CHANGED_COMMITTED_RELEASE');
    assert.deepEqual(JSON.parse(JSON.stringify(await admin.execute(actor,command,randomUUID(),validation,authorize))),
      JSON.parse(JSON.stringify(result)),'RELEASE_COMMAND_REPLAY_CHANGED_RESULT');
    assert.deepEqual(await supportReceipt(pool,actor,command,input.operator.sessionId),accepted,'REPLAY_CHANGED_ACCEPTANCE');
    await authorize();
    const receipt=await admin.commandResult(actor,{targetId:cluster.id,operation:'validate',key:command.key});
    assert.equal(receipt.commandId,result.commandId);assert.deepEqual((await read()).guard,committed.guard,'RELEASE_REPLAY_ADDED_EFFECTS');
    console.log(JSON.stringify({operation:'release',observedAt:released.heldAt,mutatedAt,releasedAt:released.releasedAt,
      rejectedAt:after.worker.lastFinishedAt,beforeReleaseId:expected.releaseId,afterReleaseId:next.releaseId,
      beforeReleaseFingerprint:releaseExpectationFingerprint(expected),afterReleaseFingerprint:releaseExpectationFingerprint(next),
      beforeGeneration:before.guard.generation,committedGeneration:committed.guard.generation,afterGeneration:after.guard.generation,
      beforeCredentialRevision:before.guard.credentialRevision,lateSampleUnchanged:true,commandAuditDelta:1,
      commandReplayVerified:true,errorCode:after.worker.lastErrorCode,authenticResponseSha256:released.sha256,
      actualManifestTransport:true,oldApprovalManifestRejected:true,actualAdminCommand:true,schemaUnchanged:true,
      syntheticMetrics:false,syntheticApproval:true,syntheticPlatformActor:false,
      actualCanonicalAuth:true,canonicalAcceptanceConsumed:true,missingAuthorityDenied:true,revokedSessionDenied:true,denialEffects:0}));
  }finally{
    if(held)await gate('/release',identity(held)).catch(()=>{});
    await Promise.all([pool.end(),reader.end(),business.end(),releasePool.end(),store.close(),oldStore.close()]);
  }
}
async function worker(){
  assert.equal(process.getuid(),1000);assert.equal(process.env.ROOMQC_MANAGED_INSTALL_INPUT,undefined);
  assert.equal(process.env.ROOMQC_MANAGED_DRILL_INPUT,undefined);
  assert.equal(process.env.ROOMQC_MANAGED_CONFIG_INPUT,undefined);
  assert.equal(process.env.ROOMQC_MANAGED_RELEASE_INPUT,undefined);
  assert.equal(process.env.ROOMQC_MANAGED_AUTHORITY_INPUT,undefined);
  const relay=await directoryRelay();let prometheus,runtime;
  try{
    prometheus=await createMetricsResponseRelay({token:process.env.ROOMQC_MANAGED_GATE_TOKEN});
    const health=await loadHealthConfiguration(process.env),managed=await loadManagedHealthConfiguration(process.env,health);
    runtime=await startHealthRuntime(health,{managed,onEvent:event=>{
      // Explicit allowlist: lifecycle counters only, never target/config/input.
      console.log(JSON.stringify({event:'managed_health_cycle',lastStartedAt:event.lastStartedAt,
        lastFinishedAt:event.lastFinishedAt,lastErrorCode:event.lastErrorCode,consecutiveFailures:event.consecutiveFailures,
        targetsSucceeded:event.targetsSucceeded,targetsFailed:event.targetsFailed,ready:event.ready}));
    }});
    console.log(JSON.stringify({event:'managed_worker_started',twoPools:runtime.pool!==runtime.probePool,
      healthConfigSha256:createHash('sha256').update(await readFile(process.env.ROOMQC_HEALTH_CONFIG_FILE)).digest('hex'),
      probeConfigSha256:createHash('sha256').update(await readFile(process.env.ROOMQC_HEALTH_PROBE_CONFIG_FILE)).digest('hex'),
      releaseFingerprint:releaseExpectationFingerprint(managed.catalog.get(health.targets[0].target).expected),
      targetFingerprint:telemetryTargetFingerprint(health.targets[0].target)}));
    await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve)});
    assert.equal((await runtime.shutdown()).timedOut,false);
    assert.equal(runtime.pool.ended,true);assert.equal(runtime.probePool.ended,true);
    console.log(JSON.stringify({event:'managed_worker_closed',poolsClosed:2}));
  }finally{await runtime?.shutdown();await prometheus?.close();await relay.close()}
}
const mode=process.env.ROOMQC_MANAGED_MODE;
if(mode==='link')console.log(JSON.stringify({linked:true}));
else if(mode==='install')await install();else if(mode==='observe')await observe();else if(mode==='worker')await worker();
else if(mode==='credential-drill')await credentialDrill();
else if(mode==='configuration-drill')await configurationDrill();
else if(mode==='release-drill')await releaseDrill();
else if(mode==='support-install')await installSupportAuthority();
else throw new Error('MANAGED_FIXTURE_MODE_REQUIRED');
