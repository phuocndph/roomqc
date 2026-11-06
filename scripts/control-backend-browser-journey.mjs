// Browser access is opt-in, loopback only and limited to the fresh owned stack.
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {createECDH,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {build} from 'esbuild';
import {launchLocalDemo} from './control-backend-local-demo.mjs';

export async function browserFixtureOrigin(state){
  assert.equal(state.diagnosticOnly,true);assert.match(state.run,/^[a-f0-9]{12}$/);
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(state.persistentLocalDemo?59255:0,'127.0.0.1',resolve)});
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));
  return 'http://127.0.0.1:'+port;
}

export async function runBrowserJourneyDiagnostic({repository,state,privateRun,compose,runClient,input,save,emit,invitationCallerSource,seeded=false}){
  assert.equal(state.diagnosticOnly,true);assert.equal(state.projectId,'roomqc-probe-'+state.run);
  const origin=new URL(state.browserOrigin);assert.equal(origin.hostname,'127.0.0.1');assert.equal(origin.protocol,'http:');
  const project=state.projectId,name=project+'-browser-web',image='roomqc/browser-journey:'+state.run;
  const ownerLabel='roomqc.control-backend-test';
  const vapid=createECDH('prime256v1');
  const args=['build','--tag',image,'--label',ownerLabel+'='+state.run];
  // This image uses the product-owned MCP entrypoint, like deployed images.
  // Browser verification must not regenerate or overwrite that function.
  for(const [key,value]of Object.entries({ROOMQC_ENVIRONMENT:'local',ROOMQC_SKIP_MCP_SYNC:'true',VITE_SUPABASE_URL:origin.origin,
    VITE_SUPABASE_PUBLISHABLE_KEY:input.publishableKey,VITE_SUPABASE_PROJECT_ID:'browser-'+state.run,
    VITE_VAPID_PUBLIC_KEY:vapid.generateKeys().toString('base64url'),VITE_ENABLE_DEMO_DATA:'false',
    VITE_ROOMQC_DIRECTORY_ENABLED:'true',VITE_ROOMQC_CLUSTER_ORIGINS:origin.origin}))args.push('--build-arg',key+'='+value);
  args.push(repository);
  state.phase='browser_frontend_build';await save();emit('browser_frontend_build',{projectId:project});
  await privateRun('docker',args,{timeout:240000});
  const proxy=join(state.root,'browser-proxy.conf'),serviceHost=state.persistentLocalDemo?'local-demo-service':'api-gw';
  await writeFile(proxy,`location /api/control/ {
    include /etc/nginx/security-headers.conf;
    proxy_pass http://${serviceHost}:8091;
    proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 35s; client_max_body_size 16k;
    add_header Cache-Control "no-store" always;
  }
  location /__fixture/ {
    proxy_pass http://${serviceHost}:2527;
    access_log off; add_header Cache-Control "no-store" always;
  }
  location ~ ^/(auth|rest|storage|functions|realtime)/v1(?:/|$) {
    proxy_pass http://api-gw:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";
    proxy_set_header Host $host; proxy_read_timeout 75s;
    access_log off; add_header Cache-Control "no-store" always;
  }
`,{mode:0o600,flag:'wx'});
  // Only this proxy gets a published loopback port. Core services remain on
  // their verified internal-only network and retain all native auth filters.
  await privateRun('docker',['create','--name',name,'--label',ownerLabel+'='+state.run,
    '--label','com.docker.compose.project='+project,'--network','bridge',
    '-p','127.0.0.1:'+origin.port+':80','--mount','type=bind,src='+proxy+',dst=/etc/nginx/roomqc-control.d/browser.conf,readonly',image]);
  await privateRun('docker',['network','connect',project+'-internal',name]);
  const inspected=JSON.parse((await privateRun('docker',['inspect',name])).stdout)[0];
  assert.deepEqual(inspected.HostConfig.PortBindings,{'80/tcp':[{HostIp:'127.0.0.1',HostPort:origin.port}]});
  await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60','staff-invitation-send-test','create-user-invitation-test'],{timeout:90000});
  if(!state.persistentLocalDemo)await privateRun('docker',['start',name]);
  const source=await readFile(join(repository,state.persistentLocalDemo?'scripts/control-backend-local-demo-service.mjs':seeded?'scripts/control-backend-customer-journey-checks.mjs':'scripts/control-backend-browser-service.mjs'),'utf8');
  let contents=source;
  if(seeded){
    const caller=await invitationCallerSource();state.customerJourneyCallerBuild=caller.build;
    const session=await build({entryPoints:[join(repository,'src/lib/email-auth-session.ts')],bundle:true,format:'iife',
      globalName:'RoomQCEmailSession',target:'es2022',platform:'browser',write:false,logLevel:'silent'});
    contents=caller.source+'\n'+session.outputFiles[0].text+'\n'+await readFile(join(repository,'scripts/control-backend-invitation-delivery.mjs'),'utf8')+'\n'+source;
  }
  const program=await build({stdin:{contents,sourcefile:'browser-service.mjs',resolveDir:join(repository,'scripts')},
    bundle:true,platform:'node',format:'esm',target:'es2022',external:['/control/*','@supabase/supabase-js'],write:false,logLevel:'silent'});
  state.browserFixture={origin:origin.origin,frontend:name,image,serverSourceSha256:createHash('sha256').update(source).digest('hex'),
    signupOnlyOnOwnedFixture:true,externalProviders:false,seededNativeJourney:seeded,admissionMetrics:'synthetic test prerequisite, not VPS telemetry'};
  state.phase='browser_journey_waiting';await save();
  if(state.persistentLocalDemo){
    assert.equal(seeded,false);
    await launchLocalDemo({repository,state,privateRun,program:program.outputFiles[0].text,save,emit,
      input:{...input,publicOrigin:origin.origin,templates:{confirmation:await readFile(join(repository,'supabase/templates/confirmation.html'),'utf8'),invite:await readFile(join(repository,'supabase/templates/invite.html'),'utf8')}}});
    return {persistentLocalDemo:true};
  }
  let line='';
  const result=await runClient(program.outputFiles[0].text,{[seeded?'ROOMQC_FIXTURE_JOURNEY_INPUT':'ROOMQC_FIXTURE_BROWSER_INPUT']:JSON.stringify({...input,publicOrigin:origin.origin,
    ...(seeded?{browserOrigin:origin.origin}:{}),
    templates:{confirmation:await readFile(join(repository,'supabase/templates/confirmation.html'),'utf8'),
      invite:await readFile(join(repository,'supabase/templates/invite.html'),'utf8')}})},3_660_000,{memory:'256m',onStdout:chunk=>{
    line+=chunk.toString();let end;while((end=line.indexOf('\n'))>=0){const part=line.slice(0,end);line=line.slice(end+1);
      const event=JSON.parse(part);assert.ok(['browser_fixture_ready','browser_fixture_finished'].includes(event.event),
        event.verified===false?'Native customer journey failed before browser acceptance':'Unexpected browser fixture event');
      if(event.event==='browser_fixture_ready')emit(event.event,{origin:origin.origin,run:state.run,mailbox:origin.origin+'/__fixture/inbox'});
    }
  }});
  const final=JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(final.event,'browser_fixture_finished');assert.equal(final.verified,true);
  return final;
}
