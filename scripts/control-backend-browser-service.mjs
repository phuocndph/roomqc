// Runs inside the owned gateway network namespace. No serving target argument.
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
import {migrateDirectory,importInitialRegistry} from '/control/migrate.mjs';
import {fixtureConfig,seedOperationalCluster} from '/control/test-fixtures.mjs';
import {startControl} from '/control/server.mjs';
import {createInvitationSmtpSink} from './control-backend-invitation-delivery.mjs';

const input=JSON.parse(process.env.ROOMQC_FIXTURE_BROWSER_INPUT??'null');
assert.match(input?.run??'',/^[a-f0-9]{12}$/);
const origin=new URL(input.publicOrigin);assert.equal(origin.protocol,'http:');assert.equal(origin.hostname,'127.0.0.1');
assert.equal(origin.origin,input.publicOrigin);
const database='roomqc_browser_'+input.run,role='browser_api_'+input.run;
const email=label=>'invitation-'+input.run+'-browser-'+label+'@roomqc.invalid';
const recipients=['owner','second','staff'].map(email);
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
let maintenance,directory,sink,templates,fixture,runtime,refresh,created=false,roleCreated=false;
let finish,finished=false,controls;
const done=new Promise(resolve=>{finish=resolve});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=body=>'<!doctype html><html lang="vi"><meta charset="utf-8"><title>RoomQC — Hộp thư kiểm thử</title><body style="font:16px system-ui;max-width:900px;margin:40px auto;padding:16px"><h1>Hộp thư kiểm thử RoomQC</h1>'+body+'</body></html>';
const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve)});
const close=async server=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}};
try{
  maintenance=new pg.Pool({host:'db',database:'postgres',user:'supabase_admin',password:input.databasePassword,max:1,statement_timeout:15000});
  await maintenance.query('CREATE DATABASE '+database);created=true;
  directory=new pg.Pool({host:'db',database,user:'supabase_admin',password:input.databasePassword,max:2,statement_timeout:15000});
  await migrateDirectory(directory);
  const cluster={id:'cluster-a',url:origin.origin,internalUrl:'http://127.0.0.1:8000',publishableKey:input.publishableKey,
    serviceKey:input.serviceKey,vapidPublicKey:'browser-fixture',maxWorkspaces:10};
  await importInitialRegistry(directory,[cluster]);await seedOperationalCluster(directory,cluster.id,{limit:10,cluster});
  const password=randomBytes(32).toString('hex');
  await directory.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);roleCreated=true;
  runtime=await startControl({...fixtureConfig('postgresql://'+role+':'+password+'@db/'+database,[cluster]),
    publicOrigin:origin.origin,host:'0.0.0.0',port:8091,signupEnabled:true,setupDispatchEnabled:true,shutdownTimeoutMs:2000});
  sink=await createInvitationSmtpSink({run:input.run,recipients});
  templates=http.createServer((req,res)=>{
    const name=req.url?.slice(1);
    if(!['confirmation','invite'].includes(name)){res.writeHead(404);res.end();return}
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(input.templates[name]);
  });await listen(templates,2526);
  const heartbeat=()=>directory.query(`UPDATE roomqc_control.cluster_health_current SET observed_at=clock_timestamp(),
    valid_until=clock_timestamp()+interval '120 seconds',
    evaluator_state=jsonb_set(evaluator_state,'{probeEvidence,checkedAt}',to_jsonb(clock_timestamp()))`);
  refresh=setInterval(()=>void heartbeat().catch(()=>finish()),20000);
  fixture=http.createServer(async(req,res)=>{
    try{
      res.setHeader('cache-control','no-store');res.setHeader('content-type','text/html; charset=utf-8');
      if(req.method==='GET'&&req.url==='/__fixture/inbox'){
        const messages=sink.messages.map(message=>{
          const decoded=message.raw.replace(/=\r\n/g,'').replace(/=([A-F0-9]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
          const code=decoded.match(/letter-spacing:6px[^>]*>\s*(\d{6})\s*</)?.[1];
          return '<article><h2>'+escape(message.to[0])+'</h2><p>Mã xác minh: <strong>'+escape(code??'Không có mã')+'</strong></p></article>';
        }).join('');
        res.end(html('<p>Chỉ nhận email thử trong lượt '+escape(input.run)+'. Không gửi ra ngoài.</p><p><a href="/start">Mở đăng ký RoomQC</a> · <a href="/__fixture/inbox">Tải lại thư</a></p>'
          +'<ul>'+recipients.map(address=>'<li>'+escape(address)+'</li>').join('')+'</ul>'+(messages||'<p>Chưa có thư.</p>')
          +'<form method="post" action="/__fixture/finish"><button>Kết thúc kiểm thử</button></form>'));return;
      }
      if(req.method==='POST'&&req.url==='/__fixture/finish'&&req.headers.origin===origin.origin){
        const workspaceCounts=(await directory.query('SELECT status,count(*)::integer AS count FROM roomqc_control.workspaces GROUP BY status')).rows;
        const active=workspaceCounts.find(row=>row.status==='active')?.count??0;
        const evidence=(await maintenance.query(`SELECT jsonb_build_object('tenants',(SELECT count(*) FROM private.workspace_provisioning),
          'rooms',(SELECT count(*) FROM public.rooms r JOIN private.workspace_provisioning w ON w.tenant_id=r.tenant_id),
          'staff',(SELECT count(*) FROM public.users u JOIN private.workspace_provisioning w ON w.tenant_id=u.tenant_id WHERE u.user_level_code='staff')) AS value`)).rows[0].value;
        if(active<1||Number(evidence.rooms)<1||sink.messages.length<1){res.writeHead(409);res.end(html('<p>Chưa đủ bằng chứng: cần đăng ký được cấp, phòng đã tạo và email xác thực.</p>'));return}
        controls={event:'browser_fixture_finished',verified:true,run:input.run,activeWorkspaces:active,rooms:Number(evidence.rooms),staff:Number(evidence.staff),
          capturedMessages:sink.messages.length,externalProviders:false};
        finished=true;res.end(html('<p>Đã ghi nhận kết quả. Bộ thử sẽ được dọn riêng.</p>'));finish();return;
      }
      res.writeHead(404);res.end(html('<p>Không tìm thấy.</p>'));
    }catch{res.writeHead(503);res.end(html('<p>Không đọc được dữ liệu thử.</p>'))}
  });await listen(fixture,2527);
  emit({event:'browser_fixture_ready'});
  const timeout=setTimeout(finish,3_600_000);process.once('SIGTERM',finish);process.once('SIGINT',finish);
  await done;clearTimeout(timeout);assert.equal(finished,true,'Browser session must be completed explicitly with actual product data');
}finally{
  clearInterval(refresh);await close(fixture);await close(templates);if(sink)await sink.close();if(runtime)await runtime.shutdown();
  if(directory)await directory.end();
  if(maintenance){if(created)await maintenance.query('DROP DATABASE '+database+' WITH (FORCE)');if(roleCreated)await maintenance.query('DROP ROLE '+role);await maintenance.end()}
}
emit(controls);
