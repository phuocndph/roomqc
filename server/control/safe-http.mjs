import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import http from 'node:http';
import https from 'node:https';
import {ControlError} from './errors.mjs';

const denied=()=>new ControlError(503,'CLUSTER_DESTINATION_DENIED','Đích kết nối cụm chưa được duyệt hoặc không an toàn.');
export function normalizeAddress(address){
  if(typeof address!=='string'||address.includes('%')||!isIP(address))throw denied();
  if(isIP(address)===4)return address;
  const normalized=new URL('http://['+address+']/').hostname.slice(1,-1);
  if(normalized.startsWith('::ffff:')){
    const parts=normalized.slice(7).split(':');
    if(parts.length===2){const high=parseInt(parts[0],16),low=parseInt(parts[1],16);return [high>>8,high&255,low>>8,low&255].join('.')}
  }
  return normalized;
}
export function addressKind(address){
  const normalized=normalizeAddress(address);
  if(isIP(normalized)===4){
    const [a,b,c]=normalized.split('.').map(Number);
    if(a===127)return 'loopback';
    if(a===0||a>=224||(a===169&&b===254)||(a===100&&b>=64&&b<=127)
      ||(a===192&&b===0)||(a===192&&b===88&&c===99)||(a===198&&[18,19].includes(b))
      ||(a===198&&b===51&&c===100)||(a===203&&b===0&&c===113)||normalized==='168.63.129.16')return 'forbidden';
    if(a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168))return 'private';
    return 'public';
  }
  if(normalized==='::1')return 'loopback';
  if(normalized==='fd00:ec2::254'||normalized==='fd20:ce::254')return 'forbidden';
  if(/^f[cd]/.test(normalized))return 'private';
  // Permit global unicast only; exclude link-local, multicast, NAT64, Teredo,
  // 6to4 and documentation/reserved destinations even when explicitly listed.
  if(!/^[23]/.test(normalized)||/^2002:/.test(normalized)||/^2001:(?:0:|db8:)/.test(normalized)
    ||normalized.startsWith('2001::')||/^3fff:/.test(normalized))return 'forbidden';
  return 'public';
}
async function abortable(promise,signal){
  if(!signal)return promise;
  signal.throwIfAborted();let listener;
  const aborted=new Promise((resolve,reject)=>{listener=()=>reject(signal.reason);signal.addEventListener('abort',listener,{once:true})});
  try{return await Promise.race([promise,aborted])}finally{signal.removeEventListener('abort',listener)}
}
export async function resolveDestination(config,cluster,url,{lookup=dnsLookup,signal}={}){
  const inventory=config.inventory?.get(cluster.inventoryRef??cluster.id);
  const origin=inventory?.internalUrl||inventory?.url;
  if(!inventory||url.origin!==origin||cluster.url!==inventory.url||(cluster.internalUrl||null)!==(inventory.internalUrl||null)
    ||url.username||url.password||url.hash)throw denied();
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  const local=config.allowLocal===true&&['localhost','127.0.0.1','::1','host.docker.internal'].includes(hostname);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local))throw denied();
  const approved=new Set((inventory.approvedAddresses??[]).map(normalizeAddress));
  const answers=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await abortable(lookup(hostname,{all:true,verbatim:true}),signal);
  if(!Array.isArray(answers)||!answers.length||answers.length>64)throw denied();
  for(const answer of answers){
    if(isIP(answer.address)!==answer.family)throw denied();
    const kind=addressKind(answer.address),normalized=normalizeAddress(answer.address);
    const allowed=kind==='public'||(kind==='private'&&approved.has(normalized))
      ||(local&&(kind==='loopback'||(hostname==='host.docker.internal'&&kind==='private')));
    if(kind==='forbidden'||!allowed||(approved.size&&!approved.has(normalized))
      ||(local&&hostname!=='host.docker.internal'&&kind!=='loopback'))throw denied();
  }
  signal?.throwIfAborted();return answers[0];
}
export function createClusterFetch(config,{lookup=dnsLookup,maxResponseBytes=1024*1024}={}){
  return async function clusterFetch(rawUrl,init,cluster){
    const url=new URL(rawUrl),signal=init.signal??AbortSignal.timeout(20000);
    const destination=await resolveDestination(config,cluster,url,{lookup,signal});
    if(!['GET','POST'].includes(init.method)||init.redirect!=='error')throw denied();
    return new Promise((resolve,reject)=>{
      const request=(url.protocol==='https:'?https:http).request(url,{
        method:init.method,headers:init.headers,signal,agent:false,rejectUnauthorized:true,
        // This lookup returns only the address already verified above. The URL
        // hostname remains unchanged for Host, TLS SNI and certificate checks.
        lookup:(hostname,options,callback)=>{
          if(options?.all)callback(null,[destination]);else callback(null,destination.address,destination.family);
        },
      },response=>{
        if(response.statusCode>=300&&response.statusCode<400){response.destroy();reject(denied());return}
        const chunks=[];let size=0;
        response.on('data',chunk=>{
          size+=chunk.length;
          if(size>maxResponseBytes){response.destroy();reject(new ControlError(503,'CLUSTER_RESPONSE_TOO_LARGE','Phản hồi cụm vượt giới hạn.'));return}
          chunks.push(chunk);
        });
        response.on('error',reject);
        response.on('end',()=>{
          const body=Buffer.concat(chunks);
          resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode,
            arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength),
            json:async()=>JSON.parse(body.toString('utf8'))});
        });
      });
      request.on('error',reject);
      request.end(init.body);
    });
  };
}
