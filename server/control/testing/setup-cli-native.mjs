// Exact-owned native CLI diagnostic. CLI processes receive private files and
// separate reader/writer logins; receipts come from actual PostgREST/Postgres.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,createHmac,generateKeyPairSync,sign} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer,connect} from 'node:net';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry} from '../migrate.mjs';
import {fixtureReleaseContext,fixtureReleaseApproval,fixtureReleaseTrustRaw,seedFixtureReleaseAuthority} from '../release-test-fixtures.mjs';
import {recoveryBinding,SetupRecoveryGateway} from '../setup-recovery.mjs';
import {loadSetupBackfillApplyConfiguration} from '../setup-backfill-apply-config.mjs';
import {setupBackfillBatchSigningBytes,setupBackfillFileSha256} from '../setup-backfill-batch.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{const value={observed:false};value.promise=new Promise(resolve=>value.resolve=()=>{value.observed=true;resolve()});return value};
async function until(read,label,timeout=120000){
  const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(value)return value;await sleep(20)}
  throw new Error('NATIVE_CLI_TIMEOUT_'+label);
}

// No fabricated PG replies. Apply #1 loses all replies through the actual
// ReadyForQuery(commit); #3 withholds them so a real remote DB lock can be held.
async function wireProxy(){
  const sockets=new Set(),lost=deferred(),held=deferred(),release=deferred();let applies=0;
  const server=createServer(down=>{
    const up=connect({host:'db',port:5432});sockets.add(up);sockets.add(down);
    let front=Buffer.alloc(0),back=Buffer.alloc(0),startup=true,hold=0;
    const close=()=>{up.destroy();down.destroy();sockets.delete(up);sockets.delete(down)};
    up.on('error',close);down.on('error',close);up.on('close',close);down.on('close',close);
    down.on('data',chunk=>{
      front=Buffer.concat([front,chunk]);
      while(front.length>=5){
        const size=startup?front.readInt32BE(0):front.readInt32BE(1)+1;
        if(size<5||size>1024*1024){close();return}if(front.length<size)break;
        const frame=front.subarray(0,size);front=front.subarray(size);
        if(startup){startup=false;continue}
        let sql='';
        if(frame[0]===80){const zero=frame.indexOf(0,5);sql=frame.toString('utf8',zero+1,frame.indexOf(0,zero+1))}
        if(frame[0]===81)sql=frame.toString('utf8',5,frame.length-1);
        if(sql.startsWith('SELECT roomqc_control.apply_setup_backfill(')){
          applies++;if(applies===1||applies===3)hold=applies;
        }
      }
      up.write(chunk);
    });
    let withheld=[];
    up.on('data',chunk=>{
      back=Buffer.concat([back,chunk]);
      while(back.length>=5){
        const size=back.readInt32BE(1)+1;if(size<5||size>1024*1024){close();return}if(back.length<size)break;
        const frame=back.subarray(0,size);back=back.subarray(size);
        if(hold){
          withheld.push(frame);
          if(frame[0]===90){
            const current=hold;hold=0;
            if(current===1){close();withheld=[];lost.resolve(true)}
            else{held.resolve(true);const reply=Buffer.concat(withheld);withheld=[];release.promise.then(()=>{if(!down.destroyed)down.write(reply)})}
          }
        }else down.write(frame);
      }
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {port:server.address().port,lost,held,release,get applies(){return applies},async close(){
    release.resolve();for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));
  }};
}

export async function runSetupCliNativeChecks({input,db,recoveryCluster,recoveryExpected,account,metadata,provision,snapshot,record}){
  assert.match(input.run,/^[a-f0-9]{12}$/);
  const database='roomqc_cli_'+input.run,reader='cli_reader_'+input.run,writer='cli_writer_'+input.run,
    password=randomBytes(32).toString('hex'),credentialId=randomUUID();
  const children=new Set(),checks=[],barriers=[],kills=[],processTimings=[];
  let directory,maintenance,proxy,root,created=false,baselineRoles,result,phase='prepare',holder,holderOpen=false;
  const check=(label,condition=true)=>{assert.ok(condition,'NATIVE_CLI_'+label);record('native-cli-'+label);checks.push({label,passed:true})};
  const barrier=label=>{barriers.push({label,observed:true});check(label)};
  const child=(script,args)=>{
    const startedAt=performance.now();
    const processChild=spawn(process.execPath,[join('/repository/scripts',script),...args],{
      cwd:'/repository',env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe']});
    let output='';const collect=bytes=>{output+=bytes.toString();if(output.length>65536)processChild.kill('SIGKILL')};
    processChild.stdout.on('data',collect);processChild.stderr.on('data',collect);
    const handle={process:processChild,exit:null};children.add(handle);
    processChild.on('error',()=>{output+='OWNED_CHILD_START_FAILED'});
    handle.done=new Promise(resolve=>processChild.once('close',(code,signal)=>{
      processTimings.push({script,durationMs:Math.round(performance.now()-startedAt),exitCode:code,signal});
      handle.exit={code,signal,output};children.delete(handle);resolve(handle.exit);
    }));return handle;
  };
  const wait=handle=>until(()=>handle.exit,'cli-process');
  try{
    root=await mkdtemp('/tmp/roomqc-cli-'+input.run+'-');assert.equal((await stat(root)).mode&0o777,0o700);
    const text=async(name,value)=>{const file=join(root,name);await writeFile(file,value,{flag:'wx',mode:0o600});return file};
    const json=(name,value)=>text(name,JSON.stringify(value,null,2)+'\n');
    maintenance=new pg.Pool({host:'db',database:'postgres',user:'supabase_admin',password:input.databasePassword,max:1,statement_timeout:12000});
    baselineRoles=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname);
    await maintenance.query('CREATE DATABASE '+database);created=true;
    directory=new pg.Pool({host:'db',database,user:'supabase_admin',password:input.databasePassword,max:2,statement_timeout:12000});
    phase='directory-migrations';const migration=await migrateDirectory(directory);
    const cluster={...recoveryCluster,hostId:recoveryCluster.id,publishableKey:input.publishableKey,vapidPublicKey:'owned-cli-fixture',maxWorkspaces:99};
    phase='directory-registry';
    await importInitialRegistry(directory,[cluster]);
    await directory.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES($1,$1,'local')",[cluster.id]);
    await directory.query('UPDATE roomqc_control.clusters SET host_id=id,inventory_ref=id');
    const context=fixtureReleaseContext(cluster,recoveryExpected);
    await seedFixtureReleaseAuthority(directory,context);
    await directory.query(`CREATE ROLE ${reader} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_backfill_reader`);
    await directory.query(`CREATE ROLE ${writer} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_backfill_runtime`);
    const binding=recoveryBinding(cluster,recoveryExpected),now=Math.floor(Date.now()/1000);
    const claims={role:'roomqc_setup_recovery',iss:'roomqc-setup-recovery/v1',aud:'authenticated',jti:credentialId,
      cluster_id:cluster.id,binding_sha256:binding.bindingHash,iat:now,exp:now+3500};
    const jwt=[{alg:'HS256',typ:'JWT'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
    const token=jwt+'.'+createHmac('sha256',input.jwtSecret).update(jwt).digest('base64url');
    await db.query(`INSERT INTO private.setup_recovery_credentials(id,cluster_id,binding_sha256,not_before,expires_at)
      VALUES($1,$2,$3,clock_timestamp()-interval '1 second',clock_timestamp()+interval '3500 seconds')`,[credentialId,cluster.id,binding.bindingHash]);
    const gateway=new SetupRecoveryGateway({allowLocal:true,inventory:new Map([[cluster.id,cluster]])},cluster,{
      expected:recoveryExpected,loadCredential:async()=>({publishableKey:input.publishableKey,token})});
    const seed=async(label,kind)=>{
      const owner=await account('cli-'+label),p=metadata(owner);let remote;
      if(['committed','active','conflict'].includes(kind)){remote=await provision(p);assert.equal(remote.data.state,'committed')}
      else if(kind==='closed')remote={data:await gateway.close({id:p.p_workspace_id,owner_id:owner.id,cluster_id:cluster.id,
        api_url:cluster.url,routing_version:1},{id:p.p_dispatch_id,workspace_id:p.p_workspace_id,owner_id:owner.id,
        cluster_id:cluster.id,routing_version:1,payload_sha256:p.p_payload_sha256})};
      const ownerId=kind==='conflict'?(await account('cli-other')).id:owner.id;
      const terminal=['committed','active','conflict'].includes(kind)?'committed':kind==='closed'?'closed':null;
      const tenant=terminal==='committed'?remote.data.tenant_id:null,hotel=terminal==='committed'?remote.data.hotel_id:null;
      await directory.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,owner_id,status,tenant_id,hotel_id)
        VALUES($1,$2,'Private native CLI hotel',$3,$4,$5,$6,$7,$8)`,[p.p_workspace_id,'cli-'+label,createHash('sha256').update(owner.email).digest('hex'),
        cluster.id,ownerId,kind==='active'?'active':'provisioning',kind==='active'?tenant:null,kind==='active'?hotel:null]);
      await directory.query(`INSERT INTO roomqc_control.setup_dispatches(id,workspace_id,cluster_id,owner_id,routing_version,payload_sha256,terminal_state,tenant_id,hotel_id,settled_at)
        VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,CASE WHEN $6::text IS NULL THEN NULL ELSE clock_timestamp() END)`,
        [p.p_dispatch_id,p.p_workspace_id,cluster.id,ownerId,p.p_payload_sha256,terminal,tenant,hotel]);
      await directory.query(`INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,expected_routing_version,dispatch_id,state)
        VALUES($1,$2,1,$3,$4)`,[randomUUID(),p.p_workspace_id,p.p_dispatch_id,kind==='active'?'succeeded':'queued']);
      return {id:p.p_workspace_id,kind,p,remote};
    };
    phase='fixtures';const closed=await seed('closed','closed'),committed=await seed('committed','committed'),pending=await seed('pending','pending');
    const active=await seed('active','active'),conflict=await seed('conflict','conflict');
    const itemsOwned=[closed,committed,pending,active,conflict];
    const dirSnapshot=async()=>Object.fromEntries(await Promise.all(['workspaces','provisioning_jobs','setup_dispatches','setup_backfill_commands','attempts']
      .map(async t=>[t,(await directory.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS value FROM roomqc_control."+t+' t')).rows[0].value])));
    const remoteJournal=async()=>(await db.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY dispatch_id),'[]'::jsonb) AS value FROM private.workspace_setup_dispatches t")).rows[0].value;
    const commands=async()=>Number((await directory.query('SELECT count(*) AS n FROM roomqc_control.setup_backfill_commands')).rows[0].n);
    const identity=(await directory.query(`SELECT s.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid",current_database() AS "databaseName"
      FROM pg_catalog.pg_control_system() s JOIN pg_catalog.pg_database d ON d.datname=current_database()`)).rows[0];
    const releaseTrust=await json('release-trust.json',fixtureReleaseTrustRaw),credentialFile=await json('credential.json',{
      version:1,clusterId:cluster.id,bindingSha256:binding.bindingHash,publishableKey:input.publishableKey,token});
    const budget=JSON.parse(await readFile('/repository/deploy/control-resource-budget.example.json','utf8'));
    for(const id of ['setup-backfill-reader','setup-backfill-writer'])budget.databases[0].consumers.push({id,replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
    const resourceBudgetFile=await json('budget.json',budget);proxy=await wireProxy();
    const dsn=role=>{const u=new URL('postgresql://127.0.0.1:'+proxy.port+'/'+database+'?sslmode=disable');u.username=role;u.password=password;return u.href};
    const readerDsn=await text('reader-dsn',dsn(reader)),writerDsn=await text('writer-dsn',dsn(writer));
    const base={schemaVersion:1,environment:'local',directory:{dsnFile:readerDsn,expected:{...identity,role:reader}},releaseTrustFile:releaseTrust,
      resourceBudgetFile,targets:[{cluster:{id:cluster.id,url:cluster.url,internalUrl:cluster.internalUrl,
        inventoryRef:cluster.id,credentialRef:cluster.id,hostId:cluster.id,approvedAddresses:cluster.approvedAddresses},
        approval:fixtureReleaseApproval(context),credentialFile}]};
    const readerConfig=await json('reader.json',base),reportFile=join(root,'report.json');
    const before=await dirSnapshot(),businessBefore=await snapshot(),journalBefore=await remoteJournal();
    phase='reader';const scan=await wait(child('control-setup-backfill.mjs',['--config',readerConfig,'--output',reportFile,'--allow-local']));
    assert.equal(scan.code,0,'ACTUAL_READER_CLI');
    const reportText=await readFile(reportFile,'utf8'),report=JSON.parse(reportText);
    check('actual-reader-cli-loads-private-config-native-role-and-five-receipt-classifications',report.pageCount===5
      &&['closed','committed_pending','dispatch_pending','active_valid','conflict'].every(g=>report.counts[g]===1));
    assert.deepEqual(await dirSnapshot(),before);assert.deepEqual(await snapshot(),businessBefore);assert.deepEqual(await remoteJournal(),journalBefore);
    check('dry-run-keeps-directory-business-and-remote-journal-unchanged');
    check('report-binds-complete-readonly-source-snapshot',report.source.backendSha256===input.cliSourceSha256&&report.source.backendFiles===input.cliSourceFiles);
    const target={...identity,readerRole:reader,writerRole:writer},pair=generateKeyPairSync('ed25519');
    const batchTrustFile=await json('batch-trust.json',{version:1,keys:[{keyId:'owned-cli-batch',publicKey:pair.publicKey.export({format:'jwk'}),environment:'local',target}]});
    const writerConfig=await json('writer.json',{...base,directory:{dsnFile:writerDsn,expected:{...identity,role:writer}},batchTrustFile});
    const loaded=await loadSetupBackfillApplyConfiguration(writerConfig,{allowLocal:true});
    check('actual-writer-config-is-one-pinned-session-with-explicit-settings',loaded.connection.max===1&&loaded.connection.options.includes('default_transaction_read_only=off'));
    const items=itemsOwned.map(w=>{const row=report.items.find(i=>i.workspaceId===w.id);return Object.fromEntries(['workspaceId','clusterId','routingVersion','snapshotSha256','group'].map(k=>[k,row[k]]))});
    const payload={batchId:randomUUID(),environment:'local',notBefore:Date.now()-1000,expiresAt:Date.now()+3600000,reviewerRef:'owned-fixture-review',changeRef:'owned-fixture-change',
      source:report.source,target,bindings:loaded.targets.map(t=>t.identity),reportSha256:setupBackfillFileSha256(reportText),scopeSha256:report.scopeSha256,
      resourceBudgetSha256:report.resourceBudgetSha256,items};
    const unsigned={version:1,algorithm:'Ed25519',keyId:'owned-cli-batch',payload};
    const manifestFile=await json('batch.json',{...unsigned,signature:sign(null,setupBackfillBatchSigningBytes(unsigned),pair.privateKey).toString('base64url')});
    const execute=name=>child('control-setup-backfill-apply.mjs',['--config',writerConfig,'--report',reportFile,'--manifest',manifestFile,'--output',join(root,name),'--allow-local']);
    await text('existing.jsonl','preserved\n');const existing=await wait(execute('existing.jsonl'));
    assert.equal(existing.code,1);assert.match(existing.output,/SETUP_BACKFILL_OUTPUT_EXISTS/);assert.equal(await commands(),0);
    assert.equal(await readFile(join(root,'existing.jsonl'),'utf8'),'preserved\n');check('exclusive-output-rejection-has-zero-command-effects');
    await writeFile(reportFile,reportText+' ');const forged=await wait(execute('forged.jsonl'));assert.equal(forged.code,1);
    assert.match(forged.output,/SETUP_BACKFILL_BATCH_INVALID/);assert.equal(await commands(),0);await writeFile(reportFile,reportText);
    check('forged-report-rejected-before-any-command');
    phase='lost-response';const first=execute('lost.jsonl');await until(()=>proxy.lost.observed,'post-commit-wire-loss');
    const lost=await wait(first);assert.equal(lost.code,1);assert.equal(await commands(),1);
    assert.equal((await readFile(join(root,'lost.jsonl'),'utf8')).includes('"type":"result"'),false);
    barrier('actual-post-commit-readyforquery-response-lost-before-cli-result');
    phase='kill';const second=execute('interrupted.jsonl');await until(()=>proxy.held.observed,'second-commit-held');
    assert.equal(await commands(),2);barrier('second-native-command-committed-before-third-receipt');
    holder=await db.connect();await holder.query('BEGIN');holderOpen=true;
    const holderPid=Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await holder.query('LOCK TABLE private.workspace_provisioning IN ACCESS EXCLUSIVE MODE');proxy.release.resolve();
    await until(async()=>(await db.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname='postgres'
      AND usename='authenticator' AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))) AS waiting`,[holderPid])).rows[0].waiting,'native-receipt-lock',12000);
    barrier('real-postgrest-receipt-blocked-on-owned-business-table-lock');
    assert.equal(second.process.kill('SIGKILL'),true);const killed=await wait(second);assert.equal(killed.signal,'SIGKILL');
    kills.push({label:'writer-during-real-receipt',signal:killed.signal});await holder.query('ROLLBACK');holderOpen=false;holder.release();holder=null;
    assert.equal(await commands(),2);check('sigkill-before-third-command-has-no-partial-effect');
    phase='resume';const resumed=await wait(execute('resumed.jsonl'));assert.equal(resumed.code,0);assert.equal(await commands(),5);
    const lines=(await readFile(join(root,'resumed.jsonl'),'utf8')).trim().split('\n').map(JSON.parse),outcomes=lines.filter(r=>r.type==='result');
    assert.equal(lines.at(-1).type,'complete');assert.equal(outcomes.length,5);
    for(const [i,outcome]of ['waiting_owner','activated','reused_job','no_op','conflict'].entries())assert.equal(outcomes[i].outcome,outcome);
    check('same-signed-batch-new-output-resumes-real-closed-committed-pending-active-conflict');
    const persisted=(await directory.query('SELECT * FROM roomqc_control.setup_backfill_commands ORDER BY command_id')).rows;
    const replay=await wait(execute('replay.jsonl'));assert.equal(replay.code,0);
    assert.deepEqual((await directory.query('SELECT * FROM roomqc_control.setup_backfill_commands ORDER BY command_id')).rows,persisted);
    assert.equal(Number((await directory.query("SELECT count(*) AS n FROM roomqc_control.attempts WHERE outcome LIKE 'setup_backfill_%'")).rows[0].n),5);
    check('replay-keeps-five-immutable-commands-and-five-audits');
    assert.deepEqual(await snapshot(),businessBefore);assert.deepEqual(await remoteJournal(),journalBefore);
    check('apply-never-closes-or-provisions-remote-and-preserves-tenant-hotel-trial-outbox');
    const pendingState=(await directory.query('SELECT state,attempts FROM roomqc_control.provisioning_jobs WHERE workspace_id=$1',[pending.id])).rows[0];
    check('missing-receipt-stays-queued-with-original-budget',pendingState.state==='queued'&&pendingState.attempts===0);
    for(const name of ['report.json','resumed.jsonl','replay.jsonl'])assert.equal((await stat(join(root,name))).mode&0o777,0o600);
    check('actual-linux-private-output-modes');
    for(const output of [scan,existing,forged,lost,resumed,replay].map(x=>x.output).concat([JSON.stringify(lines),reportText]))
      for(const secret of [password,token,input.serviceKey,input.databasePassword,'Private native CLI hotel'])assert.equal(output.includes(secret),false);
    check('public-cli-output-and-reports-exclude-secrets-and-owner-input');
    result={verified:true,checks,barriers,kills,processTimings,directoryMigrations:migration.applied.length,source:report.source,actualCliProcesses:true,
      actualReceiptTransport:true,readOnlySourceSnapshot:true,dataset:'Five privileged directory fixtures; real GoTrue confirmed users and native provision/close proofs',
      limits:['Disposable directory and business databases share one host; no VPS, independent A/B or production backfill.',
        'Synthetic signed release approval and batch reviewer; no installer/rotation or public email signup proof.',
        'One post-commit wire loss and one writer SIGKILL; not all native CLI faults or product acceptance.']};
    return result;
  }catch(error){
    process.stderr.write(JSON.stringify({event:'native_setup_cli_failed',phase,checks,barriers,kills,processTimings})+'\n');throw error;
  }finally{
    proxy?.release.resolve();
    for(const handle of [...children]){handle.process.kill('SIGKILL');await handle.done}
    if(holder){if(holderOpen)await holder.query('ROLLBACK');holder.release()}
    await proxy?.close();await directory?.end();
    try{
      await db.query('DELETE FROM private.setup_recovery_credentials WHERE id=$1',[credentialId]);
      if(created)await maintenance.query('DROP DATABASE '+database);
      if(baselineRoles){
        const after=(await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname),added=after.filter(n=>!baselineRoles.includes(n));
        const allowed=new Set(['roomqc_control_api','roomqc_control_worker','roomqc_control_metrics',
          'roomqc_control_probe_runtime','roomqc_control_probe_installer','roomqc_control_release_installer','roomqc_control_release_writer','roomqc_control_alerts',
          'roomqc_control_setup_runtime','roomqc_control_setup_writer','roomqc_control_backfill_reader','roomqc_control_backfill_runtime','roomqc_control_backfill_writer',
          'roomqc_control_setup_credential_observer','roomqc_control_deployer','roomqc_control_host_observer',reader,writer]);
        assert.ok(added.every(name=>allowed.has(name)),'EXACT_OWNED_CLI_ROLE_CLEANUP');for(const name of added)await maintenance.query('DROP ROLE '+name);
        assert.deepEqual((await maintenance.query('SELECT rolname FROM pg_roles ORDER BY rolname')).rows.map(r=>r.rolname),baselineRoles);
        if(result)result.directoryRoleCleanup={verified:true,removed:added.length,baselineSha256:createHash('sha256').update(JSON.stringify(baselineRoles)).digest('hex')};
      }
    }finally{
      await maintenance?.end();if(root){assert.ok(root.startsWith('/tmp/roomqc-cli-'+input.run+'-'));await rm(root,{recursive:true,force:true});if(result)result.privateFilesRemoved=true}
    }
  }
}
