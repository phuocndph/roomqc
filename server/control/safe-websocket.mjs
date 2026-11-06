import {lookup as dnsLookup} from 'node:dns/promises';
import WebSocket from 'ws';
import {resolveDestination} from './safe-http.mjs';
import {ControlError} from './errors.mjs';

const denied=()=>new ControlError(503,'CLUSTER_DESTINATION_DENIED','Đích kết nối cụm chưa được duyệt hoặc không an toàn.');
// Resolve once under the same inventory policy as HTTP. The socket keeps the
// original hostname for Host/TLS but cannot perform a second DNS lookup.
export function createClusterSocket(config,{lookup=dnsLookup,maxPayload=16384,handshakeTimeout=5000}={}){
  return async function clusterSocket(rawUrl,{headers={},signal=AbortSignal.timeout(5000)}={},cluster){
    const url=new URL(rawUrl);if(!['ws:','wss:'].includes(url.protocol))throw denied();
    const origin=new URL(url);origin.protocol=url.protocol==='wss:'?'https:':'http:';
    const destination=await resolveDestination(config,cluster,origin,{lookup,signal});signal.throwIfAborted();
    return new Promise((resolve,reject)=>{
      let socket,settled=false;
      const removeAbort=()=>signal.removeEventListener('abort',abort);
      const abort=()=>{if(!settled){settled=true;reject(signal.reason)}socket?.terminate()};
      try{socket=new WebSocket(url,{headers,followRedirects:false,rejectUnauthorized:true,perMessageDeflate:false,
        maxPayload,handshakeTimeout,lookup:(hostname,options,callback)=>{
          if(options?.all)callback(null,[destination]);else callback(null,destination.address,destination.family);
        }});
      }catch(error){reject(error);return}
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
      socket.once('open',()=>{if(!settled){settled=true;resolve(socket)}});
      socket.on('error',error=>{if(!settled){settled=true;reject(error)}});
      socket.once('close',()=>{removeAbort();if(!settled){settled=true;reject(new ControlError(503,'CLUSTER_SOCKET_CLOSED','Kết nối kiểm tra đã đóng.'))}});
      socket.once('unexpected-response',(_request,response)=>{
        response.destroy();socket.terminate();if(!settled){settled=true;reject(denied())}
      });
    });
  };
}
