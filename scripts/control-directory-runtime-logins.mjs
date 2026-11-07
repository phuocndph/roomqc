import {pathToFileURL} from 'node:url';
import {directoryRuntimeLoginsMain} from '../server/control/directory-runtime-logins-cli.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await directoryRuntimeLoginsMain();
