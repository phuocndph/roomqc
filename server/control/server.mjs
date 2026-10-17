import { loadConfig } from './config.mjs';
import { ControlStore } from './store.mjs';
import { ClusterGateway } from './cluster.mjs';
import { createControlServer } from './app.mjs';

const config=loadConfig();
const store=new ControlStore(config);
if(process.argv.includes('--migrate')) {
  await store.migrate();
  await store.close();
  console.log('Control database schema and cluster registry prepared.');
} else if(process.argv.includes('--expire-reservations')) {
  const result=await store.sweepReservations();
  await store.close();
  console.log(`Expired ${result.rowCount} unused reservations; history and customer data were preserved.`);
} else {
  await store.pool.query('SELECT expires_at FROM roomqc_control.workspaces LIMIT 1');
  await store.pool.query('SELECT id FROM roomqc_control.support_actions LIMIT 1');
  const server=createControlServer({config,store,gateway:new ClusterGateway(config)});
  server.requestTimeout=30000;
  server.headersTimeout=10000;
  server.listen(config.port,config.host,()=>console.log(`RoomQC control listening on ${config.host}:${config.port}`));
  const close=()=>server.close(async()=>{await store.close();process.exit(0)});
  process.on('SIGINT',close); process.on('SIGTERM',close);
}
