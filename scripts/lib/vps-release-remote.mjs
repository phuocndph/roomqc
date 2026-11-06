import {randomUUID,createHash} from 'node:crypto';
import {shellQuote as q} from '../../server/control/vps-deploy.mjs';
import {deploymentEnvironmentFiles} from '../../server/control/deployment-environment.mjs';
import {verifyDeploymentEnvironments} from './deployment-environment-remote.mjs';

const fail=code=>Object.assign(new Error(code),{code});
const hash=value=>createHash('sha256').update(value).digest('hex');

/** Commands run under the per-cluster lock. The injected transport also allows
 * exercising the real Docker commands on a disposable local Linux target. */
export function releaseRemoteAdapter(run,compose){
  const token=randomUUID();let owned=false,previous=null,previousManifest=null;
  const privateFiles=plan=>verifyDeploymentEnvironments(deploymentEnvironmentFiles(compose.model,plan.clusterId),plan.clusterId);
  const composeCmd=(plan,file=plan.paths.composeFile)=>`docker compose --project-name ${q(plan.project)} -f ${q(file)}`;
  const closed=plan=>`${plan.paths.clusterRoot}/closed-runs/${plan.journalRunId}`;
  const guard=plan=>`set -eu
mkdir ${q(plan.paths.lock+'/operation.lock')} || exit 73
trap 'rmdir ${q(plan.paths.lock+'/operation.lock')}' EXIT
test "$(cat ${q(plan.paths.lock+'/owner')})" = ${q(token)}
${plan.journalRunId?`test ! -e ${q(closed(plan))}`:''}
`;
  const inspect=async(plan)=>{
    const result=await run(guard(plan)+`ids=$(docker ps -aq --filter ${q('label=com.docker.compose.project='+plan.project)})
if test -n "$ids"; then docker inspect $ids; else printf '[]'; fi`);
    try{return JSON.parse(result.stdout)}catch{throw fail('VPS_DEPLOY_INSPECT_INVALID')}
  };
  const verify=(plan,containers,{candidate=true}={})=>{
    const expected=new Map(plan.services.map(s=>[s.name,s]));
    for(const c of containers){
      const labels=c.Config?.Labels??{},service=labels['com.docker.compose.service'];
      if(labels['com.docker.compose.project']!==plan.project||labels['com.roomqc.cluster']!==plan.clusterId||!expected.has(service))
        throw fail('VPS_DEPLOY_CONTAINER_OWNERSHIP');
      if(candidate&&(labels['com.roomqc.release']!==plan.releaseId||c.Config.Image!==expected.get(service).image
        ||!c.State?.Running||c.State?.Health?.Status!=='healthy'))throw fail('VPS_DEPLOY_HEALTH_FAILED');
      if(candidate&&c.Config.Env?.some(e=>e.startsWith('ROOMQC_CONTROL_SIGNUP_ENABLED=')&&e!=='ROOMQC_CONTROL_SIGNUP_ENABLED=false'))
        throw fail('VPS_DEPLOY_SIGNUP_MUST_STAY_CLOSED');
      expected.delete(service);
    }
    if(candidate&&expected.size)throw fail('VPS_DEPLOY_HEALTH_FAILED');
  };
  return {
    async stage(plan){
      if(hash(compose.source)!==plan.compose.sha256)throw fail('VPS_DEPLOY_COMPOSE_CHANGED');
      if(plan.journalRunId&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(plan.journalRunId))throw fail('VPS_DEPLOY_RUN_INVALID');
      const p=plan.paths;
      // Fail before touching any service if a legacy project has no owned
      // release history, or if an operator/deployer already owns this cluster.
      const result=await run(`set -eu
umask 077
for dir in /opt /opt/RoomQC /opt/RoomQC/clusters ${q(p.clusterRoot)} ${q(p.root)}; do test ! -L "$dir"; done
mkdir -p ${q(p.root)}
${plan.journalRunId?`test ! -e ${q(closed(plan))}`:''}
mkdir ${q(p.lock)} || exit 71
mkdir ${q(p.lock+'/operation.lock')}
cleanup() {
  rmdir ${q(p.lock+'/operation.lock')}
  rm -f ${q(p.lock+'/owner')} ${q(p.lock+'/run')}
  rmdir ${q(p.lock)}
}
trap cleanup EXIT
printf '%s' ${q(token)} > ${q(p.lock+'/owner')}
${plan.journalRunId?`printf '%s' ${q(plan.journalRunId)} > ${q(p.lock+'/run')}\ntest ! -e ${q(closed(plan))}`:''}
test ! -e ${q(p.releaseDir)}; test ! -L ${q(p.releaseDir)}
if test -L ${q(p.current)}; then
  old=$(readlink -f ${q(p.current)})
  case "$old" in ${q(p.root)}/*) ;; *) exit 72 ;; esac
  test -f "$old/manifest.json"; test ! -L "$old/manifest.json"
  test -f "$old/compose.json"; test ! -L "$old/compose.json"
  printf '%s\\n' "$old"
else
  test ! -e ${q(p.current)}
  test -z "$(docker ps -aq --filter ${q('label=com.docker.compose.project='+plan.project)})"
  printf '\\n'
fi
mkdir ${q(p.releaseDir)}
cat > ${q(p.composeFile)}
trap 'rmdir ${q(p.lock+'/operation.lock')}' EXIT`,compose.source);
      owned=true;previous=result.stdout.trim()||null;
      if(previous){
        if(!previous.startsWith(p.root+'/')||!/^[-a-z0-9]+$/.test(previous.slice(p.root.length+1)))throw fail('VPS_DEPLOY_HISTORY_INVALID');
        const saved=await run(guard(plan)+`cat ${q(previous+'/manifest.json')}`);
        try{previousManifest=JSON.parse(saved.stdout)}catch{throw fail('VPS_DEPLOY_HISTORY_INVALID')}
        const old=previousManifest;
        if(old.clusterId!==plan.clusterId||old.project!==plan.project||old.releaseId!==previous.slice(p.root.length+1)
          ||!Array.isArray(old.services)||!old.services.every(s=>plan.services.some(v=>v.name===s.name)))throw fail('VPS_DEPLOY_HISTORY_INVALID');
        const oldHash=await run(guard(plan)+`sha256sum ${q(previous+'/compose.json')}`);
        if(oldHash.stdout.split(/\s/)[0]!==old.composeSha256)throw fail('VPS_DEPLOY_HISTORY_CHANGED');
        verify({...plan,services:old.services},await inspect(plan),{candidate:false});
      }
      const manifest={version:1,clusterId:plan.clusterId,project:plan.project,releaseId:plan.releaseId,
        composeSha256:plan.compose.sha256,services:plan.services,previousRelease:previousManifest?.releaseId??null};
      await run(guard(plan)+`cat > ${q(p.releaseDir+'/manifest.json')}`,JSON.stringify(manifest)+'\n');
    },
    async validate(plan){
      await run(guard(plan)+privateFiles(plan)+`\n${composeCmd(plan)} config --quiet\n`+
        plan.services.map(s=>`docker image inspect ${q(s.image)} >/dev/null`).join('\n'));
    },
    async start(plan){
      // No down, remove-orphans, volume deletion or implicit image pulls.
      await run(guard(plan)+privateFiles(plan)+`\n${composeCmd(plan)} up -d --pull never --wait --wait-timeout 90`,undefined,{timeoutMs:120000});
    },
    async health(plan){await run(guard(plan)+privateFiles(plan)+'\ntrue');verify(plan,await inspect(plan));return true},
    async commit(plan){
      await run(guard(plan)+privateFiles(plan)+`\ntest "$(sha256sum ${q(plan.paths.composeFile)} | cut -d ' ' -f 1)" = ${q(plan.compose.sha256)}
test ! -e ${q(plan.paths.current+'.'+token)}
ln -s ${q(plan.paths.releaseDir)} ${q(plan.paths.current+'.'+token)}
mv -Tf ${q(plan.paths.current+'.'+token)} ${q(plan.paths.current)}`);
    },
    async rollback(plan){
      if(!owned)throw fail('VPS_DEPLOY_LOCK_REQUIRED');
      const current=await inspect(plan),keep=new Set(previousManifest?.services.map(s=>s.name)??[]);
      // Only newly introduced containers are removed. Named volumes and
      // networks remain; the previous Compose restores replaced services.
      for(const c of current){
        const labels=c.Config?.Labels??{};
        if(labels['com.docker.compose.project']!==plan.project||labels['com.roomqc.cluster']!==plan.clusterId)
          throw fail('VPS_DEPLOY_CONTAINER_OWNERSHIP');
        if(keep.has(labels['com.docker.compose.service']))continue;
        if(labels['com.roomqc.release']!==plan.releaseId||!/^[a-f0-9]{64}$/.test(c.Id))throw fail('VPS_DEPLOY_CONTAINER_OWNERSHIP');
        await run(guard(plan)+`docker stop --time 10 ${q(c.Id)} >/dev/null\ndocker rm ${q(c.Id)} >/dev/null`);
      }
      if(previous){
        const saved=await run(guard(plan)+`cat ${q(previous+'/compose.json')}`);
        let oldFiles;try{oldFiles=deploymentEnvironmentFiles(JSON.parse(saved.stdout),plan.clusterId)}catch{throw fail('VPS_DEPLOY_HISTORY_INVALID')}
        await run(guard(plan)+verifyDeploymentEnvironments(oldFiles,plan.clusterId)+'\ntrue');
        await run(guard(plan)+`${composeCmd(plan,previous+'/compose.json')} up -d --pull never --wait --wait-timeout 90`,undefined,{timeoutMs:120000});
        verify({...plan,releaseId:previousManifest.releaseId,services:previousManifest.services},await inspect(plan));
      }else if((await inspect(plan)).length)throw fail('VPS_DEPLOY_ROLLBACK_INCOMPLETE');
    },
    async release(plan){
      if(!owned)return;
      await run(guard(plan)+`rm ${q(plan.paths.lock+'/owner')}
rm -f ${q(plan.paths.lock+'/run')}
rmdir ${q(plan.paths.lock+'/operation.lock')}
trap - EXIT
rmdir ${q(plan.paths.lock)}`);owned=false;
    },
  };
}
