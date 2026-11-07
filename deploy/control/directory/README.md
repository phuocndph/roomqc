# Separate RoomQC control directory

This component is the private PostgreSQL database used by the signup/control
service. It is separate from every hotel/Supabase database. Customers do not
run these steps; RoomQC's deployment process owns them.

`../directory.compose.yml` starts only the directory. It uses the exact pinned
PostgreSQL 16 Alpine image already used by the local control deployment and
refuses to pull an unknown image. Patch/support review of that pin remains part
of release approval. No host port is published. The database runs as UID/GID
70, with a read-only root filesystem, no Linux capabilities and explicit
memory/CPU/PID/shared-memory limits. Disk capacity still requires a host check.

Before deployment, provision dedicated **owned** external resources. Refuse an
unowned or incompatible existing resource rather than initializing it:

- An internal Docker network, supplied as `ROOMQC_DIRECTORY_NETWORK`.
- A new data volume (`ROOMQC_DIRECTORY_DATA_VOLUME`), owned by 70:70 with mode
  0700. The database's data directory is its `pgdata` child.
- A private volume (`ROOMQC_DIRECTORY_PRIVATE_VOLUME`), directory 0700 owned by
  70:70, containing `server.key` and `admin-password` at 0600 and `server.crt`
  at 0444. The server certificate must have `DNS:roomqc-directory` in its SAN.
- A separate public CA volume (`ROOMQC_DIRECTORY_CA_VOLUME`), readable by API
  and worker users. It contains `ca.crt`, never the CA private key, server key,
  administrator password or migration DSN.

The production CA key must have independent protected custody; issue,
expiration alerting, renewal, overlap and recovery still need deployment
integration. The isolated test's two-day CA is only an ephemeral fixture.

Set these non-secret values from the reviewed allocation before running
Compose: `ROOMQC_DEPLOYMENT_ID`, `ROOMQC_DIRECTORY_MAX_CONNECTIONS`,
`ROOMQC_DIRECTORY_SHARED_BUFFERS`, `ROOMQC_DIRECTORY_MEMORY_LIMIT`,
`ROOMQC_DIRECTORY_CPU_LIMIT` and `ROOMQC_DIRECTORY_SHM_SIZE`. Limits, connection
pools, backup/migration/rolling overlap and existing applications must fit the
whole host. The test's 512 MiB/one CPU/32 connections are not a VPS sizing
recommendation or permission to open admission.

Apply directory migrations with the existing `migrateDirectory`/migration
job, using a separate privileged credential outside the API container. Create
bounded LOGIN members of the existing NOLOGIN capability groups for API and
each worker; do not grant the API administrator/migrator privileges. The
standalone API fixture is supplemented by the deployment-side
[runtime LOGIN provisioner](../../../docs/architecture/08-ops/roomqc-directory-runtime-logins.md)
and its isolated prepare/apply/verify checks for six capabilities. Production
runtime-secret wiring is available through the
[file-secret renderer](../../../docs/architecture/08-ops/roomqc-directory-runtime-wiring.md)
and has local API HTTP verification. Full-worker/target wiring, other consumer
logins and credential rotation remain to be integrated. Revoke public database
access and grant CONNECT to approved runtime roles explicitly.

For the API, merge `../directory-client.compose.yml` after the existing base
and image overlays. Supply an approved outbound network through
`ROOMQC_CONTROL_EGRESS_NETWORK`. The API receives the public CA volume only and
keeps the base overlay's empty migration-credential variable. Its private
runtime DSN must use host `roomqc-directory`, database `roomqc_control` and its
limited LOGIN. Prefer the generated file-secret overlay last: the API then
reads only `/run/secrets/control-dsn`, with `sslmode=verify-full` as its sole URL
option. It uses `NODE_EXTRA_CA_CERTS` from the public CA overlay just like the
workers. The file loader rejects a simultaneous direct DSN or arbitrary URL
options, including `sslrootcert`.

The legacy direct environment DSN remains compatible with both query parameters
below; do not copy this format into a file handled by the new loader:

```text
sslmode=verify-full&sslrootcert=/run/roomqc-directory-ca/ca.crt
```

For health, alert, setup and summary-rotation workers, merge the matching file
from `../directory-clients/` after that worker's existing base Compose. Set
`ROOMQC_DIRECTORY_CA_VOLUME` to the **public** owned CA volume. These overlays
add only a read-only certificate mount and
`NODE_EXTRA_CA_CERTS=/run/roomqc-directory-ca/ca.crt`. Node loads this file at
process startup. Certificate replacement needs a controlled process restart;
renewal/overlap orchestration is still required.

Health/alert/setup DSNs retain **only** `sslmode=verify-full` as a URL option.
Their shared URL validator deliberately refuses `sslrootcert` and other URL
overrides. Do not copy the API's two-parameter DSN into these worker files.
The summary worker still needs separately verified TLS for its business DB;
passing its directory CA PLAN does not prove either DB connection.

Native PLAN and runtime inventory now accept the canonical CA mount while
retaining the existing metadata/credential/code-mount restrictions. Runtime
inventory matches the exact resolved external volume name and read-only flag;
it does not certify the contents or ownership of an arbitrary existing volume.
The installer must still verify that this is the intended public-only volume.
Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

The database rejects plaintext TCP connections even when the password is
valid. Local Unix sockets use peer authentication. `pg_isready` is a process
health check only: also verify migration checksums, runtime roles and TLS
before starting dependent services or replacing the public control API guard.

Run the actual template against disposable local resources:

```text
node scripts/test-roomqc-directory-compose-isolated.mjs --run
```

This uses only preinstalled images, fresh labeled volumes/network and
ephemeral test secrets. It runs all directory migrations, replays them,
checks runtime privileges and trusted TLS, rejects wrong hostname/wrong
CA/plaintext, restarts the database and rechecks persisted state. A client
cannot see the private volume or database secrets through environment
variables. It checks actual container hardening and removes only resources
bearing its unique ownership label, including stopped containers. Logs/state
stay under the private `.local` run directory. No VPS, serving database,
Cloud user, hotel mapping or public signup setting is touched.

The test also calls the installed image's actual `createHealthPool` with a
production resource profile and a DSN containing only `sslmode`, while Node
loads the public CA at startup. It compares the imported worker/config/resource
module bytes to current source, accepts trusted TLS and rejects wrong hostname,
wrong CA and plaintext. This checks the pool/driver path using an isolated
limited fixture LOGIN; it does not start or accept the complete health worker.

The verified local component is not a complete production installer. Host
disk/capacity, certificate and credential lifecycle, directory recovery,
cluster/runtime bootstrap, provider email, existing Cloud users and complete
signup/E2E acceptance remain separate requirements.
