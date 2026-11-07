// Native health recovery on the owned logical restore. Source-host measurements
// and source probe encryption keys are never reused.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join,posix} from 'node:path';
import {createPrivateBackupDirectory} from './roomqc-backup-envelope.mjs';
import {prometheusConfiguration,nodeMountInclude} from '../server/control/monitoring-config.mjs';
import {validateTelemetryTarget,telemetryTargetFingerprint} from '../server/control/telemetry-source.mjs';
const json=x=>JSON.stringify(x,null,2)+'\n';
const unescapeMount=x=>x.replace(/\\040/g,' ').replace(/\\134/g,'\\');
const mounts=text=>text.trim().split('\n').map(line=>{
 const [left,right]=line.split(' - '),a=left.split(' '),b=right?.split(' ');
 assert(a.length>=6&&b?.length>=3,'RECOVERY_MOUNTINFO_INVALID');
 return {deviceNumber:a[2],root:unescapeMount(a[3]),mountpoint:unescapeMount(a[4]),fstype:b[0],device:unescapeMount(b[1]),options:b.slice(2).join(' ')};
});
export function recoveryLayerDataPath(text,dataDirectory){
 assert.equal(dataDirectory,'/tmp/roomqc-restore-data');
 const roots=mounts(text).filter(m=>m.mountpoint==='/');assert.equal(roots.length,1);
 assert.equal(roots[0].fstype,'overlay','RECOVERY_WRITABLE_LAYER_REQUIRED');
 const upper=roots[0].options.split(',').filter(s=>s.startsWith('upperdir='));assert.equal(upper.length,1);
 const path=unescapeMount(upper[0].slice(9));
 assert(path.startsWith('/')&&posix.normalize(path)===path&&!/[\x00-\x1f]/.test(path));
 return path+dataDirectory;
}
export function recoveryDeviceMount(text,rawDevice){
 const d=BigInt(rawDevice),major=((d>>8n)&0xfffn)|((d>>32n)&0xfffff000n),minor=(d&0xffn)|((d>>12n)&0xffffff00n);
 const key=major+':'+minor;
 const candidates=mounts(text).filter(m=>m.deviceNumber===key&&m.root==='/'&&['ext4','xfs','btrfs'].includes(m.fstype)
  &&/^\/dev\/[a-zA-Z0-9._/-]+$/.test(m.device)).sort((a,b)=>a.mountpoint.length-b.mountpoint.length||a.mountpoint.localeCompare(b.mountpoint));
 assert(candidates.length,'RECOVERY_DATA_FILESYSTEM_NOT_MAPPED');
 const {mountpoint,device,fstype}=candidates[0];return {id:'database',mountpoint,device,fstype};
}
export const recoveryHostReaderProgram=layerPath=>`import {readFile,stat} from 'node:fs/promises';
 const s=await stat(${JSON.stringify('/host'+layerPath)},{bigint:true});if(!s.isDirectory())throw Error('RECOVERY_LAYER_DATA_MISSING');
 const text=await readFile('/host/proc/1/mountinfo','utf8');
 const mounted={};for(const line of text.trim().split('\\n')){const [a,b]=line.split(' - ');if(!/^(ext4|xfs|btrfs) /.test(b))continue;
  const p=a.split(' ')[4].replace(/\\\\040/g,' ');try{mounted[p]=(await stat('/host'+p,{bigint:true})).dev.toString()}catch{}}
 console.log(JSON.stringify({device:s.dev.toString(),mountinfo:text,mounted}));`;
export async function runRestoredHealthWorker({business,query,configRoot,output,roles,publicKey,probeToken,
 cluster,expected,approval,trust,budget,managementOperator,vapidPublicKey,project,run,label,image,
 docker,inputDocker,client,names,ownedVolumes,ownedNetworks,emit}){
 const inspect=JSON.parse(await docker(['inspect',business.name]))[0];
 assert.equal(inspect.Config.Labels['roomqc.offline-restore'],business.run);
 const dataDirectory=(await query('SHOW data_directory;')).trim();
 const layerPath=recoveryLayerDataPath(await docker(['exec',business.name,'cat','/proc/self/mountinfo']),dataDirectory);
 const hostReader=project+'-health-host-reader';names.push(hostReader);
 await docker(['create','-i','--name',hostReader,'--label',label,'--network','none','--read-only','--user','0:0','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--mount','type=bind,source=/,target=/host,readonly','--entrypoint','node',image,'--input-type=module']);
 const host=JSON.parse(await inputDocker(['start','-a','-i',hostReader],recoveryHostReaderProgram(layerPath)));
 const dataMount=recoveryDeviceMount(host.mountinfo,host.device);assert.equal(host.mounted[dataMount.mountpoint],host.device);
 const target=validateTelemetryTarget({clusterId:cluster.id,hostId:cluster.hostId,environment:'local',
  dbConnectionBudget:Number((await query('SHOW max_connections;')).trim()),
  measurementScope:process.platform==='win32'?'docker-desktop-vm':'linux-host',dataMounts:[dataMount]});
 emit('recovery_metrics_target_verified',{measurementScope:target.measurementScope,dataLayerMappedByDevice:true,targetFingerprint:telemetryTargetFingerprint(target)});
 const directory=await createPrivateBackupDirectory(join(output,'health-worker-config'));
 const exporter=await createPrivateBackupDirectory(join(output,'health-exporter-config'));
 const prom=await createPrivateBackupDirectory(join(output,'health-prometheus-config'));
 const save=(dir,file,value)=>writeFile(join(dir,file),typeof value==='string'?value:json(value),{flag:'wx',mode:0o600});
 const dsn=role=>'postgresql://'+role+':'+roles.directory[role]+'@127.0.0.1:15433/roomqc_control?sslmode=disable';
 const health=JSON.parse(await readFile(join(configRoot,'management/operator/monitoring/health.json')));
 health.instanceId='recovery-health-'+run;health.targets=[{target,prometheus:{url:'http://127.0.0.1:19090',approvedAddresses:['127.0.0.1']}}];
 const originalMetadata=JSON.parse(await readFile(join(configRoot,'management/operator/monitoring/managed-probes.json')));
 const healthCluster=Object.fromEntries(['id','hostId','url','internalUrl','inventoryRef','credentialRef','approvedAddresses'].map(k=>[k,cluster[k]]));
 healthCluster.publishableKey=publicKey;
 const metadata={version:2,targets:[{cluster:healthCluster,expected,approval,storage:originalMetadata.targets[0].storage}]};
 const keyId='recovery-'+run,keyring={version:1,activeKeyId:keyId,keys:{[keyId]:randomBytes(32).toString('hex')}};
 for(const [file,value]of Object.entries({'health.json':health,'managed-probes.json':metadata,'keyring.json':keyring,'trust.json':trust,'budget.json':budget,
  'metrics.dsn':dsn('rq_contabo_metrics'),'probe.dsn':dsn('rq_contabo_probe_runtime')}))await save(directory,file,value);
 assert.match(roles.business.roomqc_monitor,/^[a-f0-9]{64}$/);
 for(const [file,value]of Object.entries({'postgres-user':'roomqc_monitor','postgres-password':roles.business.roomqc_monitor,
  'postgres-uri':'db:5432/postgres?sslmode=disable&connect_timeout=3','queries.yml':await readFile(new URL('../deploy/monitoring/queries.yml',import.meta.url),'utf8')}))await save(exporter,file,value);
 await save(prom,'roomqc.yml',prometheusConfiguration(target,{intervalSeconds:5}));
 const volumes={};for(const suffix of ['health-worker','health-exporter','health-prom-config','health-prom-data']){
  const name=project+'-'+suffix;await docker(['volume','create','--label',label,name]);ownedVolumes.push(name);volumes[suffix]=name;
 }
 const mount=(source,destination)=>['--mount','type=volume,source='+source+',target='+destination];
 const files=project+'-health-files';names.push(files);
 await docker(['create','--name',files,'--label',label,'--network','none','--user','0:0',
  ...mount(volumes['health-worker'],'/health'),...mount(volumes['health-exporter'],'/exporter'),...mount(volumes['health-prom-config'],'/prom-config'),...mount(volumes['health-prom-data'],'/prom-data'),
  '--entrypoint','sh',image,'-c','chown -R 1000:1000 /health && chown -R 65534:65534 /exporter /prom-config /prom-data && find /health /exporter /prom-config /prom-data -type d -exec chmod 700 {} + && find /health /exporter /prom-config -type f -exec chmod 600 {} +']);
 for(const [dir,dest]of [[directory,'/health'],[exporter,'/exporter'],[prom,'/prom-config']])await docker(['cp',dir+'/.',files+':'+dest]);
 await docker(['start','-a',files]);assert.equal(JSON.parse(await docker(['inspect',files]))[0].State.ExitCode,0);
 const metricsNetwork=project+'-metrics';await docker(['network','create','--internal','--label',label,metricsNetwork]);ownedNetworks.push(metricsNetwork);
 const template=JSON.parse(await readFile(new URL('../deploy/monitoring/compose.yml',import.meta.url),'utf8'));
 const model={name:project,services:{},networks:{metrics:{external:true,name:metricsNetwork},backend:{external:true,name:project+'-internal'}},volumes:{}};
 for(const [suffix,name]of Object.entries(volumes))model.volumes[suffix]={external:true,name};
 for(const [name,original]of Object.entries(template.services)){
  const service=structuredClone(original);service.container_name=project+'-health-'+name;names.push(service.container_name);service.restart='no';service.pull_policy='never';
  service.labels={'roomqc.recovery-drill':run};service.command=service.command.map(v=>v.replace('${ROOMQC_MONITOR_MOUNT_INCLUDE:?approved mount regex required}',nodeMountInclude(target)));
  delete service.secrets;service.networks={metrics:{aliases:[name]},...(name==='node-exporter'?{}:{backend:{aliases:['health-'+name]}})};
  if(name==='prometheus'){service.volumes=['health-prom-config:/etc/prometheus:ro','health-prom-data:/prometheus'];service.command=service.command.map(v=>v==='--storage.tsdb.retention.time=15d'?'--storage.tsdb.retention.time=1h':v)}
  if(name==='postgres-exporter'){service.volumes=['health-exporter:/run/secrets:ro'];service.command=service.command.map(v=>v==='--extend.query-path=/etc/roomqc/queries.yml'?'--extend.query-path=/run/secrets/queries.yml':v)}
  model.services[name]=service;
 }
 const composeFile=join(output,'health-runtime.compose.json');await writeFile(composeFile,json(model),{mode:0o600,flag:'wx'});
 const compose=['compose','-p',project,'-f',composeFile];await docker([...compose,'config','--quiet']);
 await docker([...compose,'up','-d','--no-deps','--pull','never'],undefined,90000);
 const relay=project+'-health-loopback';names.push(relay);
 await docker(['run','-d','--name',relay,'--label',label,'--network','container:'+project+'-api-gw','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--memory','128m','--entrypoint','node',image,'--input-type=module','-e',"import net from 'node:net';net.createServer(s=>{const t=net.connect(9090,'health-prometheus');s.on('error',()=>t.destroy());t.on('error',()=>s.destroy());s.pipe(t).pipe(s)}).listen(19090,'127.0.0.1');"]);
 const prior=JSON.parse(await query("SELECT jsonb_build_object('revision',revision,'canary',auth_user_id,'session',auth_session_id,'keyId',envelope->>'keyId') FROM roomqc_control.probe_credentials WHERE cluster_id='contabo-pilot';",true));
 const canary=JSON.parse(await readFile(join(configRoot,'management/operator/monitoring/canary-account.private.json')));
 const apiRole='rq_contabo_pilot_mgmt_api_1';assert(roles.directory[apiRole]);
 const commandInput={cluster:{...healthCluster,vapidPublicKey},expected,approval,trust,target,keyring,canary,managementOperator,
  credential:{publishableKey:publicKey,token:probeToken},prior,apiDsn:dsn(apiRole),installerDsn:dsn('rq_contabo_probe_installer')};
 const installed=JSON.parse(await client(`import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import pg from 'pg';
  import {ControlStore} from './store.mjs';import {ClusterGateway} from './cluster.mjs';import {clusterCommand} from './admin.mjs';
  import {supportCommandAuthorizer} from './support-authority.mjs';import {ReleaseValidationCatalog} from './release-validation.mjs';
  import {ReleaseApprovalTrust} from './release-approval.mjs';import {ProbeCredentialStore,probeBinding} from './probe-credentials.mjs';import {ProbeKeyring} from './probe-secrets.mjs';
  import {telemetryTargetFingerprint} from './telemetry-source.mjs';const i=${JSON.stringify(commandInput)};
  const login=async account=>{const r=await fetch('http://127.0.0.1:8000/auth/v1/token?grant_type=password',{method:'POST',signal:AbortSignal.timeout(5000),headers:{apikey:i.credential.publishableKey,'content-type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});assert.equal(r.status,200);return r.json()};
  const c=await login(i.canary),o=await login(i.managementOperator);assert.equal(c.user.id,i.prior.canary);assert(c.user.email_confirmed_at);
  const cluster=i.cluster,entry={...cluster,id:cluster.inventoryRef,environment:'local',releaseId:i.expected.releaseId,schemaManifestHash:i.expected.schemaManifestHash,frontendReady:true,telemetryTarget:i.target};
  const trust=new ReleaseApprovalTrust(i.trust,{maximumValidityMs:86400000});
  const config={production:false,allowLocal:true,poolMax:1,databaseUrl:i.apiDsn,clusters:[cluster],supportClusterId:cluster.id,
   inventory:new Map([[cluster.inventoryRef,entry]]),credentials:new Map([[cluster.credentialRef,{publishableKey:cluster.publishableKey,vapidPublicKey:cluster.vapidPublicKey}]]),
   releaseValidation:new ReleaseValidationCatalog({version:2,entries:[{inventoryRef:cluster.inventoryRef,approval:i.approval,credential:i.credential}]},{trust})};
  const store=new ControlStore(config),gateway=new ClusterGateway(config,undefined,store),installerPool=new pg.Pool({connectionString:i.installerDsn,max:1,connectionTimeoutMillis:2000,statement_timeout:8000});
  try{
   const actor=await gateway.supportActor(o.access_token),authorize=supportCommandAuthorizer(gateway,actor,o.access_token);
   for(const operation of ['validate','bind_telemetry_target']){
    const row=await store.admin.cluster(cluster.id),payload=operation==='validate'?{}:{targetFingerprint:telemetryTargetFingerprint(i.target)};
    const command=clusterCommand({operation,expectedVersion:Number(row.row_version),reason:'Approve exact isolated recovery runtime target',payload},randomUUID(),cluster.id);
    await store.admin.execute(actor,command,randomUUID(),operation==='validate'?await gateway.validateCluster(row):undefined,authorize);
   }
   const access=JSON.parse(Buffer.from(c.access_token.split('.')[1],'base64url'));
   assert.notEqual(access.session_id,i.prior.session);
   const keyring=new ProbeKeyring({activeKeyId:i.keyring.activeKeyId,keys:new Map(Object.entries(i.keyring.keys).map(([k,v])=>[k,Buffer.from(v,'hex')]))});
   const result=await new ProbeCredentialStore(installerPool,keyring).install(probeBinding(cluster,i.expected),{credential:i.credential,auth:{token:c.access_token,refreshToken:c.refresh_token,userId:c.user.id,sessionId:access.session_id}},{expectedRevision:Number(i.prior.revision)});
   assert.equal(result.revision,Number(i.prior.revision)+1);assert.equal(result.state,'ready');
   console.log(JSON.stringify({installed:true,sameCanaryIdentity:true,newAuthSession:true,newEncryptionKey:true,auditedTargetCommands:2,credentialRevision:result.revision}));
  }finally{await installerPool.end();await store.close()}`));
 assert(installed.installed);assert.notEqual(prior.keyId,keyId);
 emit('health_probe_credentials_reissued',installed);
 const worker=project+'-health-worker';names.push(worker);
 const env={NODE_ENV:'development',ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_RESOURCE_BUDGET_FILE:'/health/budget.json',ROOMQC_HEALTH_ALLOW_LOCAL:'true',
  ROOMQC_HEALTH_CONFIG_FILE:'/health/health.json',ROOMQC_HEALTH_DATABASE_URL_FILE:'/health/metrics.dsn',ROOMQC_HEALTH_PROBE_CONFIG_FILE:'/health/managed-probes.json',
  ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE:'/health/probe.dsn',ROOMQC_HEALTH_PROBE_KEYRING_FILE:'/health/keyring.json',ROOMQC_HEALTH_RELEASE_TRUST_FILE:'/health/trust.json',ROOMQC_HEALTH_RELEASE_APPROVAL_MAX_VALIDITY_MS:'86400000'};
 const started=Date.now();await docker(['run','-d','--name',worker,'--label',label,'--network','container:'+project+'-api-gw','--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--memory','256m','--cpus','0.5','--pids-limit','96',...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),
  '--mount','type=volume,source='+volumes['health-worker']+',target=/health,readonly',image,'node','workers/health-runtime.mjs']);
 const ready=async()=>JSON.parse(await client("let state;for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:8093/readyz',{signal:AbortSignal.timeout(1000)});state=await r.json();if(r.ok){console.log(JSON.stringify({ready:true}));process.exit(0)}}catch{}await new Promise(r=>setTimeout(r,1000))}throw Error('RESTORED_HEALTH_WORKER_NOT_READY_'+(state?.lastErrorCode??'NO_STATE'));"));
 await ready();
 const snapshot=async()=>JSON.parse(await query("SELECT jsonb_build_object('observedAt',h.observed_at,'generation',h.source_generation,'probes',h.evaluator_state->'probes','scope',h.evaluator_state->>'measurementScope','manualClosed',p.manual_closed,'operatorReopenRequired',p.operator_reopen_required,'proof',h.evaluator_state->'probeEvidence','values',h.normalized_values) FROM roomqc_control.cluster_health_current h JOIN roomqc_control.cluster_policies p USING(cluster_id) WHERE cluster_id='contabo-pilot';",true));
 const first=await snapshot();assert(Date.parse(first.observedAt)>=started-5000);assert(first.manualClosed&&first.operatorReopenRequired);
 for(const name of ['auth','rest','storage','realtime','functions'])assert.equal(first.probes[name],true,'RECOVERY_SERVICE_PROBE_'+name);
 await docker(['restart',worker]);await ready();const second=await snapshot();assert(Date.parse(second.observedAt)>Date.parse(first.observedAt));
 for(const name of ['auth','rest','storage','realtime','functions'])assert.equal(second.probes[name],true);
 for(const name of [worker,...Object.keys(template.services).map(n=>project+'-health-'+n)]){
  const info=JSON.parse(await docker(['inspect',name]))[0];assert(info.State.Running);assert(info.HostConfig.ReadonlyRootfs);assert(info.HostConfig.CapDrop.includes('ALL'));
  assert(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
  if(name===worker){assert.equal(info.Config.User,'1000:1000');assert.deepEqual(info.Mounts.map(m=>[m.Destination,m.RW]),[['/health',false]])}
 }
 assert.equal((await query('SELECT private.roomqc_schema_fingerprint();')).trim(),expected.schemaManifestHash);
 const result={...installed,actualMetrics:true,dataLayerMappedByDevice:true,measurementScope:target.measurementScope,
  workerReady:true,workerReadyAfterRestart:true,freshSnapshotAfterRestart:true,fiveServices:second.probes,twoLeastPrivilegeLogins:true,
  workerReadOnly:true,operatorCredentialsNotMounted:true,sourceProbeKeyringUsed:false,hostPorts:0,manualClosed:true,directLatchReset:false,
  schemaUnchanged:true,productionAdmissionChanged:false,fullServiceRecoveryVerified:false};
 emit('restored_health_worker_verified',result);return result;
}
