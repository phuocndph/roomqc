# Connect generated directory credentials to runtimes

This deployment-side renderer consumes the prepared runtime credential bundle
and writes individual Compose overlays. It opens no database/provider connection,
does not start a process and does not enable signup. Customers never see or run it.

First prepare/apply/verify the logins using
[the LOGIN runbook](roomqc-directory-runtime-logins.md). Keep the credential
directory durable, private and separate from runtime configuration/output.
Create a separate protected output directory for generated wiring. On Linux both
directories must be 0700, files 0600; the renderer checks access and refuses
symlink/hardlink inputs or conflicting existing outputs. Reruns reuse identical
outputs. It does not replace files from another deployment.

The renderer configuration is private and has exactly these fields:

```json
{
  "version": 1,
  "loginConfigFile": "/run/roomqc-operator/login-config.json",
  "outputDirectory": "/var/lib/roomqc-private/runtime-wiring",
  "summaryInputs": [
    {
      "ordinal": 1,
      "installerFile": "/run/roomqc-operator/reviewed-summary-installer.json"
    }
  ]
}
```

`summaryInputs` must contain exactly one reviewed installer configuration for
each enabled summary rotator replica. Use an empty array only when that consumer
is disabled in the shared budget. Its environment, budget hash, replica count
and directory system/database identity must already match the approved plan.
The renderer updates the observer role and canonical directory DSN path; it
preserves business identity, signer, publisher and signed release inputs. It
does not validate or grant release approval. Existing runtime checks still do.

```text
node scripts/control-directory-runtime-wiring.mjs --config-file /run/roomqc-operator/wiring-config.json
```

`wiring.json` lists every generated service and its Compose/env files. Each API,
health, alert, setup or summary replica has a separate overlay. Probe catalog
credentials join the matching health process, which owns its existing second
pool. A missing matching health replica is rejected. Scaling a generated
service above one would share its dedicated login; start separate reviewed
projects per ordinal and retain native resource/runtime inventory checks.

For each service, use the existing base, immutable-image configuration where
applicable, public CA overlay, and generated `<consumer>-<ordinal>.compose.json`
last. Pass the explicit deployment env file first and generated `.env` last.
The generated env contains host **file references**, not passwords. The base
worker templates need those references during Compose interpolation even when
an override supplies the resolved secret definition. Health additionally uses
its managed-probe base and existing private keyring/trust/metadata configuration.
Network, image, resource and release inputs remain explicit reviewed values.

| Runtime | Credential connection |
|---|---|
| API | Only its `control-dsn` secret, read by `loadRuntimeConfig`; direct `ROOMQC_CONTROL_DATABASE_URL` is cleared |
| Health | Its own `metrics-dsn`, plus matching `probe-dsn` for managed checks |
| Alert | Its own `alert-dsn` |
| Setup | Its own `setup-dsn` |
| Summary | Read-only observer DSN at `/etc/roomqc/private/summary-directory.dsn` and generated installer metadata at `/etc/roomqc/private/summary-installer.json` |

Summary keeps the existing protected private-root mount for its other inputs.
The two child overlays are exact, read-only file binds with host-path creation
disabled; an incomplete pair or unrelated target is rejected. Resource PLAN
reads the actual overlaid metadata instead of the shadowed parent file. Its
rotation policy must reference the canonical installer path. The DSN file is
not opened by PLAN. Runtime inventory still binds every actual source and mode.
The business issuer credential remains a separate reviewed input.

No service receives the bundle directory, another runtime's DSN or the
administrator/migration file. File-source references do not themselves prove
secret custody or the running mount. Run native resource PLAN with the exact
final Compose files and then actual runtime inventory/readiness after startup.
Perform target identity, TLS, grants and admission checks before enabling signup.

Local verification exercises the real prepare/apply/verify/render CLIs with six
capabilities, five generated service overlays, private-file rerun/conflict
guards, and actual API HTTP live/ready using the generated DSN file. Compose
resolution/native PLAN also checks generated API and summary overlays, including
the child metadata binding. It does not start the full worker fleet, validate
summary issuance against a real business backend, or accept hosted signup.

The earlier staged control image does not contain these new modules. Build and
verify a new immutable candidate, then complete release verification and target
deployment. No existing production account or Cloud mapping is migrated by this
renderer. Certificate/credential rotation, offsite custody/recovery, remaining
consumer credentials and full signup/load/pilot gates remain required.
