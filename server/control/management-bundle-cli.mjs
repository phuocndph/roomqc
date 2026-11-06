import {pathToFileURL} from 'node:url';
import {isAbsolute,join} from 'node:path';
import {lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {renderManagementBundle} from './management-bundle.mjs';
import {readSetupBackfillFile,assertSetupBackfillAccess} from './setup-backfill-files.mjs';
import {writeDirectoryPrivateFile} from './directory-runtime-logins-cli.mjs';
const fail=()=>{throw Object.assign(new Error('MANAGEMENT_BUNDLE_OUTPUT_CHANGED'),{code:'MANAGEMENT_BUNDLE_OUTPUT_CHANGED'})};
export async function managementBundleMain(args=process.argv.slice(2),{output=process.stdout}={}){
 if(args.length===1&&args[0]==='--help'){
  output.write('RoomQC management Compose bundle. --config-file ABSOLUTE_PRIVATE_JSON --output-directory ABSOLUTE_PRIVATE_DIRECTORY. Requires version1 descriptor and explicit shared budget; outputs file references only. Does not create Docker resources, connect to a database, start services or open signup.\n');return 0;
 }
 try{
  if(args.length!==4||args[0]!=='--config-file'||args[2]!=='--output-directory'||![args[1],args[3]].every(isAbsolute))fail();
  const raw=JSON.parse(await readSetupBackfillFile(args[1],32768));
  const budgetBytes=await readSetupBackfillFile(raw.files.budget,128*1024),budget=JSON.parse(budgetBytes);
  const bundle=renderManagementBundle(raw,budget),path=join(args[3],'management.compose.json');
  await assertSetupBackfillAccess(args[3],{directory:true});
  const content=JSON.stringify(bundle.compose,null,2)+'\n';
  let present=false;try{await lstat(path);present=true}catch(error){if(error.code!=='ENOENT')throw error}
  if(present){if(await readSetupBackfillFile(path,256*1024)!==content)fail()}
  else await writeDirectoryPrivateFile(path,content);
  output.write(JSON.stringify({ok:true,...bundle.report,composeSha256:createHash('sha256').update(content).digest('hex'),
   resourceBudgetSha256:createHash('sha256').update(budgetBytes).digest('hex')})+'\n');return 0;
 }catch(error){
  output.write(JSON.stringify({ok:false,code:['MANAGEMENT_BUNDLE_INVALID','MANAGEMENT_BUNDLE_OUTPUT_CHANGED'].includes(error?.code)?error.code:'MANAGEMENT_BUNDLE_FAILED',
   signupOpened:false,deploymentReady:false})+'\n');return 1;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await managementBundleMain();
