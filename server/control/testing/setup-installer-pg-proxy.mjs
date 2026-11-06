// Private native harness only: delay/drop ORIGINAL PostgreSQL protocol frames.
// Never synthesize a server success, error, transaction state or query result.
import assert from 'node:assert/strict';
import {createServer,connect} from 'node:net';

export async function createInstallerPgProxy({schema='roomqc_setup_admin'}={}){
 assert.ok(['roomqc_setup_admin','roomqc_summary_admin'].includes(schema));
 const sockets=new Set(),timers=new Set(),connections=[];let next=null,nextConnect=null,delay=null;
 const server=createServer(down=>{
  const connection={connectedAt:Date.now(),closedAt:null,lastQueryStartedAt:null,queryPending:false,errors:[]};connections.push(connection);
  const handshake=nextConnect;nextConnect=null;
  const up=connect({host:'db',port:5432});sockets.add(down);sockets.add(up);
  let front=Buffer.alloc(0),back=Buffer.alloc(0),startup=true,action=null,held=[],response=[],queryStarted=0;
  let handshakeHeld=[],closed=false;const localTimers=new Set();
  if(handshake){handshake.connectedAt=connection.connectedAt;handshake.release=()=>{
   handshake.released=true;if(!down.destroyed)down.write(Buffer.concat(handshakeHeld));handshakeHeld=[];
  }}
  const close=()=>{
   if(closed)return;closed=true;connection.closedAt=Date.now();
   for(const timer of localTimers){clearTimeout(timer);timers.delete(timer)}localTimers.clear();
   if(delay)delay.disconnects.push({at:Date.now(),queryPending:connection.queryPending,
    queryAgeMs:connection.queryPending&&queryStarted?Date.now()-queryStarted:null});
   up.destroy();down.destroy();sockets.delete(up);sockets.delete(down);
  };
  up.on('error',close);down.on('error',close);up.on('close',close);down.on('close',close);
  const schedule=(frames,plan)=>{
   const receivedAt=Date.now(),startedAt=queryStarted,bytes=Buffer.concat(frames),entry={serverElapsedMs:startedAt?receivedAt-startedAt:null,
    scheduledDelayMs:plan.ms,forwardElapsedMs:null,clientQueryElapsedMs:null,forwarded:false};plan.responses.push(entry);
   const timer=setTimeout(()=>{timers.delete(timer);localTimers.delete(timer);
    if(!down.destroyed){down.write(bytes);entry.forwardElapsedMs=Date.now()-receivedAt;
     entry.clientQueryElapsedMs=startedAt?Date.now()-startedAt:null;entry.forwarded=true;connection.queryPending=false;
    }
   },plan.ms);timers.add(timer);localTimers.add(timer);
  };
  down.on('data',chunk=>{
   front=Buffer.concat([front,chunk]);
   while(front.length>=5){
    const size=startup?front.readInt32BE(0):front.readInt32BE(1)+1;
    if(size<5||size>1024*1024){close();return}if(front.length<size)break;
    const frame=front.subarray(0,size);front=front.subarray(size);if(startup){startup=false;continue}
    let sql='';if(frame[0]===80){const zero=frame.indexOf(0,5);sql=frame.toString('utf8',zero+1,frame.indexOf(0,zero+1))}
    if(frame[0]===81)sql=frame.toString('utf8',5,frame.length-1);
    if(sql){queryStarted=Date.now();connection.lastQueryStartedAt=queryStarted;connection.queryPending=true;
     if(next&&sql.startsWith('SELECT '+schema+'.'+next.operation+'(')&&(!next.when||next.when())){action=next;next=null}
    }
   }
   up.write(chunk);
  });
  up.on('data',chunk=>{
   back=Buffer.concat([back,chunk]);
   while(back.length>=5){
    const size=back.readInt32BE(1)+1;if(size<5||size>1024*1024){close();return}if(back.length<size)break;
    const frame=back.subarray(0,size);back=back.subarray(size);
    // Retain only server SQLSTATE and elapsed time, never SQL/error text.
    if(frame[0]===69){for(let at=5;at<frame.length-1;){
     const end=frame.indexOf(0,at+1);if(end<0)break;
     if(frame[at]===67){const code=frame.toString('ascii',at+1,end);
      if(/^[0-9A-Z]{5}$/.test(code))connection.errors.push({code,elapsedMs:queryStarted?Date.now()-queryStarted:null});
     }at=end+1;
    }}
    if(handshake&&!handshake.released){
     handshake.observed=true;handshake.firstFrameType=String.fromCharCode(frame[0]);handshakeHeld.push(frame);continue;
    }
    if(action){held.push(frame);if(frame[0]===90){
     const observed=action;action=null;observed.observed=true;observed.idle=frame[5]===73;observed.observedAt=Date.now();
     if(observed.mode==='drop'){held=[];close()}
     else if(observed.mode==='delay-after-commit'){
      assert.equal(observed.idle,true);delay={ms:observed.delayMs,activatedAt:Date.now(),responses:[],disconnects:[]};observed.plan=delay;
      schedule(held,delay);held=[];
     }else observed.release=()=>{if(!down.destroyed){down.write(Buffer.concat(held));connection.queryPending=false}held=[]};
    }}else if(delay){response.push(frame);if(frame[0]===90){schedule(response,delay);response=[]}}
    else{down.write(frame);if(frame[0]===90)connection.queryPending=false}
   }
  });
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {port:server.address().port,connections,
  arm(operation,mode,options={}){assert.equal(next,null);assert.ok(['hold','drop','delay-after-commit'].includes(mode));
   if(mode==='delay-after-commit')assert.ok(options.delayMs>=500&&options.delayMs<=2000);
   next={operation,mode,...options,observed:false};return next;
  },
  holdNextHandshake(){assert.equal(nextConnect,null);nextConnect={observed:false,released:false};return nextConnect},
  reset(){next=null;nextConnect=null;delay=null},
  async close(){for(const timer of timers)clearTimeout(timer);timers.clear();for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r))}
 };
}
