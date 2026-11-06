import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath,chmod,chown} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {renderMonitoring} from '../../scripts/render-monitoring-config.mjs';
import {prometheusConfiguration} from './monitoring-config.mjs';
import {PrometheusSource,queryTemplates} from './telemetry-source.mjs';

const enabled=process.env.ROOMQC_CONTROL_DB_TEST==='true';
const root=fileURLToPath(new URL('../../',import.meta.url));
const postgres='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const probes={auth:false,rest:false,storage:false,realtime:false,functions:false};

test('owned real monitoring stack: host-volume mapping, private exporters, least privilege, permission loss, DB outage and password rotation',
  {skip:!enabled,timeout:240000},async t=>{
    const run=randomBytes(6).toString('hex'),project='roomqc-monitor-test-'+run;
    const directory=await mkdtemp(join(tmpdir(),'roomqc-monitor-'));
    const db=project+'-db',network=project+'-backend',volume=project+'-database';
    const label='roomqc.monitor-test',owned={
      containers:[project+'-host-check',db,...['prometheus','node-exporter','postgres-exporter'].map(service=>project+'-'+service+'-1')],
      volumes:[volume,project+'_prometheus-data'],networks:[network,project+'_metrics',project+'_testaccess']};
    let composeArgs,source,target,rendered;
    const docker=(args,input)=>{
      try{return execFileSync('docker',args,{cwd:root,input,encoding:'utf8',timeout:45000,maxBuffer:2_000_000,stdio:['pipe','pipe','pipe']})}
      catch(error){
        const safe=String(error.stderr??'').replaceAll(directory,'[fixture]').replace(/[a-f0-9]{64}/gi,'[digest-or-secret]');
        throw new Error('Owned monitoring fixture Docker operation failed: '+safe.slice(0,2000));
      }
    };
    const inspect=(type,name)=>JSON.parse(docker([type,'inspect',name]))[0];
    const sql=(input,monitor=false)=>docker(['exec','-i',db,...(monitor?
      ['/bin/sh','-c','PGPASSWORD="$(cat /run/monitor-password)" psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -U roomqc_monitor -d monitor_fixture']:
      ['psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','monitor_fixture'])],input);
    const compose=args=>docker([...composeArgs,...args]);
    const waitFor=async(check,timeout=30000)=>{
      const end=Date.now()+timeout;let last;
      while(Date.now()<end){t.signal.throwIfAborted();try{const value=await check();if(value)return value}catch(error){last=error}await delay(500,undefined,{signal:t.signal})}
      throw new Error('Monitoring fixture readiness deadline exceeded'+(last?.code?' ('+last.code+')':''));
    };
    const privateFile=async(path,value)=>{
      await writeFile(path,value,{mode:0o640});
      if(process.platform!=='win32'){await chmod(path,0o640);await chown(path,65534,65534)}
    };
    const helper=command=>docker(['run','--rm','--name',project+'-host-check','--label',label+'='+run,
      '--read-only','--network','none','--user','65534:65534','--cap-drop','ALL','--security-opt','no-new-privileges',
      '--mount','type=bind,source=/,target=/host,readonly','--entrypoint','/bin/sh',postgres,'-c',command]);
    try{
      await writeFile(join(directory,'owner'),run,{mode:0o600});
      if(process.platform==='win32'){
        const account=(process.env.USERDOMAIN?process.env.USERDOMAIN+'\\':'')+process.env.USERNAME;
        execFileSync('icacls',[directory,'/inheritance:r','/grant:r',account+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{stdio:'ignore'});
      }else await chmod(directory,0o700);
      const secrets=join(directory,'secrets'),tls=join(directory,'tls'),output=join(directory,'bundle');
      await mkdir(secrets);await mkdir(tls);
      const password=randomBytes(32).toString('hex');
      await writeFile(join(directory,'init-password'),randomBytes(32).toString('hex'),{mode:0o444});
      await privateFile(join(secrets,'postgres-user'),'roomqc_monitor');
      await privateFile(join(secrets,'postgres-password'),password);
      await privateFile(join(secrets,'postgres-uri'),'fixture-db:5432/monitor_fixture?sslmode=disable&connect_timeout=3');
      docker(['network','create','--internal','--label',label+'='+run,network]);
      docker(['volume','create','--label',label+'='+run,volume]);
      const volumePath=inspect('volume',volume).Mountpoint;
      // Discovery is fixture evidence, never approval of a production inventory.
      const mounts=helper('cat /host/proc/1/mountinfo').trim().split('\n').map(line=>{
        const [left,right]=line.split(' - '),a=left.split(' '),b=right?.split(' ');
        return {mountpoint:a[4]?.replace(/\\040/g,' '),fstype:b?.[0],device:b?.[1]};
      }).filter(m=>['ext4','xfs','btrfs'].includes(m.fstype)&&m.device?.startsWith('/dev/')
        &&(volumePath===m.mountpoint||volumePath.startsWith(m.mountpoint==='/'?'/':m.mountpoint+'/')))
        .sort((a,b)=>b.mountpoint.length-a.mountpoint.length);
      assert.ok(mounts.length,'An actual supported filesystem must contain the fixture volume; never substitute an unrelated mount');
      target={clusterId:'fixture-'+run,hostId:'host-'+run,environment:'local',dbConnectionBudget:80,
        measurementScope:process.platform==='win32'?'docker-desktop-vm':'linux-host',
        dataMounts:[{id:'database',...mounts[0]}]};
      await writeFile(join(directory,'target.json'),JSON.stringify(target),{mode:0o600});
      docker(['run','-d','--name',db,'--label',label+'='+run,'--network',network,'--network-alias','fixture-db',
        '--memory','256m','--cpus','0.5','--pids-limit','128','--env','POSTGRES_DB=monitor_fixture',
        '--env','POSTGRES_PASSWORD_FILE=/run/init-password',
        '--mount',`type=bind,source=${join(directory,'init-password')},target=/run/init-password,readonly`,
        '--mount',`type=bind,source=${join(secrets,'postgres-password')},target=/run/monitor-password,readonly`,
        '--mount',`type=volume,source=${volume},target=/var/lib/postgresql/data`,postgres]);
      await waitFor(()=>sql('SELECT 1;').trim()==='1');
      sql(await readFile(new URL('../../deploy/monitoring/exporter-roles.sql',import.meta.url),'utf8'));
      sql(`ALTER ROLE roomqc_monitor LOGIN PASSWORD '${password}';
        REVOKE CREATE ON SCHEMA public FROM PUBLIC;
        CREATE TABLE public.business_fixture(id integer PRIMARY KEY, value text);
        INSERT INTO public.business_fixture VALUES(1,'synthetic');`);
      assert.equal(sql("SELECT current_user, pg_has_role(current_user,'pg_read_all_stats','USAGE');",true).trim(),'roomqc_monitor|t');
      for(const denied of ['SELECT * FROM public.business_fixture;','INSERT INTO public.business_fixture VALUES(2,\'denied\');',
        'CREATE TABLE public.forbidden(id integer);','ALTER ROLE roomqc_monitor SUPERUSER;'])assert.throws(()=>sql(denied,true));
      assert.equal(sql('SELECT count(*) FROM public.business_fixture;').trim(),'1');
      rendered=await renderMonitoring({target:join(directory,'target.json'),output,secrets,tls,network,project});
      assert.equal(rendered.deployPerformed,false);
      await assert.rejects(()=>renderMonitoring({target:join(directory,'target.json'),output,secrets,tls,network,project}),{code:'EEXIST'});
      // Only the owned test exposes Prometheus, on a random loopback port. Base compose has no ports.
      await writeFile(join(directory,'override.json'),JSON.stringify({services:{prometheus:{ports:['127.0.0.1::9090'],networks:['metrics','testaccess']}},
        networks:{testaccess:{labels:{'roomqc.monitor-stack':project}}}}));
      // Five-second fixture scraping is allowed only for local and uses the production renderer's exact jobs.
      await writeFile(join(output,'prometheus.yml'),JSON.stringify(prometheusConfiguration(target,{intervalSeconds:5})),{mode:0o644});
      composeArgs=['compose','--env-file',join(output,'monitor.env'),'-f',join(root,'deploy/monitoring/compose.yml'),
        '-f',join(directory,'override.json')];
      compose(['up','-d']);
      const prometheus=await waitFor(()=>{
        const info=inspect('container',project+'-prometheus-1');
        return info.State.Running&&info.NetworkSettings.Ports?.['9090/tcp']?.length?info:false;
      });
      const port=prometheus.NetworkSettings.Ports['9090/tcp'][0];assert.equal(port.HostIp,'127.0.0.1');
      const origin='http://127.0.0.1:'+port.HostPort;
      source=new PrometheusSource({url:origin,allowLocal:true});
      const queries=queryTemplates(target);
      const scalar=key=>source.scalar(queries[key],AbortSignal.timeout(5000));
      t.diagnostic('Owned sandbox started; waiting for actual exporter samples (five service probes intentionally remain false).');
      await waitFor(()=>source.collect(target,probes),45000);
      // Observe a real OS window; this does not fast-forward policy warmup or approve admission.
      const cpu=()=>helper("awk '/^cpu / {print}' /host/proc/stat").trim().split(/\s+/).slice(1).map(Number);
      const cpuStart=cpu(),end=Date.now()+62000;
      while(Date.now()<end)await delay(Math.min(1000,end-Date.now()),undefined,{signal:t.signal});
      const cpuEnd=cpu(),total=values=>values.slice(0,8).reduce((sum,value)=>sum+value,0);
      const expectedCpu=100*(1-(cpuEnd[3]-cpuStart[3])/(total(cpuEnd)-total(cpuStart)));
      const sample=await source.collect(target,probes);
      assert.deepEqual(sample.probes,probes);assert.equal(sample.measurementScope,target.measurementScope);
      assert.ok(Math.abs(sample.metrics.cpuUsedPercent-expectedCpu)<=5,'CPU differs from independent OS observation by more than five percentage points');
      const readMemory=()=>Object.fromEntries(helper("awk '/^MemTotal:|^MemAvailable:/ {print $1, $2}' /host/proc/meminfo")
        .trim().split('\n').map(line=>{const [key,kib]=line.split(/\s+/);return [key,Number(kib)*1024]}));
      // Other owned tests can release GBs of VM memory between an exporter scrape
      // and a later OS read. Observe a window containing a new complete scrape;
      // compare to its independent OS range, keeping the original 5% tolerance.
      const memoryWindowStart=Date.now(),memoryObservations=[];
      const memorySample=await waitFor(async()=>{
        memoryObservations.push(readMemory());
        const value=await source.collect(target,probes);
        memoryObservations.push(readMemory());
        return Date.parse(value.observedAt)>=memoryWindowStart?value:false;
      },20000);
      const mem=memoryObservations.at(-1),memoryAvailable=memoryObservations.map(v=>v['MemAvailable:']);
      const minimum=Math.min(...memoryAvailable),maximum=Math.max(...memoryAvailable),tolerance=mem['MemTotal:']*0.05;
      t.diagnostic(JSON.stringify({event:'monitoring_memory_window',observedAt:memorySample.observedAt,
        windowStart:new Date(memoryWindowStart).toISOString(),windowEnd:new Date().toISOString(),
        samples:memoryObservations.length,exporter:memorySample.metrics.memoryAvailableBytes,minimum,maximum,tolerancePercentOfTotal:5}));
      assert.ok(memoryObservations.every(v=>v['MemTotal:']===mem['MemTotal:']));
      assert.equal(memorySample.metrics.memoryTotalBytes,mem['MemTotal:']);
      assert.ok(memorySample.metrics.memoryAvailableBytes>=minimum-tolerance&&memorySample.metrics.memoryAvailableBytes<=maximum+tolerance,
        'Memory differs from the independent OS observation window by more than five percent of total RAM');
      const node=project+'-node-exporter-1';
      const fs=docker(['exec',node,'/bin/sh','-c',"stat -f -c '%S %b %a %c %d' "+posix.join('/host',mounts[0].mountpoint)])
        .trim().split(/\s+/).map(Number);
      assert.equal(sample.dataDisks[0].totalBytes,fs[0]*fs[1]);
      assert.ok(Math.abs(sample.dataDisks[0].freeBytes-fs[0]*fs[2])<128*1024**2);
      assert.ok(Math.abs(sample.dataDisks[0].inodeFreePercent-fs[4]/fs[3]*100)<0.1);
      const connections=Number(sql("SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend';").trim());
      assert.ok(Math.abs(sample.metrics.dbConnectionsUsed-(connections-1))<=1);
      t.diagnostic(JSON.stringify({event:'monitoring_fixture_comparison',scope:sample.measurementScope,
        cpuPercent:{exporter:sample.metrics.cpuUsedPercent,os:expectedCpu,tolerancePoints:5},
        memoryBytes:{exporterTotal:memorySample.metrics.memoryTotalBytes,osTotal:mem['MemTotal:'],
          exporterAvailable:memorySample.metrics.memoryAvailableBytes,osAvailable:mem['MemAvailable:'],
          osMinimum:minimum,osMaximum:maximum,tolerancePercentOfTotal:5},
        filesystem:{id:sample.dataDisks[0].id,exporterTotal:sample.dataDisks[0].totalBytes,osTotal:fs[0]*fs[1],
          exporterAvailable:sample.dataDisks[0].freeBytes,osAvailable:fs[0]*fs[2],toleranceBytes:128*1024**2},
        connections:{exporter:sample.metrics.dbConnectionsUsed,osExcludingObserver:connections-1,tolerance:1},
        fiveServiceProbesVerified:false,admissionOpened:false}));
      for(const name of [db,node,project+'-postgres-exporter-1'])assert.deepEqual(inspect('container',name).HostConfig.PortBindings,{});
      for(const service of ['prometheus','node-exporter','postgres-exporter']){
        const info=inspect('container',project+'-'+service+'-1');
        assert.equal(info.Config.User,'65534:65534');assert.equal(info.HostConfig.ReadonlyRootfs,true);
        assert.equal(info.HostConfig.Privileged,false);assert.ok(info.HostConfig.CapDrop.includes('ALL'));
        assert.equal(info.Config.Labels['roomqc.monitor-stack'],project);
      }
      docker(['exec',node,'/bin/sh','-c','test ! -e /host/run/docker.sock && test ! -e /host/var/run/docker.sock && test ! -e /var/run/docker.sock']);
      const logResult=spawnSync('docker',['logs',project+'-postgres-exporter-1'],{encoding:'utf8',timeout:10000,maxBuffer:2_000_000});
      assert.equal(logResult.status,0);
      const exporterLogs=String(logResult.stdout)+String(logResult.stderr);assert.equal(exporterLogs.includes(password),false);
      t.diagnostic('OS/volume/DB comparison and isolation passed; testing permission loss and database outage.');
      sql('REVOKE pg_read_all_stats FROM roomqc_monitor;');
      await waitFor(async()=>await scalar('monitorPermission')===0);
      await assert.rejects(()=>source.collect(target,probes),{code:'TELEMETRY_SOURCE_INVALID'});
      sql('GRANT pg_read_all_stats TO roomqc_monitor;');
      await waitFor(()=>source.collect(target,probes));
      docker(['stop','--time','3',db]);
      await waitFor(async()=>await scalar('databaseUp')===0);
      await assert.rejects(()=>source.collect(target,probes),{code:'TELEMETRY_SOURCE_INVALID'});
      docker(['start',db]);await waitFor(()=>sql('SELECT 1;').trim()==='1');
      await waitFor(()=>source.collect(target,probes));
      const rotated=randomBytes(32).toString('hex');sql(`ALTER ROLE roomqc_monitor PASSWORD '${rotated}';`);
      // Force a new connection so a cached authenticated connection cannot hide the old credential.
      sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='roomqc_monitor';");
      await waitFor(async()=>await scalar('databaseUp')===0);
      await assert.rejects(()=>source.collect(target,probes),{code:'TELEMETRY_SOURCE_INVALID'});
      await privateFile(join(secrets,'postgres-password'),rotated);
      compose(['up','-d','--force-recreate','postgres-exporter']);
      await waitFor(()=>source.collect(target,probes));
      assert.equal(sql('SELECT count(*) FROM public.business_fixture;').trim(),'1');
      const rotatedLogs=spawnSync('docker',['logs',project+'-postgres-exporter-1'],{encoding:'utf8',timeout:10000,maxBuffer:2_000_000});
      assert.equal(rotatedLogs.status,0);
      assert.equal((String(rotatedLogs.stdout)+String(rotatedLogs.stderr)).includes(rotated),false);
      t.diagnostic('Permission-loss, DB-down, old-credential rejection and explicit credential rotation passed; no admission was opened.');
    }catch(error){
      for(const service of ['prometheus','node-exporter']){
        const name=project+'-'+service+'-1';
        if(!docker(['ps','-aq','--filter','name=^/'+name+'$']).trim())continue;
        const info=inspect('container',name);
        const logs=spawnSync('docker',['logs','--tail','12',name],{encoding:'utf8',timeout:10000,maxBuffer:100000});
        const safe=(String(logs.stdout)+String(logs.stderr)).replaceAll(directory,'[fixture]').replace(/[a-f0-9]{64}/gi,'[digest-or-secret]');
        t.diagnostic(service+' state='+info.State.Status+' exit='+info.State.ExitCode+' '+safe);
      }
      throw error;
    }finally{
      // Do not use down -v: validate every exact object before removing only this fixture.
      for(const name of owned.containers.reverse()){
        const ids=docker(['ps','-aq','--filter','name=^/'+name+'$']).trim();if(!ids)continue;
        const info=inspect('container',name);
        assert.ok(info.Config.Labels[label]===run||info.Config.Labels['roomqc.monitor-stack']===project);
        docker(['rm','-f',name]);
      }
      for(const name of owned.networks.reverse()){
        const found=docker(['network','ls','-q','--filter','name=^'+name+'$']).trim();if(!found)continue;
        const info=inspect('network',name);assert.ok(info.Labels[label]===run||info.Labels['roomqc.monitor-stack']===project);
        docker(['network','rm',name]);
      }
      for(const name of owned.volumes.reverse()){
        const found=docker(['volume','ls','-q','--filter','name=^'+name+'$']).trim();if(!found)continue;
        const info=inspect('volume',name);assert.ok(info.Labels[label]===run||info.Labels['roomqc.monitor-stack']===project);
        docker(['volume','rm',name]);
      }
      const resolved=await realpath(directory),parent=await realpath(tmpdir());
      assert.equal(dirname(resolved),parent);assert.ok(basename(resolved).startsWith('roomqc-monitor-'));
      assert.equal(await readFile(join(resolved,'owner'),'utf8'),run);await rm(resolved,{recursive:true});
    }
  });
