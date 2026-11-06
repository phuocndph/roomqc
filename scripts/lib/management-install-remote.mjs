import {assertManagementInstallPlan} from '../../server/control/management-install-plan.mjs';
import {shellQuote as q} from '../../server/control/vps-deploy.mjs';

export function managementInstallRemoteScript(plan,mode){
 assertManagementInstallPlan(plan);
 if(!['prepare','initialize','resume','verify'].includes(mode))throw Error('MANAGEMENT_INSTALL_MODE_INVALID');
 const operationMode=mode==='prepare'?'initialize':mode;
 const raw=plan.descriptor,root=plan.root,control=raw.images.control,compose=root+'/output/management.compose.json';
 const d='env -u DOCKER_HOST -u DOCKER_CONTEXT docker --host unix:///var/run/docker.sock';
 const helper=(action,{mounts='',args='',input=false}={})=>`${d} run --rm ${input?'-i ':''}--read-only --network none --user 0:0 --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER --security-opt no-new-privileges --pids-limit 64 --memory 128m --cpus 0.5 --mount ${q('type=bind,source='+root+',target='+root)} ${mounts} --entrypoint node ${q(control)} management-install-assets.mjs ${q(action)} ${q(root)} ${q(operationMode)} ${args}`;
 const labels=[q('roomqc.management.install='+plan.deploymentId),q('roomqc.management.spec='+plan.specSha256)];
 const resourceChecks=Object.entries(raw.networks).map(([kind,name])=>{
  const internal=['directory','metrics'].includes(kind);
  return `if ${d} network inspect ${q(name)} >/dev/null 2>&1; then
test "$(${d} network inspect --format '{{index .Labels "roomqc.management.install"}}:{{index .Labels "roomqc.management.spec"}}' ${q(name)})" = ${q(plan.deploymentId+':'+plan.specSha256)}
test "$(${d} network inspect --format '{{.Internal}}' ${q(name)})" = ${q(String(internal))}
else
test ${q(mode)} != verify
${d} network create ${internal?'--internal ':''}--label ${labels[0]} --label ${labels[1]} ${q(name)} >/dev/null
fi`;
 }).concat(Object.values(raw.volumes).map(name=>`if ${d} volume inspect ${q(name)} >/dev/null 2>&1; then
test "$(${d} volume inspect --format '{{index .Labels "roomqc.management.install"}}:{{index .Labels "roomqc.management.spec"}}:{{.Driver}}' ${q(name)})" = ${q(plan.deploymentId+':'+plan.specSha256+':local')}
else
test ${q(mode)} != verify
${d} volume create --driver local --label ${labels[0]} --label ${labels[1]} ${q(name)} >/dev/null
fi`)).join('\n');
 const ancestors=['/opt','/opt/RoomQC','/opt/RoomQC/management'].map(p=>`test ! -L ${q(p)}
if ! test -e ${q(p)}; then test ${q(operationMode)} = initialize; mkdir -m 700 ${q(p)}; fi
test -d ${q(p)}; test "$(stat -c %u ${q(p)})" = 0; test $((0$(stat -c %a ${q(p)}) & 0022)) -eq 0`).join('\n');
 const volumeMounts=[['data','/install-data'],['private','/install-private'],['ca','/install-ca']].map(([key,target])=>'--mount '+q('type=volume,source='+raw.volumes[key]+',target='+target+(mode==='verify'?',readonly':''))).join(' ');
 const bootstrap=`${d} run --rm --read-only --network ${q(raw.networks.directory)} --user 1000:1000 --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 128m --cpus 0.5 --env NODE_EXTRA_CA_CERTS=/run/roomqc-directory-ca/ca.crt --mount ${q('type=bind,source='+root+'/operator,target=/bootstrap,readonly')} --mount ${q('type=bind,source='+plan.runtimeDirectory+',target=/runtime'+(mode==='verify'?',readonly':''))} --mount ${q('type=volume,source='+raw.volumes.ca+',target=/run/roomqc-directory-ca,readonly')} --entrypoint node ${q(control)} management-bootstrap-cli.mjs --config-file /bootstrap/bootstrap.json --${operationMode}`;
 const identity="SELECT json_build_object('databaseName',current_database(),'databaseOid',d.oid::text,'systemIdentifier',(pg_control_system()).system_identifier::text) FROM pg_database d WHERE datname=current_database()";
 const images={'roomqc-directory':raw.images.directory,'roomqc-control':raw.images.control,'roomqc-web':raw.images.frontend};
 for(const [kind,name]of [['health','health-worker'],['setup','setup-worker'],['alert','alert-worker']])if(raw.workers[kind])images[name]=control;
 const script=`set -eu
umask 077
export COMPOSE_DISABLE_ENV_FILE=true
phase=preflight
trap 'printf "ROOMQC_MANAGEMENT_PHASE=%s\\n" "$phase" >&2' EXIT
test "$(id -u)" = 0
command -v flock >/dev/null
command -v openssl >/dev/null
command -v sha256sum >/dev/null
docker_root=$(${d} info --format '{{.DockerRootDir}}')
test -d "$docker_root"
df -P -B1 "$docker_root" | awk 'NR==2 {if ($4-${plan.requiredDiskBytes} < $2*0.15) exit 1}'
df -P -i "$docker_root" | awk 'NR==2 {if ($4 < $2*0.15) exit 1}'
free -b | awk 'NR==2 {if ($7 < ${plan.memoryRequiredBytes}) exit 1}'
test "$(nproc)" -ge ${Math.ceil(plan.cpusRequired)}
${[...new Set(Object.values(raw.images))].map(image=>`${d} image inspect ${q(image)} >/dev/null`).join('\n')}
test "$(${d} image inspect --format '{{index .Config.Labels "roomqc.control.backend"}}' ${q(control)})" = ${q(plan.backendSourceSha256)}
phase=owner
${ancestors}
test ! -L ${q(root)}
if test ${q(operationMode)} = initialize; then
 test ! -e ${q(root)}
 mkdir -m 700 ${q(root)}
 printf '%s\\n' ${q(plan.specSha256)} > ${q(root+'/.roomqc-install-owner')}
 : > ${q(root+'/.install.lock')}
else
 test -d ${q(root)}
fi
test "$(stat -c %u:%a ${q(root)})" = '0:700'
test ! -L ${q(root+'/.roomqc-install-owner')}
test "$(stat -c %u:%a:%h ${q(root+'/.roomqc-install-owner')})" = '0:600:1'
test "$(cat ${q(root+'/.roomqc-install-owner')})" = ${q(plan.specSha256)}
test ! -L ${q(root+'/.install.lock')}
test "$(stat -c %u:%a:%h ${q(root+'/.install.lock')})" = '0:600:1'
exec 9<>${q(root+'/.install.lock')}
flock -n 9
phase=resources
${resourceChecks}
phase=assets
${helper('prepare',{input:true})}
phase=tls
if ! test -e ${q(root+'/private/tls')}; then
 test ${q(mode)} != verify
 tls_stage=$(mktemp -d ${q(root+'/private/.tls.XXXXXXXXXX')})
 openssl req -x509 -newkey rsa:2048 -nodes -keyout "$tls_stage/ca.key" -out "$tls_stage/ca.crt" -days 3650 -subj /CN=RoomQC-Directory-${plan.deploymentId} >/dev/null 2>&1
 openssl req -newkey rsa:2048 -nodes -keyout "$tls_stage/server.key" -out "$tls_stage/server.csr" -subj /CN=roomqc-directory >/dev/null 2>&1
 printf 'subjectAltName=DNS:roomqc-directory\\nextendedKeyUsage=serverAuth\\n' > "$tls_stage/server.ext"
 openssl x509 -req -in "$tls_stage/server.csr" -CA "$tls_stage/ca.crt" -CAkey "$tls_stage/ca.key" -CAcreateserial -out "$tls_stage/server.crt" -days 365 -extfile "$tls_stage/server.ext" >/dev/null 2>&1
 openssl rand -hex 32 > "$tls_stage/admin-password"
 rm "$tls_stage/server.csr" "$tls_stage/server.ext" "$tls_stage/ca.srl"
 mv -T "$tls_stage" ${q(root+'/private/tls')}
fi
test ! -L ${q(root+'/private/tls')}
test "$(stat -c %u:%a ${q(root+'/private/tls')})" = '0:700'
openssl verify -CAfile ${q(root+'/private/tls/ca.crt')} -verify_hostname roomqc-directory ${q(root+'/private/tls/server.crt')} >/dev/null
openssl x509 -checkend 86400 -noout -in ${q(root+'/private/tls/server.crt')} >/dev/null
${helper('volumes',{mounts:volumeMounts})}
phase=directory
${mode==='verify'?'':`${d} compose --project-name ${q(plan.project)} -f ${q(compose)} up -d --no-build --pull never --wait --wait-timeout 90 roomqc-directory`}
identity=$(${d} compose --project-name ${q(plan.project)} -f ${q(compose)} exec -T --user 70:70 roomqc-directory psql -X -A -t -v ON_ERROR_STOP=1 -U postgres -d roomqc_control -c ${q(identity)})
${helper('bootstrap',{args:'"$identity"'})}
${bootstrap}
phase=services
${['prepare','verify'].includes(mode)?'':`${d} compose --project-name ${q(plan.project)} -f ${q(compose)} up -d --no-build --pull never --wait --wait-timeout 90`}
${Object.entries(images).filter(([name])=>mode!=='prepare'||name==='roomqc-directory').map(([name,image])=>`id=$(${d} compose --project-name ${q(plan.project)} -f ${q(compose)} ps -q ${q(name)})
test -n "$id"
test "$(${d} inspect --format '{{index .Config.Labels "roomqc.management.install"}}:{{index .Config.Labels "roomqc.management.spec"}}:{{.State.Health.Status}}' "$id")" = ${q(plan.deploymentId+':'+plan.specSha256+':healthy')}
test "$(${d} inspect --format '{{.Image}}' "$id")" = "$(${d} image inspect --format '{{.Id}}' ${q(image)})"`).join('\n')}
${mode==='prepare'?`phase=directory_prepared
test "$(${d} container ls --all -q --filter ${q('label=com.docker.compose.project='+plan.project)} | wc -l)" -eq 1`:`phase=closed_signup
${d} compose --project-name ${q(plan.project)} -f ${q(compose)} exec -T roomqc-control node -e ${q("if(process.env.ROOMQC_CONTROL_SIGNUP_ENABLED!=='false'||process.env.ROOMQC_CONTROL_SETUP_DISPATCH_ENABLED!=='false')process.exit(1);fetch('http://127.0.0.1:8091/api/control/signup-intents',{method:'POST',headers:{Origin:process.env.ROOMQC_PUBLIC_URL,'Content-Type':'application/json'},body:'{}'}).then(async r=>{if(r.status!==503||(await r.json()).error!=='SIGNUP_CLOSED')process.exit(1)}).catch(()=>process.exit(1))")}
`}
printf '%s\\n' ${q(JSON.stringify({ok:true,mode,deploymentId:plan.deploymentId,specSha256:plan.specSha256,signupOpened:false,deploymentReady:false,...(mode==='prepare'?{directoryPrepared:true,runtimeStarted:false}:{})}))}
`;
 // A connection failure stays a transport error. A remote phase failure returns
 // a bounded receipt, without returning configuration, commands or stderr.
 return 'set +e\n(\n'+script+'\n)\nroomqc_status=$?\nif test "$roomqc_status" != 0; then printf \'%s\\n\' '+q(JSON.stringify({ok:false,code:'MANAGEMENT_INSTALL_REMOTE_FAILED',signupOpened:false,deploymentReady:false}))+'; fi\n';
}
