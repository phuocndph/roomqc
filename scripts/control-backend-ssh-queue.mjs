// Executed only inside the exact-owned SSH acceptance client. The administrative
// connection creates a disposable directory; the product executor uses a
// separate, single-connection LOGIN and the API retains its normal grants.
import pg from '/app/server/control/node_modules/pg/lib/index.js';
import {randomUUID as queueUuid} from 'node:crypto';
import {writeFile as queueWriteFile,mkdir as queueMkdir} from 'node:fs/promises';
import {execFile as queueExecFile} from 'node:child_process';
import {promisify as queuePromisify} from 'node:util';
import {migrateDirectory,importInitialRegistry} from '/app/server/control/migrate.mjs';
import {fixtureConfig as queueConfig} from '/app/server/control/test-fixtures.mjs';
import {fixtureSupportGateway as queueGateway} from '/app/server/control/support-authority-fixtures.mjs';
import {startControl as queueStartControl} from '/app/server/control/server.mjs';
import {prepareExecutorRelease} from '/app/scripts/roomqc-vps-executor.mjs';

async function executeBackendQueueFixture({input,options}){
  assert.match(input.queue.run,/^[a-f0-9]{12}$/);
  const adminUrl=new URL('postgresql://postgres@127.0.0.1:5432/postgres');adminUrl.password=input.queue.password;
  const admin=new pg.Pool({connectionString:adminUrl.href,max:1});
  let directory,runtime;
  const childEnv={...process.env,NODE_ENV:'test',ROOMQC_HOST_INVENTORY_ALLOW_LOCAL:'true',
    ROOMQC_DEPLOY_DATABASE_URL_FILE:'/tmp/roomqc/executor.dsn'};
  const cli=async args=>{
    const result=await queuePromisify(queueExecFile)(process.execPath,['scripts/roomqc-vps-executor.mjs',...args],
      {cwd:'/app',env:childEnv,timeout:300000,maxBuffer:65536});
    const receipt=JSON.parse(result.stdout);assert.equal(receipt.ok,true);return receipt;
  };
  try{
    await admin.query('CREATE DATABASE roomqc_control');
    adminUrl.pathname='/roomqc_control';directory=new pg.Pool({connectionString:adminUrl.href,max:2});
    const migrated=await migrateDirectory(directory);
    const cluster={id:input.clusterId,url:input.inventory.inventory[0].url,
      publishableKey:'fixture-public',serviceKey:'fixture-private',vapidPublicKey:'fixture-vapid',maxWorkspaces:99};
    await importInitialRegistry(directory,[cluster]);
    await directory.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES($1,$1,'local')",[cluster.id]);
    await directory.query('UPDATE roomqc_control.clusters SET host_id=$1,inventory_ref=$1 WHERE id=$1',[cluster.id]);
    const api='api_'+input.queue.run,executor='executor_'+input.queue.run;
    // Random hex fixture passwords are read from a private input file, never
    // emitted in the public acceptance receipt or command arguments.
    assert.match(input.queue.password,/^[a-f0-9]{64}$/);
    await directory.query('CREATE ROLE '+api+" LOGIN PASSWORD '"+input.queue.password+"' IN ROLE roomqc_control_api");
    await directory.query('CREATE ROLE '+executor+" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1 PASSWORD '"+input.queue.password+"'");
    await directory.query('GRANT roomqc_control_deployer TO '+executor+' WITH INHERIT TRUE, SET FALSE, ADMIN FALSE');
    const apiUrl=new URL(adminUrl);apiUrl.username=api;const executorUrl=new URL(adminUrl);executorUrl.username=executor;
    await queueMkdir('/tmp/roomqc/specs',{mode:0o700});
    await queueWriteFile('/tmp/roomqc/executor.dsn',executorUrl.href+'\n',{mode:0o600,flag:'wx'});
    await queueWriteFile('/tmp/roomqc/inventory.json',JSON.stringify(input.inventory),{mode:0o600,flag:'wx'});
    await queueWriteFile('/tmp/roomqc/compose.json',JSON.stringify(input.model),{mode:0o600,flag:'wx'});
    options={...options,inventoryFile:'/tmp/roomqc/inventory.json',composeFile:'/tmp/roomqc/compose.json'};
    const startup=await cli(['check']);assert.equal(startup.readiness.connectionLimit,1);
    const prepared=await cli(['prepare','--spec-directory','/tmp/roomqc/specs','--inventory-file',options.inventoryFile,
      '--compose-file',options.composeFile,'--cluster-id',options.clusterId,'--release-id',options.releaseId,
      '--image',options.image,'--host',options.host,'--user',options.user,'--identity-file',options.identityFile,'--mode','execute']);
    const actor={id:queueUuid(),clusterId:cluster.id},config=queueConfig(apiUrl.href,[cluster]);
    runtime=await queueStartControl(config,{gateway:queueGateway({supportActor:async token=>{
      if(token!=='owned-queue-actor')throw Object.assign(new Error('LOGIN_REQUIRED'),{status:401,code:'LOGIN_REQUIRED'});return actor;
    }})});
    const base='http://127.0.0.1:'+runtime.server.address().port+'/api/control/admin';
    const headers={Authorization:'Bearer owned-queue-actor',Origin:config.publicOrigin,'Content-Type':'application/json','Idempotency-Key':queueUuid()};
    const body=JSON.stringify({operation:'queue_deployment',expectedVersion:1,reason:'Install the owned full backend through the product SSH executor',
      payload:{specId:prepared.spec.id,executionSha256:prepared.spec.executionSha256}});
    const submit=()=>fetch(base+'/clusters/'+cluster.id+'/commands',{method:'POST',headers,body});
    const accepted=await submit();assert.equal(accepted.status,200);const command=await accepted.json();
    const replay=await submit();assert.equal(replay.status,200);assert.equal((await replay.json()).commandId,command.commandId);
    assert.equal((await directory.query('SELECT count(*)::integer AS count FROM roomqc_control.deployment_jobs')).rows[0].count,1);
    const execution=await cli(['run','--spec-directory','/tmp/roomqc/specs','--once']);assert.ok(execution.runId);
    const read=async path=>{const response=await fetch(base+path,{headers});assert.equal(response.status,200);return response.json()};
    const jobs=await read('/deployment-jobs'),history=await read('/deployments');
    assert.equal(jobs.items.length,1);assert.equal(jobs.items[0].state,'succeeded',JSON.stringify(jobs));
    assert.equal(history.items.length,1);assert.equal(history.items[0].state,'deployed',JSON.stringify(history));
    assert.equal(history.items[0].id,execution.runId);assert.equal(history.items[0].lastGate.mode,'local_test');
    assert.equal((await directory.query('SELECT manual_closed FROM roomqc_control.cluster_policies')).rows[0].manual_closed,true);
    const gates=(await directory.query('SELECT phase_index FROM roomqc_control.deployment_gate_checks ORDER BY phase_index')).rows;
    assert.deepEqual(gates.map(row=>row.phase_index),[1,2,3,4,5]);
    await assert.rejects(()=>runtime.store.pool.query("UPDATE roomqc_control.deployment_jobs SET state='succeeded'"),{code:'42501'});
    const again=await queuePromisify(queueExecFile)(process.execPath,['scripts/roomqc-vps-executor.mjs','run','--spec-directory','/tmp/roomqc/specs','--once'],
      {cwd:'/app',env:childEnv,timeout:15000,maxBuffer:65536});assert.equal(again.stdout.trim(),'');
    const loaded=await prepareExecutorRelease(options,{probe:collectVpsPreflight,local:true});
    assert.equal(loaded.compose.sha256,prepared.spec.composeSha256);
    return {compose:loaded.compose,plan:loaded.plan,receipt:{http:true,packagedExecutor:true,actualSsh:true,
      directorySchemaVersion:migrated.version,executorConnectionLimit:startup.readiness.connectionLimit,
      commandReplaySameReceipt:true,jobCount:1,jobId:jobs.items[0].id,runId:execution.runId,jobState:jobs.items[0].state,
      runState:history.items[0].state,gateMode:history.items[0].lastGate.mode,phasesRecorded:gates.length,
      apiWriteDenied:true,secondExecutorRunHasNoWork:true,admissionClosed:true}};
  }finally{await runtime?.shutdown();await directory?.end();await admin.end()}
}
