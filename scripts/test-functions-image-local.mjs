// Real packaged Edge router and workers, with no source mounts, public ports,
// provider keys or network egress. This is packaging proof, not business E2E.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {isAbsolute,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const execute=promisify(execFile),repository=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);assert.equal(args.length,2);assert.equal(args[0],'--manifest');assert(isAbsolute(args[1]));
const manifest=JSON.parse(await readFile(args[1],'utf8'));assert.equal(manifest.kind,'roomqc-functions-deployment-image');
assert.match(manifest.imageReference,/^roomqc\/functions@sha256:[a-f0-9]{64}$/);
for(const f of manifest.sources){assert(!isAbsolute(f.path)&&!f.path.split('/').includes('..'));
 assert.equal(createHash('sha256').update(await readFile(join(repository,f.path))).digest('hex'),f.sha256,'FUNCTION_SOURCE_DRIFT');}
const run=randomBytes(6).toString('hex'),name='roomqc-functions-check-'+run,label='roomqc.functions.check='+run;
const receipt={kind:'roomqc-functions-image-offline-runtime',run,recordedAt:new Date().toISOString(),
 imageReference:manifest.imageReference,sourceHash:manifest.sourceHash,packagedFunctions:manifest.packagedFunctions,
 verified:false,cleaned:false,businessE2e:false,vps:false,externalProviders:false};
let created=false;
const docker=args=>execute('docker',args,{cwd:repository,windowsHide:true,timeout:90000,maxBuffer:2*1024**2});
// execFile has no stdin option; use spawn for the private one-shot HTTP client.
const {spawn}=await import('node:child_process');
const client=(args,input)=>new Promise((resolve,reject)=>{
 const p=spawn('docker',args,{windowsHide:true,cwd:repository}),out=[],err=[];
 const timer=setTimeout(()=>p.kill(),90000);
 p.stdout.on('data',c=>out.push(c));p.stderr.on('data',c=>err.push(c));p.stdin.on('error',()=>{});p.stdin.end(input);
 p.on('error',reject);p.on('close',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(out).toString()):reject(Object.assign(new Error('FUNCTION_RUNTIME_CHECK_FAILED'),{diagnostic:Buffer.concat(err).toString()}));});
});
try{
 const image=JSON.parse((await docker(['image','inspect',manifest.imageReference])).stdout)[0];assert.equal(image.Id,manifest.imageId);
 assert.equal(image.Config.Labels['roomqc.functions.source'],manifest.sourceHash);
 const secret=randomBytes(32).toString('hex');
 await docker(['run','-d','--name',name,'--label',label,'--read-only','--network','none','--cap-drop','ALL',
  '--security-opt','no-new-privileges:true','--memory','512m','--cpus','1','--pids-limit','128','--tmpfs','/tmp:rw,nosuid,noexec,size=32m',
  '--env','JWT_SECRET='+secret,'--env','SUPABASE_URL=http://127.0.0.1:1','--env','SUPABASE_PUBLIC_URL=https://roomqc.invalid',
  '--env','SUPABASE_ANON_KEY=offline-test-only','--env','ROOMQC_CONTROL_CLUSTER_ID=offline-check',
  '--env','ROOMQC_CONTROL_RELEASE_ID=packaged-functions','--env','ROOMQC_EMAIL_PROVIDER=disabled',manifest.imageReference]);created=true;
 const info=JSON.parse((await docker(['inspect',name])).stdout)[0];assert.equal(info.HostConfig.NetworkMode,'none');
 assert.equal(info.HostConfig.ReadonlyRootfs,true);assert.equal(info.Mounts.length,0);assert.deepEqual(info.NetworkSettings.Ports,{});
 const program=String.raw`import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';
let t='';for await(const c of process.stdin)t+=c;const {secret}=JSON.parse(t),checks=[];
const b=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned=b({alg:'HS256',typ:'JWT'})+'.'+b({role:'roomqc_control_probe',exp:Math.floor(Date.now()/1000)+120});
const jwt=unsigned+'.'+createHmac('sha256',secret).update(unsigned).digest('base64url');
const request=async(path,options={})=>fetch('http://127.0.0.1:9000'+path,{...options,signal:AbortSignal.timeout(10000)});
for(let n=0;n<30;n++){try{await request('/missing');break;}catch{if(n===29)throw Error('ROUTER_NOT_READY');await new Promise(r=>setTimeout(r,250));}}
let r=await request('/missing');assert.equal(r.status,404);checks.push('unknown-function-denied');
r=await request('/control-probe',{method:'POST',body:'{}'});assert.equal(r.status,401);checks.push('protected-function-requires-jwt');
const challenge='a'.repeat(64);r=await request('/control-probe',{method:'POST',headers:{authorization:'Bearer '+jwt,'content-type':'application/json'},body:JSON.stringify({challenge})});
if(r.status!==200)throw Error('PROBE_WORKER_'+r.status+':'+await r.text());const proof=await r.json();assert.equal(proof.challenge,challenge);assert.equal(proof.clusterId,'offline-check');assert.equal(proof.releaseId,'packaged-functions');checks.push('bundled-worker-executes-without-egress');
r=await request('/email-provider-webhook',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
assert.equal(r.status,503);assert.notEqual(r.headers.get('sb-error-code'),'BOOT_ERROR');assert.equal((await r.json()).error,'Webhook not configured');checks.push('public-webhook-reaches-own-signature-gate');
r=await request('/create-user',{method:'OPTIONS',headers:{origin:'https://roomqc.com'}});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'https://roomqc.com');checks.push('invitation-entry-cors-ready');
r=await request('/mcp/.well-known/oauth-protected-resource',{headers:{authorization:'Bearer '+jwt}});
assert.equal(r.status,200);const meta=await r.json();assert.deepEqual(meta.authorization_servers,['https://roomqc.invalid/auth/v1']);checks.push('mcp-metadata-uses-runtime-origin');
console.log(JSON.stringify({verified:true,checks,publishedPorts:0,sourceMounts:0,egress:false}));`;
 const nodeImage='node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85';
 const output=await client(['run','--rm','-i','--label',label,'--read-only','--network','container:'+name,'--cap-drop','ALL',
  '--security-opt','no-new-privileges:true','--memory','128m','--pids-limit','64',nodeImage,'node','--input-type=module','-e',program],JSON.stringify({secret}));
 Object.assign(receipt,JSON.parse(output));
}catch(error){
 receipt.code='FUNCTION_RUNTIME_CHECK_FAILED';
 const logs=created?await docker(['logs','--tail','80',name]).catch(()=>({stdout:'',stderr:''})):{stdout:'',stderr:''};
 await writeFile(resolve(repository,'.local/functions-runtime-'+run+'.private.log'),String(error.diagnostic??error.stack)+'\n'+logs.stdout+'\n'+logs.stderr,{mode:0o600});process.exitCode=1;
}finally{
 if(created){const info=JSON.parse((await docker(['inspect',name])).stdout)[0];assert.equal(info.Config.Labels['roomqc.functions.check'],run);await docker(['rm','-f',name]);}
 assert.equal((await docker(['ps','-aq','--filter','label='+label])).stdout.trim(),'');receipt.cleaned=true;
 const path=resolve(repository,'artifacts/roomqc-functions-image-offline-runtime-'+run+'.json');
 await writeFile(path,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({artifact:path,...receipt}));
}
