import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {addressKind,normalizeAddress,resolveDestination,createClusterFetch} from './safe-http.mjs';
function configuration(url='https://backend.example.invalid',extra={}){
  const cluster={id:'cluster-a',url,...extra};
  return {cluster,config:{allowLocal:false,inventory:new Map([['cluster-a',{...cluster}]])}};
}
test('destination policy normalizes mapped IPv6 and rejects metadata, link-local, multicast, transition and reserved addresses',()=>{
  assert.equal(normalizeAddress('::ffff:127.0.0.1'),'127.0.0.1');
  assert.equal(addressKind('::ffff:169.254.169.254'),'forbidden');
  for(const ip of ['169.254.169.254','0.0.0.0','224.0.0.1','100.100.100.200','168.63.129.16','192.0.2.1',
    '::','fe80::1','ff02::1','fd00:ec2::254','fd20:ce::254','64:ff9b::a00:1','2002:a00:1::','2001::1','2001:db8::1']){
    assert.equal(addressKind(ip),'forbidden',ip);
  }
  for(const ip of ['10.0.0.1','172.16.2.1','192.168.1.2','fd12::1'])assert.equal(addressKind(ip),'private');
  for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(addressKind(ip),'public');
  for(const ip of ['invalid','fe80::1%eth0','127.1'])assert.throws(()=>normalizeAddress(ip));
});
test('DNS policy checks every answer, exact inventory origin and explicitly approved private destinations',async()=>{
  const {config,cluster}=configuration(),url=new URL(cluster.url);
  const resolve=answers=>resolveDestination(config,cluster,url,{lookup:async()=>answers.map(address=>({address,family:address.includes(':')?6:4}))});
  assert.equal((await resolve(['8.8.8.8'])).address,'8.8.8.8');
  for(const ips of [['8.8.8.8','127.0.0.1'],['8.8.8.8','169.254.169.254'],['10.0.0.1'],['::ffff:127.0.0.1']]){
    await assert.rejects(()=>resolve(ips),{code:'CLUSTER_DESTINATION_DENIED'});
  }
  config.inventory.get(cluster.id).approvedAddresses=['10.0.0.1'];
  assert.equal((await resolve(['10.0.0.1'])).address,'10.0.0.1');
  await assert.rejects(()=>resolve(['8.8.8.8']),{code:'CLUSTER_DESTINATION_DENIED'});
  await assert.rejects(()=>resolveDestination(config,cluster,new URL('https://unapproved.example.invalid')),{code:'CLUSTER_DESTINATION_DENIED'});
  config.inventory.get(cluster.id).approvedAddresses=['169.254.169.254'];
  await assert.rejects(()=>resolve(['169.254.169.254']),{code:'CLUSTER_DESTINATION_DENIED'});
});
test('real HTTP connection pins verified DNS once, preserves hostname, rejects redirects and bounds response size',async()=>{
  const requests=[];
  const server=createServer((req,res)=>{
    requests.push({path:req.url,host:req.headers.host});
    if(req.url==='/redirect'){res.writeHead(302,{Location:'http://169.254.169.254/latest/meta-data'});res.end();return}
    if(req.url==='/oversized'){res.end('x'.repeat(5000));return}
    res.end(JSON.stringify({ok:true}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const {config,cluster}=configuration('http://localhost:'+server.address().port);config.allowLocal=true;
  let lookups=0;
  const fetcher=createClusterFetch(config,{lookup:async()=>{lookups++;return [{address:lookups===1?'127.0.0.1':'169.254.169.254',family:4}]},maxResponseBytes:4096});
  const options={method:'GET',redirect:'error'};
  try{
    const response=await fetcher(cluster.url+'/json',options,cluster);assert.deepEqual(await response.json(),{ok:true});
    assert.equal(lookups,1);assert.equal(requests[0].host,'localhost:'+server.address().port);
    await assert.rejects(()=>fetcher(cluster.url+'/json',options,cluster),{code:'CLUSTER_DESTINATION_DENIED'});
    assert.equal(requests.length,1,'Rebound DNS must not make another connection');
    const pinned=createClusterFetch(config,{lookup:async()=>[{address:'127.0.0.1',family:4}],maxResponseBytes:4096});
    await assert.rejects(()=>pinned(cluster.url+'/redirect',options,cluster),{code:'CLUSTER_DESTINATION_DENIED'});
    await assert.rejects(()=>pinned(cluster.url+'/oversized',options,cluster),{code:'CLUSTER_RESPONSE_TOO_LARGE'});
    assert.deepEqual(requests.map(r=>r.path),['/json','/redirect','/oversized']);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
test('DNS resolution observes the request deadline before any network connection',async()=>{
  const {config,cluster}=configuration();
  const timer=setTimeout(()=>{},1000);
  try{
    await assert.rejects(()=>resolveDestination(config,cluster,new URL(cluster.url),{
      lookup:()=>new Promise(()=>{}),signal:AbortSignal.timeout(20)}),{name:'TimeoutError'});
  }finally{clearTimeout(timer)}
});
