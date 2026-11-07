// Persistent, loopback-only demo. Never imported by a deployed product service.
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
import {migrateDirectory,importInitialRegistry} from '/control/migrate.mjs';
import {fixtureConfig,seedOperationalCluster} from '/control/test-fixtures.mjs';
import {fixtureReleaseContext,fixtureReleaseApproval,fixtureReleaseTrust} from '/control/release-test-fixtures.mjs';
import {syntheticBundle,syntheticRelease} from '/control/probe-test-fixtures.mjs';
import {ReleaseValidationCatalog} from '/control/release-validation.mjs';
import {releaseApprovalIdentity} from '/control/release-authority.mjs';
import {startControl} from '/control/server.mjs';
import {createInvitationSmtpSink} from './control-backend-invitation-delivery.mjs';

const input=JSON.parse(await readFile('/demo/input.json','utf8'));
assert.equal(input.persistentLocalDemo,true);assert.match(input.run,/^[a-f0-9]{12}$/);
const origin=new URL(input.publicOrigin);
assert.equal(origin.origin,input.publicOrigin);assert.equal(origin.protocol,'http:');assert.equal(origin.hostname,'127.0.0.1');
const database='roomqc_browser_'+input.run,role='browser_api_'+input.run;
const recipients=['owner','second','staff',...Array.from({length:13},(_,i)=>'demo'+String(i+1).padStart(2,'0'))]
  .map(label=>'invitation-'+input.run+'-browser-'+label+'@roomqc.invalid');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=body=>'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RoomQC — Hộp thư demo</title><body style="font:16px system-ui;max-width:900px;margin:24px auto;padding:16px"><h1>Hộp thư demo RoomQC</h1>'+body+'</body></html>';
const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve)});
const close=async server=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
let directory,maintenance,runtime,sink,templates,mailbox,backendProxy,heartbeat,renewal,renewing;
let finish;const done=new Promise(resolve=>{finish=resolve});
process.once('SIGTERM',finish);process.once('SIGINT',finish);
try{
  maintenance=new pg.Pool({host:'db',database:'postgres',user:'supabase_admin',password:input.databasePassword,max:1,statement_timeout:15000});
  if(!(await maintenance.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount)await maintenance.query('CREATE DATABASE '+database);
  directory=new pg.Pool({host:'db',database,user:'supabase_admin',password:input.databasePassword,max:2,statement_timeout:15000});
  await migrateDirectory(directory);
  const cluster={id:'cluster-a',url:origin.origin,internalUrl:'http://127.0.0.1:8000',publishableKey:input.publishableKey,
    serviceKey:input.serviceKey,vapidPublicKey:'browser-fixture',maxWorkspaces:10};
  await importInitialRegistry(directory,[cluster]);
  const password=randomBytes(32).toString('hex');
  if(!(await maintenance.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)
    await directory.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
  else await directory.query(`ALTER ROLE ${role} PASSWORD '${password}'`);
  // Only synthetic admission prerequisites are renewed. Hotel/Auth/workspace
  // data is retained. Approval history is appended, never rewritten/deleted.
  const baseConfig=fixtureConfig('postgresql://'+role+':'+password+'@db/'+database,[cluster]);
  const renew=async()=>{
    const epoch=Number((await directory.query('SELECT coalesce(max(epoch),0)+1 AS epoch FROM roomqc_control.release_approvals WHERE cluster_id=$1',[cluster.id])).rows[0].epoch);
    const context=fixtureReleaseContext(cluster,{...syntheticRelease,clusterId:cluster.id});
    const envelope=fixtureReleaseApproval(context,{epoch,notBefore:Date.now()-10000,expiresAt:Date.now()+23*3600000});
    const approval=fixtureReleaseTrust.verify(envelope,context);
    if(runtime){await runtime.shutdown();runtime=null}
    const client=await directory.connect();
    try{
      await client.query('BEGIN');
      const seeded=(await client.query('SELECT 1 FROM roomqc_control.cluster_health_current WHERE cluster_id=$1',[cluster.id])).rowCount>0;
      await client.query(`INSERT INTO roomqc_control.release_approvals(approval_id,cluster_id,epoch,envelope_digest,issuer_id,key_id,key_fingerprint,
        inventory_ref,host_id,environment,endpoint_fingerprint,expectation_fingerprint,expected,not_before_ms,expires_at_ms)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)`,
        [approval.approvalId,approval.clusterId,approval.epoch,approval.envelopeDigest,approval.issuerId,approval.keyId,approval.keyFingerprint,
          approval.inventoryRef,approval.hostId,approval.environment,approval.endpointFingerprint,approval.expectationFingerprint,
          JSON.stringify(approval.expected),approval.notBefore,approval.expiresAt]);
      await client.query(`INSERT INTO roomqc_control.release_authority(cluster_id,approval_id,epoch,row_version,state) VALUES($1,$2,$3,1,'active')
        ON CONFLICT(cluster_id) DO UPDATE SET approval_id=$2,epoch=$3,row_version=roomqc_control.release_authority.row_version+1,state='active'`,
        [cluster.id,approval.approvalId,approval.epoch]);
      if(!seeded)await seedOperationalCluster(client,cluster.id,{limit:10,cluster,approvalSeed:false});
      await client.query("UPDATE roomqc_control.probe_credentials SET auth_expires_at=clock_timestamp()+interval '1 hour',probe_expires_at=clock_timestamp()+interval '1 hour' WHERE cluster_id=$1",[cluster.id]);
      await client.query("UPDATE roomqc_control.backup_runs SET completed_at=clock_timestamp(),restore_test_at=clock_timestamp() WHERE cluster_id=$1 AND backup_id LIKE 'fixture-backup-%'",[cluster.id]);
      await client.query(`UPDATE roomqc_control.cluster_health_current SET observed_at=clock_timestamp(),valid_until=clock_timestamp()+interval '120 seconds',evaluator_state=jsonb_set(evaluator_state,'{probeEvidence,releaseApproval}',$2::jsonb) WHERE cluster_id=$1`,
        [cluster.id,JSON.stringify(releaseApprovalIdentity(approval))]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
    const config={...baseConfig,
      releaseValidation:new ReleaseValidationCatalog({version:2,entries:[{inventoryRef:cluster.id,approval:envelope,
        credential:{...syntheticBundle().credential,publishableKey:cluster.publishableKey}}]},{trust:fixtureReleaseTrust}),
      publicOrigin:origin.origin,host:'0.0.0.0',port:8091,signupEnabled:true,setupDispatchEnabled:true,shutdownTimeoutMs:2000};
    runtime=await startControl(config);
  };
  // hosts must exist before the release approval's FK is installed.
  await directory.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES($1,$1,'local') ON CONFLICT(id) DO NOTHING",[cluster.id]);
  // Keep the unchanged control API's loopback HTTP allowlist. This private
  // reverse proxy forwards only to this demo's internal gateway.
  backendProxy=http.createServer((req,res)=>{
    const upstream=http.request({hostname:'api-gw',port:8000,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)});
    upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream);
  });
  await new Promise((resolve,reject)=>{backendProxy.once('error',reject);backendProxy.listen(8000,'127.0.0.1',resolve)});
  await renew();
  sink=await createInvitationSmtpSink({run:input.run,recipients});
  templates=http.createServer((req,res)=>{
    const name=req.url?.slice(1);if(!['confirmation','invite'].includes(name)){res.writeHead(404);res.end();return}
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(input.templates[name]);
  });await listen(templates,2526);
  mailbox=http.createServer((req,res)=>{
    res.setHeader('cache-control','no-store');res.setHeader('content-type','text/html; charset=utf-8');
    if(req.method!=='GET'||req.url!=='/__fixture/inbox'){res.writeHead(404);res.end();return}
    const messages=[...sink.messages].reverse().map(message=>{
      const decoded=message.raw.replace(/=\r\n/g,'').replace(/=([A-F0-9]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
      const code=decoded.match(/letter-spacing:6px[^>]*>\s*(\d{6})\s*</)?.[1];
      return '<article><h2>'+escape(message.to[0])+'</h2><p>Mã xác minh: <strong>'+escape(code??'Không có mã')+'</strong></p></article>';
    }).join('');
    res.end(html('<p>Demo local giữ tài khoản và dữ liệu khi dừng/mở lại. Chỉ dùng email thử trong danh sách dưới đây; không gửi email ra ngoài.</p>'
      +'<p><a href="/start">Đăng ký RoomQC</a> · <a href="/__fixture/inbox">Tải lại thư</a></p><ul>'
      +recipients.map(address=>'<li>'+escape(address)+'</li>').join('')+'</ul>'+(messages||'<p>Chưa có thư. Nếu vừa khởi động lại, gửi lại mã từ trang xác minh.</p>')));
  });await listen(mailbox,2527);
  heartbeat=setInterval(()=>void directory.query(`WITH refreshed AS (UPDATE roomqc_control.probe_credentials
    SET auth_expires_at=clock_timestamp()+interval '1 hour',probe_expires_at=clock_timestamp()+interval '1 hour' WHERE cluster_id='cluster-a')
    UPDATE roomqc_control.cluster_health_current SET observed_at=clock_timestamp(),valid_until=clock_timestamp()+interval '120 seconds',
    evaluator_state=jsonb_set(evaluator_state,'{probeEvidence,checkedAt}',to_jsonb(clock_timestamp())) WHERE cluster_id='cluster-a'`)
    .catch(()=>finish()),20000);
  const refreshAdmission=()=>{if(!renewing)renewing=renew().catch(()=>finish()).finally(()=>{renewing=null})};
  renewal=setInterval(refreshAdmission,30*60000);process.on('SIGUSR2',refreshAdmission);
  process.stdout.write(JSON.stringify({event:'local_demo_ready',run:input.run,origin:origin.origin})+'\n');
  await done;
}finally{
  clearInterval(heartbeat);clearInterval(renewal);await renewing;
  await close(backendProxy);await close(mailbox);await close(templates);if(sink)await sink.close();if(runtime)await runtime.shutdown();
  if(directory)await directory.end();if(maintenance)await maintenance.end();
  // Explicit stop never drops a DB, role, container or volume.
}
