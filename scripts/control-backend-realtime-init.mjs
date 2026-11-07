// Exact-owned deployment fixture only. No manifest expectation is invented or
// installed here: the parent captures schema after service initialization.
import assert from 'node:assert/strict';
import {probeRealtimeCanary} from '/control/service-probes.mjs';
const credential=JSON.parse(process.env.ROOMQC_FIXTURE_INIT_INPUT);
const cluster={id:'fixture-a',url:'http://127.0.0.1:8000'};
const config={allowLocal:true,inventory:new Map([[cluster.id,cluster]])};
await probeRealtimeCanary(config,cluster,credential);
assert.equal(typeof credential.token,'string');
console.log(JSON.stringify({realtimeInitialized:true,roundTrips:1}));
