import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDirectoryInventories} from './roomqc-directory-backup-catalog.mjs';
const source=[{kind:'table',name:'roomqc_control.release_commands',owner:'postgres',acl:['operator=r/postgres','postgres=arwdDxt/postgres']}];
test('ACL ordering is ignored while raw source grants remain untouched',()=>{
 const restored=structuredClone(source);restored[0].acl.reverse();
 assert.equal(compareDirectoryInventories(source,restored),true);
 assert.equal(source[0].acl[0],'operator=r/postgres');
});
test('changed rights, grant option, grantee, grantor and owner still fail',()=>{
 for(const grant of ['operator=rw/postgres','operator=r*/postgres','PUBLIC=r/postgres','operator=r/other']){
  const restored=structuredClone(source);restored[0].acl[0]=grant;
  assert.equal(compareDirectoryInventories(source,restored),false);
 }
 assert.equal(compareDirectoryInventories(source,[{...source[0],owner:'other'}]),false);
 assert.equal(compareDirectoryInventories(source,[{...source[0],acl:null}]),false);
});
test('row hashes and every non-ACL catalog field remain exact',()=>{
 const data={kind:'data',name:'roomqc_control.workspaces',count:2,hash:'a'};
 assert.equal(compareDirectoryInventories([data],[{...data,hash:'b'}]),false);
 assert.equal(compareDirectoryInventories(source,[]),false);
 assert.throws(()=>compareDirectoryInventories(source,[{...source[0],acl:[{}]}]),/DIRECTORY_BACKUP_ACL_INVALID/);
});
test('implicit table owner default equals its explicit grant, while empty and public grants remain distinct',()=>{
 const owner={kind:'table',name:'roomqc_control.release_commands',owner:'roomqc_control_release_writer',acl:null};
 assert.equal(compareDirectoryInventories([owner],[{...owner,acl:['roomqc_control_release_writer=arwdDxt/roomqc_control_release_writer']}]),true);
 assert.equal(compareDirectoryInventories([owner],[{...owner,acl:[]}]),false);
 assert.equal(compareDirectoryInventories([owner],[{...owner,acl:['roomqc_control_release_writer=arwdDxt/roomqc_control_release_writer','=r/roomqc_control_release_writer']}]),false);
 assert.equal(compareDirectoryInventories([owner],[{...owner,acl:['roomqc_control_release_writer=arwdDxt/another_grantor']}]),false);
});
