// Exact-owned CLI fault checks. Privileged fixture alterations are explicitly
// distinct from legal writer contention; no runtime grants are broadened.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {fixtureReleaseApproval,fixtureReleaseTrust} from '../release-test-fixtures.mjs';

export async function runInstallerPreflightFaults(c){
 const {config,installerRaw,issueFile,json,text,run,businessState,maintenance,db,fingerprint,budget,hash,check,names,input}=c;
 let sequence=0;
 const denied=async(label,raw,codes)=>{
  const before=await businessState(),file=await json('preflight-fault-'+sequence+++'.json',raw),result=await run(file,issueFile);
  assert.equal(result.exit.code,1,label);assert.equal(result.value.ok,false,label);
  assert.ok(codes.includes(result.value.code),label+':'+result.value.code);
  assert.deepEqual(await businessState(),before,label);
  await assert.rejects(()=>lstat(config.publisher.outputFile),{code:'ENOENT'});check(label);
 };
 const changed=mutate=>{const raw=structuredClone(config);mutate(raw);return raw};
 await denied('wrong-system-identifier-refused-by-native-preflight',changed(v=>v.business.expected.systemIdentifier=(BigInt(v.business.expected.systemIdentifier)+1n).toString()),['SETUP_INSTALLER_DATABASE_MISMATCH']);
 for(const [field,value]of [['databaseName','other_owned_database'],['role','other_owned_login']])
  await denied('dsn-'+field+'-mismatch-refused-before-opening-target',changed(v=>v.business.expected[field]=value),['SETUP_INSTALLER_CONFIG_INVALID']);
 const roleFaults=[
  ['connection-limit', 'ALTER ROLE '+names.issuer+' CONNECTION LIMIT 2','ALTER ROLE '+names.issuer+' CONNECTION LIMIT 1',['SETUP_INSTALLER_DATABASE_MISMATCH']],
  ['elevated-login','ALTER ROLE '+names.issuer+' CREATEDB','ALTER ROLE '+names.issuer+' NOCREATEDB',['SETUP_INSTALLER_DATABASE_PRIVILEGES_DENIED']],
  ['mixed-service-membership','GRANT service_role TO '+names.issuer,'REVOKE service_role FROM '+names.issuer,['SETUP_INSTALLER_DATABASE_PRIVILEGES_DENIED']],
  ['mixed-issuer-installer','GRANT roomqc_setup_credential_installer TO '+names.issuer,'REVOKE roomqc_setup_credential_installer FROM '+names.issuer,['SETUP_INSTALLER_DATABASE_PRIVILEGES_DENIED']],
  ['extra-observer-membership','GRANT roomqc_control_setup_credential_observer TO '+names.issuer,'REVOKE roomqc_control_setup_credential_observer FROM '+names.issuer,['SETUP_INSTALLER_RELEASE_MISMATCH']]
 ];
 for(const [label,alter,restore,codes]of roleFaults){
  try{await maintenance.query(alter);await denied('native-'+label+'-denied-without-effects',config,codes)}
  finally{await maintenance.query(restore)}
  assert.equal((await db.query('SELECT private.roomqc_schema_fingerprint() AS value')).rows[0].value,fingerprint,'known-approved-role-graph-restored');
 }
 const manifest=(await db.query('SELECT to_jsonb(m) AS value FROM private.roomqc_release_manifest m WHERE singleton')).rows[0].value;
 const restoreManifest=async()=>{
  await db.query('DELETE FROM private.roomqc_release_manifest WHERE singleton');
  await db.query('INSERT INTO private.roomqc_release_manifest SELECT * FROM jsonb_populate_record(NULL::private.roomqc_release_manifest,$1::jsonb)',[manifest]);
 };
 for(const version of [1,2])try{
  await db.query('UPDATE private.roomqc_release_manifest SET schema_fingerprint_version=$1 WHERE singleton',[version]);
  await denied('native-legacy-manifest-v'+version+'-denied',config,['SETUP_INSTALLER_RELEASE_MISMATCH']);
 }finally{await restoreManifest()}
 try{await db.query('DELETE FROM private.roomqc_release_manifest WHERE singleton');
  await denied('native-missing-release-manifest-denied',config,['SETUP_INSTALLER_RELEASE_MISMATCH']);
 }finally{await restoreManifest()}
 assert.equal((await db.query('SELECT private.roomqc_schema_fingerprint() AS value')).rows[0].value,fingerprint);
 const expired=fixtureReleaseApproval(c.context,{notBefore:Date.now()-5000,expiresAt:Date.now()-1000});
 await denied('signed-but-expired-approval-denied-before-dispatch',changed(v=>v.target.approval=expired),['SETUP_INSTALLER_CONFIG_INVALID']);
 await denied('invalid-signature-denied-before-dispatch',changed(v=>{
  const signature=v.target.approval.signature;v.target.approval.signature=(signature[0]==='A'?'B':'A')+signature.slice(1);
 }),['SETUP_INSTALLER_CONFIG_INVALID']);
 await denied('unsigned-endpoint-substitution-denied-before-dispatch',changed(v=>v.target.cluster.url='http://127.0.0.1:8083'),['SETUP_INSTALLER_CONFIG_INVALID']);
 const budgetFault=async(label,mutate,{raw=config,codes=['SETUP_INSTALLER_BUDGET_INVALID']}={})=>{
  const value=structuredClone(budget);mutate(value);const bytes=JSON.stringify(value)+'\n';
  const file=await text('budget-fault-'+sequence+++'.json',bytes);
  await denied(label,{...raw,resourceBudgetFile:file,resourceBudgetSha256:hash(bytes)},codes);
 };
 for(const kind of ['business','directory'])await budgetFault('valid-digest-missing-issuer-consumer-'+kind,v=>{
  const d=v.databases.find(d=>d.kind===kind);d.consumers=d.consumers.filter(x=>x.id!==config.consumerId);
 });
 await budgetFault('valid-digest-missing-installer-consumer',v=>{
  const d=v.databases.find(d=>d.kind==='business');d.consumers=d.consumers.filter(x=>x.id!==installerRaw.consumerId);
 },{raw:installerRaw});
 for(const [label,mutate]of [
  ['pool-two',x=>x.pools[0].max=2],['replica-mismatch',x=>x.replicas=1],['fixed-connection',x=>x.fixedConnectionsPerReplica=1]
 ])await budgetFault('valid-digest-installer-budget-'+label,v=>mutate(v.databases.find(d=>d.kind==='business').consumers.find(x=>x.id===config.consumerId)));
 await budgetFault('valid-digest-rolling-replica-budget-overflow',v=>{
  v.databases.find(d=>d.kind==='business').consumers.find(x=>x.id==='rest').replicas=100;
 },{codes:['SETUP_INSTALLER_CONFIG_INVALID']});
 await budgetFault('native-observed-max-connections-below-approved-budget',v=>v.databases.find(d=>d.kind==='business').maxConnections=101,
  {codes:['SETUP_INSTALLER_DATABASE_MISMATCH']});
 await budgetFault('native-observed-reserve-above-approved-budget',v=>v.databases.find(d=>d.kind==='business').reservedConnections=1,
  {codes:['SETUP_INSTALLER_DATABASE_MISMATCH']});
 let permissionCalls=0;
 for(const [profile,user]of [...Object.entries(c.denialNames),['ordinary-migrator','postgres']]){
  const before=await businessState(),client=new pg.Client({host:'db',database:'postgres',user,
   password:user==='postgres'?input.databasePassword:c.password,statement_timeout:4000});
  try{await client.connect();for(const op of ['preflight','bind','issue','revoke']){
   await assert.rejects(()=>client.query('SELECT roomqc_setup_admin.'+op+'('+(op==='preflight'?'':"'{}'::jsonb")+')'),{code:'42501'});permissionCalls++;
  }}finally{await client.end()}
  assert.deepEqual(await businessState(),before);check('actual-'+profile+'-login-denied-entire-maintenance-surface');
 }
 const observer=new pg.Client({host:'db',database:c.database,user:names.observer,password:c.password,statement_timeout:4000});
 try{await observer.connect();
  await assert.rejects(()=>observer.query('SELECT id FROM roomqc_control.workspaces LIMIT 1'),{code:'42501'});
  await assert.rejects(()=>observer.query("UPDATE roomqc_control.release_authority SET state='withdrawn' WHERE false"),{code:'42501'});
  permissionCalls+=2;
 }finally{await observer.end()}
 check('actual-observer-login-cannot-read-workspaces-or-write-authority');
 return {verified:true,permissionCalls,groups:['IF09','IF13','IF17'],legacyAndInvalidApprovalChecks:true};
}

export async function runInstallerPublicationFences(c){
 const {root,config,issue,published,json,run,child,until,wire,businessState,directory,check,barriers}=c;
 let sequence=0;
 const isolated=async(label,raw=config)=>{
  const folder=join(root,'fence-runtime-'+sequence++);await mkdir(folder,{mode:0o700});
  const value=structuredClone(raw);value.publisher.outputFile=join(folder,'credential.json');
  return {raw:value,file:await json('fence-config-'+label+'.json',value),command:await json('fence-command-'+label+'.json',{version:1,operation:'publish',key:issue.key})};
 };
 const absent=async entry=>{await assert.rejects(()=>lstat(entry.raw.publisher.outputFile),{code:'ENOENT'})};
 const hold=async(entry,label)=>{
  const before=await businessState(),held=wire.arm('receipt','hold'),started=Date.now(),handle=child(entry.file,entry.command);
  await until(()=>{
   if(handle.exit&&!held.observed)throw Object.assign(new Error('INSTALLER_NATIVE_BARRIER_NOT_REACHED'),{code:'INSTALLER_NATIVE_BARRIER_NOT_REACHED'});
   return held.observed;
  },'publication-'+label);assert.equal(held.idle,true);
  const receiptDelayMs=Date.now()-started;
  barriers.push({phase:'receipt-response-held-'+label,observed:true});return {before,held,handle,receiptDelayMs};
 };
 const finish=async(entry,h,label,codes)=>{
  h.held.release();await until(()=>h.handle.exit,'publication-denied-'+label);
  const output=JSON.parse(h.handle.output.trim());assert.equal(h.handle.exit.code,1,label);
  assert.ok(codes.includes(output.code),label+':'+output.code);
  assert.equal(output.recovery.operation,'publish');assert.equal(output.recovery.key,issue.key);
  assert.deepEqual(await businessState(),h.before);await absent(entry);check(label);
 };
 const changes=[['config',e=>e.file,bytes=>bytes+' '],['command',e=>e.command,bytes=>bytes+' '],
  ['trust',e=>e.raw.releaseTrustFile,bytes=>bytes+' '],
  ['signer-same-algorithm',e=>e.raw.publisher.signer.keyFile,()=>randomBytes(48).toString('hex')],
  ['signer-wrong-algorithm',e=>e.raw.publisher.signer.keyFile,()=>generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({format:'pem',type:'pkcs8'})]];
 for(const [kind,fileOf,mutate]of changes){
  const entry=await isolated(kind),file=fileOf(entry),original=await readFile(file),replacement=mutate(original.toString('utf8'));
  const h=await hold(entry,kind);
  try{await writeFile(file,replacement);await finish(entry,h,'post-receipt-'+kind+'-bytes-changed-no-publication',['SETUP_INSTALLER_FILES_CHANGED'])}
  finally{await writeFile(file,original);h.held.release()}
 }
 const authority=(await directory.query('SELECT to_jsonb(a) AS value FROM roomqc_control.release_authority a WHERE cluster_id=$1',[config.target.cluster.id])).rows[0].value;
 const restore=async()=>directory.query(`UPDATE roomqc_control.release_authority a SET
  approval_id=r.approval_id,epoch=r.epoch,row_version=r.row_version,state=r.state,updated_at=r.updated_at
  FROM jsonb_populate_record(NULL::roomqc_control.release_authority,$1::jsonb) r WHERE a.cluster_id=r.cluster_id`,[authority]);
 const adversarial=async sql=>{
  const client=await directory.connect();try{await client.query('BEGIN');
   // Deliberate test-superuser bypass ONLY in the owned DB. Legal writers
   // cannot take this path; their advisory-lock denial is asserted separately.
   await client.query('SET LOCAL session_replication_role=replica');await client.query(sql,[authority.cluster_id]);await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 };
 const entry=await isolated('authority'),h=await hold(entry,'authority');
 try{
  const lock=await directory.connect();try{
   assert.equal((await lock.query('SELECT pg_try_advisory_lock(727001) AS locked')).rows[0].locked,false);
   check('legal-authority-writer-cannot-acquire-exclusive-lock-during-cli-publication');
  }finally{lock.release()}
  await adversarial("UPDATE roomqc_control.release_authority SET state='withdrawn' WHERE cluster_id=$1");
  await finish(entry,h,'privileged-fixture-withdrawal-between-fences-denies-publication',['SETUP_INSTALLER_AUTHORITY_CHANGED']);
 }finally{h.held.release();await restore()}
 // A short, genuinely signed envelope is installed before the CLI starts.
 // Waiting for its actual wall-clock expiry never changes a client clock.
 // Calibrate only fixture lifetime from the preceding real CLI startup. A
 // fixed 1.8s expired before the receipt on this host and tested the wrong
 // window. Product query/overall deadlines and credential TTL are unchanged.
 const validityMs=Math.max(3000,h.receiptDelayMs+1500),expiry=Date.now()+validityMs,
  approval=fixtureReleaseApproval(c.context,{epoch:2,notBefore:Date.now()-1000,expiresAt:expiry}),
  verified=fixtureReleaseTrust.verify(approval,c.context);
 await directory.query(`INSERT INTO roomqc_control.release_approvals(approval_id,cluster_id,epoch,envelope_digest,issuer_id,key_id,key_fingerprint,
  inventory_ref,host_id,environment,endpoint_fingerprint,expectation_fingerprint,expected,not_before_ms,expires_at_ms)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)`,
  [verified.approvalId,verified.clusterId,verified.epoch,verified.envelopeDigest,verified.issuerId,verified.keyId,verified.keyFingerprint,
   verified.inventoryRef,verified.hostId,verified.environment,verified.endpointFingerprint,verified.expectationFingerprint,
   JSON.stringify(verified.expected),verified.notBefore,verified.expiresAt]);
 await directory.query('UPDATE roomqc_control.release_authority SET approval_id=$1,epoch=$2 WHERE cluster_id=$3',[verified.approvalId,2,verified.clusterId]);
 let expiring;
 try{
  const exp=await isolated('expired-at-fence',{...config,target:{...config.target,approval}});expiring=await hold(exp,'actual-approval-expiry');
  expiring.remainingAtBarrierMs=expiry-Date.now();assert.ok(expiring.remainingAtBarrierMs>0&&expiring.remainingAtBarrierMs<3500,'expiry barrier must precede real expiry within unchanged query timeout');
  await until(()=>Date.now()>expiry+30,'real-signed-expiry',5000);
  await finish(exp,expiring,'signed-approval-expires-between-real-receipt-and-publication',['SETUP_INSTALLER_UNAVAILABLE']);
  const replay=await run(exp.file,exp.command);assert.equal(replay.exit.code,1);await absent(exp);
  assert.deepEqual(await businessState(),expiring.before);check('expired-approval-replay-never-extends-receipt-or-publishes');
 }finally{expiring?.held.release();await restore()}
 // Restoring the baseline is isolated fixture teardown, not revival of the
 // expired approval or permission to replay it. Its row stays expired.
 assert.equal(await readFile(config.publisher.outputFile,'utf8'),published);
 return {verified:true,groups:['IF06','IF07','IF08'],barriers:changes.length+2,actualExpiry:true,
  expiryTiming:{validityMs,receiptDelayMs:expiring.receiptDelayMs,remainingAtBarrierMs:expiring.remainingAtBarrierMs},
  fixtureBypassLabelled:true,existingPublishedFileUnchanged:true,operationalAuthorityChanged:false};
}
