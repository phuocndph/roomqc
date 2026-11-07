import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {assertBookingNotificationRole,bookingNotificationChannels} from './booking-notification-access.mjs';
import {loadBookingOperatorConfiguration,loadBookingOperatorCommand,bookingNotificationProblem} from './booking-notification-config.mjs';

const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const states=['pending','leased','accepted','rejected','obsolete','unknown','blocked','resolved'];
const errorCodes=['SCOPE_REVOKED','TARGET_CHANGED','CHANNEL_UNCONFIGURED','CONFIG_CHANGED','PROVIDER_REJECTED','PROVIDER_RATE_LIMIT',
  'RETRY_EXHAUSTED','OUTCOME_UNKNOWN','INVALID_TARGET','PREPARE_FAILED','OPERATOR_SUPPRESSED'];
const resultInvalid=()=>bookingNotificationProblem('BOOKING_NOTIFICATION_STATE_INVALID');
function mutationResult(raw){
  if(!raw||typeof raw.replayed!=='boolean')throw resultInvalid();
  if(['push','telegram'].includes(raw.channel)&&typeof raw.enabled==='boolean')return {channel:raw.channel,enabled:raw.enabled,replayed:raw.replayed};
  if(uuid(raw.target_id)&&['pending','resolved'].includes(raw.state))return {targetId:raw.target_id,state:raw.state,replayed:raw.replayed};
  throw resultInvalid();
}
function targetPage(raw){
  if(!raw||!Array.isArray(raw.rows)||raw.rows.length>50||typeof raw.has_more!=='boolean'
    ||(raw.next_after!==null&&!uuid(raw.next_after))||(raw.has_more&&(!raw.rows.length||raw.next_after!==raw.rows.at(-1)?.target_id)))throw resultInvalid();
  const rows=raw.rows.map(r=>{
    if(!r||!['target_id','event_id','tenant_id','hotel_id'].every(k=>uuid(r[k]))||!states.includes(r.state)||!['push','telegram'].includes(r.channel)
      ||!Number.isInteger(r.attempts)||r.attempts<0||r.attempts>5||!Number.isInteger(r.prepare_failures)||r.prepare_failures<0||r.prepare_failures>5
      ||(r.last_error_code!==null&&!errorCodes.includes(r.last_error_code))
      ||!['created_at','available_at'].every(k=>typeof r[k]==='string'&&Number.isFinite(Date.parse(r[k])))
      ||(r.lease_until!==null&&(typeof r.lease_until!=='string'||!Number.isFinite(Date.parse(r.lease_until)))))throw resultInvalid();
    return {targetId:r.target_id,eventId:r.event_id,tenantId:r.tenant_id,hotelId:r.hotel_id,channel:r.channel,state:r.state,
      attempts:r.attempts,prepareFailures:r.prepare_failures,lastErrorCode:r.last_error_code,
      createdAt:r.created_at,availableAt:r.available_at,leaseUntil:r.lease_until};
  });return {rows,hasMore:raw.has_more,nextAfter:raw.next_after};
}
export function bookingOperatorArguments(args){
  if(args.length===1&&args[0]==='--help')return {help:true};
  if(args.length!==4)throw bookingNotificationProblem('BOOKING_OPERATOR_ARGUMENTS_INVALID');
  const values=new Map();for(let n=0;n<args.length;n+=2){
    if(!['--config-file','--command-file'].includes(args[n])||values.has(args[n])||!args[n+1])throw bookingNotificationProblem('BOOKING_OPERATOR_ARGUMENTS_INVALID');
    values.set(args[n],args[n+1]);
  }
  if(values.size!==2)throw bookingNotificationProblem('BOOKING_OPERATOR_ARGUMENTS_INVALID');
  return {configFile:values.get('--config-file'),commandFile:values.get('--command-file')};
}
export async function runBookingNotificationOperator(args,env=process.env,{Pool=pg.Pool}={}){
  const parsed=bookingOperatorArguments(args);if(parsed.help)return parsed;
  const config=await loadBookingOperatorConfiguration(parsed.configFile,env),command=await loadBookingOperatorCommand(parsed.commandFile,env);
  const pool=new Pool({...config.connection,max:1,connectionTimeoutMillis:3000,idleTimeoutMillis:3000,statement_timeout:5000,lock_timeout:3000,
    query_timeout:7000,idle_in_transaction_session_timeout:10000,application_name:'roomqc-booking-notification-operator'});pool.on('error',()=>{});
  let client;
  try{
    client=await pool.connect();await assertBookingNotificationRole(client,'operator');
    let query,values;
    if(command.operation==='channels')return {ok:true,operation:'channels',channels:bookingNotificationChannels((await client.query('SELECT private.inspect_booking_notification_channels() AS result')).rows[0]?.result)};
    if(command.operation==='list')return {ok:true,operation:'list',...targetPage((await client.query('SELECT private.list_booking_notification_targets($1,$2,$3,$4) AS result',
      [command.state,command.eventId,command.after,command.limit])).rows[0]?.result)};
    if(command.operation==='receipt'){
      const raw=(await client.query('SELECT private.get_booking_notification_operator_result($1) AS result',[command.commandId])).rows[0]?.result;
      return {ok:true,operation:'receipt',commandId:command.commandId,state:raw===null?'missing':'completed',...(raw===null?{}:{result:mutationResult(raw)})};
    }
    if(command.operation==='configure'){
      query='SELECT private.configure_booking_notification_channel($1,$2,$3,$4,$5) AS result';
      values=[command.channel,command.configurationId,command.enabled,command.commandId,command.reason];
    }else{
      query='SELECT private.resolve_booking_notification_target($1,$2,$3,$4,$5) AS result';
      values=[command.targetId,command.commandId,command.resolution,command.reason,command.acceptDuplicateRisk];
    }
    try{
      const raw=(await client.query(query,values)).rows[0]?.result;
      return {ok:true,operation:command.operation,commandId:command.commandId,result:mutationResult(raw)};
    }catch(error){
      if(error.code==='23505')throw bookingNotificationProblem('BOOKING_OPERATOR_COMMAND_CONFLICT');
      if(error.code==='42501')throw bookingNotificationProblem('BOOKING_OPERATOR_NOT_ALLOWED');
      if(error.code==='22023')throw bookingNotificationProblem('BOOKING_OPERATOR_COMMAND_INVALID');
      throw Object.assign(bookingNotificationProblem('BOOKING_OPERATOR_OUTCOME_UNCONFIRMED'),{recovery:{operation:'receipt',commandId:command.commandId}});
    }
  }finally{client?.release();await pool.end()}
}
export async function bookingNotificationOperatorMain(args=process.argv.slice(2),env=process.env,output=console,options){
  try{
    const result=await runBookingNotificationOperator(args,env,options);
    if(result.help)output.log('Usage: node server/control/booking-notification-operator.mjs --config-file ABSOLUTE_PRIVATE_FILE --command-file ABSOLUTE_JSON_FILE');
    else output.log(JSON.stringify(result));return 0;
  }catch(error){
    const allowed=['BOOKING_OPERATOR_ARGUMENTS_INVALID','BOOKING_OPERATOR_COMMAND_INVALID','BOOKING_NOTIFICATION_CONFIG_INVALID',
      'BOOKING_OPERATOR_COMMAND_CONFLICT','BOOKING_OPERATOR_NOT_ALLOWED','BOOKING_OPERATOR_OUTCOME_UNCONFIRMED','BOOKING_NOTIFICATION_ROLE_UNSAFE','BOOKING_NOTIFICATION_STATE_INVALID'];
    const recovery=error.code==='BOOKING_OPERATOR_OUTCOME_UNCONFIRMED'&&error.recovery?.operation==='receipt'&&uuid(error.recovery.commandId)
      ?{operation:'receipt',commandId:error.recovery.commandId}:null;
    output.error(JSON.stringify({ok:false,code:allowed.includes(error.code)?error.code:'BOOKING_OPERATOR_UNAVAILABLE',...(recovery?{recovery}:{})}));return 1;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await bookingNotificationOperatorMain();
