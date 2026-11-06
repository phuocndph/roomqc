// Read-only relative to runtime. Verifies a planning snapshot and recorded
// evidence claims, never product acceptance or current runtime health.
import assert from 'node:assert/strict';
import {readFile, writeFile, lstat, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureBackendSourceBinding, assertBackendSourceBinding} from './control-backend-source-binding.mjs';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const base = 'docs/architecture/08-ops/';
const checklistPath = 'artifacts/roomqc-vps-signup-execution-checklist-r4-2026-10-29.json';
const auditPath = 'artifacts/roomqc-vps-signup-execution-plan-audit-r4-2026-10-29.json';
const verifierPath = 'scripts/verify-vps-signup-plan-checkpoint-r4.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFile(resolve(root, path));
const json = async path => JSON.parse(await read(path));
const digest = async path => ({path, sha256: sha(await read(path))});
const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row[key]]));
const protectedFiles = [
  {path:'artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json', sha256:'612a518c9cf533beb0a39e7fcf47465644b2224dfb7ddb2bcb29f82005164c63'},
  {path:base+'roomqc-vps-signup-acceptance-worksheet-2026-10-22.md', sha256:'e5df481be5264aa445165ea0ffb5541ceb7764d24193913654e2730699bd03a7'}
];
const documents = ['master-plan-2026-10-28', 'master-acceptance-2026-10-28',
  'deployment-blueprint-2026-10-28', 'implementation-board-2026-10-28',
  'next-delivery-2026-10-28', 'start-pack-2026-10-28', 'handoff-2026-10-28',
  'progress', 'plan-current-2026-10-26', 'repair-review-r3-2026-10-29'
].map(name => base+'roomqc-vps-signup-'+name+'.md');
const packetPaths = {
  backend:'artifacts/roomqc-backend-independent-rebuild-afe3e00ebfa2-local-2026-10-29.json',
  filesystem:'artifacts/roomqc-backend-installer-filesystem-f9b57c8fb3f6-local-2026-10-29.json',
  restore:'artifacts/roomqc-backup-restore-rehearsal-9f03b89d7f0f-local-2026-10-29.json',
  control:'artifacts/roomqc-workspace-recheck-838f5f251a47-local-2026-10-29.json'
};
const historicalPaths = [
  'artifacts/roomqc-vps-signup-execution-plan-audit-r3-2026-10-29.json',
  'artifacts/roomqc-vps-signup-execution-checklist-r3-2026-10-29.json'
];
const anchors = markdown => {
  const values = new Set([...markdown.matchAll(/<a\s+id="([^"]+)"/g)].map(m => m[1]));
  const counts = new Map();
  for (const m of markdown.replace(/```[\s\S]*?```/g, '').matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const slug = m[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
    const n = counts.get(slug) ?? 0;
    counts.set(slug, n+1); values.add(n ? slug+'-'+n : slug);
  }
  return values;
};

const args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 1 && ['--publish','--help'].includes(args[0]), 'ARGUMENTS_INVALID');
if (args[0] === '--help') {
  console.log('Default: verify immutable r4 planning audit. --publish: create it once after all checks. No DB, Docker, product tests or gates.');
  process.exit(0);
}
const publish = args[0] === '--publish';
const source = await captureBackendSourceBinding(root);
assert.equal(source.sha256, 'ede96ea6b5bf568785209ffd5d87ddbb06674d87cbfd2322c5015f342e98bca7', 'SOURCE_DRIFT');
assert.equal(source.files.length, 301);
for (const f of protectedFiles) assert.equal(sha(await read(f.path)), f.sha256, 'PROTECTED_ACCEPTANCE_CHANGED');
const historicalBefore = await Promise.all(historicalPaths.map(digest));
const [ledger, c] = await Promise.all([json(protectedFiles[0].path), json(checklistPath)]);
const counts = {waves:8,tasks:25,packages:27,cases:70,requiredCaseEnvironmentPairs:124,
  byEnvironment:{local:54,staging:69,pilot:1},handoffs:11};
assert.deepEqual(c.counts, counts);
assert.equal(c.scope, 'whole_vps_and_signup'); assert.equal(c.requestedOutput, 'plan_and_acceptance');
assert.equal(ledger.tasks.length,25); assert.equal(ledger.packages.length,27); assert.equal(ledger.acceptanceCases.length,70);
assert.equal(c.tasks.length,25); assert.equal(c.cases.length,70); assert.equal(c.waves.length,8); assert.equal(c.handoffs.length,11);
const taskKeys = ['id','title','dependsOn','packageIds','caseIds','requiredEnvironments','ownerRole','reviewerRole'];
const caseKeys = ['id','scenario','expected','taskIds','requiredEnvironments'];
assert.deepEqual(c.tasks.map(t=>pick(t,taskKeys)), ledger.tasks.map(t=>pick(t,taskKeys)));
assert.deepEqual(c.cases.map(t=>pick(t,caseKeys)), ledger.acceptanceCases.map(t=>pick(t,caseKeys)));
assert.deepEqual(c.waves.flatMap(w=>w.taskIds).sort(), ledger.tasks.map(t=>t.id).sort());
const tasks = new Map(c.tasks.map(t=>[t.id,t])), active = new Set(), done = new Set();
function visit(id) {
  assert.ok(tasks.has(id) && !active.has(id), 'TASK_DEPENDENCY_MISSING_OR_CYCLIC');
  if (done.has(id)) return;
  active.add(id); tasks.get(id).dependsOn.forEach(visit); active.delete(id); done.add(id);
}
c.tasks.forEach(t=>visit(t.id)); assert.equal(done.size,25);
const packages = new Map(ledger.packages.map(p=>[p.id,p]));
const cases = new Map(c.cases.map(t=>[t.id,t]));
for (const t of c.tasks) {
  for (const p of t.packageIds) assert.ok(packages.get(p)?.taskIds.includes(t.id), 'TASK_PACKAGE_MAPPING');
  for (const id of t.caseIds) assert.ok(cases.get(id)?.taskIds.includes(t.id), 'TASK_CASE_MAPPING');
}
for (const p of ledger.packages) for (const t of p.taskIds) assert.ok(tasks.get(t)?.packageIds.includes(p.id));
for (const ca of c.cases) for (const t of ca.taskIds) assert.ok(tasks.get(t)?.caseIds.includes(ca.id));
assert.equal(c.executionRows.length,124);
const pairs = c.executionRows.map(r=>r.caseId+':'+r.environment).sort();
assert.equal(new Set(pairs).size,124);
assert.deepEqual(pairs, c.cases.flatMap(ca=>ca.requiredEnvironments.map(e=>ca.id+':'+e)).sort());
for (const row of c.executionRows) {
  assert.equal(row.executionStatus,'not_run'); assert.equal(row.expected,cases.get(row.caseId).expected);
  for (const key of ['actual','exitCode','runner','reviewer','signoff','reviewDecision']) assert.equal(row[key],null);
  assert.deepEqual(row.evidence,[]);
}
assert.deepEqual(Object.fromEntries(['local','staging','pilot'].map(e=>[e,c.executionRows.filter(r=>r.environment===e).length])),counts.byEnvironment);
assert.equal([...ledger.tasks,...ledger.packages,...ledger.acceptanceCases].filter(r=>r.releaseAcceptance==='unverified').length,122);
assert.deepEqual(c.gates.map(g=>pick(g,['id','label','decision'])),ledger.gates.map(g=>pick(g,['id','label','decision'])));
for (const key of ['productAccepted','goalComplete','gatesChanged']) assert.equal(c.acceptance[key],false);
assert.equal(c.acceptance.reviewer,null); assert.equal(c.acceptance.signoff,null);
assert.equal(c.acceptanceState.casesNotRun,70); assert.equal(c.acceptanceState.releaseEntriesUnverified,122);
assert.equal(c.acceptanceState.changed,false); assert.equal(c.evidenceIsolation.otherCheckoutResultsIncluded,false);
assert.equal(c.execution.productTestsRun,false); assert.equal(c.execution.databaseConnections,0);
assert.equal(c.execution.dockerCommands,0); assert.equal(c.execution.deployed,false);

let implementationMin=0, implementationMax=0, verificationMin=0, verificationMax=0;
const handoffs = new Set();
for (const [index,h] of c.handoffs.entries()) {
  assert.equal(h.id,'BG'+String(index+1).padStart(2,'0'));
  assert.ok(h.deliveryPrerequisites.every(id=>handoffs.has(id)), 'HANDOFF_DEPENDENCY'); handoffs.add(h.id);
  assert.ok(h.taskIds.every(id=>tasks.has(id)));
  for (const key of ['assignedOwner','assignedReviewer','actual','reviewDecision','signoff']) assert.equal(h[key],null);
  const b=h.planningBudget; assert.equal(b.measuredEstimate,false); assert.equal(b.calendarWaitExcluded,true);
  implementationMin+=b.implementation.min; implementationMax+=b.implementation.max;
  verificationMin+=b.verificationReview.min; verificationMax+=b.verificationReview.max;
}
assert.deepEqual([implementationMin,implementationMax,verificationMin,verificationMax],[20,36,18.5,32]);
assert.deepEqual(c.remainingEffort.total,{min:implementationMin+verificationMin,max:implementationMax+verificationMax});
assert.equal(c.remainingEffort.minimumPilotCalendarDays,7); assert.equal(c.remainingEffort.committedDeliveryDate,null);

const packets = Object.fromEntries(await Promise.all(Object.entries(packetPaths).map(async ([id,path])=>[id,await json(path)])));
for (const p of Object.values(packets)) {
  assert.equal(p.verified,true);
  for (const key of ['productAccepted','gatesChanged']) assert.equal(p.acceptance[key],false);
  assert.equal(p.acceptance.reviewer,null); assert.equal(p.acceptance.signoff,null);
}
for (const p of [packets.backend,packets.filesystem,packets.restore]) assert.equal(p.acceptance.goalComplete,false);
// The older control packet omits this field; it cannot grant goal completion.
assert.equal('goalComplete' in packets.control.acceptance,false);
for (const p of [packets.backend,packets.filesystem]) {
  assert.equal(p.source.backend.sha256,source.sha256); assert.equal(p.source.backend.fileCount,301);
  assert.equal(p.source.backend.verifiedAtEnd,true); assert.equal(p.source.backend.unchanged,true);
  assert.equal(p.execution.worktreePath,'roomqc-worktrees/integration');
  assert.equal(p.execution.terminalExitCode,0); assert.equal(p.execution.cleaned,true); assert.equal(p.execution.timedOut,false);
  assert.equal(p.source.schemaBefore,p.source.schemaAfter); assert.equal(p.source.businessMigrations.count,584);
  for (const key of ['containers','volumes','networks']) assert.equal(p.cleanup[key],0);
}
assert.equal(packets.backend.execution.fullIntegratedRun,true); assert.equal(packets.backend.execution.diagnosticOnly,false);
assert.equal(packets.backend.execution.phase,'permission_controls_verified');
assert.ok(packets.backend.controlFamilies.every(f=>f.verified===true));
assert.equal(packets.backend.coverage.localIntegratedRebuild,true);
for (const key of ['browserAndroid','linuxVps','offsiteRestore','externalEmailProvider','loadSoak','pilot','signupProduction']) assert.equal(packets.backend.coverage[key],false);
const fs=packets.filesystem.installer;
assert.equal(packets.filesystem.execution.diagnosticOnly,true); assert.equal(fs.checkCount,181);
assert.equal(fs.filesystemKills.cases,4); assert.equal(fs.nonrootPermissions.cases,49); assert.equal(fs.volumeFaults.cases,11);
assert.deepEqual(fs.faultGroupsVerified,Array.from({length:17},(_,i)=>'IF'+String(i+1).padStart(2,'0')));
assert.equal(fs.fullFaultMatrixVerified,false); assert.equal(fs.filesystemKills.runtimeReadOnlyMountReloadVerified,false);
assert.equal(fs.volumeFaults.hardwareDiskDurabilityVerified,false);
assert.equal(fs.cliIdentity.actualCliProcesses,271); assert.equal(fs.cliIdentity.productCliUid,10001);
assert.equal(fs.cliIdentity.capabilitiesZero,true); assert.equal(fs.cliIdentity.readOnlySource,true);
assert.equal(packets.restore.restore.networkMode,'none'); assert.deepEqual(packets.restore.restore.publishedPorts,[]);
assert.equal(packets.restore.restore.inventoryMatch,true); assert.equal(packets.restore.restore.containerRemovedAfterProof,true);
assert.deepEqual(pick(packets.restore.artifacts,['dataTables','policies','constraints','functions']),{dataTables:203,policies:385,constraints:903,functions:460});
assert.equal(packets.restore.artifacts.rolesExportedWithoutPasswords,true);
assert.equal(packets.restore.acceptance.localRestoreProof,true); assert.equal(packets.restore.acceptance.offsiteRestoreProof,false);
assertBackendSourceBinding(source,packets.control.backendSource);
assert.equal(packets.control.execution.exitCode,0);
assert.deepEqual(packets.control.counts,{tests:678,pass:676,fail:0,cancelled:0,skipped:2});
assert.equal(c.currentCandidate.backendIntegratedRebuildVerified,true); assert.equal(c.currentCandidate.fullProductCandidateVerified,false);
for (const key of ['fullFaultMatrixVerified','rotationDaemonVerified','runtimeMountReloadVerified','hardwareDiskDurabilityVerified',
  'linuxVpsVerified','offsiteRestoreVerified','browserAndroidE2EVerified','loadSoakVerified','pilotVerified','restoreBoundToBackendCandidate']) assert.equal(c.currentScopedProof[key],false);

let linksChecked=0, anchorsChecked=0; const textCache=new Map();
for (const path of documents) textCache.set(path,await readFile(resolve(root,path),'utf8'));
const master=textCache.get(documents[0]), blueprint=textCache.get(documents[2]);
for (const t of c.tasks) {
  const start=master.indexOf('### '+t.id+' —'); assert.ok(start>=0,'TASK_SECTION_MISSING');
  const dependencyLine=master.slice(start).split('\n').slice(0,4).find(l=>l.startsWith('- **Phụ thuộc:**'));
  assert.ok(dependencyLine,'TASK_DEPENDENCY_LINE_MISSING');
  assert.deepEqual([...dependencyLine.split('**Nhận:**')[0].matchAll(/T\d{2}/g)].map(m=>m[0]),t.dependsOn);
}
for (let i=1;i<=10;i++) assert.ok(blueprint.includes('| Q'+String(i).padStart(2,'0')+' |'),'DECISION_MISSING');
for (const h of c.handoffs) assert.ok(blueprint.includes('### '+h.id+' —'),'HANDOFF_SECTION_MISSING');
for (const [path,fullText] of textCache) {
  if (!path.includes('repair-review-r3')) {
    assert.ok(fullText.includes(source.sha256)); assert.ok(fullText.includes('execution-checklist-r4-2026-10-29.json'));
  }
  assert.ok(!/(?:postgres(?:ql)?:\/\/[^\s]+|\bre_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)/.test(fullText),'PUBLIC_DOC_SECRET_PATTERN');
  const text=fullText.replace(/```[\s\S]*?```/g,'');
  for (const m of text.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const href=m[1].replace(/^<|>$/g,''); if (/^(?:https?:|mailto:|codex:|data:)/i.test(href)) continue;
    const [file,fragment]=href.split('#'), target=file?resolve(root,dirname(path),decodeURIComponent(file)):resolve(root,path);
    const rel=relative(root,target).replaceAll('\\','/');
    assert.ok(rel && !rel.startsWith('../') && !isAbsolute(rel),'LINK_OUTSIDE_REPOSITORY');
    if (publish && rel===auditPath) {linksChecked++; continue;}
    const info=await lstat(target); assert.ok(info.isFile() || info.isDirectory(),'LINK_TARGET_INVALID'); linksChecked++;
    if (fragment && target.endsWith('.md')) {
      const targetText=textCache.get(rel) ?? await readFile(target,'utf8');
      assert.ok(anchors(targetText).has(decodeURIComponent(fragment)), 'ANCHOR_MISSING '+path+' -> '+href); anchorsChecked++;
    }
  }
}
const snapshot = {
  type:'vps_signup_planning_checkpoint_r4', planStructureVerified:true,
  currentCandidate:{backendFiles:301,sha256:source.sha256,sourceUnchanged:true,backendIntegratedRebuildVerified:true,currentCandidateVerified:false},
  checklist:await digest(checklistPath), counts,
  documents:await Promise.all(documents.map(digest)), verifier:await digest(verifierPath),
  supportingLocalEvidence:await Promise.all(Object.values(packetPaths).map(digest)),
  historicalPlanningArtifacts:historicalBefore, protectedArtifacts:protectedFiles,
  linksChecked,anchorsChecked,
  execution:{productTestsRunByThisPublisher:false,databaseConnections:0,dockerCommands:0,deployed:false,providerOrRuntimeChanged:false},
  acceptance:{productAccepted:false,goalComplete:false,gatesChanged:false,casesNotRun:70,releaseUnverified:122,reviewer:null,signoff:null},
  limits:['Recorded evidence and planning consistency only; this verifier does not re-run product tests or inspect live infrastructure.',
    'Backend rebuild is local sandbox proof. Full product candidate, fault matrix, runtime rotation/reload and all release decisions remain open.',
    'Local DB restore snapshot is independent of backend source binding; not offsite, object bytes or Linux VPS recovery proof.',
    'Results from other checkouts are excluded; no browser/Android/load/pilot or real email acceptance was inferred.']
};
assertBackendSourceBinding(source,await captureBackendSourceBinding(root));
for (const f of protectedFiles) assert.equal(sha(await read(f.path)),f.sha256,'PROTECTED_ACCEPTANCE_CHANGED_AT_END');
assert.deepEqual(await Promise.all(historicalPaths.map(digest)),historicalBefore,'HISTORICAL_ARTIFACT_CHANGED');
if (publish) {
  await writeFile(resolve(root,auditPath),JSON.stringify({version:1,recordedAtUtc:new Date().toISOString(),...snapshot},null,2)+'\n',{flag:'wx'});
} else {
  const audit=await json(auditPath); const {version,recordedAtUtc,...recorded}=audit;
  assert.equal(version,1); assert.ok(Number.isFinite(Date.parse(recordedAtUtc)));
  assert.deepEqual(recorded,snapshot,'PLANNING_SNAPSHOT_DRIFT');
}
console.log(JSON.stringify({verified:true,scope:'plan-and-recorded-local-evidence-only',published:publish,
  backendFiles:301,counts,linksChecked,anchorsChecked,productAccepted:false,gatesChanged:false}));
