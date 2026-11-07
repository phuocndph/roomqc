import http from 'node:http';
// Only immutable startup metadata and two booleans. No policy, command,
// credential ID, SQL/provider exception, DSN, signer, token or file path.
export async function startSummaryRotationStatus(rotator,resources,{port=8097}={}){
 const snapshot=structuredClone(resources);let stopping=false,closing;
 const server=http.createServer((req,res)=>{
  res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');
  const found=req.method==='GET'&&['/livez','/readyz'].includes(req.url);
  const alive=!stopping&&!rotator.stopping,ready=alive&&rotator.ready===true;
  res.writeHead(found?((req.url==='/livez'?alive:ready)?200:503):404);
  res.end(JSON.stringify(found?{status:(req.url==='/livez'?alive:ready)?'ok':'unavailable',alive,ready,resources:snapshot}:{status:'not_found'}));
 });
 server.requestTimeout=5000;server.headersTimeout=5000;server.maxConnections=8;
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})}
 catch{server.close();throw Object.assign(new Error('SUMMARY_ROTATION_STATUS_UNAVAILABLE'),{code:'SUMMARY_ROTATION_STATUS_UNAVAILABLE'})}
 return {server,stop:()=>{
  stopping=true;return closing??=(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))})();
 }};
}
