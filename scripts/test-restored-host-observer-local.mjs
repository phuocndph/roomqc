// Fast native component check on the authenticated directory checkpoint. The
// full runtime drill separately proves integration with core/setup/health.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createPrivateBackupDirectory} from './roomqc-backup-envelope.mjs';
import {validateCheckpointPair} from './roomqc-checkpoint-contract.mjs';
import {restoreControlStorageOffline} from './restore-roomqc-control-storage-offline.mjs';
import {runRestoredHostObserver} from './roomqc-restored-host-observer.mjs';
if(process.argv.slice(2).join(' ')!=='--run'){console.log('Usage: node scripts/test-restored-host-observer-local.mjs --run (owned authenticated checkpoint, no VPS access)');process.exit(0)}
const base=resolve('.local/cp-contabo-20261101-v2'),run=randomBytes(6).toString('hex'),project='roomqc-drill-'+run,label='roomqc.recovery-drill='+run;
const output=await createPrivateBackupDirectory(join(base,'restore',project)),names=[],ownedVolumes=[],ownedNetworks=[];
const invoke=(args,input,timeout=60000)=>new Promise((accept,reject)=>{
 const child=execFile('docker',args,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:16*1024*1024},async(error,stdout,stderr)=>{
  if(error){await writeFile(join(output,'command-failure.private.log'),stdout+'\n'+stderr,{mode:0o600});reject(Object.assign(new Error('RESTORED_OBSERVER_DOCKER_FAILED'),{code:'RESTORED_OBSERVER_DOCKER_FAILED'}))}
  else accept(stdout);
 });child.stdin.on('error',()=>{});child.stdin.end(input??'');
});
const docker=(args,_input,timeout)=>invoke(args,undefined,timeout),inputDocker=invoke;
const emit=(phase,details={})=>console.log(JSON.stringify({event:'restored_observer_component',run,phase,...details}));
const pair=validateCheckpointPair({checkpointBytes:await readFile(join(base,'checkpoint.json')),
 expectedSha256:'626d1494c2187ba5683a3acc4bd1cca03c6a18fc0bbdc5c3212265f462de0a37',
 businessDescriptorBytes:await readFile(join(base,'sealed/business-opened/result.json')),controlDescriptorBytes:await readFile(join(base,'sealed/control-opened/result.json'))});
let result;
try{
 await restoreControlStorageOffline({bundleDirectory:join(base,'sealed/control-opened'),descriptorSha256:pair.controlDescriptorSha256,outputDirectory:output,
  withVerifiedDatabase:async directory=>{
   const query=sql=>inputDocker(['exec','-i','--user','70:70',directory.name,'psql','-h','/tmp','-U','postgres','-d','roomqc_control','-X','-Atq','-v','ON_ERROR_STOP=1'],sql);
   const password=randomBytes(32).toString('hex'),roles={directory:{rq_contabo_host_observer:password}};
   await query("ALTER ROLE rq_contabo_host_observer PASSWORD '"+password+"'; UPDATE roomqc_control.hosts SET environment='local' WHERE id='contabo-pilot' AND environment='production';");
   await docker(['network','disconnect','none',directory.name]);
   const configRoot=join(directory.output,'service-config'),budget=JSON.parse(await readFile(join(configRoot,'management/private/budget.json')));budget.environment='local';
   const observer=await runRestoredHostObserver({directory,query,configRoot,output,roles,budget,project,run,label,docker,inputDocker,names,ownedVolumes,ownedNetworks,emit});
   result=await observer.finish();return result;
  }});
}catch(error){
 await writeFile(join(output,'failure.private.log'),String(error.stack??error),{mode:0o600});emit('failed',{code:error.code??'RESTORED_OBSERVER_FAILED'});process.exitCode=1;
}finally{
 for(const name of [...new Set(names)].reverse()){
  const ids=(await docker(['ps','-aq','--filter','name=^/'+name+'$','--filter','label='+label])).trim();
  if(ids){const logs=await invoke(['logs',ids]);await writeFile(join(output,name+'.private.log'),logs,{mode:0o600});await docker(['rm','-f',ids])}
 }
 for(const [kind,list]of [['volume',ownedVolumes],['network',ownedNetworks]])for(const name of [...list].reverse()){
  assert.equal(JSON.parse(await docker([kind,'inspect',name]))[0].Labels['roomqc.recovery-drill'],run);await docker([kind,'rm',name]);
 }
}
if(result&&process.exitCode!==1){
 await writeFile(join(output,'observer-result.json'),JSON.stringify({run,checkpointId:pair.checkpointId,verifiedAt:new Date().toISOString(),hostObserver:result,cleaned:true},null,2)+'\n',{flag:'wx',mode:0o600});
 emit('passed',{cleaned:true,fullServiceRecoveryVerified:false});
}
