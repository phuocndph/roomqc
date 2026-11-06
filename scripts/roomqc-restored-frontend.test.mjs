import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {recoveryFrontendOrigin,assertLoopbackPortFree,verifyBrowserProof,recoveryIngressConfig} from './roomqc-restored-frontend.mjs';
test('recovery browser only uses a bounded loopback port',async()=>{
 assert.equal(recoveryFrontendOrigin(18443),'http://127.0.0.1:18443');
 for(const p of [0,80,65535,65536,1.5,NaN,'18443'])assert.throws(()=>recoveryFrontendOrigin(p));
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{await assert.rejects(assertLoopbackPortFree(server.address().port),/PORT_BUSY/)}finally{await new Promise(r=>server.close(r))}
});
test('browser evidence must identify the actual run, origin and image and all observed flows',()=>{
 const context={run:'abcd12345678',origin:recoveryFrontendOrigin(18443),frontendArtifactDigest:'a'.repeat(64)};
 const proof={version:1,...context,observedAt:new Date().toISOString(),checks:Object.fromEntries(['login','adminInfrastructure','adminBackup','reloadAuthenticated','logout','anonymousAdminDenied'].map(k=>[k,true]))};
 assert.deepEqual(verifyBrowserProof(proof,context),proof);
 for(const key of ['run','origin','frontendArtifactDigest'])assert.throws(()=>verifyBrowserProof({...proof,[key]:'other'},context));
 for(const key of Object.keys(proof.checks))assert.throws(()=>verifyBrowserProof({...proof,checks:{...proof.checks,[key]:false}},context));
 assert.throws(()=>verifyBrowserProof({...proof,observedAt:'2020-01-01T00:00:00Z'},context));
});
test('ingress has explicit API upstreams and websocket transport',()=>{
 const config=recoveryIngressConfig();
 assert.match(config,/listen 8443 ssl/);assert.match(config,/127\.0\.0\.11/);
 assert.match(config,/location \/api\/control\//);assert.match(config,/gateway:8091\$request_uri/);
 assert.match(config,/auth\|rest\|storage\|realtime\|functions/);assert.match(config,/proxy_set_header Upgrade/);
 assert.match(config,/no-store/);assert.doesNotMatch(config,/ssl_verify_client off|proxy_ssl_verify off/);
});
