-- Operator/migrator only, on the approved target. No password in this file.
-- New role only: never silently take ownership of an existing login.
BEGIN;
CREATE ROLE roomqc_monitor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
GRANT pg_read_all_stats TO roomqc_monitor;
ALTER ROLE roomqc_monitor SET statement_timeout='3s';
ALTER ROLE roomqc_monitor SET lock_timeout='1s';
ALTER ROLE roomqc_monitor SET idle_in_transaction_session_timeout='5s';
ALTER ROLE roomqc_monitor SET default_transaction_read_only=on;
COMMIT;
-- Provision LOGIN/password separately through the secret channel. Existing PUBLIC
-- schema/database grants must be audited; this role must not inherit business DML.
