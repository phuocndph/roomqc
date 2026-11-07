// Explicit doubles for directory-only fixtures. Product HTTP callers must use
// the live gateway RPC; these helpers never enter app/server/runtime imports.
import {reconcileSupport} from './support.mjs';
import {randomUUID} from 'node:crypto';
import {ControlError} from './errors.mjs';
const fixtureSessions=new Map();
const sessionFor=key=>{if(!fixtureSessions.has(key))fixtureSessions.set(key,randomUUID());return fixtureSessions.get(key)};
export function fixtureSupportAcceptance(actor,scope,sessionId=randomUUID()){
 const now=Date.now();return {protocolVersion:1,acceptanceId:randomUUID(),actorId:actor.id,sessionId,
  attemptId:scope.attemptId,audience:scope.audience,operation:scope.operation,target:scope.target,
  requestKey:scope.key,payloadSha256:scope.payloadHash,acceptedAtMs:now,observedAtMs:now,expiresAtMs:now+5000};
}
export function fixtureSupportAuthorizer(actor,live=async()=>actor){
 const sessionId=sessionFor(JSON.stringify([actor.id,actor.clusterId])),authorize=()=>live();
 authorize.sessionId=()=>sessionId;
 authorize.acceptCommand=async scope=>{
  const current=await live();if(current.id!==actor.id||current.clusterId!==actor.clusterId)throw new ControlError(403,'SUPPORT_ACTOR_CHANGED','Owned fixture actor changed');
  return fixtureSupportAcceptance(actor,scope,sessionId);
 };return authorize;
}
export function fixtureSupportGateway(gateway){
 const sessions=new Map(),session=token=>{if(!sessions.has(token))sessions.set(token,randomUUID());return sessions.get(token)};
 return {...gateway,supportSessionId:session,acceptSupportCommand:async(actor,token,scope)=>{
  const current=await gateway.supportActor(token);if(current.id!==actor.id||current.clusterId!==actor.clusterId)throw new ControlError(403,'SUPPORT_ACTOR_CHANGED','Owned fixture actor changed');
  return fixtureSupportAcceptance(actor,scope,session(token));
 }};
}
export const fixtureAdminExecute=(directory,actor,command,requestId,validation)=>
 directory.execute(actor,command,requestId,validation,fixtureSupportAuthorizer(actor));
export const fixtureAdminRegister=(directory,actor,body,key,requestId)=>
 directory.register(actor,body,key,requestId,fixtureSupportAuthorizer(actor));
export const fixtureAlertAcknowledge=(alerts,actor,command,requestId)=>
 alerts.acknowledge(actor,command,requestId,fixtureSupportAuthorizer(actor));
export const fixtureReconcileSupport=(store,gateway,actor,body,requestId,key=requestId)=>
 reconcileSupport(store,gateway,actor,body,requestId,fixtureSupportAuthorizer(actor),key);
