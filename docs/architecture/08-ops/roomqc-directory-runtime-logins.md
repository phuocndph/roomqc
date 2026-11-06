# Directory runtime LOGIN provisioning

This is a deployment component owned by RoomQC. Customers never run these
commands or receive infrastructure credentials. It provisions the six supported
directory capabilities after the directory migrations have completed, before
starting API/workers. It does not migrate hotel/Supabase data or open signup.

## Inputs and preparation

Use a reviewed PostgreSQL 16 directory, its verified public CA, a separate
administrator DSN and the reviewed shared connection budget. Bind the expected
database name, OID and PostgreSQL system identifier from the target inventory.
Do not obtain these values from an arbitrary connection and silently accept it
as the deployment target. Production/staging require actual TLS and an admin
DSN with only `sslmode=verify-full`; load the trusted CA at process startup with
`NODE_EXTRA_CA_CERTS`. No plaintext fallback is supported on these environments.

Create a dedicated protected operator directory and a separate protected output
directory, both 0700 on Linux. Config and administrator DSN files are 0600 and
owned by the installer identity. The CLI checks existing POSIX ownership/modes
or Windows private ACLs; it does not weaken permissions automatically. Every
path must be absolute, without symlink ancestors or hard-linked secret files.
The installer is temporary and must never be the API/worker container.

Private configuration has exactly these fields:

```json
{
  "version": 1,
  "environment": "production",
  "deploymentId": "primary-a",
  "expected": {
    "databaseName": "roomqc_control",
    "databaseOid": "REPLACE_FROM_APPROVED_TARGET_INVENTORY",
    "systemIdentifier": "REPLACE_FROM_APPROVED_TARGET_INVENTORY"
  },
  "budgetSha256": "REPLACE_WITH_APPROVED_BUDGET_BYTE_SHA256",
  "budgetFile": "/run/roomqc-operator/resource-budget.json",
  "dsnFile": "/run/roomqc-operator/administrator.dsn",
  "credentialsDirectory": "/var/lib/roomqc-private/directory-runtime"
}
```

The placeholders deliberately fail validation. The administrator DSN is stored
only in its private file, never in arguments, reports, source control or chat.
Use the exact reviewed source build containing the new modules. The earlier
staged control image does not yet contain this component.

## Operation

Run in the deployment process, with the same config and directory each time:

```text
node scripts/control-directory-runtime-logins.mjs --config-file /run/roomqc-operator/config.json --prepare
node scripts/control-directory-runtime-logins.mjs --config-file /run/roomqc-operator/config.json --apply
node scripts/control-directory-runtime-logins.mjs --config-file /run/roomqc-operator/config.json --verify
```

`--prepare` writes an exclusive, fsynced private bundle and one `.dsn` file per
runtime login before any database change. It opens no database connection.
Rerunning it reuses valid files and can finish missing per-login files from an
intact bundle; a truncated or conflicting existing file is refused. It never
replaces a password to recover from an unclear state.

`--apply` checks target identity, PostgreSQL version, exact max_connections,
absence of tenant-backend markers and complete migration checksums. It shares
the migration advisory lock. It checks all existing role identities before
creating or granting anything. Grants and creation occur in one transaction;
the actual service readiness privilege checks run before commit. Database
PUBLIC access and public-schema CREATE are revoked; CONNECT is granted to the
scoped NOLOGIN groups rather than directly to runtime logins.

Only SCRAM-SHA-256 verifiers enter role-creation SQL. Passwords remain in private
files. Each login is limited to the sum of its own declared pools/fixed
connections for one replica, has one capability membership, and cannot grant
that membership or SET ROLE to the group. No runtime login is made owner,
superuser, database creator, role creator, replication or BYPASSRLS user.

`--verify` creates no roles or grants. It checks exactly the prepared identities,
SCRAM verifier, connection limit, membership flags, absence of direct ACLs,
ownership, downstream members and per-role settings, then applies the service's
readiness privilege checks. A role already present without the exact deployment
marker is refused. An ambiguous commit must be checked with the **same** bundle;
never regenerate credentials or assume rollback after losing the connection.

## Runtime mapping

Each enabled replica gets a distinct name:
`rq_<deploymentId with underscores>_<suffix>_<ordinal>.dsn`.
Disabled consumers get no login.

| Consumer | Suffix | NOLOGIN capability group |
|---|---|---|
| control-api | api | roomqc_control_api |
| health-worker | health | roomqc_control_metrics |
| probe-catalog | probe | roomqc_control_probe_runtime |
| alert-worker | alerts | roomqc_control_alerts |
| provisioning-worker | setup | roomqc_control_setup_runtime |
| summary-credential-rotation, directory side only | observer | roomqc_control_setup_credential_observer |

Mount only the individual runtime DSN needed by a worker through its existing
secret-file interface. Do **not** mount the whole credential directory or bundle
into a runtime. The [runtime wiring renderer](roomqc-directory-runtime-wiring.md)
generates per-service file bindings. For the API it sets
`ROOMQC_CONTROL_DATABASE_URL_FILE` and clears the direct
`ROOMQC_CONTROL_DATABASE_URL` value in the generated overlay. Use this private
file path for the candidate deployment; do not copy the DSN into environment
variables or logs. Hosted runtime integration remains pending. The public CA
overlays remain required.

The summary rotator's business-side issuer is separate and is not provisioned
by this directory component. Migration, backup, exporter and other unhandled
consumers remain listed explicitly as `otherConsumers`; they are not silently
given administrator privileges. Their bounded credentials and capabilities need
separate reviewed provisioning.

## Rerun, changes and remaining acceptance

Keep the private bundle in protected durable storage and include it in the
encrypted recovery/custody procedure. Changing the budget, replica count,
deployment identity or expected database changes the plan binding; this tool
does not adopt the old logins, rotate them, remove them or raise their limits.
Use a separately reviewed credential/scale rollout, with overlap covered by the
shared budget and explicit retirement. Do not edit the bundle or role comment
to bypass this rule.

The isolated harness exercises prepare/apply/verify, reruns, TLS authentication,
actual store readiness, server connection limits, wrong targets, conflicting
roles, excessive capability ACLs, direct runtime ACLs and damaged DSN files.
It uses fresh labeled Docker resources and ephemeral protected tmpfs output;
credentials disappear when that client container is removed. It does not prove
production custody, a complete worker startup, directory recovery, certificate
rotation or signup on the VPS. No hosted runtime has been changed by this work.
