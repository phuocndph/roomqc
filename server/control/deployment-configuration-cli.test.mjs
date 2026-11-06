import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {configurationArguments,main} from '../../scripts/roomqc-vps-config.mjs';

const args=['--inventory-file',resolve('private-inventory.json'),'--input-file',resolve('private-env.json'),
  '--cluster-id','config-fixture','--host','1.1.1.1','--user','root'];
const inventory={inventory:[{id:'config-fixture',approvedAddresses:['1.1.1.1']}]};
const secret='fixture-only-${RAW} # "quote" $(no-command)';
function fixture(){
  const logs=[],calls=[];
  return {logs,calls,output:{log:v=>logs.push(v),error:v=>logs.push(v)},dependencies:{
    readInventory:async()=>inventory,
    readInput:async(path,size,options)=>{calls.push({read:true,size,options});return JSON.stringify({PASSWORD:secret})},
    probe:async()=>{calls.push({probe:true});return {deploymentAllowed:true}},
    transport:async(options,command,input)=>{calls.push({options,command,input});return {stdout:''}},
  }};
}
test('configuration CLI defaults to a private plan, without connecting or printing values',async()=>{
  const f=fixture();assert.equal(configurationArguments(args).mode,'plan');
  assert.equal(await main(args,f.output,f.dependencies),0);
  assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].options,{sensitive:true});
  const receipt=JSON.parse(f.logs[0]);assert.equal(receipt.mode,'plan');assert.equal(receipt.secretsExposed,false);
  assert.equal(f.logs.join().includes(secret),false);assert.equal(receipt.envFile.format,'raw');
});
test('configuration CLI validates target before reading secrets and stops on failed preflight',async()=>{
  const wrong=fixture();assert.equal(await main([...args.slice(0,-4),'--host','8.8.8.8','--user','root'],wrong.output,wrong.dependencies),1);
  assert.equal(wrong.calls.length,0);assert.equal(JSON.parse(wrong.logs[0]).code,'VPS_DEPLOY_TARGET_MISMATCH');
  const blocked=fixture();blocked.dependencies.probe=async()=>({deploymentAllowed:false});
  assert.equal(await main([...args,'--mode','execute'],blocked.output,blocked.dependencies),1);
  assert.equal(blocked.calls.length,1);assert.equal(JSON.parse(blocked.logs[0]).code,'VPS_PREFLIGHT_BLOCKED');
  for(const approvedAddresses of ['prefix-1.1.1.1-suffix',{includes:()=>true},['1.1.1.1',null],['1.1.1.10']]){
    const malformed=fixture();malformed.dependencies.readInventory=async()=>({inventory:[{id:'config-fixture',approvedAddresses}]});
    assert.equal(await main([...args,'--mode','execute'],malformed.output,malformed.dependencies),1);
    assert.equal(malformed.calls.length,0);assert.equal(JSON.parse(malformed.logs[0]).code,'VPS_DEPLOY_TARGET_MISMATCH');
  }
});
test('configuration CLI executes only through private stdin and sanitizes transport failures',async()=>{
  const f=fixture();assert.equal(await main([...args,'--mode','execute'],f.output,f.dependencies),0);
  const transport=f.calls.find(v=>v.input);assert(transport.input.includes(secret));assert(!transport.command.includes(secret));
  assert(!f.logs.join().includes(secret));
  const failed=fixture();failed.dependencies.transport=async()=>{throw new Error(secret)};
  assert.equal(await main([...args,'--mode','execute'],failed.output,failed.dependencies),1);
  assert.deepEqual(JSON.parse(failed.logs[0]),{ok:false,code:'VPS_CONFIG_FAILED'});
});
test('configuration CLI rejects duplicate, malformed and non-string arguments',()=>{
  for(const input of [null,[1],[...args,'--host','1.1.1.1'],[...args,'--mode','force'],[...args,'--input-file'],
    args.map(v=>v===resolve('private-env.json')?'relative.json':v)])assert.throws(()=>configurationArguments(input));
});
