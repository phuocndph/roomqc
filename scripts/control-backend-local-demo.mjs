// Explicit handoff from fresh sandbox preparation to a persistent local demo.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function launchLocalDemo({repository,state,privateRun,input,program,save,emit}){
  assert.equal(state.persistentLocalDemo,true);assert.equal(state.diagnosticOnly,true);
  const name=state.projectId+'-local-demo',root=state.root;
  await writeFile(join(root,'demo-service.mjs'),program,{mode:0o600,flag:'wx'});
  await writeFile(join(root,'demo-input.json'),JSON.stringify({...input,persistentLocalDemo:true}),{mode:0o600,flag:'wx'});
  await privateRun('docker',['run','--detach','--name',name,'--restart','unless-stopped',
    '--label','roomqc.control-backend-test='+state.run,'--label','com.docker.compose.project='+state.projectId,
    '--network',state.projectId+'-internal','--network-alias','local-demo-service',
    '--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--cpus','0.5','--pids-limit','64',
    '--mount','type=bind,src='+join(root,'demo-service.mjs')+',dst=/demo/service.mjs,readonly',
    '--mount','type=bind,src='+join(root,'demo-input.json')+',dst=/demo/input.json,readonly',
    '--mount','type=bind,src='+join(repository,'server/control')+',dst=/control,readonly',
    '--mount','type=bind,src='+join(repository,'node_modules')+',dst=/node_modules,readonly',
    'node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85','node','/demo/service.mjs']);
  state.localDemoService=name;await save();
  await privateRun('docker',['start',state.browserFixture.frontend]);
  for(let attempt=0;attempt<90;attempt++){
    try{
      const response=await fetch(state.browserOrigin+'/api/control/healthz',{signal:AbortSignal.timeout(2000)});
      if(response.ok){emit('local_demo_ready',{origin:state.browserOrigin,mailbox:state.browserOrigin+'/__fixture/inbox'});return}
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('LOCAL_DEMO_START_TIMEOUT');
}
