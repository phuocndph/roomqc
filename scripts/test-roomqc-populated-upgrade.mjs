// Rehearse the complete current migration chain against a checked backup.
// Only an exact-owned, disconnected, disposable database is ever written.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {extensionMemberInventorySQL,restoreArchiveWithExtensionMembers} from './roomqc-restore-extension-members.mjs';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
assert.equal(process.argv.length,6,'Use --backup <verified-backup-directory> --runner-image <immutable-control-image>');
assert.equal(process.argv[2],'--backup');
assert.equal(process.argv[4],'--runner-image');
const runnerImage=process.argv[5];
assert.match(runnerImage,/^(?:[a-z0-9][a-z0-9/_.:-]*@)?sha256:[a-f0-9]{64}$/);
const backup=resolve(process.argv[3]),run=randomBytes(6).toString('hex');
const target='roomqc-upgrade-'+run,label='roomqc.upgrade-rehearsal';
const cliTarget=target+'-cli';
const output=join(root,'.local',target),stateFile=join(output,'result.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const ident=value=>'"'+value.replaceAll('"','""')+'"';
const docker=(args,input,timeout=30000)=>execFileSync('docker',args,{input,encoding:'utf8',timeout,
  maxBuffer:24_000_000,windowsHide:true,stdio:['pipe','pipe','pipe']});
const sql=(statement,role='supabase_admin')=>docker(['exec','-i',target,'psql','-U',role,'-d','postgres',
  '-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],statement,60000).trim();
const state={run,target,backup,startedAt:new Date().toISOString(),phase:'prepare',applied:0,
  verified:false,cleaned:false,sourceBusinessWrites:false};
await mkdir(output,{mode:0o700});
const save=()=>writeFile(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});
await save();let created=false,source,binding;
try{
  binding=await captureBackendSourceBinding(root);state.runnerSourceSha256=binding.sha256;
  const previous=JSON.parse(await readFile(join(backup,'result.json'),'utf8'));
  const checksums=JSON.parse(await readFile(join(backup,'checksums.json'),'utf8'));
  assert.deepEqual(Object.keys(checksums).sort(),['database.dump','expected.json','pgmq-queues.sql','roles.sql']);
  for(const [name,expected]of Object.entries(checksums))assert.equal(hash(await readFile(join(backup,name))),expected);
  assert.equal(checksums['database.dump'],previous.sha256);
  assert.match(previous.sourceImage,/^sha256:[a-f0-9]{64}$/);
  state.backupSha256=previous.sha256;state.sourceImage=previous.sourceImage;
  state.runner='server/control/business-migrate-cli.mjs';
  state.runnerImage=docker(['image','inspect',runnerImage,'--format','{{.Id}}']).trim();
  // Prove that this immutable image contains the current product modules;
  // never bind source over the image and mistake that for packaging evidence.
  const shipped=binding.files.filter(f=>/^server\/control\/(?:[^/]+\.mjs|schema\.sql|package(?:-lock)?\.json|workers\/.*|migrations\/.*)$/.test(f.path))
    .map(f=>({path:'/app/'+f.path.slice('server/control/'.length),sha256:f.sha256}));
  const verifyImage="import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';let input='';for await(const c of process.stdin)input+=c;const files=JSON.parse(input);for(const f of files){const text=(await readFile(f.path,'utf8')).replace(/\\r\\n/g,'\\n');if(createHash('sha256').update(text).digest('hex')!==f.sha256)throw Error('RUNNER_IMAGE_SOURCE_MISMATCH')}console.log(JSON.stringify({verified:true,files:files.length}));";
  state.packagedSource=JSON.parse(docker(['run','--rm','-i','--network','none','--read-only','--cap-drop','ALL',
    '--security-opt','no-new-privileges:true','--entrypoint','node',state.runnerImage,'--input-type=module','-e',verifyImage],JSON.stringify(shipped)));
  source=await Promise.all((await readdir(join(root,'supabase/migrations'))).filter(n=>n.endsWith('.sql')).sort()
    .map(async name=>({name,bytes:(await readFile(join(root,'supabase/migrations',name),'utf8')).replace(/\r\n/g,'\n')})));
  state.migrationSetSha256=hash(source.map(f=>f.name+'\0'+f.bytes+'\0').join(''));
  docker(['run','-d','--name',target,'--label',label+'='+run,'--network','none','--memory','1536m',
    '--user','postgres','--entrypoint','sh',previous.sourceImage,'-c',
    'initdb -D /tmp/roomqc-upgrade-data --username=supabase_admin --auth-local=trust --auth-host=scram-sha-256 --locale=en_US.UTF-8 >/tmp/initdb.log 2>&1 && exec postgres -D /tmp/roomqc-upgrade-data -c shared_preload_libraries=pg_cron,pg_net,supabase_vault -c cron.database_name=postgres -c cron.launch_active_jobs=off -c listen_addresses=127.0.0.1 -c max_connections=50']);
  created=true;let ready=false;
  for(let i=0;i<80;i++){try{assert.equal(sql('SELECT 1;'),'1');ready=true;break}catch{await new Promise(r=>setTimeout(r,250))}}
  assert.equal(ready,true);
  const info=JSON.parse(docker(['inspect',target]))[0];
  assert.equal(info.HostConfig.NetworkMode,'none');assert.deepEqual(info.NetworkSettings.Ports,{});
  const roles=await readFile(join(backup,'roles.sql'),'utf8');assert.ok(!/PASSWORD\s+'/i.test(roles));
  assert.equal((roles.match(/^CREATE ROLE supabase_admin;$/gm)||[]).length,1);
  sql(roles.replace(/^CREATE ROLE supabase_admin;$/m,'-- bootstrap already exists'));
  docker(['cp',join(backup,'database.dump'),target+':/tmp/roomqc-upgrade.dump']);
  const expected=JSON.parse(await readFile(join(backup,'expected.json'),'utf8'));
  state.restore=await restoreArchiveWithExtensionMembers({docker,target,archive:'/tmp/roomqc-upgrade.dump',expected,directory:output});
  const extensionMembers=expected.filter(row=>row.kind==='extension_function');
  if(extensionMembers.length)assert.deepEqual(sql("BEGIN READ ONLY; SET LOCAL search_path=''; "+extensionMemberInventorySQL+' COMMIT;').split('\n').filter(row=>row.startsWith('{')).map(row=>JSON.parse(row)),extensionMembers);
  sql(await readFile(join(backup,'pgmq-queues.sql'),'utf8'));
  sql('ALTER DATABASE postgres OWNER TO postgres;');assert.equal(sql('SHOW cron.launch_active_jobs;'),'off');
  state.restoreCompleted=true;state.phase='migration_history_preflight';await save();
  const history=JSON.parse(sql('SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations;'));
  assert.ok(history.length>0&&history.length<source.length,'A populated older release is required');
  state.historyBeforeCount=history.length;state.targetCount=source.length;
  const expectedHistory=source.slice(0,history.length).map(f=>f.name.slice(0,14));
  state.historyPrefixMatches=history.every((version,index)=>version===expectedHistory[index]);
  if(!state.historyPrefixMatches){
    state.historyMismatchCount=history.filter((version,index)=>version!==expectedHistory[index]).length;
    throw Object.assign(new Error('MIGRATION_HISTORY_DIVERGED'),{code:'MIGRATION_HISTORY_DIVERGED'});
  }
  assert.equal(sql("SELECT count(*) FROM storage.buckets WHERE id='roomqc-control-probe';"),'0','This rehearsal expects a pre-canary backup');
  const tables=JSON.parse(sql(`SELECT json_agg(json_build_object('schema',n.nspname,'table',c.relname,
    'columns',(SELECT json_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY n.nspname,c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r'
    AND n.nspname IN ('public','auth','private','storage','supabase_migrations','pgmq');`));
  const inventory=()=>{
    const queries=tables.map(t=>{
      const name=t.schema+'.'+t.table;
      const where=name==='supabase_migrations.schema_migrations'?' WHERE version<='+q(history.at(-1)):
        name==='storage.buckets'?" WHERE id<>'roomqc-control-probe'":'';
      return `SELECT jsonb_build_object('name',${q(name)},'count',count(*),'sha256',
        encode(sha256(convert_to(coalesce(string_agg(row_text,E'\\n' ORDER BY row_text COLLATE "C"),''),'UTF8')),'hex'))
        FROM (SELECT to_jsonb(t)::text AS row_text FROM
          (SELECT ${t.columns.map(ident).join(',')} FROM ${ident(t.schema)}.${ident(t.table)}${where}) t) rows;`;
    });
    return sql('BEGIN READ ONLY;\n'+queries.join('\n')+'\nCOMMIT;').split(/\r?\n/).filter(x=>x.startsWith('{')).map(x=>JSON.parse(x));
  };
  state.phase='baseline';await save();const before=inventory();
  await writeFile(join(output,'original-columns.json'),JSON.stringify(tables,null,2)+'\n',{mode:0o600});
  await writeFile(join(output,'before.json'),JSON.stringify(before,null,2)+'\n',{mode:0o600});
  const password=randomBytes(32).toString('hex');
  sql('ALTER ROLE supabase_admin PASSWORD '+q(password)+';');
  const dsn='postgresql://supabase_admin:'+password+'@127.0.0.1:5432/postgres\n';
  const cli=(mode,expectedExit=0)=>{
    const args=['run','--rm','-i','--name',cliTarget,'--label',label+'='+run,'--network','container:'+target,
      '--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--memory','256m','--cpus','0.5','--pids-limit','64',
      '--user','1000:1000','--tmpfs','/run/roomqc:rw,nosuid,noexec,size=1m,mode=0700,uid=1000,gid=1000',
      '--entrypoint','sh',state.runnerImage,'-c',
      'umask 077; cat > /run/roomqc/business.dsn; exec node /app/business-migrate-cli.mjs "$@"','--','--mode',mode,
      '--database-url-file','/run/roomqc/business.dsn',
      '--expected-hash',state.migrationSetSha256,'--expected-count',String(source.length),'--allow-local'];
    let stdout,code=0;
    try{stdout=docker(args,dsn,120000)}catch(error){stdout=String(error.stdout??'');code=error.status??1}
    const result=JSON.parse(stdout);assert.equal(code,expectedExit,mode+': '+(result.code??'unexpected exit'));
    assert.equal(stdout.includes(password),false);return result;
  };
  state.phase='product_cli_preflight';await save();
  const plan=cli('plan');assert.equal(plan.pending.length,source.length-history.length);assert.equal(plan.complete,false);
  assert.equal(cli('verify',2).ok,false);assert.equal(cli('receipt',2).receipt.status,'pending');
  state.pendingVerificationRejected=true;state.phase='product_cli_apply';await save();
  const applied=cli('apply');assert.equal(applied.complete,true);assert.equal(applied.applied,true);
  state.applied=source.length-history.length;
  assert.equal(cli('apply').complete,true);state.retryIdempotent=true;
  assert.equal(cli('verify').complete,true);
  state.migrationReceipt=cli('receipt').receipt;assert.equal(state.migrationReceipt.status,'complete');
  state.productCliVerified=true;
  state.phase='verify';await save();const after=inventory();
  await writeFile(join(output,'after.json'),JSON.stringify(after,null,2)+'\n',{mode:0o600});
  assert.deepEqual(after,before,'Every original column and row must remain unchanged, including old history and original buckets');
  state.originalTablesVerified=before.length;state.originalDataUnchanged=true;
  const afterHistory=JSON.parse(sql('SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations;'));
  assert.deepEqual(afterHistory,source.map(f=>f.name.slice(0,14)));state.historyAfterCount=afterHistory.length;
  assert.equal(sql(`SELECT count(*) FROM public.guest_invoices WHERE checkout_actor_id IS NOT NULL
    OR checkout_command_id IS NOT NULL OR checkout_snapshot IS NOT NULL;`),'0');
  assert.equal(sql('SELECT count(*) FROM public.room_bookings WHERE booking_flag_room_status IS NOT NULL;'),'0');
  const bucket=JSON.parse(sql(`SELECT json_build_object('id',id,'name',name,'public',public,
    'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) FROM storage.buckets WHERE id='roomqc-control-probe';`));
  assert.deepEqual(bucket,{id:'roomqc-control-probe',name:'roomqc-control-probe',public:false,file_size_limit:4096,allowed_mime_types:['application/octet-stream']});
  state.intentionalAdditionsVerified={nullableColumns:4,privateCanaryBuckets:1};
  state.schemaFingerprint=sql('SELECT private.roomqc_schema_fingerprint();');assert.match(state.schemaFingerprint,/^[a-f0-9]{64}$/);
  const child=sql(`SELECT inhrelid::regclass::text FROM pg_inherits WHERE inhparent='realtime.messages'::regclass ORDER BY inhrelid LIMIT 1;`);
  assert.match(child,/^realtime\.messages_\d{4}_\d{2}_\d{2}$/);
  for(const mutation of [`GRANT SELECT ON ${child} TO anon`,
    `ALTER TABLE ${child} ADD CONSTRAINT roomqc_rehearsal_forbidden CHECK(payload IS NULL OR binary_payload IS NULL)`]){
    let denied=false;
    try{sql('BEGIN; '+mutation+'; SELECT private.roomqc_schema_fingerprint(); ROLLBACK;')}
    catch(error){denied=/ERROR:\s+55000:/.test(error.stderr??'')}
    assert.equal(denied,true,'Restored partition still rejects unauthorized changes');
    assert.equal(sql('SELECT private.roomqc_schema_fingerprint();'),state.schemaFingerprint);
  }
  state.partitionTamperingRejected=2;assert.deepEqual(inventory(),before);
  state.verified=true;state.phase='populated_upgrade_verified';
}catch(error){
  state.errorCode=/^[A-Z0-9_]{3,100}$/.test(error.code??'')?error.code:'UPGRADE_FAILED';
  state.sqlstate=/ERROR:\s+([A-Z0-9]{5}):/.exec(error.stderr??'')?.[1];
  await writeFile(join(output,'private-error.log'),String(error.stderr??error.stack??error),{mode:0o600});
  process.exitCode=1;
}finally{
  const leftovers=docker(['container','ls','--all','-q','--filter','name=^/'+cliTarget+'$']).trim();
  if(leftovers){const actual=JSON.parse(docker(['inspect',cliTarget]))[0];assert.equal(actual.Config.Labels[label],run);docker(['rm','-f',cliTarget]);}
  if(created){const actual=JSON.parse(docker(['inspect',target]))[0];assert.equal(actual.Name,'/'+target);
    assert.equal(actual.Config.Labels[label],run);docker(['rm','-f',target]);state.cleaned=true;}
  if(source){const current=await Promise.all(source.map(async f=>f.name+'\0'+(await readFile(join(root,'supabase/migrations',f.name),'utf8')).replace(/\r\n/g,'\n')+'\0'));
    assert.equal(hash(current.join('')),state.migrationSetSha256);state.sourceUnchanged=true;}
  if(binding){assertBackendSourceBinding(binding,await captureBackendSourceBinding(root));state.runnerSourceUnchanged=true;}
  state.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify(state));
}
