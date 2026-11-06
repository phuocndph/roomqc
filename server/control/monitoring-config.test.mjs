import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {prometheusConfiguration,nodeMountInclude,validateExporterSecrets,validateExporterSecretAccess} from './monitoring-config.mjs';
import {renderMonitoring} from '../../scripts/render-monitoring-config.mjs';

const target={clusterId:'fixture-a',hostId:'fixture-host',environment:'local',measurementScope:'docker-desktop-vm',dbConnectionBudget:100,
  dataMounts:[{id:'data',mountpoint:'/data/roomqc.v1(test)',device:'/dev/sda1',fstype:'ext4'}]};
test('monitor config fixes scrape jobs, labels, cardinality and time budgets; mount names are literal regex values',()=>{
  const config=prometheusConfiguration(target,{intervalSeconds:5});
  assert.equal(config.scrape_configs.length,2);
  for(const job of config.scrape_configs){
    assert.equal(job.sample_limit,5000);assert.equal(job.honor_labels,false);assert.equal(job.scrape_timeout,'4s');
    assert.deepEqual(job.static_configs[0].labels,{cluster_id:'fixture-a',host_id:'fixture-host',environment:'local'});
  }
  const regex=new RegExp(nodeMountInclude(target));assert.equal(regex.test('/data/roomqc.v1(test)'),true);assert.equal(regex.test('/data/roomqcXv1test'),false);
  for(const intervalSeconds of [0,4,31,15.5])assert.throws(()=>prometheusConfiguration(target,{intervalSeconds}),{code:'INVALID_MONITORING_CONFIG'});
  assert.throws(()=>prometheusConfiguration({...target,environment:'staging',measurementScope:'linux-host'},{intervalSeconds:5}),{code:'INVALID_MONITORING_CONFIG'});
});
test('exporter credentials require a dedicated role, no embedded secret, bounded connection timeout and verified production TLS',()=>{
  const password='a'.repeat(64),uri='db:5432/monitor_fixture?sslmode=disable&connect_timeout=3';
  assert.equal(validateExporterSecrets({uri,user:'roomqc_monitor',password,environment:'local'}).sslmode,'disable');
  const production='db.internal:5432/roomqc?sslmode=verify-full&sslrootcert=/etc/roomqc/tls/ca.pem&connect_timeout=3';
  assert.equal(validateExporterSecrets({uri:production,user:'roomqc_monitor',password,environment:'production'}).host,'db.internal');
  for(const change of [{user:'postgres'},{password:'short'},{environment:'production'},
    {uri:'user:secret@'+uri},{uri:'169.254.169.254/postgres?sslmode=disable&connect_timeout=3'},
    {uri:'db/postgres?sslmode=disable'},{uri:uri+'&options=arbitrary'},{uri:uri+'&sslmode=require'},
    {uri:'db/postgres?sslmode=disable&connect_timeout=30'},
    {uri:production.replace('/etc/roomqc/tls/ca.pem','/etc/roomqc/tls/../private.pem')}]){
    assert.throws(()=>validateExporterSecrets({uri,user:'roomqc_monitor',password,environment:'local',...change}),{code:'INVALID_MONITORING_CONFIG'});
  }
});
test('Unix exporter secret files are readable by the container identity without exposing them to unrelated groups or all users',()=>{
  for(const input of [{uid:65534,gid:65534,mode:0o600},{uid:0,gid:65534,mode:0o640}])validateExporterSecretAccess(input);
  for(const input of [{uid:65534,gid:65534,mode:0},{uid:0,gid:0,mode:0o600},
    {uid:65534,gid:1,mode:0o640},{uid:0,gid:65534,mode:0o644},{uid:65534,gid:65534,mode:0o660}]){
    assert.throws(()=>validateExporterSecretAccess(input),{code:'INVALID_MONITORING_CONFIG'});
  }
});
test('monitoring compose is private, pinned, resource bounded and non-root; exporter has no business credentials or default query collectors',async()=>{
  const compose=JSON.parse(await readFile(new URL('../../deploy/monitoring/compose.yml',import.meta.url),'utf8'));
  assert.equal(compose.networks.metrics.internal,true);assert.equal(compose.networks.backend.external,true);
  for(const service of Object.values(compose.services)){
    assert.match(service.image,/@sha256:[a-f0-9]{64}$/);assert.equal(service.user,'65534:65534');assert.equal(service.read_only,true);
    assert.deepEqual(service.cap_drop,['ALL']);assert.ok(service.security_opt.includes('no-new-privileges:true'));
    assert.equal(service.ports,undefined);assert.equal(service.privileged,undefined);assert.equal(service.network_mode,undefined);assert.equal(service.pid,undefined);
    assert.ok(service.mem_limit&&service.cpus&&service.pids_limit);assert.ok(service.logging.options['max-size']);
    assert.equal(JSON.stringify(service.volumes).includes('docker.sock'),false);
  }
  const node=compose.services['node-exporter'];
  assert.deepEqual(node.volumes,[{type:'bind',source:'/',target:'/host',read_only:true,bind:{create_host_path:false}}]);
  assert.ok(node.tmpfs.some(mount=>mount.startsWith('/host/run:ro,')));
  const exporter=compose.services['postgres-exporter'];
  assert.deepEqual(Object.keys(exporter.environment).sort(),['DATA_SOURCE_PASS_FILE','DATA_SOURCE_URI_FILE','DATA_SOURCE_USER_FILE']);
  assert.ok(exporter.command.includes('--disable-default-metrics'));assert.ok(exporter.command.includes('--no-collector.stat_database'));
  assert.ok(exporter.command.includes('--no-collector.wal'));assert.equal(exporter.command.filter(flag=>flag.startsWith('--no-collector.')).length,20);
});
test('renderer has a non-mutating help path and rejects invalid input before opening files',async()=>{
  const help=execFileSync(process.execPath,['scripts/render-monitoring-config.mjs','--help'],{encoding:'utf8'});assert.match(help,/Render only/);
  await assert.rejects(()=>renderMonitoring({project:'existing-unrelated-project',network:'test'}),{code:'INVALID_MONITORING_INPUT'});
  await assert.rejects(()=>renderMonitoring({project:'roomqc-monitor-fixture',network:'network',target:'relative'}),{code:'INVALID_MONITORING_INPUT'});
});
