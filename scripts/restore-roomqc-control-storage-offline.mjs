import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {directoryInventorySQL,compareDirectoryInventories} from './roomqc-directory-backup-catalog.mjs';
import {inventory} from './roomqc-backup-catalog.mjs';
import {createPrivateBackupDirectory} from './roomqc-backup-envelope.mjs';
import {assertSetupBackfillAccess} from '../server/control/setup-backfill-files.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const files=['database.dump','expected.json','roles.sql','service-config.tar','service-files.json','storage-files.json','storage.tar'];
export async function restoreControlStorageOffline({bundleDirectory,descriptorSha256,outputDirectory,python=process.env.ROOMQC_BACKUP_PYTHON??'python',withVerifiedDatabase}){
 assert.ok(withVerifiedDatabase===undefined||typeof withVerifiedDatabase==='function','CONTROL_RESTORE_CALLBACK_INVALID');
 const root=resolve(bundleDirectory);await assertSetupBackfillAccess(root,{directory:true});
 assert.match(descriptorSha256,/^[a-f0-9]{64}$/);
 const read=async(name,max=256*1024*1024)=>{
  const path=join(root,name);await assertSetupBackfillAccess(path);
  const stat=await lstat(path);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size<=max);
  const bytes=await readFile(path);assert.ok(bytes.length<=max);return bytes;
 };
 const descriptorBytes=await read('result.json',65536);assert.equal(hash(descriptorBytes),descriptorSha256);
 const descriptor=JSON.parse(descriptorBytes),checksums=JSON.parse(await read('checksums.json',65536));
 assert.equal(descriptor.packetKind,'roomqc-control-storage-backup');assert.equal(descriptor.database,'roomqc_control');
 assert.deepEqual(Object.keys(checksums).sort(),files);assert.deepEqual(checksums,descriptor.checksums);
 for(const name of files)assert.equal(hash(await read(name)),checksums[name],'CONTROL_RECOVERY_CHECKSUM_MISMATCH');
 assert.equal(descriptor.sourceImage,'sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383');
 const expected=JSON.parse(await read('expected.json')),roles=(await read('roles.sql')).toString('utf8');
 assert.equal(expected.filter(r=>r.kind==='table').length,descriptor.tables);assert.ok(descriptor.tables>=42);
 assert.equal((roles.match(/^CREATE ROLE postgres;$/gm)??[]).length,1);assert.ok(!/PASSWORD\s+'/i.test(roles));
 await assertSetupBackfillAccess(resolve(outputDirectory),{directory:true});
 const run=randomBytes(6).toString('hex'),name='roomqc-control-restore-'+run,label='roomqc.control-recovery='+run;
 const output=await createPrivateBackupDirectory(join(resolve(outputDirectory),'control-restore-'+run));
 const docker=(args,input,timeout=30000)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,timeout,maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});
 const sql=statement=>docker(['exec','-i','--user','70:70',name,'psql','-h','/tmp','-U','postgres','-d','roomqc_control','-X','-Atq','-v','ON_ERROR_STOP=1'],statement);
 let created=false,result;
 try{
  const archiveVerification=JSON.parse(execFileSync(python,[fileURLToPath(new URL('./verify-roomqc-recovery-archives.py',import.meta.url)),'--bundle',root,'--output',output],
   {encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:65536}));
  assert.equal(archiveVerification.liveFilesystemTargeted,false);assert.equal(archiveVerification.storage.files,descriptor.storageFiles);
  assert.equal(archiveVerification.serviceConfig.files,descriptor.serviceFiles);
  docker(['run','-d','--pull','never','--name',name,'--label',label,'--network','none','--memory','512m','--cpus','1','--pids-limit','64',
   '--cap-drop','ALL','--security-opt','no-new-privileges','--read-only','--user','70:70',
   '--tmpfs','/tmp:rw,nosuid,noexec,size=256m,uid=70,gid=70,mode=700',
   '--tmpfs','/var/lib/postgresql/data:rw,nosuid,noexec,size=1m,uid=70,gid=70,mode=700',
   '--entrypoint','sh',descriptor.sourceImage,'-c',
   'initdb -D /tmp/recovery-db --username=postgres --auth-local=trust --auth-host=scram-sha-256 >/tmp/initdb.log 2>&1 && exec postgres -D /tmp/recovery-db -c unix_socket_directories=/tmp -c listen_addresses='+
    (withVerifiedDatabase?'*':'')+' -c max_connections=48']);
  created=true;
  let ready=false;
  for(let i=0;i<60;i++){
   try{docker(['exec','--user','70:70',name,'pg_isready','-h','/tmp','-U','postgres']);ready=true;break}catch{await new Promise(r=>setTimeout(r,250))}
  }
  assert.ok(ready,'CONTROL_RECOVERY_DATABASE_NOT_READY');
  docker(['exec','-i','--user','70:70',name,'psql','-h','/tmp','-U','postgres','-d','postgres','-X','-Atq','-v','ON_ERROR_STOP=1'],roles.replace(/^CREATE ROLE postgres;$/m,'-- bootstrap postgres exists'));
  docker(['exec','--user','70:70',name,'createdb','-h','/tmp','-U','postgres','roomqc_control']);
  docker(['exec','-i','--user','70:70',name,'pg_restore','-h','/tmp','-U','postgres','-d','roomqc_control','--exit-on-error','--single-transaction'],await read('database.dump'));
  const restored=inventory(sql('BEGIN READ ONLY;\n'+directoryInventorySQL+'\nCOMMIT;'));
  if(!compareDirectoryInventories(expected,restored)){
   await writeFile(join(output,'restored.private.json'),JSON.stringify(restored)+'\n',{mode:0o600});
   throw new Error('CONTROL_RECOVERY_CATALOG_OR_DATA_MISMATCH');
  }
  const state=JSON.parse(docker(['inspect',name]))[0];assert.equal(state.Config.Labels['roomqc.control-recovery'],run);
  assert.equal(state.HostConfig.NetworkMode,'none');assert.deepEqual(state.NetworkSettings.Ports,{});
  assert.ok(state.Mounts.every(m=>m.Type==='tmpfs'),'CONTROL_RECOVERY_HOST_MOUNT_FORBIDDEN');
  const migrations=Number(sql('SELECT count(*) FROM roomqc_control.schema_migrations;').trim());assert.equal(migrations,27);
  result={kind:'roomqc-control-storage-offline-restore',run,verifiedAt:new Date().toISOString(),sourceHostContacted:false,descriptorSha256,checksums,
   sourceSnapshotAt:descriptor.snapshotAt,sourceImage:descriptor.sourceImage,migrations,
   counts:Object.fromEntries([...new Set(expected.map(r=>r.kind))].map(kind=>[kind,expected.filter(r=>r.kind===kind).length])),aclDefaultsAndGrantOrderNormalized:true,
   archiveVerification,network:'none',hostPorts:0,sourceMounts:0,verified:true,productionAdmissionChanged:false,
   limitations:['This component restore does not itself verify a cross-database checkpoint','Database LOGIN passwords and expiring scoped credentials must be reissued before serving','No Nginx/TLS cutover or full web restart in this check','No unattended remote retention or independent key escrow']};
  if(withVerifiedDatabase)result.runtimeDrill=await withVerifiedDatabase({name,output,run,verification:structuredClone(result)});
 }catch(error){
  await writeFile(join(output,'failure.private.log'),String(error.stack??'CONTROL_RECOVERY_FAILED')+'\n'+String(error.stderr??'')+'\n'+String(error.stdout??''),{mode:0o600});
  throw Object.assign(new Error('CONTROL_RECOVERY_FAILED'),{code:'CONTROL_RECOVERY_FAILED',privateOutput:output});
 }finally{
  if(created){const state=JSON.parse(docker(['inspect',name]))[0];assert.equal(state.Config.Labels['roomqc.control-recovery'],run);docker(['rm','-f',name])}
  assert.equal(docker(['ps','-aq','--filter','label='+label]).trim(),'','CONTROL_RECOVERY_CLEANUP_REQUIRED');
 }
 result.cleaned=true;await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 return {...result,privateOutput:output};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),o=new Map();assert.equal(args.length,6);
  for(let i=0;i<args.length;i+=2){assert.ok(['--bundle-dir','--descriptor-sha256','--output-dir'].includes(args[i])&&!o.has(args[i]));o.set(args[i],args[i+1])}
  console.log(JSON.stringify(await restoreControlStorageOffline({bundleDirectory:o.get('--bundle-dir'),descriptorSha256:o.get('--descriptor-sha256'),outputDirectory:o.get('--output-dir')})));
 }catch(e){console.error(e.code??'CONTROL_RECOVERY_ARGUMENTS_INVALID');process.exitCode=1}
}
