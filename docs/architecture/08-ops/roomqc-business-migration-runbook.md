# Business migration runner

`server/control/business-migrate-cli.mjs` is the product-side migration command
for the Supabase business database. It is separate from the RoomQC directory
migrations: the directory stores tenant routing and provisioning state, while
this runner upgrades the hotel application schema.

The command never prints a DSN or migration SQL. It requires an absolute file
containing the DSN and, outside an explicitly labelled local rehearsal, requires
`sslmode=verify-full`.

## Release preparation

Record the manifest before shipping the images:

```powershell
node --input-type=module -e "import {businessMigrationManifest} from './server/control/business-migrate.mjs'; console.log(JSON.stringify(await businessMigrationManifest()))"
```

The release record must retain `count` and `sha256`. The hash includes every
filename and canonical LF source. A renamed, edited, missing or extra migration
is a different release.

## Safe rollout

For a first installation on a fresh Supabase business database, run `initialize`
with both expected release values before `plan`. It requires the vendor Auth and
Storage tables, no directory schema, no application relations in `public` or
`private`, and no populated migration history. It creates only the empty
migration ledger under the same advisory lock and an owned transaction. It
does not infer history from existing application data. Initialization returns
exit 0 with pending files; continue with `apply`, then `verify` and `receipt`.
For upgrades or a resumed migration, use `plan`/`apply` against the existing
ledger instead of running `initialize` again.

Use a dedicated migration DSN file with mode `0600` on Linux. First inspect the
target without changing it:

```text
npm run control:business-migrate -- --mode plan \
  --database-url-file /opt/RoomQC/management/control-main/private/runtime/business-migration.dsn \
  --expected-hash RELEASE_MIGRATION_SET_SHA256 \
  --expected-count RELEASE_MIGRATION_COUNT
```

`plan` verifies that the target is a Supabase business database and that its
`supabase_migrations.schema_migrations` history is an exact prefix of the
release. Diverged history, a directory database, a missing history table or a
source hash mismatch stops before any mutation.

After backup and release approval, run `apply` with the same inputs. Each
pending file runs under the advisory lock `727100`, a bounded lock/statement
timeout and one transaction that includes its history row. The one legacy outer
`BEGIN`/`COMMIT` wrapper is normalized into that owned transaction; any other
transaction control statement is rejected. A failed migration rolls back its
SQL and history row.

Run `verify` after the service restart and before opening signup. It must report
`complete:true`, the same migration hash and zero pending files. The runner does
not create or rotate tenant credentials, open signup, or replace the backup and
restore process.

The runner executes ordinary files as `postgres`, preserving application object
ownership. Seven reviewed migrations touching vendor-owned objects execute as
`supabase_admin`. Applying those files requires a separate superuser maintenance
connection; API and worker DSNs must never contain this capability. All pending
SQL and the required roles are checked before the first file is written. Quoted
strings, function bodies and comments are excluded from transaction-control
detection.

## Receipt for release admission

Run `receipt` with the same arguments as `verify`. Its JSON output includes a
`receipt` object. Only that object belongs in a version 3 release validation
catalog entry:

```json
{"version":1,"status":"complete","migrationSetSha256":"RELEASE_MIGRATION_SET_SHA256","totalCount":591,"appliedCount":591,"pending":[],"complete":true}
```

`plan` returns exit 0 for a valid prefix even with pending migrations. `verify`
and `receipt` return exit 2 and `ok:false` while any files remain. Input,
connection, authority or SQL failures return exit 1. `apply` must return exit 0
before a release receipt is accepted. Never copy a pending receipt into the
release catalog. The receipt is installer-owned offline evidence, not a signed
or live target attestation; the independent release approval and nonce-bound
manifest check are still required.

To test the actual CLI against a verified, populated backup without writing the
source database:

```text
node scripts/test-roomqc-populated-upgrade.mjs --backup ABSOLUTE_VERIFIED_BACKUP_DIRECTORY --runner-image IMMUTABLE_CONTROL_IMAGE
```

The rehearsal verifies the control image's copied source against the repository
and runs its packaged CLI and migration chain without source mounts against an
owned restored database. The database and CLI share an isolated
network namespace without egress or published ports. It checks pending exit
codes, applies all missing files, repeats apply, obtains a complete receipt and
compares every original table row/column before removing test containers.
This does not replace the Contabo deployment, disk-headroom
preflight or approved backup/release inputs.
