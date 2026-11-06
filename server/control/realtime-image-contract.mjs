// Shared public build contract; no filesystem, Docker, credentials or runtime IO.
export const realtimeBaseImage='supabase/realtime@sha256:768b559241dd234c4e8852c5c0f504e598b80f1df2ad4dd78d5486fbed2f17a2';
export const realtimeSourceDateEpoch=1791523140;
export const realtimeImageSources=Object.freeze(['deploy/realtime/Dockerfile','deploy/realtime/bootstrap.exs','deploy/realtime/pool-guard.sql','deploy/realtime/extensions.ex','deploy/realtime/database.ex','deploy/realtime/runtime.exs','deploy/realtime/tenant-migrations.ex']);
const fail=code=>{throw Object.assign(new Error(code),{code})};
export const immutableRealtimeImage=image=>typeof image==='string'&&
  (/^sha256:[a-f0-9]{64}$/.test(image)||/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(image));
export function managedRealtimeProof(value,image){
  const keys=['schemaVersion','kind','imageRef','imageId','sourceHash','baseImage','sourceDateEpoch','rebuiltWithoutCache','deterministicImageMatch'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k))
    ||value.schemaVersion!==1||value.kind!=='roomqc-realtime-build'||value.imageRef!==image
    ||!/^sha256:[a-f0-9]{64}$/.test(value.imageId??'')||!/^[a-f0-9]{64}$/.test(value.sourceHash??'')
    ||image.startsWith('sha256:')&&value.imageId!==image
    ||value.baseImage!==realtimeBaseImage||value.sourceDateEpoch!==realtimeSourceDateEpoch
    ||value.rebuiltWithoutCache!==true||value.deterministicImageMatch!==true)
    fail('RESOURCE_MANAGED_REALTIME_PROOF_INVALID');
  return structuredClone(value);
}
