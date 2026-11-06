import {deploymentEnvironment,deploymentEnvironmentFile} from '../../server/control/deployment-environment.mjs';
import {shellQuote as q} from '../../server/control/vps-deploy.mjs';

const directories=path=>path.split('/').slice(1,-1).map((_,i)=>'/'+path.split('/').slice(1,i+2).join('/'));
const checkDirectory=path=>`test -d ${q(path)}; test ! -L ${q(path)}
test "$(stat -c %u ${q(path)})" = 0
test $((0$(stat -c %a ${q(path)}) & 0022)) -eq 0`;
export function verifyDeploymentEnvironments(files,clusterId){
  if(!Array.isArray(files)||files.length>32)throw new Error('VPS_DEPLOY_ENV_FILE_UNSAFE');
  return files.map(file=>{
    const checked=deploymentEnvironmentFile(file.path,clusterId);
    if(checked.sha256!==file.sha256)throw new Error('VPS_DEPLOY_ENV_FILE_UNSAFE');
    return directories(file.path).map(checkDirectory).join('\n')+`
test -f ${q(file.path)}; test ! -L ${q(file.path)}
test "$(stat -c %u:%a:%h ${q(file.path)})" = '0:600:1'
test "$(sha256sum ${q(file.path)} | cut -d ' ' -f 1)" = ${q(file.sha256)}
test "$(stat -c %s ${q(file.path)})" -le 65536`;
  }).join('\n');
}
export async function installDeploymentEnvironment(run,{clusterId,environment}){
  const file=deploymentEnvironment(environment,clusterId),directory=file.path.slice(0,file.path.lastIndexOf('/'));
  const prepare=directories(file.path).map(path=>`test ! -L ${q(path)}
if test ! -e ${q(path)}; then mkdir -m 700 ${q(path)}; fi
${checkDirectory(path)}`).join('\n');
  // A hard-link publishes a complete file without replacing an existing name.
  // The unique temporary file is removed before checking link count and mode.
  await run(`set -eu
umask 077
${prepare}
tmp=$(mktemp ${q(directory+'/.incoming.XXXXXXXXXX')})
trap 'rm -f "$tmp"' EXIT
cat > "$tmp"
test "$(sha256sum "$tmp" | cut -d ' ' -f 1)" = ${q(file.sha256)}
chmod 600 "$tmp"
if ! ln "$tmp" ${q(file.path)} 2>/dev/null; then test -f ${q(file.path)}; fi
rm "$tmp"; trap - EXIT
${verifyDeploymentEnvironments([file],clusterId)}`,file.source);
  return {path:file.path,sha256:file.sha256,envFile:file.envFile};
}
