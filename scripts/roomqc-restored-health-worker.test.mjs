import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {recoveryLayerDataPath,recoveryDeviceMount,recoveryHostReaderProgram} from './roomqc-restored-health-worker.mjs';
const root='20 1 0:45 / / rw - overlay overlay rw,lowerdir=/images/base,upperdir=/var/lib/containerd/snapshots/42/fs,workdir=/var/lib/containerd/snapshots/42/work';
const host=['1 0 0:1 / / rw - overlay overlay rw',
 '2 1 8:64 / /mnt/docker-disk rw - ext4 /dev/sde rw',
 '3 1 8:64 / /run/desktop/mnt/docker-disk rw - ext4 /dev/sde rw',
 '4 1 8:48 / /parent-distro rw - ext4 /dev/sdd rw'].join('\n');
test('recovery maps the actual owned PG writable layer to its filesystem across Docker namespace aliases',()=>{
 assert.equal(recoveryLayerDataPath(root,'/tmp/roomqc-restore-data'),'/var/lib/containerd/snapshots/42/fs/tmp/roomqc-restore-data');
 assert.deepEqual(recoveryDeviceMount(host,'2112'),{id:'database',mountpoint:'/mnt/docker-disk',device:'/dev/sde',fstype:'ext4'});
});
test('recovery refuses an unobserved disk, partition subroot, memory-backed or unrelated filesystem',()=>{
 assert.throws(()=>recoveryDeviceMount(host,'2050'));
 assert.throws(()=>recoveryDeviceMount(host.replace('8:64 / /mnt','8:64 /subdir /mnt').split('\n').slice(0,2).join('\n'),'2112'));
 assert.throws(()=>recoveryDeviceMount('2 1 0:64 / /memory rw - tmpfs tmpfs rw','64'));
});
test('recovery requires the precise restored directory and a single canonical writable upper layer',()=>{
 for(const text of [root.replace('upperdir=','ignored='),root.replace('/snapshots/42/fs','/snapshots/../42/fs'),root+'\n'+root,
  root.replace(' - overlay overlay',' - ext4 /dev/sde')])assert.throws(()=>recoveryLayerDataPath(text,'/tmp/roomqc-restore-data'));
 assert.throws(()=>recoveryLayerDataPath(root,'/var/lib/postgresql/data'));
});
test('generated host metadata reader compiles with literal newlines and escaped path characters',()=>{
 const program=recoveryHostReaderProgram('/owned/path with space/quote"/tmp/roomqc-restore-data');
 const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:program,encoding:'utf8',windowsHide:true});
 assert.equal(checked.status,0,checked.stderr);
});
