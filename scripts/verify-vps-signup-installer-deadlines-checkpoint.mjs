// Read public evidence and documents only. No Docker, DB, secrets or gates.
import assert from 'node:assert/strict';
import {readFile,readdir,lstat,realpath,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';
const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const read=p=>readFile(resolve(root,p));
const json=async p=>JSON.parse(await read(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const expected='bb21bef86c200d3d09c950b11c96417710bb9a9a47af7af0d3a0200caec2a367';
const evidence={native:'artifacts/roomqc-setup-installer-deadlines-native-e43c766bd1ab-local-2026-10-28.json',
 focused:'artifacts/roomqc-setup-installer-deadlines-focused-native-4ff9679f0f8a-local-2026-10-28.json',
 control:'artifacts/roomqc-workspace-recheck-fa4c0b00f1f2-local-2026-10-28.json'};
const protectedFiles=[
 {path:'artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json',sha256:'612a518c9cf533beb0a39e7fcf47465644b2224dfb7ddb2bcb29f82005164c63'},
 {path:'docs/architecture/08-ops/roomqc-vps-signup-acceptance-worksheet-2026-10-22.md',sha256:'e5df481be5264aa445165ea0ffb5541ceb7764d24193913654e2730699bd03a7'}];
const documents=['roomqc-vps-signup-master-plan-2026-10-28.md','roomqc-vps-signup-master-acceptance-2026-10-28.md',
 'roomqc-vps-signup-next-delivery-2026-10-28.md','roomqc-vps-signup-start-pack-2026-10-28.md','roomqc-vps-signup-handoff-2026-10-28.md',
 'roomqc-vps-signup-plan-current-2026-10-26.md','roomqc-vps-signup-progress.md','roomqc-vps-signup-implementation-board-2026-10-28.md',
 'roomqc-setup-installer-faults-local-2026-10-28.md','roomqc-setup-credential-installer-runbook.md',
 'roomqc-setup-installer-fault-matrix-2026-10-28.md','roomqc-setup-installer-deadlines-local-2026-10-28.md'].map(p=>'docs/architecture/08-ops/'+p);
const anchors=markdown=>{
 const counts=new Map(),values=new Set([...markdown.matchAll(/<a\s+id="([^"]+)"/g)].map(m=>m[1]));
 for(const m of markdown.replace(/```[\s\S]*?```/g,'').matchAll(/^#{1,6}\s+(.+)$/gm)){
  const slug=m[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu,'').replace(/\s/g,'-');
  const n=counts.get(slug)??0;counts.set(slug,n+1);values.add(n?slug+'-'+n:slug);
 }return values;
};
const checks=[];
try{
 const args=process.argv.slice(2);let output;
 if(args.length===1&&args[0]==='--help'){
  console.log('Read-only fixed installer checkpoint audit, not product tests or acceptance. Optional --output <new absolute artifacts/*.json>.');process.exit(0);
 }
 assert.ok(args.length===0||args.length===2&&args[0]==='--output');
 if(args.length){output=resolve(args[1]);assert.ok(isAbsolute(args[1]));assert.equal(dirname(output),await realpath(resolve(root,'artifacts')));assert.match(basename(output),/^[a-z0-9][a-z0-9._-]*\.json$/)}
 const source=await captureBackendSourceBinding(root);assert.equal(source.sha256,expected);assert.equal(source.files.length,291);
 const packets=Object.fromEntries(await Promise.all(Object.entries(evidence).map(async([k,p])=>[k,await json(p)])));
 const {native,focused,control}=packets;
 for(const packet of [native,focused,control]){
  assert.equal(packet.verified,true);assert.equal(packet.acceptance.productAccepted,false);assert.equal(packet.acceptance.gatesChanged,false);
  assert.equal(packet.acceptance.reviewer,null);assert.equal(packet.acceptance.signoff,null);
  assert.deepEqual(packet.cleanup,{containers:0,volumes:0,networks:0});
  assertBackendSourceBinding(source,packet.source?.backend??packet.backendSource);
 }
 checks.push('all-three-terminal-packets-share-current-source-and-cleanup-zero');
 assert.equal(native.execution.terminalExitCode,0);assert.equal(native.execution.diagnosticOnly,true);assert.equal(native.execution.fullIntegratedCandidate,false);
 assert.equal(native.source.verifiedAtEnd,true);assert.equal(native.source.schemaBefore,native.source.schemaAfter);
 assert.equal(native.source.businessMigrations.count,584);assert.equal(native.controls.total,362);assert.ok(native.controls.checks.every(c=>c.passed));
 const credential=native.controls.nativeCredentials,installer=credential.installerCli;
 assert.equal(credential.checks.length,178);assert.equal(credential.publication.checks.length,18);assert.equal(credential.publication.kills.length,4);
 for(const section of [native.controls.nativeApi,native.controls.nativeCli,native.controls.foundation,installer])assert.equal(section.directoryMigrations,19);
 assert.equal(installer.checks.length,100);assert.equal(installer.kills.length,2);assert.ok(installer.kills.every(k=>k.signal==='SIGKILL'&&k.observedBarrier));
 assert.deepEqual(installer.faultGroupsVerified,['IF01','IF02','IF03','IF04','IF05','IF06','IF07','IF08','IF09','IF10','IF11','IF13','IF16','IF17']);assert.ok([0,1].includes(installer.precommitObservedEffects));assert.equal(installer.barriers.length,9);
 assert.equal(installer.kills[0].observedBarrier,true);
 
 for(const f of [installer,focused.controls.installer]){
  for(const key of ['verified','actualApiLoginWithdrawal','alternateKeyPositiveControl','immutableRevocationRetained','singleDirectoryEffect',
   'businessEffectsUnchanged','fixtureBypassLabelled','baselineKeyNeverRevoked'])assert.equal(f.keyWithdrawal[key],true);
  for(const key of ['verified','testOnlySchemaApprovedBeforeCommands','nontransactionalWitness','sameKeyRecovery','singleCommandAuditCredential','fixtureRemoved'])
   assert.equal(f.rollbackFaults[key],true);
  assert.deepEqual(f.keyWithdrawal.groups,['IF10']);assert.deepEqual(f.rollbackFaults.groups,['IF16']);
  assert.deepEqual(f.rollbackFaults.observations.map(r=>r.phase),['command','audit']);
  for(const row of f.rollbackFaults.observations)for(const key of ['priorMutationsObserved','backendTerminal','allManagementStateRolledBack','outputUnchanged'])assert.equal(row[key],true);
 }
 for(const f of [installer,focused.controls.installer]){
  const d=f.deadlineFaults;
  for(const key of ['verified','actualCliProcesses','actualPostgresFrames','serverSqlStatesVerified','rollbackWitnessVerified',
   'overallTimerVerified','sameCommandRecovery','singleCommandAuditCredential','overallTimerStartsAfterConfigurationRead','noProductTimeoutsChanged'])assert.equal(d[key],true);
  assert.deepEqual(d.groups,['IF11']);assert.equal(d.observations.length,8);assert.equal(d.cleanups.length,13);
  assert.deepEqual(d.observations.map(r=>r.case),['DL01','DL02','DL03','DL04','DL05','DL06','DL06','DL07']);
  assert.equal(d.observations[2].serverSqlState,'55P03');assert.equal(d.observations[3].serverSqlState,'57014');
  for(const row of d.cleanups)for(const key of ['sessionsEnded','proxySocketsEnded','businessMutexFree','directoryExclusiveFree'])assert.equal(row[key],true);
  const overall=d.observations.at(-1);assert.ok(overall.elapsedMs>=44000&&overall.elapsedMs<55000);
  assert.equal(overall.connectionLifetimesMs.length,2);assert.ok(overall.connectionLifetimesMs.every(ms=>ms>=43000&&ms<50000));
  assert.ok(overall.maxForwardedQueryElapsedMs>0&&overall.maxForwardedQueryElapsedMs<4000);
  assert.ok(overall.responses.filter(r=>r.forwarded).every(r=>r.clientQueryElapsedMs>0&&r.clientQueryElapsedMs<4000));
  assert.ok(overall.pendingQueryAgeMs.length>0&&overall.pendingQueryAgeMs.every(ms=>ms>=0&&ms<4000));
 }
 checks.push('actual-server-timeouts-and-overall-timer-have-source-bound-timing-effects-and-13-cleanups');
 const interruption=await json('artifacts/roomqc-setup-installer-interrupted-b991083c9952-local-2026-10-28.json');
 assert.equal(interruption.verified,false);assert.equal(interruption.execution.terminalObserved,false);assert.equal(interruption.execution.terminalExitCode,null);
 assert.deepEqual(interruption.cleanup,{containers:0,volumes:0,networks:0});
 assert.equal(installer.preflightFaults.verified,true);assert.equal(installer.preflightFaults.permissionCalls,26);
 assert.deepEqual(installer.preflightFaults.groups,['IF09','IF13','IF17']);
 assert.equal(installer.publicationFences.verified,true);assert.deepEqual(installer.publicationFences.groups,['IF06','IF07','IF08']);
 assert.equal(installer.publicationFences.barriers,7);assert.equal(installer.publicationFences.actualExpiry,true);assert.equal(installer.publicationFences.fixtureBypassLabelled,true);
 for(const packet of [native,focused]){const f=packet===native?installer:packet.controls.installer;
  assert.ok(f.publicationFences.expiryTiming.remainingAtBarrierMs>0&&f.publicationFences.expiryTiming.remainingAtBarrierMs<3500);
  assert.ok(f.barriers.every(b=>b.observed));assert.equal(f.preflightFaults.permissionCalls,26);
 }assert.equal(installer.privateFilesRemoved,true);
 for(const key of ['fullFaultMatrixVerified','rotationDaemonVerified','runtimeMountReloadVerified','productAccepted'])assert.equal(installer[key],false);
 assert.equal(focused.controls.checks.length,100);assert.equal(focused.execution.terminalExitCode,0);
 assert.ok(control.command.includes('--test-concurrency=4'));assert.equal(control.execution.exitCode,0);assert.equal(control.sourceUnchanged,true);
 assert.deepEqual(control.counts,{tests:673,pass:671,fail:0,cancelled:0,skipped:2});assert.equal(control.cases.length,16);assert.ok(control.cases.every(c=>c.passed));
 checks.push('withdrawal-and-rollback-witnesses-plus-native-regression-and-unverified-limits-match');
 const migrations=(await readdir(resolve(root,'supabase/migrations'))).filter(p=>p.endsWith('.sql')).sort(),chain=createHash('sha256');
 for(const name of migrations)chain.update(name+'\0'+(await readFile(resolve(root,'supabase/migrations',name),'utf8')).replace(/\r\n/g,'\n')+'\0');
 assert.equal(migrations.length,584);assert.equal(chain.digest('hex'),native.source.businessMigrations.sha256);
 assert.equal((await readdir(resolve(root,'server/control/migrations'))).filter(p=>p.endsWith('.sql')).length,19);
 for(const item of protectedFiles)assert.equal(sha(await read(item.path)),item.sha256);
 const ledger=await json(protectedFiles[0].path),execution=await json('artifacts/roomqc-vps-signup-acceptance-execution-plan-2026-10-28.json');
 assert.equal(ledger.tasks.length,25);assert.equal(ledger.packages.length,27);assert.equal(ledger.acceptanceCases.length,70);
 for(const row of [...ledger.tasks,...ledger.packages,...ledger.acceptanceCases])assert.equal(row.releaseAcceptance,'unverified');
 assert.equal(execution.executionRows.length,124);assert.ok(execution.executionRows.every(r=>r.executionStatus==='not_run'&&r.actual===null&&r.reviewer===null&&r.signoff===null));
 const projection=(r,keys)=>Object.fromEntries(keys.map(k=>[k,r[k]]));
 const taskKeys=['id','title','dependsOn','packageIds','caseIds','requiredEnvironments','ownerRole','reviewerRole'];
 assert.deepEqual(execution.tasks.map(r=>projection(r,taskKeys)),ledger.tasks.map(r=>projection(r,taskKeys)));
 const caseKeys=['id','scenario','expected','taskIds','requiredEnvironments'];
 assert.deepEqual(execution.cases.map(r=>projection(r,caseKeys)),ledger.acceptanceCases.map(r=>projection(r,caseKeys)));
 const expectedPairs=ledger.acceptanceCases.flatMap(c=>c.requiredEnvironments.map(e=>c.id+':'+e));
 const actualPairs=execution.executionRows.map(r=>r.caseId+':'+r.environment);
 assert.equal(new Set(actualPairs).size,124);assert.deepEqual(actualPairs.slice().sort(),expectedPairs.slice().sort());
 assert.deepEqual(Object.fromEntries(['local','staging','pilot'].map(e=>[e,execution.executionRows.filter(r=>r.environment===e).length])),{local:54,staging:69,pilot:1});
 assert.deepEqual(execution.gates,ledger.gates.map(r=>projection(r,['id','label','decision'])));
 const active=new Set(),done=new Set(),tasks=new Map(ledger.tasks.map(t=>[t.id,t]));
 const visit=id=>{assert.ok(tasks.has(id)&&!active.has(id));if(done.has(id))return;active.add(id);tasks.get(id).dependsOn.forEach(visit);active.delete(id);done.add(id)};
 tasks.forEach(t=>visit(t.id));assert.equal(done.size,25);
 assert.equal(execution.productAccepted,false);assert.equal(execution.goalComplete,false);assert.equal(execution.deploymentAuthorizedByThisArtifact,false);
 checks.push('original-dependencies-cases-and-all-environment-pairs-remain-planned');
 checks.push('business-chain-and-protected-acceptance-remain-exact');
 const texts=await Promise.all(documents.map(p=>readFile(resolve(root,p),'utf8')));let links=0;
 for(let i=0;i<documents.length;i++){
  if(i<8)assert.ok(texts[i].includes(expected)&&texts[i].includes('roomqc-setup-installer-deadlines-local-2026-10-28.md'));
  assert.ok(!/(?:postgres(?:ql)?:\/\/[^\s]+|\bre_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)/.test(texts[i]));
  for(const m of texts[i].replace(/```[\s\S]*?```/g,'').matchAll(/(?<!!)\[[^\]\n]+\]\(([^)\s]+)\)/g)){
   if(/^[a-z][a-z0-9+.-]*:/i.test(m[1]))continue;
   const [part,fragment]=m[1].split('#'),target=part?resolve(root,dirname(documents[i]),decodeURIComponent(part)):resolve(root,documents[i]),rel=relative(root,target);
   assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));const info=await lstat(target);assert.ok(info.isFile()&&!info.isSymbolicLink());links++;if(fragment)assert.ok(anchors(await readFile(target,'utf8')).has(decodeURIComponent(fragment)),'ANCHOR_MISSING_'+m[1]);
  }
 }
 checks.push('twelve-documents-reference-checkpoint-with-resolving-links-and-no-secret-patterns');
 assertBackendSourceBinding(source,await captureBackendSourceBinding(root));
 for(const item of protectedFiles)assert.equal(sha(await read(item.path)),item.sha256);
 const result={version:1,type:'vps_signup_installer_deadlines_checkpoint_audit',recordedAtUtc:new Date().toISOString(),verified:true,checks,
  sourceSha256:expected,backendFiles:291,businessMigrations:584,directoryMigrations:19,
  evidence:await Promise.all(Object.entries(evidence).map(async([kind,path])=>({kind,path,sha256:sha(await read(path))}))),
  documents:documents.map((path,i)=>({path,sha256:sha(texts[i])})),linksChecked:links,protectedArtifacts:protectedFiles,
  execution:{readOnly:true,productTestsRun:false,databaseConnections:0,dockerCommands:0},
  acceptance:{productAccepted:false,goalComplete:false,gatesChanged:false,casesNotRun:70,releaseUnverified:122,requiredEnvironmentPairs:124,reviewer:null,signoff:null}};
 if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({verified:true,checks:checks.length,linksChecked:links,productAccepted:false,...(output?{output:relative(root,output).replaceAll('\\','/')}:{})}));
}catch(error){console.error(JSON.stringify({verified:false,code:error.code??'INSTALLER_CHECKPOINT_ASSERTION_FAILED'}));process.exitCode=1}
