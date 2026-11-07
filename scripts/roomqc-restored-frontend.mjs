// Optional browser phase for the checkpoint drill. The browser uses loopback
// HTTP; HTTPS is checked independently with an explicit, short-lived certificate.
// This never changes the operating system or browser certificate trust store.
import assert from 'node:assert/strict';
import {createHash, X509Certificate} from 'node:crypto';
import {readFile,writeFile,readdir,lstat,mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {request} from 'node:https';
import {request as httpRequest} from 'node:http';
import {createServer} from 'node:net';
import {createPrivateBackupDirectory} from './roomqc-backup-envelope.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const nodeImage='node@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85';
const nginxImage='nginx@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10';
const tlsImage='sha256:1cc3a36c18fd5081aaf70f6c8b7010d060ece9304bb12f717abdc2cfea903ca9';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function recoveryFrontendOrigin(port){
 assert(Number.isInteger(port)&&port>=1024&&port<=65534,'RECOVERY_FRONTEND_PORT_INVALID');
 return 'http://127.0.0.1:'+port;
}
export function verifyBrowserProof(proof,{run,origin,frontendArtifactDigest}){
 assert.equal(proof?.version,1);assert.equal(proof.run,run);assert.equal(proof.origin,origin);
 assert.equal(proof.frontendArtifactDigest,frontendArtifactDigest);
 for(const key of ['login','adminInfrastructure','adminBackup','reloadAuthenticated','logout','anonymousAdminDenied'])assert.equal(proof.checks?.[key],true,'RECOVERY_BROWSER_PROOF_'+key);
 assert(Number.isFinite(Date.parse(proof.observedAt))&&Math.abs(Date.now()-Date.parse(proof.observedAt))<900000,'RECOVERY_BROWSER_PROOF_STALE');
 return proof;
}
export async function assertLoopbackPortFree(port){
 assert(Number.isInteger(port)&&port>=1024&&port<=65535,'RECOVERY_FRONTEND_PORT_INVALID');
 await new Promise((accept,reject)=>{const server=createServer();server.once('error',()=>reject(Error('RECOVERY_FRONTEND_PORT_BUSY')));server.listen(port,'127.0.0.1',()=>server.close(accept))});
}
const roots=['src','public','docker','docs/architecture'];
const files=['package.json','package-lock.json','index.html','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','postcss.config.js','tailwind.config.ts','components.json',
 'scripts/clean-dist.mjs','scripts/validate-env.mjs','scripts/verify-build.mjs','supabase/functions/_shared/advice/contracts.ts'];
export async function buildRestoredFrontend({output,origin,publicKey,vapidPublicKey,oldPublicKey,privateValues,project,run,label,docker,names,emit}){
 const context=await createPrivateBackupDirectory(join(output,'frontend-build-context')),manifest=[];
 const copy=async relative=>{
  const path=join(root,relative),info=await lstat(path);assert(!info.isSymbolicLink(),'RECOVERY_FRONTEND_SYMLINK');
  if(info.isDirectory()){
   for(const name of await readdir(path)){if(!name.startsWith('.'))await copy(relative+'/'+name)}
  }else{
   assert(info.isFile());const bytes=await readFile(path);assert(bytes.length<32*1024*1024,'RECOVERY_FRONTEND_INPUT_TOO_LARGE');
   await mkdir(dirname(join(context,relative)),{recursive:true});await writeFile(join(context,relative),bytes,{mode:0o600,flag:'wx'});
   manifest.push({path:relative,sha256:sha(bytes)});
  }
 };
 for(const path of [...roots,...files])await copy(path);
 const recipe=(await readFile(join(root,'Dockerfile'),'utf8')).replace('FROM node:22-alpine AS build','FROM '+nodeImage+' AS build').replace('FROM nginx:1.27-alpine AS runtime','FROM '+nginxImage+' AS runtime');
 assert(recipe.includes(nodeImage)&&recipe.includes(nginxImage));
 await writeFile(join(context,'Dockerfile'),recipe,{mode:0o600,flag:'wx'});
 await writeFile(join(output,'frontend-source-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
 const iid=join(output,'frontend.iid'),args={VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:publicKey,VITE_SUPABASE_PROJECT_ID:'roomqc-recovery',VITE_VAPID_PUBLIC_KEY:vapidPublicKey,
  VITE_ENABLE_DEMO_DATA:'false',ROOMQC_ENVIRONMENT:'local',VITE_ROOMQC_DIRECTORY_ENABLED:'true',VITE_ROOMQC_CLUSTER_ORIGINS:origin,ROOMQC_SKIP_MCP_SYNC:'true'};
 emit('frontend_build_started',{origin,allowlistedFiles:manifest.length});
 await docker(['build','--label',label,'--iidfile',iid,...Object.entries(args).flatMap(([k,v])=>['--build-arg',k+'='+v]),context],undefined,900000);
 const image=(await readFile(iid,'utf8')).trim();assert.match(image,/^sha256:[0-9a-f]{64}$/);
 const name=project+'-frontend-assets';names.push(name);
 await docker(['create','--name',name,'--label',label,'--network','none',image]);
 const assets=await createPrivateBackupDirectory(join(output,'frontend-assets'));
 await docker(['cp',name+':/usr/share/nginx/html/.',assets]);
 const texts=[];
 const scan=async path=>{for(const entry of await readdir(path,{withFileTypes:true})){const p=join(path,entry.name);if(entry.isDirectory())await scan(p);else if(/\.(js|html|json|webmanifest)$/.test(entry.name))texts.push(await readFile(p,'utf8'))}};
 await scan(assets);const bundle=texts.join('\n');assert(bundle.includes(publicKey)&&bundle.includes(origin),'RECOVERY_FRONTEND_NEW_CONFIG_MISSING');
 for(const value of [oldPublicKey,...privateValues])assert(value&&!bundle.includes(value),'RECOVERY_FRONTEND_OLD_OR_PRIVATE_CONFIG');
 const digest=image.slice(7);emit('frontend_build_verified',{frontendArtifactDigest:digest,assets:texts.length,oldKeysAbsent:true,privateKeysAbsent:true});
 return {image,frontendArtifactDigest:digest,origin,sourceFiles:manifest.length,manifestSha256:sha(JSON.stringify(manifest)),assets:texts.length};
}
export function recoveryIngressConfig(){return `pid /tmp/nginx.pid;
events { worker_connections 256; }
http {
 include /etc/nginx/mime.types;
 default_type application/octet-stream;
 access_log off; error_log /dev/stderr warn;
 client_body_temp_path /tmp/client; proxy_temp_path /tmp/proxy;
 fastcgi_temp_path /tmp/fastcgi; uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi;
 resolver 127.0.0.11 valid=5s;
 map $http_upgrade $connection_upgrade { default upgrade; '' close; }
 server {
  listen 8080; listen 8443 ssl; server_name localhost 127.0.0.1;
  ssl_certificate /tls/server.crt; ssl_certificate_key /tls/server.key;
  ssl_protocols TLSv1.2 TLSv1.3;
  root /usr/share/nginx/html; index index.html;
  set $gateway api-gw;
  include /etc/nginx/security-headers.conf;
  location = /healthz { default_type text/plain; return 200 'ok\\n'; }
  location /api/control/ { proxy_pass http://$gateway:8091$request_uri; proxy_set_header Host $http_host; proxy_set_header X-Forwarded-Proto $scheme; }
  location ~ ^/(auth|rest|storage|realtime|functions)/v1/ {
   proxy_pass http://$gateway:8000$request_uri; proxy_set_header Host $http_host; proxy_set_header X-Forwarded-Proto $scheme;
   proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; proxy_read_timeout 120s;
  }
  location /api/ { return 404; }
  location /assets/ { try_files $uri =404; add_header Cache-Control 'public, max-age=31536000, immutable' always; }
  location / { add_header Cache-Control 'no-store' always; try_files $uri $uri/ /index.html; }
 }
}
`}
export async function runRestoredFrontend({build,output,port,project,run,label,network,docker,names,ownedVolumes,ownedNetworks,operator,publicKey,emit}){
 assert.equal(build.origin,recoveryFrontendOrigin(port));await assertLoopbackPortFree(port);await assertLoopbackPortFree(port+1);
 const config=await createPrivateBackupDirectory(join(output,'frontend-ingress'));
 await writeFile(join(config,'nginx.conf'),recoveryIngressConfig(),{mode:0o600,flag:'wx'});
 const volume=project+'-frontend-tls';await docker(['volume','create','--label',label,volume]);ownedVolumes.push(volume);
 const seed=project+'-frontend-cert';names.push(seed);
 await docker(['run','--name',seed,'--label',label,'--network','none','--user','0:0','--mount','type=volume,source='+volume+',target=/tls','--entrypoint','sh',tlsImage,'-c',
  'set -eu; openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=RoomQC isolated recovery '+run+'" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" -addext "basicConstraints=critical,CA:FALSE" -addext "extendedKeyUsage=serverAuth" -keyout /tls/server.key -out /tls/server.crt; chown -R 101:101 /tls; chmod 700 /tls; chmod 600 /tls/*']);
 const certPath=join(config,'server.crt');await docker(['cp',seed+':/tls/server.crt',certPath]);
 const cert=await readFile(certPath),x509=new X509Certificate(cert),thumbprint=x509.fingerprint.replaceAll(':','');
 assert.match(thumbprint,/^[A-F0-9]{40}$/);assert.equal(x509.ca,false);assert.equal(x509.checkIP('127.0.0.1'),'127.0.0.1');
 const tlsOrigin='https://127.0.0.1:'+(port+1);
 const hostNetwork=project+'-frontend-loopback';await docker(['network','create','--label',label,hostNetwork]);ownedNetworks.push(hostNetwork);
  const name=project+'-frontend';names.push(name);
  await docker(['run','-d','--name',name,'--label',label,'--network',hostNetwork,'--user','101:101','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
   '--memory','128m','--cpus','0.5','--pids-limit','64','--no-healthcheck','--tmpfs','/tmp:rw,noexec,nosuid,size=32m,uid=101,gid=101',
   '--publish','127.0.0.1:'+port+':8080','--publish','127.0.0.1:'+(port+1)+':8443','--mount','type=bind,source='+config+',target=/config,readonly','--mount','type=volume,source='+volume+',target=/tls,readonly',
   '--entrypoint','nginx',build.image,'-c','/config/nginx.conf','-g','daemon off;']);
  await docker(['network','connect',network,name]);
  const get=(path,tls=true,ca=cert)=>new Promise((accept,reject)=>{const req=(tls?request:httpRequest)((tls?tlsOrigin:build.origin)+path,{...(tls?{ca}:{}),headers:{apikey:publicKey},timeout:5000},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>accept({status:res.statusCode,body:Buffer.concat(chunks).toString(),headers:res.headers}))});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('TLS_TIMEOUT')));req.end()});
  let ready=false,failure;for(let i=0;i<30;i++){try{if((await get('/healthz')).status===200){ready=true;break}}catch(e){failure=e.code}await new Promise(r=>setTimeout(r,500))}assert(ready,'RECOVERY_FRONTEND_HTTPS_NOT_READY_'+(failure??'HTTP_STATUS'));
  await assert.rejects(get('/healthz',true,[]),e=>['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(e.code));
  assert.equal((await get('/healthz',false)).status,200);
  emit('frontend_tls_verified',{strictCertificateValidation:true,unknownCertificateRejected:true,osTrustChanged:false,browserTransport:'http-loopback'});
  assert.equal((await get('/api/control/readyz')).status,200);assert.equal((await get('/auth/v1/health')).status,200);
  const html=await get('/auth/login');assert.equal(html.status,200);assert(html.body.includes(build.origin));assert.match(html.headers['cache-control'],/no-store/);
  await writeFile(join(output,'browser-login.private.json'),JSON.stringify({origin:build.origin,...operator,publicKey,run,frontendArtifactDigest:build.frontendArtifactDigest}),{flag:'wx',mode:0o600});
  const proofPath=join(output,'browser-proof.json');
  emit('browser_recovery_ready',{origin:build.origin,tlsOrigin,proofPath,frontendArtifactDigest:build.frontendArtifactDigest,browserTransport:'http-loopback'});
  let proof;for(let i=0;i<900;i++){
   try{proof=verifyBrowserProof(JSON.parse(await readFile(proofPath,'utf8')),{run,origin:build.origin,frontendArtifactDigest:build.frontendArtifactDigest});break}catch(e){if(e.code!=='ENOENT')throw e}
   await new Promise(r=>setTimeout(r,1000));
  }
  assert(proof,'RECOVERY_BROWSER_PROOF_TIMEOUT');
  assert.equal((await get('/api/control/readyz')).status,200);
  const result={...build,browser:proof,tlsVerified:true,tlsOrigin,unknownCertificateRejected:true,osTrustChanged:false,browserTransport:'http-loopback',browserHttpsVerified:false,freshLeafCertificate:true,loopbackOnly:true,productionAdmissionChanged:false};
  emit('restored_frontend_browser_verified',{frontendArtifactDigest:build.frontendArtifactDigest,checks:proof.checks,tlsVerified:true});return result;
}
