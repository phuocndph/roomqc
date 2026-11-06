import {pathToFileURL} from 'node:url';
import {runReleaseInstaller} from './release-installer.mjs';

export async function releaseInstallerMain(args=process.argv.slice(2),env=process.env,output=console){
  try{
    const result=await runReleaseInstaller(args,env);
    if(result.help)output.log('Usage: node server/control/release-installer-cli.mjs --config-file ABSOLUTE_PRIVATE_FILE --command-file ABSOLUTE_PRIVATE_FILE');
    else output.log(JSON.stringify(result));
    return result.ready===false?2:0;
  }catch(error){
    output.error(JSON.stringify({ok:false,code:error.code,...(error.recovery?{recovery:error.recovery}:{})}));
    return 1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  process.exitCode=await releaseInstallerMain();
}
