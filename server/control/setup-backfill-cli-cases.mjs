import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createServer as httpServer} from 'node:http';
import {createServer as netServer,connect as netConnect} from 'node:net';
import {mkdtemp,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {seedOperationalCluster,fixtureConfig} from './test-fixtures.mjs';
import {ControlStore} from './store.mjs';
import {fixtureReleaseTrustRaw,fixtureReleaseContext,fixtureReleaseApproval} from './release-test-fixtures.mjs';
import {syntheticRelease} from './probe-test-fixtures.mjs';
import {recoveryBinding} from './setup-recovery.mjs';
import {setupBackfillBatchSigningBytes,setupBackfillFileSha256} from './setup-backfill-batch.mjs';
import {loadSetupBackfillApplyConfiguration} from './setup-backfill-apply-config.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const until=(promise,label)=>{
  let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),120000)})]).finally(()=>clearTimeout(timer));
};
function child(script,args){
  const processChild=spawn(process.execPath,[join(root,'scripts',script),...args],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';const collect=c=>{output+=c.toString();if(output.length>65536)processChild.kill('SIGKILL')};
  processChild.stdout.on('data',collect);processChild.stderr.on('data',collect);
  const done=new Promise((resolve,reject)=>{processChild.once('error',reject);processChild.once('close',(code,signal)=>resolve({code,signal,output}))});
  return {process:processChild,done};
}

/** An owned wire proxy withholds the first apply response through ReadyForQuery,
 * which is the server's post-commit boundary, then drops both connections. */
async function responseLossProxy(url){
  let armed=true,capture=false;const sockets=new Set(),lost=deferred();
  const server=netServer(down=>{
    const up=netConnect({host:url.hostname,port:Number(url.port)});sockets.add(up);sockets.add(down);
    let frontend=Buffer.alloc(0),backend=Buffer.alloc(0),startup=true,hold=false;
    const close=()=>{up.destroy();down.destroy();sockets.delete(up);sockets.delete(down)};
    up.on('error',close);down.on('error',close);up.on('close',close);down.on('close',close);
    down.on('data',chunk=>{
      frontend=Buffer.concat([frontend,chunk]);
      while(frontend.length>=5){
        const length=startup?frontend.readInt32BE(0):frontend.readInt32BE(1)+1;
        if(length<5||length>1024*1024){close();return}if(frontend.length<length)break;
        const frame=frontend.subarray(0,length);frontend=frontend.subarray(length);
        if(startup){startup=false;continue}
        let sql='';if(frame[0]===80){const zero=frame.indexOf(0,5);sql=frame.toString('utf8',zero+1,frame.indexOf(0,zero+1))}
        if(frame[0]===81)sql=frame.toString('utf8',5,frame.length-1);
        if(armed&&sql.startsWith('SELECT roomqc_control.apply_setup_backfill(')){hold=true;capture=true}
      }
      up.write(chunk);
    });
    up.on('data',chunk=>{
      backend=Buffer.concat([backend,chunk]);
      while(backend.length>=5){
        const length=backend.readInt32BE(1)+1;if(length<5||length>1024*1024){close();return}if(backend.length<length)break;
        const frame=backend.subarray(0,length);backend=backend.subarray(length);
        if(hold){if(frame[0]===90){armed=false;hold=false;close();lost.resolve()}}else down.write(frame);
      }
    });
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  return {port:server.address().port,lost:lost.promise,captured:()=>capture,async close(){for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r))}};
}

export function registerSetupBackfillCliCases({dbtest,database,config,cluster,pools,run,password}){
  dbtest('T12 setup backfill CLI: signed private files, post-commit response loss, SIGKILL and same-batch resume preserve one effect per row',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'roomqc-backfill-cli-')),children=[];let server,proxy;
    let blockThird=false,thirdId,remoteCloseCalls=0,remoteReads=0;const thirdRead=deferred();
    try{
      if(process.platform==='win32'){
        const account=(process.env.USERDOMAIN?process.env.USERDOMAIN+'\\':'')+process.env.USERNAME;
        execFileSync('icacls',[directory,'/inheritance:r','/grant:r',account+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{windowsHide:true,stdio:'ignore'});
      }else await chmod(directory,0o700);
      const json=async(name,value)=>{const path=join(directory,name);await writeFile(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});return path};
      const text=async(name,value)=>{const path=join(directory,name);await writeFile(path,value,{mode:0o600});return path};
      let token;
      server=httpServer(async(req,res)=>{
        let body='';for await(const part of req)body+=part;
        if(req.url!=='/rest/v1/rpc/receipt'){remoteCloseCalls++;res.writeHead(404).end();return}
        remoteReads++;assert.equal(req.headers.authorization,'Bearer '+token);assert.equal(req.headers['content-profile'],'roomqc_setup');
        const id=JSON.parse(body).p_workspace_id;
        if(blockThird&&id===thirdId){blockThird=false;thirdRead.resolve();return}
        res.writeHead(200,{'content-type':'application/json'}).end('null');
      });
      await new Promise(r=>server.listen(0,'127.0.0.1',r));
      const c={...cluster,url:'http://127.0.0.1:'+server.address().port};
      const {pool,url}=await database('setup_cli');await migrateDirectory(pool);await importInitialRegistry(pool,[c]);await seedOperationalCluster(pool);
      const reader='setup_cli_reader_'+run,writer='setup_cli_writer_'+run;
      await pool.query(`CREATE ROLE ${reader} LOGIN CONNECTION LIMIT 1 PASSWORD '${password}' IN ROLE roomqc_control_backfill_reader`);
      await pool.query(`CREATE ROLE ${writer} LOGIN CONNECTION LIMIT 1 PASSWORD '${password}' IN ROLE roomqc_control_backfill_runtime`);
      const api=new ControlStore({...fixtureConfig(url,[c]),setupDispatchEnabled:true});pools.push(api.pool);
      const workspaces=[];
      for(let i=0;i<3;i++){
        const user={id:randomUUID(),session_id:randomUUID(),email:'cli'+i+'@example.invalid',email_confirmed_at:new Date().toISOString()};
        const reserved=await api.reserve({slug:'cli-'+i,email:user.email,displayName:'Private CLI owner '+i},randomUUID());
        const begun=await api.setup.begin(reserved,user,{hotelName:'Private CLI hotel '+i,totalRooms:3},randomUUID());
        if(i<2)await pool.query("UPDATE roomqc_control.setup_dispatches SET terminal_state='closed',settled_at=clock_timestamp() WHERE id=$1",[begun.dispatch.id]);
        workspaces.push(begun.workspace);
      }
      thirdId=workspaces[2].id;
      const identity=(await pool.query(`SELECT s.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid",current_database() AS "databaseName"
        FROM pg_catalog.pg_control_system() s JOIN pg_catalog.pg_database d ON d.datname=current_database()`)).rows[0];
      const expected={...identity,role:reader},target={...identity,readerRole:reader,writerRole:writer};
      const publicTrust=await json('release-trust.json',fixtureReleaseTrustRaw),binding=recoveryBinding(c,syntheticRelease);
      const now=Math.floor(Date.now()/1000),claims={role:'roomqc_setup_recovery',iss:'roomqc-setup-recovery/v1',aud:'authenticated',jti:randomUUID(),
        cluster_id:c.id,binding_sha256:binding.bindingHash,iat:now,exp:now+3600};
      token='fixture.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature';
      const credential=await json('credential.json',{version:1,clusterId:c.id,bindingSha256:binding.bindingHash,publishableKey:'fixture-public',token});
      const budget=JSON.parse(await readFile(join(root,'deploy/control-resource-budget.example.json'),'utf8'));
      for(const id of ['setup-backfill-reader','setup-backfill-writer'])budget.databases[0].consumers.push({id,replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
      const budgetFile=await json('budget.json',budget),readerUrl=new URL(url);readerUrl.username=reader;readerUrl.search='?sslmode=disable';
      const readerFile=await text('reader-dsn',readerUrl.href);
      const base={schemaVersion:1,environment:'local',directory:{dsnFile:readerFile,expected},releaseTrustFile:publicTrust,resourceBudgetFile:budgetFile,
        targets:[{cluster:{id:c.id,url:c.url,internalUrl:null,inventoryRef:c.id,credentialRef:c.id,hostId:c.id,approvedAddresses:[]},
          approval:fixtureReleaseApproval(fixtureReleaseContext(c,syntheticRelease)),credentialFile:credential}]};
      const readerConfig=await json('reader.json',base),reportFile=join(directory,'dry-run.json');
      const scan=child('control-setup-backfill.mjs',['--config',readerConfig,'--output',reportFile,'--allow-local']);children.push(scan);
      assert.equal((await until(scan.done,'Reader CLI timeout')).code,0);
      const reportText=await readFile(reportFile,'utf8'),report=JSON.parse(reportText);assert.equal(report.pageCount,3);
      assert.equal(report.counts.closed,2);assert.equal(report.counts.dispatch_pending,1);
      const pair=generateKeyPairSync('ed25519'),trustFile=await json('batch-trust.json',{version:1,keys:[{keyId:'fixture-batch-key',
        publicKey:pair.publicKey.export({format:'jwk'}),environment:'local',target}]});
      proxy=await responseLossProxy(new URL(url));const writerUrl=new URL(url);writerUrl.username=writer;writerUrl.port=String(proxy.port);writerUrl.search='?sslmode=disable';
      const writerDsn=await text('writer-dsn',writerUrl.href);
      const writerConfig=await json('writer.json',{...base,directory:{dsnFile:writerDsn,expected:{...identity,role:writer}},batchTrustFile:trustFile});
      const loaded=await loadSetupBackfillApplyConfiguration(writerConfig,{allowLocal:true});
      assert.equal(loaded.connection.max,1);assert.match(loaded.connection.options,/default_transaction_read_only=off/);
      assert.match(loaded.connection.options,/timezone=UTC/);assert.match(loaded.connection.options,/datestyle=ISO,YMD/);
      const items=workspaces.map(w=>{const r=report.items.find(i=>i.workspaceId===w.id);return Object.fromEntries(['workspaceId','clusterId','routingVersion','snapshotSha256','group'].map(k=>[k,r[k]]))});
      const payload={batchId:randomUUID(),environment:'local',notBefore:Date.now()-1000,expiresAt:Date.now()+3600000,reviewerRef:'fixture-review',changeRef:'fixture-change',
        source:report.source,target,bindings:loaded.targets.map(t=>t.identity),reportSha256:setupBackfillFileSha256(reportText),scopeSha256:report.scopeSha256,
        resourceBudgetSha256:report.resourceBudgetSha256,items};
      const unsigned={version:1,algorithm:'Ed25519',keyId:'fixture-batch-key',payload};
      const manifestFile=await json('signed-batch.json',{...unsigned,signature:sign(null,setupBackfillBatchSigningBytes(unsigned),pair.privateKey).toString('base64url')});
      const execute=name=>{const value=child('control-setup-backfill-apply.mjs',['--config',writerConfig,'--report',reportFile,'--manifest',manifestFile,'--output',join(directory,name),'--allow-local']);children.push(value);return value};
      const commands=async()=>Number((await pool.query('SELECT count(*) AS n FROM roomqc_control.setup_backfill_commands')).rows[0].n);
      await text('existing.jsonl','preserve\n');const existing=await until(execute('existing.jsonl').done,'Exclusive output timeout');
      assert.equal(existing.code,1);assert.match(existing.output,/SETUP_BACKFILL_OUTPUT_EXISTS/);assert.equal(await commands(),0);
      assert.equal(await readFile(join(directory,'existing.jsonl'),'utf8'),'preserve\n');
      await writeFile(reportFile,reportText+' ');const forged=await until(execute('forged.jsonl').done,'Forged input timeout');
      assert.equal(forged.code,1);assert.match(forged.output,/SETUP_BACKFILL_BATCH_INVALID/);assert.equal(await commands(),0);await writeFile(reportFile,reportText);
      const first=execute('lost-response.jsonl');
      await until(Promise.race([proxy.lost,first.done.then(result=>{
        const codes=[...new Set(result.output.match(/\b(?:SETUP_[A-Z_]+|CONTROL_[A-Z_]+|ECONNREFUSED|ETIMEDOUT)\b/g)??[])];
        throw new Error('OWNED_BACKFILL_CHILD_ENDED_BEFORE_COMMIT_BARRIER:exit='+result.code+':codes='+codes.join(','));
      })]),'Post-commit response loss barrier');
      const lost=await until(first.done,'Lost response CLI exit');assert.equal(lost.code,1);assert.equal(proxy.captured(),true);assert.equal(await commands(),1);
      const firstLog=await readFile(join(directory,'lost-response.jsonl'),'utf8');assert.equal(firstLog.includes('"type":"result"'),false);
      assert.equal((await pool.query('SELECT state FROM roomqc_control.provisioning_jobs WHERE workspace_id=$1',[items[0].workspaceId])).rows[0].state,'waiting_owner');
      blockThird=true;const second=execute('interrupted.jsonl');await until(thirdRead.promise,'Third receipt interruption barrier');
      assert.equal(await commands(),2);assert.equal(second.process.kill('SIGKILL'),true);await until(second.done,'Killed CLI exit');
      server.closeAllConnections();const resumed=await until(execute('resumed.jsonl').done,'Resumed CLI timeout');
      assert.equal(resumed.code,0);assert.equal(await commands(),3);
      const finalLines=(await readFile(join(directory,'resumed.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
      assert.equal(finalLines.at(-1).type,'complete');assert.equal(finalLines.filter(r=>r.type==='result').length,3);
      const before=(await pool.query('SELECT * FROM roomqc_control.setup_backfill_commands ORDER BY command_id')).rows;
      const replay=await until(execute('replay.jsonl').done,'Replay CLI timeout');assert.equal(replay.code,0);
      assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.setup_backfill_commands ORDER BY command_id')).rows,before);
      assert.equal(Number((await pool.query("SELECT count(*) AS n FROM roomqc_control.attempts WHERE outcome LIKE 'setup_backfill_%'")).rows[0].n),3);
      assert.equal(remoteCloseCalls,0);assert.ok(remoteReads>=3);
      for(const result of [existing,forged,lost,resumed,replay])for(const secret of [password,token,'Private CLI owner','Private CLI hotel'])assert.equal(result.output.includes(secret),false);
      for(const secret of [password,token,'Private CLI owner','Private CLI hotel'])assert.equal(JSON.stringify(finalLines).includes(secret),false);
    }finally{
      for(const c of children)if(c.process.exitCode===null&&c.process.signalCode===null)c.process.kill('SIGKILL');
      await Promise.allSettled(children.map(c=>c.done));
      await proxy?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r))}
      await rm(directory,{recursive:true,force:true});
    }
  });
}
