import {pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';
import {readHostInventoryDocument} from '../server/control/host-inventory.mjs';
import {boundedHealthFile} from '../server/control/workers/health-config.mjs';
import {assertDeploymentTarget} from '../server/control/vps-deploy.mjs';
import {deploymentEnvironment} from '../server/control/deployment-environment.mjs';
import {installDeploymentEnvironment} from './lib/deployment-environment-remote.mjs';
import {collectVpsPreflight,preflightArguments} from './roomqc-vps-preflight.mjs';
import {runSsh} from './roomqc-vps-deploy.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
export function configurationArguments(args){
  if(!Array.isArray(args)||args.some(value=>typeof value!=='string'))fail('VPS_CONFIG_ARGUMENTS_INVALID');
  const values=new Map();
  for(let i=0;i<args.length;i++){
    if(!['--inventory-file','--cluster-id','--input-file','--mode','--host','--user','--identity-file'].includes(args[i])
      ||values.has(args[i])||!args[i+1]||args[i+1].startsWith('--'))fail('VPS_CONFIG_ARGUMENTS_INVALID');
    values.set(args[i],args[++i]);
  }
  const inventoryFile=values.get('--inventory-file'),inputFile=values.get('--input-file'),clusterId=values.get('--cluster-id');
  if(!isAbsolute(inventoryFile??'')||!isAbsolute(inputFile??'')||!/^[a-z][a-z0-9-]{1,39}$/.test(clusterId??''))
    fail('VPS_CONFIG_ARGUMENTS_INVALID');
  const mode=values.get('--mode')??'plan';if(!['plan','execute'].includes(mode))fail('VPS_CONFIG_ARGUMENTS_INVALID');
  const target=preflightArguments(['--host',values.get('--host'),'--user',values.get('--user'),
    ...(values.has('--identity-file')?['--identity-file',values.get('--identity-file')]:[])]);
  return {inventoryFile,inputFile,clusterId,mode,...target};
}
export async function main(args=process.argv.slice(2),output=console,dependencies={}){
  try{
    if(args.length===1&&args[0]==='--help'){
      output.log('Usage: vps:config --inventory-file ABSOLUTE_JSON --cluster-id CLUSTER_ID --input-file PRIVATE_ENV_JSON --host APPROVED_IP --user root [--identity-file ABSOLUTE_KEY] [--mode plan|execute]. Values are read privately; output contains only an immutable env_file reference.');return 0;
    }
    const options=configurationArguments(args),document=await (dependencies.readInventory??readHostInventoryDocument)(options.inventoryFile);
    assertDeploymentTarget(document,options);
    const raw=JSON.parse(await (dependencies.readInput??boundedHealthFile)(options.inputFile,131072,{sensitive:true}));
    const file=deploymentEnvironment(raw,options.clusterId);
    if(options.mode==='execute'){
      const preflight=await (dependencies.probe??collectVpsPreflight)(options);
      if(!preflight.deploymentAllowed)fail('VPS_PREFLIGHT_BLOCKED');
      await installDeploymentEnvironment((...args)=>(dependencies.transport??runSsh)(options,...args),{clusterId:options.clusterId,environment:raw});
    }
    output.log(JSON.stringify({ok:true,mode:options.mode,clusterId:options.clusterId,sha256:file.sha256,envFile:file.envFile,secretsExposed:false}));return 0;
  }catch(error){output.error(JSON.stringify({ok:false,code:/^[A-Z][A-Z0-9_]{1,119}$/.test(error.code??'')?error.code:'VPS_CONFIG_FAILED'}));return 1;
  }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)process.exitCode=await main();
