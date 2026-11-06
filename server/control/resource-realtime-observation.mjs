// Run with the pinned release's `rpc`, against its already running node. Never
// `eval`/start a second application, and never serialize decrypted credentials.
export function realtimeResourceSnapshotSource(){return String.raw`
import Ecto.Query
repo = Realtime.Repo.Replica.replica()
hash = fn value -> :crypto.hash(:sha256, Jason.encode!(value)) |> Base.encode16(case: :lower) end
tenants = repo.all(from(t in Realtime.Api.Tenant, limit: 257)) |> repo.preload(:extensions)
if length(tenants) > 256, do: raise("ROOMQC_REALTIME_TENANT_INVENTORY_LIMIT")
safe_pool = fn value -> if is_integer(value) and value > 0 and value <= 10000, do: value, else: "invalid" end
entries = Enum.flat_map(tenants, fn tenant ->
  Enum.map(tenant.extensions, fn extension ->
    if extension.type != "postgres_cdc_rls", do: raise("ROOMQC_REALTIME_EXTENSION_UNREVIEWED")
    stored = extension.settings
    settings = Realtime.Database.decrypt_settings(stored)
    tls = Realtime.Database.default_ssl_param(settings)
    tls_mode = if tls do
      if function_exported?(Realtime.Database, :tenant_ssl_options, 1), do: "verify-peer", else: "verify-none"
    else
      "disabled"
    end
    %{tenantSha256: hash.(tenant.external_id), targetSha256: hash.([
      settings["db_host"], settings["db_port"], settings["db_name"], settings["db_user"], tls_mode]),
      dbPool: safe_pool.(stored["db_pool"] || 1),
      subscriberPool: safe_pool.(Map.get(stored, "subcriber_pool_size", 4) || 1),
      guardSubscriberPool: safe_pool.(stored["subs_pool_size"] || 1),
      sslEnforced: tls, persistedSettingsSha256: hash.(stored)}
  end)
end) |> Enum.sort_by(& &1.tenantSha256)
IO.puts("ROOMQC_REALTIME_INVENTORY " <> Jason.encode!(%{schemaVersion: 1,
  tenantCount: length(tenants), extensions: entries,
  metadata: %{configuredPoolMax: repo.config()[:pool_size], runningRepo: Process.whereis(repo) != nil,
    primary: repo == Realtime.Repo, loadedPoolSizeIndependentlyVerified: false},
  healthUsesExistingConnectPool: true}))
`}

export function parseRealtimeResourceSnapshot(output){
  const fail=()=>{throw Object.assign(new Error('RESOURCE_REALTIME_OBSERVATION_INVALID'),{code:'RESOURCE_REALTIME_OBSERVATION_INVALID'})};
  if(typeof output!=='string'||output.length>256*1024)fail();
  const lines=output.split(/\r?\n/).filter(s=>s.startsWith('ROOMQC_REALTIME_INVENTORY '));
  if(lines.length!==1)fail();
  let raw;try{raw=JSON.parse(lines[0].slice('ROOMQC_REALTIME_INVENTORY '.length))}catch{fail()}
  const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
  const pool=v=>Number.isSafeInteger(v)&&v>=1&&v<=10000,hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  if(!exact(raw,['schemaVersion','tenantCount','extensions','metadata','healthUsesExistingConnectPool'])||raw.schemaVersion!==1
    ||!Number.isInteger(raw.tenantCount)||raw.tenantCount<0||raw.tenantCount>256||!Array.isArray(raw.extensions)||raw.extensions.length!==raw.tenantCount
    ||!exact(raw.metadata,['configuredPoolMax','runningRepo','primary','loadedPoolSizeIndependentlyVerified'])
    ||!pool(raw.metadata.configuredPoolMax)||raw.metadata.runningRepo!==true||typeof raw.metadata.primary!=='boolean'
    ||raw.metadata.loadedPoolSizeIndependentlyVerified!==false||raw.healthUsesExistingConnectPool!==true)fail();
  const ids=new Set();
  for(const e of raw.extensions){
    if(!exact(e,['tenantSha256','targetSha256','dbPool','subscriberPool','guardSubscriberPool','sslEnforced','persistedSettingsSha256'])
      ||!hash(e.tenantSha256)||ids.has(e.tenantSha256)||!hash(e.targetSha256)||!hash(e.persistedSettingsSha256)
      ||!pool(e.dbPool)||!pool(e.subscriberPool)||!pool(e.guardSubscriberPool)||typeof e.sslEnforced!=='boolean')fail();
    ids.add(e.tenantSha256);
  }
  return raw;
}
