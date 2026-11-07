import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {checkManagedClientLinkage,discoverManagedMount,managedHealthFixture,managedAlternateTarget,managedAlternateRelease,
  managedFiveServicesReady,deployManagedFunctionsRelease,managedReleaseApprovals} from '../../scripts/control-backend-managed-health.mjs';
import {releaseExpectationFingerprint} from './release-manifest.mjs';
import {ReleaseApprovalTrust,releaseApprovalEndpointFingerprint} from './release-approval.mjs';
import {syntheticRelease} from './probe-test-fixtures.mjs';
import {healthConfiguration} from './workers/health-config.mjs';
import {telemetryTargetFingerprint,queryTemplates} from './telemetry-source.mjs';

test('managed vendor fixture discovers the longest actual data mount, not a same-prefix or unrelated filesystem',()=>{
  const source='1 0 8:1 / / rw - ext4 /dev/root rw\n'
    +'2 1 8:2 / /var/lib/docker rw - xfs /dev/sdb rw\n'
    +'3 1 8:3 / /var/lib/docker-other rw - ext4 /dev/sdc rw\n'
    +'4 1 0:1 / /var/lib/docker/volumes rw - overlay overlay rw\n';
  assert.deepEqual(discoverManagedMount(source,'/var/lib/docker/volumes/owned/_data'),
    {id:'database',mountpoint:'/var/lib/docker',fstype:'xfs',device:'/dev/sdb'});
  assert.equal(discoverManagedMount(source,'/var/lib/dockerish/owned').device,'/dev/root');
  assert.throws(()=>discoverManagedMount('1 0 0:1 / / rw - overlay overlay rw','/owned'));
  assert.throws(()=>discoverManagedMount(source,'relative'));
});

test('managed orchestrator returns public trust and two separately signed fixture releases, with no reusable signing key',()=>{
  const cluster={id:'cluster-a',hostId:'fixture-host',inventoryRef:'inventory-a',credentialRef:'credential-a',
    url:'http://127.0.0.1:8000',internalUrl:null,approvedAddresses:['127.0.0.1']};
  const target={hostId:'fixture-host',environment:'local'},expected={...syntheticRelease},next=managedAlternateRelease(expected),now=Date.now();
  const approval=managedReleaseApprovals(cluster,target,expected,next,{now});
  assert.deepEqual(Object.keys(approval).sort(),['current','maximumValidityMs','next','publicTrust']);
  assert.equal(approval.publicTrust.keys[0].publicKey.d,undefined);
  const trust=new ReleaseApprovalTrust(approval.publicTrust,{maximumValidityMs:approval.maximumValidityMs});
  const context={inventoryRef:cluster.inventoryRef,clusterId:cluster.id,hostId:target.hostId,environment:target.environment,expected,
    endpointFingerprint:releaseApprovalEndpointFingerprint({url:cluster.url,internalUrl:cluster.internalUrl,
      approvedAddresses:cluster.approvedAddresses,credentialRef:cluster.credentialRef})};
  assert.equal(trust.verify(approval.current,context,{now}).epoch,1);
  assert.equal(trust.verify(approval.next,{...context,expected:next},{now}).epoch,2);
  assert.notEqual(approval.current.payload.approvalId,approval.next.payload.approvalId);
  for(const change of [{expected:next},{environment:'production'},{hostId:'other-host'},
    {endpointFingerprint:'0'.repeat(64)}])assert.throws(()=>trust.verify(approval.current,{...context,...change},{now}),{code:'RELEASE_APPROVAL_INVALID'});
  assert.throws(()=>trust.verify(approval.current,context,{now:approval.current.payload.expiresAt}),{code:'RELEASE_APPROVAL_INVALID'});
});

test('managed vendor fixture uses production v2 budget and cadence without replacing policy timing',()=>{
  const target={clusterId:'fixture-a',hostId:'fixture-host',environment:'local',measurementScope:'docker-desktop-vm',
    dbConnectionBudget:100,dataMounts:[{id:'database',mountpoint:'/',fstype:'ext4',device:'/dev/root'}]};
  const config=healthConfiguration(managedHealthFixture(target),
    {databaseUrl:'postgresql://metrics:fixture@127.0.0.1:15432/fixture',production:false,allowLocal:true});
  assert.equal(config.schemaVersion,2);assert.equal(config.intervalMs,30000);assert.equal(config.targetTimeoutMs,25000);
  assert.equal(config.connectionBudget.allocatedConnections,21);assert.equal(config.connectionBudget.probeInstances,1);
  assert.equal(managedHealthFixture({...target,dbConnectionBudget:300},80).connectionBudget.maxConnections,80,
    'Business connection budget must not substitute for the separate directory limit');
});

test('managed fixture installs exporter grants before attestation and keeps directory roles on a separate PostgreSQL instance',async()=>{
  const parent=await readFile(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url),'utf8');
  const installer=parent.indexOf('?await prepareManagedExporterRole('),freeze=parent.indexOf('state.preInitializationSchemaHash=await sql(');
  assert.ok(installer>=0&&freeze>installer);
  const source=await readFile(new URL('../../scripts/control-backend-managed-health.mjs',import.meta.url),'utf8');
  const client=await readFile(new URL('../../scripts/control-backend-managed-client.mjs',import.meta.url),'utf8');
  assert.match(source,/'-U','supabase_admin'/);assert.match(source,/superuser:true/);
  assert.match(source,/network-alias','managed-directory'/);
  assert.match(client,/host:'managed-directory'/);
  assert.doesNotMatch(source,/sql\(state,'CREATE DATABASE/);
});

test('alternate managed target changes the real approved operating budget without fabricating or redirecting metrics',()=>{
  const target={clusterId:'fixture-a',hostId:'fixture-host',environment:'local',measurementScope:'docker-desktop-vm',
    dbConnectionBudget:100,dataMounts:[{id:'database',mountpoint:'/',fstype:'ext4',device:'/dev/root'}]};
  const next=managedAlternateTarget(target);
  assert.equal(target.dbConnectionBudget,100);assert.equal(next.dbConnectionBudget,99);
  assert.notEqual(telemetryTargetFingerprint(next),telemetryTargetFingerprint(target));
  assert.deepEqual(next.dataMounts,target.dataMounts);assert.deepEqual(queryTemplates(next),queryTemplates(target));
  assert.ok(Object.isFrozen(next));assert.throws(()=>managedAlternateTarget({...target,dbConnectionBudget:1}));
});

test('managed client linkage preflight uses only readonly package mounts, no network or installer credentials',async()=>{
  const source=await readFile(new URL('../../scripts/control-backend-managed-client.mjs',import.meta.url),'utf8');
  assert.match(source,/import pg from '\/control\/node_modules\/pg\/lib\/index\.js'/);
  let calls=0;
  const result=await checkManagedClientLinkage({state:{run:'123456789abc',projectId:'roomqc-probe-123456789abc'},
    repository:fileURLToPath(new URL('../../',import.meta.url)),privateRun:async(command,args,options)=>{
      calls++;assert.equal(command,'docker');assert.ok(args.includes('--read-only'));assert.ok(args.includes('none'));
      assert.ok(args.includes('1000:1000'));assert.ok(args.includes('ROOMQC_MANAGED_MODE=link'));
      assert.equal(args.filter(v=>v==='--mount').length,2);assert.ok(!args.includes('/managed'));
      assert.equal(options.input,source);return {stdout:'{"linked":true}'};
    }});
  assert.equal(calls,1);assert.equal(result.linked,true);assert.match(result.sourceHash,/^[a-f0-9]{64}$/);
});

test('managed container entry keeps coordinator secrets installer-only and does not override collectors, clocks or persisted windows',async()=>{
  const source=await readFile(new URL('../../scripts/control-backend-managed-client.mjs',import.meta.url),'utf8');
  const worker=source.slice(source.indexOf('async function worker()'),source.indexOf('const mode='));
  assert.match(worker,/assert\.equal\(process\.getuid\(\),1000\)/);
  assert.match(worker,/ROOMQC_MANAGED_INSTALL_INPUT,undefined/);
  assert.match(worker,/ROOMQC_MANAGED_DRILL_INPUT,undefined/);
  assert.match(worker,/ROOMQC_MANAGED_CONFIG_INPUT,undefined/);
  assert.match(worker,/ROOMQC_MANAGED_RELEASE_INPUT,undefined/);
  assert.match(worker,/ROOMQC_MANAGED_AUTHORITY_INPUT,undefined/);
  assert.doesNotMatch(worker,/businessInstallerDatabaseUrl/);
  assert.match(worker,/startHealthRuntime\(health,\{managed,onEvent:/);
  assert.match(worker,/event:'managed_health_cycle'/);
  assert.doesNotMatch(worker,/JSON\.stringify\(event\)/,'Fixture logs must allowlist lifecycle fields, never dump callback input');
  assert.doesNotMatch(worker,/collect:|sourceFor:|clock:|Date\.now\s*=/);
  assert.doesNotMatch(source,/DISABLE TRIGGER|firstValidAt\s*=|valid_until\s*=/);
  const parent=await readFile(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url),'utf8');
  assert.match(parent,/if\(writable\)assert\.equal\(values\.ROOMQC_MANAGED_MODE,'install'/);
  assert.match(parent,/writable\?\['--cap-add','CHOWN'\]:\[\]/);
  const orchestrator=await readFile(new URL('../../scripts/control-backend-managed-health.mjs',import.meta.url),'utf8');
  const launch=orchestrator.slice(orchestrator.indexOf('const worker=async()=>'),orchestrator.indexOf('const observer='));
  assert.match(launch,/--user','1000:1000'.*--cap-drop','ALL'/s);
  assert.doesNotMatch(launch,/--cap-add|ROOMQC_MANAGED_INSTALL_INPUT/);
});

test('credential drill is installer-restricted, observes authentic metrics before mutation, and checks the actual commit result',async()=>{
  const source=await readFile(new URL('../../scripts/control-backend-managed-client.mjs',import.meta.url),'utf8');
  const drill=source.slice(source.indexOf('async function credentialDrill()'),source.indexOf('async function worker()'));
  assert.match(drill,/roomqc_control_probe_installer/);assert.match(drill,/rolsuper:false,rolcreaterole:false,rolbypassrls:false/);
  assert.match(drill,/pg_try_advisory_xact_lock\(727001\)/);
  assert.match(drill,/held\.phase,'held'/);assert.match(drill,/installer\.disable/);assert.match(drill,/installer\.install/);
  assert.match(drill,/after\.worker\.lastErrorCode,'HEALTH_PROOF_CHANGED'/);
  assert.match(drill,/generation','observedAt','evaluatorHash','collectorEvents','policyVersion'/);
  assert.match(drill,/finally\{\s+if\(held\)await gate\('\/release'/);
  assert.doesNotMatch(drill,/UPDATE roomqc_control|DELETE FROM|service_role|collect:|sourceFor:|Date\.now\s*=/);
});

test('credential-only diagnostic cannot masquerade as a full timed backend or independent build reference',async()=>{
  const source=await readFile(new URL('../../scripts/control-backend-managed-health.mjs',import.meta.url),'utf8');
  const diagnostic=source.slice(source.indexOf('if(credentialOnly){'),source.indexOf('let restarted=false;'));
  assert.match(diagnostic,/credentialCheckpointVerified:true/);assert.match(diagnostic,/fullTimedDrillExecuted:false/);
  assert.doesNotMatch(diagnostic,/managedHealth\.verified=true/);
  const parent=await readFile(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url),'utf8');
  assert.match(parent,/credentialOnly:diagnostic==='managed-credential'/);
  assert.match(parent,/if\(!diagnostic\|\|managedDiagnostic\|\|\['staff-invitation','parent-boundary'\]\.includes\(diagnostic\)\)state\.staffInvitationCallerBuild=/,
    'Full, managed, invitation and parent-boundary diagnostics must freeze the mandatory compiled invitation caller');
  assert.match(parent,/if\(!diagnostic\|\|managedDiagnostic\|\|\['room-source','parent-boundary'\]\.includes\(diagnostic\)\)state\.roomCallerBuild=/);
  assert.match(parent,/if\(!diagnostic\|\|managedDiagnostic\|\|\['room-writers','parent-boundary'\]\.includes\(diagnostic\)\)state\.roomOperationCallerBuild=/);
  assert.match(parent,/if\(!diagnostic\|\|managedDiagnostic\|\|\['parent-boundary','revenue-report','report-upgrade','operations-advice-upgrade'\]\.includes\(diagnostic\)\)state\.reportTargetCallerBuild=/);
  assert.match(parent,/diagnosticOnly:Boolean\(diagnostic\),fullIntegratedRun:!diagnostic/);
});

test('configuration drill uses actual versioned admin commands, atomic receipts and post-command health baseline',async()=>{
  const source=await readFile(new URL('../../scripts/control-backend-managed-client.mjs',import.meta.url),'utf8');
  const drill=source.slice(source.indexOf('async function configurationDrill()'),source.indexOf('async function worker()'));
  assert.match(drill,/roomqc_control_api/);assert.match(drill,/rolsuper:false,rolcreaterole:false,rolbypassrls:false/);
  assert.match(drill,/pg_try_advisory_xact_lock\(727001\)/);
  assert.match(drill,/held\.phase,'held'/);assert.match(drill,/new AdminDirectory/);assert.match(drill,/clusterCommand\(/);
  assert.match(drill,/update_policy/);assert.match(drill,/bind_telemetry_target/);assert.match(drill,/expectedVersion:before\.guard\.clusterVersion/);
  assert.match(drill,/admin\.execute\(actor,command/);assert.match(drill,/admin\.commandResult/);
  assert.match(drill,/deepEqual\(after\.guard,committed\.guard/);
  assert.match(drill,/commandReplayVerified:true/);assert.match(drill,/syntheticPlatformActor:false/);
  assert.match(drill,/managedAuthority\(config,input\)/);assert.match(drill,/deniedAuthorityChecks\(admin,command,support\)/);
  assert.match(drill,/admin\.execute\(actor,command,randomUUID\(\),undefined,authorize\)/);
  assert.match(drill,/supportReceipt\(pool,actor,command,input\.operator\.sessionId\)/);
  assert.match(drill,/DENIED_AUTHORITY_CHANGED_CONFIGURATION/);
  assert.match(drill,/canonicalAcceptanceConsumed:true/);
  assert.match(drill,/finally\{\s+if\(held\)await gate\('\/release'/);
  assert.doesNotMatch(drill,/UPDATE roomqc_control|DELETE FROM|service_role|collect:|sourceFor:|Date\.now\s*=/);
});

test('configuration-only diagnostic and readonly restart cannot masquerade as release/issuer/full-backend acceptance',async()=>{
  const source=await readFile(new URL('../../scripts/control-backend-managed-health.mjs',import.meta.url),'utf8');
  const diagnostic=source.slice(source.indexOf('if(configurationOnly){'),source.indexOf('let restarted=false;'));
  assert.match(diagnostic,/policyTargetCheckpointVerified:true/);assert.match(diagnostic,/fullTimedDrillExecuted:false/);
  assert.doesNotMatch(diagnostic,/managedHealth\.verified=true/);
  assert.match(source,/old_target_next_cycle/);assert.match(source,/old\.Config\.Labels\[ownerLabel\],state\.run/);
  assert.match(source,/health-alternate\.json/);assert.match(source,/healthConfigSha256,healthDigests\.alternate/);
  assert.match(source,/approvalCatalogChanged:false,releaseChangeProved:false/);assert.match(source,/physicalExporterChanged:false/);
  const parent=await readFile(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url),'utf8');
  assert.match(parent,/configurationOnly:diagnostic==='managed-configuration'/);
  assert.match(parent,/managed-health','managed-credential','managed-configuration','managed-release'\]\.includes\(diagnostic\)/);
});

test('alternate release is a predetermined identity change, not a fabricated schema migration or issuer approval',()=>{
  const expected={clusterId:'fixture-a',releaseId:'sandbox-v1',artifactDigest:'1'.repeat(64),
    frontendArtifactDigest:'2'.repeat(64),migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};
  const next=managedAlternateRelease(expected);
  assert.equal(expected.releaseId,'sandbox-v1');assert.equal(next.releaseId,'sandbox-v1-managed-v2');
  assert.equal(next.clusterId,expected.clusterId);assert.equal(next.schemaManifestHash,expected.schemaManifestHash);
  assert.equal(next.migrationSetHash,expected.migrationSetHash);assert.ok(Object.isFrozen(next));
  assert.notEqual(next.artifactDigest,expected.artifactDigest);assert.notEqual(next.frontendArtifactDigest,expected.frontendArtifactDigest);
  assert.notEqual(releaseExpectationFingerprint(next),releaseExpectationFingerprint(expected));
  assert.deepEqual(managedAlternateRelease(expected),next);assert.throws(()=>managedAlternateRelease({...expected,releaseId:''}));
});

test('release recovery requires exactly five successful services, not just a completed worker collection',()=>{
  const s={worker:{ready:true},state:{probes:{auth:true,rest:true,storage:true,realtime:true,functions:true}}};
  assert.equal(managedFiveServicesReady(s),true);
  for(const name of Object.keys(s.state.probes)){
    const invalid=structuredClone(s);invalid.state.probes[name]=false;
    assert.equal(managedFiveServicesReady(invalid),false);
    delete invalid.state.probes[name];assert.equal(managedFiveServicesReady(invalid),false);
  }
  for(const invalid of [null,{}, {worker:{ready:true},state:{probes:{}}},
    {...s,worker:{ready:false}},{...s,state:{probes:{...s.state.probes,extra:true}}}])
    assert.equal(managedFiveServicesReady(invalid),false);
});

async function deploymentFixture(t,{configDrift=false,runtimeDrift=false}={}){
  const root=await mkdtemp(join(tmpdir(),'roomqc-release-config-'));
  assert.equal(dirname(root),tmpdir());t.after(()=>rm(root,{recursive:true,force:true}));
  const run='123456789abc',projectId='roomqc-probe-'+run,directory=join(root,'managed-health');await mkdir(directory);
  const beforeExpected={clusterId:'fixture-a',releaseId:'sandbox-v1',artifactDigest:'1'.repeat(64),
    frontendArtifactDigest:'2'.repeat(64),migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)},
    expected=managedAlternateRelease(beforeExpected),original=join(root,'runtime.compose.json');
  const config={name:projectId,services:{functions:{image:'pinned@sha256:'+'a'.repeat(64),
    environment:{ROOMQC_CONTROL_CLUSTER_ID:'fixture-a',ROOMQC_CONTROL_RELEASE_ID:beforeExpected.releaseId,KEEP:'unchanged'}},
    auth:{image:'auth@sha256:'+'b'.repeat(64)}},networks:{default:{internal:true}}};
  const originalText=JSON.stringify(config);await writeFile(original,originalText);
  const state={run,root,projectId,bundleHash:createHash('sha256').update(originalText).digest('hex'),managedHealth:{}},
    compose=['compose','--project-name',projectId,'--file',original],calls=[];let deployed=false,saves=0;
  const privateRun=async(command,args)=>{
    assert.equal(command,'docker');calls.push([...args]);
    if(args.includes('config')){
      const value=structuredClone(config);
      if(args.filter(v=>v==='--file').length===2){
        const override=JSON.parse(await readFile(args.at(-4),'utf8'));
        value.services.functions.environment.ROOMQC_CONTROL_RELEASE_ID=override.services.functions.environment.ROOMQC_CONTROL_RELEASE_ID;
        if(configDrift)value.services.auth.image='foreign';
      }
      return {stdout:JSON.stringify(value)};
    }
    if(args[0]==='container')return {stdout:JSON.stringify([{Image:'sha256:'+'a'.repeat(64),State:{Running:true},
      Config:{Image:config.services.functions.image,Env:Object.entries({...config.services.functions.environment,
        ...(deployed?{ROOMQC_CONTROL_RELEASE_ID:expected.releaseId}:{}),...(deployed&&runtimeDrift?{KEEP:'changed'}:{})}).map(([k,v])=>k+'='+v),
        Labels:{'roomqc.control-backend-test':run,'com.docker.compose.project':projectId}},
      NetworkSettings:{Ports:{},Networks:{[projectId+'-internal']:{}}}}])};
    assert.ok(args.includes('up'));assert.ok(args.includes('--no-deps'));assert.ok(args.includes('--force-recreate'));
    assert.equal(args.at(-1),'functions');deployed=true;return {stdout:''};
  };
  return {state,compose,directory,beforeExpected,expected,privateRun,save:async()=>{saves++},calls,get saves(){return saves}};
}

test('actual release deployment keeps an explicit Compose delta for every later restart and preserves the original bundle',async t=>{
  const f=await deploymentFixture(t),originalArgs=[...f.compose],proof=await deployManagedFunctionsRelease(f);
  assert.deepEqual(f.compose.slice(0,originalArgs.length),originalArgs);
  assert.equal(f.compose.at(-2),'--file');assert.equal(f.compose.at(-1),join(f.directory,'release-functions.compose.json'));
  assert.equal(proof.verified,true);assert.equal(proof.onlyReleaseEnvironmentChanged,true);
  assert.equal(proof.imageUnchanged,true);assert.equal(proof.effectiveComposeRetained,true);assert.equal(proof.publishedPorts,0);
  assert.equal(f.saves,2);assert.notEqual(proof.beforeResolvedSha256,proof.afterResolvedSha256);
  assert.equal(proof.originalBundleSha256,f.state.bundleHash);
  assert.equal(f.calls.filter(args=>args.includes('up')).length,1);
});

test('release deployment refuses unrelated rendered or actual environment drift and never publishes a verified receipt',async t=>{
  for(const options of [{configDrift:true},{runtimeDrift:true}]){
    const f=await deploymentFixture(t,options),original=[...f.compose];
    await assert.rejects(deployManagedFunctionsRelease(f));
    assert.deepEqual(f.compose,original);assert.notEqual(f.state.managedHealth.functionsDeployment?.verified,true);
    if(options.configDrift)assert.equal(f.calls.some(args=>args.includes('up')),false);
  }
});

test('release drill replaces only owned manifest data, uses actual gateway validation and fences the post-command sample',async()=>{
  const source=await readFile(new URL('../../scripts/control-backend-managed-client.mjs',import.meta.url),'utf8');
  const drill=source.slice(source.indexOf('async function releaseDrill()'),source.indexOf('async function worker()'));
  assert.match(drill,/new ReleaseValidationCatalog\(\{version:2/);assert.match(drill,/new ClusterGateway\(config,undefined,store\)/);
  assert.match(drill,/new ControlStore\(config\)/);assert.match(drill,/new ReleaseApprovalStore\(releasePool,trust\)/);
  assert.match(drill,/approvalInstaller\.install/);assert.match(drill,/RELEASE_APPROVAL_NOT_CURRENT/);
  assert.match(drill,/oldGateway\.validateCluster/);assert.match(drill,/RELEASE_MANIFEST_MISMATCH/);
  assert.match(drill,/UPDATE private\.roomqc_release_manifest/);assert.match(drill,/MANAGED_MANIFEST_INSTALL_CONFLICT/);
  assert.match(drill,/operation:'validate',expectedVersion:before\.guard\.clusterVersion/);
  assert.match(drill,/admin\.execute\(actor,command,randomUUID\(\),validation,authorize\)/);
  assert.match(drill,/deniedAuthorityChecks\(admin,command,support,validation\)/);
  assert.match(drill,/supportReceipt\(pool,actor,command,input\.operator\.sessionId\)/);
  assert.match(drill,/DENIED_AUTHORITY_CHANGED_RELEASE/);
  assert.match(drill,/after\.worker\.lastErrorCode,'HEALTH_PROOF_CHANGED'/);
  assert.match(drill,/deepEqual\(after\.guard,committed\.guard/);assert.match(drill,/admin\.commandResult/);
  assert.match(drill,/pg_try_advisory_xact_lock\(727001\)/);assert.match(drill,/pool\.end\(\),reader\.end\(\),business\.end\(\),releasePool\.end\(\),store\.close\(\),oldStore\.close\(\)/);
  assert.match(drill,/syntheticApproval:true,syntheticPlatformActor:false/);
  assert.doesNotMatch(drill,/UPDATE roomqc_control|ALTER TABLE|CREATE ROLE|GRANT |service_role|Date\.now\s*=/);
});

test('release diagnostic observes an old next cycle, installer rebind and a new readonly catalog without becoming full acceptance',async()=>{
  const source=await readFile(new URL('../../scripts/control-backend-managed-health.mjs',import.meta.url),'utf8');
  assert.match(source,/old_release_next_cycle/);assert.match(source,/lastStartedAt>releaseChanged\.rejectedAt/);
  assert.match(source,/operation:'rebind'/);assert.match(source,/metadata-release\.json/);
  assert.match(source,/probeConfigSha256,metadataDigests\.alternate/);assert.match(source,/installerRebindVerified:true/);
  assert.match(source,/issuerApprovalProved:false,crossReplicaWithdrawalProved:false/);
  const diagnostic=source.slice(source.indexOf('if(releaseOnly){'),source.indexOf('let restarted=false;'));
  assert.match(diagnostic,/releaseCatalogCheckpointVerified:true/);assert.match(diagnostic,/fullTimedDrillExecuted:false/);
  assert.doesNotMatch(diagnostic,/managedHealth\.verified=true/);
  const parent=await readFile(new URL('../../scripts/test-control-backend-sandbox.mjs',import.meta.url),'utf8');
  assert.match(parent,/releaseOnly:diagnostic==='managed-release'/);
  assert.match(parent,/probeInput\.expected=state\.managedHealth\.effectiveExpectation/);
  assert.match(parent,/await checkServices\(\);await assertSchemaFrozen\('managed-health-recovery'\)/);
});
