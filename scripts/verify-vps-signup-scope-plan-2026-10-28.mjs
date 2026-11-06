// Planning audit only. Reads public evidence/source/docs; no DB, network,
// Docker, subprocess, secret discovery, product test, or acceptance mutation.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,lstat,realpath,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';

const root=await realpath(fileURLToPath(new URL('../',import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=p=>readFile(resolve(root,p));
const json=async p=>JSON.parse(await bytes(p));
const currentSha='9ea2d71349e46d6f853fb6c6efbda3376baab8889a5a10d730c0fa985e49a289';
const verifiedSha='6802f300c3c4232e8e649f039aaf5be285da92f8b0a2116c0308318de3c16e14';
const protectedFiles=[
 {path:'artifacts/roomqc-vps-signup-delivery-ledger-2026-10-21.json',sha256:'612a518c9cf533beb0a39e7fcf47465644b2224dfb7ddb2bcb29f82005164c63'},
 {path:'docs/architecture/08-ops/roomqc-vps-signup-acceptance-worksheet-2026-10-22.md',sha256:'e5df481be5264aa445165ea0ffb5541ceb7764d24193913654e2730699bd03a7'}
];
const matrixPath='artifacts/roomqc-vps-signup-acceptance-execution-plan-2026-10-28.json';
const documentPaths=[
 'roomqc-vps-signup-master-plan-2026-10-28.md',
 'roomqc-vps-signup-master-acceptance-2026-10-28.md',
 'roomqc-vps-signup-implementation-board-2026-10-28.md'
].map(p=>'docs/architecture/08-ops/'+p);
const entryPaths=[
 'roomqc-vps-signup-next-delivery-2026-10-28.md','roomqc-vps-signup-start-pack-2026-10-28.md',
 'roomqc-vps-signup-handoff-2026-10-28.md','roomqc-vps-signup-plan-current-2026-10-26.md','roomqc-vps-signup-progress.md'
].map(p=>'docs/architecture/08-ops/'+p);
const evidencePaths={
 focused:'artifacts/roomqc-setup-installer-transactions-focused-native-883ffcf86d26-local-2026-10-28.json',
 native:'artifacts/roomqc-setup-installer-transactions-native-fed613ef070e-local-2026-10-28.json',
 control:'artifacts/roomqc-workspace-recheck-11397d6033eb-local-2026-10-28.json'
};
const equal=(a,b)=>assert.deepEqual(a,b);
const unique=a=>assert.equal(new Set(a).size,a.length);
const project=(r,keys)=>Object.fromEntries(keys.map(k=>[k,r[k]]));
const checked=[];
const check=(name,fn)=>{fn();checked.push(name)};
const anchors=md=>{
 const counts=new Map();
 return new Set([...md.replace(/```[\s\S]*?```/g,'').matchAll(/^#{1,6}\s+(.+)$/gm)].map(m=>{
  const slug=m[1].trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu,'').replace(/\s/g,'-');
  const n=counts.get(slug)??0;counts.set(slug,n+1);return n?slug+'-'+n:slug;
 }));
};

try{
 const args=process.argv.slice(2);let output;
 if(args.length===1&&args[0]==='--help'){
  console.log('Read-only plan audit, not product tests or acceptance. Optional --output <new absolute artifacts/*.json>.');process.exit(0);
 }
 assert.ok(args.length===0||args.length===2&&args[0]==='--output');
 if(args.length){
  assert.ok(isAbsolute(args[1]));output=resolve(args[1]);
  assert.equal(dirname(output),await realpath(resolve(root,'artifacts')));
  assert.match(basename(output),/^[a-z0-9][a-z0-9._-]*\.json$/);
 }
 for(const f of protectedFiles)assert.equal(sha(await bytes(f.path)),f.sha256);
 checked.push('protected-ledger-and-worksheet-unchanged');
 const matrixBytes=await bytes(matrixPath),matrix=JSON.parse(matrixBytes);
 const ledger=await json(protectedFiles[0].path);
 const documents=await Promise.all(documentPaths.map(p=>readFile(resolve(root,p),'utf8')));
 const [master,acceptance,board]=documents;
 const documentHashes=documentPaths.map((path,i)=>({path,sha256:sha(documents[i])}));
 const entryHashes=[];
 for(const path of entryPaths){
  const text=await readFile(resolve(root,path),'utf8');
  assert.ok(text.includes('**Điểm nhận việc hiện tại — nháp timeout chưa kiểm:**'));
  assert.ok(text.includes(currentSha));assert.ok(text.includes(verifiedSha));
  for(const name of documentPaths)assert.ok(text.includes(basename(name)));
  entryHashes.push({path,sha256:sha(text)});
 }
 checked.push('five-entry-documents-point-to-canonical-plan-and-unverified-draft');
 check('whole-vps-signup-scope-output-and-original-task-graph',()=>{
  assert.equal(matrix.scope,'whole_vps_and_signup');assert.equal(matrix.requestedOutput,'plan_and_acceptance');
  assert.equal(ledger.tasks.length,25);assert.equal(ledger.packages.length,27);assert.equal(matrix.waves.length,8);
  const keys=['id','title','dependsOn','packageIds','caseIds','requiredEnvironments','ownerRole','reviewerRole'];
  equal(matrix.tasks.map(r=>project(r,keys)),ledger.tasks.map(r=>project(r,keys)));
  equal([...master.matchAll(/^### (T[0-9]{2}) —/gm)].map(m=>m[1]),ledger.tasks.map(t=>t.id));
  unique(ledger.tasks.map(t=>t.id));unique(ledger.packages.map(p=>p.id));
  const tasks=new Map(ledger.tasks.map(t=>[t.id,t])),done=new Set(),active=new Set();
  const visit=id=>{assert.ok(tasks.has(id));assert.ok(!active.has(id));if(done.has(id))return;
   active.add(id);tasks.get(id).dependsOn.forEach(visit);active.delete(id);done.add(id)};
  tasks.forEach(t=>visit(t.id));assert.equal(done.size,25);
  const waved=matrix.waves.flatMap(w=>w.taskIds);unique(waved);equal(waved.slice().sort(),[...tasks.keys()].sort());
  const waves=new Map(matrix.waves.flatMap(w=>w.taskIds.map(id=>[id,w.wave])));
  tasks.forEach(t=>t.dependsOn.forEach(d=>assert.ok(waves.get(d)<=waves.get(t.id))));
 });
 check('70-cases-124-pairs-unchanged-with-no-actual-or-release-signoff',()=>{
  assert.equal(ledger.acceptanceCases.length,70);
  const keys=['id','scenario','expected','taskIds','requiredEnvironments'];
  equal(matrix.cases.map(r=>project(r,keys)),ledger.acceptanceCases.map(r=>project(r,keys)));
  const expected=ledger.acceptanceCases.flatMap(c=>c.requiredEnvironments.map(e=>c.id+':'+e));unique(expected);
  const observed=matrix.executionRows.map(r=>r.caseId+':'+r.environment);unique(observed);
  equal(observed.slice().sort(),expected.slice().sort());assert.equal(observed.length,124);
  const counts={local:0,staging:0,pilot:0};
  for(const row of matrix.executionRows){
   counts[row.environment]++;assert.equal(row.executionStatus,'not_run');
   for(const k of ['exactCommand','datasetRef','targetRef','sourceRef','runner','reviewer','actual','exitCode','signoff'])assert.equal(row[k],null);
   equal(row.evidence,[]);equal(row.defects,[]);
  }
  equal(counts,{local:54,staging:69,pilot:1});
  const entries=[...ledger.tasks,...ledger.packages,...ledger.acceptanceCases];assert.equal(entries.length,122);
  entries.forEach(r=>assert.equal(r.releaseAcceptance,'unverified'));
  ledger.acceptanceCases.forEach(r=>{equal(r.evidence,[]);equal(r.defects,[])});
  equal(matrix.acceptanceState,{casesNotRun:70,releaseEntriesUnverified:122,changed:false});
  equal(matrix.gates,ledger.gates.map(r=>project(r,['id','label','decision'])));
  for(const k of ['productAccepted','goalComplete','deploymentAuthorizedByThisArtifact'])assert.equal(matrix[k],false);
  assert.equal(matrix.reviewer,null);assert.equal(matrix.signoff,null);
 });
 const packets=Object.fromEntries(await Promise.all(Object.entries(evidencePaths).map(async([k,p])=>[k,await json(p)])));
 const {focused,native,control}=packets,prior=native.source.backend;
 check('historical-packets-retain-their-tested-source-and-limitations',()=>{
  assert.equal(prior.files.length,289);assert.equal(prior.sha256,verifiedSha);
  for(const p of [focused,native,control]){
   assert.equal(p.verified,true);assertBackendSourceBinding(prior,p.source?.backend??p.backendSource);
   equal(p.cleanup,{containers:0,volumes:0,networks:0});
   assert.equal(p.acceptance.productAccepted,false);assert.equal(p.acceptance.gatesChanged,false);
   assert.equal(p.acceptance.reviewer,null);assert.equal(p.acceptance.signoff,null);
  }
  for(const p of [focused,native]){
   assert.equal(p.execution.terminalExitCode,0);assert.equal(p.source.verifiedAtEnd,true);
   assert.equal(p.source.schemaBefore,p.source.schemaAfter);
  }
  assert.equal(focused.controls.checks.length,75);assert.ok(focused.controls.checks.every(c=>c.passed));
  assert.equal(native.controls.total,337);assert.ok(native.controls.checks.every(c=>c.passed));
  const installer=native.controls.nativeCredentials.installerCli;
  assert.equal(installer.checks.length,75);assert.equal(installer.keyWithdrawal.verified,true);assert.equal(installer.rollbackFaults.verified,true);
  equal(installer.faultGroupsVerified,['IF01','IF02','IF03','IF04','IF05','IF06','IF07','IF08','IF09','IF10','IF13','IF16','IF17']);
  for(const key of ['fullFaultMatrixVerified','rotationDaemonVerified','runtimeMountReloadVerified','productAccepted'])assert.equal(installer[key],false);
  assert.equal(control.execution.exitCode,0);assert.equal(control.sourceUnchanged,true);
  equal(control.counts,{tests:673,pass:671,fail:0,cancelled:0,skipped:2});
 });
 const current=await captureBackendSourceBinding(root);
 const before=new Map(prior.files.map(f=>[f.path,f.sha256])),after=new Map(current.files.map(f=>[f.path,f.sha256]));
 const delta={added:current.files.filter(f=>!before.has(f.path)).map(f=>f.path),
  changed:current.files.filter(f=>before.has(f.path)&&before.get(f.path)!==f.sha256).map(f=>f.path),
  removed:prior.files.filter(f=>!after.has(f.path)).map(f=>f.path)};
 check('current-timeout-draft-never-inherits-historical-product-results',()=>{
  assert.equal(current.files.length,290);assert.equal(current.sha256,currentSha);assert.notEqual(current.sha256,verifiedSha);
  equal(delta,{added:['server/control/testing/setup-installer-pg-proxy.mjs'],changed:['server/control/testing/setup-installer-native.mjs'],removed:[]});
  for(const text of documents){assert.ok(text.includes(currentSha));assert.ok(text.includes(verifiedSha));assert.ok(text.includes('nháp timeout chưa kiểm'))}
  assert.ok(board.includes('handshake.released'));assert.ok(board.includes('chưa phải defect sản phẩm đã tái hiện'));
  assert.ok(!master.includes('**Điều kiện nhận gói kế tiếp:** khép phần còn lại củaIF10'));
 });
 const migrations=(await readdir(resolve(root,'supabase/migrations'))).filter(p=>p.endsWith('.sql')).sort(),chain=createHash('sha256');
 for(const name of migrations)chain.update(name+'\0'+(await readFile(resolve(root,'supabase/migrations',name),'utf8')).replace(/\r\n/g,'\n')+'\0');
 const businessMigrations={count:migrations.length,sha256:chain.digest('hex')};
 equal(businessMigrations,native.source.businessMigrations);assert.equal(businessMigrations.count,584);
 assert.equal((await readdir(resolve(root,'server/control/migrations'))).filter(p=>p.endsWith('.sql')).length,19);
 checked.push('migration-inventory-unchanged-584-business-and-19-directory');
 check('eleven-deliveries-next-steps-budgets-dr-e2e-and-pilot-covered',()=>{
  equal([...board.matchAll(/^\| (\d+)\. /gm)].map(m=>Number(m[1])),[1,2,3,4,5,6,7,8,9,10,11]);
  for(let i=1;i<=8;i++)assert.ok(board.includes('DL0'+i)&&board.includes('FS0'+i));
  for(const token of ['Auth→directory','quota','offsite','Android','SIGKILL','1.000 metadata','người trực','≥7 ngày'])assert.ok(board.includes(token));
  for(const token of ['direct Auth','RPO','RTO','operating_limit','headroom','trial','TBD'])assert.ok(master.includes(token));
  for(const token of ['A01–A11','D01–D15','E01–E08','F01–F09','G01–G07','G08','124','reviewer'])assert.ok(acceptance.includes(token));
  assert.ok(master.includes('## 0. Cách dùng kế hoạch để bắt đầu triển khai'));
  assert.ok(board.includes('Chưa cam kết ngày mở public'));assert.ok(master.includes('chưa là SLA'));
 });
 let links=0,anchorCount=0;
 for(let i=0;i<documents.length;i++){
  const clean=documents[i].replace(/```[\s\S]*?```/g,'');
  for(const m of clean.matchAll(/(?<!!)\[[^\]\n]+\]\(([^)\s]+)\)/g)){
   const href=m[1];if(/^[a-z][a-z0-9+.-]*:/i.test(href))continue;
   const [part,fragment]=href.split('#'),target=part?resolve(root,dirname(documentPaths[i]),decodeURIComponent(part)):resolve(root,documentPaths[i]);
   const rel=relative(root,target);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));
   let segment=root;for(const p of rel.split(/[\\/]/)){segment=resolve(segment,p);assert.ok(!(await lstat(segment)).isSymbolicLink())}
   assert.ok((await lstat(target)).isFile());links++;
   if(fragment){assert.ok(anchors(await readFile(target,'utf8')).has(decodeURIComponent(fragment)),'ANCHOR_NOT_FOUND_'+href);anchorCount++}
  }
 }
 checked.push('all-primary-links-and-anchors-resolve-within-repository');
 for(const text of documents)assert.ok(!/(?:postgres(?:ql)?:\/\/[^\s]+|\bre_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.)/.test(text));
 checked.push('primary-documents-secret-pattern-scan');
 equal(await captureBackendSourceBinding(root),current);
 for(const f of protectedFiles)assert.equal(sha(await bytes(f.path)),f.sha256);
 assert.equal(sha(await bytes(matrixPath)),sha(matrixBytes));
 for(const d of documentHashes)assert.equal(sha(await bytes(d.path)),d.sha256);
 for(const d of entryHashes)assert.equal(sha(await bytes(d.path)),d.sha256);
 checked.push('end-source-documents-and-acceptance-records-unchanged-during-audit');
 const report={version:1,type:'vps_signup_scope_plan_review',recordedAtUtc:new Date().toISOString(),
  scope:'whole_vps_and_signup',requestedOutput:'plan_and_acceptance',planningChecksPassed:true,checks:checked,
  counts:{waves:8,tasks:25,packages:27,cases:70,requiredCaseEnvironmentPairs:124,local:54,staging:69,pilot:1,deliveries:11},
  sourceInventory:{backend:current,businessMigrations,directoryMigrations:19,classification:'unverified_timeout_draft',productTestsRunForThisSourceByThisAudit:false},
  lastVerifiedCheckpoint:{backendSha256:verifiedSha,backendFiles:289,appliesToCurrentSource:false,
   focusedControls:75,nativeControls:337,controlCounts:control.counts,
   evidence:Object.entries(evidencePaths).map(([kind,path])=>({kind,path}))},
  sourceDelta:delta,documents:documentHashes,entryDocuments:entryHashes,protectedArtifacts:protectedFiles,
  executionPlan:{path:matrixPath,sha256:sha(matrixBytes)},links:{checked:links,anchorsChecked:anchorCount},
  execution:{readOnly:true,applicationConnections:0,databaseConnections:0,dockerCommands:0,productTestsRun:false,servingMigrationsRun:false,flagsChanged:false},
  acceptance:{casesNotRun:70,releaseEntriesUnverified:122,reviewer:null,signoff:null,gatesChanged:false,productAccepted:false,goalComplete:false}};
 if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',flag:'wx'});
 console.log(JSON.stringify({planningChecksPassed:true,checks:checked.length,links,anchors:anchorCount,counts:report.counts,
  currentBackendVerified:false,productAccepted:false,...(output?{output:relative(root,output).replaceAll('\\','/')}:{})}));
}catch(error){
 console.error(JSON.stringify({planningChecksPassed:false,code:error.code??'PLAN_ASSERTION_FAILED',message:error.message}));process.exitCode=1;
}
