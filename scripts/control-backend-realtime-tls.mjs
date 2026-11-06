import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {checkManagedRealtimePlan} from './control-backend-realtime-plan.mjs';

// Only the owned disposable backend harness calls this setup. No serving DB,
// Internet provider, published port or reusable deployment secret is involved.
export async function configureRealtimeTlsFixture({state,bundle,privateRun}){
  const pki=join(state.root,'tls-private'),client=join(state.root,'tls-client-ca');
  await mkdir(pki);await mkdir(client);
  const certScript=`set -eu
cd /certs
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 2 -subj /CN=RoomQC-Owned-Fixture-CA
openssl req -x509 -newkey rsa:2048 -nodes -keyout wrong-ca.key -out wrong-ca.crt -days 2 -subj /CN=RoomQC-Wrong-Fixture-CA
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj /CN=db
printf 'subjectAltName=DNS:db\nextendedKeyUsage=serverAuth\n' > server.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 2 -extfile server.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out expired.crt -days 0 -extfile server.ext
openssl x509 -req -in server.csr -CA wrong-ca.crt -CAkey wrong-ca.key -CAcreateserial -out untrusted.crt -days 2 -extfile server.ext
`;
  const labels=['--label','roomqc.control-backend-test='+state.run,'--label','com.docker.compose.project='+state.projectId];
  await privateRun('docker',['run','--rm','--name',state.projectId+'-tls-certificates',...labels,'--user','0:0','--read-only',
    '--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--mount','type=bind,source='+pki+',target=/certs',
    '--entrypoint','sh',state.realtimeBootstrapBuild.imageId,'-c',certScript],{timeout:60000});
  for(const file of ['ca.crt','wrong-ca.crt'])await writeFile(join(client,file),await readFile(join(pki,file)),{flag:'wx',mode:0o444});
  const volume=state.projectId+'-tls-certs';
  await privateRun('docker',['volume','create',...labels,volume]);
  await privateRun('docker',['run','--rm','--name',state.projectId+'-tls-install',...labels,'--user','0:0','--read-only',
    '--network','none','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','FOWNER','--security-opt','no-new-privileges',
    '--mount','type=bind,source='+pki+',target=/certs,readonly','--mount','type=volume,source='+volume+',target=/installed',
    '--entrypoint','sh',state.realtimeBootstrapBuild.imageId,'-c',
    'set -eu; cp /certs/server.key /certs/server.crt /certs/expired.crt /certs/untrusted.crt /installed/; cp /installed/server.crt /installed/active.crt; chmod 0600 /installed/server.key; chmod 0444 /installed/*.crt; chown -R 100:101 /installed; chmod 0700 /installed']);
  bundle.volumes['tls-certs']={name:volume};
  bundle.services.db.volumes.push({type:'volume',source:'tls-certs',target:'/etc/roomqc-tls',read_only:true});
  bundle.services.db.command.push('-c','ssl=on','-c','ssl_cert_file=/etc/roomqc-tls/active.crt','-c','ssl_key_file=/etc/roomqc-tls/server.key');
  bundle.services.db.networks.default.aliases.push('wrong-db');
  Object.assign(bundle.services.realtime.environment,{DB_SSL:'true',DB_SSL_CA_CERT:'/run/roomqc-ca/ca.crt'});
  bundle.services.realtime.volumes=[{type:'bind',source:client,target:'/run/roomqc-ca',read_only:true}];
  state.realtimeTlsFixture={configured:true,certificateVolume:volume,clientCaDirectory:client,
    noPrivateKeyInRealtimeMount:true,localFixturesOnly:true};
}

export async function runRealtimeTlsDiagnostic({repository,state,bundle,privateRun,runClient,sql,input,compose,save,captureSchemaChanges,progress}){
  const checks=[],check=(name,value)=>{if(!value)progress({phase:'tls-control-failed',control:name});assert.ok(value,name);checks.push(name);progress({phase:'tls-control-passed',control:name})};
  const container=state.projectId+'-realtime',query=source=>sql(state,source,{databaseRole:'supabase_admin'});
  const rpc=async source=>(await privateRun('docker',['exec','--env','ERL_FLAGS=+S 1:1',container,'/app/bin/realtime','rpc',source],{timeout:60000})).stdout;
  const waitFor=async(fn,label)=>{const until=Date.now()+60000;while(Date.now()<until){try{const value=await fn();if(value)return value}catch{}await new Promise(r=>setTimeout(r,250))}throw Error(label)};
  const publicationAbsent=await query("SELECT NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime_messages_publication');");
  check('owned broadcast publication absent at entry',publicationAbsent==='t');
  const exercise=async()=>JSON.parse((await runClient("import {runRealtimeResourceChecks} from '/control/testing/realtime-resource-native.mjs'; console.log(JSON.stringify(await runRealtimeResourceChecks(JSON.parse(process.env.ROOMQC_REALTIME_INPUT))));",
    {ROOMQC_REALTIME_INPUT:JSON.stringify({...input,phase:'default',connectPool:1,subscriberPool:4,expectTls:true})},180000,{memory:'256m'})).stdout);
  const first=await exercise();progress({phase:'actual-tls-data-path',checks:first.checks});
  check('metadata and discovery use TLS in actual server sessions',await query("SELECT count(*)>0 AND bool_and(s.ssl) FROM pg_stat_activity a JOIN pg_stat_ssl s ON s.pid=a.pid WHERE a.application_name='supabase_mt_realtime' OR a.application_name LIKE 'cluster_node_%';")==='t');
  const probe=async({host='db',ca='/run/roomqc-ca/ca.crt',ssl=true,metadata=false}={})=>{
    const source=`Process.flag(:trap_exit, true)
original = System.get_env("DB_SSL_CA_CERT")
System.put_env("DB_SSL_CA_CERT", ${JSON.stringify(ca)})
result = try do
  settings = Realtime.Repo.get_by!(Realtime.Api.Tenant, external_id: "realtime-dev") |> Realtime.Repo.preload(:extensions)
  extension = Enum.find(settings.extensions, &(&1.type == "postgres_cdc_rls"))
  plain = Realtime.Database.decrypt_settings(extension.settings) |> Map.put("db_host", ${JSON.stringify(host)}) |> Map.put("ssl_enforced", ${ssl})
  {:ok, pid} = if ${metadata} do
    opts = Application.fetch_env!(:realtime, Realtime.Repo)
    tls_opts = Keyword.fetch!(opts, :ssl) |> Keyword.put(:cacertfile, ${JSON.stringify(ca)}) |> Keyword.put(:reuse_sessions, false)
      |> Keyword.put(:server_name_indication, String.to_charlist(${JSON.stringify(host)}))
    opts |> Keyword.put(:ssl, tls_opts) |> Keyword.put(:hostname, ${JSON.stringify(host)})
      |> Keyword.put(:pool_size, 1) |> Keyword.put(:max_restarts, 0) |> Keyword.put(:backoff_type, :stop)
      |> Keyword.put(:timeout, 2000) |> Keyword.put(:connect_timeout, 2000)
      |> Keyword.put(:parameters, [application_name: "roomqc_tls_metadata_probe"])
      |> Postgrex.start_link()
  else
    {:ok, config} = Realtime.Database.from_plaintext_settings(plain, "roomqc_tls_probe", :stop)
    config = %{config | pool_size: 1, max_restarts: 0, ssl: Keyword.put(config.ssl, :reuse_sessions, false)}
    Realtime.Database.connect_db(config, timeout: 2000, connect_timeout: 2000)
  end
  value = try do
    case Postgrex.query(pid, "SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()", [], timeout: 3000) do
      {:ok, %{rows: [[true]]}} -> "verified_tls"
      _ -> "denied"
    end
  catch :exit, _ -> "denied" end
  if Process.alive?(pid), do: GenServer.stop(pid, :normal, 3000)
  value
rescue
  e -> if Exception.message(e) in ["ROOMQC_REALTIME_TLS_CA_REQUIRED", "ROOMQC_REALTIME_TLS_REQUIRED"], do: "denied", else: reraise(e, __STACKTRACE__)
catch :exit, _ -> "denied"
after
  if original, do: System.put_env("DB_SSL_CA_CERT", original), else: System.delete_env("DB_SSL_CA_CERT")
end
IO.puts("ROOMQC_TLS_PROBE " <> result)`;
    const output=await rpc(source),lines=output.split(/\r?\n/).filter(line=>line.startsWith('ROOMQC_TLS_PROBE '));
    assert.equal(lines.length,1);return lines[0].slice('ROOMQC_TLS_PROBE '.length);
  };
  check('tenant direct connection verifies trusted CA and hostname',await probe()==='verified_tls');
  check('tenant connection rejects wrong hostname on the same server',await probe({host:'wrong-db'})==='denied');
  check('tenant connection rejects wrong CA',await probe({ca:'/run/roomqc-ca/wrong-ca.crt'})==='denied');
  check('tenant connection rejects missing CA without plaintext fallback',await probe({ca:'/run/roomqc-ca/missing.crt'})==='denied');
  check('tenant cannot disable TLS while deployment uses TLS',await probe({ssl:false})==='denied');
  check('metadata connection verifies trusted CA and hostname',await probe({metadata:true})==='verified_tls');
  check('metadata connection rejects wrong hostname',await probe({metadata:true,host:'wrong-db'})==='denied');
  check('metadata connection rejects wrong CA',await probe({metadata:true,ca:'/run/roomqc-ca/wrong-ca.crt'})==='denied');
  // Exercise the product URL builder and the actual bundled pgdelta executable.
  // Snapshot reads the catalog only; it never runs dashboard schema apply/dry-run.
  // The URI and raw process output stay inside the owned Realtime container.
  const pgdeltaProbe=async({host='db',ca='/run/roomqc-ca/ca.crt',ssl=true}={})=>{
    const source=`original = System.get_env("DB_SSL_CA_CERT")
System.put_env("DB_SSL_CA_CERT", ${JSON.stringify(ca)})
result = try do
  tenant = Realtime.Repo.get_by!(Realtime.Api.Tenant, external_id: "realtime-dev") |> Realtime.Repo.preload(:extensions)
  extension = Enum.find(tenant.extensions, &(&1.type == "postgres_cdc_rls"))
  plain = Realtime.Database.decrypt_settings(extension.settings) |> Map.put("db_host", ${JSON.stringify(host)}) |> Map.put("ssl_enforced", ${ssl})
  {:ok, db} = Realtime.Database.from_plaintext_settings(plain, "roomqc_tls_pgdelta", :stop)
  url = RealtimeWeb.Dashboard.TenantMigrations.postgres_url(db)
  if !String.contains?(url, "sslmode=verify-full") or !String.contains?(url, "sslrootcert="), do: raise("PGDELTA_VERIFIED_URL_REQUIRED")
  dir = Path.join(System.tmp_dir!(), "roomqc-owned-pgdelta-" <> Integer.to_string(System.unique_integer([:positive])))
  File.mkdir!(dir)
  try do
    path = Path.join(dir, "snapshot.json")
    {output, status} = System.cmd("/usr/local/bin/pgdelta", ["snapshot", "--source", url, "--out", path], stderr_to_stdout: true)
    cond do
      status == 0 and File.regular?(path) -> "verified_tls"
      status != 0 and Regex.match?(~r/certificate has expired|CERT_HAS_EXPIRED/i, output) -> "denied_expired"
      status != 0 and Regex.match?(~r/ERR_TLS_CERT_ALTNAME_INVALID|does not match certificate|not in the cert.*list/i, output) -> "denied_hostname"
      status != 0 and Regex.match?(~r/SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT|self.signed certificate|unable to verify.*certificate|unable to get.*issuer/i, output) -> "denied_ca"
      true -> "unexpected_failure"
    end
  after
    File.rm_rf!(dir)
  end
rescue
  e -> if Exception.message(e) in ["ROOMQC_REALTIME_TLS_CA_REQUIRED", "ROOMQC_REALTIME_TLS_REQUIRED"], do: "denied_config", else: reraise(e, __STACKTRACE__)
after
  if original, do: System.put_env("DB_SSL_CA_CERT", original), else: System.delete_env("DB_SSL_CA_CERT")
end
IO.puts("ROOMQC_TLS_PGDELTA " <> result)`;
    const lines=(await rpc(source)).split(/\r?\n/).filter(line=>line.startsWith('ROOMQC_TLS_PGDELTA '));
    assert.equal(lines.length,1);return lines[0].slice('ROOMQC_TLS_PGDELTA '.length);
  };
  check('actual pgdelta snapshot verifies trusted CA and hostname',await pgdeltaProbe()==='verified_tls');
  check('actual pgdelta rejects wrong hostname on same server',await pgdeltaProbe({host:'wrong-db'})==='denied_hostname');
  check('actual pgdelta rejects wrong CA',await pgdeltaProbe({ca:'/run/roomqc-ca/wrong-ca.crt'})==='denied_ca');
  check('dashboard URL rejects missing CA',await pgdeltaProbe({ca:'/run/roomqc-ca/missing.crt'})==='denied_config');
  check('dashboard URL rejects plaintext under TLS deployment',await pgdeltaProbe({ssl:false})==='denied_config');
  const booleanPolicy=await rpc(`original = System.get_env("DB_SSL")
try do
  for flag <- ["true", "1", " TRUE ", " 1 "] do
    System.put_env("DB_SSL", flag)
    for callback <- [fn -> Realtime.Database.tenant_ssl_options(%{"ssl_enforced" => false}) end,
                    fn -> RealtimeWeb.Dashboard.TenantMigrations.postgres_url(%Realtime.Database{ssl: false}) end] do
      denied = try do
        callback.()
        false
      rescue
        e -> Exception.message(e) == "ROOMQC_REALTIME_TLS_REQUIRED"
      end
      if !denied, do: raise("ROOMQC_TLS_POLICY_DOWNGRADE")
    end
  end
  IO.puts("ROOMQC_TLS_BOOLEAN_POLICY verified")
after
  if original, do: System.put_env("DB_SSL", original), else: System.delete_env("DB_SSL")
end`);
  check('tenant and dashboard enforce every supported true boolean spelling',booleanPolicy.split(/\r?\n/).includes('ROOMQC_TLS_BOOLEAN_POLICY verified'));
  // The DB reads one constant path (command-line settings outrank ALTER SYSTEM).
  // Replace bytes atomically in the owned volume, reload and prove the actual
  // handshake fingerprint changed before interpreting certificate denials.
  const fingerprints=[];
  const changeCertificate=async file=>{
    assert.ok(['server.crt','expired.crt','untrusted.crt'].includes(file));
    const installed=await privateRun('docker',['run','--rm','--name',state.projectId+'-tls-swap',
      '--label','roomqc.control-backend-test='+state.run,'--label','com.docker.compose.project='+state.projectId,
      '--user','100:101','--read-only','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges',
      '--mount','type=volume,source='+state.realtimeTlsFixture.certificateVolume+',target=/installed',
      '--entrypoint','sh',state.realtimeBootstrapBuild.imageId,'-c',
      'set -eu; cp /installed/'+file+' /installed/active.next; chmod 0444 /installed/active.next; mv /installed/active.next /installed/active.crt; openssl x509 -in /installed/'+file+' -noout -fingerprint -sha256']);
    const expected=installed.stdout.match(/=([A-F0-9:]{95})/)?.[1];assert.ok(expected);
    await query('SELECT pg_reload_conf();');
    await waitFor(async()=>{
      const observed=(await privateRun('docker',['exec',container,'sh','-c',
        'openssl s_client -starttls postgres -connect db:5432 -servername db -showcerts </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256'],{timeout:10000})).stdout.match(/=([A-F0-9:]{95})/)?.[1];
      return observed===expected;
    },'actual TLS server certificate must match installed '+file);
    fingerprints.push({certificate:file,sha256:expected.replaceAll(':','').toLowerCase(),actualHandshakeVerified:true});
    check('actual server handshake uses '+file,true);
  };
  await changeCertificate('expired.crt');check('tenant rejects expired server certificate',await probe()==='denied');
  check('metadata rejects expired server certificate',await probe({metadata:true})==='denied');
  check('actual pgdelta rejects expired server certificate',await pgdeltaProbe()==='denied_expired');
  await changeCertificate('untrusted.crt');check('tenant rejects server certificate signed by untrusted root',await probe()==='denied');
  check('metadata rejects server certificate signed by untrusted root',await probe({metadata:true})==='denied');
  check('actual pgdelta rejects untrusted server certificate',await pgdeltaProbe()==='denied_ca');
  await changeCertificate('server.crt');check('tenant recovers after valid certificate is restored',await probe()==='verified_tls');
  check('metadata recovers after valid certificate is restored',await probe({metadata:true})==='verified_tls');
  check('actual pgdelta recovers after valid certificate is restored',await pgdeltaProbe()==='verified_tls');
  const oneShot=async overrides=>{
    try{await privateRun('docker',[...compose,'run','--rm','--no-deps','--name',state.projectId+'-tls-negative',
      '--entrypoint','/app/bin/realtime',...Object.entries(overrides).flatMap(([k,v])=>['--env',k+'='+v]),'realtime','eval','IO.puts("ROOMQC_TLS_METADATA_READY")'],{timeout:30000});return false}
    catch(error){const output=(error.result?.stdout??'')+'\n'+(error.result?.stderr??'');
      return Number.isInteger(error.result?.code)&&error.result.code!==0&&output.includes('ROOMQC_REALTIME_TLS_CA_REQUIRED')
        &&!output.includes('ROOMQC_TLS_METADATA_READY')}
  };
  check('metadata startup rejects missing CA',await oneShot({DB_SSL_CA_CERT:'/run/roomqc-ca/missing.crt'}));
  // Actual connection errors rather than startup config are exercised with the
  // metadata Repo, whose config is separately resolved from the tenant path.
  const metadata=await rpc(`opts = Application.fetch_env!(:realtime, Realtime.Repo)
ssl = Keyword.fetch!(opts, :ssl)
IO.puts("ROOMQC_TLS_METADATA " <> Jason.encode!(%{verify: Keyword.fetch!(ssl, :verify) == :verify_peer,
hostname: Keyword.fetch!(ssl, :server_name_indication) == ~c"db",
discovery: Enum.all?(Application.fetch_env!(:libcluster, :topologies), fn {_key, t} -> Keyword.get(t[:config], :ssl) == ssl end)}))`);
  const metadataLine=metadata.split(/\r?\n/).find(line=>line.startsWith('ROOMQC_TLS_METADATA '));
  const metadataConfig=JSON.parse(metadataLine.slice('ROOMQC_TLS_METADATA '.length));
  check('loaded metadata config verifies peer and actual hostname',metadataConfig.verify&&metadataConfig.hostname);
  check('loaded discovery config retains peer verification',metadataConfig.discovery);
  const managedPlan=await checkManagedRealtimePlan({repository,state,bundle,privateRun});
  check('managed PLAN retains actual read-only CA configuration',managedPlan.plan.services[0].inventory.tenantTlsPeerVerificationSupportedByReviewedPath===true);
  const delta=await captureSchemaChanges();await privateRun('docker',['stop','--time','20',container],{timeout:60000});
  await query('DROP PUBLICATION supabase_realtime_messages_publication;');
  check('certificate changes retain constant configured active path',await query('SHOW ssl_cert_file;')==='/etc/roomqc-tls/active.crt');
  check('certificate switching creates no ALTER SYSTEM override',await query("SELECT count(*) FROM pg_file_settings WHERE sourcefile LIKE '%postgresql.auto.conf' AND name='ssl_cert_file';")==='0');
  return {verified:true,checks:checks.length+first.checks+managedPlan.checks,cases:checks,dataPath:first,metadataConfig,managedPlan,
    trustedCaHostnameVerified:true,wrongCaDenied:true,wrongHostnameDenied:true,expiredCertificateDenied:true,untrustedServerDenied:true,
    downgradeDenied:true,supportedBooleanDowngradeDenied:true,certificateRecovery:true,actualPostgresTlsSessions:true,
    actualPgdeltaSnapshotVerified:true,certificateFingerprints:fingerprints,noServingDatabaseMutation:true,
    schemaChangesBeforeFixtureCleanup:delta,fixtureCleanupVerified:true,wholeStackCapacityVerified:false,productAcceptance:false};
}
