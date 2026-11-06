import {pathToFileURL} from 'node:url';
import {directoryRuntimeWiringMain} from '../server/control/directory-runtime-wiring-cli.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await directoryRuntimeWiringMain();
