import { buildCorsHeaders } from '../_shared/cors.ts'
import { createOperationsAdviceHandler } from '../_shared/advice/handler.ts'
import { createAdviceDependencies } from '../_shared/advice/runtime.ts'

let handler: (req: Request) => Promise<Response>
try {
  handler = createOperationsAdviceHandler(createAdviceDependencies(key => Deno.env.get(key), buildCorsHeaders))
} catch {
  // Deployment errors fail closed; never log credentials or provider diagnostics.
  handler = async req => new Response(req.method === 'OPTIONS' ? null : JSON.stringify({ code: 'ADVICE_UNAVAILABLE', error: 'Dịch vụ tư vấn AI chưa sẵn sàng.' }),
    { status: req.method === 'OPTIONS' ? 204 : 503, headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
Deno.serve(handler)
