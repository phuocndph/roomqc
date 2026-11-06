// Test-only continuation of the native customer journey. Passwords belong to
// synthetic identities in this disposable stack and stay in process memory.
import assert from 'node:assert/strict';
import http from 'node:http';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function browserAccessContext({run,publicOrigin,actors}){
  assert.match(run,/^[a-f0-9]{12}$/);
  const url=new URL(publicOrigin);
  assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.origin,publicOrigin);
  assert.deepEqual(actors.map(actor=>actor.label),['owner','staff','second-owner']);
  for(const actor of actors){
    assert.match(actor.id,/^[a-f0-9-]{36}$/);
    assert.match(actor.slug,new RegExp('^journey-'+run+'-(alpha|bravo)$'));
    assert.match(actor.email,new RegExp('^invitation-'+run+'-journey-(alpha|bravo|employee)@roomqc\\.invalid$'));
    assert.ok(typeof actor.password==='string'&&actor.password.length>=32);
  }
  assert.equal(new Set(actors.map(actor=>actor.id)).size,3);
}
export async function awaitBrowserCustomerAccess({run,publicOrigin,actors,db,unchanged}){
  browserAccessContext({run,publicOrigin,actors});
  const readyAt=(await db.query('SELECT clock_timestamp() AS at')).rows[0].at;
  const baseline=await unchanged();let complete=false,finish,receipt,poll;
  const observed=new Map(actors.map(actor=>[actor.id,new Set()]));
  const capture=()=>poll??=db.query(`SELECT id::text,user_id::text FROM auth.sessions
    WHERE user_id=ANY($1::uuid[]) AND created_at >= $2`,[actors.map(actor=>actor.id),readyAt])
    .then(result=>{for(const row of result.rows)observed.get(row.user_id).add(row.id);}).finally(()=>{poll=null});
  const done=new Promise(resolve=>{finish=resolve});
  const html=body=>'<!doctype html><html lang="vi"><meta charset="utf-8"><title>RoomQC — Kiểm thử tài khoản</title><body style="font:16px system-ui;max-width:900px;margin:32px auto;padding:16px"><h1>Kiểm thử tài khoản RoomQC</h1>'+body+'</body></html>';
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    // A navigation POST with no-referrer can carry Origin: null. Keep same-site
    // navigation provenance so the exact-origin finish guard remains usable.
    res.setHeader('Referrer-Policy','same-origin');
    try{
      if(req.method==='GET'&&req.url==='/__fixture/inbox'){
        res.end(html('<p>Ba tài khoản dùng riêng cho lượt thử này đã được chuẩn bị qua luồng đăng ký, email và nhận lời mời thật. Không có email gửi ra ngoài. Mật khẩu thử chỉ giữ trong bộ nhớ.</p>'
          +actors.map(actor=>'<article><h2>'+escape(actor.label)+'</h2><p>Email: <code>'+escape(actor.email)+'</code></p><details><summary>Xem mật khẩu thử</summary><code>'+escape(actor.password)+'</code></details><p><a href="/app/'+escape(actor.slug)+'/auth/login">Đăng nhập '+escape(actor.label)+'</a></p></article>').join('')
          +'<p>Đăng nhập cả ba tài khoản trên giao diện rồi quay lại kết thúc. Không đổi mật khẩu hoặc dữ liệu nghiệp vụ.</p><form method="post" action="/__fixture/finish"><button>Kết thúc kiểm thử</button></form>'));return;
      }
      if(req.method==='POST'&&req.url==='/__fixture/finish'){
        if(req.headers.origin!==publicOrigin){res.writeHead(403);res.end(html('<p>Yêu cầu không hợp lệ.</p>'));return;}
        await capture();
        const logins=actors.map(actor=>({actor:actor.label,newSessions:observed.get(actor.id).size}));
        if(logins.some(actor=>actor.newSessions<1)){
          res.writeHead(409);res.end(html('<p>Chưa có phiên đăng nhập mới trên giao diện cho đủ ba tài khoản.</p><p><a href="/__fixture/inbox">Quay lại tài khoản thử</a></p>'));return;
        }
        assert.equal(await unchanged(),baseline,'Browser read-only review must preserve business data and employee authority');
        receipt={verified:true,freshLogins:logins,businessUnchanged:true,syntheticAccounts:true,externalProviders:false};
        complete=true;res.end(html('<p>Đã xác nhận đăng nhập mới cho đủ ba tài khoản. Bộ thử sẽ được dọn riêng.</p>'));finish();return;
      }
      res.writeHead(404);res.end(html('<p>Không tìm thấy.</p>'));
    }catch{res.writeHead(503);res.end(html('<p>Không xác nhận được dữ liệu thử.</p>'));}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(2527,'0.0.0.0',resolve)});
  process.stdout.write(JSON.stringify({event:'browser_fixture_ready'})+'\n');
  const monitor=setInterval(()=>void capture().catch(()=>{}),1000);
  const timeout=setTimeout(finish,3_600_000);process.once('SIGTERM',finish);process.once('SIGINT',finish);
  try{await done;assert.equal(complete,true,'Browser account review requires explicit completion and fresh sessions');return receipt;}
  finally{clearTimeout(timeout);clearInterval(monitor);await poll?.catch(()=>{});process.removeListener('SIGTERM',finish);process.removeListener('SIGINT',finish);
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
