import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {applyBusinessMigrations,businessMigrationManifest,businessMigrationReceipt,initializeBusinessMigrationHistory,inspectBusinessMigrations,migrationLocation,validateBusinessDatabaseUrl} from './business-migrate.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
async function secretFile(path){
  try{
    return (await boundedHealthFile(path,8192,{sensitive:true})).trim();
  }catch(error){if(error?.code==='BUSINESS_DATABASE_FILE_INVALID')throw error;fail('BUSINESS_DATABASE_FILE_INVALID')}
}
function args(argv){
  if(!Array.isArray(argv)||argv.some(v=>typeof v!=='string'))fail('BUSINESS_MIGRATION_ARGUMENTS_INVALID');
  if(argv.length===1&&argv[0]==='--help')return {help:true};
  const out={mode:null,databaseUrlFile:null,migrationDirectory:undefined,expectedHash:undefined,expectedCount:undefined,allowLocal:false};
  const seen=new Set();
  for(let i=0;i<argv.length;i++){
    const key=argv[i],value=argv[i+1];
    if(seen.has(key))fail('BUSINESS_MIGRATION_ARGUMENTS_INVALID');seen.add(key);
    if(key==='--mode'&&['initialize','plan','apply','verify','receipt'].includes(value)){out.mode=value;i++;continue}
    if(key==='--database-url-file'&&value){out.databaseUrlFile=value;i++;continue}
    if(key==='--migration-directory'&&value){out.migrationDirectory=value;i++;continue}
    if(key==='--expected-hash'&&/^[a-f0-9]{64}$/.test(value??'')){out.expectedHash=value;i++;continue}
    if(key==='--expected-count'&&/^[1-9]\d*$/.test(value??'')&&Number.isSafeInteger(Number(value))){out.expectedCount=Number(value);i++;continue}
    if(key==='--allow-local'){out.allowLocal=true;continue}
    fail('BUSINESS_MIGRATION_ARGUMENTS_INVALID');
  }
  if(!out.mode||!out.databaseUrlFile||out.mode==='initialize'&&(!out.expectedHash||!out.expectedCount))fail('BUSINESS_MIGRATION_ARGUMENTS_INVALID');return out;
}
export async function businessMigrateMain(argv=process.argv.slice(2),{output=process.stdout,Pool=pg.Pool}={}){
  try{
    const input=args(argv);if(input.help){output.write('RoomQC business migration runner. --mode initialize|plan|apply|verify|receipt --database-url-file ABSOLUTE_FILE [--migration-directory ABSOLUTE_DIR] [--expected-hash SHA256] [--expected-count N] [--allow-local]. initialize requires both expected values and an empty Supabase application schema.\n');return 0}
    const databaseUrl=validateBusinessDatabaseUrl(await secretFile(input.databaseUrlFile),{allowLocal:input.allowLocal});
    const location=migrationLocation(input.migrationDirectory),manifest=await businessMigrationManifest(location);
    if(input.expectedHash!==undefined&&input.expectedHash!==manifest.sha256)fail('BUSINESS_MIGRATION_SOURCE_MISMATCH');
    if(input.expectedCount!==undefined&&input.expectedCount!==manifest.count)fail('BUSINESS_MIGRATION_COUNT_MISMATCH');
    const pool=new Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:5000,statement_timeout:45000,lock_timeout:3000,
      idleTimeoutMillis:30000,application_name:'roomqc-business-migration'});
    try{
      const options={location,expectedHash:input.expectedHash,expectedCount:input.expectedCount};
      const result=input.mode==='initialize'?await initializeBusinessMigrationHistory(pool,options)
        :input.mode==='apply'?await applyBusinessMigrations(pool,options):await inspectBusinessMigrations(pool,options);
      const receipt=input.mode==='receipt'?businessMigrationReceipt(result,{expectedHash:manifest.sha256,expectedCount:manifest.count}):null;
      const ok=['initialize','plan'].includes(input.mode)||result.complete===true;
      output.write(JSON.stringify({ok,mode:input.mode,...result,...(receipt?{receipt}:{})})+'\n');return ok?0:2;
    }finally{await pool.end()}
  }catch(error){output.write(JSON.stringify({ok:false,code:error?.code??'BUSINESS_MIGRATION_FAILED',...(error?.migration?{migration:error.migration}:{})})+'\n');return 1}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])process.exitCode=await businessMigrateMain();
