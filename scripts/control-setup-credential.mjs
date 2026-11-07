import {pathToFileURL} from 'node:url';
import {runSetupCredentialInstaller} from '../server/control/setup-credential-installer.mjs';
export async function setupCredentialMain(args=process.argv.slice(2)){
  try{
    const result=await runSetupCredentialInstaller(args);
    if(result.help)process.stdout.write('RoomQC setup credential installer. --config-file <absolute private JSON> --command-file <absolute private JSON> [--allow-local]. Operations: check, bind, issue, publish, revoke. Secrets only in private files; output is sanitized. Linux required outside local.\n');
    else process.stdout.write(JSON.stringify(result)+'\n');
  }catch(error){process.stdout.write(JSON.stringify({ok:false,code:error.code??'SETUP_INSTALLER_UNAVAILABLE',...(error.recovery?{recovery:error.recovery}:{})})+'\n');process.exitCode=1}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await setupCredentialMain();
