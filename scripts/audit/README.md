# Audit Scripts

Sinh sự thật từ codebase + DB cho `docs/architecture/_generated/`.

## Cách chạy

```bash
# 1. Trích xuất từ codebase
node scripts/audit/extract-all.mjs

# 2. Dump schema từ DB (yêu cầu PG env vars)
bash /tmp/dump_schema.sh   # hoặc copy nội dung vào scripts/audit/dump-db-schema.sh

# 3. Sinh các catalog markdown
node scripts/audit/generate-catalogs.mjs
```

## Output

`docs/architecture/_generated/`:

- `routes.json` — routes + guard + permission
- `rpc-calls.json` — RPC × callers FE
- `table-usage.json` — bảng × ops × files
- `edge-functions.json` — Edge Functions + secrets
- `hooks.json` — hooks × queryKeys × RPC × tables
- `pages.json` — danh sách page
- `migrations.json` — migration summary
- `db-columns.tsv`, `db-fks.tsv`, `db-policies.tsv`, `db-functions.tsv`, `db-triggers.tsv`, `db-rls-enabled.tsv` — DB facts

Re-run khi schema hoặc code thay đổi.
