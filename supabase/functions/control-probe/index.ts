import { handleControlProbe } from './handler.mjs';

Deno.serve((request: Request) => handleControlProbe(request, {
  jwtSecret: Deno.env.get('JWT_SECRET'),
  clusterId: Deno.env.get('ROOMQC_CONTROL_CLUSTER_ID'),
  releaseId: Deno.env.get('ROOMQC_CONTROL_RELEASE_ID'),
}));
