// Native extension of the private checkpoint drill. No production signer or
// production authority is used. The worker never receives operator secrets.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createPrivateBackupDirectory} from './roomqc-backup-envelope.mjs';
import {parseRecoverySchemaJSON,recoverySchemaExpectation,recoverySchemaDigestSQL,recoverySequenceAclSQL,assertRecoverySchemaParts} from './roomqc-recovery-schema-review.mjs';
import {ReleaseApprovalTrust,releaseApprovalSigningBytes,releaseApprovalEndpointFingerprint} from '../server/control/release-approval.mjs';
import {recoveryBinding} from '../server/control/setup-recovery.mjs';
import {runRestoredHealthWorker} from './roomqc-restored-health-worker.mjs';
import {runRestoredRotationWorker} from './roomqc-restored-rotation-worker.mjs';
import {runRestoredHostObserver} from './roomqc-restored-host-observer.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const q=x=>"'"+x.replaceAll("'","''")+"'";
const json=x=>JSON.stringify(x,null,2)+'\n';
export async function runRestoredSetupWorker({pair,business,directory,query,configRoot,output,frozenBaselineFile,secret,publicKey,
 roles,project,run,label,image,docker,inputDocker,client,names,ownedVolumes,ownedNetworks,managementOperator,vapidPublicKey,probeToken,emit,
 publicOrigin='http://127.0.0.1:18082',frontendArtifactDigest,withRunningWorkers}){
 const frozen=parseRecoverySchemaJSON(await readFile(frozenBaselineFile,'utf8'));
 const sourceHash='84c57395ec7900953a5830e86cd50dd295989abdfb964ef72a821f7f0b1673f4';
 assert.equal(pair.businessDescriptorSha256,'57b8adb35847907f398200526d84cc53453f8575358e4a2cba957be05f150d3b');
 assert.equal(frozen.files['approved-schema-v4.json'].value.expected,sourceHash);
 const plan=recoverySchemaExpectation({frozenParts:frozen.files['schema-before.json'].value,
  approvedSetupDelta:frozen.files['approved-schema-v4.json'].value.approvedDelta});
 assert.equal(sha((await query(recoverySchemaDigestSQL(plan.before))).trim()),'f358523d9c7c1a5e2b1bfe92ac0472439a22fad8ea4f1d6c88407835635f9652');
 assert.equal(sha((await query(recoverySchemaDigestSQL(plan.source))).trim()),sourceHash);
 const targetHash=sha((await query(recoverySchemaDigestSQL(plan.target))).trim());
 assert.equal(targetHash,'f05b3779e987f7d41ecdaf9881aaa0fb4972508f042374c89bfd71bb3dc600f1');
 await query(recoverySequenceAclSQL(plan.source));
 const body=await query("SELECT prosrc FROM pg_proc WHERE oid='private.roomqc_schema_fingerprint()'::regprocedure;");
 const at=body.lastIndexOf('SELECT encode(sha256(');assert(at>0);
 assertRecoverySchemaParts(plan.target,parseRecoverySchemaJSON(await query('SET search_path=pg_catalog;\n'+body.slice(0,at)+
  'SELECT jsonb_agg(jsonb_build_array(kind,identity,definition) ORDER BY kind COLLATE "C",identity COLLATE "C",definition::text COLLATE "C") FROM parts;')));
 assert.equal((await query('SELECT private.roomqc_schema_fingerprint();')).trim(),targetHash);
 emit('worker_target_schema_verified',{parts:plan.target.length,targetSchemaManifestHash:targetHash});
 const sourceConfig=JSON.parse(await readFile(join(configRoot,'management/operator/setup/issuer/config.json')));
 assert.equal(sourceConfig.target.expected.schemaManifestHash,sourceHash);
 if(frontendArtifactDigest)assert.match(frontendArtifactDigest,/^[a-f0-9]{64}$/);
 const expected={...sourceConfig.target.expected,schemaManifestHash:targetHash,...(frontendArtifactDigest?{frontendArtifactDigest}:{})};
 const cluster={...sourceConfig.target.cluster,url:publicOrigin,internalUrl:'http://127.0.0.1:8000',approvedAddresses:['127.0.0.1']};
 const authority=JSON.parse(await query("SELECT jsonb_build_object('version',row_version,'epoch',epoch) FROM roomqc_control.release_authority WHERE cluster_id='contabo-pilot';",true));
 assert.equal(authority.epoch,4);assert.equal(authority.version,4);
 const keyPair=generateKeyPairSync('ed25519'),issuerId='isolated-recovery',keyId='drill-'+run;
 const trust={version:1,keys:[{issuerId,keyId,publicKey:keyPair.publicKey.export({format:'jwk'}),environments:['local']}]};
 const context={inventoryRef:cluster.inventoryRef,clusterId:cluster.id,hostId:cluster.hostId,environment:'local',expected,
  endpointFingerprint:releaseApprovalEndpointFingerprint({url:cluster.url,internalUrl:cluster.internalUrl,approvedAddresses:cluster.approvedAddresses,credentialRef:cluster.credentialRef})};
 const now=Date.now(),unsigned={version:1,algorithm:'Ed25519',issuerId,keyId,payload:{approvalId:randomUUID(),epoch:5,...context,notBefore:now-5000,expiresAt:now+3600000}};
 const approval={...unsigned,signature:sign(null,releaseApprovalSigningBytes(unsigned),keyPair.privateKey).toString('base64url')};
 const verified=new ReleaseApprovalTrust(trust,{maximumValidityMs:86400000}).verify(approval,context);
 const binding=recoveryBinding(cluster,expected),target={cluster,expected,approval};
 const op=await createPrivateBackupDirectory(join(output,'worker-operator'));
 const wc=await createPrivateBackupDirectory(join(output,'worker-runtime-config'));
 const save=async(dir,name,data)=>writeFile(join(dir,name),typeof data==='string'?data:json(data),{flag:'wx',mode:0o600});
 const dsn=(kind,role)=>'postgresql://'+role+':'+roles[kind][role]+'@127.0.0.1:'+(kind==='business'?'15432/postgres':'15433/roomqc_control')+'?sslmode=disable';
 const identity=async isDirectory=>JSON.parse(await query("SELECT jsonb_build_object('systemIdentifier',(pg_control_system()).system_identifier::text,'databaseOid',(SELECT oid::text FROM pg_database WHERE datname=current_database()),'databaseName',current_database());",isDirectory));
 const ids={business:await identity(false),directory:await identity(true)};
 const budget=JSON.parse(await readFile(join(configRoot,'management/private/budget.json')));budget.environment='local';
 const budgetBytes=json(budget),budgetHash=sha(budgetBytes);
 for(const dir of [op,wc]){await save(dir,'trust.json',trust);await save(dir,'budget.json',budgetBytes)}
 await save(op,'signer.key',secret);await save(op,'publishable.key',publicKey);
 await save(op,'release.dsn',dsn('directory','rq_contabo_release_installer'));
 await save(op,'release.json',{version:1,databaseUrlFile:'/ops/release.dsn',expectedDatabase:'roomqc_control',trustFile:'/ops/trust.json',inventoryFile:'/ops/inventory.json',maximumValidityMs:86400000});
 await save(op,'inventory.json',{version:1,targets:[{cluster:{...cluster,environment:'local'},expected}]});
 await save(op,'approval.json',approval);
 await save(op,'release-command.json',{version:1,operation:'install',expectedVersion:authority.version,key:randomUUID(),requestId:randomUUID(),
  reason:'Install independent local recovery target approval',clusterId:cluster.id,approvalFile:'/ops/approval.json'});
 for(const capability of ['issuer','installer','rotation']){
  const sourcePath=capability==='installer'?'installer':'issuer';
  const c=JSON.parse(await readFile(join(configRoot,'management/operator/setup/'+sourcePath+'/config.json')));
  c.environment='local';c.target=target;c.consumerId='setup-credential-'+capability;c.resourceBudgetFile='/ops/budget.json';c.resourceBudgetSha256=budgetHash;c.releaseTrustFile='/ops/trust.json';
  for(const kind of ['business','directory']){
   c[kind].expected={...ids[kind],role:c[kind].expected.role};c[kind].dsnFile='/ops/'+capability+'-'+kind+'.dsn';
   await save(op,capability+'-'+kind+'.dsn',dsn(kind,c[kind].expected.role));
  }
  if(c.publisher)c.publisher={signer:{algorithm:'HS256',fingerprint:sha(secret),keyFile:'/ops/signer.key',keyId:null},publishableKeyFile:'/ops/publishable.key',outputFile:'/run/roomqc/setup/credential.json'};
  await save(op,capability+'.json',c);
 }
 const state=JSON.parse(await query("SELECT jsonb_build_object('version',m.version,'clusterId',a.cluster_id,'bindingSha256',a.binding_sha256) FROM private.setup_recovery_management m LEFT JOIN private.setup_recovery_authority a USING(singleton) WHERE m.singleton;"));
 const command=(operation,version,extra={})=>({version:1,operation,key:randomUUID(),requestId:randomUUID(),reason:'Reissue scoped setup credentials on isolated recovery target',expectedVersion:version,
  clusterId:cluster.id,bindingSha256:binding.bindingHash,releaseSha256:binding.releaseFingerprint,...extra});
 await save(op,'bind-command.json',command('bind',state.version,{expectedClusterId:state.clusterId,expectedBindingSha256:state.bindingSha256}));
 await save(op,'issue-command.json',command('issue',state.version+1,{predecessorId:null,ttlSeconds:120,overlapSeconds:10,signerAlgorithm:'HS256',signerFingerprint:sha(secret)}));
 await save(op,'rotation-policy.json',{version:1,instanceId:'recovery-rotation-'+run,installerConfigFile:'/ops/rotation.json',journalDirectory:'/journal',ttlSeconds:withRunningWorkers?1800:600,overlapSeconds:10,rotateBeforeSeconds:180,intervalMs:1000});
 const worker=JSON.parse(await readFile(join(configRoot,'management/operator/setup/worker/setup.json')));
 worker.instanceId='recovery-setup-'+run;worker.targets=[{cluster,approval,credentialFile:'/run/roomqc/setup/credential.json'}];
 await save(wc,'setup.json',worker);await save(wc,'setup.dsn',dsn('directory','rq_contabo_setup_runtime'));
 const vols={};for(const suffix of ['worker-operator','worker-config','worker-runtime','worker-journal']){
  const name=project+'-'+suffix;await docker(['volume','create','--label',label,name]);ownedVolumes.push(name);vols[suffix]=name;
 }
 const mount=(source,target,readonly=false)=>['--mount','type=volume,source='+source+',target='+target+(readonly?',readonly':'')];
 const bootstrap=project+'-worker-files';names.push(bootstrap);
 await docker(['create','--name',bootstrap,'--label',label,'--network','none','--user','0:0',...mount(vols['worker-operator'],'/ops'),...mount(vols['worker-config'],'/worker'),...mount(vols['worker-runtime'],'/runtime'),...mount(vols['worker-journal'],'/journal'),
  '--entrypoint','sh',image,'-c','chown -R 1000:1000 /ops /worker /runtime /journal && find /ops /worker /runtime /journal -type d -exec chmod 700 {} + && find /ops /worker -type f -exec chmod 600 {} +']);
 await docker(['cp',op+'/.',bootstrap+':/ops']);await docker(['cp',wc+'/.',bootstrap+':/worker']);await docker(['start','-a',bootstrap]);
 assert.equal(JSON.parse(await docker(['inspect',bootstrap]))[0].State.ExitCode,0);
 const proxy=project+'-worker-loopback';names.push(proxy);
 await docker(['run','-d','--name',proxy,'--label',label,'--network','container:'+project+'-api-gw','--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--memory','128m','--entrypoint','node',image,'--input-type=module','-e',"import net from 'node:net';for(const [port,host]of [[15432,'db'],[15433,'directory']])net.createServer(s=>{const t=net.connect(5432,host);s.on('error',()=>t.destroy());t.on('error',()=>s.destroy());s.pipe(t).pipe(s)}).listen(port,'127.0.0.1');"]);
 const operator=async program=>{
  const name=project+'-worker-op-'+randomUUID().slice(0,8);names.push(name);
  await docker(['create','-i','--name',name,'--label',label,'--network','container:'+project+'-api-gw','--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
   '--memory','256m','-e','NODE_ENV=development',...mount(vols['worker-operator'],'/ops',true),...mount(vols['worker-runtime'],'/run/roomqc/setup'),...mount(vols['worker-journal'],'/journal'),
   '--entrypoint','node',image,'--input-type=module']);
  try{return JSON.parse(await inputDocker(['start','-a','-i',name],program,120000))}finally{await docker(['rm','-f',name])}
 };
 // Directory environment and manifest are rebound only inside owned restores.
 assert.equal((await query("UPDATE roomqc_control.hosts SET environment='local' WHERE id='contabo-pilot' AND environment='production' RETURNING id;",true)).trim(),'contabo-pilot');
 assert.equal((await query("UPDATE private.roomqc_release_manifest SET expected_schema_hash="+q(targetHash)+",frontend_artifact_digest="+q(expected.frontendArtifactDigest)+",installed_at=clock_timestamp() WHERE singleton AND cluster_id='contabo-pilot' AND expected_schema_hash="+q(sourceHash)+" AND frontend_artifact_digest="+q(sourceConfig.target.expected.frontendArtifactDigest)+" RETURNING cluster_id;")).trim(),'contabo-pilot');
 const release=await operator("import {runReleaseInstaller} from './release-installer.mjs';console.log(JSON.stringify(await runReleaseInstaller(['--config-file','/ops/release.json','--command-file','/ops/release-command.json'],{NODE_ENV:'development',ROOMQC_RELEASE_INSTALLER_ALLOW_LOCAL:'true'})));");
 assert.equal(release.receipt.epoch,5);assert.equal(release.receipt.state,'active');
 emit('recovery_release_installed',{environment:'local',epoch:5,productionSigningKeyUsed:false,reviewedTargetSchema:true});
 const install=commandFile=>operator("import {runSetupCredentialInstaller} from './setup-credential-installer.mjs';console.log(JSON.stringify(await runSetupCredentialInstaller(['--allow-local','--config-file','/ops/"+(commandFile==='bind'?'installer':'issuer')+".json','--command-file','/ops/"+commandFile+"-command.json'])));");
 const bound=await install('bind');assert.equal(bound.stateVersion,state.version+1);
 const issued=await install('issue');assert(issued.filePublished&&issued.nativeRpcVerified);
 const retired=Number((await query('SELECT count(*) FROM private.setup_recovery_credentials WHERE id<>'+q(issued.credentialId)+'::uuid AND revoked_at IS NULL;')).trim());assert.equal(retired,0);
 emit('setup_credential_reissued',{nativeRpcVerified:true,oldCredentialsRevoked:true});
 const credential=()=>operator("import {readFile} from 'node:fs/promises';console.log(await readFile('/run/roomqc/setup/credential.json','utf8'));");
 const initialCredential=await credential();
 const scopedProbe=async(value,denied=false)=>JSON.parse(await client(`import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';const c=${JSON.stringify(value)};
  const headers={apikey:c.publishableKey,authorization:'Bearer '+c.token,'content-type':'application/json'};
  const r=await fetch('http://127.0.0.1:8000/rest/v1/rpc/receipt',{method:'POST',signal:AbortSignal.timeout(5000),headers:{...headers,'Content-Profile':'roomqc_setup'},body:JSON.stringify({p_workspace_id:randomUUID()})});
  assert.equal(r.status,${denied?403:200});${denied?'':"assert.equal(await r.json(),null);"}
  const outside=await fetch('http://127.0.0.1:8000/rest/v1/hotels?select=id&limit=1',{headers,signal:AbortSignal.timeout(5000)});assert.equal(outside.status,403);
  console.log(JSON.stringify({receiptStatus:r.status,businessReadDenied:true}));`));
 await scopedProbe(initialCredential);
 const workerName=project+'-setup-worker';names.push(workerName);
 await docker(['run','-d','--name',workerName,'--label',label,'--network','container:'+project+'-api-gw','--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--cpus','0.5','--pids-limit','96',
  '-e','NODE_ENV=development','-e','ROOMQC_RESOURCE_ENVIRONMENT=local','-e','ROOMQC_RESOURCE_BUDGET_FILE=/worker/budget.json','-e','ROOMQC_SETUP_ALLOW_LOCAL=true',
  '-e','ROOMQC_SETUP_CONFIG_FILE=/worker/setup.json','-e','ROOMQC_SETUP_DATABASE_URL_FILE=/worker/setup.dsn','-e','ROOMQC_SETUP_RELEASE_TRUST_FILE=/worker/trust.json',
  ...mount(vols['worker-config'],'/worker',true),...mount(vols['worker-runtime'],'/run/roomqc/setup',true),image,'node','workers/setup-runtime.mjs']);
 const ready=async()=>JSON.parse(await client("let ok=false;for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8095/readyz',{signal:AbortSignal.timeout(2000)})).ok){ok=true;break}}catch{}await new Promise(r=>setTimeout(r,300))}if(!ok)throw Error('RESTORED_SETUP_WORKER_NOT_READY');console.log(JSON.stringify({ready:true}));"));
 await ready();
 const rotation=await runRestoredRotationWorker({project,run,label,image,volumes:vols,mount,docker,names,operator,credential,ready,emit});
 const rotatedCredential=await credential();assert.notEqual(rotatedCredential.token,initialCredential.token);
 assert.equal(JSON.parse(Buffer.from(rotatedCredential.token.split('.')[1],'base64url')).jti,rotation.credentialId);
 // Observe the real database clock; never move expiry or bypass the overlap fence.
 let overlapEnded=false;for(let i=0;i<60;i++){
  overlapEnded=(await query('SELECT retire_after IS NOT NULL AND retire_after<=clock_timestamp() FROM private.setup_recovery_credentials WHERE id='+q(issued.credentialId)+'::uuid;')).trim()==='t';
  if(overlapEnded)break;await new Promise(r=>setTimeout(r,250));
 }
 assert(overlapEnded,'RESTORED_SETUP_OVERLAP_NOT_ENDED');await scopedProbe(initialCredential,true);await scopedProbe(rotatedCredential);
 await docker(['restart',workerName]);await ready();
 const details=JSON.parse(await docker(['inspect',workerName]))[0];assert(details.State.Running);assert(details.Mounts.every(m=>m.RW===false));
 assert.deepEqual(details.Mounts.map(m=>m.Destination).sort(),['/run/roomqc/setup','/worker']);assert.equal(details.Config.User,'1000:1000');
 assert.equal(details.HostConfig.ReadonlyRootfs,true);assert(details.HostConfig.CapDrop.includes('ALL'));
 assert(details.HostConfig.SecurityOpt.includes('no-new-privileges'));
 assert(!Object.values(details.NetworkSettings.Ports??{}).some(bindings=>bindings?.length));
 assert(!JSON.stringify(details.Config).includes(secret));
 const admission=JSON.parse(await client(`const r=await fetch('http://127.0.0.1:8091/api/control/signup-intents',{method:'POST',signal:AbortSignal.timeout(5000),headers:{apikey:${JSON.stringify(publicKey)},origin:${JSON.stringify(publicOrigin)},'content-type':'application/json'},body:'{}'});
  if(r.status!==503||(await r.json()).error!=='SIGNUP_CLOSED')throw Error('RESTORED_CONTROL_SIGNUP_OPEN');console.log(JSON.stringify({closed:true}));`));assert(admission.closed);
 const result={independentTargetSchemaVerified:true,localOnlyApprovalInstalled:true,releaseEpoch:5,productionSignerUsed:false,
  workerCredentialReissued:true,oldScopedCredentialsRevoked:true,nativeRpcVerified:true,setupWorkerReady:true,
  credentialRotationVerified:true,workerReadyAfterRotation:true,workerReadyAfterRestart:true,workerInputsReadOnly:true,
  scopedBusinessReadDenied:true,predecessorDeniedAfterRealOverlap:true,successorNativeRpcVerified:true,
  signupClosedAfterRecovery:true,
  operatorSignerNotMountedInWorker:true,hostPorts:0,productionAdmissionChanged:false,fullServiceRecoveryVerified:false};
 emit('restored_setup_worker_verified',result);
 const observer=await runRestoredHostObserver({directory,query,configRoot,output,roles,budget,project,run,label,docker,inputDocker,names,ownedVolumes,ownedNetworks,emit});
 const healthWorker=await runRestoredHealthWorker({business,query,configRoot,output,roles,publicKey,probeToken,
  cluster,expected,approval,trust,budget,managementOperator,vapidPublicKey,project,run,label,image,docker,inputDocker,client,names,ownedVolumes,ownedNetworks,emit});
 const frontend=withRunningWorkers?await withRunningWorkers():null;
 const continuousRotation=await rotation.finish();
 const hostObserver=await observer.finish();
 return {setupWorker:result,healthWorker,continuousRotation,hostObserver,frontend};
}
