# Control deployment image

The separate directory database now has a [TLS deployment component](directory/README.md),
with a clean database template and an API overlay that mounts only the public CA.
Its isolated Compose rehearsal covers migrations, restricted API login, TLS
negative cases and restart persistence. This component still requires the
reviewed host allocation and production credential/certificate lifecycle.

Build with `node scripts/build-control-image.mjs --build` from this checkout.
The builder stages only public inputs used by the existing Dockerfile, verifies
every packaged file and imports in a container without network access, and
records the immutable image ID with the current backend source binding.
It neither initializes a database nor enables signup. Build/import checks do
not establish production readiness or replace the full/rebuild receipts.

Use the `roomqc/control@sha256:...` named reference from the generated
`image.json` as `ROOMQC_CONTROL_IMAGE`. Merge `deploy/control/compose.yml` **after**
`docker-compose.control.yml`; the override removes the build definition and
refuses to pull an unknown tag. The runtime still requires the real cluster,
verified TLS database connection, private configuration and reviewed resource
budget. Do not supply example metadata as measured capacity.

Export using the generated **tag**, rather than a bare image ID, so Docker's
archive carries the repository name. The stager verifies that the tag and
manifest digest refer to the same bytes, then proves the named digest resolves
on the target after loading. A bare image-ID export loses the repository name
and cannot supply the production resource manifest's required named digest.

Transfer and inspect the exact image before changing any runtime. Retain the
existing frontend/backend mapping until signup, existing login, isolation,
email and recovery are verified on the target. The temporary Nginx guard
installed by `scripts/install-roomqc-vps-api-guard.py` must be replaced as one
whole marked block by the verified upstream at cutover; it must not coexist
with a second route for the same control prefix.

`scripts/stage-roomqc-control-image.py` provides separate `--prepare` and
`--verify` steps over the verified SSH connection. Supply the source hash,
archive hash, immutable image ID, archive byte count and manifest hash in that
order. Transfer `image.tar` and `image.json` only to the owned directory returned
by `--prepare`, then run `--verify` with the same arguments. The helper checks
transfer hashes, bounds decompressed layer sizes before loading, verifies all
packaged files/imports without networking and confirms existing containers
did not change. Its disk reserve is only for staging the control image;
whole-stack capacity and health/admission policy remain separate checks.

For an integrity-checked source handoff, run
`node scripts/build-roomqc-source-packet.mjs --full-state <completed ownership.json>`.
It validates the completed full reference, current backend binding and migration
set before staging public sources. Edge files are included only when individually
witnessed by that reference. It excludes local environments, databases, vendor
checkouts and image archives; this packet is not a complete runtime installer.
The manifest keeps `deploymentReady:false` and does not accept a running rebuild.
It also includes the public directory server/client Compose files, PostgreSQL
configuration and per-service CA/file-secret overlays. Their exact bytes are
listed under `deploymentInputs` and the stager checks those entries against the
archive manifest. Host-specific credentials, certificate private keys, budgets
and runtime-generated wiring are separate protected deployment inputs.

`scripts/stage-roomqc-source-packet.py` runs over verified SSH with arguments
`--prepare|--verify SOURCE_SHA256 ARCHIVE_SHA256 MANIFEST_SHA256 ARCHIVE_BYTES`.
Transfer the generated `sources.tar.gz` into the returned owned directory.
Verification checks every path, type, size and file digest before writing the
source tree; it rejects traversal, links, duplicates, extra files and private
keys. A second verification checks existing staged bytes. No source is executed,
and no service, database, account mapping or signup setting changes.

The VPS system Compose 2.40.3 omits `bind.create_host_path: false` from its
normalized JSON, which the resource verifier requires explicitly. RoomQC uses
the same Compose5.0.2 version as local verification, installed separately by
`scripts/install-roomqc-compose-cli.py` from the official binary with pinned
size/SHA256. It leaves the system plugin and other applications unchanged.

Set `DOCKER_CONFIG=/opt/RoomQC/.ops/compose-v5.0.2/docker-config` and
`DOCKER_HOST=unix:///var/run/docker.sock` **only in the RoomQC deployment
process**. The resource resolver preserves these two variables. Do not replace
the user's global Docker configuration or copy registry credentials into the
public bundle. `scripts/verify-roomqc-control-compose.py` checks the real target
CLI and the native verifier from the exact image in a network-none container.
Its synthetic budget proves packaging compatibility only; unresolved consumers
and `deploymentReady=false` remain explicit until a real profile is accepted.
