// RoomQC owns this entrypoint. build-functions-image bundles its local imports
// and injects runtime public/internal URLs; no developer machine paths ship.
import mcp from '../../../src/lib/mcp/index.ts';
import { createSupabaseHandler } from "npm:@lovable.dev/mcp-js@0.25.1/stacks/supabase";
Deno.serve(createSupabaseHandler(mcp, { functionName: "mcp" }));
