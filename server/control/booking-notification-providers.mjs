import http from 'node:http';
import https from 'node:https';
import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {createHash,createECDH} from 'node:crypto';
import webPush from 'web-push';
import {addressKind} from './safe-http.mjs';

const problem=code=>Object.assign(new Error(code),{code});
const denied=()=>problem('NOTIFICATION_TARGET_DENIED');
const digest=value=>createHash('sha256').update(value).digest('hex');
const unknown=status=>({outcome:'unknown',httpStatus:status??null,messageId:null,retrySeconds:0});
const negative=(status,retrySeconds=0)=>({outcome:status===429?'retry':'rejected',httpStatus:status,messageId:null,retrySeconds});
const publicOrigins=['https://api.telegram.org','https://fcm.googleapis.com','https://updates.push.services.mozilla.com','https://web.push.apple.com'];

export function createNotificationTransport({origins=publicOrigins,developmentOrigins=[],lookup=dnsLookup,timeoutMs=5000,maxResponseBytes=16384}={}){
  if(!Array.isArray(origins)||!Array.isArray(developmentOrigins)||!Number.isInteger(timeoutMs)||timeoutMs<20||timeoutMs>10000
    ||!Number.isInteger(maxResponseBytes)||maxResponseBytes<64||maxResponseBytes>65536)throw problem('INVALID_NOTIFICATION_TRANSPORT');
  const approved=new Set(),local=new Set();
  for(const raw of origins){const u=new URL(raw);if(u.protocol!=='https:'||u.origin!==raw||u.username||u.password)throw denied();approved.add(u.origin)}
  for(const raw of developmentOrigins){const u=new URL(raw);if(u.protocol!=='http:'||u.origin!==raw||!['127.0.0.1','[::1]'].includes(u.hostname))throw denied();local.add(u.origin)}
  return {async prepare(raw,{headers={},body}={}){
    let url;try{url=new URL(raw)}catch{throw denied()}
    const isLocal=local.has(url.origin);
    if(url.username||url.password||url.hash||url.search||(!approved.has(url.origin)&&!isLocal)
      ||(!isLocal&&url.protocol!=='https:')||(!Buffer.isBuffer(body)&&typeof body!=='string'))throw denied();
    if(Buffer.byteLength(body)>8192)throw denied();
    const host=url.hostname.replace(/^\[|\]$/g,'');let answers;
    let timer;
    try{answers=isIP(host)?[{address:host,family:isIP(host)}]:await Promise.race([
      lookup(host,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(problem('NOTIFICATION_PREPARE_RETRY')),timeoutMs);timer.unref()})]);}
    catch{throw problem('NOTIFICATION_PREPARE_RETRY')}finally{clearTimeout(timer)}
    if(!Array.isArray(answers)||answers.length<1||answers.length>32)throw denied();
    for(const a of answers){if(isIP(a.address)!==a.family||addressKind(a.address)!==(isLocal?'loopback':'public'))throw denied()}
    const destination=answers[0];
    // The closure retains the checked address. DNS is never consulted again,
    // while Host/SNI and certificate validation retain the original hostname.
    return {async send(signal){
      const timeout=AbortSignal.timeout(timeoutMs),stop=signal?AbortSignal.any([signal,timeout]):timeout;
      return new Promise(resolve=>{
        let settled=false;const finish=value=>{if(!settled){settled=true;resolve(value)}};
        let req;try{
          req=(isLocal?http:https).request(url,{method:'POST',headers,signal:stop,agent:false,rejectUnauthorized:true,
            lookup:(_host,options,callback)=>options?.all?callback(null,[destination]):callback(null,destination.address,destination.family)},res=>{
            const chunks=[];let size=0;
            res.on('data',chunk=>{size+=chunk.length;if(size>maxResponseBytes){res.destroy();finish({transportUnknown:true});return}chunks.push(chunk)});
            res.on('error',()=>finish({transportUnknown:true}));
            res.on('end',()=>finish({status:res.statusCode,body:Buffer.concat(chunks).toString('utf8'),retryAfter:res.headers['retry-after']}));
          });
          req.on('error',()=>finish({transportUnknown:true}));req.end(body);
        }catch{req?.destroy();finish({transportUnknown:true})}
      });
    }};
  }};
}
function payload(value){
  if(!value||typeof value.title!=='string'||typeof value.body!=='string'||typeof value.action_url!=='string'
    ||!/^\/[a-zA-Z0-9/?=&_-]{1,300}$/.test(value.action_url)||!/^[-a-f0-9]{36}$/.test(value.event_id??'')
    ||Buffer.byteLength(value.title+value.body)>2500)throw denied();
  return value;
}
export function createTelegramBookingAdapter({botToken,appOrigin,apiOrigin='https://api.telegram.org',transport=createNotificationTransport()}={}){
  if(typeof botToken!=='string'||!/^\d{4,20}:[A-Za-z0-9_-]{20,100}$/.test(botToken))throw problem('BOOKING_TELEGRAM_UNCONFIGURED');
  let origin;try{origin=new URL(appOrigin)}catch{throw problem('BOOKING_TELEGRAM_UNCONFIGURED')}
  if(origin.origin!==appOrigin||origin.protocol!=='https:'||origin.username||origin.password)throw problem('BOOKING_TELEGRAM_UNCONFIGURED');
  if(apiOrigin!=='https://api.telegram.org'&&!/^http:\/\/(?:127\.0\.0\.1|\[::1\]):\d+$/.test(apiOrigin))throw denied();
  return {channel:'telegram',configurationId:digest('telegram:'+botToken.split(':')[0]),async prepare(destination,value){
    const data=payload(value),chat=destination?.chat_id;
    if(typeof chat!=='string'||!/^-[1-9]\d{1,19}$/.test(chat))throw denied();
    const request=await transport.prepare(apiOrigin+'/bot'+botToken+'/sendMessage',{headers:{'content-type':'application/json'},
      body:JSON.stringify({chat_id:chat,text:data.title+'\n'+data.body+'\n'+appOrigin+data.action_url,disable_web_page_preview:true})});
    return {async send(signal){
      const res=await request.send(signal);if(res.transportUnknown)return unknown();let json;
      try{json=JSON.parse(res.body)}catch{return unknown(res.status)}
      if(res.status===200&&json?.ok===true&&Number.isSafeInteger(json.result?.message_id)&&json.result.message_id>0
        &&String(json.result.chat?.id)===chat)return {outcome:'accepted',httpStatus:200,messageId:String(json.result.message_id),retrySeconds:0};
      if(json?.ok===false&&Number.isInteger(json.error_code)&&res.status===json.error_code){
        if(res.status===429){const seconds=json.parameters?.retry_after;
          return negative(429,Number.isInteger(seconds)&&seconds>=0?Math.min(3600,seconds):30)}
        if(res.status>=400&&res.status<500&&res.status!==408)return negative(res.status);
      }
      return unknown(res.status);
    }};
  }};
}
export function createWebPushBookingAdapter({publicKey,privateKey,subject,transport=createNotificationTransport()}={}){
  try{
    const pair=createECDH('prime256v1');pair.setPrivateKey(Buffer.from(privateKey,'base64url'));
    if(pair.getPublicKey().toString('base64url')!==publicKey||typeof subject!=='string'||!/^mailto:[^\s@]+@[^\s@]+$/.test(subject))throw new Error();
  }catch{throw problem('BOOKING_PUSH_UNCONFIGURED')}
  return {channel:'push',configurationId:digest('push:'+publicKey),async prepare(destination,value){
    const data=payload(value);let details;
    try{details=webPush.generateRequestDetails({endpoint:destination.endpoint,keys:{p256dh:destination.p256dh,auth:destination.auth}},
      JSON.stringify({title:data.title,body:data.body,icon:'/icon-192x192.png',tag:'booking-notification:'+data.event_id,notification_type:data.notification_type,
        data:{url:data.action_url,type:data.notification_type,eventId:data.event_id}}),
      {vapidDetails:{subject,publicKey,privateKey},TTL:300,urgency:'high',contentEncoding:'aes128gcm',
        topic:createHash('sha256').update(data.event_id).digest('base64url').slice(0,32)});
    }catch{throw denied()}
    const request=await transport.prepare(details.endpoint,{headers:details.headers,body:details.body});
    return {async send(signal){
      const res=await request.send(signal);if(res.transportUnknown)return unknown();
      if(res.status===201)return {outcome:'accepted',httpStatus:201,messageId:null,retrySeconds:0};
      if(res.status===429){const seconds=Number(res.retryAfter);return negative(429,Number.isInteger(seconds)&&seconds>=0?Math.min(3600,seconds):30)}
      if(res.status>=400&&res.status<500&&res.status!==408)return negative(res.status);
      return unknown(res.status);
    }};
  }};
}
