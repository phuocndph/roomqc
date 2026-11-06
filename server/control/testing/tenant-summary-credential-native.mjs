// Only the exact-owned disposable backend calls this fixture. No serving DSN.
import assert from 'node:assert/strict';
import {randomUUID,createHash,generateKeyPairSync} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {summaryIssueReceipt,summaryReceiptClaims,loadSummaryReceiptSigner} from '../tenant-summary-signing.mjs';
import {summaryMaintenanceBinding} from '../tenant-summary-maintenance.mjs';
import {publishSummaryCredential} from '../tenant-summary-publication.mjs';
import {runSummaryCredentialCliChecks} from './tenant-summary-cli-native.mjs';

export async function runSummaryCredentialChecks({db,input,cluster,binding}){
 assert.match(input.run,/^[a-f0-9]{12}$/);
 const names={installer:'rq_sum_inst_'+input.run,issuer:'rq_sum_issue_'+input.run,other:'rq_sum_other_'+input.run,mixed:'rq_sum_mixed_'+input.run};
 const clients=[],created=[],checks=[];
 const maintenance=new pg.Client({host:'db',database:'postgres',user:'supabase_admin',password:input.databasePassword,
  connectionTimeoutMillis:4000,statement_timeout:5000,lock_timeout:1000});
 const check=(label,condition=true)=>{
  assert.ok(condition,label);checks.push({label,passed:true});
  console.error(JSON.stringify({event:'summary_credential_native_check',label}));
 };
 const root=await mkdtemp('/tmp/roomqc-summary-credential-');
 const expected={clusterId:cluster.id,releaseId:'owned-summary-fixture',artifactDigest:'1'.repeat(64),
  frontendArtifactDigest:'2'.repeat(64),migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};
 const target={cluster:{...cluster,credentialRef:cluster.ref},expected,allowLocal:true};
 const loadedBinding=summaryMaintenanceBinding(target.cluster,expected);
 assert.equal(loadedBinding.bindingHash,binding.bindingHash);
 const state=async()=>JSON.stringify((await db.query(`SELECT
  (SELECT jsonb_agg(c ORDER BY id) FROM private.tenant_summary_credentials c) AS credentials,
  (SELECT jsonb_agg(c ORDER BY key) FROM private.tenant_summary_commands c) AS commands,
  (SELECT jsonb_agg(c ORDER BY command_key) FROM private.tenant_summary_credential_audit c) AS audit,
  (SELECT to_jsonb(m) FROM private.tenant_summary_management m) AS management,
  (SELECT to_jsonb(a) FROM private.tenant_summary_authority a) AS authority`)).rows);
 const run=(client,op,value)=>client.query('SELECT roomqc_summary_admin.'+op+'($1::jsonb) AS value',[value]).then(r=>r.rows[0].value);
 const status=client=>client.query('SELECT roomqc_summary_admin.status() AS value').then(r=>r.rows[0].value);
 const denied=async(label,fn,pattern)=>{const before=await state();await assert.rejects(fn,pattern);assert.equal(await state(),before);check(label)};
 const common=(operation,version,extra={})=>({version:1,operation,key:randomUUID(),requestId:randomUUID(),reason:'Owned summary maintenance test',
  expectedVersion:version,clusterId:binding.clusterId,bindingSha256:binding.bindingHash,releaseSha256:loadedBinding.releaseFingerprint,...extra});
 const issue=(version,predecessorId,extra={})=>common('issue',version,{predecessorId,ttlSeconds:600,overlapSeconds:10,
  signerAlgorithm:'HS256',signerFingerprint:createHash('sha256').update(input.jwtSecret).digest('hex'),...extra});
 const call=async token=>{
  const response=await fetch('http://127.0.0.1:8000/rest/v1/rpc/tenant_summary',{method:'POST',signal:AbortSignal.timeout(5000),
   headers:{apikey:input.publishableKey,authorization:'Bearer '+token,'Content-Profile':'roomqc_summary','Content-Type':'application/json'},
   body:JSON.stringify({p_workspace_id:randomUUID(),p_tenant_id:randomUUID(),p_owner_id:randomUUID(),p_hotel_id:randomUUID()})});
  return {status:response.status,value:await response.json()};
 };
 let primaryError;
 try{
  await maintenance.connect();
  for(const [kind,name]of Object.entries(names)){
   await maintenance.query(`CREATE ROLE ${name} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1 PASSWORD '${input.databasePassword}'`);created.push(name);
   await maintenance.query(`GRANT roomqc_summary_credential_${kind==='installer'?'installer':'issuer'} TO ${name}`);
  }
  await maintenance.query('GRANT service_role TO '+names.mixed);
  const connect=async name=>{const c=new pg.Client({host:'db',database:'postgres',user:name,password:input.databasePassword,
   connectionTimeoutMillis:4000,statement_timeout:5000,lock_timeout:1000});await c.connect();clients.push(c);return c};
  const installer=await connect(names.installer),issuer=await connect(names.issuer),other=await connect(names.other),mixed=await connect(names.mixed);
  const preflight=(await issuer.query('SELECT roomqc_summary_admin.preflight() AS value')).rows[0].value;
  assert.equal(preflight.role,names.issuer);assert.equal(preflight.roleConnectionLimit,1);assert.equal(preflight.capability,'issuer');
  assert.equal(preflight.memberships,1);assert.equal(preflight.schemaManifestHash,(await db.query('SELECT private.roomqc_schema_fingerprint() AS hash')).rows[0].hash);
  check('narrow preflight reads physical identity and full current attestation');
  const before=(await db.query('SELECT * FROM private.tenant_summary_authority WHERE singleton')).rows[0];
  const bind=common('bind',0,{expectedClusterId:before?.cluster_id??null,expectedBindingSha256:before?.binding_sha256??null});
  await denied('summary issuer cannot change authority',()=>run(issuer,'bind',bind),/permission denied/);
  await denied('summary installer cannot issue tokens',()=>run(installer,'issue',issue(0,null)),/permission denied/);
  await denied('mixed elevated login rejected',()=>status(mixed),/SUMMARY_CREDENTIAL_OPERATOR_DENIED/);
  await denied('issuer cannot update private credentials directly',()=>issuer.query('UPDATE private.tenant_summary_credentials SET revoked_at=NULL'),/permission denied/);
  check('existing manual rows do not become managed readiness',(await status(issuer)).reasonCode==='UNBOUND');
  const bound=await run(installer,'bind',bind);assert.equal(bound.version,1);
  assert.deepEqual(await run(installer,'bind',bind),bound);check('binding replays original result without second effect');
  const firstCommand=issue(1,null),first=await run(issuer,'issue',firstCommand);
  assert.deepEqual(await run(issuer,'issue',firstCommand),first);check('issue replay keeps credential ID and database timestamps');
  await denied('same key with altered payload rejected',()=>run(issuer,'issue',{...firstCommand,ttlSeconds:601}),/SUMMARY_CREDENTIAL_KEY_CONFLICT/);
  await denied('another caller cannot replay command',()=>run(other,'issue',firstCommand),/SUMMARY_CREDENTIAL_KEY_CONFLICT/);
  assert.equal((await issuer.query('SELECT roomqc_summary_admin.receipt($1) AS value',[first.commandId])).rows[0].value.credentialId,first.credentialId);
  assert.equal((await other.query('SELECT roomqc_summary_admin.receipt($1) AS value',[first.commandId])).rows[0].value,null);
  check('receipt lookup bound to actual SQL login');
  summaryIssueReceipt(first,loadedBinding);
  assert.equal(summaryReceiptClaims(first).role,'roomqc_tenant_summary');
  const keyFile=join(root,'key');await writeFile(keyFile,input.jwtSecret,{mode:0o600});
  const signer=await loadSummaryReceiptSigner({algorithm:'HS256',fingerprint:first.signerFingerprint,keyFile,keyId:null},first);
  const credential=await signer.sign(first,loadedBinding,input.publishableKey);
  check('dedicated signer token accepted by actual PostgREST',(await call(credential.token)).value.state==='missing');
  const outputDirectory=join(root,'published');await mkdir(outputDirectory,{mode:0o700});
  const outputFile=join(outputDirectory,'summary.json'),publishableKeyFile=join(root,'publishable');
  await writeFile(publishableKeyFile,input.publishableKey,{mode:0o600});
  const publicationOptions={client:issuer,target,receipt:first,signer:{algorithm:'HS256',fingerprint:first.signerFingerprint,keyFile,keyId:null},
   publishableKeyFile,outputFile,assertAuthority:async()=>{
    const actual=(await issuer.query('SELECT roomqc_summary_admin.preflight() AS value')).rows[0].value;
    assert.equal(actual.systemIdentifier,preflight.systemIdentifier);assert.equal(actual.databaseOid,preflight.databaseOid);
    assert.equal(actual.role,names.issuer);assert.equal(actual.schemaManifestHash,preflight.schemaManifestHash);
   }};
  await assert.rejects(publishSummaryCredential({...publicationOptions,onPhase:async phase=>{
   if(phase==='stage_synced')throw Object.assign(new Error('SUMMARY_PUBLICATION_TEST_INTERRUPTED'),{code:'SUMMARY_PUBLICATION_TEST_INTERRUPTED'});
  }}),{code:'SUMMARY_PUBLICATION_TEST_INTERRUPTED'});
  const publication=await publishSummaryCredential(publicationOptions);
  assert.equal(publication.filePublished,true);assert.equal(publication.nativeRpcVerified,true);assert.equal(publication.directorySynced,true);
  assert.equal(JSON.parse(await readFile(outputFile,'utf8')).token,credential.token);
  check('atomic publication resumes after durable stage fault and verifies actual RPC');
  const publishedBytes=await readFile(outputFile,'utf8');
  await publishSummaryCredential(publicationOptions);
  assert.equal(await readFile(outputFile,'utf8'),publishedBytes);check('publication replay preserves exact committed token');
  assert.equal((await status(issuer)).ready,true);check('live status reports managed credential without bearer');
  const secondCommand=issue(2,first.credentialId),second=await run(issuer,'rotate',secondCommand);
  assert.equal(second.predecessorId,first.credentialId);
  const cutoff=(await db.query('SELECT retire_after FROM private.tenant_summary_credentials WHERE id=$1',[first.credentialId])).rows[0].retire_after;
  assert.equal(Date.parse(cutoff),Date.parse(second.overlapDeadline));
  check('rotation creates one successor and database-controlled overlap');
  assert.equal((await call(credential.token)).status,200);check('predecessor usable during bounded overlap');
  await denied('second live overlap rejected',()=>run(issuer,'rotate',issue(3,second.credentialId)),/SUMMARY_CREDENTIAL_OVERLAP_BUSY/);
  await db.query("UPDATE private.tenant_summary_credentials SET retire_after=clock_timestamp()-interval '1 second' WHERE id=$1",[first.credentialId]);
  assert.equal((await call(credential.token)).status,403);check('predecessor denied after database cutoff despite valid JWT');
  const revoke=common('revoke',3,{credentialId:second.credentialId});await run(installer,'revoke',revoke);
  await assert.rejects(publishSummaryCredential(publicationOptions),{code:'SUMMARY_PUBLICATION_NOT_CURRENT'});
  assert.equal(await readFile(outputFile,'utf8'),publishedBytes);check('stale receipt cannot republish after rotation or revoke');
  await denied('automatic rotation cannot revive revoked head',()=>run(issuer,'rotate',issue(4,second.credentialId)),/SUMMARY_CREDENTIAL_ROTATION_HEAD_UNREADY/);
  assert.equal((await status(issuer)).reasonCode,'CREDENTIAL_REVOKED');check('revoked head closes readiness');
  // A manual issuer may recover, while the automatic rotate capability may not.
  const recovered=await run(issuer,'issue',issue(4,second.credentialId));
  await db.query("UPDATE private.tenant_summary_credentials SET not_before=clock_timestamp()-interval '3 minutes',expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[recovered.credentialId]);
  await denied('automatic rotation cannot revive expired head',()=>run(issuer,'rotate',issue(5,recovered.credentialId)),/SUMMARY_CREDENTIAL_ROTATION_HEAD_UNREADY/);
  const counts=(await db.query('SELECT (SELECT count(*)::int FROM private.tenant_summary_commands) AS commands,(SELECT count(*)::int FROM private.tenant_summary_credential_audit) AS audit')).rows[0];
  assert.deepEqual(counts,{commands:5,audit:5});check('exactly one durable command and immutable audit per successful operation');
  await denied('business login cannot overwrite audit history',()=>db.query('UPDATE private.tenant_summary_credential_audit SET reason=reason'),/permission denied/);
  await denied('business login cannot delete command history',()=>db.query('DELETE FROM private.tenant_summary_commands'),/permission denied/);
  await denied('maintenance cannot overwrite immutable audit history',()=>maintenance.query('UPDATE private.tenant_summary_credential_audit SET reason=reason'),/SUMMARY_CREDENTIAL_HISTORY_IMMUTABLE/);
  await denied('maintenance cannot delete immutable command history',()=>maintenance.query('DELETE FROM private.tenant_summary_commands'),/SUMMARY_CREDENTIAL_HISTORY_IMMUTABLE/);
  for(const table of ['tenant_summary_authority','tenant_summary_credentials','tenant_summary_management','tenant_summary_commands','tenant_summary_credential_audit']){
   for(const role of ['anon','authenticated','service_role','roomqc_tenant_summary']){
    const r=(await db.query('SELECT has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER\') OR has_any_column_privilege($1,$2,\'SELECT,INSERT,UPDATE,REFERENCES\') AS allowed',[role,'private.'+table])).rows[0];
    assert.equal(r.allowed,false);
   }
  }
  check('five maintenance tables have no direct browser service or runtime grants');
  const roleSurface=(await db.query(`SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
   FROM pg_roles WHERE rolname=ANY($1)`,[['roomqc_summary_credential_owner','roomqc_summary_credential_issuer','roomqc_summary_credential_installer']])).rows;
  assert.equal(roleSurface.length,3);assert(roleSurface.every(r=>!r.rolcanlogin&&!r.rolinherit&&!r.rolsuper&&!r.rolcreatedb&&!r.rolcreaterole&&!r.rolreplication&&!r.rolbypassrls));
  check('maintenance capability roles are NOLOGIN and have no elevated attributes');
  for(const alg of ['RS256','ES256']){
   const pair=generateKeyPairSync(alg==='RS256'?'rsa':'ec',alg==='RS256'?{modulusLength:2048}:{namedCurve:'prime256v1'});
   const material=pair.privateKey.export({type:'pkcs8',format:'pem'}),fingerprint=createHash('sha256').update(pair.publicKey.export({type:'spki',format:'der'})).digest('hex');
   await writeFile(keyFile,material,{mode:0o600});
   const receipt={...first,signerAlgorithm:alg,signerFingerprint:fingerprint};
   const asymmetric=await loadSummaryReceiptSigner({algorithm:alg,fingerprint,keyFile,keyId:'summary-test'},receipt);
   const token=await asymmetric.sign(receipt,loadedBinding,input.publishableKey);
   await asymmetric.verify(token,loadedBinding,receipt);check(alg+' signs only exact summary receipt claims');
  }
  checks.push(...await runSummaryCredentialCliChecks({input,db,maintenance,cluster}));
  return checks;
 }catch(error){primaryError=error;throw error}
 finally{
  await Promise.allSettled(clients.map(c=>c.end()));
  let cleanupError;
  for(const name of created.reverse())try{await maintenance.query('DROP OWNED BY '+name);await maintenance.query('DROP ROLE '+name)}catch(error){cleanupError??=error}
  await maintenance.end();
  await rm(root,{recursive:true,force:true});
  if(cleanupError&&!primaryError)throw cleanupError;
 }
}
