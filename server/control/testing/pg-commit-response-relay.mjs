// Exact-owned, loopback-only PostgreSQL fixture transport. No password, packet
// bytes or DSN is logged/exported. Hold COMMIT's acknowledgement after the
// primary has committed, so the actual CLI must recover via its durable key.
import {createServer,connect} from 'node:net';
export async function createPgCommitResponseRelay(port){
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('OWNED_PG_PORT_INVALID');
  const connections=new Set();let held,notify;
  const committed=new Promise(resolve=>{notify=resolve});
  const server=createServer(front=>{
    const back=connect({host:'127.0.0.1',port}),entry={front,back,pending:Buffer.alloc(0),holding:false};
    connections.add(entry);
    const close=()=>{front.destroy();back.destroy();connections.delete(entry)};
    front.on('error',close);back.on('error',close);front.on('close',close);back.on('close',close);
    front.on('data',data=>back.write(data));
    back.on('data',data=>{
      entry.pending=Buffer.concat([entry.pending,data]);
      if(entry.pending.length>1024*1024){close();return}
      while(entry.pending.length>=5){
        const size=entry.pending.readInt32BE(1)+1;
        if(size<5||size>1024*1024){close();return}
        if(entry.pending.length<size)return;
        const frame=entry.pending.subarray(0,size);entry.pending=entry.pending.subarray(size);
        if(frame[0]===67&&frame.subarray(5).equals(Buffer.from('COMMIT\0'))){
          entry.holding=true;held=entry;notify();
        }
        if(!entry.holding)front.write(frame);
      }
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  return {port:server.address().port,committed,
    dropHeld:()=>{if(!held)throw Error('OWNED_COMMIT_NOT_HELD');held.front.destroy();held.back.destroy()},
    close:async()=>{for(const entry of connections){entry.front.destroy();entry.back.destroy()}await new Promise(resolve=>server.close(resolve))}};
}
