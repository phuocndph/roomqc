// Observer only: the following entrypoint is the unchanged real setup worker.
import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {captureBackendSourceBinding} from '../../../scripts/control-backend-source-binding.mjs';

assert.match(process.env.ROOMQC_PRIVATE_MOUNT_RUN??'',/^[a-f0-9]{12}$/);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let ready;
for(let n=0;n<3600;n++){
 try{ready=JSON.parse(await readFile('/worker-input/ready.json','utf8'));break}catch{await delay(100)}
}
assert.equal(ready?.run,process.env.ROOMQC_PRIVATE_MOUNT_RUN);
assert.equal(process.getuid(),10001);assert.equal(process.getgid(),10001);assert.ok(!process.getgroups().includes(0));
const status=await readFile('/proc/self/status','utf8');
assert.equal(BigInt('0x'+status.match(/^CapEff:\s+([a-f0-9]+)$/m)[1]),0n);
assert.match(status,/^NoNewPrivs:\s+1$/m);
const mountLines=(await readFile('/proc/self/mountinfo','utf8')).split('\n');
for(const target of ['/repository','/worker-input','/run/roomqc/setup']){
 assert.ok(mountLines.some(line=>{const p=line.split(' - ')[0].split(' ');return p[4]===target&&p[5].split(',').includes('ro')}));
 await assert.rejects(()=>writeFile(target+'/.owned-mount-write-probe','probe',{flag:'wx'}),{code:'EROFS'});
}
assert.ok(Array.isArray(ready.privatePaths)&&ready.privatePaths.length>=3);
for(const path of ready.privatePaths){assert.ok(path.startsWith('/tmp/roomqc-installer-'+ready.run+'-'));await assert.rejects(()=>access(path))}
const source=await captureBackendSourceBinding('/repository');assert.equal(source.sha256,process.env.ROOMQC_PRIVATE_MOUNT_SOURCE);
process.stdout.write(JSON.stringify({type:'setup_mount_identity',pid:process.pid,uid:process.getuid(),gid:process.getgid(),
 capEff:'0',noNewPrivileges:true,readOnlyMounts:true,writeDenied:true,privateInputsInaccessible:true,sourceSha256:source.sha256})+'\n');
// Producer asks the real runtime to handle SIGTERM before fixture DB cleanup.
const timer=setInterval(async()=>{
 try{await access('/worker-input/stop');clearInterval(timer);process.kill(process.pid,'SIGTERM')}catch{}
},100);timer.unref();
