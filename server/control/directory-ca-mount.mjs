import {ControlError} from './errors.mjs';

export const directoryCaTarget='/run/roomqc-directory-ca';
export const directoryCaFile=directoryCaTarget+'/ca.crt';
const fail=()=>{throw new ControlError(400,'RESOURCE_DEPLOYMENT_MOUNT_INVALID','Cấu hình chứng chỉ database chưa hợp lệ.')};
export const directoryCaVolumeName=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/.test(value);

// The only extra mount is a whole, read-only public certificate volume. This
// does not authorize host paths, private keys, code overlays or arbitrary CAs.
export function withoutPublicDirectoryCa(service){
  const mounts=service.volumes??[];
  if(!Array.isArray(mounts)||mounts.some(m=>!m||typeof m!=='object'||Array.isArray(m)))fail();
  const matches=mounts.filter(m=>m.target===directoryCaTarget),ca=matches[0];
  if(matches.length>1||ca&&(ca.type!=='volume'||ca.read_only!==true||!directoryCaVolumeName(ca.source)
    ||ca.bind!==undefined||ca.volume?.subpath!==undefined||ca.image!==undefined))fail();
  const env=service.environment??{};
  if(Object.hasOwn(env,'NODE_EXTRA_CA_CERTS')&&(env.NODE_EXTRA_CA_CERTS!==directoryCaFile||!ca))fail();
  if(Object.hasOwn(env,'NODE_TLS_REJECT_UNAUTHORIZED')&&env.NODE_TLS_REJECT_UNAUTHORIZED!=='1')fail();
  return mounts.filter(m=>m!==ca);
}
