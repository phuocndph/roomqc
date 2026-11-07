import test from 'node:test';
import assert from 'node:assert/strict';
import {withoutPublicDirectoryCa,directoryCaTarget,directoryCaFile} from './directory-ca-mount.mjs';
const fixture=()=>({environment:{NODE_EXTRA_CA_CERTS:directoryCaFile},volumes:[{type:'volume',source:'directory-ca',target:directoryCaTarget,read_only:true}]});
test('only a separate whole public read-only CA volume can supply extra Node trust',()=>{
 const service=fixture(),original=structuredClone(service);assert.deepEqual(withoutPublicDirectoryCa(service),[]);assert.deepEqual(service,original);
 delete service.environment.NODE_EXTRA_CA_CERTS;assert.deepEqual(withoutPublicDirectoryCa(service),[]);
 assert.deepEqual(withoutPublicDirectoryCa({}),[]);
 for(const change of [s=>s.volumes[0].type='bind',s=>s.volumes[0].read_only=false,s=>s.volumes[0].source='/host/private',
  s=>s.volumes[0].source='',s=>s.volumes[0].bind={},s=>s.volumes[0].volume={subpath:'private'},s=>s.volumes[0].target+='/ca.crt',
  s=>s.volumes.push({...s.volumes[0]}),s=>s.volumes=[],s=>s.volumes='bad',s=>s.volumes=[null],
  s=>s.environment.NODE_EXTRA_CA_CERTS='/app/key.pem',s=>s.environment.NODE_EXTRA_CA_CERTS='',s=>s.environment.NODE_TLS_REJECT_UNAUTHORIZED='0']){
  const s=fixture();change(s);assert.throws(()=>withoutPublicDirectoryCa(s),{code:'RESOURCE_DEPLOYMENT_MOUNT_INVALID'});
 }
});
