ARG SOURCE_DATE_EPOCH
FROM supabase/realtime@sha256:768b559241dd234c4e8852c5c0f504e598b80f1df2ad4dd78d5486fbed2f17a2

# Replace the destructive seed and normalize pool keys in the API changeset.
# Keep the vendor entrypoint, migrations, Janitor and all data paths.
USER root
COPY --chmod=0444 bootstrap.exs pool-guard.sql extensions.ex database.ex tenant-migrations.ex /opt/roomqc/
COPY --chmod=0444 runtime.exs /app/releases/2.143.3/runtime.exs
RUN set -eu; chmod 0555 /opt/roomqc; set -- /app/lib/realtime-*/priv/repo/seeds.exs; \
    test "$#" -eq 1; test -f "$1"; \
    cp /opt/roomqc/bootstrap.exs "$1"; chown nobody:root "$1"; chmod 0444 "$1"
# Compile against the release's exact dependencies without loading runtime.exs,
# starting an application or embedding build-time runtime credentials/config.
# Elixir 1.19's checker chunk contains maps. Deterministic Erlang encoding keeps
# their serialized order stable across independent VMs, retaining type metadata.
RUN ERL_COMPILER_OPTIONS='[deterministic]' /app/erts-*/bin/erl -boot /app/releases/2.143.3/start_clean -boot_var RELEASE_LIB /app/lib -pa /app/lib/*/ebin -noshell -s elixir start_cli -extra -e 'Code.compiler_options(ignore_module_conflict: true); for {module, binary} <- Code.compile_file("/opt/roomqc/extensions.ex") ++ Code.compile_file("/opt/roomqc/database.ex") ++ Code.compile_file("/opt/roomqc/tenant-migrations.ex"), do: File.write!(Path.join(:code.lib_dir(:realtime, :ebin), Atom.to_string(module) <> ".beam"), binary); {:__block__, _, [definition, _]} = Code.string_to_quoted!(File.read!("/opt/roomqc/bootstrap.exs")); Code.compile_quoted(definition)'
USER nobody
