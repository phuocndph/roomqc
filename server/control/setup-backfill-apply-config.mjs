import {setupBackfillApplyConfiguration} from './setup-backfill-config.mjs';
import {ReleaseApprovalTrust} from './release-approval.mjs';
import {resourceDatabaseConnection} from './resource-database.mjs';
import {readSetupBackfillFile} from './setup-backfill-files.mjs';
import {setupBackfillFileSha256} from './setup-backfill-batch.mjs';

export async function loadSetupBackfillApplyConfiguration(file,{allowLocal=false}={}){
  try{
    const files=new Map();
    const read=async(path,max)=>{const value=await readSetupBackfillFile(path,max);files.set(path,{max,sha256:setupBackfillFileSha256(value)});return value};
    const raw=JSON.parse(await read(file,128*1024));
    const trust=new ReleaseApprovalTrust(JSON.parse(await read(raw.releaseTrustFile,64*1024)),{maximumValidityMs:86400000});
    const config=setupBackfillApplyConfiguration(raw,trust,{allowLocal});
    // Budget parsing is shared with the reader; additionally bind the exact file
    // bytes and private file access before constructing any database connection.
    const budget=await read(config.resourceBudgetFile??raw.resourceBudgetFile,256*1024);
    if(setupBackfillFileSha256(budget)!==config.resourceContext.budgetSha256)throw new Error();
    const batchTrust=JSON.parse(await read(config.batchTrustFile,64*1024));
    const secret=(await read(config.directory.dsnFile,8192)).trim();
    for(const t of config.targets)await readSetupBackfillFile(t.credentialFile,40000);
    const connection=resourceDatabaseConnection(secret,{expected:config.directory.expected},config.environment);
    return {...config,batchTrust,files,connection:{...connection,max:1,application_name:'roomqc-setup-backfill-writer',
      options:'-c default_transaction_read_only=off -c search_path=pg_catalog -c timezone=UTC -c datestyle=ISO,YMD'}};
  }catch{throw Object.assign(new Error('INVALID_SETUP_BACKFILL_APPLY_CONFIG'),{code:'INVALID_SETUP_BACKFILL_APPLY_CONFIG'})}
}
export async function assertSetupBackfillApplyFiles(config){
  for(const [path,entry] of config.files){
    if(setupBackfillFileSha256(await readSetupBackfillFile(path,entry.max))!==entry.sha256)
      throw Object.assign(new Error('SETUP_BACKFILL_CONFIG_CHANGED'),{code:'SETUP_BACKFILL_CONFIG_CHANGED'});
  }
  for(const t of config.targets)await readSetupBackfillFile(t.credentialFile,40000);
}
