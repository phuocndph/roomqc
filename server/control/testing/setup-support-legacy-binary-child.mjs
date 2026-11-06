// Diagnostic adapter only; application modules are loaded unchanged from the
// verified historical snapshot or current source. Secrets use private IPC.
import assert from 'node:assert/strict';
assert.equal(typeof process.send,'function');
let runtime;
process.once('message',async input=>{
 try{
  assert.match(input.run,/^[a-f0-9]{12}$/);assert(['legacy','current'].includes(input.source));
  const target=new URL(input.databaseUrl);assert.equal(target.hostname,'db');assert.equal(target.pathname,'/roomqc_legacy_'+input.run);
  const root=input.source==='legacy'?'file:///legacy-repository/server/control/':new URL('../',import.meta.url).href;
  const [{startControl},{registryConfiguration},{ReleaseApprovalTrust},{ReleaseValidationCatalog}]=await Promise.all([
   import(root+'server.mjs'),import(root+'registry.mjs'),import(root+'release-approval.mjs'),import(root+'release-validation.mjs')]);
  const config={databaseUrl:input.databaseUrl,emailKey:input.emailKey,clusters:[input.cluster],poolMax:1,
   publicOrigin:'http://localhost:8082',host:'127.0.0.1',port:0,allowLocal:true,supportClusterId:input.cluster.id,
   signupEnabled:true,setupDispatchEnabled:true,shutdownTimeoutMs:1000,
   releaseValidation:new ReleaseValidationCatalog(input.releaseCatalog,{trust:new ReleaseApprovalTrust(input.trust,{maximumValidityMs:86400000})}),
   ...registryConfiguration({ROOMQC_CONTROL_INVENTORY:JSON.stringify(input.inventory)},[input.cluster],true)};
  runtime=await startControl(config);await runtime.store.readiness();
  process.send({type:'ready',port:runtime.server.address().port,pid:process.pid});
  process.once('message',async message=>{if(message?.type==='stop'){await runtime.shutdown();process.disconnect()}});
 }catch(error){
  process.send({type:'failed',code:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'LEGACY_BINARY_DIAGNOSTIC_FAILED'});
  try{await runtime?.shutdown()}catch{}process.exitCode=1;process.disconnect();
 }
});
