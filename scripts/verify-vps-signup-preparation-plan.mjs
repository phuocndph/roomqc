import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,lstat,realpath,writeFile} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureBackendSourceBinding} from './control-backend-source-binding.mjs';

// Preparation audit only. No child process, Docker, application/DB connection,
// secret/config discovery, product test, acceptance mutation, or gate decision.
const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=p=>readFile(resolve(root,p));
const json=async p=>JSON.parse(await bytes(p));
const snapshotPath='artifacts/roomqc-vps-signup-acceptance-execution-plan-2026-10-28.json';
const historicalPath='artifacts/roomqc-setup-publication-native-148610a4b66c-local-2026-10-28.json';
const protectedFiles=[
 {path:'artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json',sha256:'612a518c9cf533beb0a39e7fcf47465644b2224dfb7ddb2bcb29f82005164c63'},
 {path:'docs/architecture/08-ops/roomqc-vps-signup-acceptance-worksheet-2026-10-22.md',sha256:'e5df481be5264aa445165ea0ffb5541ceb7764d24193913654e2730699bd03a7'}
];
const documents=[
 'docs/architecture/08-ops/roomqc-vps-signup-implementation-board-2026-10-28.md',
 'docs/architecture/08-ops/roomqc-vps-signup-master-plan-2026-10-28.md',
 'docs/architecture/08-ops/roomqc-vps-signup-master-acceptance-2026-10-28.md'
];
const pointers=[
 'roomqc-vps-signup-next-delivery-2026-10-28.md','roomqc-vps-signup-start-pack-2026-10-28.md',
 'roomqc-vps-signup-handoff-2026-10-28.md','roomqc-vps-signup-plan-current-2026-10-26.md','roomqc-vps-signup-progress.md'
].map(p=>'docs/architecture/08-ops/'+p);
const expectedBackend='c61f3f7829c043b25268e2b5f72479f61191e428b868ab1e1f143f794790b0af';
const expectedHistorical='33d8482f5c9e784d8d54cfce29ebf33a0f0d47ab66e6df9f993c074a7afcf7d9';
const same=(a,b)=>assert.deepEqual(a,b);
const unique=values=>assert.equal(new Set(values).size,values.length);
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};
const projection=(row,keys)=>Object.fromEntries(keys.map(k=>[k,row[k]]));
const chain=async names=>{
 const h=createHash('sha256');
 for(const name of names)h.update(name+'\0'+(await readFile(resolve(root,'supabase/migrations',name),'utf8')).replace(/\r\n/g,'\n')+'\0');
 return {count:names.length,sha256:h.digest('hex')};
};
const anchors=markdown=>{
 const counts=new Map();return new Set([...markdown.replace(/```[\s\S]*?```/g,'').matchAll(/^#{1,6}\s+(.+)$/gm)].map(m=>{
  const slug=m[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu,'').replace(/\s/g,'-');
  const n=counts.get(slug)??0;counts.set(slug,n+1);return n?slug+'-'+n:slug;
 }));
};

try{
 const args=process.argv.slice(2);let output=null;
 if(args.length===1&&args[0]==='--help'){
  console.log('Read-only preparation audit; no product tests or deployment. node scripts/verify-vps-signup-preparation-plan.mjs [--output <new absolute artifacts/*.json>]');process.exit(0);
 }
 assert.ok(args.length===0||args.length===2&&args[0]==='--output','PREPARATION_ARGUMENT_INVALID');
 if(args.length){
  assert.ok(isAbsolute(args[1]));output=resolve(args[1]);
  assert.equal(dirname(output),await realpath(resolve(root,'artifacts')));
  assert.match(basename(output),/^[a-z0-9][a-z0-9._-]*\.json$/);
 }
 for(const item of protectedFiles)assert.equal(sha(await bytes(item.path)),item.sha256,'ACCEPTANCE_SOURCE_CHANGED');
 checks.push('protected-ledger-and-worksheet-unchanged');
 const snapshotSha256=sha(await bytes(snapshotPath));
 const ledger=await json(protectedFiles[0].path),plan=await json(snapshotPath),historical=await json(historicalPath);
 const texts=await Promise.all(documents.map(p=>readFile(resolve(root,p),'utf8'))),board=texts[0],master=texts[1];
 const docHashes=documents.map((path,i)=>({path,sha256:sha(texts[i])}));
 check('25-tasks-27-packages-8-waves-and-original-dependencies',()=>{
  assert.equal(ledger.tasks.length,25);assert.equal(ledger.packages.length,27);assert.equal(plan.waves.length,8);
  unique(ledger.tasks.map(t=>t.id));unique(ledger.packages.map(t=>t.id));
  const keys=['id','title','dependsOn','packageIds','caseIds','requiredEnvironments','ownerRole','reviewerRole'];
  same(plan.tasks.map(t=>projection(t,keys)),ledger.tasks.map(t=>projection(t,keys)));
  same([...master.matchAll(/^### (T[0-9]{2}) —/gm)].map(m=>m[1]),ledger.tasks.map(t=>t.id));
  const visiting=new Set(),visited=new Set(),tasks=new Map(ledger.tasks.map(t=>[t.id,t]));
  const visit=id=>{assert.ok(tasks.has(id));assert.ok(!visiting.has(id));if(visited.has(id))return;
   visiting.add(id);tasks.get(id).dependsOn.forEach(visit);visiting.delete(id);visited.add(id);};
  ledger.tasks.forEach(t=>visit(t.id));assert.equal(visited.size,25);
  const waved=plan.waves.flatMap(w=>w.taskIds);unique(waved);same(waved.slice().sort(),[...tasks.keys()].sort());
  const wave=new Map(plan.waves.flatMap(w=>w.taskIds.map(id=>[id,w.wave])));
  for(const task of tasks.values())for(const dep of task.dependsOn)assert.ok(wave.get(dep)<=wave.get(task.id));
 });
 check('70-case-definitions-and-all-124-environments-remain-planned',()=>{
  assert.equal(ledger.acceptanceCases.length,70);
  const keys=['id','scenario','expected','taskIds','requiredEnvironments'];
  same(plan.cases.map(t=>projection(t,keys)),ledger.acceptanceCases.map(t=>projection(t,keys)));
  const expected=ledger.acceptanceCases.flatMap(c=>c.requiredEnvironments.map(e=>c.id+':'+e));unique(expected);
  const observed=plan.executionRows.map(c=>c.caseId+':'+c.environment);unique(observed);same(observed.slice().sort(),expected.slice().sort());
  assert.equal(observed.length,124);const counts={local:0,staging:0,pilot:0};
  for(const row of plan.executionRows){
   counts[row.environment]++;assert.equal(row.executionStatus,'not_run');
   for(const key of ['exactCommand','datasetRef','targetRef','sourceRef','runner','reviewer','actual','exitCode','signoff'])assert.equal(row[key],null);
   same(row.evidence,[]);same(row.defects,[]);
  }
  same(counts,{local:54,staging:69,pilot:1});
 });
 check('no-acceptance-signoff-or-gate-advanced',()=>{
  const entries=[...ledger.tasks,...ledger.packages,...ledger.acceptanceCases];assert.equal(entries.length,122);
  entries.forEach(row=>assert.equal(row.releaseAcceptance,'unverified'));
  ledger.acceptanceCases.forEach(row=>{same(row.evidence,[]);same(row.defects,[]);});
  same(plan.acceptanceState,{casesNotRun:70,releaseEntriesUnverified:122,changed:false});
  same(plan.gates,ledger.gates.map(g=>projection(g,['id','label','decision'])));
  for(const key of ['productAccepted','goalComplete','deploymentAuthorizedByThisArtifact'])assert.equal(plan[key],false);
  for(const key of ['reviewer','signoff'])assert.equal(plan[key],null);
 });
 const current=await captureBackendSourceBinding(root),before=new Map(historical.source.backend.files.map(x=>[x.path,x.sha256]));
 const after=new Map(current.files.map(x=>[x.path,x.sha256]));
 const delta={added:current.files.filter(x=>!before.has(x.path)).map(x=>x.path),
  changed:current.files.filter(x=>before.has(x.path)&&before.get(x.path)!==x.sha256).map(x=>x.path),
  removed:historical.source.backend.files.filter(x=>!after.has(x.path)).map(x=>x.path)};
 check('current-draft-distinguished-from-historical-test-source',()=>{
  assert.equal(current.files.length,284);assert.equal(current.sha256,expectedBackend);
  assert.equal(historical.source.backend.files.length,281);assert.equal(historical.source.backend.sha256,expectedHistorical);
  assert.notEqual(current.sha256,historical.source.backend.sha256);
  same(delta.added,['scripts/control-setup-credential.mjs','server/control/migrations/0019-setup-credential-observer.sql','server/control/setup-credential-installer.mjs']);
  same(delta.changed,['scripts/control-backend-source-binding.mjs']);same(delta.removed,[]);
  assert.equal(historical.verified,true);assert.equal(historical.execution.terminalExitCode,0);
  assert.equal(historical.controls.total,262);assert.equal(historical.controls.nativeCredentials.publication.checks.length,18);
  assert.equal(historical.controls.nativeCredentials.publication.kills.length,4);
  assert.equal(historical.controls.nativeCredentials.installerCliVerified,false);
  assert.equal(historical.controls.nativeCredentials.rotationDaemonVerified,false);
  assert.ok(board.includes(current.sha256)&&board.includes(expectedHistorical));
  assert.ok(board.includes('Chưa có native/regression packet cho source này'));
 });
 const migrationFiles=(await readdir(resolve(root,'supabase/migrations'))).filter(x=>x.endsWith('.sql')).sort();
 const businessMigrations=await chain(migrationFiles),newBusiness='20261028101638_setup_credential_target_preflight.sql';
 const directoryFiles=(await readdir(resolve(root,'server/control/migrations'))).filter(x=>x.endsWith('.sql')).sort();
 assert.equal(migrationFiles.at(-1),newBusiness);
 same(await chain(migrationFiles.slice(0,-1)),historical.source.businessMigrations);
 check('584-and-19-are-inventory-only-previous-migration-chain-preserved',()=>{
  assert.equal(businessMigrations.count,584);assert.equal(directoryFiles.length,19);
  assert.equal(directoryFiles.at(-1),'0019-setup-credential-observer.sql');
  const old=historical.source.backend.files.filter(x=>/^server\/control\/migrations\//.test(x.path));assert.equal(old.length,18);
  for(const file of old)assert.equal(after.get(file.path),file.sha256);
 });
 check('11-deliveries-first-five-sessions-and-whole-operating-scope',()=>{
  const rows=[...board.matchAll(/^\| (\d+)\. /gm)];same(rows.map(m=>Number(m[1])),[1,2,3,4,5,6,7,8,9,10,11]);
  for(const session of ['A. Review','B. Migration','C. CLI','D. Gián đoạn','E. Hồi quy'])assert.ok(board.includes('| '+session));
  for(const token of ['Auth→directory','rotation','quota','offsite','Android','SIGKILL','1.000 metadata','người trực','123 lượt','G08','≥7 ngày'])
   assert.ok(board.includes(token),'MISSING_SCOPE_'+token);
  assert.ok(board.includes('Chưa cam kết ngày mở public'));assert.ok(board.includes('chưa là SLA'));
 });
 let links=0,anchorCount=0;
 for(let i=0;i<documents.length;i++){
  const clean=texts[i].replace(/```[\s\S]*?```/g,'');
  for(const m of clean.matchAll(/(?<!!)\[[^\]\n]+\]\(([^)\s]+)\)/g)){
   const href=m[1];if(/^[a-z][a-z0-9+.-]*:/i.test(href))continue;
   const [part,fragment]=href.split('#'),target=part?resolve(root,dirname(documents[i]),decodeURIComponent(part)):resolve(root,documents[i]);
   const rel=relative(root,target);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel),'LINK_OUTSIDE_REPOSITORY');
   assert.ok((await lstat(target)).isFile(),'LINK_TARGET_NOT_FILE');assert.ok(!(await lstat(target)).isSymbolicLink());links++;
   if(fragment){assert.ok(anchors(await readFile(target,'utf8')).has(decodeURIComponent(fragment)),'ANCHOR_NOT_FOUND_'+href);anchorCount++;}
  }
 }
 checks.push('primary-document-links-and-anchors-resolve');
 for(const p of pointers){const body=await readFile(resolve(root,p),'utf8');assert.ok(body.includes('**Điểm nhận việc hiện tại — có nháp chưa kiểm:**'));
  assert.ok(body.includes('roomqc-vps-signup-implementation-board-2026-10-28.md'));assert.ok(body.includes(expectedBackend));}
 checks.push('five-entry-points-reference-current-unverified-draft');
 for(const t of texts)assert.ok(!/(?:postgres(?:ql)?:\/\/[^\s]+|\bre_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)/.test(t),'SECRET_PATTERN');
 checks.push('new-primary-document-secret-pattern-scan');
 const final=await captureBackendSourceBinding(root);same(final,current);
 for(const item of protectedFiles)assert.equal(sha(await bytes(item.path)),item.sha256);
 assert.equal(sha(await bytes(snapshotPath)),snapshotSha256);
 for(const item of docHashes)assert.equal(sha(await bytes(item.path)),item.sha256);
 checks.push('end-source-protected-files-and-documents-unchanged-during-audit');
 const report={version:1,type:'vps_signup_preparation_plan_review',recordedAtUtc:new Date().toISOString(),scope:'whole_vps_and_signup',requestedOutput:'plan_and_acceptance',
  planningChecksPassed:true,checks,counts:{waves:8,tasks:25,packages:27,cases:70,requiredCaseEnvironmentPairs:124,local:54,staging:69,pilot:1,deliveries:11,firstDeliverySessions:5},
  sourceInventory:{backend:current,businessMigrations,directoryMigrations:directoryFiles.length,classification:'unverified_draft',productTestsRunForThisSourceByThisAudit:false},
  historicalEvidence:{path:historicalPath,sha256:sha(await bytes(historicalPath)),backendSha256:expectedHistorical,backendFiles:281,businessMigrations:583,directoryMigrations:18,controls:262,appliesToCurrentBackend:false},
  sourceDeltaFromHistorical:delta,newUnverifiedBusinessMigration:{path:'supabase/migrations/'+newBusiness,sha256:sha(await bytes('supabase/migrations/'+newBusiness))},
  protectedArtifacts:protectedFiles,executionPlan:{path:snapshotPath,sha256:sha(await bytes(snapshotPath))},documents:docHashes,links:{checked:links,anchorsChecked:anchorCount},
  execution:{readOnly:true,applicationConnections:0,databaseConnections:0,dockerCommands:0,productTestsRun:false,servingMigrationsRun:false,flagsChanged:false},
  acceptance:{casesNotRun:70,releaseEntriesUnverified:122,reviewer:null,signoff:null,gatesChanged:false,productAccepted:false,goalComplete:false}};
 if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});
 console.log(JSON.stringify({planningChecksPassed:true,checks:checks.length,links,anchors:anchorCount,counts:report.counts,currentBackendVerified:false,productAccepted:false,...(output?{output:relative(root,output).replaceAll('\\','/')}:{})}));
}catch(error){console.error(JSON.stringify({planningChecksPassed:false,code:error.code??'PREPARATION_ASSERTION_FAILED',message:error.message}));process.exitCode=1;}
