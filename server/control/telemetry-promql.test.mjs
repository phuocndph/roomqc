import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,realpath,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {randomBytes} from 'node:crypto';
import {queryTemplates} from './telemetry-source.mjs';

const image='prom/prometheus:v3.2.1@sha256:6927e0919a144aa7616fd0137d4816816d42f6b816de3af269ab065250859a62';
const enabled=process.env.ROOMQC_CONTROL_DB_TEST==='true';
const target={clusterId:'fixture-a',hostId:'fixture-host',environment:'local',dbConnectionBudget:100,measurementScope:'docker-desktop-vm',
  dataMounts:[{id:'database',mountpoint:'/data/postgres',device:'/dev/sda1',fstype:'ext4'},
    {id:'storage',mountpoint:'/data/objects',device:'/dev/sdb1',fstype:'xfs'}]};

test('real Prometheus engine: every required source timestamp participates despite colliding labels; CPU rate and disk templates evaluate',
  {skip:!enabled,timeout:120000},async()=>{
    const run=randomBytes(8).toString('hex'),name='roomqc-promql-test-'+run;
    const directory=await mkdtemp(join(tmpdir(),'roomqc-promql-'));
    const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:90000,maxBuffer:2_000_000,stdio:['ignore','pipe','pipe']});
    try{
      await writeFile(join(directory,'owner'),run);
      const queries=queryTemplates(target),series=[];
      const host='job="roomqc-node",host_id="fixture-host",cluster_id="fixture-a",environment="local"';
      series.push({series:`node_cpu_seconds_total{${host},mode="idle",cpu="0"}`,values:'0+21x4'});
      for(const [key,query]of Object.entries(queries)){
        if(['cpuUsedPercent','sourceObservedAt'].includes(key))continue;
        const value=key.includes('readonly')?0:key.includes('inode')?100:key==='dbConnectionsUsed'?10:1024**3;
        series.push({series:query,values:`${value}+0x4`});
      }
      // At t=120s all sources are fresh except one last sampled at t=60s.
      // Memory/filesystem metrics intentionally share labels after timestamp().
      const tests=series.map((_,oldIndex)=>({name:'old-source-'+oldIndex,interval:'30s',
        input_series:series.map((item,index)=>index===oldIndex?{...item,values:item.values.replace('x4','x2')+' _ _'}:item),
        promql_expr_test:[{expr:queries.sourceObservedAt,eval_time:'2m',exp_samples:[{labels:'{}',value:60}]}]}));
      tests.push({name:'all-fresh-and-fixed-templates',interval:'30s',input_series:series,promql_expr_test:[
        {expr:queries.sourceObservedAt,eval_time:'2m',exp_samples:[{labels:'{}',value:120}]},
        {expr:`abs((${queries.cpuUsedPercent}) - 30) < bool 0.000001`,eval_time:'2m',exp_samples:[{labels:'{}',value:1}]},
        {expr:`sum(${queries['disk:storage:freeBytes']})`,eval_time:'2m',exp_samples:[{labels:'{}',value:1024**3}]}]});
      await writeFile(join(directory,'cases.yml'),JSON.stringify({rule_files:[],evaluation_interval:'30s',tests}));
      const result=docker(['run','--rm','--name',name,'--label',`roomqc.monitor-test=${run}`,'--read-only','--network','none',
        '--memory','256m','--cpus','1','--pids-limit','64','--tmpfs','/tmp:rw,nosuid,size=16m',
        '--mount',`type=bind,source=${directory},target=/fixtures,readonly`,'--entrypoint','/bin/promtool',image,'test','rules','/fixtures/cases.yml']);
      assert.match(result,/SUCCESS/);
    }finally{
      const owned=docker(['ps','-aq','--filter',`name=^/${name}$`]).trim();
      if(owned){const info=JSON.parse(docker(['inspect',owned]))[0];assert.equal(info.Config.Labels['roomqc.monitor-test'],run);docker(['rm','-f',owned])}
      const resolved=await realpath(directory),parent=await realpath(tmpdir());
      assert.equal(dirname(resolved),parent);assert.ok(basename(resolved).startsWith('roomqc-promql-'));
      assert.equal(await readFile(join(resolved,'owner'),'utf8'),run);await rm(resolved,{recursive:true});
    }
  });
