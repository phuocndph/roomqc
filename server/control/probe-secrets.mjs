import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {ControlError} from './errors.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';

const id=/^[a-z][a-z0-9-]{1,63}$/;
export const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export const probeError=code=>new ControlError(503,code,'Phiên giám sát chưa sẵn sàng; cần kiểm tra cấu hình hoặc phục hồi.');
function aad(context,keyId){
  if(!exact(context,['clusterId','credentialRef','bindingHash','revision'])||!/^[a-z][a-z0-9-]{1,39}$/.test(context.clusterId)
    ||!id.test(context.credentialRef)||!/^[a-f0-9]{64}$/.test(context.bindingHash)
    ||!Number.isSafeInteger(context.revision)||context.revision<1)throw probeError('PROBE_SECRET_CONTEXT');
  return Buffer.from(JSON.stringify({version:1,keyId,clusterId:context.clusterId,credentialRef:context.credentialRef,
    bindingHash:context.bindingHash,revision:context.revision}));
}
function decode(value,length,max){
  if(typeof value!=='string'||!value||value.length>max*2)throw probeError('PROBE_SECRET_INVALID');
  const bytes=Buffer.from(value,'base64url');
  if(bytes.toString('base64url')!==value||bytes.length>max||(length&&bytes.length!==length))throw probeError('PROBE_SECRET_INVALID');
  return bytes;
}
export class ProbeKeyring {
  #keys; #active;
  constructor({activeKeyId,keys}){
    if(!id.test(activeKeyId)||!(keys instanceof Map)||keys.size<1||keys.size>4||!keys.has(activeKeyId)
      ||[...keys].some(([name,key])=>!id.test(name)||!Buffer.isBuffer(key)||key.length!==32))throw probeError('PROBE_KEYRING_INVALID');
    this.#active=activeKeyId;this.#keys=new Map([...keys].map(([name,key])=>[name,Buffer.from(key)]));
  }
  seal(value,context){
    const plain=Buffer.from(JSON.stringify(value));
    if(plain.length<1||plain.length>40000)throw probeError('PROBE_SECRET_INVALID');
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.#keys.get(this.#active),nonce);
    try{
      cipher.setAAD(aad(context,this.#active));
      const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);
      return {version:1,keyId:this.#active,nonce:nonce.toString('base64url'),
        ciphertext:ciphertext.toString('base64url'),tag:cipher.getAuthTag().toString('base64url')};
    }finally{plain.fill(0)}
  }
  unseal(envelope,context){
    if(!exact(envelope,['version','keyId','nonce','ciphertext','tag'])||envelope.version!==1||!id.test(envelope.keyId))throw probeError('PROBE_SECRET_INVALID');
    const key=this.#keys.get(envelope.keyId);if(!key)throw probeError('PROBE_KEY_UNAVAILABLE');
    let plain;
    try{
      const cipher=createDecipheriv('aes-256-gcm',key,decode(envelope.nonce,12,12));
      cipher.setAAD(aad(context,envelope.keyId));cipher.setAuthTag(decode(envelope.tag,16,16));
      plain=Buffer.concat([cipher.update(decode(envelope.ciphertext,null,40000)),cipher.final()]);
      return JSON.parse(plain.toString('utf8'));
    }catch{throw probeError('PROBE_SECRET_INVALID')}finally{plain?.fill(0)}
  }
}
// Only absolute private files, never an env value or HTTP body containing keys.
// Windows ACL provisioning is an installer requirement, not inferred from mode.
export async function loadProbeKeyring(path){
  try{
    const text=await boundedHealthFile(path,8192,{sensitive:true});
    const raw=JSON.parse(text);
    if(!exact(raw,['version','activeKeyId','keys'])||raw.version!==1||!raw.keys||Array.isArray(raw.keys)
      ||Object.keys(raw.keys).length>4||Object.values(raw.keys).some(key=>typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)))throw probeError('PROBE_KEYRING_INVALID');
    return new ProbeKeyring({activeKeyId:raw.activeKeyId,keys:new Map(Object.entries(raw.keys).map(([name,key])=>[name,Buffer.from(key,'hex')]))});
  }catch{throw probeError('PROBE_KEYRING_INVALID')}
}
