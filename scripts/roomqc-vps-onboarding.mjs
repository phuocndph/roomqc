import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildOnboardingPlan,onboardingArguments,runOnboardingFixture,summarizeCompose,redactOnboardingPlan} from '../server/control/vps-onboarding.mjs';

async function main(args=process.argv.slice(2),output=console){
  try{
    const parsed=onboardingArguments(args);
    if(parsed.help){output.log('Usage: node scripts/roomqc-vps-onboarding.mjs --inventory-file ABSOLUTE_JSON --cluster-id CLUSTER_ID --release-id RELEASE_ID --image IMAGE@sha256:DIGEST --compose-file ABSOLUTE_COMPOSE [--mode plan|fixture] [--output ABSOLUTE_JSON]');return 0}
    if(parsed.mode==='execute')throw Object.assign(new Error('Use the release deploy command for execute mode.'),{code:'VPS_ONBOARDING_MODE_INVALID'});
    const document=JSON.parse(await readFile(parsed.inventoryFile,'utf8'));
    const compose=summarizeCompose(await readFile(parsed.composeFile,'utf8'),{image:parsed.image});
    const plan=redactOnboardingPlan(buildOnboardingPlan(document,parsed,{allowLocal:process.env.NODE_ENV!=='production'&&process.env.ROOMQC_HOST_INVENTORY_ALLOW_LOCAL==='true',compose}));
    const result=parsed.mode==='fixture'?{plan,fixture:runOnboardingFixture(plan,{health:process.env.ROOMQC_ONBOARDING_FIXTURE_HEALTH!=='fail'})}:plan;
    if(parsed.output)await writeFile(resolve(parsed.output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    output.log(JSON.stringify({ok:true,mode:parsed.mode,decision:plan.decision,fixture:result.fixture?.status??null,output:parsed.output??null}));
    return plan.decision==='ready'&&(!result.fixture||result.fixture.status==='health_gate_passed')?0:2;
  }catch(error){output.error(JSON.stringify({ok:false,code:error?.code??'VPS_ONBOARDING_FAILED'}));return 1}
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)process.exitCode=await main();

export {main};
