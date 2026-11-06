import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,realpath,lstat,writeFile} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';

// Read-only planning audit. It never connects to an application or database.
const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const protectedFiles=[
  {path:'artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json',sha256:'612a518c9cf533beb0a39e7fcf47465644b2224dfb7ddb2bcb29f82005164c63'},
  {path:'docs/architecture/08-ops/roomqc-vps-signup-acceptance-worksheet-2026-10-22.md',sha256:'e5df481be5264aa445165ea0ffb5541ceb7764d24193913654e2730699bd03a7'}
];
const planPath='artifacts/roomqc-vps-signup-acceptance-execution-plan-2026-10-28.json';
const documents=[
  'docs/architecture/08-ops/roomqc-vps-signup-master-plan-2026-10-28.md',
  'docs/architecture/08-ops/roomqc-vps-signup-master-acceptance-2026-10-28.md',
  'docs/architecture/08-ops/roomqc-workspace-recheck-local-2026-10-28.md',
  'docs/architecture/08-ops/roomqc-setup-api-native-local-2026-10-28.md',
  'docs/architecture/08-ops/roomqc-setup-cli-native-local-2026-10-28.md',
  'docs/architecture/08-ops/roomqc-setup-credential-command-local-2026-10-28.md',
  'docs/architecture/08-ops/roomqc-setup-attestation-status-local-2026-10-28.md',
  'docs/architecture/08-ops/roomqc-setup-publication-local-2026-10-28.md',
  'docs/architecture/08-ops/roomqc-vps-signup-next-delivery-2026-10-28.md',
  'docs/architecture/08-ops/roomqc-vps-signup-start-pack-2026-10-28.md',
  'docs/architecture/08-ops/roomqc-setup-backfill-cli-local-2026-10-28.md',
  'docs/architecture/08-ops/roomqc-setup-backfill-runbook.md'
];
const packetPaths=[
  "artifacts/roomqc-workspace-recheck-b3bfc8f11661-local-2026-10-28.json",
  "artifacts/roomqc-setup-publication-native-148610a4b66c-local-2026-10-28.json",
  'artifacts/roomqc-workspace-recheck-frontend-53e4109dfa35-local-2026-10-28.json',
  'artifacts/roomqc-setup-backfill-cli-native-08c5dccb4388-local-2026-10-28.json'
];
const inside=path=>{const rel=relative(root,path);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel),'PLAN_PATH_OUTSIDE_REPOSITORY');return rel;};
const bytes=path=>readFile(resolve(root,path));
const json=async path=>JSON.parse(await bytes(path));
const signature=(value,keys)=>Object.fromEntries(keys.map(k=>[k,value[k]]));
const unique=values=>{assert.equal(new Set(values).size,values.length,'PLAN_DUPLICATE_ID');};
const checked=[];
const check=(label,callback)=>{callback();checked.push(label);};

function anchors(markdown){
  const counts=new Map();
  return new Set([...markdown.replace(/```[\s\S]*?```/g,'').matchAll(/^#{1,6}\s+(.+)$/gm)].map(match=>{
    const slug=match[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu,'').replace(/\s/g,'-');
    const count=counts.get(slug)??0;counts.set(slug,count+1);return count?`${slug}-${count}`:slug;
  }));
}

try{
  const args=process.argv.slice(2);let output=null;
  if(args.length===1&&args[0]==='--help'){
    process.stdout.write('Read-only plan audit. Usage: node scripts/verify-vps-signup-plan.mjs [--output <new absolute artifacts/*.json>]\n');
    process.exit(0);
  }
  assert.ok(args.length===0||(args.length===2&&args[0]==='--output'),'PLAN_ARGUMENT_INVALID');
  if(args.length){
    assert.ok(isAbsolute(args[1]),'PLAN_OUTPUT_REQUIRES_ABSOLUTE_PATH');output=resolve(args[1]);
    assert.equal(dirname(output),await realpath(resolve(root,'artifacts')),'PLAN_OUTPUT_OUTSIDE_ARTIFACTS');
    assert.ok(/^[a-z0-9][a-z0-9._-]*\.json$/.test(basename(output)),'PLAN_OUTPUT_NAME_INVALID');
  }
  for(const file of protectedFiles)assert.equal(sha(await bytes(file.path)),file.sha256,'PROTECTED_ACCEPTANCE_CHANGED');
  checked.push('protected-ledger-and-worksheet-unchanged');
  const ledger=await json(protectedFiles[0].path),plan=await json(planPath);
  check('definition-source-checksums',()=>{
    assert.deepEqual(plan.definitionSource,protectedFiles[0]);assert.deepEqual(plan.worksheetSource,protectedFiles[1]);
  });
  check('25-task-definitions-and-dependencies-preserved',()=>{
    const keys=['id','title','dependsOn','packageIds','caseIds','requiredEnvironments','ownerRole','reviewerRole'];
    assert.equal(plan.tasks.length,25);unique(plan.tasks.map(x=>x.id));
    assert.deepEqual(plan.tasks.map(x=>signature(x,keys)),ledger.tasks.map(x=>signature(x,keys)));
    const byId=new Map(plan.tasks.map(x=>[x.id,x])),visiting=new Set(),done=new Set();
    const visit=id=>{
      assert.ok(byId.has(id),'PLAN_UNKNOWN_DEPENDENCY');assert.ok(!visiting.has(id),'PLAN_DEPENDENCY_CYCLE');
      if(done.has(id))return;visiting.add(id);byId.get(id).dependsOn.forEach(visit);visiting.delete(id);done.add(id);
    };
    plan.tasks.forEach(x=>visit(x.id));assert.equal(done.size,25);
    assert.equal(ledger.packages.length,27);unique(ledger.packages.map(x=>x.id));
    const packageIds=new Set(ledger.packages.map(x=>x.id));
    plan.tasks.forEach(x=>x.packageIds.forEach(id=>assert.ok(packageIds.has(id),'PLAN_UNKNOWN_PACKAGE')));
  });
  check('8-waves-cover-every-task-once',()=>{
    assert.equal(plan.waves.length,8);assert.deepEqual(plan.waves.map(x=>x.wave),[1,2,3,4,5,6,7,8]);
    const ids=plan.waves.flatMap(x=>x.taskIds);unique(ids);assert.deepEqual([...ids].sort(),plan.tasks.map(x=>x.id).sort());
    const waves=new Map(plan.waves.flatMap(x=>x.taskIds.map(id=>[id,x.wave])));
    plan.tasks.forEach(t=>t.dependsOn.forEach(id=>assert.ok(waves.get(id)<=waves.get(t.id),'PLAN_DEPENDENCY_IN_LATER_WAVE')));
  });
  check('70-case-scenarios-expected-task-and-environment-preserved',()=>{
    const keys=['id','scenario','expected','taskIds','requiredEnvironments'];assert.equal(plan.cases.length,70);unique(plan.cases.map(x=>x.id));
    assert.deepEqual(plan.cases.map(x=>signature(x,keys)),ledger.acceptanceCases.map(x=>signature(x,keys)));
    for(const c of plan.cases)for(const id of c.taskIds)assert.ok(plan.tasks.find(t=>t.id===id)?.caseIds.includes(c.id),'PLAN_CASE_TASK_MISMATCH');
  });
  check('124-environment-pairs-planned-without-actual-or-signoff',()=>{
    const expected=plan.cases.flatMap(c=>c.requiredEnvironments.map(e=>`${c.id}:${e}`));unique(expected);
    const actual=plan.executionRows.map(x=>`${x.caseId}:${x.environment}`);unique(actual);
    assert.deepEqual([...actual].sort(),[...expected].sort());assert.equal(actual.length,124);
    const counts={local:0,staging:0,pilot:0};
    for(const row of plan.executionRows){
      assert.ok(Object.hasOwn(counts,row.environment));counts[row.environment]++;
      assert.equal(row.executionStatus,'not_run');assert.deepEqual(row.taskIds,plan.cases.find(c=>c.id===row.caseId).taskIds);
      for(const field of ['exactCommand','datasetRef','targetRef','sourceRef','runner','reviewer','actual','exitCode','signoff'])assert.equal(row[field],null);
      assert.deepEqual(row.evidence,[]);assert.deepEqual(row.defects,[]);
    }
    assert.deepEqual(counts,{local:54,staging:69,pilot:1});assert.deepEqual(counts,plan.counts.byEnvironment);
    assert.equal(plan.counts.requiredCaseEnvironmentPairs,124);
  });
  check('acceptance-and-gate-decisions-unchanged',()=>{
    const release=[...ledger.tasks,...ledger.packages,...ledger.acceptanceCases];assert.equal(release.length,122);
    release.forEach(x=>assert.equal(x.releaseAcceptance,'unverified'));
    assert.deepEqual(plan.gates,ledger.gates.map(x=>signature(x,['id','label','decision'])));
    assert.deepEqual(plan.acceptanceState,{casesNotRun:70,releaseEntriesUnverified:122,changed:false});
    for(const field of ['productAccepted','goalComplete','deploymentAuthorizedByThisArtifact'])assert.equal(plan[field],false);
    for(const field of ['reviewer','signoff'])assert.equal(plan[field],null);
    assert.equal(plan.status,'planned_not_executed');
  });
  const backend=await captureBackendSourceBinding(root),control=await json(packetPaths[0]),native=await json(packetPaths[1]);
  const frontend=await json(packetPaths[2]),previousNative=await json(packetPaths[3]);
  assertBackendSourceBinding(control.backendSource,backend);assertBackendSourceBinding(native.source.backend,backend);
  // Previous native evidence is historical. Compare only immutable migration
  // files; never transfer its CLI/Linux counts to the current candidate.
  const previousMigrations=previousNative.source.backend.files.filter(x=>/^server\/control\/migrations\/00(?:0[1-9]|1[0-7])-.*\.sql$/.test(x.path));
  assert.equal(previousMigrations.length,17);
  assert.deepEqual(backend.files.filter(x=>previousMigrations.some(y=>y.path===x.path)),previousMigrations);
  checked.push('directory-migrations-0001-through-0017-unchanged');
  const migrationFiles=(await readdir(resolve(root,'supabase/migrations'))).filter(name=>name.endsWith('.sql')).sort();
  const migrationHash=createHash('sha256');
  for(const name of migrationFiles)migrationHash.update(name+'\0'+(await readFile(resolve(root,'supabase/migrations',name),'utf8')).replace(/\r\n/g,'\n')+'\0');
  const businessMigrations={count:migrationFiles.length,sha256:migrationHash.digest('hex')};
  check('583-business-migrations-match-existing-native-evidence',()=>{
    assert.equal(businessMigrations.count,583);assert.deepEqual(businessMigrations,native.source.businessMigrations);
  });
  check('existing-local-evidence-matches-current-backend-source',()=>{
    assert.equal(control.verified,true);assert.equal(control.execution.exitCode,0);assert.equal(control.sourceUnchanged,true);
    assert.equal(backend.files.length,281);
    assert.equal(control.scope,'control-regression');assert.deepEqual(control.counts,{tests:663,pass:661,fail:0,cancelled:0,skipped:2});
    assert.equal(control.skips.length,2);assert.deepEqual(control.skips.map(x=>x.reason).sort(),
      ['OS does not permit creating the owned file symlink','Production notification file modes are enforced on Linux'].sort());
    assert.equal(native.verified,true);assert.equal(native.execution.terminalExitCode,0);assert.equal(native.execution.diagnosticOnly,true);
    assert.equal(native.execution.fullIntegratedCandidate,false);
    assert.equal(native.source.verifiedAtEnd,true);assert.equal(native.source.schemaBefore,native.source.schemaAfter);
    const foundation=native.controls.foundation,api=native.controls.nativeApi;
    assert.equal(foundation.directoryMigrations,18);assert.equal(foundation.checks.length,17);
    assert.equal(foundation.backfillChecks.length,8);assert.equal(foundation.applyChecks.length,8);
    assert.equal(foundation.directoryRoleCleanup.verified,true);
    assert.equal(native.controls.total,262);assert.equal(native.controls.checks.length,262);
    native.controls.checks.forEach(x=>assert.equal(x.passed,true));
    assert.equal(native.controls.protocolBarriers.length,4);assert.ok(native.controls.protocolBarriers.every(x=>x.observed));
    assert.equal(api.verified,true);assert.equal(api.checks.length,45);assert.equal(api.directoryMigrations,18);
    assert.ok(api.checks.every(x=>x.passed));assert.equal(api.directoryRoleCleanup.verified,true);
    for(const field of ['actualAuth','actualRest','actualApiRuntimeRole','actualWorkerRuntimeRole','separateProcesses'])assert.equal(api[field],true);
    assert.equal(api.kills.length,10);assert.ok(api.kills.every(x=>x.signal==='SIGKILL'));
    assert.equal(api.kills.filter(x=>x.label.startsWith('worker-')).length,3);
    assert.equal(api.barriers.length,28);assert.ok(api.barriers.every(x=>x.observed));
    for(const label of ['tcp-response-loss-after-real-business-commit-leaves-durable-dispatch',
      'tcp-lost-recheck-result-commits-one-command-and-audit','real-operator-lookup-replay-and-cross-actor-result-isolation-after-process-restart',
      'worker-process-recovery-after_claim-preserves-business-and-terminal-proof',
      'worker-process-recovery-after_close-preserves-business-and-terminal-proof',
      'worker-process-recovery-after_settle-preserves-business-and-terminal-proof',
      'live-auth-session-revoke-during-directory-lock-denies-command-with-zero-effects'])assert.ok(api.checks.some(x=>x.label===label&&x.passed));
    assert.equal(control.cases.length,16);assert.ok(control.cases.every(x=>x.passed));
    for(const packet of [control,native]){
      assert.deepEqual(packet.cleanup,{containers:0,volumes:0,networks:0});
      assert.equal(packet.acceptance.productAccepted,false);assert.equal(packet.acceptance.gatesChanged,false);
    }
    assert.ok(native.advisors&&Number.isInteger(native.advisors.total)&&native.advisors.total>0);
    assert.equal(native.advisors.cliVersion,'2.122.0');
    const cli=native.controls.nativeCli;
    assert.equal(cli.verified,true);assert.equal(cli.checks.length,16);assert.equal(cli.barriers.length,3);assert.equal(cli.kills.length,1);
    assert.equal(cli.kills[0].signal,'SIGKILL');assert.ok(cli.checks.every(x=>x.passed));assert.ok(cli.barriers.every(x=>x.observed));
    assert.equal(cli.directoryMigrations,18);assert.equal(cli.directoryRoleCleanup.verified,true);
    for(const field of ['actualCliProcesses','actualReceiptTransport','readOnlySourceSnapshot','privateFilesRemoved'])assert.equal(cli[field],true);
    assert.deepEqual(cli.source,{backendSha256:backend.sha256,backendFiles:backend.files.length});
    assert.deepEqual(native.source.cliSnapshot,{sha256:backend.sha256,files:backend.files.length,readOnly:true});
    for(const label of ['actual-reader-cli-loads-private-config-native-role-and-five-receipt-classifications',
      'dry-run-keeps-directory-business-and-remote-journal-unchanged','forged-report-rejected-before-any-command',
      'actual-post-commit-readyforquery-response-lost-before-cli-result','real-postgrest-receipt-blocked-on-owned-business-table-lock',
      'same-signed-batch-new-output-resumes-real-closed-committed-pending-active-conflict','replay-keeps-five-immutable-commands-and-five-audits',
      'apply-never-closes-or-provisions-remote-and-preserves-tenant-hotel-trial-outbox','actual-linux-private-output-modes'])
      assert.ok(cli.checks.some(x=>x.label===label&&x.passed));
    assert.equal(cli.processTimings.length,7);assert.ok(cli.processTimings.every(x=>Number.isSafeInteger(x.durationMs)&&x.durationMs>=0));
  });
  check('credential-command-local-proof-is-scoped-and-not-installer-acceptance',()=>{
    const credentials=native.controls.nativeCredentials;
    assert.equal(credentials.verified,true);assert.equal(credentials.checks.length,78);assert.ok(credentials.checks.every(x=>x.passed));
    for(const field of ['actualPostgres','actualRest','actualSqlWriterProcesses','fixtureReleaseOnly'])assert.equal(credentials[field],true);
    for(const field of ['installerCliVerified','rotationDaemonVerified','productAccepted'])assert.equal(credentials[field],false);
    assert.equal(credentials.filePublicationVerified,true);
    assert.equal(credentials.kills.length,2);assert.ok(credentials.kills.every(x=>x.signal==='SIGKILL'&&x.observedBarrier));
    assert.equal(credentials.barriers.length,2);assert.ok(credentials.barriers.every(x=>x.observed));
    assert.equal(native.upgradeRollback.verified,true);assert.equal(native.upgradeRollback.priorMigrations,580);
    for(const field of ['schemaUnchanged','rolesAbsent','historyAbsent','businessMigrationRoleDenied'])assert.equal(native.upgradeRollback[field],true);
    assert.equal(native.upgradeRollback.maintenanceRole,'supabase_admin');
    for(const label of ['parallel-same-key-replays-exact-immutable-result','old-token-is-denied-after-overlap-without-rotator-running',
      'audit-fault-rolls-back-entire-issue-command','revoke-serializes-after-in-flight-native-close',
      'writer-sigkill-before-commit-leaves-no-command-or-credential','writer-sigkill-after-commit-recovers-exact-key-with-one-command',
      'binding-change-revokes-even-unexpired-credential','credential-maintenance-keeps-eleven-business-tables-unchanged'])
      assert.ok(credentials.checks.some(x=>x.label===label&&x.passed));
  });
  check('internal-file-publication-has-native-process-recovery-with-fixture-authority',()=>{
    const p=native.controls.nativeCredentials.publication;
    assert.equal(p.verified,true);assert.equal(p.checks.length,18);assert.ok(p.checks.every(x=>x.passed));
    assert.equal(p.kills.length,4);assert.ok(p.kills.every(x=>x.signal==='SIGKILL'&&x.observedBarrier));
    assert.deepEqual(p.barriers.map(x=>x.phase),['intent_synced','stage_synced','before_rename','after_rename']);
    assert.ok(p.barriers.every(x=>x.observed));
    for(const key of ['actualPublisherProcesses','actualPostgres','actualRest','filePublicationVerified','fixtureAuthorityOnly'])assert.equal(p[key],true);
    assert.equal(p.operationalInstallerVerified,false);assert.equal(p.rotationDaemonVerified,false);
    for(const label of ['second-process-fails-fast-on-live-maintenance-mutex','truncated-owned-stage-rebuilt-from-durable-intent',
      'forged-receipt-rejected-by-actual-caller-scoped-db-read','symlink-output-denied-without-writing-through-it',
      'hardlink-output-denied-without-changing-other-inode-name','intent-conflict-not-overwritten',
      'denial-releases-session-maintenance-lock','publication-kills-and-replay-never-create-db-credentials-or-extend-expiry'])
      assert.ok(p.checks.some(x=>x.label===label&&x.passed));
  });
  check('fingerprint-v3-and-live-status-have-actual-catalog-and-upgrade-proof',()=>{
    const credentials=native.controls.nativeCredentials;
    assert.equal(credentials.schemaFingerprintVersion,3);assert.equal(credentials.actualRecoveryCatalogDriftCases,9);
    assert.equal(credentials.liveStatusVerified,true);assert.equal(credentials.maintenanceSchemaNotExposed,true);
    assert.equal(native.attestationUpgradeRollbacks.length,2);
    assert.deepEqual(native.attestationUpgradeRollbacks.map(x=>x.priorMigrations),[581,582]);
    for(const row of native.attestationUpgradeRollbacks)for(const key of ['verified','schemaUnchanged','fingerprintDefinitionUnchanged','statusSurfaceUnchanged','historyAbsent'])
      assert.equal(row[key],true);
    for(const label of ['live-status-reports-unbound-instead-of-trusting-existing-credential-rows','status-runs-on-read-only-operator-transaction',
      'actual-postgrest-manifest-and-runtime-verifier-require-v3','retained-v1-and-v2-release-metadata-fail-closed',
      'maintenance-status-schema-is-not-exposed-by-actual-postgrest','historical-issue-receipt-does-not-make-revoked-head-ready',
      'live-status-rejects-retired-head-before-jwt-expiry','live-status-observes-actual-expiry-and-never-replays-ready'])
      assert.ok(credentials.checks.some(x=>x.label===label&&x.passed));
  });
  assert.equal(frontend.verified,true);assert.equal(frontend.sourceUnchanged,true);assert.equal(frontend.source.length,14);
  assert.deepEqual(frontend.counts,{tests:66,pass:66,fail:0});
  assert.deepEqual(frontend.execution.map(x=>x.name).sort(),['eslint','typescript','vitest']);
  assert.ok(frontend.execution.every(x=>x.exitCode===0&&!x.timedOut));
  assert.equal(frontend.acceptance.productAccepted,false);assert.equal(frontend.acceptance.gatesChanged,false);
  for(const file of frontend.source){
    assert.ok(/^src\/[a-zA-Z0-9_./-]+\.(?:ts|tsx)$/.test(file.path),'PLAN_FRONTEND_SOURCE_PATH');inside(resolve(root,file.path));
    assert.equal(sha((await bytes(file.path)).toString('utf8').replace(/\r\n/g,'\n')),file.sha256,'PLAN_FRONTEND_SOURCE_DRIFT');
  }
  checked.push('frontend-14-scoped-source-files-and-66-tests-match');
  const cleanupChecks=[];
  for(const [packet,label]of [[control,'roomqc.control-directory-test'],[native,'roomqc.control-backend-test']]){
    assert.match(packet.run,/^[a-f0-9]{12}$/);
    const remaining={};
    for(const [kind,args]of Object.entries({containers:['ps','-aq'],volumes:['volume','ls','-q'],networks:['network','ls','-q']})){
      remaining[kind]=execFileSync('docker',[...args,'--filter',`label=${label}=${packet.run}`],
        {encoding:'utf8',windowsHide:true,timeout:15000}).trim().split(/\r?\n/).filter(Boolean).length;
      assert.equal(remaining[kind],0,'PLAN_OWNED_RESOURCE_REMAINS');
    }
    cleanupChecks.push({run:packet.run,remaining});
  }
  checked.push('independent-read-only-owned-docker-cleanup');
  let links=0,anchorCount=0;const docRecords=[];
  for(const path of documents){
    const data=await bytes(path),markdown=data.toString('utf8');docRecords.push({path,sha256:sha(data)});
    assert.ok(!/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|re_[a-zA-Z0-9]{24,}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@)/.test(markdown),'PLAN_SECRET_PATTERN');
    for(const match of markdown.matchAll(/(?<!!)\[[^\]\r\n]*\]\(([^)\r\n]+)\)/g)){
      const target=match[1];if(/^(?:https?:|mailto:)/.test(target))continue;
      const [file,anchor]=target.split('#');const resolved=resolve(dirname(resolve(root,path)),decodeURIComponent(file||basename(path)));
      inside(resolved);assert.ok((await lstat(resolved)).isFile(),'PLAN_LINK_NOT_FILE');
      assert.equal(await realpath(resolved),resolved,'PLAN_LINK_SYMLINK');links++;
      if(anchor){assert.ok(anchors(await readFile(resolved,'utf8')).has(decodeURIComponent(anchor)),`PLAN_ANCHOR_MISSING:${target}`);anchorCount++;}
    }
  }
  checked.push('action-and-start-pack-local-links-and-anchors','new-documents-secret-pattern-check');
  const after=await captureBackendSourceBinding(root);assertBackendSourceBinding(backend,after);
  for(const file of protectedFiles)assert.equal(sha(await bytes(file.path)),file.sha256,'PROTECTED_ACCEPTANCE_CHANGED');
  const report={version:1,type:'vps_signup_plan_readiness_validation',recordedAtUtc:new Date().toISOString(),
    scope:'whole_vps_and_signup',requestedOutput:'plan_and_acceptance',planVerified:true,validationChecks:checked,
    counts:{waves:8,tasks:25,packages:27,cases:70,requiredCaseEnvironmentPairs:124,local:54,staging:69,pilot:1,releaseUnverified:122},
    protectedArtifacts:protectedFiles,executionPlan:{path:planPath,sha256:sha(await bytes(planPath))},documents:docRecords,
    evidenceReferences:await Promise.all(packetPaths.map(async path=>({path,sha256:sha(await bytes(path))}))),
    source:{sha256:backend.sha256,files:backend.files.length,unchangedDuringValidation:true,businessMigrations},cleanupChecks,links,anchors:anchorCount,
    auditScript:{path:'scripts/verify-vps-signup-plan.mjs',sha256:sha(await bytes('scripts/verify-vps-signup-plan.mjs'))},
    limitations:['Document/source/packet consistency and read-only Docker cleanup only; product tests were not rerun by this audit.',
      'Native covers API/worker core with real Auth/REST/PG, 10 SIGKILL and TCP loss. Confirmed Auth accounts, signed release and health are fixtures; not public email signup or a full integrated candidate.',
      'Frontend covers 14 scoped source/test files with jsdom and Capacitor HTTP mocks; no full dependency graph freeze, browser or Android E2E.',
      'Native CLI covers private config/scoped receipts/signed batch, one PG post-commit loss and one SIGKILL/resume. Credential/status/attestation/publication contribute 78 local controls: 60 prior controls plus 18 internal publication controls, four publisher SIGKILL/resumes and two SQL-writer SIGKILLs. Publication authority is a fixture; operational installer/target/budget/release preflight and rotation scheduler remain unverified.',
      'Schema fingerprint v3 covers recovery namespace definitions/ACLs and capability graph. It does not prove operational DSN/host/config exposure or the full indirect privilege audit. Installer/runtime, cross-system actor revoke, T10/quotas/signup/email/console/full-default/rebuild/VPS/DR/load/RC/pilot remain open.'],
    productAccepted:false,backfillFixtureApplied:true,operationalBackfillApplied:false,gatesChanged:false,goalComplete:false,reviewer:null,signoff:null};
  if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({planVerified:true,checks:checked.length,...report.counts,links,anchors:anchorCount,
    backendSourceMatchesExistingEvidence:true,productTestsRerun:false,productAccepted:false,output:output?relative(root,output).replaceAll('\\','/'):null})+'\n');
}catch(error){
  // No raw file/config/DSN or private evidence is printed on a failed audit.
  process.stderr.write(JSON.stringify({planVerified:false,code:error?.code??'PLAN_VALIDATION_FAILED',
    check:typeof error?.message==='string'&&/^PLAN_|^PROTECTED_/.test(error.message)?error.message:'plan/source/evidence consistency check failed'})+'\n');
  process.exitCode=1;
}
