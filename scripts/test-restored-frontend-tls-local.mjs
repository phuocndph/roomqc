// Native negative test: TLS must validate, but a missing API must prevent a
// browser-ready receipt. No OS certificate store or source VPS is touched.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {resolve,join} from 'node:path';
import {runRestoredFrontend} from './roomqc-restored-frontend.mjs';
import {createPrivateBackupDirectory} from './roomqc-backup-envelope.mjs';
const args=process.argv.slice(2);assert.equal(args.length,4);assert.equal(args[0],'--image-file');assert.equal(args[2],'--output-dir');
const exec=promisify(execFile),run=randomBytes(6).toString('hex'),project='roomqc-drill-'+run,label='roomqc.recovery-drill='+run;
const output=await createPrivateBackupDirectory(join(resolve(args[3]),project)),network=project+'-tls-negative',names=[],ownedVolumes=[],ownedNetworks=[],events=[];
const docker=async values=>(await exec('docker',values,{windowsHide:true,timeout:60000,maxBuffer:1024*1024})).stdout;
const image=(await readFile(resolve(args[1]),'utf8')).trim();assert.match(image,/^sha256:[a-f0-9]{64}$/);
await docker(['network','create','--internal','--label',label,network]);
try{
 await assert.rejects(runRestoredFrontend({build:{image,origin:'http://127.0.0.1:18445',frontendArtifactDigest:image.slice(7)},output,port:18445,project,run,label,network,docker,names,ownedVolumes,ownedNetworks,operator:{},publicKey:'',
  emit:(phase,details)=>{events.push(phase);console.log(JSON.stringify({phase,...details}))}}),e=>e.code==='ERR_ASSERTION'&&e.actual===502&&e.expected===200);
 assert(events.includes('frontend_tls_verified'));assert(!events.includes('browser_recovery_ready'));
}catch(e){
 await writeFile(join(output,'failure.private.json'),JSON.stringify({code:e.code,message:e.message,actual:e.actual,expected:e.expected},null,2),{mode:0o600});
 for(const name of names){try{const logs=await exec('docker',['logs',name],{windowsHide:true,timeout:10000});await writeFile(join(output,name+'.private.log'),logs.stdout+logs.stderr,{mode:0o600})}catch{}}
 throw Error('RECOVERY_TLS_COMPONENT_FAILED');
}finally{
 for(const name of names.reverse())await docker(['rm','-f',name]);
 for(const volume of ownedVolumes.reverse())await docker(['volume','rm',volume]);for(const n of ownedNetworks.reverse())await docker(['network','rm',n]);await docker(['network','rm',network]);
}
assert.equal((await docker(['ps','-aq','--filter','label='+label])).trim(),'');
const result={run,missingBackendRejected:true,strictTlsVerified:true,unknownCertificateRejected:true,osTrustChanged:false,browserReadyNotEmitted:true,cleaned:true};
await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));
