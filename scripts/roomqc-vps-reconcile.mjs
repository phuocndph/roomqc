import {isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {open} from 'node:fs/promises';
import {uuidPattern} from '../server/control/errors.mjs';
import {readHostInventoryDocument} from '../server/control/host-inventory.mjs';
import {openDeploymentJournal} from '../server/control/deployment-journal.mjs';
import {reconciliationPlan,reconcileDeployment} from '../server/control/deployment-reconciliation.mjs';
import {preflightArguments} from './roomqc-vps-preflight.mjs';
import {runSsh} from './roomqc-vps-deploy.mjs';
import {reconciliationRemoteAdapter} from './lib/vps-reconciliation-remote.mjs';

const fail=code=>Object.assign(new Error(code),{code});
export function reconciliationArguments(args){
  if(args.length===1&&args[0]==='--help')return {help:true};
  const entries=new Map();
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(!['--run-id','--inventory-file','--host','--user','--identity-file','--mode','--output'].includes(key)||entries.has(key)
      ||typeof args[i+1]!=='string'||!args[i+1].trim())throw fail('DEPLOYMENT_RECONCILIATION_ARGUMENTS');
    entries.set(key,args[++i]);
  }
  if(!uuidPattern.test(entries.get('--run-id')??'')||!isAbsolute(entries.get('--inventory-file')??'')
    ||entries.has('--output')&&!isAbsolute(entries.get('--output')))throw fail('DEPLOYMENT_RECONCILIATION_ARGUMENTS');
  const mode=entries.get('--mode')??'plan';if(!['plan','execute'].includes(mode))throw fail('DEPLOYMENT_RECONCILIATION_ARGUMENTS');
  const target=preflightArguments(['--host',entries.get('--host'),'--user',entries.get('--user'),
    ...(entries.has('--identity-file')?['--identity-file',entries.get('--identity-file')]:[])]);
  return {...target,runId:entries.get('--run-id'),inventoryFile:entries.get('--inventory-file'),mode,output:entries.get('--output')??null};
}
export async function main(args=process.argv.slice(2),output=console){
  let runtime,file;
  const save=async value=>{const text=JSON.stringify(value,null,2)+'\n';await file.truncate(0);await file.write(text,0,'utf8');await file.sync()};
  try{
    const options=reconciliationArguments(args);
    if(options.help){output.log('Usage: npm run vps:reconcile -- --run-id UUID --inventory-file ABSOLUTE_JSON --host IP --user SSH_USER [--identity-file ABSOLUTE_KEY] [--mode plan|execute] [--output ABSOLUTE_JSON]');return 0}
    const document=await readHostInventoryDocument(options.inventoryFile);runtime=await openDeploymentJournal();
    const row=await runtime.journal.read(options.runId),plan=reconciliationPlan(row,document,options.host);
    let result={status:'planned',runId:row.id,clusterId:plan.clusterId,hostId:plan.hostId,environment:plan.environment,releaseId:plan.releaseId,
      actions:['fence_old_run','observe_current_release','record_resolution','release_own_lock']};
    if(options.output){file=await open(options.output,'wx',0o600);await save(result)}
    if(options.mode==='execute')result=await reconcileDeployment({journal:runtime.journal,runId:row.id,document,host:options.host,
      remote:reconciliationRemoteAdapter((...input)=>runSsh(options,...input))});
    if(file)await save(result);output.log(JSON.stringify({ok:true,mode:options.mode,...result}));
    return result.lockReleased===false?2:0;
  }catch(error){output.error(JSON.stringify({ok:false,code:/^[A-Z][A-Z0-9_]{1,119}$/.test(error?.code??'')?error.code:'DEPLOYMENT_RECONCILIATION_FAILED'}));return 1}
  finally{await file?.close().catch(()=>{});await runtime?.close().catch(()=>{})}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)process.exitCode=await main();
