import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from '../_shared/cors.ts';

const BEEKNOEE_URL = "https://platform.beeknoee.com/api/v1/chat/completions";

const DEFAULT_FALLBACK_MODELS = [
  { name: "gemini-2.5-flash", timeout: 55000 },
  { name: "gemini-3-flash", timeout: 45000 },
  { name: "glm-4.7-flash", timeout: 30000 },
  { name: "glm-4.5-flash", timeout: 30000 },
  { name: "openai/gpt-oss-120b", timeout: 30000 },
];

async function getAiSettings(supabase: any, tenantId: string | null) {
  if (!tenantId) return {} as Record<string, string>;
  const { data } = await supabase
    .from("ai_settings")
    .select("config_key, config_value")
    .eq("tenant_id", tenantId);
  const map: Record<string, string> = {};
  for (const row of data || []) map[row.config_key] = row.config_value;
  return map;
}

function buildModelChain(settings: Record<string, string>) {
  const primary = settings.ocr_model;
  const chain = [...DEFAULT_FALLBACK_MODELS];
  if (primary) {
    const idx = chain.findIndex((m) => m.name === primary);
    if (idx >= 0) {
      const [m] = chain.splice(idx, 1);
      chain.unshift(m);
    } else {
      chain.unshift({ name: primary, timeout: 55000 });
    }
  }
  return chain;
}

async function callBeeknoeeWithFallback(
  apiKey: string,
  body: Record<string, unknown>,
  models: Array<{ name: string; timeout: number }>,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const { name: model, timeout } of models) {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeout);
      try {
        console.log(`[beeknoee] try ${model} (attempt ${attempt + 1})`);
        const resp = await fetch(BEEKNOEE_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, model }),
          signal: controller.signal,
        });
        clearTimeout(tid);
        if (resp.ok) {
          const json = await resp.json();
          return { ok: true as const, data: json, model };
        }
        const text = await resp.text();
        console.warn(`[beeknoee] ${model} failed (${resp.status}): ${text.substring(0, 150)}`);
        if (resp.status === 401 || resp.status === 403) {
          return { ok: false as const, error: "Beeknoee API key không hợp lệ", status: resp.status };
        }
        if (resp.status === 429) await new Promise((r) => setTimeout(r, 3000));
      } catch (e) {
        clearTimeout(tid);
        console.warn(`[beeknoee] ${model} error:`, e instanceof Error ? e.message : e);
      }
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 4000));
  }
  return { ok: false as const, error: "Tất cả model AI đều không phản hồi" };
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BEEKNOEE_API_KEY = Deno.env.get("BEEKNOEE_API_KEY");

    if (!BEEKNOEE_API_KEY) {
      throw new Error("BEEKNOEE_API_KEY chưa được cấu hình");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { sessionId, imageBase64, documentType } = await req.json();

    if (!sessionId || !imageBase64) {
      return new Response(
        JSON.stringify({ error: "sessionId and imageBase64 are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Verify session
    const { data: session, error: sessionError } = await supabase
      .from("document_scan_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "Phiên quét không tồn tại" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (session.status !== "pending" && session.status !== "failed") {
      return new Response(
        JSON.stringify({ error: "Phiên quét đã hoàn thành hoặc hết hạn" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (session.status === "failed") {
      await supabase
        .from("document_scan_sessions")
        .update({ status: "pending" })
        .eq("id", sessionId);
    }

    const docType = documentType || session.document_type || "cccd";
    const settings = await getAiSettings(supabase, session.tenant_id);
    const models = buildModelChain(settings);

    // 2. Call OCR via Beeknoee
    const validationRule = `VALIDATION RULE: Set is_valid_document=true if the image shows ANY identity-style document (ID card, citizen card, passport page, visa, driver license) — even if blurry, partially visible, angled, or low quality. As long as you can see SOME text/fields/photo that look like a document, treat it as valid and extract whatever you can read (leave unknown fields empty). ONLY set is_valid_document=false if the image is clearly a pure selfie with no document, a landscape, food, screenshot of an app, or completely unrelated content.`;

    const prompts: Record<string, string> = {
      cccd: `${validationRule}

Analyze this Vietnamese Citizen ID Card (CCCD/CMND) image. Extract all visible information accurately.
For Vietnamese names, keep the original Vietnamese characters with diacritics.
The ID number is a 12-digit number on the card.
Date format on card is typically DD/MM/YYYY - convert to YYYY-MM-DD format.
Gender: "Nam" = male, "Nữ" = female.
Nationality is usually "Việt Nam" for CCCD.`,
      passport: `${validationRule}

Analyze this passport image. Extract all visible information accurately.
Keep the full name as shown on the passport.
The passport number is usually alphanumeric (e.g., B1234567).
Date of birth format: convert to YYYY-MM-DD.
Gender: M = male, F = female.
Extract nationality/country of origin.`,
      visa: `${validationRule}

Analyze this visa document image. Extract all visible information accurately.
Keep the full name as shown.
Extract the visa number.
Extract nationality.`,
    };

    const systemPrompt = prompts[docType] || prompts.cccd;
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    console.log("[mobile-scan-upload] Calling Beeknoee OCR...");
    const result = await callBeeknoeeWithFallback(
      BEEKNOEE_API_KEY,
      {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: systemPrompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_document_info",
              description: "Extract structured information from an identity document image",
              parameters: {
                type: "object",
                properties: {
                  is_valid_document: { type: "boolean" },
                  rejection_reason: { type: "string" },
                  full_name: { type: "string" },
                  id_number: { type: "string" },
                  date_of_birth: { type: "string" },
                  gender: { type: "string", enum: ["male", "female"] },
                  nationality: { type: "string" },
                  address: { type: "string" },
                },
                required: ["is_valid_document", "full_name", "id_number"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_document_info" } },
      },
      models,
    );

    if (!result.ok) {
      const status = result.status === 401 || result.status === 403 ? 401 : 503;
      return new Response(
        JSON.stringify({ error: result.error || "Lỗi xử lý ảnh, vui lòng thử lại." }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const toolCall = result.data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== "extract_document_info") {
      return new Response(
        JSON.stringify({ error: "Không thể trích xuất thông tin. Vui lòng chụp lại rõ hơn." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const scannedData = JSON.parse(toolCall.function.arguments);
    console.log("[mobile-scan-upload] OCR result via", result.model, scannedData);

    if (!scannedData.is_valid_document) {
      await supabase
        .from("document_scan_sessions")
        .update({ status: "failed", scanned_data: { rejection_reason: scannedData.rejection_reason } })
        .eq("id", sessionId);

      return new Response(
        JSON.stringify({
          error:
            "Ảnh không phải giấy tờ tùy thân. Vui lòng chụp rõ mặt trước hoặc mặt sau của CCCD, Hộ chiếu hoặc Visa.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Upload image to storage
    let imageUrl: string | null = null;
    try {
      const fileName = `${session.tenant_id}/${Date.now()}-${docType}.jpg`;
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("guest-documents")
        .upload(fileName, bytes.buffer, { contentType: "image/jpeg" });

      if (!uploadError && uploadData) {
        const { data: urlData, error: urlError } = await supabase.storage
          .from("guest-documents")
          .createSignedUrl(uploadData.path, 60 * 60);
        if (!urlError && urlData?.signedUrl) imageUrl = urlData.signedUrl;
        console.log("[mobile-scan-upload] Private document uploaded");
      } else if (uploadError) {
        console.error("[mobile-scan-upload] Upload error:", uploadError.message);
      }
    } catch (storageErr) {
      console.error("[mobile-scan-upload] Storage error:", storageErr);
    }

    // 4. Update session
    const { error: updateError } = await supabase
      .from("document_scan_sessions")
      .update({
        status: "completed",
        scanned_data: scannedData,
        image_url: imageUrl,
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (updateError) {
      console.error("[mobile-scan-upload] Session update error:", updateError);
      throw new Error("Lỗi cập nhật phiên quét");
    }

    return new Response(
      JSON.stringify({ success: true, data: scannedData, imageUrl, model: result.model }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[mobile-scan-upload] Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
