import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prometheusConfiguration,nodeMountInclude,validateExporterSecrets,validateExporterSecretAccess} from '../server/control/monitoring-config.mjs';
import {validateTelemetryTarget,telemetryTargetFingerprint} from '../server/control/telemetry-source.mjs';

export async function renderMonitoring({target,output,secrets,tls,network,project}){
  const fail=()=>Object.assign(new Error('INVALID_MONITORING_INPUT'),{code:'INVALID_MONITORING_INPUT'});
  if(!/^roomqc-monitor-[a-z0-9-]{1,40}$/.test(project??'')||!/^[a-z0-9][a-z0-9_-]{1,80}$/.test(network??''))throw fail();
  for(const path of [target,output,secrets,tls])if(typeof path!=='string'||!isAbsolute(path)||/[\r\n\x00]/.test(path))throw fail();
  const definition=validateTelemetryTarget(JSON.parse(await readFile(target,'utf8')));
  const credentials={environment:definition.environment};
  for(const [field,file]of [['uri','postgres-uri'],['user','postgres-user'],['password','postgres-password']]){
    const path=join(secrets,file),info=await stat(path);if(!info.isFile()||info.size>4096)throw fail();
    if(process.platform!=='win32')validateExporterSecretAccess(info);
    credentials[field]=await readFile(path,'utf8');
  }
  const endpoint=validateExporterSecrets(credentials);
  if(endpoint.sslmode==='verify-full'){
    const ca=new URL('postgresql://'+credentials.uri.trim()).searchParams.get('sslrootcert');
    if(!(await stat(join(tls,ca.slice('/etc/roomqc/tls/'.length)))).isFile())throw fail();
  }else if(!(await stat(tls)).isDirectory())throw fail();
  const env={ROOMQC_MONITOR_PROJECT:project,ROOMQC_MONITOR_BACKEND_NETWORK:network,
    ROOMQC_MONITOR_CONFIG_DIR:output,ROOMQC_MONITOR_SECRET_DIR:secrets,ROOMQC_MONITOR_TLS_DIR:tls,
    ROOMQC_MONITOR_MOUNT_INCLUDE:nodeMountInclude(definition)};
  // Single quotes stop Compose interpolation inside values such as mount regex.
  for(const value of Object.values(env))if(/[\r\n'\x00]/.test(value))throw fail();
  // Never overwrite an existing bundle. Rendering does not run Docker or SQL.
  await mkdir(output,{mode:0o700});
  // Non-secret scrape configuration must be readable by the unprivileged container.
  await writeFile(join(output,'prometheus.yml'),JSON.stringify(prometheusConfiguration(definition),null,2)+'\n',{mode:0o644});
  await writeFile(join(output,'target.json'),JSON.stringify(definition,null,2)+'\n',{mode:0o600});
  await writeFile(join(output,'monitor.env'),Object.entries(env).map(([key,value])=>{
    const portable=key.endsWith('_DIR')?value.replaceAll('\\','/'):value;return key+"='"+portable+"'";
  }).join('\n')+'\n',{mode:0o600});
  return {rendered:true,targetFingerprint:telemetryTargetFingerprint(definition),scope:definition.measurementScope,output,project,deployPerformed:false};
}
async function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){
    console.log('Render only: node scripts/render-monitoring-config.mjs --target ABS_JSON --output NEW_ABS_DIR --secrets ABS_DIR --tls ABS_DIR --network APPROVED_NETWORK --project roomqc-monitor-NAME');return;
  }
  const options={};
  for(let i=0;i<args.length;i+=2){
    const key=args[i]?.slice(2);if(!args[i]?.startsWith('--')||!['target','output','secrets','tls','network','project'].includes(key)||!args[i+1]||Object.hasOwn(options,key))throw new Error('INVALID_MONITORING_ARGUMENT');
    options[key]=['target','output','secrets','tls'].includes(key)?resolve(args[i+1]):args[i+1];
  }
  console.log(JSON.stringify(await renderMonitoring(options)));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{
  console.error(JSON.stringify({event:'monitoring_render_failed',code:'INVALID_MONITORING_CONFIG'}));process.exitCode=1;
});
