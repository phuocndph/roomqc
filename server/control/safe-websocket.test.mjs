import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {WebSocketServer} from 'ws';
import {createClusterSocket} from './safe-websocket.mjs';

test('WebSocket uses the verified DNS address once, preserves Host and rejects rebinding/mixed answers',async()=>{
  const server=createServer(),ws=new WebSocketServer({server});const seen=[];
  ws.on('connection',(socket,request)=>{seen.push(request.headers.host);socket.on('message',data=>socket.send(data))});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const cluster={id:'fixture-a',url:'http://localhost:'+server.address().port};
  const config={allowLocal:true,inventory:new Map([[cluster.id,cluster]])};let lookups=0;
  const connect=createClusterSocket(config,{lookup:async()=>[{address:++lookups===1?'127.0.0.1':'169.254.169.254',family:4}]});
  const url=cluster.url.replace('http:','ws:')+'/canary';let client;
  try{
    client=await connect(url,{},cluster);const echo=once(client,'message');client.send('nonce');assert.equal((await echo)[0].toString(),'nonce');
    assert.equal(lookups,1);assert.deepEqual(seen,['localhost:'+server.address().port]);
    await assert.rejects(()=>connect(url,{},cluster),{code:'CLUSTER_DESTINATION_DENIED'});assert.equal(seen.length,1);
    const mixed=createClusterSocket(config,{lookup:async()=>[{address:'127.0.0.1',family:4},{address:'169.254.169.254',family:4}]});
    await assert.rejects(()=>mixed(url,{},cluster),{code:'CLUSTER_DESTINATION_DENIED'});
    await assert.rejects(()=>connect('ws://unapproved.invalid',{},cluster),{code:'CLUSTER_DESTINATION_DENIED'});
  }finally{client?.terminate();for(const value of ws.clients)value.terminate();await new Promise(resolve=>ws.close(resolve));await new Promise(resolve=>server.close(resolve))}
});

test('WebSocket does not follow redirects and abort destroys a pending handshake',async()=>{
  const sockets=new Set(),server=createServer();let requests=0;
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket))});
  server.on('upgrade',(req,socket)=>{requests++;if(req.url==='/redirect')socket.end('HTTP/1.1 302 Found\r\nLocation: ws://169.254.169.254/\r\nContent-Length: 0\r\n\r\n')});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const cluster={id:'fixture-a',url:'http://localhost:'+server.address().port},config={allowLocal:true,inventory:new Map([[cluster.id,cluster]])};
  const connect=createClusterSocket(config,{lookup:async()=>[{address:'127.0.0.1',family:4}],handshakeTimeout:3000});
  try{
    await assert.rejects(()=>connect(cluster.url.replace('http:','ws:')+'/redirect',{},cluster),{code:'CLUSTER_DESTINATION_DENIED'});
    // Wait for the actual server-side pending handshake before aborting. A
    // short elapsed timer could fire before connection under a full-suite load.
    const upgraded=once(server,'upgrade',{signal:AbortSignal.timeout(3000)}),controller=new AbortController();
    const pending=connect(cluster.url.replace('http:','ws:')+'/hang',{signal:controller.signal},cluster);
    const rejected=assert.rejects(pending,{name:'AbortError'});
    const [request,socket]=await upgraded;assert.equal(request.url,'/hang');
    const ended=once(socket,'end',{signal:AbortSignal.timeout(3000)});
    controller.abort(new DOMException('Owned handshake aborted','AbortError'));
    await rejected;await ended;
    assert.equal(requests,2);
  }finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve))}
});
