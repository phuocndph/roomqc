import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=(await readdir(new URL('../server/control/',import.meta.url)))
  .filter(name=>name.endsWith('.test.mjs')).map(name=>'server/control/'+name);
const child=spawn(process.execPath,['--test',...files],{cwd:root,stdio:'inherit',env:{...process.env,ROOMQC_CONTROL_DB_TEST:'true'}});
child.on('error',()=>{process.exitCode=1});child.on('exit',code=>{process.exitCode=code??1});
