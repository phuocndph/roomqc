import {ControlError} from './errors.mjs';

const unavailable=()=>Object.assign(new ControlError(503,'CONTROL_OVERLOADED','Dịch vụ đang bận. Giữ nguyên yêu cầu và kiểm tra lại sau.'),{retryAfter:1});
const cancelled=()=>new ControlError(503,'CONTROL_REQUEST_CANCELLED','Yêu cầu đã ngắt trước khi được xử lý.');

/** Bound waiting memory as well as active work. A disconnected active request
 * retains its slot until its real work finishes, including an unknown commit. */
export function createRequestGate({maxActive=16,maxQueued=32,queueTimeoutMs=1000}={}){
  if(!Number.isSafeInteger(maxActive)||maxActive<1||maxActive>256||!Number.isSafeInteger(maxQueued)||maxQueued<0||maxQueued>1024
    ||!Number.isSafeInteger(queueTimeoutMs)||queueTimeoutMs<1||queueTimeoutMs>10000)throw new Error('INVALID_REQUEST_BUDGET');
  let active=0,closed=false;const queue=[];
  const snapshot=()=>({active,queued:queue.length,maxActive,maxQueued,closed});
  function grant(){
    active++;let released=false;
    return ()=>{if(released)return;released=true;active--;drain()};
  }
  function drain(){
    while(!closed&&active<maxActive&&queue.length){
      const entry=queue.shift();entry.cleanup();
      if(entry.signal?.aborted){entry.reject(cancelled());continue}
      entry.resolve(grant());
    }
  }
  return {
    snapshot,
    acquire({signal}={}){
      if(signal?.aborted)return Promise.reject(cancelled());
      if(closed)return Promise.reject(unavailable());
      if(active<maxActive)return Promise.resolve(grant());
      if(queue.length>=maxQueued)return Promise.reject(unavailable());
      return new Promise((resolve,reject)=>{
        let timer;
        const remove=error=>{const index=queue.indexOf(entry);if(index<0)return;queue.splice(index,1);entry.cleanup();reject(error)};
        const abort=()=>remove(cancelled());
        const entry={signal,resolve,reject,cleanup:()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)}};
        queue.push(entry);timer=setTimeout(()=>remove(unavailable()),queueTimeoutMs);
        signal?.addEventListener('abort',abort,{once:true});
        // Also cover signals aborted synchronously during custom listener setup.
        if(signal?.aborted)abort();
      });
    },
    close(){
      closed=true;
      for(const entry of queue.splice(0)){entry.cleanup();entry.reject(unavailable())}
    },
  };
}
