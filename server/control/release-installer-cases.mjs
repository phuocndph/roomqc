import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm,realpath,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {migrateDirectory,migrationManifest,importInitialRegistry} from './migrate.mjs';
import {seedOperationalCluster} from './test-fixtures.mjs';
import {syntheticRelease} from './probe-test-fixtures.mjs';
import {fixtureReleaseTrust,fixtureReleaseTrustRaw,fixtureReleaseMaximumValidityMs,fixtureReleaseContext,fixtureReleaseApproval} from './release-test-fixtures.mjs';
import {createPgCommitResponseRelay} from './testing/pg-commit-response-relay.mjs';

const command=(operation,more={})=>({version:1,operation,expectedVersion:0,key:randomUUID(),requestId:randomUUID(),reason:'Owned native installer fixture',...more});
export function registerReleaseInstallerCases({dbtest,database,password,cluster}){
  let serial=0;
  async function fixture(label,{through}={}){
    const {pool,url}=await database(label),root=await mkdtemp(join(tmpdir(),'roomqc-installer-db-'));
    if(through){
      const location=join(root,'migrations');await (await import('node:fs/promises')).mkdir(location);
      for(const m of (await migrationManifest()).slice(0,through))await writeFile(join(location,m.version),m.sql);
      await migrateDirectory(pool,{location:pathToFileURL(location+'/')});
    }else await migrateDirectory(pool);
    await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool,cluster.id,{approvalSeed:false,probeSeed:false});
    const name='release_cli_fixture_'+(++serial);
    await pool.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_release_installer;
      CREATE ROLE ${name}_api LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api;
      CREATE ROLE ${name}_mixed LOGIN PASSWORD '${password}' IN ROLE roomqc_control_release_installer,roomqc_control_api`);
    const installerUrl=new URL(url);installerUrl.username=name;
    const configFile=join(root,'config.json'),databaseUrlFile=join(root,'database-url'),trustFile=join(root,'trust.json'),inventoryFile=join(root,'inventory.json');
    const config={version:1,databaseUrlFile,expectedDatabase:new URL(url).pathname.slice(1),trustFile,inventoryFile,maximumValidityMs:fixtureReleaseMaximumValidityMs};
    const target={id:cluster.id,hostId:cluster.id,inventoryRef:cluster.id,credentialRef:cluster.id,environment:'local',
      url:cluster.url,internalUrl:null,approvedAddresses:[]};
    const save=async(file,value)=>writeFile(file,typeof value==='string'?value:JSON.stringify(value),{mode:0o600});
    await save(configFile,config);await save(databaseUrlFile,installerUrl.href);await save(trustFile,fixtureReleaseTrustRaw);
    await save(inventoryFile,{version:1,targets:[{cluster:target,expected:syntheticRelease}]});
    let fileSerial=0;const children=[];
    const start=async input=>{
      const file=join(root,'command-'+(++fileSerial)+'.json');await save(file,input);
      const child=spawn(process.execPath,['server/control/release-installer-cli.mjs','--config-file',configFile,'--command-file',file],
        {stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'test',ROOMQC_RELEASE_INSTALLER_ALLOW_LOCAL:'true'}});
      let stdout='',stderr='';const timer=setTimeout(()=>child.kill(),15000);
      child.stdout.on('data',part=>{stdout+=part;if(stdout.length>65536)child.kill()});
      child.stderr.on('data',part=>{stderr+=part;if(stderr.length>65536)child.kill()});
      const result=new Promise(resolve=>{
        child.once('error',()=>{clearTimeout(timer);resolve({exitCode:null,spawnFailed:true})});
        child.once('close',(exitCode,signal)=>{
          clearTimeout(timer);assert.ok(!stdout.includes(password)&&!stderr.includes(password),'Native output leaked a disposable password');
          assert.ok(!/postgres(?:ql)?:\/\//i.test(stdout+stderr),'Native output leaked a DSN');
          const parse=value=>{try{return JSON.parse(value)}catch{return null}};
          resolve({exitCode,signal,result:parse(stdout),error:parse(stderr)});
        });
      });
      children.push({child,result});return {child,result};
    };
    const run=async input=>(await start(input)).result;
    const context=fixtureReleaseContext(cluster,syntheticRelease);
    const install=async({epoch=1,expectedVersion=0,keyId='test-key',overrides={},signedContext=context,...rest}={})=>{
      const envelope=fixtureReleaseApproval(signedContext,{epoch,...overrides},keyId),approvalFile=join(root,'approval-'+(++fileSerial)+'.json');
      await save(approvalFile,envelope);return {input:command('install',{clusterId:cluster.id,approvalFile,expectedVersion,...rest}),envelope};
    };
    const snapshot=async(client=pool)=>{
      const out={};for(const [table,order]of [['release_approvals','approval_id'],['release_authority','cluster_id'],['release_commands','id'],
        ['release_key_revocations','key_fingerprint'],['cluster_events','id'],['cluster_policies','cluster_id'],['workspaces','id']]){
        out[table]=(await client.query(`SELECT * FROM roomqc_control.${table} ORDER BY ${order}`)).rows;
      }return out;
    };
    return {pool,url,root,config,configFile,databaseUrlFile,installerUrl:installerUrl.href,trustFile,inventoryFile,target,context,save,start,run,install,snapshot,
      close:async()=>{
        for(const item of children)if(item.child.exitCode===null){item.child.kill();await item.result}
        assert.equal(dirname(await realpath(root)),await realpath(tmpdir()));assert.ok(basename(root).startsWith('roomqc-installer-db-'));
        await rm(root,{recursive:true});
      }};
  }
  dbtest('release installer DB: native private-file install/check/receipt and effect-free replay use the separate role',async()=>{
    const f=await fixture('installer_native');
    try{
      const before=await f.run({version:1,operation:'check'});assert.equal(before.exitCode,2);assert.equal(before.result.installerReady,true);
      assert.equal(before.result.targets[0].reasonCode,'RELEASE_APPROVAL_MISSING');
      const {input,envelope}=await f.install(),installed=await f.run(input);assert.equal(installed.exitCode,0);
      assert.equal(installed.result.receipt.approvalId,envelope.payload.approvalId);assert.equal(installed.result.currentAuthorityChecked,false);
      const snapshot=await f.snapshot();assert.equal(snapshot.release_commands.length,1);
      assert.equal((await f.run({version:1,operation:'check'})).exitCode,0);
      const replay=await f.run(input);assert.equal(replay.exitCode,0);assert.equal(replay.result.receipt.replayed,true);
      const receipt=await f.run({version:1,operation:'receipt',key:input.key});assert.equal(receipt.exitCode,0);
      assert.equal(receipt.result.receipt.commandId,installed.result.receipt.commandId);assert.deepEqual(await f.snapshot(),snapshot);
    }finally{await f.close()}
  });
  dbtest('release installer DB: native CLI rejects runtime, mixed, elevated, wrong database, tamper and wrong primary binding without effects',async()=>{
    const f=await fixture('installer_denials');
    try{
      const {input,envelope}=await f.install(),before=await f.snapshot();
      const original=new URL(f.installerUrl);
      for(const login of [original.username+'_api',original.username+'_mixed',new URL(f.url).username]){
        const url=new URL(f.installerUrl);url.username=login;await f.save(f.databaseUrlFile,url.href);
        assert.equal((await f.run(input)).exitCode,1);assert.deepEqual(await f.snapshot(),before);
      }
      await f.save(f.databaseUrlFile,f.installerUrl);
      await f.save(f.configFile,{...f.config,expectedDatabase:'different_directory'});
      assert.equal((await f.run(input)).error.code,'RELEASE_INSTALLER_DATABASE_MISMATCH');await f.save(f.configFile,f.config);
      await f.save(input.approvalFile,{...envelope,payload:{...envelope.payload,approvalId:randomUUID()}});
      assert.equal((await f.run(input)).error.code,'RELEASE_APPROVAL_INVALID');
      const wrong={...f.target,url:'http://127.0.0.1:54322'};
      await f.save(f.inventoryFile,{version:1,targets:[{cluster:wrong,expected:syntheticRelease}]});
      const validWrong=await f.install({signedContext:fixtureReleaseContext(wrong,syntheticRelease)});
      assert.equal((await f.run(validWrong.input)).error.code,'RELEASE_INSTALLER_TARGET_MISMATCH');
      assert.deepEqual(await f.snapshot(),before);
    }finally{await f.close()}
  });
  dbtest('release installer DB: migration pending, checksum drift and a live migrator are fail-closed; upgrade preserves readiness',async()=>{
    const f=await fixture('installer_schema',{through:11});let blocker;
    try{
      const {input}=await f.install(),before=await f.snapshot();
      assert.equal((await f.run(input)).error.code,'RELEASE_INSTALLER_SCHEMA_PENDING');
      assert.deepEqual((await migrateDirectory(f.pool)).applied,(await migrationManifest()).slice(11).map(item=>item.version));
      const manifest=await migrationManifest(),last=manifest.at(-1);
      await f.pool.query('UPDATE roomqc_control.schema_migrations SET checksum=$1 WHERE version=$2',['0'.repeat(64),last.version]);
      assert.equal((await f.run(input)).error.code,'RELEASE_INSTALLER_SCHEMA_INVALID');
      await f.pool.query('UPDATE roomqc_control.schema_migrations SET checksum=$1 WHERE version=$2',[last.checksum,last.version]);
      blocker=await f.pool.connect();await blocker.query('SELECT pg_advisory_lock(727000)');
      assert.equal((await f.run(input)).error.code,'RELEASE_INSTALLER_MIGRATION_BUSY');
      await blocker.query('SELECT pg_advisory_unlock(727000)');blocker.release();blocker=null;
      assert.deepEqual(await f.snapshot(),before);assert.equal((await f.run(input)).exitCode,0);
    }finally{if(blocker){await blocker.query('SELECT pg_advisory_unlock(727000)');blocker.release()}await f.close()}
  });
  dbtest('release installer DB: native key withdrawal, fresh-key recovery and receipt reads survive missing trust/inventory files',async()=>{
    const f=await fixture('installer_recovery');
    try{
      const {input,envelope}=await f.install();assert.equal((await f.run(input)).exitCode,0);
      const proof=fixtureReleaseTrust.verify(envelope,f.context),withdraw=command('withdraw_key',{keyFingerprint:proof.keyFingerprint});
      assert.equal((await f.run(withdraw)).result.receipt.affectedClusterCount,1);
      assert.equal((await f.run({version:1,operation:'check'})).exitCode,2);
      const old=await f.install({epoch:3,expectedVersion:2});assert.equal((await f.run(old.input)).error.code,'RELEASE_KEY_WITHDRAWN');
      const fresh=await f.install({epoch:3,expectedVersion:2,keyId:'test-rotated-key'});assert.equal((await f.run(fresh.input)).exitCode,0);
      assert.equal((await f.run({version:1,operation:'check'})).exitCode,0);
      await unlink(f.trustFile);await unlink(f.inventoryFile);
      const historical=await f.run({version:1,operation:'receipt',key:input.key});assert.equal(historical.exitCode,0);
      assert.equal(historical.result.currentAuthorityChecked,false);assert.equal(historical.result.receipt.state,'active');
      assert.equal((await f.run(command('withdraw',{clusterId:cluster.id,approvalId:fresh.envelope.payload.approvalId,expectedVersion:3}))).exitCode,0);
      assert.equal((await f.run({version:1,operation:'receipt',key:randomUUID()})).error.code,'RELEASE_APPROVAL_RESULT_UNKNOWN');
    }finally{await f.close()}
  });
  dbtest('release installer DB: real PostgreSQL COMMIT acknowledgement loss yields unknown outcome and same-key receipt/replay without duplication',async()=>{
    const f=await fixture('installer_commit_loss');let relay;
    try{
      const {input}=await f.install();relay=await createPgCommitResponseRelay(Number(new URL(f.installerUrl).port));
      const proxied=new URL(f.installerUrl);proxied.hostname='127.0.0.1';proxied.port=String(relay.port);await f.save(f.databaseUrlFile,proxied.href);
      const running=await f.start(input);
      await Promise.race([relay.committed,running.result.then(()=>assert.fail('CLI returned before the held commit acknowledgement')),
        new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('OWNED_PG_COMMIT_NOT_OBSERVED')),8000);timer.unref()})]);
      const committed=await f.snapshot();assert.equal(committed.release_commands.length,1);assert.equal(committed.release_authority[0].state,'active');
      relay.dropHeld();const lost=await running.result;assert.equal(lost.exitCode,1);
      assert.equal(lost.error.code,'RELEASE_INSTALLER_OUTCOME_UNKNOWN');assert.equal(lost.error.recovery.key,input.key);
      await f.save(f.databaseUrlFile,f.installerUrl);
      const receipt=await f.run({version:1,operation:'receipt',key:input.key});assert.equal(receipt.exitCode,0);
      assert.equal(receipt.result.receipt.commandId,committed.release_commands[0].id);
      const replay=await f.run(input);assert.equal(replay.exitCode,0);assert.equal(replay.result.receipt.replayed,true);
      assert.deepEqual(await f.snapshot(),committed);
    }finally{await relay?.close();await f.close()}
  });
  dbtest('release installer DB: primary target changes while native installer waits for the effect lock deny before install and allow safe retry',async()=>{
    const f=await fixture('installer_target_race');let blocker;
    try{
      const {input}=await f.install();let changed;
      blocker=await f.pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(727001)');
      const running=await f.start(input);let overlapped=false;
      try{
        for(let i=0;i<150;i++){
          const row=(await f.pool.query(`SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
            WHERE a.application_name='roomqc-release-installer' AND l.locktype='advisory' AND l.objid=727001 AND NOT l.granted) AS waiting`)).rows[0];
          if(row.waiting){overlapped=true;break}await new Promise(resolve=>setTimeout(resolve,15));
        }
        assert.equal(overlapped,true);await blocker.query("UPDATE roomqc_control.clusters SET api_url='http://127.0.0.1:54322' WHERE id=$1",[cluster.id]);
        changed=await f.snapshot(blocker);
        await blocker.query('COMMIT');
      }finally{await blocker.query('ROLLBACK');blocker.release();blocker=null}
      assert.equal((await running.result).error.code,'RELEASE_INSTALLER_TARGET_MISMATCH');assert.deepEqual(await f.snapshot(),changed);
      await f.pool.query('UPDATE roomqc_control.clusters SET api_url=$2 WHERE id=$1',[cluster.id,cluster.url]);
      assert.equal((await f.run(input)).exitCode,0);
    }finally{if(blocker){await blocker.query('ROLLBACK');blocker.release()}await f.close()}
  });
  dbtest('release installer DB: readiness detects removed trust and expired durable approval while historical receipt stays readable',async()=>{
    const f=await fixture('installer_readiness');
    try{
      const {input}=await f.install();assert.equal((await f.run(input)).exitCode,0);
      await f.save(f.trustFile,{version:1,keys:fixtureReleaseTrustRaw.keys.filter(k=>k.keyId==='test-rotated-key')});
      const untrusted=await f.run({version:1,operation:'check'});assert.equal(untrusted.exitCode,2);assert.equal(untrusted.result.ready,false);
      await f.save(f.trustFile,fixtureReleaseTrustRaw);assert.equal((await f.run({version:1,operation:'check'})).exitCode,0);
      const expiring=await f.install({epoch:2,expectedVersion:1,overrides:{notBefore:Date.now()-1000,expiresAt:Date.now()+4000}});
      assert.equal((await f.run(expiring.input)).exitCode,0);await f.pool.query('SELECT pg_sleep(4.2)');
      assert.equal((await f.run({version:1,operation:'check'})).exitCode,2);
      assert.equal((await f.run({version:1,operation:'receipt',key:expiring.input.key})).exitCode,0);
    }finally{await f.close()}
  });
}
