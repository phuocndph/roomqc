// Exact-owned DB test child. Connection details arrive only via private IPC;
// stdout/stderr stay unused, and only allowlisted outcomes cross back to parent.
import pg from 'pg';
import {ReleaseApprovalStore,assertReleaseAuthority} from '../release-authority.mjs';
let pool,store,cached;
process.on('message',async message=>{
  try{
    if(message.operation==='init'&&!pool){
      pool=new pg.Pool({connectionString:message.url,max:1,connectionTimeoutMillis:3000,
        idle_in_transaction_session_timeout:6000,application_name:'roomqc-release-authority-owned-child'});
      store=new ReleaseApprovalStore(pool);cached=message.proof;
      await pool.query('SELECT 1');process.send({ready:true});
    }else if(message.operation==='check'){
      try{await store.transaction(client=>assertReleaseAuthority(client,cached));process.send({allowed:true})}
      catch(error){process.send({allowed:false,code:error.code==='RELEASE_APPROVAL_NOT_CURRENT'?error.code:'CHECK_FAILED'})}
    }else if(message.operation==='close'){
      await pool.end();process.send({closed:true},()=>process.disconnect());
    }else process.send({error:'INVALID_OPERATION'});
  }catch{process.send({error:'CHILD_FAILED'})}
});
