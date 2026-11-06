// Fixture entrypoint around the unchanged product readTenantSummary function.
// Native RPCs and credential file reads are real. This is not a Control API E2E.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile,access} from 'node:fs/promises';
import {captureBackendSourceBinding} from '/repository/scripts/control-backend-source-binding.mjs';
import {readTenantSummary} from '../tenant-summary.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const run=process.env.ROOMQC_SUMMARY_MOUNT_RUN,expected=process.env.ROOMQC_SUMMARY_MOUNT_SOURCE;
assert.match(run,/^[a-f0-9]{12}$/);assert.match(expected,/^[a-f0-9]{64}$/);
let fixture;const deadline=Date.now()+540000;
while(Date.now()<deadline){try{fixture=JSON.parse(await readFile('/summary-input/ready.json','utf8'));break}catch{await pause(50)}}
assert(fixture);assert.equal(fixture.run,run);assert.equal(fixture.outputFile,'/run/roomqc/summary/summary.json');
const status=await readFile('/proc/self/status','utf8'),capEff=BigInt('0x'+status.match(/^CapEff:\s+([a-f0-9]+)$/m)[1]).toString();
assert.equal(process.getuid(),1000);assert.equal(process.getgid(),1000);assert.equal(capEff,'0');assert.ok(!process.getgroups().includes(0));
const noNewPrivileges=/^NoNewPrivs:\s+1$/m.test(status);assert(noNewPrivileges);
const mountinfo=(await readFile('/proc/self/mountinfo','utf8')).split('\n');
const readOnlyMounts=['/repository','/summary-input','/run/roomqc/summary'].every(target=>mountinfo.some(line=>{
 const parts=line.split(' - ')[0].split(' ');return parts[4]===target&&parts[5].split(',').includes('ro');
}));assert(readOnlyMounts);
await assert.rejects(writeFile('/run/roomqc/summary/consumer-write-probe','denied'),{code:'EROFS'});
for(const file of fixture.privatePaths)await assert.rejects(access(file),e=>['ENOENT','EACCES'].includes(e.code));
const source=await captureBackendSourceBinding('/repository');assert.equal(source.sha256,expected);
console.log(JSON.stringify({type:'summary_mount_identity',uid:process.getuid(),gid:process.getgid(),capEff,noNewPrivileges,
 readOnlyMounts,writeDenied:true,privateInputsInaccessible:true,sourceSha256:source.sha256}));
const config={allowLocal:true,inventory:new Map([[fixture.cluster.inventoryRef,{...fixture.cluster,tenantSummaryCredentialFile:fixture.outputFile}]])};
let observation={ready:false,errorCode:'STARTING'},closing=false;
const instanceId=run+'-'+process.pid;
const server=http.createServer((req,res)=>{
 if(req.method==='POST'&&req.url==='/stop'){closing=true;res.writeHead(200);res.end('{}');return}
 if(req.method!=='GET'||req.url!=='/observation'){res.writeHead(404);res.end('{}');return}
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({instanceId,pid:process.pid,...observation}));
});await new Promise(r=>server.listen(8096,'127.0.0.1',r));
try{while(!closing){
 try{const result=await readTenantSummary(config,fixture.cluster,fixture.workspace);
  // Observe only public metadata. Never return bearer, publishable key or paths.
  const value=JSON.parse(await readFile(fixture.outputFile,'utf8'));
  const id=JSON.parse(Buffer.from(value.token.split('.')[1],'base64url')).jti;
  observation={ready:result.errorCode==='TENANT_SUMMARY_MISSING',credentialId:id,errorCode:result.errorCode};
 }catch(error){observation={ready:false,errorCode:/^TENANT_SUMMARY_[A-Z_]+$/.test(error?.code??'')?error.code:'TENANT_SUMMARY_UNAVAILABLE'}}
 await pause(100);
}}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
