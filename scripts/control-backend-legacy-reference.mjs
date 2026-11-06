// Source-only input for an owned old-binary diagnostic. Never mount its .local,
// env, logs or credentials. A historical manifest is not current acceptance.
import assert from 'node:assert/strict';
import {readFile,realpath,lstat} from 'node:fs/promises';
import {resolve,dirname,basename,join,isAbsolute} from 'node:path';
import {captureBackendSourceBinding,assertBackendSourceBinding} from './control-backend-source-binding.mjs';
export async function readLegacyBackendReference({repository,file}){
 assert(isAbsolute(file));const root=await realpath(repository),resolved=resolve(file),owned=dirname(resolved);
 assert.equal(dirname(owned),join(root,'.local'));assert.equal(basename(resolved),'ownership.json');
 assert.match(basename(owned),/^roomqc-backend-[a-f0-9]{12}-[A-Za-z0-9]+$/);
 for(const p of [join(root,'.local'),owned,resolved])assert.equal((await lstat(p)).isSymbolicLink(),false);
 assert((await lstat(resolved)).size<=8*1024*1024);const state=JSON.parse(await readFile(resolved,'utf8'));
 assert.equal(state.root,owned);assert.equal(state.cleaned,true);assert.notEqual(state.failed,true);
 assert.equal(state.sourceBindingVerifiedAtEnd,true);assert.equal(state.phase,'support_authority_diagnostic_verified');
 assert.equal(state.setupDispatchControls?.nativeSupportAuthority?.directoryMigrations,20);
 const location=join(owned,'cli-source'),actual=await captureBackendSourceBinding(location);
 assertBackendSourceBinding(state.sourceBinding,actual);
 const current=await captureBackendSourceBinding(root);
 for(const p of ['package-lock.json','server/control/package-lock.json'])
  assert.equal(actual.files.find(f=>f.path===p)?.sha256,current.files.find(f=>f.path===p)?.sha256,'Legacy diagnostic requires identical locked dependencies');
 return {location,source:actual,run:state.run,directoryMigrations:20};
}
