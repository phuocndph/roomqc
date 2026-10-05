# Rebuilding the RoomQC database

The repository contains 481 ordered Supabase migrations and no production seed
file. A clean database therefore receives the schema, policies, functions, and
reference rows defined by migrations; it does not receive old tenants, Auth
users, uploaded files, or operational history.

## Local validation

Docker and the Supabase CLI can validate the migration chain without touching a
remote project:

```powershell
npx supabase@latest start --exclude studio,mailpit,imgproxy,logflare,vector --yes
npm run db:lint
npx supabase@latest stop
```

The lint command intentionally checks only the application schemas (`public` and
`private`). Local Supabase installs `pgtap` in `extensions`; its vendor test
helpers are not part of RoomQC and produce false-positive type errors when the
CLI lints that schema. The migration chain handles a missing legacy role,
optional `pgtap`, local Realtime table ownership, and the hardened RPC wrappers.
The schema applies from an empty database; the application-schema lint reports
no errors.
Keep the integration RPC guard enabled when changing function signatures.

## Remote schema setup

After creating/linking the replacement Supabase project, review the pending SQL
and push it:

```powershell
npx supabase@latest db push --linked --dry-run
npx supabase@latest db push --linked
```

Take a database backup before importing any business data. If the old project
becomes reachable, export data separately from schema:

```powershell
npx supabase@latest db dump --linked --data-only --file backups/roomqc-data.sql
```

Auth users and Storage objects require their own export/import procedure in the
Supabase dashboard; a Postgres data dump alone is not a complete application
backup.
