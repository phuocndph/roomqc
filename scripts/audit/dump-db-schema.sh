#!/usr/bin/env bash
# Dump schema từ Postgres → docs/architecture/_generated/db-*.tsv
# Cần PG env vars (PGHOST, PGUSER, PGDATABASE, PGPASSWORD).
set -euo pipefail
OUT=docs/architecture/_generated
mkdir -p "$OUT"

if command -v psql >/dev/null 2>&1; then
  PSQL=(psql)
elif command -v docker >/dev/null 2>&1; then
  PROJECT_ID=$(sed -n 's/^project_id = "\([^"]*\)"/\1/p' supabase/config.toml | head -n 1)
  DB_CONTAINER="supabase_db_${PROJECT_ID}"
  if [ -z "$PROJECT_ID" ] || ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
    echo "Không tìm thấy local Supabase DB container. Chạy 'supabase start' hoặc cài psql." >&2
    exit 1
  fi
  PSQL=(docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres)
else
  echo "Cần psql hoặc Docker để dump schema." >&2
  exit 1
fi

"${PSQL[@]}" -At -F $'\t' -c "
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_schema='public'
ORDER BY table_name, ordinal_position;" > "$OUT/db-columns.tsv"

"${PSQL[@]}" -At -F $'\t' -c "
SELECT conrelid::regclass::text, a.attname, confrelid::regclass::text, af.attname
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
JOIN pg_attribute af ON af.attrelid=c.confrelid AND af.attnum=ANY(c.confkey)
WHERE c.contype='f' AND connamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
ORDER BY 1;" > "$OUT/db-fks.tsv"

"${PSQL[@]}" -At -F $'\t' -c "
SELECT schemaname, tablename, policyname, cmd, roles::text,
       regexp_replace(coalesce(qual, ''), E'[\\n\\r]+', ' ', 'g'),
       regexp_replace(coalesce(with_check, ''), E'[\\n\\r]+', ' ', 'g')
FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;" > "$OUT/db-policies.tsv"

"${PSQL[@]}" -At -F $'\t' -c "
SELECT p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
       l.lanname, p.prosecdef
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_language l ON l.oid=p.prolang
WHERE n.nspname='public' ORDER BY p.proname;" > "$OUT/db-functions.tsv"

"${PSQL[@]}" -At -F $'\t' -c "
SELECT event_object_table, trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers WHERE trigger_schema='public'
ORDER BY event_object_table, trigger_name;" > "$OUT/db-triggers.tsv"

"${PSQL[@]}" -At -F $'\t' -c "
SELECT c.relname, c.relrowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname;" > "$OUT/db-rls-enabled.tsv"

echo "Done → $OUT"
wc -l "$OUT"/db-*.tsv
