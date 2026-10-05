import { buildCorsHeaders } from '../_shared/cors.ts'
// Edge function: operations-advisor
// Nhận snapshot KPI + findings rule-based, gọi Lovable AI Gateway, trả advice tiếng Việt.

interface Finding {
  id: string
  severity: 'high' | 'medium' | 'low'
  category: string
  finding: string
  suggestion: string
  impactVnd?: number
}

interface Body {
  snapshot: Record<string, unknown>
  derived: Record<string, number>
  findings: Finding[]
}

const SYSTEM_PROMPT = `Bạn là chuyên gia vận hành khách sạn 2-4 sao tại Việt Nam, am hiểu chuẩn USALI rút gọn.
Phân tích KPI (GOP, GOPPAR, RevPAR, ADR, Lấp đầy, Tỷ lệ chi phí nhân sự), so sánh với kỳ trước (PoP), cùng kỳ năm trước (YoY) và mục tiêu (budget).
Viết 3-5 lời khuyên tiếng Việt tự nhiên, ưu tiên theo tác động VNĐ và mức độ lệch mục tiêu.
Mỗi lời khuyên: hành động cụ thể, dễ thực thi cho chủ KS nhỏ ít chuyên môn tài chính.
Tránh thuật ngữ tiếng Anh trừ khi cần (ADR, RevPAR, GOP có thể giữ nhưng giải thích ngắn).
Tổng hợp các finding liên quan thành 1 lời khuyên — không lặp nguyên văn.`

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY chưa cấu hình' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as Body
    if (!body?.snapshot || !Array.isArray(body.findings)) {
      return new Response(JSON.stringify({ error: 'Payload không hợp lệ' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const s = body.snapshot as Record<string, unknown>
    const targets = (s.targets ?? {}) as Record<string, number>
    const laborByDept = (s.laborByDepartment ?? {}) as Record<string, number>

    const userPrompt = `KPI snapshot (derived):
${JSON.stringify(body.derived, null, 2)}

Chi phí nhân sự theo bộ phận (VNĐ):
${JSON.stringify(laborByDept, null, 2)}

Mục tiêu kỳ này:
${Object.keys(targets).length ? JSON.stringify(targets, null, 2) : '(chưa đặt mục tiêu)'}

YoY: net revenue cùng kỳ năm trước = ${s.yoyNetRevenue ?? 'chưa đủ data'}

Phát hiện rule-based (đã sort):
${body.findings.map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.finding} → ${f.suggestion}${f.impactVnd ? ` (~${Math.round(f.impactVnd / 1_000_000)}M/tháng)` : ''}`).join('\n')}

Hãy trả về 3-5 lời khuyên ưu tiên cho chủ khách sạn, kết hợp các finding liên quan.`

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'submit_advice',
              description: 'Trả về danh sách lời khuyên ưu tiên',
              parameters: {
                type: 'object',
                properties: {
                  advice: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string', description: 'Tiêu đề ngắn 5-10 từ' },
                        description: { type: 'string', description: '1-2 câu giải thích vấn đề' },
                        action: { type: 'string', description: 'Hành động cụ thể nên làm' },
                        priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                        impactVnd: { type: 'number', description: 'Tác động ước tính VNĐ/tháng (optional)' },
                      },
                      required: ['title', 'description', 'action', 'priority'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['advice'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'submit_advice' } },
      }),
    })

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: 'AI bị giới hạn lưu lượng, thử lại sau.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: 'Hết credit AI, vui lòng nạp thêm.' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!aiResp.ok) {
      const text = await aiResp.text()
      console.error('AI gateway error:', aiResp.status, text)
      return new Response(JSON.stringify({ error: 'AI gateway lỗi' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const json = await aiResp.json()
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0]
    const argsStr = toolCall?.function?.arguments
    let advice: unknown = []
    if (argsStr) {
      try {
        const parsed = JSON.parse(argsStr)
        advice = parsed.advice ?? []
      } catch (e) {
        console.error('Parse tool args failed:', e)
      }
    }

    return new Response(JSON.stringify({ advice }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('operations-advisor error:', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
