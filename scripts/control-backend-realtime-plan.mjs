import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {vendorResourceCatalog} from '../server/control/resource-vendor-catalog.mjs';
import {resourceConsumerMain} from './control-backend-resource-consumer-preflight.mjs';
import {createManagedRealtimeVerifier} from './control-backend-realtime-image.mjs';

// Owned full-schema diagnostic: real Compose config, image inspect, independent
// no-cache rebuild and a counterfeit config retaining the trusted source label.
export async function checkManagedRealtimePlan({repository,state,bundle,privateRun}){
  const cases=[],check=(name,value)=>{assert.ok(value,name);cases.push(name)};
  const budget=JSON.parse(await readFile(join(repository,'deploy/control-resource-budget.example.json'),'utf8'));
  budget.environment='local';for(const db of budget.databases)for(const c of db.consumers)c.replicas=0;
  budget.databases.find(db=>db.kind==='directory').consumers.find(c=>c.id==='control-api').replicas=1;
  const business=budget.databases.find(db=>db.kind==='business');business.consumers.find(c=>c.id==='realtime').replicas=1;
  const budgetPath=join(state.root,'managed-realtime-plan-budget.json'),budgetBytes=JSON.stringify(budget);
  await writeFile(budgetPath,budgetBytes,{mode:0o600,flag:'wx'});
  const project=state.projectId+'-managed-plan',composePath=join(state.root,'managed-realtime-plan.compose.json');
  const service=structuredClone(bundle.services.realtime);delete service.depends_on;
  const configuration={name:project,services:{realtime:service},networks:bundle.networks};
  const manifest={schemaVersion:1,environment:'local',budgetFile:budgetPath,
    budgetSha256:createHash('sha256').update(budgetBytes).digest('hex'),vendorCatalogId:vendorResourceCatalog.id,
    nativeProjects:[],vendorProjects:[{id:project,files:[composePath],envFiles:[],profiles:[],
      services:[{name:'realtime',adapter:'realtime-managed',databaseId:business.id,image:service.image}]}]};
  const manifestPath=join(state.root,'managed-realtime-plan-manifest.json');
  const save=async()=>{await writeFile(composePath,JSON.stringify(configuration),{mode:0o600});await writeFile(manifestPath,JSON.stringify(manifest),{mode:0o600})};
  await save();const verifyManagedImage=createManagedRealtimeVerifier({repository,privateRun});
  const call=async optIn=>{let output='';const exit=await resourceConsumerMain(['--manifest',manifestPath,...(optIn?['--verify-managed-builds']:[])],
    {verifyManagedImage,output:{write:value=>output+=value}});return {exit,report:JSON.parse(output)}};
  const off=await call(false);check('default CLI cannot accept managed build without opt-in',off.exit===2&&off.report.services[0].imageRebuildVerified!==true);
  const on=await call(true);check('actual Compose and independently rebuilt image are bound',on.exit===2&&on.report.services[0].imageRebuildVerified===true);
  check('rebuild matches actual running container image',JSON.parse((await privateRun('docker',['inspect',state.projectId+'-realtime'])).stdout)[0].Image===on.report.services[0].imageProof.imageId);
  check('managed lifecycle is reflected in partial PLAN',on.report.services[0].inventory.startup.storedTenantOverridesSurviveReseed===true);
  check('runtime and whole-stack capacity remain unproven; TLS configuration is scoped',!on.report.capacityProven&&!on.report.runtimeVerified&&!on.report.fullyCovered
    &&(bundle.services.realtime.environment.DB_SSL==='true'
      ?on.report.services[0].inventory.tenantTlsPeerVerificationSupportedByReviewedPath===true
      :on.report.services[0].reasons.includes('tenant_tls_peer_verification_not_configured')));
  const counterfeitTag='roomqc/realtime:counterfeit-'+state.run,context=join(state.root,'counterfeit-realtime-image');
  await mkdir(context);await writeFile(join(context,'Dockerfile'),'FROM '+state.realtimeBootstrapBuild.tag+'\nLABEL roomqc.realtime.counterfeit="'+state.run+'"\n',{mode:0o444,flag:'wx'});
  let counterfeitId;
  try{
    check('counterfeit fixture base tag resolves to expected product',JSON.parse((await privateRun('docker',['image','inspect',state.realtimeBootstrapBuild.tag])).stdout)[0].Id===state.realtimeBootstrapBuild.imageId);
    await privateRun('docker',['build','--provenance=false','--tag',counterfeitTag,context],{timeout:120000});
    const info=JSON.parse((await privateRun('docker',['image','inspect',counterfeitTag])).stdout)[0];counterfeitId=info.Id;
    check('counterfeit retained trusted source label but changed immutable config',info.Config.Labels['roomqc.realtime.source']===state.realtimeBootstrapBuild.sourceHash
      &&info.Config.Labels['roomqc.realtime.counterfeit']===state.run&&info.Id!==state.realtimeBootstrapBuild.imageId);
    service.image=counterfeitId;manifest.vendorProjects[0].services[0].image=counterfeitId;await save();
    const rejected=await call(true);check('real CLI rejects trusted-label counterfeit image',rejected.exit===1&&rejected.report.code==='RESOURCE_MANAGED_REALTIME_IMAGE_MISMATCH');
    service.image=state.realtimeBootstrapBuild.imageId;manifest.vendorProjects[0].services[0].image=service.image;await save();
    const restored=await call(true);check('real CLI recovers on exact independently reproduced image',restored.exit===2&&restored.report.services[0].imageRebuildVerified===true);
    return {verified:true,checks:cases.length,cases,plan:on.report,imageProof:on.report.services[0].imageProof,
      counterfeitRejected:true,defaultOptInEnforced:true,actualComposeConfig:true,actualImageInspection:true,
      scope:'Realtime service projection only; dependency services are not declared as covered',
      wholeStackCapacityVerified:false,productAcceptance:false};
  }finally{
    if(counterfeitId){
      const current=JSON.parse((await privateRun('docker',['image','inspect',counterfeitTag])).stdout)[0];
      assert.equal(current.Id,counterfeitId);assert.equal(current.Config.Labels['roomqc.realtime.counterfeit'],state.run);
      await privateRun('docker',['image','rm',counterfeitTag]);
    }
  }
}
