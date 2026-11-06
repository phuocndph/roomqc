// Shared role boundary for worker and operator; no direct business/table access.
export async function assertBookingNotificationRole(client,kind){
  const role=kind==='worker'?'roomqc_booking_external_notifier':kind==='operator'?'roomqc_booking_notification_operator':null;
  if(!role)throw Object.assign(new Error('BOOKING_NOTIFICATION_ROLE_UNSAFE'),{code:'BOOKING_NOTIFICATION_ROLE_UNSAFE'});
  const row=(await client.query(`SELECT current_user=session_user AND NOT(r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
    AND pg_has_role(current_user,$1,'USAGE')
    AND NOT EXISTS(SELECT 1 FROM pg_roles p WHERE p.rolname<>current_user AND pg_has_role(current_user,p.oid,'MEMBER') AND p.rolname<>$1)
    AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','private') AND c.relkind IN('r','p')
      AND (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
    AND NOT has_schema_privilege(current_user,'public','CREATE') AND NOT has_schema_privilege(current_user,'private','CREATE')
    AS safe FROM pg_roles r WHERE r.rolname=current_user`,[role])).rows[0];
  if(row?.safe!==true)throw Object.assign(new Error('BOOKING_NOTIFICATION_ROLE_UNSAFE'),{code:'BOOKING_NOTIFICATION_ROLE_UNSAFE'});
}

export function bookingNotificationChannels(raw){
  const invalid=()=>{throw Object.assign(new Error('BOOKING_NOTIFICATION_STATE_INVALID'),{code:'BOOKING_NOTIFICATION_STATE_INVALID'})};
  if(!raw||raw.schema_version!==1||!Array.isArray(raw.channels)||raw.channels.length!==2)invalid();
  const result=raw.channels.map(c=>{
    if(!c||!['push','telegram'].includes(c.channel)||typeof c.enabled!=='boolean'
      ||(c.configuration_id!==null&&(typeof c.configuration_id!=='string'||!/^[a-f0-9]{64}$/.test(c.configuration_id)))
      ||(c.enabled&&c.configuration_id===null)||typeof c.updated_at!=='string'||!Number.isFinite(Date.parse(c.updated_at)))invalid();
    return {channel:c.channel,enabled:c.enabled,configurationId:c.configuration_id,updatedAt:c.updated_at};
  });
  if(new Set(result.map(c=>c.channel)).size!==2)invalid();return result;
}
