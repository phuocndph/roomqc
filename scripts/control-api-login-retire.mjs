import {pathToFileURL} from 'node:url';
import {controlApiLoginRetireMain} from '../server/control/control-login-retirement-cli.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await controlApiLoginRetireMain();
