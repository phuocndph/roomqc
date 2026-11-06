# Runs through the vendor Realtime.Release.seeds/1, before /app/bin/server.
# Never call the destructive vendor seed or print settings/credentials/errors.
defmodule RoomQC.RealtimeBootstrap do
  alias Realtime.{Crypto, Repo, Tenants}
  alias Realtime.Api.{Tenant, FeatureFlag, Extensions}
  import Ecto.Query

  def run do
    config = config()
    Repo.checkout(fn ->
      acquire_bootstrap_lock(System.monotonic_time(:millisecond) + 60_000)
      try do
        {:ok, tenant} = Repo.transaction(fn ->
          tenant = Repo.one(from t in Tenant, where: t.external_id == ^config.name, lock: "FOR UPDATE")
          tenant = if tenant do
            extensions = Repo.all(from e in Extensions, where: e.tenant_external_id == ^config.name, lock: "FOR UPDATE")
            %{tenant | extensions: extensions}
          end
          # Validate identity before installing any DDL or normalizing settings.
          if tenant, do: validate_existing(tenant, config)
          Ecto.Adapters.SQL.query!(Repo, File.read!("/opt/roomqc/pool-guard.sql"), [], log: false)
          preserve_feature_flag()
          if tenant, do: preserve(tenant), else: create(config)
        end, timeout: 60_000, log: false)
        IO.puts("ROOMQC_REALTIME_BOOTSTRAP_COMMITTED")
        # Commit row changes before migrations: the vendor updates migration
        # metadata asynchronously on another connection. Keep the session lock.
        tenant = Repo.preload(tenant, :extensions, force: true)
        Tenants.Cache.invalidate_tenant_cache(config.name)
        result = Tenants.Migrations.run_migrations(tenant)
        if result not in [:ok, :noop], do: raise("ROOMQC_REALTIME_MIGRATION_FAILED")
        if Tenants.Janitor.MaintenanceTask.run(config.name) != :ok,
          do: raise("ROOMQC_REALTIME_MAINTENANCE_FAILED")
      after
        Ecto.Adapters.SQL.query!(Repo, "SELECT pg_advisory_unlock(1380733763, 1431507009)", [], log: false)
      end
    end, timeout: 120_000)
    IO.puts("ROOMQC_REALTIME_BOOTSTRAP_READY")
  end

  defp acquire_bootstrap_lock(deadline, announced \\ false) do
    case Ecto.Adapters.SQL.query!(Repo, "SELECT pg_try_advisory_lock(1380733763, 1431507009)", [], log: false).rows do
      [[true]] -> :ok
      _ ->
        if System.monotonic_time(:millisecond) >= deadline, do: raise("ROOMQC_REALTIME_BOOTSTRAP_LOCK_TIMEOUT")
        if not announced, do: IO.puts("ROOMQC_REALTIME_BOOTSTRAP_WAITING")
        Process.sleep(100)
        acquire_bootstrap_lock(deadline, true)
    end
  end

  defp config do
    name = System.get_env("SELF_HOST_TENANT_NAME", "realtime-dev")
    if not Regex.match?(~r/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/, name), do: raise("ROOMQC_REALTIME_CONFIG_INVALID")
    jwt = required("API_JWT_SECRET")
    if byte_size(jwt) < 32, do: raise("ROOMQC_REALTIME_CONFIG_INVALID")
    ssl = System.get_env("DB_SSL", "false")
    if ssl not in ["true", "false"], do: raise("ROOMQC_REALTIME_CONFIG_INVALID")
    port = System.get_env("SELF_HOST_TENANT_DB_PORT") || required("DB_PORT")
    if not Regex.match?(~r/^[1-9][0-9]{0,4}$/, port) or String.to_integer(port) > 65535,
      do: raise("ROOMQC_REALTIME_CONFIG_INVALID")
    jwks = case System.get_env("API_JWT_JWKS") do
      nil -> nil
      value -> Jason.decode!(value)
    end
    %{name: name, jwt: jwt, jwks: jwks, settings: %{
      "db_name" => System.get_env("DB_NAME", "postgres"),
      "db_host" => System.get_env("SELF_HOST_TENANT_DB_HOST") || required("DB_HOST"),
      "db_user" => required("DB_USER"), "db_password" => required("DB_PASSWORD"), "db_port" => port,
      "region" => "us-east-1", "poll_interval_ms" => 100, "poll_max_record_bytes" => 1_048_576,
      "ssl_enforced" => ssl == "true", "db_pool" => env_pool("ROOMQC_REALTIME_CONNECT_POOL", 1),
      "subcriber_pool_size" => env_pool("ROOMQC_REALTIME_SUBSCRIBER_POOL", 4),
      "subs_pool_size" => env_pool("ROOMQC_REALTIME_SUBSCRIBER_POOL", 4)}}
  end

  defp required(name) do
    case System.get_env(name) do
      value when is_binary(value) and byte_size(value) > 0 -> value
      _ -> raise("ROOMQC_REALTIME_CONFIG_INVALID")
    end
  end
  defp env_pool(name, default) do
    case System.get_env(name) do
      nil -> default
      value ->
        if not Regex.match?(~r/^([1-9][0-9]{0,3}|10000)$/, value), do: raise("ROOMQC_REALTIME_POOL_INVALID")
        String.to_integer(value)
    end
  end
  defp pool(value, default) do
    case value do
      nil -> default
      false -> default
      n when is_integer(n) and n >= 1 and n <= 10_000 -> n
      _ -> raise("ROOMQC_REALTIME_POOL_INVALID")
    end
  end
  defp normalized(settings) do
    subscribers = if Map.has_key?(settings, "subcriber_pool_size"),
      do: pool(settings["subcriber_pool_size"], 1), else: 4
    Map.merge(settings, %{"db_pool" => pool(settings["db_pool"], 1),
      "subcriber_pool_size" => subscribers, "subs_pool_size" => subscribers})
  end
  defp validate_existing(tenant, config) do
    extension = Enum.filter(tenant.extensions, &(&1.type == "postgres_cdc_rls"))
    if length(extension) != 1, do: raise("ROOMQC_REALTIME_EXTENSION_INVALID")
    [extension] = extension
    for key <- ["db_name", "db_host", "db_user", "db_password", "db_port"] do
      if Crypto.decrypt!(extension.settings[key]) != config.settings[key],
        do: raise("ROOMQC_REALTIME_TARGET_MISMATCH")
    end
    if Tenant.decrypt_jwt_secret(tenant.jwt_secret) != config.jwt or tenant.jwt_jwks != config.jwks
      or extension.settings["ssl_enforced"] != config.settings["ssl_enforced"],
      do: raise("ROOMQC_REALTIME_IDENTITY_MISMATCH")
    normalized(extension.settings)
  end
  defp preserve(tenant) do
    tenant = Repo.preload(tenant, :extensions)
    for extension <- tenant.extensions, extension.type == "postgres_cdc_rls" do
      settings = normalized(extension.settings)
      if settings != extension.settings do
        # Deliberately bypass the encrypting vendor changeset: existing values
        # are already encrypted. Never replace the tenant or its associations.
        Repo.update!(Ecto.Changeset.change(extension, settings: settings), log: false)
      end
    end
    tenant
  end
  defp create(config) do
    %Tenant{} |> Tenant.changeset(%{"name" => config.name, "external_id" => config.name,
      "jwt_secret" => config.jwt, "jwt_jwks" => config.jwks,
      "extensions" => [%{"type" => "postgres_cdc_rls", "settings" => config.settings}]})
    |> Repo.insert!(log: false)
  end
  defp preserve_feature_flag do
    # Keep an operator's existing flag/rollout choice; only supply a new default.
    if is_nil(Repo.get_by(FeatureFlag, name: "gcm_encryption_backfill")) do
      %FeatureFlag{} |> FeatureFlag.changeset(%{name: "gcm_encryption_backfill", enabled: true})
      |> Repo.insert!(log: false)
    end
  end
end

try do
  RoomQC.RealtimeBootstrap.run()
rescue
  error ->
    message = Exception.message(error)
    code = if Regex.match?(~r/^ROOMQC_[A-Z_]+$/, message), do: message, else: inspect(error.__struct__)
    IO.puts(:stderr, "ROOMQC_REALTIME_BOOTSTRAP_FAILED " <> code)
    for {module, function, arguments, location} <- Enum.take(__STACKTRACE__, 6) do
      arity = if is_integer(arguments), do: arguments, else: length(arguments)
      IO.puts(:stderr, "ROOMQC_REALTIME_FAILURE_FRAME " <> inspect(module) <> "." <>
        Atom.to_string(function) <> "/" <> Integer.to_string(arity) <> ":" <>
        Integer.to_string(Keyword.get(location, :line, 0)))
    end
    System.halt(1)
catch
  _, _ -> IO.puts(:stderr, "ROOMQC_REALTIME_BOOTSTRAP_FAILED"); System.halt(1)
end
