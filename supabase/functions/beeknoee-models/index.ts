// Lists available Beeknoee chat/vision models for the AI Settings page.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXCLUDED_PATTERNS = [
  "dall-e",
  "imagen-",
  "sora-",
  "veo-",
  "gpt-image",
  "chatgpt-image",
  "text-embedding",
  "gemini-embedding",
  "codex",
  "tts-",
  "whisper",
];

const VISION_PATTERNS = [
  "gemini-2.5",
  "gemini-3",
  "gemini-3.1",
  "gpt-5",
  "gpt-5.2",
  "gpt-5.4",
  "claude-sonnet",
  "claude-opus",
  "claude-haiku",
  "glm-5",
  "glm-4.7",
];

interface BeeknoeeModel {
  id: string;
  owned_by?: string;
  context_window?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const BEEKNOEE_API_KEY = Deno.env.get("BEEKNOEE_API_KEY");
    if (!BEEKNOEE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "BEEKNOEE_API_KEY chưa được cấu hình" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resp = await fetch("https://platform.beeknoee.com/api/v1/models", {
      headers: { Authorization: `Bearer ${BEEKNOEE_API_KEY}` },
    });
    if (!resp.ok) {
      const t = await resp.text();
      return new Response(
        JSON.stringify({ error: `Beeknoee error ${resp.status}: ${t.substring(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = await resp.json();
    const models: BeeknoeeModel[] = json.data || [];

    const chatModels = models
      .filter((m) => !EXCLUDED_PATTERNS.some((p) => m.id.includes(p)))
      .filter((m) => (m.context_window ?? 0) > 5000 || VISION_PATTERNS.some((p) => m.id.includes(p)))
      .map((m) => ({
        id: m.id,
        owned_by: m.owned_by ?? "",
        context_window: m.context_window ?? null,
        vision: VISION_PATTERNS.some((p) => m.id.includes(p)),
      }))
      .sort((a, b) => {
        if (a.vision !== b.vision) return a.vision ? -1 : 1;
        if (a.owned_by !== b.owned_by) return a.owned_by.localeCompare(b.owned_by);
        return a.id.localeCompare(b.id);
      });

    return new Response(JSON.stringify({ data: chatModels }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
