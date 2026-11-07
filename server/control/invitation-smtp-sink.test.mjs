import test from 'node:test';
import assert from 'node:assert/strict';
import {connect} from 'node:net';
import {createInvitationSmtpSink,invitationMailLink} from '../../scripts/control-backend-invitation-delivery.mjs';

const run='0123456789ab',recipient='invitation-'+run+'-unit@roomqc.invalid';
async function client(port){
  const socket=connect({host:'127.0.0.1',port});socket.setEncoding('utf8');
  let buffer='';const replies=[],waiters=[];
  socket.on('error',()=>{});socket.on('data',chunk=>{
    buffer+=chunk;let end;
    while((end=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);const waiter=waiters.shift();if(waiter)waiter(line);else replies.push(line);}
  });
  const read=()=>replies.length?Promise.resolve(replies.shift()):new Promise(resolve=>waiters.push(resolve));
  assert.match(await read(),/^220 /);
  return {socket,async command(line){socket.write(line+'\r\n');return read();},async close(){socket.destroy();}};
}
async function envelope(c,address=recipient){
  assert.match(await c.command('EHLO owned'),/^250 /);
  assert.match(await c.command('MAIL FROM:<probe@roomqc.invalid>'),/^250 /);
  return c.command('RCPT TO:<'+address+'>');
}

test('SMTP sink captures one exact-owned message with SMTP dot unstuffing',async()=>{
  const sink=await createInvitationSmtpSink({run,recipients:[recipient],host:'127.0.0.1',port:0});let c;
  try{c=await client(sink.port);assert.match(await envelope(c),/^250 /);
    assert.match(await c.command('DATA'),/^354 /);
    assert.match(await c.command('Subject: Owned\r\n\r\n..private fixture\r\n.'),/^250 /);
    assert.equal(sink.attempts,1);assert.equal(sink.messages.length,1);
    assert.deepEqual(sink.messages[0].to,[recipient]);assert.match(sink.messages[0].raw,/\r\n\.private fixture$/);
  }finally{await c?.close();await sink.close();}
  assert.equal(sink.messages.length,0);
});

test('SMTP sink refuses external and different-run recipients before DATA',async()=>{
  const sink=await createInvitationSmtpSink({run,recipients:[recipient],host:'127.0.0.1',port:0});let c;
  try{c=await client(sink.port);
    for(const address of ['someone@example.com','invitation-ffffffffffff-unit@roomqc.invalid']){
      assert.match(await envelope(c,address),/^550 /);assert.match(await c.command('DATA'),/^503 /);
    }
    assert.equal(sink.messages.length,0);assert.equal(sink.attempts,0);
  }finally{await c?.close();await sink.close();}
});

test('SMTP refusal is observable once and recovery keeps capture local',async()=>{
  const sink=await createInvitationSmtpSink({run,recipients:[recipient],host:'127.0.0.1',port:0});let c;
  try{c=await client(sink.port);sink.rejectNext(recipient);
    for(const expected of [/^451 /,/^250 /]){
      assert.match(await envelope(c),/^250 /);assert.match(await c.command('DATA'),/^354 /);
      assert.match(await c.command('Subject: Owned\r\n\r\nfixture\r\n.'),expected);
    }
    assert.equal(sink.attempts,2);assert.equal(sink.rejected,1);assert.equal(sink.messages.length,1);
  }finally{await c?.close();await sink.close();}
});

test('SMTP capture validates recipient scope before binding',async()=>{
  await assert.rejects(createInvitationSmtpSink({run,recipients:['someone@example.com'],host:'127.0.0.1',port:0}));
  await assert.rejects(createInvitationSmtpSink({run,recipients:[recipient],host:'example.com',port:0}));
});

test('native mail link validation keeps exact route and redirect after MIME decoding',()=>{
  const link='http://api-gw:8000/auth/v1/verify?token=fixture-only&type=invite&redirect_to='+encodeURIComponent('http://127.0.0.1:8082/auth/accept-invite');
  const message={to:[recipient],raw:'Content-Transfer-Encoding: quoted-printable\r\n\r\n<a href="'+link.replaceAll('=','=3D').replace('&type','=\r\n&type')+'">Accept</a>'};
  assert.equal(invitationMailLink(message,recipient,'invite').searchParams.get('token'),'fixture-only');
  assert.throws(()=>invitationMailLink({...message,raw:message.raw.replace('/auth/v1/verify','/%22/auth/v1/verify%22')},recipient,'invite'),{code:'OWNED_LINK_ROUTE'});
  assert.throws(()=>invitationMailLink({...message,raw:message.raw.replace('127.0.0.1','localhost')},recipient,'invite'));
});
