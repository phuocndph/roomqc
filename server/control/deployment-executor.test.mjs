import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {executorDocument,loadExecutorRelease,prepareExecutorRelease,main} from '../../scripts/roomqc-vps-executor.mjs';
import {deploymentCompose} from './vps-deploy.mjs';
import {inventoryFixture} from './vps-onboarding.mjs';
import {evidenceHash} from './deployment-reconciliation.mjs';
import {releaseApprovalEndpointFingerprint} from './release-approval.mjs';

const image='roomqc/test@sha256:'+'a'.repeat(64);
async function fixture(){
  const directory=await mkdtemp(resolve('.local/executor-test-')),id=randomUUID();
  const options={inventoryFile:resolve(directory,'inventory.json'),composeFile:resolve(directory,'compose.json'),
    clusterId:'cluster-fixture',releaseId:'release-executor',image,host:'1.1.1.1',user:'roomqc',identityFile:resolve(directory,'test-key')};
  const inventory=inventoryFixture();inventory.inventory[0].approvedAddresses=['1.1.1.1'];
  await writeFile(options.inventoryFile,JSON.stringify(inventory),{mode:0o600});
  const compose=deploymentCompose({services:{web:{image,healthcheck:{test:['CMD','true']}}}},options);
  const document=executorDocument(options,compose.sha256,id);await writeFile(resolve(directory,id+'.json'),JSON.stringify(document),{mode:0o600});
  const entry=inventory.inventory[0],endpoint_fingerprint=releaseApprovalEndpointFingerprint({url:entry.url,internalUrl:entry.internalUrl??null,
    approvedAddresses:entry.approvedAddresses??[],credentialRef:entry.credentialRef??entry.id});
  const job={spec_id:id,execution_sha256:evidenceHash(document),compose_sha256:compose.sha256,endpoint_fingerprint};
  return {directory,id,options,inventory,compose,document,job,close:async()=>{
    for(const name of ['inventory.json',id+'.json'])await unlink(resolve(directory,name));await rmdir(directory);
  }};
}
test('executor specification binds every server-owned target, input path and immutable release to its hash',async()=>{
  const f=await fixture();try{
    for(const field of ['host','user','inventoryFile','identityFile','composeFile','releaseId','image']){
      const changed=structuredClone(f.document);changed.options[field]+='changed';assert.notEqual(evidenceHash(changed),f.job.execution_sha256);
    }
    let probed=0;
    const deps={local:true,composeReader:async()=>f.compose,probe:async()=>{probed++;return {host:'1.1.1.1',capturedAt:new Date().toISOString(),deploymentAllowed:true,rootFilesystem:{freePercent:50},docker:{serverVersion:'fixture'}}},remote:{}};
    const result=await loadExecutorRelease(f.job,f.directory,deps);assert.equal(result.plan.executeAllowed,true);assert.equal(probed,1);
    await assert.rejects(()=>loadExecutorRelease({...f.job,endpoint_fingerprint:'0'.repeat(64)},f.directory,deps),{code:'DEPLOYMENT_SPEC_CHANGED'});assert.equal(probed,2);
    await writeFile(resolve(f.directory,f.id+'.json'),JSON.stringify({...f.document,options:{...f.document.options,user:'changed'}}),{mode:0o600});
    await assert.rejects(()=>loadExecutorRelease(f.job,f.directory,deps),{code:'DEPLOYMENT_SPEC_CHANGED'});assert.equal(probed,2);
    await assert.rejects(()=>loadExecutorRelease({...f.job,spec_id:'../escape'},f.directory,deps),{code:'DEPLOYMENT_SPEC_INVALID'});
  }finally{await f.close()}
});
test('executor checks approved address and refuses production before a remote adapter runs',async()=>{
  const f=await fixture();try{
    await assert.rejects(()=>prepareExecutorRelease({...f.options,host:'8.8.8.8'},{local:true,composeReader:async()=>{throw new Error('must not read compose')}}),{code:'VPS_DEPLOY_TARGET_MISMATCH'});
    f.inventory.inventory[0].environment='production';f.inventory.inventory[0].url='https://cluster-fixture.example.invalid';
    f.inventory.inventory[0].preflight={capturedAt:new Date().toISOString(),deploymentAllowed:true,diskFreePercent:50,dockerServerVersion:'fixture'};
    await writeFile(f.options.inventoryFile,JSON.stringify(f.inventory),{mode:0o600});
    await assert.rejects(()=>prepareExecutorRelease(f.options,{local:true,composeReader:async()=>f.compose}),{code:'DEPLOYMENT_TARGET_NOT_READY'});
  }finally{await f.close()}
});
test('executor CLI help does not open a database and invalid arguments redact private values',async()=>{
  const logs=[],output={log:value=>logs.push(value),error:value=>logs.push(value)};
  assert.equal(await main(['--help'],output),0);
  assert.equal(await main(['run','--identity-file','private-value'],output),1);assert.equal(logs.join().includes('private-value'),false);
});
