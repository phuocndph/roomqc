import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {createECDH,randomBytes,createHmac,createDecipheriv,createPublicKey,verify} from 'node:crypto';
import webPush from 'web-push';
import {createNotificationTransport,createTelegramBookingAdapter,createWebPushBookingAdapter} from './booking-notification-providers.mjs';
const data={title:'Phòng 102 - Checkout',body:'Khách đã trả phòng. Kiểm tra đồ dùng.',action_url:'/rooms/00000000-0000-4000-8000-000000000001/check?type=checkout',
  event_id:'00000000-0000-4000-8000-000000000002',notification_type:'room_checkout'};
const token='123456789:'+randomBytes(24).toString('base64url');
async function fixture(handler,options={}){
  const requests=[];const server=http.createServer(async(req,res)=>{const chunks=[];for await(const b of req)chunks.push(b);
    const row={url:req.url,headers:req.headers,body:Buffer.concat(chunks)};requests.push(row);await handler(row,res,req)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const transport=createNotificationTransport({developmentOrigins:[origin],timeoutMs:200,...options});
  return {origin,transport,requests,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r))}};
}
export function decryptFixturePush(body,subscriber,auth){
  const salt=body.subarray(0,16),size=body.readUInt32BE(16),length=body[20],sender=body.subarray(21,21+length),encrypted=body.subarray(21+length);
  assert.equal(size,4096);assert.equal(length,65);
  const mac=(key,value)=>createHmac('sha256',key).update(value).digest();
  const expand=(key,info,n)=>mac(key,Buffer.concat([info,Buffer.from([1])])).subarray(0,n);
  const shared=subscriber.computeSecret(sender),prkKey=mac(auth,shared),ikm=expand(prkKey,Buffer.concat([Buffer.from('WebPush: info\0'),subscriber.getPublicKey(),sender]),32);
  const prk=mac(salt,ikm),cek=expand(prk,Buffer.from('Content-Encoding: aes128gcm\0'),16),nonce=expand(prk,Buffer.from('Content-Encoding: nonce\0'),12);
  const cipher=createDecipheriv('aes-128-gcm',cek,nonce);cipher.setAuthTag(encrypted.subarray(-16));
  const plain=Buffer.concat([cipher.update(encrypted.subarray(0,-16)),cipher.final()]);
  let end=plain.length-1;while(plain[end]===0)end--;assert.equal(plain[end],2);return JSON.parse(plain.subarray(0,end));
}
test('Web Push sends RFC8291 encrypted payload and a verifiable VAPID token to an actual local sink',async()=>{
  const sink=await fixture((_row,res)=>{res.writeHead(201);res.end()}),keys=webPush.generateVAPIDKeys(),subscriber=createECDH('prime256v1');subscriber.generateKeys();const auth=randomBytes(16);
  try{
    const adapter=createWebPushBookingAdapter({...keys,subject:'mailto:ops@roomqc.invalid',transport:sink.transport});
    const result=await(await adapter.prepare({endpoint:sink.origin+'/push/test',p256dh:subscriber.getPublicKey().toString('base64url'),auth:auth.toString('base64url')},data)).send();
    assert.equal(result.outcome,'accepted');assert.equal(result.httpStatus,201);const row=sink.requests[0];
    assert.equal(row.headers['content-encoding'],'aes128gcm');assert.equal(row.headers.ttl,'300');
    assert.ok(!row.body.includes(Buffer.from(data.body)));const decoded=decryptFixturePush(row.body,subscriber,auth);
    assert.equal(decoded.body,data.body);assert.equal(decoded.data.url,data.action_url);assert.equal(decoded.notification_type,'room_checkout');
    const jwt=row.headers.authorization.match(/t=([^, ]+)/)[1],parts=jwt.split('.'),pub=Buffer.from(keys.publicKey,'base64url');
    assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).aud,sink.origin);
    assert.ok(verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),{key:createPublicKey({key:{kty:'EC',crv:'P-256',x:pub.subarray(1,33).toString('base64url'),y:pub.subarray(33).toString('base64url')},format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')));
  }finally{await sink.close()}
});
for(const [status,body,outcome] of [
  [200,{ok:true,result:{message_id:7,chat:{id:-100123}}},'accepted'],
  [200,{ok:true,result:{message_id:7,chat:{id:-100124}}},'unknown'],
  [200,{ok:true,result:{chat:{id:-100123}}},'unknown'],
  [200,{ok:true,result:{message_id:0,chat:{id:-100123}}},'unknown'],
  [403,{ok:false,error_code:403,description:'private provider message'},'rejected'],
  [429,{ok:false,error_code:429,parameters:{retry_after:45}},'retry'],
  [500,{ok:false,error_code:500},'unknown'],[200,{ok:false,error_code:429},'unknown'],[201,{ok:true,result:{message_id:7,chat:{id:-100123}}},'unknown'],
])test('Telegram validates the provider receipt: '+status+'/'+outcome+'/'+JSON.stringify(body),async()=>{
  const sink=await fixture((_row,res)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body))});
  try{const adapter=createTelegramBookingAdapter({botToken:token,appOrigin:'https://roomqc.invalid',apiOrigin:sink.origin,transport:sink.transport});
    const result=await(await adapter.prepare({chat_id:'-100123'},data)).send();assert.equal(result.outcome,outcome);
    if(outcome==='retry')assert.equal(result.retrySeconds,45);
    const sent=JSON.parse(sink.requests[0].body);assert.equal(sent.parse_mode,undefined);assert.ok(sent.text.includes(data.body));
    assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes(token));
  }finally{await sink.close()}
});
for(const [status,outcome] of [[201,'accepted'],[200,'unknown'],[202,'unknown'],[410,'rejected'],[403,'rejected'],[429,'retry'],[408,'unknown'],[500,'unknown']])
  test('Web Push HTTP receipt is scoped to service acceptance: '+status,async()=>{
    const sink=await fixture((_row,res)=>{res.writeHead(status,{'retry-after':'20'});res.end()}),keys=webPush.generateVAPIDKeys(),subscriber=createECDH('prime256v1');subscriber.generateKeys();
    try{const adapter=createWebPushBookingAdapter({...keys,subject:'mailto:ops@roomqc.invalid',transport:sink.transport});
      const result=await(await adapter.prepare({endpoint:sink.origin+'/push/test',p256dh:subscriber.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')},data)).send();
      assert.equal(result.outcome,outcome);if(status===429)assert.equal(result.retrySeconds,20);
    }finally{await sink.close()}
  });
test('provider transport never follows redirects',async()=>{
  const sink=await fixture((_row,res)=>{res.writeHead(302,{location:'/second'});res.end()});
  try{const r=await(await sink.transport.prepare(sink.origin+'/first',{body:'owned'})).send();assert.equal(r.status,302);assert.equal(sink.requests.length,1)}finally{await sink.close()}
});
for(const mode of ['drop','oversize','hang'])test('provider '+mode+' retains unknown outcome without throwing secrets',async()=>{
  const sink=await fixture((_row,res,req)=>{if(mode==='drop')req.socket.destroy();if(mode==='oversize')res.end('x'.repeat(17000))});
  try{const adapter=createTelegramBookingAdapter({botToken:token,appOrigin:'https://roomqc.invalid',apiOrigin:sink.origin,transport:sink.transport});
    const r=await(await adapter.prepare({chat_id:'-100123'},data)).send();assert.equal(r.outcome,'unknown');assert.ok(!JSON.stringify(r).includes(token));
  }finally{await sink.close()}
});
for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','::ffff:127.0.0.1','fd00::1'])test('provider DNS denies non-public destination '+address,async()=>{
  const transport=createNotificationTransport({origins:['https://push.roomqc.invalid'],lookup:async()=>[{address,family:address.includes(':')?6:4}]});
  await assert.rejects(()=>transport.prepare('https://push.roomqc.invalid/send',{body:'owned'}),e=>e.code==='NOTIFICATION_TARGET_DENIED');
});
test('provider DNS rejects a mixed public/private answer set before any request',async()=>{
  const transport=createNotificationTransport({origins:['https://push.roomqc.invalid'],lookup:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]});
  await assert.rejects(()=>transport.prepare('https://push.roomqc.invalid/send',{body:'owned'}));
});
test('provider DNS failure is safely retryable before I/O',async()=>{
  const transport=createNotificationTransport({origins:['https://push.roomqc.invalid'],lookup:async()=>{throw new Error('private DNS')}});
  await assert.rejects(()=>transport.prepare('https://push.roomqc.invalid/send',{body:'owned'}),e=>e.code==='NOTIFICATION_PREPARE_RETRY');
});
test('provider configuration has no credential/default-key fallback',()=>{
  assert.throws(()=>createTelegramBookingAdapter({botToken:'private'}),/BOOKING_TELEGRAM_UNCONFIGURED/);
  assert.throws(()=>createWebPushBookingAdapter({publicKey:'private',privateKey:'private'}),/BOOKING_PUSH_UNCONFIGURED/);
  assert.throws(()=>createNotificationTransport({developmentOrigins:['http://10.0.0.1']}));
});
