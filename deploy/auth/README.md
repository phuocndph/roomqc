# RoomQC Auth image

The current password and staff invitation flows require the reviewed RoomQC
Auth extension. Updating SQL migrations while keeping stock GoTrue does not
produce the tested deployment.

Build the same pinned extension used by the backend acceptance stack:

```powershell
node scripts/build-auth.mjs --build
```

The command builds an image and writes a receipt under `.local/`. It does not
restart Auth, update a database, or enable signup. `--no-cache` forces a fresh
image build. The receipt records the upstream commit, patch hashes, image ID,
binary checksum, and focused Go test command. It does not certify a deployed
runtime or the complete upstream test suite.

For a reviewed deployment, set `ROOMQC_AUTH_IMAGE` to that immutable image ID
(or its verified registry digest), then merge `deploy/auth/compose.yml` after
the pinned upstream Compose file. The overlay enforces current-password checks
and PostgreSQL audit logging. Keep existing URLs, SMTP, JWT keys, database
credentials and signup policy in the deployment's private configuration.

Before switching a populated installation, complete the matching migration,
frontend, control and Realtime bundle; take a verified backup and retain the
previous images/configuration. Run the password, invitation and login checks
against the deployed runtime before admitting new customers. This overlay
alone is not a complete VPS installation or a database rollback procedure.

The consumer resource PLAN accepts the exact named image in
`vendorResourceCatalog.managedAuth` through the existing `auth` adapter. It
requires both guard settings above, the finite pool and idle limit, zero
percentage override, and the existing process/target/TLS checks. Other digests
or repositories cannot borrow that recipe. A new Auth build needs a separate
image review and catalog update. PLAN does not prove loaded runtime settings,
total capacity or signup acceptance; unresolved consumers remain unresolved.
