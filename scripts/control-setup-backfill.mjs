import {writeFile} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from '../server/control/node_modules/pg/lib/index.js';
import {loadSetupBackfillConfiguration,setupBackfillGateways} from '../server/control/setup-backfill-config.mjs';
import {SetupBackfillScanner} from '../server/control/setup-backfill.mjs';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';

const fail=()=>{throw Object.assign(new Error('INVALID_SETUP_BACKFILL_ARGUMENTS'),{code:'INVALID_SETUP_BACKFILL_ARGUMENTS'})};
export function setupBackfillArguments(args){
  if(args.length===1&&args[0]==='--help')return {help:true};
  const values={};let allowLocal=false;
  for(let i=0;i<args.length;i++){
    const key=args[i];if(key==='--allow-local'){if(allowLocal)fail();allowLocal=true;continue}
    if(!['--config','--output','--cursor'].includes(key)||Object.hasOwn(values,key)||!args[i+1]||args[i+1].startsWith('--'))fail();
    values[key]=args[++i];
  }
  if(!isAbsolute(values['--config']??'')||!isAbsolute(values['--output']??'')||resolve(values['--config'])===resolve(values['--output']))fail();
  return {configFile:values['--config'],outputFile:values['--output'],cursor:values['--cursor']??null,allowLocal};
}
export async function runSetupBackfill(args){
  let pool;
  try{
    const options=setupBackfillArguments(args);
    if(options.help){process.stdout.write('RoomQC setup backfill — READ-ONLY dry-run, one page (max100 workspaces).\n'
      +'node scripts/control-setup-backfill.mjs --config <absolute manifest.json> --output <new absolute report.json> [--cursor <opaque cursor>] [--allow-local]\n'
      +'No --apply mode. Uses a dedicated reader DSN file and scoped receipt credential files. Existing output is never overwritten.\n');return}
    const repository=fileURLToPath(new URL('../',import.meta.url));
    const source=await captureBackendSourceBinding(repository);
    const config=await loadSetupBackfillConfiguration(options.configFile,{allowLocal:options.allowLocal});
    pool=new pg.Pool(config.connection);pool.on('error',()=>{});
    const scanner=new SetupBackfillScanner(pool,{expected:config.directory.expected,bindings:config.targets.map(t=>t.identity),gateways:setupBackfillGateways(config)});
    const report=await scanner.scan({cursor:options.cursor});
    assertBackendSourceBinding(source,await captureBackendSourceBinding(repository));
    report.source={backendSha256:source.sha256,backendFiles:source.files.length};
    report.resourceBudgetSha256=config.resourceContext?.budgetSha256??null;
    await writeFile(options.outputFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    process.stdout.write(JSON.stringify({status:'dry_run_saved',mode:report.mode,pageCount:report.pageCount,counts:report.counts,
      hasNextPage:report.nextCursor!==null})+'\n');
  }catch(error){
    const codes=['INVALID_SETUP_BACKFILL_ARGUMENTS','INVALID_SETUP_BACKFILL_CONFIG','INVALID_SETUP_BACKFILL','SETUP_BACKFILL_READ_FAILED'];
    process.stderr.write(JSON.stringify({error:codes.includes(error?.code)?error.code:error?.code==='EEXIST'?'SETUP_BACKFILL_OUTPUT_EXISTS':'SETUP_BACKFILL_FAILED'})+'\n');
    process.exitCode=1;
  }finally{await pool?.end()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await runSetupBackfill(process.argv.slice(2));
