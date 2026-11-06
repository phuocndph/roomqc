import {createHash} from 'node:crypto';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const cluster=id=>{if(typeof id!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(id))fail('VPS_DEPLOY_RELEASE_INVALID');return id};
export function deploymentEnvironmentFile(path,clusterId){
  const prefix=`/opt/RoomQC/clusters/${cluster(clusterId)}/config/env/`;
  if(typeof path!=='string'||!path.startsWith(prefix)||!/^[a-f0-9]{64}\.env$/.test(path.slice(prefix.length)))
    fail('VPS_DEPLOY_ENV_FILE_UNSAFE');
  return {path,sha256:path.slice(prefix.length,-4)};
}
export function deploymentEnvironmentFiles(model,clusterId){
  const files=new Map();
  for(const service of Object.values(model.services??{})){
    if(service.env_file===undefined)continue;
    if(!Array.isArray(service.env_file)||service.env_file.length!==1)fail('VPS_DEPLOY_ENV_FILE_UNSAFE');
    const value=service.env_file[0];
    if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='format,path,required'
      ||value.required!==true||value.format!=='raw')fail('VPS_DEPLOY_ENV_FILE_UNSAFE');
    const file=deploymentEnvironmentFile(value.path,clusterId);files.set(file.path,file);
  }
  return [...files.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
// Private input is converted to Compose's literal env-file format. Values never
// become shell code, Compose interpolation, a specification or a public receipt.
export function deploymentEnvironment(environment,clusterId){
  cluster(clusterId);
  if(!environment||typeof environment!=='object'||Array.isArray(environment)
    ||Object.keys(environment).length<1||Object.keys(environment).length>512)fail('VPS_DEPLOY_ENV_INVALID');
  const lines=[];
  for(const key of Object.keys(environment).sort()){
    const value=environment[key];
    if(!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key)||typeof value!=='string'||/[\x00-\x1f\x7f]/.test(value))
      fail('VPS_DEPLOY_ENV_INVALID');
    if(key==='ROOMQC_CONTROL_SIGNUP_ENABLED'&&value!=='false')fail('VPS_DEPLOY_SIGNUP_MUST_STAY_CLOSED');
    lines.push(key+'='+value);
  }
  const source=lines.join('\n')+'\n';
  if(Buffer.byteLength(source)>65536)fail('VPS_DEPLOY_ENV_INVALID');
  const sha256=createHash('sha256').update(source).digest('hex');
  return {source,sha256,path:`/opt/RoomQC/clusters/${clusterId}/config/env/${sha256}.env`,
    envFile:{path:`/opt/RoomQC/clusters/${clusterId}/config/env/${sha256}.env`,required:true,format:'raw'}};
}
