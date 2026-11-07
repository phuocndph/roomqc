// Wiring for the offline customer journey only. Production registration gates,
// service permissions and the currently serving backend are never changed.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parse,stringify} from 'yaml';
import {build} from 'esbuild';

export async function configureCustomerJourneyFixture({repository,vendor,bundle,state,publicOrigin='http://127.0.0.1:8082'}){
  assert.equal(state.diagnosticOnly,true);
  const publicUrl=new URL(publicOrigin);
  assert.equal(publicUrl.origin,publicOrigin);
  assert.equal(publicUrl.protocol,'http:');assert.equal(publicUrl.hostname,'127.0.0.1');
  Object.assign(bundle.services.auth.environment,{
    GOTRUE_DISABLE_SIGNUP:'false',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'false',
    GOTRUE_SITE_URL:publicOrigin,GOTRUE_RATE_LIMIT_EMAIL_SENT:'20',
    GOTRUE_MAILER_TEMPLATES_CONFIRMATION:'http://api-gw:2526/confirmation',
    GOTRUE_MAILER_TEMPLATES_INVITE:'http://api-gw:2526/invite',
    GOTRUE_MAILER_SUBJECTS_CONFIRMATION:'Xác minh tài khoản RoomQC',GOTRUE_MAILER_SUBJECTS_INVITE:'Bạn được mời tham gia RoomQC',
  });
  if(state.packagedFunctions){
    assert.equal(state.packagedFunctions.normalGatewayRoutes,true);
    bundle.services.functions.environment.ROOMQC_PUBLIC_URL=publicOrigin;
    state.customerJourneyFixture={internalOnly:true,publishedPorts:0,externalProviders:false,
      smtp:'api-gw:2525',templates:'api-gw:2526',signupOnlyOnOwnedFixture:true,packagedFunctions:true,
      normalGatewayRoutes:true,perHandlerClones:false};
    return;
  }
  // Route the public function paths to the unchanged, already bundled product
  // handlers. Their native Auth/session/permission checks remain in force.
  const mounts=bundle.services['api-gw'].volumes;
  const listenerPath=join(vendor,'docker/volumes/api/envoy/lds.template.yaml');
  const clustersPath=join(vendor,'docker/volumes/api/envoy/cds.yaml');
  assert.ok(mounts.some(m=>m.target==='/etc/envoy/lds.template.yaml'&&m.source===listenerPath),'Journey must target the actually mounted listener');
  assert.ok(mounts.some(m=>m.target==='/etc/envoy/cds.yaml'&&m.source===clustersPath),'Journey must target the actually mounted clusters');
  const listenerSource=await readFile(listenerPath,'utf8');
  const listeners=parse(listenerSource),clusters=parse(await readFile(clustersPath,'utf8'));
  const manager=listeners.resources.flatMap(r=>r.filter_chains??[]).flatMap(c=>c.filters??[])
    .find(f=>f.name==='envoy.filters.network.http_connection_manager').typed_config;
  const host=manager.route_config.virtual_hosts.find(h=>h.routes.some(r=>r.name==='functions-v1-all'));
  const base=host.routes.find(r=>r.name==='functions-v1-all'),baseCluster=clusters.resources.find(c=>c.name==='functions');
  assert.ok(base&&baseCluster);
  const addedRoutes=[];
  for(const [name,target]of [['create-user','create-user-invitation-test'],['staff-invitations','staff-invitation-send-test']]){
    const route=structuredClone(base),cluster=structuredClone(baseCluster),id='journey-'+name;
    route.name=id;route.match={path:'/functions/v1/'+name};route.route.cluster=id;
    addedRoutes.push(route);
    cluster.name=id;cluster.load_assignment.cluster_name=id;
    for(const ep of cluster.load_assignment.endpoints)for(const lb of ep.lb_endpoints){
      lb.endpoint.address.socket_address.address=target;lb.endpoint.address.socket_address.port_value=9000;
    }
    clusters.resources.push(cluster);
    Object.assign(bundle.services[target].environment,{SUPABASE_URL:'http://api-gw:8000',ROOMQC_PUBLIC_URL:publicOrigin});
  }
  // Preserve vendor quoting around empty environment substitutions. Reprinting
  // the entire template can turn exact_match: "${KEY}" into YAML null when the
  // native entrypoint substitutes an unconfigured key.
  const marker=listenerSource.match(/^( *)- name: functions-v1-all\r?$/m);
  assert.ok(marker,'Expected mounted vendor Functions route');
  const inserted=stringify(addedRoutes,{lineWidth:0,defaultStringType:'QUOTE_DOUBLE'}).trimEnd().split('\n').map(line=>marker[1]+line).join('\n')+'\n';
  await writeFile(listenerPath,listenerSource.replace(marker[0],inserted+marker[0]));
  await writeFile(clustersPath,stringify(clusters));
  state.customerJourneyFixture={internalOnly:true,publishedPorts:0,externalProviders:false,
    smtp:'api-gw:2525',templates:'api-gw:2526',signupOnlyOnOwnedFixture:true,
    listenerSha256:createHash('sha256').update(await readFile(listenerPath)).digest('hex'),
    clustersSha256:createHash('sha256').update(await readFile(clustersPath)).digest('hex')};
}

export async function runCustomerJourneyDiagnostic({repository,state,input,privateRun,compose,runClient,invitationCallerSource}){
  const sources=['scripts/control-backend-customer-journey-checks.mjs','scripts/control-backend-invitation-delivery.mjs',
    'supabase/templates/confirmation.html','supabase/templates/invite.html','src/lib/email-auth-session.ts','src/lib/email-auth.ts',
    'scripts/lib/customer-journey-checks.mjs'];
  const read=async()=>Promise.all(sources.map(async path=>({path,bytes:await readFile(join(repository,path))})));
  const bound=await read(),hashes=bound.map(({path,bytes})=>({path,sha256:createHash('sha256').update(bytes).digest('hex')}));
  const caller=await invitationCallerSource();state.customerJourneyCallerBuild=caller.build;
  const session=await build({entryPoints:[join(repository,'src/lib/email-auth-session.ts')],bundle:true,format:'iife',
    globalName:'RoomQCEmailSession',target:'es2022',platform:'browser',write:false,logLevel:'silent'});
  state.customerJourneySessionBuildSha256=createHash('sha256').update(session.outputFiles[0].text).digest('hex');
  const services=state.packagedFunctions?['functions']:['staff-invitation-send-test','create-user-invitation-test'];
  await privateRun('docker',[...compose,'up','--detach','--wait','--wait-timeout','60',...services],{timeout:90000});
  const values={...input,templates:{confirmation:bound[2].bytes.toString('utf8'),invite:bound[3].bytes.toString('utf8')}};
  const program=caller.source+'\n'+session.outputFiles[0].text+'\n'+bound[1].bytes.toString('utf8')+'\n'+bound[0].bytes.toString('utf8');
  const compiled=await build({stdin:{contents:program,resolveDir:join(repository,'scripts'),sourcefile:'owned-customer-journey.mjs'},
    bundle:true,platform:'node',format:'esm',target:'es2022',external:['/control/*','@supabase/supabase-js'],write:false,logLevel:'silent'});
  let result;
  try{result=await runClient(compiled.outputFiles[0].text,{ROOMQC_FIXTURE_JOURNEY_INPUT:JSON.stringify(values)},240000,{memory:'256m'});}
  catch(error){
    // The client emits a deliberately bounded, secret-free receipt on failure.
    try{const failed=JSON.parse(error.result?.stdout??'null');
      if(failed?.verified===false&&Array.isArray(failed.checks))state.customerJourneyControls=failed;
    }catch{}throw error;
  }
  const controls=JSON.parse(result.stdout);
  assert.equal(controls.verified,true);
  assert.deepEqual((await read()).map(({path,bytes})=>({path,sha256:createHash('sha256').update(bytes).digest('hex')})),hashes);
  assert.deepEqual((await invitationCallerSource()).build,caller.build);
  return {...controls,sources:hashes,callerBuild:caller.build};
}
