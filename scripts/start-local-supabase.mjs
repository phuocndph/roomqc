import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const config = readFileSync(path.join(projectRoot, "supabase", "config.toml"), "utf8");
const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
const npmCli = process.env.npm_execpath;

if (!projectId) {
  throw new Error("Cannot read project_id from supabase/config.toml");
}

if (!npmCli) {
  throw new Error("Run this helper through `npm run supabase:start`");
}

function redactSecrets(text) {
  return text.replace(
    /("(?:SECRET_KEY|SERVICE_ROLE_KEY|JWT_SECRET|S3_PROTOCOL_ACCESS_KEY_SECRET|S3_PROTOCOL_ACCESS_KEY_ID|PUBLISHABLE_KEY|ANON_KEY)"\s*:\s*")[^"]+/g,
    "$1[redacted]",
  );
}

function run(command, args, { redact = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: redact ? ["inherit", "pipe", "pipe"] : "inherit",
    shell: false,
  });

  if (redact) {
    if (result.stdout) process.stdout.write(redactSecrets(result.stdout));
    if (result.stderr) process.stderr.write(result.stderr);
  }

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Vector/Logflare only power the local Logs Explorer. Docker Desktop commonly
// leaves Vector in a restart loop when its TCP Docker API is disabled.
run(process.execPath, [
  npmCli,
  "exec",
  "--yes",
  "--package=supabase@latest",
  "--",
  "supabase",
  "start",
  "--exclude",
  "vector,logflare",
], { redact: true });

// The CLI creates Edge Runtime with restart=no. Persist it across Docker
// Desktop restarts so user-management and notification functions remain up.
run("docker", [
  "update",
  "--restart",
  "unless-stopped",
  `supabase_edge_runtime_${projectId}`,
]);

console.log("Supabase local is ready (Edge Runtime persistent; Vector/Logflare disabled).");
