import { pathToFileURL } from 'node:url';
import {supportClientIntent,supportClientActor} from './support-client-intent.mjs';
import {uuidPattern} from './errors.mjs';

// Tokens are accepted only through the environment, never command-line args,
// URL/query strings or output. Do not save a token in the repository.
export async function runSupport(args,env=process.env,fetcher=fetch) {
  const [command,...rest]=args;
  if(!['lookup','reconcile','result'].includes(command)) throw new Error('Usage: control:support lookup --query SLUG_OR_REQUEST_ID | reconcile --query SLUG --workspace-id UUID --routing-version N --reason TEXT --intent-file ABSOLUTE_PRIVATE_FILE | result --intent-file ABSOLUTE_PRIVATE_FILE');
  const values={};
  const allowed=new Set(command==='result'?['--intent-file']:command==='lookup'?['--query']:['--query','--workspace-id','--routing-version','--reason','--intent-file']);
  for(let i=0;i<rest.length;i+=2) {
    if(!allowed.has(rest[i]) || !rest[i+1] || Object.hasOwn(values,rest[i])) throw new Error('Invalid or repeated argument');
    values[rest[i]]=rest[i+1];
  }
  if(command!=='result'&&!values['--query']) throw new Error('A slug or request ID is required');
  const url=new URL(env.ROOMQC_CONTROL_URL || 'http://127.0.0.1:8091');
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.username || url.password || url.search || url.hash || url.pathname!=='/'
    || !(url.protocol==='https:' || loopback && url.protocol==='http:')) throw new Error('Control URL must be HTTPS or loopback, without a path or credentials');
  if(!env.ROOMQC_SUPPORT_ACCESS_TOKEN) throw new Error('Set ROOMQC_SUPPORT_ACCESS_TOKEN to an active platform admin session (never send it in chat)');
  if(command==='reconcile' && (!values['--workspace-id'] || !values['--routing-version'] || !values['--reason']||!values['--intent-file'])) {
    throw new Error('Reconcile requires workspace ID, routing version, reason and an absolute private intent file');
  }
  const publicUrl=new URL(env.ROOMQC_PUBLIC_URL||'http://localhost:8082');
  if(publicUrl.username||publicUrl.password||publicUrl.search||publicUrl.hash||publicUrl.pathname!=='/')throw new Error('Public URL must be an origin without credentials');
  const body={query:values['--query'],...(command==='reconcile'?{
    workspaceId:values['--workspace-id'],routingVersion:Number(values['--routing-version']),reason:values['--reason']}: {})};
  let intent;
  if(command!=='lookup')intent=await supportClientIntent(values['--intent-file'],{controlOrigin:url.origin,publicOrigin:publicUrl.origin,
    actorId:supportClientActor(env.ROOMQC_SUPPORT_ACCESS_TOKEN)},command==='reconcile'?body:null);
  let response;
  try{response=await fetcher(`${url.origin}/api/control/support/${command==='result'?'reconcile-result?workspaceId='+encodeURIComponent(intent.body.workspaceId):command}`,{
    method:command==='result'?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(45000),
    headers:{Origin:publicUrl.origin,'Content-Type':'application/json',Authorization:`Bearer ${env.ROOMQC_SUPPORT_ACCESS_TOKEN}`,
      ...(intent?{'Idempotency-Key':intent.key}:{})},
    ...(command==='result'?{}:{body:JSON.stringify(intent?.body??body)}),
  })}catch{throw new Error('Không xác định kết quả kết nối. Giữ nguyên intent-file, dùng result để đối soát; không tạo mã lệnh mới.');}
  const result=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(`${result?.message || 'Control request failed'}${result?.requestId?` (Mã hỗ trợ: ${result.requestId})`:''}`);
  if(intent&&(!result?.success||result.commandId!==result.actionId||typeof result.actionId!=='string'||!uuidPattern.test(result.actionId)
    ||result.workspace?.id!==intent.body.workspaceId||result.workspace?.status!=='active'))throw new Error('Kết quả chưa được xác nhận. Giữ nguyên intent-file và đối soát bằng result.');
  return result;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(await runSupport(process.argv.slice(2)),null,2))}
  catch(error) {console.error(error.message);process.exitCode=1}
}
