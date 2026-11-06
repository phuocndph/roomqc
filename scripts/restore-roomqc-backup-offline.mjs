// Restore a saved logical backup without contacting or requiring the old host.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {lstat,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inventorySQL,inventory,compareBackupInventories} from './roomqc-backup-catalog.mjs';
import {restoreArchiveWithExtensionMembers} from './roomqc-restore-extension-members.mjs';
import {createPrivateBackupDirectory} from './roomqc-backup-envelope.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const required=['database.dump','expected.json','pgmq-queues.sql','roles.sql'];
export async function restoreRoomqcBackupOffline({backupDirectory,descriptorSha256,outputDirectory,withVerifiedDatabase}){
  assert.ok(withVerifiedDatabase===undefined||typeof withVerifiedDatabase==='function','OFFLINE_RESTORE_CALLBACK_INVALID');
  assert.match(descriptorSha256,/^[a-f0-9]{64}$/,'OFFLINE_BACKUP_DESCRIPTOR_REQUIRED');
  const started=Date.now(),root=resolve(backupDirectory);
  assert.ok((await lstat(root)).isDirectory()&&!(await lstat(root)).isSymbolicLink(),'OFFLINE_BACKUP_DIRECTORY_INVALID');
  const read=async(name,max)=>{
    const file=join(root,name),info=await lstat(file);
    assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&info.size<=max,'OFFLINE_BACKUP_FILE_INVALID');
    const bytes=await readFile(file);assert.ok(bytes.length<=max);return bytes;
  };
  const descriptorBytes=await read('result.json',64*1024);
  assert.equal(sha(descriptorBytes),descriptorSha256,'OFFLINE_BACKUP_DESCRIPTOR_MISMATCH');
  const descriptor=JSON.parse(descriptorBytes),checksums=JSON.parse(await read('checksums.json',64*1024));
  assert.match(descriptor.sourceImage,/^sha256:[a-f0-9]{64}$/,'OFFLINE_BACKUP_IMAGE_REQUIRED');
  assert.deepEqual(Object.keys(checksums).sort(),required);
  assert.deepEqual(checksums,descriptor.checksums,'OFFLINE_BACKUP_CHECKSUM_MANIFEST_MISMATCH');
  for(const name of required)assert.equal(sha(await read(name,256*1024*1024)),checksums[name],'OFFLINE_BACKUP_CONTENT_MISMATCH');
  const expected=JSON.parse(await read('expected.json',16*1024*1024));
  assert.ok(Array.isArray(expected)&&expected.filter(row=>row.kind==='table').length>100,'OFFLINE_BACKUP_CATALOG_REQUIRED');
  const savedRoles=(await read('roles.sql',4*1024*1024)).toString('utf8');
  const savedQueues=(await read('pgmq-queues.sql',16*1024*1024)).toString('utf8');
  assert.equal((savedRoles.match(/^CREATE ROLE supabase_admin;$/gm)||[]).length,1,'OFFLINE_BACKUP_BOOTSTRAP_ROLE_REQUIRED');
  assert.ok(!/PASSWORD\s+'/i.test(savedRoles),'OFFLINE_BACKUP_ROLE_PASSWORDS_FORBIDDEN');
  const run=randomBytes(6).toString('hex'),name='roomqc-offline-restore-'+run,label='roomqc.offline-restore='+run;
  await mkdir(resolve(outputDirectory),{recursive:true,mode:0o700});
  // mode:0700 alone does not restrict inherited Windows ACLs. Establish a
  // private leaf before writing SQL or failure diagnostics from the restore.
  const output=await createPrivateBackupDirectory(join(resolve(outputDirectory),'offline-restore-'+run));
  const docker=(args,input,timeout=30000)=>execFileSync('docker',args,{input,encoding:'utf8',windowsHide:true,
    timeout,maxBuffer:20_000_000,stdio:['pipe','pipe','pipe']});
  const sql=statement=>docker(['exec','-i',name,'psql','-U','supabase_admin','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],statement);
  const owned=()=>{
    const matches=docker(['ps','-aq','--filter','label='+label]).trim();
    if(!matches)return null;
    assert.equal(matches.split(/\r?\n/).length,1,'OFFLINE_RESTORE_OWNERSHIP_AMBIGUOUS');
    const state=JSON.parse(docker(['inspect',name]))[0];
    assert.equal(state.Config.Labels['roomqc.offline-restore'],run);assert.equal(state.Name,'/'+name);return state;
  };
  let result;
  try{
    const image=JSON.parse(docker(['image','inspect',descriptor.sourceImage]))[0];
    assert.equal(image.Id,descriptor.sourceImage,'OFFLINE_BACKUP_IMAGE_MISMATCH');
    assert.deepEqual(image.Config.Volumes??{}, {}, 'OFFLINE_RESTORE_IMAGE_MUST_NOT_CREATE_ANONYMOUS_VOLUMES');
    docker(['run','-d','--pull','never','--name',name,'--label',label,'--network','none','--memory','1536m',
      '--cpus','1','--pids-limit','128','--cap-drop','ALL','--security-opt','no-new-privileges','--user','postgres',
      '--entrypoint','sh',descriptor.sourceImage,'-c',
      'initdb -D /tmp/roomqc-restore-data --username=supabase_admin --auth-local=trust --auth-host=scram-sha-256 --locale=en_US.UTF-8 >/tmp/initdb.log 2>&1 && exec postgres -D /tmp/roomqc-restore-data -c shared_preload_libraries=pg_cron,pg_net,supabase_vault -c cron.database_name=postgres -c cron.launch_active_jobs=off -c listen_addresses=* -c max_connections=100']);
    let ready=false;
    for(let attempt=0;attempt<80;attempt++){
      try{sql('SELECT 1;');ready=true;break}catch{await new Promise(accept=>setTimeout(accept,250))}
    }
    assert.ok(ready,'OFFLINE_RESTORE_DATABASE_NOT_READY');
    sql(savedRoles.replace(/^CREATE ROLE supabase_admin;$/m,'-- bootstrap role already exists'));
    docker(['cp',join(root,'database.dump'),name+':/tmp/roomqc-restore.dump']);
    const restore=await restoreArchiveWithExtensionMembers({docker,target:name,archive:'/tmp/roomqc-restore.dump',expected,directory:output});
    sql(savedQueues);sql('ALTER DATABASE postgres OWNER TO postgres;');
    sql(restore.defaultAclSql || `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgmq REVOKE ALL PRIVILEGES ON TABLES FROM pg_monitor;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA pgmq REVOKE ALL PRIVILEGES ON SEQUENCES FROM pg_monitor;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA pgmq REVOKE ALL PRIVILEGES ON TABLES FROM pg_monitor;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA pgmq REVOKE ALL PRIVILEGES ON SEQUENCES FROM pg_monitor;`);
    const restored=inventory(sql('BEGIN READ ONLY; '+inventorySQL+'\nCOMMIT;'));
    // Compare every table hash and catalog item, never emit individual rows.
    const catalogComparison=compareBackupInventories(expected,restored);
    assert.equal(catalogComparison.matches,true,'OFFLINE_RESTORE_CATALOG_OR_DATA_MISMATCH');
    const hasReleaseFingerprint=sql("SELECT to_regprocedure('private.roomqc_schema_fingerprint()') IS NOT NULL;").trim()==='t';
    const restoredSchemaFingerprint=hasReleaseFingerprint?sql('SELECT private.roomqc_schema_fingerprint();').trim():null;
    if(restoredSchemaFingerprint!==null)assert.match(restoredSchemaFingerprint,/^[a-f0-9]{64}$/,'OFFLINE_RESTORE_SCHEMA_FINGERPRINT_INVALID');
    assert.equal(sql('SHOW cron.launch_active_jobs;').trim(),'off');
    const state=owned();assert.equal(state.HostConfig.NetworkMode,'none');assert.deepEqual(state.NetworkSettings.Ports,{});
    assert.deepEqual(state.Mounts,[],'OFFLINE_RESTORE_MUST_NOT_MOUNT_SOURCE_DATA');
    result={kind:'roomqc-offline-logical-restore',run,verifiedAt:new Date().toISOString(),
      sourceHostContacted:false,sourceDatabaseRequired:false,sourceImage:descriptor.sourceImage,
      sourceSnapshotAt:descriptor.snapshotAt,descriptorSha256,checksums,restore: (()=>{const value={...restore};delete value.defaultAclSql;return value})(),
      counts:Object.fromEntries([...new Set(expected.map(row=>row.kind))].map(kind=>[kind,expected.filter(row=>row.kind===kind).length])),
      reviewedDeparserDeltas:catalogComparison.reviewedDeparserDeltas,
      restoredSchemaFingerprint,releaseReapprovalRequired:catalogComparison.reviewedDeparserDeltas.length>0,
      network:'none',hostPorts:0,sourceMounts:0,cronJobsEnabled:false,
      restoreSeconds:Math.round((Date.now()-started)/100)/10,verified:true,
      scope:'Saved business PostgreSQL logical snapshot only; Storage bytes, management directory, external accounts and cross-system revocation checkpoints are not included.'};
    // A bounded recovery drill may use this owned database only after the full
    // offline comparison. Its network/runtime evidence is a separate result;
    // finally still removes the database on callback success or failure.
    if(withVerifiedDatabase)result.runtimeDrill=await withVerifiedDatabase({name,output,run,verification:structuredClone(result)});
  }catch(error){
    await writeFile(join(output,'private-error.log'),String(error.stderr??error.stack??'OFFLINE_RESTORE_FAILED'),{mode:0o600});
    throw Object.assign(new Error('OFFLINE_RESTORE_FAILED; private diagnostics in '+output),{code:'OFFLINE_RESTORE_FAILED'});
  }finally{
    if(owned())docker(['rm','-f',name]);
    assert.equal(owned(),null,'OFFLINE_RESTORE_CLEANUP_REQUIRED');
  }
  result.cleaned=true;
  await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  return {...result,output};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const values=process.argv.slice(2),options=new Map();
  try{
    assert.equal(values.length,6);
    for(let i=0;i<values.length;i+=2){assert.ok(['--backup-dir','--descriptor-sha256','--output-dir'].includes(values[i])&&!options.has(values[i]));options.set(values[i],values[i+1])}
    console.log(JSON.stringify(await restoreRoomqcBackupOffline({backupDirectory:options.get('--backup-dir'),
      descriptorSha256:options.get('--descriptor-sha256'),outputDirectory:options.get('--output-dir')})));
  }catch(error){console.error(error.code??'OFFLINE_RESTORE_ARGUMENTS_INVALID');process.exitCode=1}
}
