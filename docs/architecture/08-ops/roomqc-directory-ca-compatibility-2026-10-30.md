# Directory CA deployment compatibility — 30/10/2026

The API directory overlay previously resolved in Compose but failed native
resource PLAN because its public CA volume was outside the closed metadata
mount policy. Setup and summary-rotation adapters also rejected the mount or
the extra-CA environment setting. Three focused regressions reproduced these
failures before the fix.

The fix permits one canonical read-only named CA volume at
`/run/roomqc-directory-ca`, with no bind-source substitution or volume subpath.
Extra Node trust can reference only its `ca.crt`. Existing process, metadata,
credential and parent/code-overlay restrictions remain. Runtime inventory
checks the resolved external volume name, read-only flag and effective image
environment, including rejection of disabled TLS verification. It compares
volume names rather than daemon-specific storage paths.

Separate Compose overlays now connect API, health, alert, setup and summary
consumers to public trust without supplying administrator credentials. Worker
DSN validation still permits only `sslmode=verify-full`; workers use
`NODE_EXTRA_CA_CERTS` at startup. No schema, Auth policy or existing data changed.

Validation:

- Focused adapter/runtime suite: 55 passed, 0 failed, no skips. Actual Compose
  resolution plus native PLAN passed for all five client overlays using
  synthetic configuration, without opening real environment or secret files.
- Broader resource regression: 152 passed, 0 failed, 28 skipped (existing
  environment/opt-in integration checks). The 55 focused cases are included in
  this total and are not counted twice.
- Owned Docker directory run `9dca487baaf3`: 21 migrations, no-op replay,
  limited API fixture LOGIN, trusted TLS, wrong hostname/CA/plaintext rejection,
  persisted state after restart and container hardening passed.
- The actual installed `createHealthPool` connected with a production resource
  profile and Node's extra CA. Wrong hostname, wrong CA and plaintext failed
  as expected. Imported pool/config/resource module bytes matched current
  source. This is pool/driver proof with a limited fixture LOGIN, not a started
  complete worker. The resource inventory regressions use inspection doubles.
- Owned containers (including stopped), networks and volumes were removed;
  an independent label-filtered check found none remaining.

The public receipt is
`artifacts/roomqc-directory-ca-compatibility-2026-10-30.json`. Historical full
backend/rebuild evidence remains bound to its historical source hash. These
plan-tooling edits have focused/runtime evidence, not a fresh full release run.

SSH to the target was verified again. Root filesystem availability was
11,599,093,760 bytes of 102,888,095,744 bytes (about 11.3% free), below the
existing reserve policy. No full-stack upload, runtime start, existing-user
cutover or public signup opening occurred. Required next work remains bounded
runtime LOGIN provisioning, certificate/credential lifecycle, disk headroom,
target runtime deployment and full signup/recovery/load acceptance.
