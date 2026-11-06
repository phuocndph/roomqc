// Test-only SMTP capture. No forwarding, Internet client, external recipient or
// persistent message store. Raw links/tokens stay in memory and are never evidence.
import deliveryAssert from 'node:assert/strict';
import {createServer as createDeliveryServer} from 'node:net';
import {randomUUID as deliveryUuid,randomBytes as deliveryBytes} from 'node:crypto';

export async function createInvitationSmtpSink({run,recipients,port=2525,host='0.0.0.0'}) {
  deliveryAssert.match(run,/^[a-f0-9]{12}$/);
  deliveryAssert.ok(['0.0.0.0','127.0.0.1'].includes(host));
  const allowed=new Set(recipients);
  deliveryAssert.ok(allowed.size>0&&allowed.size<=16);
  for(const address of allowed)deliveryAssert.match(address,new RegExp('^invitation-'+run+'-[a-z0-9-]+@roomqc\\.invalid$'));
  const messages=[],connections=new Set();let rejection=null,rejected=0,attempts=0;
  const server=createDeliveryServer(socket=>{
    connections.add(socket);socket.setEncoding('utf8');socket.setTimeout(15000,()=>socket.destroy());
    socket.on('error',()=>{});socket.on('close',()=>connections.delete(socket));
    let buffer='',from=null,to=[],data=false,lines=[],bytes=0;
    const reset=()=>{from=null;to=[];data=false;lines=[];bytes=0;};
    socket.write('220 owned-invitation-capture ESMTP\r\n');
    socket.on('data',chunk=>{
      buffer+=chunk;if(Buffer.byteLength(buffer)>262144){socket.end('552 Message too large\r\n');return;}
      let end;
      while((end=buffer.indexOf('\r\n'))>=0){
        const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(data){
          if(line!=='.'){
            bytes+=Buffer.byteLength(line)+2;if(bytes>262144){socket.end('552 Message too large\r\n');return;}
            lines.push(line.startsWith('..')?line.slice(1):line);continue;
          }
          attempts++;
          if(rejection&&to.includes(rejection)){rejected++;rejection=null;socket.write('451 Owned temporary capture refusal\r\n');}
          else if(messages.length>=32)socket.write('452 Capture full\r\n');
          else{messages.push({from,to:[...to],raw:lines.join('\r\n')});socket.write('250 Captured locally\r\n');}
          reset();continue;
        }
        const [verb]=line.toUpperCase().split(' ');
        if(verb==='EHLO'||verb==='HELO'){reset();socket.write('250 owned-invitation-capture\r\n');}
        else if(verb==='MAIL'){
          reset();const match=line.match(/^MAIL FROM:\s*<([^<>\r\n]+)>\s*$/i);
          if(match&&/^[^@\s]+@roomqc\.(?:invalid|test)$/.test(match[1])){from=match[1];socket.write('250 Sender accepted\r\n');}
          else socket.write('550 Synthetic sender required\r\n');
        }else if(verb==='RCPT'){
          const address=line.match(/^RCPT TO:\s*<([^<>\r\n]+)>\s*$/i)?.[1];
          if(from&&allowed.has(address)&&!to.includes(address)){to.push(address);socket.write('250 Recipient accepted\r\n');}
          else socket.write('550 Exact owned recipient required\r\n');
        }else if(verb==='DATA'){
          if(from&&to.length===1){data=true;socket.write('354 End with dot\r\n');}
          else socket.write('503 Envelope required\r\n');
        }else if(verb==='RSET'){reset();socket.write('250 Reset\r\n');}
        else if(verb==='NOOP')socket.write('250 OK\r\n');
        else if(verb==='QUIT'){socket.end('221 Closing\r\n');return;}
        else socket.write('502 Unsupported\r\n');
      }
    });
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return {
    messages,get attempts(){return attempts;},get rejected(){return rejected;},port:server.address().port,
    rejectNext(address){deliveryAssert.ok(allowed.has(address));rejection=address;},
    async close(){for(const socket of connections)socket.destroy();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));messages.length=0;},
  };
}

export function invitationMailLink(message,email,type) {
  deliveryAssert.deepEqual(message.to,[email]);
  const decoded=message.raw.replace(/=\r\n/g,'').replace(/=([A-F0-9]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))).replace(/&amp;/g,'&');
  const links=[...decoded.matchAll(/https?:\/\/[^\s"'<>]+/g)].map(x=>new URL(x[0]));
  const link=links.find(u=>u.origin==='http://api-gw:8000'&&u.pathname==='/auth/v1/verify'&&u.searchParams.get('type')===type);
  if(!link){const error=new Error('Native Auth confirmation route mismatch');error.code='OWNED_LINK_ROUTE';throw error;}
  deliveryAssert.ok(link.searchParams.get('token'));
  deliveryAssert.equal(link.searchParams.get('redirect_to'),'http://127.0.0.1:8082/auth/accept-invite');
  return link;
}

export async function runStaffInvitationDeliveryChecks({input,db,owner,ordinary,tenant,hotel,position,call,account}) {
  const labels=['send-create-new-native-recipient','send-create-replay-cooldown','send-resend-cooldown',
    'send-confirmed-recipient-recovery','send-confirmed-password-unchanged','send-create-user-alias',
    'send-denied-actor-no-effects','send-native-smtp-refusal','send-uncertain-reservation-retained',
    'send-retry-after-refusal-cooldown','send-unconfirmed-resend-same-identity','send-recovery-after-smtp-refusal',
    'send-invite-otp-verified','send-native-password-receipt','send-accept-one-membership',
    'send-accepted-replay-read-only','send-revoked-invitation-no-mail',
    'send-banned-recipient-no-mail','send-restored-recipient-recovery'];
  const checks=[],adminSendChecks=[];
  const email=label=>'invitation-'+input.run+'-delivery-'+label+'@roomqc.invalid';
  const sink=await createInvitationSmtpSink({run:input.run,recipients:['new','existing','alias','refused','denied'].map(email)});
  const record=(label,details,pass)=>{checks.push({label,...details,passed:Boolean(pass)});deliveryAssert.equal(Boolean(pass),true,label);};
  const edge=async(user,body,alias=false)=>{
    const response=await fetch('http://'+(alias?'create-user-invitation-test':'staff-invitation-send-test')+':9000/',{
      method:'POST',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+user.token,'content-type':'application/json',Origin:'http://127.0.0.1:8082'},body:JSON.stringify(body)});
    deliveryAssert.equal(response.headers.get('cache-control'),'no-store');let data;
    try{data=await response.json();}catch{data=null;}return {status:response.status,data};
  };
  const payload=address=>({action:'create',tenantId:tenant,hotelId:hotel,positionId:position,email:address,fullName:'Owned delivery recipient',userLevelCode:'staff'});
  const row=async address=>(await db.query('SELECT * FROM public.staff_invitations WHERE tenant_id=$1 AND email=$2 ORDER BY created_at DESC LIMIT 1',[tenant,address])).rows[0];
  const snapshot=async id=>(await db.query(`SELECT jsonb_build_object(
    'invitation',(SELECT to_jsonb(i) FROM public.staff_invitations i WHERE id=$1),
    'profile',(SELECT to_jsonb(u) FROM public.users u WHERE id=$2),
    'roles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY role),'[]') FROM public.user_roles r WHERE user_id=$2),
    'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY hotel_id),'[]') FROM public.user_hotels h WHERE user_id=$2),
    'audit',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]') FROM public.activity_logs a WHERE tenant_id=$3)) value`,[id.id,id.auth_user_id,tenant])).rows[0].value;
  let adminDispatches=0;
  const admin=RoomQCInvitationAdmin.createInvitationAdminClient({
    endpoint:'http://staff-invitation-send-test:9000',publishableKey:input.publishableKey,path:'/auth/accept-invite',
    getSession:async()=>({data:{session:{access_token:owner.token,user:{id:owner.id}}},error:null}),
    fetch:async(url,options)=>{
      const actual=String(url),prefix='http://staff-invitation-send-test:9000/functions/v1/';
      deliveryAssert.ok(actual===prefix+'create-user'||actual===prefix+'staff-invitations');
      adminDispatches++;
      return fetch(actual===prefix+'create-user'?'http://create-user-invitation-test:9000/':'http://staff-invitation-send-test:9000/',{
        ...options,headers:{...options.headers,Origin:'http://127.0.0.1:8082'}});
    },
  });
  const adminContext={actorId:owner.id,sessionId:owner.sessionId,tenantId:tenant};
  let phase='create';
  try{
    const first=await admin.create(adminContext,{email:email('new'),fullName:'Owned delivery recipient',
      userLevelCode:'staff',hotelId:hotel,positionId:position}),created=await row(email('new'));
    const createPass=first.id===created?.id&&first.tenantId===tenant&&first.hotelId===hotel&&first.email===email('new')
      &&!!created.auth_user_id&&sink.messages.length===1&&(await snapshot(created)).profile===null;
    record(labels[0],{viaCompiledAdmin:true,messages:sink.messages.length,nativeIdentityBound:!!created?.auth_user_id},createPass);
    adminSendChecks.push({label:'compiled-admin-create-native-send',passed:createPass,dispatches:adminDispatches,
      exactReceipt:true,profileAbsent:true});
    const originalId=created.auth_user_id;invitationMailLink(sink.messages[0],email('new'),'invite');
    const beforeDuplicate=JSON.stringify(await snapshot(created)),duplicate=await edge(owner,payload(email('new')));
    record(labels[1],{status:duplicate.status,messages:sink.messages.length,effectsUnchanged:beforeDuplicate===JSON.stringify(await snapshot(created))},
      duplicate.status===429&&sink.messages.length===1&&beforeDuplicate===JSON.stringify(await snapshot(created)));
    const immediate=await edge(owner,{action:'resend',id:created.id});
    record(labels[2],{status:immediate.status,messages:sink.messages.length},immediate.status===429&&sink.messages.length===1);
    phase='confirmed';const existing=await account('delivery-existing');
    const passwordBefore=(await db.query('SELECT encrypted_password FROM auth.users WHERE id=$1',[existing.id])).rows[0].encrypted_password;
    const confirmed=await edge(owner,payload(existing.email)),confirmedRow=await row(existing.email);
    record(labels[3],{status:confirmed.status,messages:sink.messages.length,sameIdentity:confirmedRow?.auth_user_id===existing.id},
      confirmed.status===200&&confirmed.data?.success===true&&confirmedRow?.auth_user_id===existing.id&&sink.messages.length===2);
    invitationMailLink(sink.messages[1],existing.email,'recovery');
    const passwordAfter=(await db.query('SELECT encrypted_password FROM auth.users WHERE id=$1',[existing.id])).rows[0].encrypted_password;
    record(labels[4],{passwordUnchanged:passwordBefore===passwordAfter,profileAbsent:(await snapshot(confirmedRow)).profile===null},
      passwordBefore===passwordAfter&&(await snapshot(confirmedRow)).profile===null);
    phase='alias';const alias=await edge(owner,{...payload(email('alias')),action:'revoke'},true),aliasRow=await row(email('alias'));
    record(labels[5],{status:alias.status,messages:sink.messages.length,nativeIdentityBound:!!aliasRow?.auth_user_id},
      alias.status===200&&alias.data?.success===true&&alias.data.invitation?.id===aliasRow?.id&&!!aliasRow.auth_user_id&&sink.messages.length===3
      &&(await snapshot(aliasRow)).profile===null);
    invitationMailLink(sink.messages[2],email('alias'),'invite');
    phase='denial';const denyBefore=JSON.stringify(await snapshot(created)),denied=await edge(ordinary,payload(email('denied')));
    record(labels[6],{status:denied.status,messages:sink.messages.length,effectsUnchanged:denyBefore===JSON.stringify(await snapshot(created))},
      denied.status===403&&sink.messages.length===3&&!await row(email('denied'))&&denyBefore===JSON.stringify(await snapshot(created)));
    phase='smtp-refusal';sink.rejectNext(email('refused'));
    const refused=await edge(owner,payload(email('refused'))),refusedRow=await row(email('refused'));
    record(labels[7],{status:refused.status,rejected:sink.rejected,messages:sink.messages.length},refused.status===503&&refused.data?.success===false&&sink.rejected===1&&sink.messages.length===3);
    record(labels[8],{reserved:!!refusedRow?.sent_at,profileAbsent:(await snapshot(refusedRow)).profile===null},
      !!refusedRow?.sent_at&&(await snapshot(refusedRow)).profile===null);
    const refusalTime=Date.parse(refusedRow.sent_at),retry=await edge(owner,{action:'resend',id:refusedRow.id});
    record(labels[9],{status:retry.status,messages:sink.messages.length,rejected:sink.rejected},retry.status===429&&sink.messages.length===3&&sink.rejected===1);
    phase='cooldown';
    // Observe real server cooldown. No fixture timestamp edits or weakened policy.
    const wait=Math.max(0,refusalTime+61500-Date.now());
    if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    phase='resend';
    const listed=await admin.listPage(adminContext,hotel),sendTarget=listed.rows.find(x=>x.id===created.id);
    deliveryAssert.ok(sendTarget);
    const resent=await admin.act(adminContext,sendTarget,'resend'),resentRow=await row(email('new'));
    const resendPass=resent.id===created.id&&resent.tenantId===tenant&&resent.hotelId===hotel
      &&resentRow.id===created.id&&resentRow.auth_user_id===originalId&&sink.messages.length===4;
    record(labels[10],{viaCompiledAdmin:true,messages:sink.messages.length,sameIdentity:resentRow.auth_user_id===originalId,elapsedMs:Date.now()-Date.parse(created.sent_at)},resendPass);
    adminSendChecks.push({label:'compiled-admin-resend-native-send',passed:resendPass,sameIdentity:true,exactReceipt:true});
    const invitationLink=invitationMailLink(sink.messages[3],email('new'),'invite');
    const recovered=await edge(owner,{action:'resend',id:refusedRow.id}),recoveredRow=await row(email('refused'));
    record(labels[11],{status:recovered.status,messages:sink.messages.length,sameInvitation:recoveredRow.id===refusedRow.id},
      recovered.status===200&&recovered.data?.success===true&&!!recoveredRow.auth_user_id&&recoveredRow.id===refusedRow.id&&sink.messages.length===5);
    invitationMailLink(sink.messages[4],email('refused'),'invite');
    phase='verify';const verified=await call('/auth/v1/verify',input.publishableKey,{token_hash:invitationLink.searchParams.get('token'),type:'invite'});
    record(labels[12],{status:verified.status,sameIdentity:verified.data?.user?.id===originalId},verified.status===200&&verified.data?.user?.id===originalId);
    const recipient={id:originalId,token:verified.data.access_token},sessionId=JSON.parse(Buffer.from(recipient.token.split('.')[1],'base64url')).session_id;
    phase='password';const operation=deliveryUuid(),password='OwnedDelivery!'+deliveryBytes(24).toString('hex');
    const changed=await call('/auth/v1/user',recipient.token,{password,roomqc_password_change_id:operation},'PUT');
    const receipt=(await db.query('SELECT actor_id::text,session_id::text FROM private.password_change_receipts WHERE id=$1',[operation])).rows[0];
    record(labels[13],{status:changed.status,nativeReceipt:receipt?.actor_id===originalId&&receipt?.session_id===sessionId},
      changed.status===200&&receipt?.actor_id===originalId&&receipt?.session_id===sessionId&&(await snapshot(resentRow)).profile===null);
    phase='accept';const accepted=await edge(recipient,{action:'accept',invitationId:created.id,tenantId:tenant}),acceptedState=await snapshot(resentRow);
    record(labels[14],{status:accepted.status,roles:acceptedState.roles.length,memberships:acceptedState.memberships.length},
      accepted.status===200&&accepted.data?.success===true&&accepted.data.actor_id===originalId&&accepted.data.session_id===sessionId
      &&acceptedState.invitation.status==='accepted'&&acceptedState.profile?.tenant_id===tenant&&acceptedState.profile.hotel_id===hotel
      &&acceptedState.roles.length===1&&acceptedState.memberships.length===1);
    const replay=await edge(recipient,{action:'accept',invitationId:created.id,tenantId:tenant});
    record(labels[15],{status:replay.status,effectsUnchanged:JSON.stringify(acceptedState)===JSON.stringify(await snapshot(resentRow))},
      replay.status===200&&replay.data?.idempotent===true&&JSON.stringify(acceptedState)===JSON.stringify(await snapshot(resentRow)));
    phase='revoke';const revoke=await edge(owner,{action:'revoke',id:aliasRow.id});deliveryAssert.equal(revoke.status,200);
    const revokedState=JSON.stringify(await snapshot(aliasRow)),blocked=await edge(owner,{action:'resend',id:aliasRow.id});
    record(labels[16],{status:blocked.status,messages:sink.messages.length,effectsUnchanged:revokedState===JSON.stringify(await snapshot(aliasRow))},
      blocked.status===409&&sink.messages.length===5&&revokedState===JSON.stringify(await snapshot(aliasRow)));
    phase='recipient-live-state';
    await db.query("UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1",[existing.id]);
    const bannedState=JSON.stringify(await snapshot(confirmedRow)),banned=await edge(owner,{action:'resend',id:confirmedRow.id});
    record(labels[17],{status:banned.status,messages:sink.messages.length,effectsUnchanged:bannedState===JSON.stringify(await snapshot(confirmedRow))},
      banned.status===403&&sink.messages.length===5&&bannedState===JSON.stringify(await snapshot(confirmedRow)));
    await db.query('UPDATE auth.users SET banned_until=NULL WHERE id=$1',[existing.id]);
    const restored=await edge(owner,{action:'resend',id:confirmedRow.id}),restoredRow=await row(existing.email);
    record(labels[18],{status:restored.status,messages:sink.messages.length,sameIdentity:restoredRow.auth_user_id===existing.id},
      restored.status===200&&restored.data?.success===true&&sink.messages.length===6&&restoredRow.auth_user_id===existing.id);
    invitationMailLink(sink.messages[5],existing.email,'recovery');
    deliveryAssert.deepEqual(checks.map(x=>x.label),labels);
    return {verified:true,expected:labels.length,checks,acceptedMessages:sink.messages.length,rejectedMessages:sink.rejected,
      actualAuth:true,actualEdge:true,actualCreateUserAlias:true,actualSmtp:true,externalDelivery:false,realCooldown:true,
      receivedInvitePasswordAccept:true,durableExactlyOnceExternalDelivery:false,
      compiledAdminSend:{expected:2,checks:adminSendChecks,subsetOfDeliveryChecks:true}};
  }catch(error){return {verified:false,expected:labels.length,checks,phase,errorCode:typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:'OWNED_DELIVERY_ASSERTION',
    acceptedMessages:sink.messages.length,rejectedMessages:sink.rejected,actualAuth:true,actualEdge:true,actualSmtp:true,externalDelivery:false};}
  finally{await sink.close();}
}
