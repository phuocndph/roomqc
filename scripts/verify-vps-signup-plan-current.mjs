// Current revision derived from the historical pinned audit; the historical verifier and packets remain unchanged.
// Validate planning documents and preserved acceptance definitions only.
// No product tests, Docker, database, credentials, deployment or gate writes.
import assert from 'node:assert/strict';
import {readFile,lstat,realpath,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';

const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const base='docs/architecture/08-ops/';
const read=p=>readFile(resolve(root,p));
const json=async p=>JSON.parse(await read(p));
const sha=b=>createHash('sha256').update(b).digest('hex');
const draftSha='a4ed41c998065f6c8ade71a4c010a5e9276d6113de3bbff7df2bf2e82fa6c960';
const historicalSha='bb21bef86c200d3d09c950b11c96417710bb9a9a47af7af0d3a0200caec2a367';
const protectedFiles=[
 {path:'artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json',sha256:'612a518c9cf533beb0a39e7fcf47465644b2224dfb7ddb2bcb29f82005164c63'},
 {path:base+'roomqc-vps-signup-acceptance-worksheet-2026-10-22.md',sha256:'e5df481be5264aa445165ea0ffb5541ceb7764d24193913654e2730699bd03a7'}];
const documents=['roomqc-vps-signup-master-plan-2026-10-28.md','roomqc-vps-signup-master-acceptance-2026-10-28.md',
 'roomqc-vps-signup-implementation-board-2026-10-28.md','roomqc-vps-signup-next-delivery-2026-10-28.md',
 'roomqc-vps-signup-start-pack-2026-10-28.md','roomqc-vps-signup-handoff-2026-10-28.md',
 'roomqc-vps-signup-plan-current-2026-10-26.md','roomqc-vps-signup-progress.md',
 'roomqc-setup-credential-installer-runbook.md','roomqc-setup-installer-fault-matrix-2026-10-28.md',
 'roomqc-private-input-hardlinks-local-2026-10-28.md','roomqc-vps-signup-deployment-blueprint-2026-10-28.md'].map(p=>base+p);
const packets={
 focused:'artifacts/roomqc-setup-installer-deadlines-focused-native-4ff9679f0f8a-local-2026-10-28.json',
 native:'artifacts/roomqc-setup-installer-deadlines-native-e43c766bd1ab-local-2026-10-28.json',
 control:'artifacts/roomqc-workspace-recheck-fa4c0b00f1f2-local-2026-10-28.json'};
const anchors=markdown=>{
 const values=new Set([...markdown.matchAll(/<a\s+id="([^"]+)"/g)].map(m=>m[1])),counts=new Map();
 for(const m of markdown.replace(/```[\s\S]*?```/g,'').matchAll(/^#{1,6}\s+(.+)$/gm)){
  const slug=m[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu,'').replace(/\s/g,'-');
  const count=counts.get(slug)??0;counts.set(slug,count+1);values.add(count?slug+'-'+count:slug);
 }return values;
};
const project=(r,keys)=>Object.fromEntries(keys.map(k=>[k,r[k]]));
const checks=[];
try{
 const args=process.argv.slice(2);let output;
 if(args.length===1&&args[0]==='--help'){
  console.log('Read-only plan/coverage/link audit. Never verifies the product candidate. Optional --output <new absolute artifacts/*.json>.');process.exit(0);
 }
 assert.ok(args.length===0||args.length===2&&args[0]==='--output','ARGUMENTS_INVALID');
 if(args.length){
  assert.ok(isAbsolute(args[1]),'ABSOLUTE_OUTPUT_REQUIRED');output=resolve(args[1]);
  assert.equal(dirname(output),await realpath(resolve(root,'artifacts')),'OUTPUT_OUTSIDE_ARTIFACTS');
  assert.match(basename(output),/^[a-z0-9][a-z0-9._-]*\.json$/,'OUTPUT_NAME_INVALID');
 }
 const source=await captureBackendSourceBinding(root);
 assert.equal(source.sha256,draftSha,'PLANNING_DRAFT_CHANGED');assert.equal(source.files.length,294);
 for(const f of protectedFiles)assert.equal(sha(await read(f.path)),f.sha256,'PROTECTED_ACCEPTANCE_CHANGED');
 checks.push('planning-draft-captured-and-protected-ledger-worksheet-unchanged');

 const historical=Object.fromEntries(await Promise.all(Object.entries(packets).map(async([kind,path])=>[kind,await json(path)])));
 for(const packet of Object.values(historical)){
  assert.equal(packet.verified,true);assert.equal((packet.source?.backend??packet.backendSource).sha256,historicalSha);
  assert.equal(packet.acceptance.productAccepted,false);assert.equal(packet.acceptance.gatesChanged,false);
  assert.equal(packet.acceptance.reviewer,null);assert.equal(packet.acceptance.signoff,null);
  assert.deepEqual(packet.cleanup,{containers:0,volumes:0,networks:0});
 }
 assert.notEqual(source.sha256,historicalSha,'HISTORICAL_SOURCE_MUST_REMAIN_DISTINCT');
 assert.equal(historical.focused.controls.checks.length,100);assert.equal(historical.focused.execution.terminalExitCode,0);
 assert.equal(historical.native.controls.total,362);assert.equal(historical.native.execution.terminalExitCode,0);
 assert.equal(historical.native.source.verifiedAtEnd,true);assert.equal(historical.native.source.schemaBefore,historical.native.source.schemaAfter);
 assert.equal(historical.native.source.businessMigrations.count,584);
 assert.deepEqual(historical.control.counts,{tests:673,pass:671,fail:0,cancelled:0,skipped:2});assert.equal(historical.control.execution.exitCode,0);
 checks.push('historical-local-packets-remain-valid-for-291-files-and-do-not-verify-294-file-candidate');


 const currentPaths={control:'artifacts/roomqc-workspace-recheck-037d01f02abe-local-2026-10-28.json',
  nonroot:'artifacts/roomqc-installer-nonroot-topology-83bc7694a807-local-2026-10-28.json',
  native:'artifacts/roomqc-setup-installer-filesystem-native-3902198db24e-local-2026-10-28.json'};
 const currentPackets=Object.fromEntries(await Promise.all(Object.entries(currentPaths).map(async([kind,path])=>[kind,await json(path)])));
 const c=currentPackets.control,n=currentPackets.nonroot,b=currentPackets.native;
 for(const p of [c,n,b]){
  assertBackendSourceBinding(source,p.backendSource??p.source.backend);
  assert.equal(p.acceptance.productAccepted,false);assert.equal(p.acceptance.gatesChanged,false);
  assert.equal(p.acceptance.reviewer,null);assert.equal(p.acceptance.signoff,null);
  assert.deepEqual(p.cleanup,{containers:0,volumes:0,networks:0});
 }
 assert.equal(c.verified,true);assert.equal(c.sourceUnchanged,true);assert.equal(c.execution.exitCode,0);assert.equal(c.execution.timedOut,false);
 assert.deepEqual(c.counts,{tests:676,pass:674,fail:0,cancelled:0,skipped:2});
 assert.equal(n.topologyVerified,true);assert.equal(n.source.sourceUnchanged,true);
 assert.equal(n.source.harnessSha256,sha(await read('scripts/test-control-installer-nonroot-topology.mjs')));
 for(const k of ['effectiveCapabilitiesZero','readOnlySourceMount','sourceHashVerified','actualCliHelpVerified','privateOwnedFileVerified',
  'actualBadModeDenied','actualSymlinkDenied','componentHardlinkDenied','actualSyncRenameDirectorySync','outsideCanaryUnchanged','sourceWriteDenied'])assert.equal(n.fixture[k],true);
 assert.equal(n.fixture.uid,10001);assert.equal(n.fixture.gid,10001);
 assert.deepEqual(n.fixture.privateInputCounts,{tests:3,pass:3,fail:0,skipped:0});
 for(const k of ['businessCliFlowVerified','IF14Verified','realVolumeFaultsVerified'])assert.equal(n.fixture[k],false);
 assert.equal(b.verified,true);assert.equal(b.execution.terminalExitCode,0);assert.equal(b.execution.cleaned,true);
 assert.equal(b.execution.diagnosticOnly,true);assert.equal(b.execution.fullIntegratedCandidate,false);
 assert.equal(b.source.verifiedAtEnd,true);assert.equal(b.source.businessMigrations.count,584);
 assert.equal(b.source.schemaBefore,b.source.schemaAfter);assert.equal(b.controls.total,382);assert.equal(b.controls.checks.length,382);
 assert.ok(b.controls.checks.every(x=>x.passed));const installer=b.controls.nativeCredentials.installerCli;
 assert.equal(installer.checks.length,120);assert.equal(installer.filesystemKills.kills.length,4);
 assert.deepEqual(installer.filesystemKills.groups,['IF12']);
 assert.equal(installer.filesystemKills.nonrootPermissionsVerified,false);assert.equal(installer.filesystemKills.realVolumeFaultsVerified,false);
 assert.equal(installer.fullFaultMatrixVerified,false);assert.equal(installer.runtimeMountReloadVerified,false);
 const currentScopedProof={controlTests:c.counts,nonrootPrivateInputTests:n.fixture.privateInputCounts,nativeControls:b.controls.total,
  fullIntegratedCandidate:false,IF14Verified:false,IF15Verified:false,
  packets:await Promise.all(Object.entries(currentPaths).map(async([kind,path])=>({kind,path,sha256:sha(await read(path))})))};
 checks.push('294-file-current-control-native-and-nonroot-private-file-scopes-only-no-release-acceptance');

 const ledger=await json(protectedFiles[0].path),matrixPath='artifacts/roomqc-vps-signup-acceptance-execution-plan-2026-10-28.json',matrix=await json(matrixPath);
 assert.equal(ledger.tasks.length,25);assert.equal(ledger.packages.length,27);assert.equal(ledger.acceptanceCases.length,70);assert.equal(matrix.waves.length,8);
 for(const row of [...ledger.tasks,...ledger.packages,...ledger.acceptanceCases])assert.equal(row.releaseAcceptance,'unverified');
 const tk=['id','title','dependsOn','packageIds','caseIds','requiredEnvironments','ownerRole','reviewerRole'];
 const ck=['id','scenario','expected','taskIds','requiredEnvironments'];
 assert.deepEqual(matrix.tasks.map(r=>project(r,tk)),ledger.tasks.map(r=>project(r,tk)));
 assert.deepEqual(matrix.cases.map(r=>project(r,ck)),ledger.acceptanceCases.map(r=>project(r,ck)));
 const tasks=new Map(ledger.tasks.map(t=>[t.id,t])),active=new Set(),done=new Set();
 function visit(id){assert.ok(tasks.has(id)&&!active.has(id),'DEPENDENCY_MISSING_OR_CYCLIC');if(done.has(id))return;active.add(id);tasks.get(id).dependsOn.forEach(visit);active.delete(id);done.add(id)}
 tasks.forEach(t=>visit(t.id));assert.equal(done.size,25);
 checks.push('eight-waves-25-tasks-27-packages-and-original-dependency-expected-definitions-match');

 assert.equal(matrix.executionRows.length,124);const pairs=matrix.executionRows.map(r=>r.caseId+':'+r.environment);
 assert.equal(new Set(pairs).size,124);
 assert.deepEqual(pairs.slice().sort(),ledger.acceptanceCases.flatMap(c=>c.requiredEnvironments.map(e=>c.id+':'+e)).sort());
 for(const row of matrix.executionRows){assert.equal(row.executionStatus,'not_run');assert.equal(row.actual,null);assert.equal(row.exitCode,null);assert.equal(row.reviewer,null);assert.equal(row.signoff,null)}
 const environments=Object.fromEntries(['local','staging','pilot'].map(e=>[e,matrix.executionRows.filter(r=>r.environment===e).length]));
 assert.deepEqual(environments,{local:54,staging:69,pilot:1});assert.equal(matrix.productAccepted,false);assert.equal(matrix.goalComplete,false);assert.equal(matrix.deploymentAuthorizedByThisArtifact,false);
 assert.deepEqual(matrix.gates,ledger.gates.map(r=>project(r,['id','label','decision'])));
 checks.push('all-124-environment-pairs-stay-not-run-and-no-product-signoff-or-gate-was-created');

 const texts=await Promise.all(documents.map(p=>readFile(resolve(root,p),'utf8'))),master=texts[0],blueprint=texts.at(-1);
 for(let i=0;i<10;i++){assert.ok(texts[i].includes(draftSha));assert.ok(texts[i].includes('Trạng thái triển khai hiện tại'));assert.ok(texts[i].includes('roomqc-vps-signup-deployment-blueprint-2026-10-28.md'))}
 for(const task of ledger.tasks){
  // Read the dependency line directly after the task heading, not later task prose.
  const start=master.indexOf('### '+task.id+' —');assert.ok(start>=0,'TASK_SECTION_MISSING');
  const firstLine=master.slice(start).split('\n').slice(0,4).find(line=>line.startsWith('- **Phụ thuộc:**'));
  assert.ok(firstLine,'TASK_DEPENDENCY_LINE_MISSING');
  const dependencyText=firstLine.split('**Nhận:**')[0];
  assert.deepEqual([...dependencyText.matchAll(/T\d{2}/g)].map(m=>m[0]),task.dependsOn,'TASK_DOCUMENT_DEPENDENCY_DRIFT');
 }
 assert.deepEqual([...blueprint.matchAll(/^\| \*\*BG(\d{2})/gm)].map(m=>'BG'+m[1]),Array.from({length:11},(_,i)=>'BG'+String(i+1).padStart(2,'0')));
 for(let i=1;i<=10;i++)assert.match(blueprint,new RegExp('\\| Q'+String(i).padStart(2,'0')+' \\|'));
 assert.ok(blueprint.includes(draftSha)&&blueprint.includes(historicalSha)&&blueprint.includes('currentCandidateVerified=false'));
 checks.push('25-task-dependency-lines-11-handoffs-and-ten-input-decisions-are-documented');

 const contract=await json('server/control/contracts/control-v3.openapi.json');
 for(const path of ['/admin/backups','/admin/workspaces/{id}/tenant-summary'])assert.equal(contract.paths[path].get['x-implementation'],'planned');
 assert.equal(contract.paths['/signup-intents'].post['x-implementation'],'implemented-foundation');
 assert.equal(contract.paths['/admin/clusters/register'].post['x-implementation'],'implemented-local');
 assert.equal(contract.paths['/admin/workspaces/{id}/recheck'].post['x-implementation'],'implemented-foundation');
 checks.push('api-inventory-preserves-planned-versus-foundation-status');

 let links=0;const anchorCache=new Map();
 for(let i=0;i<documents.length;i++){
  assert.ok(!/(?:postgres(?:ql)?:\/\/[^\s]+|\bre_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)/.test(texts[i]),'PUBLIC_DOC_SECRET_PATTERN');
  for(const m of texts[i].replace(/```[\s\S]*?```/g,'').matchAll(/(?<!!)\[[^\]\n]+\]\(([^)\s]+)\)/g)){
   if(/^[a-z][a-z0-9+.-]*:/i.test(m[1]))continue;
   const [part,fragment]=m[1].split('#'),target=part?resolve(root,dirname(documents[i]),decodeURIComponent(part)):resolve(root,documents[i]);
   const rel=relative(root,target);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel),'LINK_OUTSIDE_WORKSPACE');
   const info=await lstat(target);assert.ok(info.isFile()&&!info.isSymbolicLink(),'LINK_TARGET_NOT_REGULAR_FILE');
   if(fragment){if(!anchorCache.has(target))anchorCache.set(target,anchors(await readFile(target,'utf8')));assert.ok(anchorCache.get(target).has(decodeURIComponent(fragment)),'ANCHOR_MISSING_'+m[1])}links++;
  }
 }
 checks.push('twelve-planning-and-scope-report-documents-have-resolving-links-anchors-and-no-secret-patterns');
 assertBackendSourceBinding(source,await captureBackendSourceBinding(root));
 for(const f of protectedFiles)assert.equal(sha(await read(f.path)),f.sha256);
 const result={version:1,type:'vps_signup_plan_current_audit',recordedAtUtc:new Date().toISOString(),planStructureVerified:true,
  currentCandidate:{backendFiles:294,sha256:source.sha256,sourceUnchanged:true,currentCandidateVerified:false},
  historicalCheckpoint:{backendFiles:291,sha256:historicalSha,onlyHistoricalSourceVerified:true,
   packets:await Promise.all(Object.entries(packets).map(async([kind,path])=>({kind,path,sha256:sha(await read(path))})))},
  currentScopedProof,
  counts:{waves:8,tasks:25,packages:27,cases:70,environmentPairs:124,environments,handoffs:11,inputDecisions:10},
  checks,linksChecked:links,documents:documents.map((path,i)=>({path,sha256:sha(texts[i])})),protectedArtifacts:protectedFiles,
  execution:{readOnly:true,productTestsRun:false,databaseConnections:0,dockerCommands:0},
  acceptance:{productAccepted:false,goalComplete:false,gatesChanged:false,casesNotRun:70,releaseUnverified:122,reviewer:null,signoff:null}};
 if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({planStructureVerified:true,checks:checks.length,linksChecked:links,currentCandidateVerified:false,productAccepted:false,...(output?{output:relative(root,output).replaceAll('\\','/')}:{})}));
}catch(error){console.error(JSON.stringify({planStructureVerified:false,code:error.code??'PLAN_HANDOFF_ASSERTION_FAILED',reason:typeof error.message==='string'?error.message.split('\n')[0]:'SAFE_AUDIT_FAILURE',currentCandidateVerified:false}));process.exitCode=1}
