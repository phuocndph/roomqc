import assert from 'node:assert/strict';
import {collectServiceProbes} from '/control/service-probes.mjs';
const input=JSON.parse(process.env.ROOMQC_FIXTURE_SERVICE_INPUT);
const cluster={id:'fixture-a',url:'http://127.0.0.1:8000'};
const config={allowLocal:true,inventory:new Map([[cluster.id,cluster]])};
const result=await collectServiceProbes(config,cluster,input);
const failed=process.env.ROOMQC_FIXTURE_FAILED_SERVICE||null;
console.log(JSON.stringify({fullFiveProbesVerified:Object.values(result.probes).every(Boolean),failedService:failed,results:result.results}));
if(!result.probes.rest&&failed!=='rest')try{
  const response=await fetch(cluster.url+'/rest/v1/rpc/control_cluster_manifest',{method:'POST',signal:AbortSignal.timeout(5000),
    headers:{apikey:input.credential.publishableKey,authorization:'Bearer '+input.credential.token,'content-type':'application/json'},
    body:JSON.stringify({p_challenge:'b'.repeat(64)})});const manifest=await response.json();
  console.log(JSON.stringify({event:'manifest_diagnostic',status:response.status,code:manifest.code??null,
    actualHash:manifest.schemaManifestHash,storedExpected:manifest.expectedSchemaManifestHash,
    buildExpected:input.expected.schemaManifestHash,checkedAt:manifest.checkedAt}));
}catch{console.log(JSON.stringify({event:'manifest_diagnostic',unavailable:true}))}
if(failed){assert.equal(result.probes[failed],false,'Stopped service must not pass');
  for(const service of Object.keys(result.probes).filter(v=>v!==failed))assert.equal(result.probes[service],true,'Unrelated '+service+' canary must still work');
}else assert.ok(Object.values(result.probes).every(Boolean),'All real backend services must pass together');
