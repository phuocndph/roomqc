// Restore the observer against the same owned directory as the other workers.
// SSH measures an isolated replacement container honestly; no VPS-source key,
// cached VPS measurements, fake Docker daemon or production approval is used.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {createPrivateBackupDirectory} from './roomqc-backup-envelope.mjs';
import {validateHostMonitorTargets,hostTargetFingerprint} from '../server/control/host-monitor.mjs';
const observerImage='roomqc/host-observer@sha256:26f9786b47413a28b7bc5cccac286d64887fcc55c774106672cff47d74b922b8';
const targetImage='roomqc/ssh-drill-target:local-20261031';
const tlsImage='sha256:1cc3a36c18fd5081aaf70f6c8b7010d060ece9304bb12f717abdc2cfea903ca9';
const q=x=>"'"+x.replaceAll("'","''")+"'";
const sha=x=>createHash('sha256').update(x).digest('hex');
export async function runRestoredHostObserver({directory,query,configRoot,output,roles,budget,project,run,label,
 docker,inputDocker,names,ownedVolumes,ownedNetworks,emit}){
 const db=JSON.parse(await docker(['inspect',directory.name]))[0];
 assert.equal(db.Config.Labels['roomqc.control-recovery'],directory.run);
 assert.equal(label,'roomqc.recovery-drill='+run);assert.equal(project,'roomqc-drill-'+run);
 const source=validateHostMonitorTargets(JSON.parse(await readFile(join(configRoot,'management/operator/host-observer/targets.json'))));
 assert.equal(source.length,1);assert.equal(source[0].id,'contabo-pilot');
 const ip='11.252.'+parseInt(run.slice(0,2),16)+'.2',network=project+'-observer-ssh';
 await docker(['network','create','--internal','--label',label,'--subnet',ip.replace(/\.2$/,'.0/29'),network]);ownedNetworks.push(network);
 assert(JSON.parse(await docker(['network','inspect',network]))[0].Internal);
 await docker(['network','connect','--ip',ip.replace(/\.2$/,'.3'),'--alias','observer-directory',network,directory.name]);
 const volumes={};for(const suffix of ['observer-config','observer-tls']){
  const name=project+'-'+suffix;await docker(['volume','create','--label',label,name]);ownedVolumes.push(name);volumes[suffix]=name;
 }
 const mount=(name,path,ro=false)=>['--mount','type=volume,source='+name+',target='+path+(ro?',readonly':'')];
 const files=await createPrivateBackupDirectory(join(output,'host-observer-config'));
 const target={...source[0],environment:'local',ssh:{host:ip,user:source[0].ssh.user,identityFile:'/home/node/.ssh/observer-key'}};
 assert.equal(target.ssh.user,'root');validateHostMonitorTargets({version:1,hosts:[target]},{allowLocal:true});
 const expectedFiles=['scripts/roomqc-host-observer.mjs','server/control/host-monitor.mjs','server/control/workers/host-observer-status.mjs'];
 const manifest=await Promise.all(expectedFiles.map(async path=>({path,sha256:sha(await readFile(new URL('../'+path,import.meta.url)))})));
 const verify=project+'-observer-image-check';names.push(verify);
 const checked=await inputDocker(['run','--rm','-i','--name',verify,'--label',label,'--network','none','--read-only','--cap-drop','ALL',
  '--security-opt','no-new-privileges','--entrypoint','node',observerImage,'--input-type=module'],
  `import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
   for(const v of ${JSON.stringify(manifest)})assert.equal(createHash('sha256').update(await readFile(v.path)).digest('hex'),v.sha256);console.log('MATCH');`);
 assert.equal(checked.trim(),'MATCH');
 const login='rq_contabo_host_observer';assert.match(roles.directory[login],/^[a-f0-9]{64}$/);
 const dsn='postgresql://'+login+':'+roles.directory[login]+'@observer-directory:5432/roomqc_control?sslmode=verify-full';
 for(const [file,text]of Object.entries({'targets.json':JSON.stringify({version:1,hosts:[target]}),'budget.json':JSON.stringify(budget),
  'directory.dsn':dsn,'known_hosts':'pending\n','forced-command.sh':(await readFile(new URL('../deploy/monitoring/host-observer-forced-command.sh',import.meta.url),'utf8')).replaceAll('\r\n','\n')}))
  await writeFile(join(files,file),text,{mode:0o600,flag:'wx'});
 const seed=project+'-observer-seed';names.push(seed);
 await docker(['create','--name',seed,'--label',label,'--network','none','--user','0:0',
  ...mount(volumes['observer-config'],'/config'),'--entrypoint','sh',observerImage,'-c',
  'set -eu; ssh-keygen -q -t ed25519 -N "" -f /config/observer-key; chown -R 1000:1000 /config; chmod 700 /config; chmod 600 /config/*']);
 await docker(['cp',files+'/.',seed+':/config']);await docker(['start','-a',seed]);
 assert.equal(JSON.parse(await docker(['inspect',seed]))[0].State.ExitCode,0);
 const put=async(path,text)=>{
  const name=project+'-observer-put-'+randomUUID().slice(0,8);names.push(name);
  return inputDocker(['run','--rm','-i','--name',name,'--label',label,'--network','none','--user','1000:1000','--read-only',
   '--cap-drop','ALL','--security-opt','no-new-privileges',...mount(volumes['observer-config'],'/config'),'--entrypoint','node',observerImage,'--input-type=module'],
   `import {writeFile} from 'node:fs/promises';await writeFile(${JSON.stringify('/config/'+path)},${JSON.stringify(text)},{mode:0o600});`);
 };
 const ssh=project+'-observer-target';names.push(ssh);
 await docker(['run','-d','--name',ssh,'--label',label,'--network',network,'--ip',ip,
  ...mount(volumes['observer-config'],'/fixture',true),'--entrypoint','sh',targetImage,'-c',
  'set -eu; printf \'restrict,command="/bin/sh /fixture/forced-command.sh" \' > /root/.ssh/authorized_keys; cat /fixture/observer-key.pub >> /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys; ssh-keygen -A >/dev/null 2>&1; exec /usr/sbin/sshd -D -e']);
 const wait=async(fn,code)=>{for(let i=0;i<80;i++){if(await fn())return;await new Promise(r=>setTimeout(r,500))}assert.fail(code)};
 await wait(async()=>Boolean((await docker(['exec',ssh,'sh','-c','if test -s /etc/ssh/ssh_host_ed25519_key.pub; then cat /etc/ssh/ssh_host_ed25519_key.pub; fi'])).trim()),'RESTORED_OBSERVER_SSH_NOT_READY');
 const hostKey=(await docker(['exec',ssh,'cat','/etc/ssh/ssh_host_ed25519_key.pub'])).trim();
 const known=ip+' '+hostKey+'\n';await put('known_hosts',known);
 const tls=project+'-observer-tls';names.push(tls);
 await docker(['run','--rm','--name',tls,'--label',label,'--network','none','--user','0:0','--read-only','--cap-drop','ALL',
  '--tmpfs','/work:rw,nosuid,noexec,size=8m',...mount(volumes['observer-tls'],'/tls'),'--entrypoint','sh',tlsImage,'-c',
  'set -eu; umask 077; cd /work; openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out /tls/ca.crt -days 2 -subj /CN=RoomQC-Recovery-Observer-CA >/dev/null 2>&1; openssl req -newkey rsa:2048 -nodes -keyout /tls/server.key -out server.csr -subj /CN=observer-directory >/dev/null 2>&1; printf "subjectAltName=DNS:observer-directory\\nextendedKeyUsage=serverAuth\\n" > server.ext; openssl x509 -req -in server.csr -CA /tls/ca.crt -CAkey ca.key -CAcreateserial -out /tls/server.crt -days 2 -extfile server.ext >/dev/null 2>&1; chmod 755 /tls; chmod 444 /tls/ca.crt']);
 const readTls=async file=>{
  const name=project+'-observer-read-'+file.replace('.','-');names.push(name);
  return docker(['run','--rm','--name',name,'--label',label,'--network','none','--user','0:0','--read-only',
   ...mount(volumes['observer-tls'],'/tls',true),'--entrypoint','cat',tlsImage,'/tls/'+file]);
 };
 for(const file of ['server.key','server.crt'])await inputDocker(['exec','-i','--user','70:70',directory.name,'sh','-c',
  'umask 077; cat > /tmp/recovery-db/'+file],await readTls(file));
 await put('directory-ca.crt',await readTls('ca.crt'));
 await query("ALTER SYSTEM SET ssl='on';\nALTER SYSTEM SET ssl_cert_file='/tmp/recovery-db/server.crt';\nALTER SYSTEM SET ssl_key_file='/tmp/recovery-db/server.key';",true);
 await inputDocker(['exec','-i','--user','70:70',directory.name,'sh','-c','cat >> /tmp/recovery-db/pg_hba.conf'],
  '\nhostssl roomqc_control '+login+' '+ip.replace(/\.2$/,'.0/29')+' scram-sha-256\n');
 assert.equal((await query('SELECT pg_reload_conf();',true)).trim(),'t');
 await wait(async()=>(await query('SHOW ssl;',true)).trim()==='on','RESTORED_OBSERVER_TLS_NOT_ENABLED');
 // This one-time rebinding occurs only in the owner-verified isolated restore.
 // Retire the source observation instead of presenting it as fresh target data.
 const row=JSON.parse(await query("SELECT jsonb_build_object('name',h.name,'region',h.region,'providerLabel',h.provider_label,'environment',h.environment,'fingerprint',r.target_fingerprint) FROM roomqc_control.hosts h JOIN roomqc_control.host_resources_current r ON r.host_id=h.id WHERE h.id='contabo-pilot';",true));
 for(const key of ['name','region','providerLabel','environment'])assert.equal(row[key],target[key]);
 assert.equal(row.fingerprint,hostTargetFingerprint(source[0]));
 await query("BEGIN; DELETE FROM roomqc_control.host_resources_current WHERE host_id='contabo-pilot' AND target_fingerprint="+q(row.fingerprint)+"; INSERT INTO roomqc_control.cluster_events(cluster_id,type,before_state,after_state,source) VALUES('contabo-pilot','recovery_host_observer_target_rebound',"+
  q(JSON.stringify({fingerprint:row.fingerprint}))+"::jsonb,"+q(JSON.stringify({fingerprint:hostTargetFingerprint(target),environment:'local',newSshIdentity:true}))+"::jsonb,'isolated_checkpoint_recovery'); COMMIT;",true);
 const worker=project+'-host-observer';names.push(worker);
 await docker(['run','-d','--name',worker,'--label',label,'--network',network,'--user','1000:1000','--read-only',
  '--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--cpus','0.5','--pids-limit','64','--restart','unless-stopped',
  '--tmpfs','/run/roomqc:rw,nosuid,noexec,size=1m,uid=1000,gid=1000,mode=0700',
  '-e','NODE_ENV=development','-e','ROOMQC_RESOURCE_ENVIRONMENT=local','-e','ROOMQC_RESOURCE_BUDGET_FILE=/home/node/.ssh/budget.json',
  '-e','ROOMQC_HOST_OBSERVER_ALLOW_LOCAL_TARGETS=true','-e','NODE_EXTRA_CA_CERTS=/home/node/.ssh/directory-ca.crt',
  ...mount(volumes['observer-config'],'/home/node/.ssh',true),
  observerImage,'node','scripts/roomqc-host-observer.mjs','--targets-file','/home/node/.ssh/targets.json',
  '--database-url-file','/home/node/.ssh/directory.dsn','--status-file','/run/roomqc/observer-status.json','--watch','--interval-seconds','30','--allow-local-targets']);
 const sample=async()=>JSON.parse(await query("SELECT coalesce((SELECT jsonb_build_object('observedAt',observed_at,'fingerprint',target_fingerprint,'cpu',cpu_count,'memory',memory_total_bytes,'disk',disk_total_bytes,'docker',docker_server_version) FROM roomqc_control.host_resources_current WHERE host_id='contabo-pilot'),'null'::jsonb);",true));
 const status=async()=>{
  // The status tmpfs starts empty on every container start/restart.
  const raw=await docker(['exec',worker,'sh','-c','if test -f /run/roomqc/observer-status.json; then cat /run/roomqc/observer-status.json; else printf "null"; fi']);
  return JSON.parse(raw)??{ok:false,failed:0};
 };
 await wait(async()=>{const s=await sample();return s&&s.fingerprint===hostTargetFingerprint(target)},'RESTORED_OBSERVER_NO_SAMPLE');
 const first=await sample();assert(first.cpu>0&&Number(first.memory)>0&&Number(first.disk)>0);assert.equal(first.docker,null);
 assert.equal((await query("SELECT count(*) FROM pg_stat_activity a JOIN pg_stat_ssl s USING(pid) WHERE a.usename='"+login+"' AND s.ssl;",true)).trim(),'1');
 await wait(async()=>(await status()).ok,'RESTORED_OBSERVER_NOT_READY');
 await docker(['stop','--time','35',worker],undefined,40000);
 const frozen=await sample();
 await put('known_hosts',ip+' '+(await docker(['exec',ssh,'cat','/fixture/observer-key.pub'])).trim()+'\n');
 await docker(['start',worker]);await wait(async()=>(await status()).failed===1,'RESTORED_OBSERVER_WRONG_KEY_ACCEPTED');
 assert.equal((await sample()).observedAt,frozen.observedAt);assert.equal((await status()).ok,false);
 await put('known_hosts',known);await docker(['restart',worker]);
 await wait(async()=>{const s=await sample();return s?.observedAt>frozen.observedAt&&(await status()).ok},'RESTORED_OBSERVER_RESTART_NOT_READY');
 const second=await sample();
 const info=JSON.parse(await docker(['inspect',worker]))[0];assert.equal(info.Config.User,'1000:1000');
 assert(info.HostConfig.ReadonlyRootfs&&info.HostConfig.CapDrop.includes('ALL')&&info.HostConfig.SecurityOpt.includes('no-new-privileges'));
 assert(info.Mounts.filter(m=>m.Type==='volume').every(m=>!m.RW));assert(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
 emit('restored_host_observer_restart_verified',{realSsh:true,directoryTls:true,wrongHostKeyRejected:true,newSshIdentity:true,sourceSampleRetired:true});
 return {async finish(){
  await wait(async()=>(await sample()).observedAt>second.observedAt,'RESTORED_OBSERVER_CONTINUOUS_SAMPLE_MISSING');
  await docker(['stop','--time','35',worker],undefined,40000);
  const stopped=JSON.parse(await docker(['inspect',worker]))[0];assert.equal(stopped.State.ExitCode,0);
  const logs=await docker(['logs',worker]);assert(!logs.includes(dsn)&&!logs.includes(roles.directory[login]));
  const result={realSsh:true,sameRestoredDirectory:true,sourceHostId:source[0].id,targetHostId:target.id,targetEnvironment:'local',
   targetMeasurementScope:'isolated-replacement-container',actualDockerDaemon:false,dockerUnavailableReportedHonestly:true,
   newSshIdentity:true,sourcePrivateSshKeyRead:false,pinnedNewHostKey:true,sourceSampleRetired:true,
   wrongHostKeyRejected:true,lastSamplePreservedOnFailure:true,directoryTlsVerified:true,
   leastPrivilegeLogin:true,budgetedPoolMax:1,readyAfterRestart:true,continuousFreshSamples:true,gracefulStop:true,
   nonroot:true,inputsReadOnly:true,hostPorts:0,sourceHostContacted:false,productionAdmissionChanged:false,
   image:observerImage,sourceBindings:manifest,fullServiceRecoveryVerified:false};
  emit('restored_host_observer_verified',result);return result;
 }};
}
