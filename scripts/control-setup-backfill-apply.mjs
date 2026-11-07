import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from '../server/control/node_modules/pg/lib/index.js';
import {loadSetupBackfillApplyConfiguration,assertSetupBackfillApplyFiles} from '../server/control/setup-backfill-apply-config.mjs';
import {setupBackfillGateways} from '../server/control/setup-backfill-config.mjs';
import {verifySetupBackfillBatch,validateSetupBackfillBatchReport,setupBackfillFileSha256} from '../server/control/setup-backfill-batch.mjs';
import {readSetupBackfillFile,createSetupBackfillOutput} from '../server/control/setup-backfill-files.mjs';
import {SetupBackfillApplier,setupBackfillCommandKey} from '../server/control/setup-backfill-apply.mjs';
import {migrationManifest} from '../server/control/migrate.mjs';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';

const failure=code=>{throw Object.assign(new Error(code),{code})};
export function setupBackfillApplyArguments(args){
  if(args.length===1&&args[0]==='--help')return {help:true};
  const values={};let allowLocal=false;
  for(let i=0;i<args.length;i++){
    const key=args[i];if(key==='--allow-local'){if(allowLocal)failure('INVALID_SETUP_BACKFILL_APPLY_ARGUMENTS');allowLocal=true;continue}
    if(!['--config','--report','--manifest','--output'].includes(key)||Object.hasOwn(values,key)||!args[i+1]||args[i+1].startsWith('--'))failure('INVALID_SETUP_BACKFILL_APPLY_ARGUMENTS');
    values[key]=args[++i];
  }
  if(Object.keys(values).length!==4||Object.values(values).some(v=>!isAbsolute(v))
    ||new Set(Object.values(values).map(v=>process.platform==='win32'?resolve(v).toLowerCase():resolve(v))).size!==4)failure('INVALID_SETUP_BACKFILL_APPLY_ARGUMENTS');
  return {configFile:values['--config'],reportFile:values['--report'],manifestFile:values['--manifest'],outputFile:values['--output'],allowLocal};
}
function filteredResult(result,item,key){
  const outcomes=['activated','waiting_owner','queued','reused_job','no_op','skipped_stale','skipped_busy','manual_review','unavailable','conflict','retry_later'];
  if(result?.commandId!==key||result.workspaceId!==item.workspaceId||result.clusterId!==item.clusterId||!outcomes.includes(result.outcome)
    ||typeof result.applied!=='boolean'||!/^SETUP_[A-Z0-9_]{1,80}$/.test(result.reason??''))failure('SETUP_BACKFILL_RESULT_INVALID');
  return {commandId:key,workspaceId:item.workspaceId,clusterId:item.clusterId,outcome:result.outcome,reason:result.reason,applied:result.applied};
}
export async function executeSetupBackfillApply(options){
  let pool,client,output,interrupted=false;const interrupt=()=>{interrupted=true};
  try{
    const repository=fileURLToPath(new URL('../',import.meta.url)),source=await captureBackendSourceBinding(repository);
    const config=await loadSetupBackfillApplyConfiguration(options.configFile,{allowLocal:options.allowLocal});
    const reportText=await readSetupBackfillFile(options.reportFile,512*1024),manifestText=await readSetupBackfillFile(options.manifestFile,128*1024);
    const manifest=JSON.parse(manifestText),p=verifySetupBackfillBatch(manifest,config.batchTrust);
    const schemaVersion=(await migrationManifest()).at(-1).version;
    validateSetupBackfillBatchReport(p,reportText,config,source,{schemaVersion});
    // Reserve a new private output BEFORE any connection or mutation. Recovery
    // uses the same approved manifest and a new output, never an old local log.
    output=await createSetupBackfillOutput(options.outputFile);
    await output.append({type:'begin',version:1,batchId:p.batchId,reportSha256:p.reportSha256,
      manifestSha256:setupBackfillFileSha256(manifestText),source:p.source,reviewerRef:p.reviewerRef,changeRef:p.changeRef,
      planned:p.items.length,startedAt:new Date().toISOString()});
    process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
    pool=new pg.Pool(config.connection);pool.on('error',()=>{});client=await pool.connect();client.on('error',()=>{});
    const lock=(await client.query('SELECT pg_catalog.pg_try_advisory_lock(727004,1) AS locked,pg_catalog.pg_backend_pid() AS pid')).rows[0];
    if(lock.locked!==true)failure('SETUP_BACKFILL_WRITER_BUSY');
    const guard=async()=>{
      if(interrupted)failure('SETUP_BACKFILL_INTERRUPTED');
      await assertSetupBackfillApplyFiles(config);
      if(setupBackfillFileSha256(await readSetupBackfillFile(options.manifestFile,128*1024))!==setupBackfillFileSha256(manifestText)
        ||setupBackfillFileSha256(await readSetupBackfillFile(options.reportFile,512*1024))!==p.reportSha256)failure('SETUP_BACKFILL_INPUT_CHANGED');
      verifySetupBackfillBatch(manifest,config.batchTrust);
      assertBackendSourceBinding(source,await captureBackendSourceBinding(repository));
    };
    // Pin one session for the whole run. Never reconnect and silently lose the
    // writer lock. The SQL predicate also rejects transaction-pooler handoff.
    const session={connect(){failure('SETUP_BACKFILL_SESSION_INVALID')},query:async(sql,parameters)=>{
      if(sql.startsWith('SELECT roomqc_control.apply_setup_backfill(')){
        await guard();
        sql+=' WHERE pg_catalog.pg_backend_pid()=$10 AND EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE pid=pg_catalog.pg_backend_pid()'
          +" AND locktype='advisory' AND classid=727004 AND objid=1 AND objsubid=2 AND granted AND mode='ExclusiveLock')";
        return client.query(sql,[...parameters,lock.pid]);
      }
      return client.query(sql,parameters);
    }};
    const applier=new SetupBackfillApplier(session,{expected:config.directory.expected,bindings:config.targets.map(t=>t.identity),gateways:setupBackfillGateways(config)});
    await applier.readiness();const counts={};
    for(const item of p.items){
      await guard();const key=setupBackfillCommandKey(p.batchId,item.workspaceId);
      const result=filteredResult(await applier.apply({key,reportSha256:p.reportSha256,item}),item,key);
      await output.append({type:'result',...result,recordedAt:new Date().toISOString()});
      counts[result.outcome]=(counts[result.outcome]??0)+1;
    }
    await guard();await output.append({type:'complete',batchId:p.batchId,recorded:p.items.length,counts,finishedAt:new Date().toISOString()});
    return {status:'batch_recorded',recorded:p.items.length,counts};
  }catch(error){
    const safe=['INVALID_SETUP_BACKFILL_APPLY_CONFIG','SETUP_BACKFILL_BATCH_INVALID','SETUP_BACKFILL_FILE_ACCESS','SETUP_BACKFILL_CONFIG_CHANGED',
      'SETUP_BACKFILL_OUTPUT_EXISTS','SETUP_BACKFILL_WRITER_BUSY','SETUP_BACKFILL_INTERRUPTED','SETUP_BACKFILL_INPUT_CHANGED',
      'SETUP_BACKFILL_APPLY_PRIVILEGES','SETUP_BACKFILL_KEY_CONFLICT','SETUP_BACKFILL_RESULT_INVALID'];
    const code=safe.includes(error?.code)?error.code:'SETUP_BACKFILL_APPLY_FAILED';
    try{await output?.append({type:'stopped',error:code,resume:'same_manifest_new_output',recordedAt:new Date().toISOString()})}catch{}
    failure(code);
  }finally{
    process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
    // Closing the pinned connection releases the session lock even after a
    // failed command. No extra connection or unlock-on-another-session query.
    client?.release(true);await pool?.end();await output?.close();
  }
}
export async function runSetupBackfillApply(args){
  try{
    const options=setupBackfillApplyArguments(args);
    if(options.help){process.stdout.write('RoomQC setup backfill APPLY — approved batch, dedicated writer, max100 rows.\n'
      +'node scripts/control-setup-backfill-apply.mjs --config <absolute writer.json> --report <absolute dry-run.json> --manifest <absolute signed-batch.json> --output <new absolute results.jsonl> [--allow-local]\n'
      +'Resume with the SAME approved manifest and a NEW output. Old output is never authority or overwritten.\n');return}
    process.stdout.write(JSON.stringify(await executeSetupBackfillApply(options))+'\n');
  }catch(error){process.stderr.write(JSON.stringify({error:error?.code==='INVALID_SETUP_BACKFILL_APPLY_ARGUMENTS'?error.code:error?.code??'SETUP_BACKFILL_APPLY_FAILED'})+'\n');process.exitCode=1}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await runSetupBackfillApply(process.argv.slice(2));
