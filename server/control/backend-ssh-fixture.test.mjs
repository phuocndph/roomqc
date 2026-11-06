import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {backendDeploymentModel,backendContainerArguments} from '../../scripts/control-backend-ssh-deployment.mjs';

const image='roomqc/fixture@sha256:'+'d'.repeat(64),assetsRoot=resolve('.local/owned-assets');
function fixture(){return {clusterId:'probe-fixture',releaseId:'backend-fixture',assetsRoot,
  remoteAssets:'/opt/RoomQC/clusters/probe-fixture/config/assets',publishableKey:'fixture-anon',images:{db:image,realtime:image},
  bundle:{services:{db:{container_name:'legacy-db',image,environment:{PASSWORD:'fixture-secret',PORT:5432},
    healthcheck:{test:['CMD','true']},volumes:[{type:'bind',source:join(assetsRoot,'db/init.sql'),target:'/init.sql'}]},
    realtime:{image,environment:{JWT_SECRET:'fixture-secret'},healthcheck:{test:['CMD-SHELL','curl -H "Authorization: Bearer fixture-anon" localhost']}}},
    networks:{default:{name:'legacy-network',internal:true}},volumes:{data:{name:'legacy-volume'}}}};}
test('full backend SSH fixture preserves services while applying the unchanged product release restrictions',()=>{
  const result=backendDeploymentModel(fixture());const source=JSON.stringify(result.model);
  assert(!source.includes('fixture-secret'));assert(!source.includes('fixture-anon'));assert(!source.includes(assetsRoot));
  assert(!source.includes('container_name'));assert(!source.includes('legacy-network'));assert(!source.includes('legacy-volume'));
  assert.equal(result.model.services.db.volumes[0].read_only,true);
  assert.equal(result.environments.db.PORT,'5432');assert.equal(result.environments.db.ROOMQC_CONTROL_SIGNUP_ENABLED,'false');
  assert.equal(result.environments.realtime.ROOMQC_SSH_HEALTH_TOKEN,'fixture-anon');
  assert(result.model.services.realtime.healthcheck.test[1].includes('$$ROOMQC_SSH_HEALTH_TOKEN'));
});
test('SSH fixture cannot include files from outside its owned asset tree or relax immutable image/health checks',()=>{
  const foreign=fixture();foreign.bundle.services.db.volumes[0].source=resolve('foreign.sql');assert.throws(()=>backendDeploymentModel(foreign));
  const mutable=fixture();mutable.images.db='roomqc/fixture:latest';assert.throws(()=>backendDeploymentModel(mutable));
  const unwell=fixture();delete unwell.bundle.services.db.healthcheck;assert.throws(()=>backendDeploymentModel(unwell));
});
test('container mapping is limited to exact diagnostic services and leaves production/default test arguments unchanged',()=>{
  const args=['exec','roomqc-probe-fixture-db','container:roomqc-probe-fixture-realtime','other-db'];
  assert.deepEqual(backendContainerArguments(args,{projectId:'roomqc-probe-fixture'}),args);
  assert.deepEqual(backendContainerArguments(args,{projectId:'roomqc-probe-fixture',sshDeployment:{services:['db','realtime']}}),
    ['exec','roomqc-probe-fixture-db-1','container:roomqc-probe-fixture-realtime-1','other-db']);
});
