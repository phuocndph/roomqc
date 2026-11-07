// Stream the verified image archive; do not retain a second tar on the VPS.
// The remote repeats the disk budget before accepting any Docker import.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {shellQuote} from '../server/control/vps-deploy.mjs';
import {preflightArguments} from './roomqc-vps-preflight.mjs';
import {runSsh} from './roomqc-vps-deploy.mjs';
import {validateBackendInstall} from './roomqc-backend-install.mjs';
export const imageUploadProgram=String.raw`
import sys,os,json,subprocess,hashlib,tempfile,time
line=sys.stdin.buffer.readline(1024*1024);assert line.endswith(b'\n')
p=json.loads(line);mode=sys.argv[1];assert mode in ('plan','load')
manifest=p['manifest'];v=p['verification'];assert manifest['kind']=='roomqc-fresh-backend-image-transport'
assert len(manifest['images'])==9 and len(v['images'])==9
assert v['namedRepositoryBindingsVerified'] is True and v['allImageConfigAndLayerDigestsVerified'] is True
assert v['archiveSha256']==p['archiveSha256']
ids=subprocess.check_output(['docker','image','ls','-q']).decode().split()
existing=json.loads(subprocess.check_output(['docker','image','inspect',*ids])) if ids else []
present={layer for i in existing for layer in i['RootFS']['Layers']}
missing=[layer for layer in v['layers'] if layer['diffId'] not in present]
expanded=sum(x['expandedBytes'] for x in missing);encoded=sum(x['encodedBytes'] for x in missing)
growth=expanded+encoded+(expanded+9)//10+p['runtimeDiskBytes']
fs=os.statvfs('/');available=fs.f_bavail*fs.f_frsize;total=fs.f_blocks*fs.f_frsize
allowed=available-growth>=total*0.15
budget=dict(availableBytes=available,rootBytes=total,newExpandedBytes=expanded,newEncodedBytes=encoded,requiredGrowthBytes=growth,allowed=allowed,minimumReservePercent=15,remoteArchiveRetained=False)
if mode=='plan' or not allowed:
 print(json.dumps(dict(ok=allowed,mode=mode,budget=budget,remoteChanged=False,signupOpened=False,productionReady=False)))
 sys.exit(0)
with tempfile.TemporaryFile() as out,tempfile.TemporaryFile() as err:
 proc=subprocess.Popen(['docker','image','load'],stdin=subprocess.PIPE,stdout=out,stderr=err)
 digest=hashlib.sha256();count=0
 try:
  while True:
   chunk=sys.stdin.buffer.read(1024*1024)
   if not chunk:break
   count+=len(chunk);assert count<=v['archiveBytes']
   digest.update(chunk);proc.stdin.write(chunk)
  proc.stdin.close();code=proc.wait(timeout=240)
 except:
  proc.kill();proc.wait();raise
 assert code==0 and count==v['archiveBytes'] and digest.hexdigest()==v['archiveSha256'],'IMAGE_IMPORT_FAILED'
for image in manifest['images']:
 actual=json.loads(subprocess.check_output(['docker','image','inspect',image['reference']]))[0]
 assert actual['Id']==image['imageId'] and actual['Os']=='linux' and actual['Architecture']=='amd64'
 assert actual['RootFS']['Layers']==image['rootFsLayers']
os.sync();after=os.statvfs('/')
assert after.f_bavail*after.f_frsize>=total*0.15
print(json.dumps(dict(ok=True,mode=mode,images=9,archiveBytes=count,archiveSha256=digest.hexdigest(),budget=budget,availableBytesAfter=after.f_bavail*after.f_frsize,remoteChanged=True,signupOpened=False,productionReady=False)))
`;
export async function uploadBackendImages(bundleFile,host,mode){
 assert(['plan','load'].includes(mode));const target=preflightArguments(['--host',host,'--user','root']);
 const json=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
 const bundle=validateBackendInstall(await json(bundleFile)),root=dirname(bundleFile),manifest=await json(root+'/images.json'),verification=await json(root+'/image-verification.json');
 assert.equal(manifest.specSha256,bundle.specSha256);
 for(const image of manifest.images){assert.equal(image.reference,image.service==='control'?bundle.controlImage:bundle.images[image.service].reference);}
 const input={manifest,verification,archiveSha256:verification.archiveSha256,runtimeDiskBytes:bundle.requiredRuntimeDiskBytes};
 const program="import base64;exec(compile(base64.b64decode("+JSON.stringify(Buffer.from(imageUploadProgram).toString('base64'))+"),'<roomqc-backend-images>','exec'))";
 const command='python3 -c '+shellQuote(program)+' '+shellQuote(mode);
 if(mode==='plan'){
  const r=await runSsh(target,command,JSON.stringify(input)+'\n');return JSON.parse(r.stdout.trim());
 }
 const plan=await uploadBackendImages(bundleFile,host,'plan');if(!plan.ok)return plan;
 const child=spawn('ssh',['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=2','root@'+host,command],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let output='',error='',limited=false;child.stdout.on('data',x=>{output+=x;if(output.length>65536){limited=true;child.kill();}});child.stderr.on('data',x=>{error+=x;if(error.length>65536){limited=true;child.kill();}});
 const done=new Promise((resolveDone,reject)=>{child.once('error',reject);child.once('close',code=>resolveDone(code));});
 child.stdin.write(JSON.stringify(input)+'\n');let transferFailed=false;
 try{await pipeline(createReadStream(root+'/images.tar'),child.stdin);}catch{transferFailed=true;}
 const code=await done;
 if(code!==0||limited||transferFailed){await writeFile(root+'/image-upload-private.log',output+'\n'+error,{mode:0o600});throw Error('BACKEND_IMAGE_UPLOAD_FAILED');}
 const receipt=JSON.parse(output.trim().split(/\r?\n/).at(-1));assert.equal(receipt.ok,true);assert.equal(receipt.archiveSha256,verification.archiveSha256);
 await writeFile(root+'/image-upload-receipt.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2);
 if(a.length===1&&a[0]==='--help')console.log('Usage: --bundle ABSOLUTE_PRIVATE_JSON --host APPROVED_IPV4 --mode plan|load. Streams exact images, keeps 15 percent disk reserve and never enables signup.');
 else try{assert.equal(a.length,6);assert.equal(a[0],'--bundle');assert.equal(a[2],'--host');assert.equal(a[4],'--mode');const r=await uploadBackendImages(resolve(a[1]),a[3],a[5]);console.log(JSON.stringify(r));if(!r.ok)process.exitCode=2;}
 catch{console.error('BACKEND_IMAGE_UPLOAD_FAILED');process.exitCode=1;}
}
