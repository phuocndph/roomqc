// Orchestrates a real SIGKILL of one exact-owned Edge container. No arbitrary
// container IDs, URLs, commands, or output are accepted from the child marker.
import assert from 'node:assert/strict';
export async function runAdviceInterruption({state,source,values,privateRun,runClient}){
  assert.match(state.run,/^[a-f0-9]{12}$/);assert.equal(state.projectId,'roomqc-probe-'+state.run);
  const target=state.projectId+'-operations-advice-test',ownerLabel='roomqc.control-backend-test';
  const inspect=async()=>{
    const info=JSON.parse((await privateRun('docker',['container','inspect',target])).stdout)[0];
    assert.equal(info.Config.Labels?.[ownerLabel],state.run);assert.equal(info.Config.Labels?.['com.docker.compose.project'],state.projectId);
    assert.equal(info.Config.Image,state.operationsAdviceBuild.image);assert.ok(!Object.values(info.NetworkSettings.Ports??{}).some(v=>v?.length));
    assert.deepEqual(Object.keys(info.NetworkSettings.Networks),[state.projectId+'-internal']);return info;
  };
  let pending='',killTask=null,markers=0;
  const onStdout=chunk=>{
    pending+=chunk.toString();assert.ok(pending.length<1024*1024);const lines=pending.split(/\r?\n/);pending=lines.pop();
    for(const line of lines){let item;try{item=JSON.parse(line)}catch{continue}
      if(item.event!=='advice_interruption_barrier')continue;
      assert.deepEqual(Object.keys(item).sort(),['event','owner','phase']);assert.equal(item.owner,state.run);assert.equal(item.phase,'kill');assert.equal(++markers,1);
      killTask=(async()=>{
        const before=await inspect();assert.equal(before.State.Running,true);
        await privateRun('docker',['kill','--signal','KILL',target],{timeout:15000});
        const dead=await inspect();assert.equal(dead.State.Running,false);assert.equal(dead.State.ExitCode,137);
        await privateRun('docker',['start',target],{timeout:30000});const after=await inspect();
        assert.equal(after.State.Running,true);assert.equal(after.Image,before.Image);assert.notEqual(after.State.StartedAt,before.State.StartedAt);
        const release=`const i=JSON.parse(process.env.ROOMQC_FIXTURE_ADVICE_EDGE_INPUT);const r=await fetch('http://127.0.0.1:9083/_fixture/advice-interruption-release',
          {method:'POST',headers:{'x-roomqc-fixture-owner':i.run},signal:AbortSignal.timeout(10000)});if(r.status!==200)throw new Error('OWNED_RELEASE_FAILED');await r.arrayBuffer();`;
        await privateRun('docker',['exec',state.projectId+'-probe-client','node','--input-type=module','-e',release],{timeout:15000});
        return{verified:true,observedProviderBarrier:true,signal:'SIGKILL',stoppedExitCode:137,actualProcessRestart:true,imageUnchanged:true,
          startedAtChanged:true,ownerLabelsVerified:true,internalOnly:true,publishedPorts:0,arbitraryTargetsAllowed:false};
      })();killTask.catch(()=>{});
    }
  };
  let result;
  try{result=await runClient(source,values,240000,{onStdout})}
  catch(error){if(killTask)await killTask;throw error}
  assert.equal(markers,1);assert.ok(killTask);const processProof=await killTask;
  const controls=JSON.parse(result.stdout.split(/\r?\n/).filter(Boolean).at(-1));assert.equal(controls.verified,true);
  return{controls,processProof};
}
