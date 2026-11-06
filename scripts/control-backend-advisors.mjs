import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';

export function summarizeBackendAdvisors(value){
  const rows=Array.isArray(value)?value:value?.results??value?.lints??value?.data??value?.result??null;
  assert.ok(Array.isArray(rows),'Expected structured native CLI advisor output');
  const grouped=new Map();
  for(const row of rows){assert.equal(typeof row.name,'string');assert.ok(['INFO','WARN','ERROR'].includes(row.level));
    const key=row.level+':'+row.name;grouped.set(key,(grouped.get(key)??0)+1)}
  return {total:rows.length,issues:[...grouped].sort().map(([key,count])=>({key,count}))};
}

// Temporary host loopback tunnel -> owned DB's loopback socket. No Docker port
// publication or changes to the existing business project are needed.
export async function runBackendAdvisors({state,password,cli,run}){
  assert.ok(isAbsolute(cli));assert.equal(state.projectId,'roomqc-probe-'+state.run);
  const streams=new Set(),children=new Set();
  const server=createServer(socket=>{
    streams.add(socket);const child=spawn('docker',['exec','-i',state.projectId+'-db','nc','127.0.0.1','5432'],{
      windowsHide:true,stdio:['pipe','pipe','pipe']});children.add(child);
    child.stderr.resume();child.stdin.on('error',()=>{});child.stdout.on('error',()=>socket.destroy());
    child.once('error',()=>socket.destroy());child.once('close',()=>{children.delete(child);socket.destroy()});
    socket.once('error',()=>child.kill());socket.once('close',()=>{streams.delete(socket);child.kill()});
    socket.pipe(child.stdin);child.stdout.pipe(socket);
  });
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
    const address=server.address(),url=new URL('postgresql://postgres@127.0.0.1:'+address.port+'/postgres?sslmode=disable');url.password=password;
    const version=(await run(cli,['--version'])).stdout.trim();assert.match(version,/^2\.(?:121|122)\.0$/);
    const result=await run(cli,['db','advisors','--db-url',url.href,'--type','all','--level','info','--fail-on','none','--output-format','json'],{timeout:60000});
    await writeFile(join(state.root,'advisors-private.json'),result.stdout,{mode:0o600});
    return {cliVersion:version,...summarizeBackendAdvisors(JSON.parse(result.stdout))};
  }finally{
    for(const socket of streams)socket.destroy();for(const child of children)child.kill();
    await new Promise(resolve=>server.close(resolve));
  }
}
