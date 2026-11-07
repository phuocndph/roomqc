// Installs only the local queue scheduler; never connects to a linked/cloud project.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const project = config.match(/^project_id\s*=\s*"([a-z0-9_-]+)"/m)?.[1];
if (!project) throw new Error('Cannot read local project ID');
const output = process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx supabase status --output json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  : execFileSync('npx', ['supabase', 'status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const local = JSON.parse(output.slice(output.indexOf('{')));
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(local.API_URL).hostname)) throw new Error('Local loopback stack required');
if (!local.SERVICE_ROLE_KEY) throw new Error('Local service role is unavailable');
const literal = value => `'${value.replaceAll("'", "''")}'`;
const sql = `BEGIN;
DO $secret$ DECLARE secret_id uuid; BEGIN
  SELECT id INTO secret_id FROM vault.secrets WHERE name='email_queue_service_role_key';
  IF secret_id IS NULL THEN PERFORM vault.create_secret(${literal(local.SERVICE_ROLE_KEY)},'email_queue_service_role_key');
  ELSE PERFORM vault.update_secret(secret_id,${literal(local.SERVICE_ROLE_KEY)}); END IF;
END $secret$;
SELECT cron.schedule('roomqc-email-worker','15 seconds',$job$
  SELECT net.http_post(url:='http://kong:8000/functions/v1/process-email-queue',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key')),
    body:='{}'::jsonb,timeout_milliseconds:=60000)
  WHERE EXISTS(SELECT 1 FROM public.email_deliveries WHERE (status='queued' AND next_attempt_at<=now()) OR (status='processing' AND lease_until<now()))
    AND NOT EXISTS(SELECT 1 FROM public.email_send_state WHERE retry_after_until>now() OR worker_lease_until>now());
$job$);
COMMIT;`;
// Secrets travel on stdin, never command arguments, a file, or stdout.
execFileSync('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], {
  input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
});
console.log('Local email worker scheduled every 15 seconds. Credentials remain in database Vault.');
