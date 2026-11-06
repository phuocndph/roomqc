import {shellQuote as q} from '../../server/control/vps-deploy.mjs';
import {reconciliationEvidence} from '../../server/control/deployment-reconciliation.mjs';

const fail=code=>Object.assign(new Error(code),{code});
/** Fences an old run; observes only. No start/stop, rollback, volume or image deletion. */
export function reconciliationRemoteAdapter(run){
  const token=p=>`reconcile-${p.journalRunId}`;
  const marker=p=>`${p.paths.clusterRoot}/closed-runs/${p.journalRunId}`;
  const guard=p=>`set -eu
mkdir ${q(p.paths.lock+'/operation.lock')} || exit 73
trap 'rmdir ${q(p.paths.lock+'/operation.lock')}' EXIT
test "$(cat ${q(p.paths.lock+'/owner')})" = ${q(token(p))}
test "$(cat ${q(p.paths.lock+'/run')})" = ${q(p.journalRunId)}
test "$(cat ${q(marker(p))})" = ${q(p.journalRunId)}
`;
  async function claim(p){
    await run(`set -eu
umask 077
for dir in /opt /opt/RoomQC /opt/RoomQC/clusters ${q(p.paths.clusterRoot)} ${q(p.paths.root)} ${q(p.paths.clusterRoot+'/closed-runs')} ${q(p.paths.lock)}; do test ! -L "$dir"; done
mkdir -p ${q(p.paths.root)}
if mkdir ${q(p.paths.lock)} 2>/dev/null; then
  mkdir ${q(p.paths.lock+'/operation.lock')}
  trap 'rmdir ${q(p.paths.lock+'/operation.lock')}' EXIT
  printf '%s' ${q(p.journalRunId)} > ${q(p.paths.lock+'/run')}
else
  mkdir ${q(p.paths.lock+'/operation.lock')} || exit 73
  trap 'rmdir ${q(p.paths.lock+'/operation.lock')}' EXIT
  test -f ${q(p.paths.lock+'/run')}; test ! -L ${q(p.paths.lock+'/run')}
  test "$(cat ${q(p.paths.lock+'/run')})" = ${q(p.journalRunId)}
fi
test ! -L ${q(p.paths.lock+'/owner')}
printf '%s' ${q(token(p))} > ${q(p.paths.lock+'/owner')}
mkdir -p ${q(p.paths.clusterRoot+'/closed-runs')}
test ! -L ${q(marker(p))}
if test -e ${q(marker(p))}; then test "$(cat ${q(marker(p))})" = ${q(p.journalRunId)};
else printf '%s' ${q(p.journalRunId)} > ${q(marker(p))}; fi`);
  }
  async function manifest(p,id){
    if(!/^[a-z][a-z0-9-]{1,39}$/.test(id))throw fail('DEPLOYMENT_RECONCILIATION_MANIFEST_INVALID');
    const root=`${p.paths.root}/${id}`;
    const result=await run(guard(p)+`test ! -L ${q(root)}
if test -d ${q(root)}; then
  test ! -L ${q(root+'/manifest.json')}; test ! -L ${q(root+'/compose.json')}
  ${id===p.releaseId&&p.phaseIndex===1?`if test ! -e ${q(root+'/manifest.json')}; then printf PARTIAL; exit 0; fi`:''}
  test -f ${q(root+'/manifest.json')}; test -f ${q(root+'/compose.json')}
  test "$(wc -c < ${q(root+'/manifest.json')})" -le 65536
  sha256sum ${q(root+'/compose.json')}
  cat ${q(root+'/manifest.json')}
fi`);
    if(!result.stdout.trim())return null;
    if(result.stdout.trim()==='PARTIAL')return {partial:true};
    const split=result.stdout.indexOf('\n'),composeSha256=result.stdout.slice(0,split).split(/\s/)[0];
    try{return {composeSha256,manifest:JSON.parse(result.stdout.slice(split+1))}}catch{throw fail('DEPLOYMENT_RECONCILIATION_MANIFEST_INVALID')}
  }
  return {
    async observe(p){
      await claim(p);
      const result=await run(guard(p)+`if test -L ${q(p.paths.current)}; then
  current=$(readlink -f ${q(p.paths.current)})
  case "$current" in ${q(p.paths.root)}/*) ;; *) exit 72 ;; esac
  test "$current" = ${q(p.paths.root)}/"$(basename "$current")"
  basename "$current"
else test ! -e ${q(p.paths.current)}; fi`);
      const currentRelease=result.stdout.trim()||null;
      const candidate=await manifest(p,p.releaseId),current=currentRelease===p.releaseId?candidate:currentRelease?await manifest(p,currentRelease):null;
      const inspected=await run(guard(p)+`ids=$(docker ps -aq --filter ${q('label=com.docker.compose.project='+p.project)})
if test -n "$ids"; then docker inspect $ids; else printf '[]'; fi`);
      let containers;try{containers=JSON.parse(inspected.stdout)}catch{throw fail('DEPLOYMENT_RECONCILIATION_CONTAINERS_INVALID')}
      return reconciliationEvidence(p,{currentRelease,candidate,current,containers});
    },
    async release(p){
      // No lock is also a valid cleanup retry; a different run's lock is never removed.
      const result=await run(`set -eu\ntest ! -L ${q(p.paths.lock)}\nif test -d ${q(p.paths.lock)}; then printf present; fi`);
      if(!result.stdout.trim())return;
      await run(guard(p)+`rm ${q(p.paths.lock+'/owner')} ${q(p.paths.lock+'/run')}
rmdir ${q(p.paths.lock+'/operation.lock')}
trap - EXIT
rmdir ${q(p.paths.lock)}`);
    },
  };
}
