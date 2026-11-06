// Deployment image: every shipped function is bundled before runtime. No keys,
// source checkout mounts, build cache or Internet dependency at service startup.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {lstat,mkdir,mkdtemp,readFile,readdir,realpath,writeFile} from 'node:fs/promises';
import {dirname,join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,version as esbuildVersion} from 'esbuild';

export const edgeImage='supabase/edge-runtime@sha256:ad45164b7548bf5820ed7be714789c17ac2865edce79a09cfb4c3756c3d365a8';
const vendorCommit='bc27d2661edd09a5d0b8d76ce33da6d4071a756e';
const execute=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const invalid=code=>Object.assign(new Error(code),{code});
export function functionPolicies(config,slugs){
 const policies=Object.fromEntries(slugs.map(name=>{
  assert.match(name,/^[a-z][a-z0-9-]{1,63}$/);return [name,{verifyJwt:true}];
 }));
 let section=null;
 for(const line of config.split(/\r?\n/)){
  const header=line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
  if(header){section=header[1];continue;}
  const setting=line.match(/^\s*verify_jwt\s*=\s*(true|false)\s*(?:#.*)?$/);
  if(setting&&section?.startsWith('functions.')){
   const name=section.slice(10);if(!policies[name])throw invalid('FUNCTION_POLICY_TARGET_MISSING');
   policies[name].verifyJwt=setting[1]==='true';
  }
 }
 return policies;
}
export function packagedFunctionRouter(vendor,policies){
 let text=vendor.replace(/\r\n/g,'\n');
 const change=(before,after)=>{
  assert.equal(text.split(before).length,2,'FUNCTION_VENDOR_ROUTER_DRIFT');text=text.replace(before,after);
 };
 change("'jsr:@panva/jose@6'","'jsr:@panva/jose@6.2.12'");
 change("Deno.serve(async (req: Request) => {",`const ROOMQC_FUNCTIONS: Record<string,{verifyJwt:boolean}> = ${JSON.stringify(policies)}\n\nDeno.serve(async (req: Request) => {\n  const service_name = new URL(req.url).pathname.split('/')[1]\n  if (!/^[a-z][a-z0-9-]{1,63}$/.test(service_name ?? '') || !Object.hasOwn(ROOMQC_FUNCTIONS,service_name)) {\n    return getFunctionErrorResponse({code:RequestErrors.NotFound,message:'Requested function was not found',status:404})\n  }`);
 change("if (req.method !== 'OPTIONS' && VERIFY_JWT)","if (req.method !== 'OPTIONS' && VERIFY_JWT && ROOMQC_FUNCTIONS[service_name].verifyJwt)");
 change("  const url = new URL(req.url)\n  const { pathname } = url\n  const path_parts = pathname.split('/')\n  const service_name = path_parts[1]\n",'');
 change('const servicePath = `/home/deno/functions/${service_name}`','const servicePath = `/home/deno/functions/${service_name}.eszip`');
 change('if (!serviceInfo.isDirectory)','if (!serviceInfo.isFile)');
 change('        servicePath,','        servicePath,\n        maybeEszip: await Deno.readFile(servicePath),');
 change("  const importMapPath = `/home/deno/functions/deno.jsonc`",'');
 change('        importMapPath,','');
 return text;
}
async function functionInputs(repository){
 const output=[];
 const walk=async path=>{
  for(const item of await readdir(join(repository,path),{withFileTypes:true})){
   if(item.isSymbolicLink())throw invalid('FUNCTION_IMAGE_SOURCE_LINK');
   if(item.name.startsWith('.')||item.name==='node_modules')throw invalid('FUNCTION_IMAGE_SOURCE_INVALID');
   const next=path+'/'+item.name;
   if(item.isDirectory())await walk(next);
   else{
    if(!/\.(?:ts|tsx|js|mjs|json|jsonc)$/.test(item.name))throw invalid('FUNCTION_IMAGE_SOURCE_INVALID');
    const stat=await lstat(join(repository,next));
    if(!stat.isFile()||stat.nlink!==1||stat.size>4*1024**2)throw invalid('FUNCTION_IMAGE_SOURCE_INVALID');
    const bytes=await readFile(join(repository,next));output.push({path:next,bytes,sha256:sha(bytes)});
   }
  }
 };
 await walk('supabase/functions');
 await walk('src/lib/mcp');
 const bytes=await readFile(join(repository,'supabase/config.toml'));
 output.push({path:'supabase/config.toml',bytes,sha256:sha(bytes)});
 const lock=await readFile(join(repository,'package-lock.json'));
 output.push({path:'package-lock.json',bytes:lock,sha256:sha(lock)});
 return output.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function buildFunctionsImage({repository,noCache=false}){
 assert.equal(typeof noCache,'boolean');repository=await realpath(repository);
 assert(!(await lstat(join(repository,'supabase'))).isSymbolicLink());
 assert(!(await lstat(join(repository,'supabase/functions'))).isSymbolicLink());
 const inputs=await functionInputs(repository),sources=inputs.map(({path,sha256})=>({path,sha256}));
 const slugs=inputs.filter(f=>/^supabase\/functions\/[^/]+\/index.ts$/.test(f.path)).map(f=>f.path.split('/')[2]);
 assert(slugs.length>0&&slugs.length<128);
 const policies=functionPolicies(inputs.find(f=>f.path==='supabase/config.toml').bytes.toString('utf8'),slugs);
 await mkdir(join(repository,'.local'),{recursive:true});
 const root=await mkdtemp(join(repository,'.local/roomqc-functions-image-')),context=join(root,'context');
 const log=join(root,'build.private.log');
 const run=async(command,args,options={})=>{
  try{return await execute(command,args,{cwd:repository,timeout:30000,maxBuffer:16*1024**2,windowsHide:true,...options});}
  catch(error){await writeFile(log,String(error.stdout??'')+'\n'+String(error.stderr??''),{mode:0o600});throw invalid('FUNCTION_IMAGE_BUILD_FAILED');}
 };
 const vendor=join(root,'vendor');
 await run('git',['clone','--depth','1','--branch','self-hosted/v0.8.3','--filter=blob:none','--sparse','https://github.com/supabase/supabase.git',vendor],{timeout:180000});
 assert.equal((await run('git',['rev-parse','HEAD'],{cwd:vendor})).stdout.trim(),vendorCommit);
 await run('git',['sparse-checkout','set','docker/volumes/functions/main'],{cwd:vendor,timeout:180000});
 const original=await readFile(join(vendor,'docker/volumes/functions/main/index.ts'),'utf8');
 const router=packagedFunctionRouter(original,policies),sourceHash=sha(JSON.stringify({sources,policies,vendorCommit,router,esbuildVersion}));
 for(const input of inputs.filter(f=>f.path.startsWith('supabase/functions/'))){
  const target=join(context,'functions',input.path.slice('supabase/functions/'.length));
  await mkdir(dirname(target),{recursive:true});await writeFile(target,input.bytes,{flag:'wx'});
 }
 // The upstream Windows Vite generator emitted an npm:C:\\... module URL.
 // Bundle our owned entry and exact local tool modules instead, pinning every
 // remaining package import to the lockfile before Edge resolves it.
 const lock=JSON.parse(inputs.find(f=>f.path==='package-lock.json').bytes);
 const mcp=await build({entryPoints:[join(repository,'supabase/functions/mcp/index.ts')],bundle:true,write:false,
  platform:'neutral',format:'esm',target:'es2022',logLevel:'silent',
  define:{'import.meta.env.VITE_SUPABASE_URL':'__roomqcPublicUrl','process.env.SUPABASE_URL':'__roomqcInternalUrl',
   'process.env.SUPABASE_PUBLISHABLE_KEY':'__roomqcPublicKey'},
  banner:{js:"const __roomqcPublicUrl=Deno.env.get('SUPABASE_PUBLIC_URL');const __roomqcInternalUrl=Deno.env.get('SUPABASE_URL');const __roomqcPublicKey=Deno.env.get('SUPABASE_ANON_KEY');"},
  plugins:[{name:'pin-edge-packages',setup(builder){builder.onResolve({filter:/^[^./]/},args=>{
   if(isAbsolute(args.path))return;
   if(args.path.startsWith('npm:'))return {path:args.path,external:true};
   const name=args.path.startsWith('@')?args.path.split('/').slice(0,2).join('/'):args.path.split('/')[0];
   const version=lock.packages?.['node_modules/'+name]?.version;
   if(!version)throw invalid('FUNCTION_IMAGE_PACKAGE_UNPINNED');
   return {path:'npm:'+name+'@'+version+args.path.slice(name.length),external:true};
  });}}]});
 await writeFile(join(context,'functions/mcp/index.ts'),mcp.outputFiles[0].text);
 await mkdir(join(context,'main'));await writeFile(join(context,'main/index.ts'),router,{flag:'wx'});
 const commands=['set -eu','mkdir -p /output',...slugs.map(slug=>`echo Bundling:${slug}; edge-runtime bundle --entrypoint /input/functions/${slug}/index.ts --output /output/${slug}.eszip --timeout 120`),
  'edge-runtime bundle --entrypoint /input/main/index.ts --output /output/main.eszip --timeout 120'];
 await writeFile(join(context,'bundle.sh'),commands.join('\n')+'\n',{flag:'wx'});
 const recipe=`FROM ${edgeImage} AS bundle\nWORKDIR /input\nCOPY functions /input/functions\nCOPY main /input/main\nCOPY bundle.sh /input/bundle.sh\nRUN sh /input/bundle.sh\nFROM ${edgeImage}\nCOPY --from=bundle /output /home/deno/functions\nENV VERIFY_JWT=true\nCMD ["start","--user-worker-request-idle-timeout","150000","--main-service","/home/deno/functions/main.eszip"]\n`;
 await writeFile(join(context,'Dockerfile'),recipe,{flag:'wx'});
 const tag='roomqc/functions:source-'+sourceHash.slice(0,20);
 await run('docker',['build','--platform','linux/amd64','--provenance=false',...(noCache?['--no-cache']:[]),
  '--label','roomqc.functions.source='+sourceHash,'--tag',tag,context],{timeout:1200000});
 const image=JSON.parse((await run('docker',['image','inspect',tag])).stdout)[0];
 assert.equal(image.Config.Labels['roomqc.functions.source'],sourceHash);assert.equal(image.Os,'linux');assert.equal(image.Architecture,'amd64');
 assert.equal((await run('docker',['run','--rm','--read-only','--network','none','--entrypoint','sh',image.Id,'-c',
  'find /home/deno/functions -maxdepth 1 -name "*.eszip" -type f | wc -l'])).stdout.trim(),String(slugs.length+1));
 assert.deepEqual((await functionInputs(repository)).map(({path,sha256})=>({path,sha256})),sources,'FUNCTION_IMAGE_SOURCE_DRIFT');
 const receipt={kind:'roomqc-functions-deployment-image',version:1,recordedAt:new Date().toISOString(),imageId:image.Id,
  imageReference:'roomqc/functions@'+image.Id,imageBytes:image.Size,tag,sourceHash,vendorCommit,edgeImage,
  sources,policies,functions:slugs,packagedFunctions:slugs.length,sourceUnchanged:true,buildVerified:true,runtimeVerified:false};
 const manifest=join(root,'image.json');await writeFile(manifest,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 return {imageId:image.Id,imageReference:receipt.imageReference,sourceHash,functions:slugs.length,manifest,runtimeVerified:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length===0||args.length===1&&args[0]==='--help')console.log('Usage: node scripts/build-functions-image.mjs --build [--no-cache]');
 else if(args[0]!=='--build'||args.length>2||args.length===2&&args[1]!=='--no-cache')process.exitCode=64;
 else try{console.log(JSON.stringify(await buildFunctionsImage({repository:fileURLToPath(new URL('../',import.meta.url)),noCache:args.includes('--no-cache')})));}
 catch(error){console.error(error.code??'FUNCTION_IMAGE_BUILD_FAILED');process.exitCode=1;}
}
