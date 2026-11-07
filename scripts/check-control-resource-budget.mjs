import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {loadResourceBudget} from '../server/control/resource-budget.mjs';

export function checkResourceBudget(path){return loadResourceBudget(resolve(path))}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv.length!==3)throw Object.assign(new Error('Usage: node scripts/check-control-resource-budget.mjs <metadata.json>'),{code:'RESOURCE_BUDGET_PATH_REQUIRED'});
    const result=checkResourceBudget(process.argv[2]);
    console.log(JSON.stringify({event:'resource_budget_checked',...result}));
  }catch(error){console.error(JSON.stringify({event:'resource_budget_failed',code:error.code??'INVALID_RESOURCE_BUDGET'}));process.exitCode=1}
}
