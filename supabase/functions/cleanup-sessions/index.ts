import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCronAuth } from '../_shared/cronAuth.ts'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface StaleSession {
  session_id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  check_type: string;
  started_at: string;
  room_number: string;
  hotel_id: string;
  tenant_id: string;
  duration_minutes: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = requireCronAuth(req, corsHeaders)
  if (denied) return denied

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[cleanup-sessions] Starting cleanup process...");

    // Step 1: Get sessions that need reminder (40+ minutes)
    const { data: staleSessions, error: staleError } = await supabase.rpc(
      "get_stale_sessions_for_reminder"
    );

    if (staleError) {
      console.error("[cleanup-sessions] Error fetching stale sessions:", staleError);
    } else if (staleSessions && staleSessions.length > 0) {
      console.log(`[cleanup-sessions] Found ${staleSessions.length} stale sessions for reminder`);

      // Send reminder notifications for each stale session
      for (const session of staleSessions as StaleSession[]) {
        // Skip sessions we've already reminded (check if duration > 45 means we likely already sent)
        // We send reminders at 40-50 min mark only
        if (session.duration_minutes > 50) continue;

        try {
          // Get managers for this hotel to notify
          const { data: managers } = await supabase
            .from("users")
            .select("id, full_name")
            .eq("hotel_id", session.hotel_id)
            .in("id", (
              await supabase
                .from("user_roles")
                .select("user_id")
                .in("role", ["owner", "hotel_manager", "department_manager"])
            ).data?.map(r => r.user_id) || []);

          const notifyUserIds = [session.user_id];
          if (managers) {
            managers.forEach(m => notifyUserIds.push(m.id));
          }

          // Send push notification
          const pushPayload = {
            user_ids: [...new Set(notifyUserIds)],
            tenant_id: session.tenant_id,
            title: "⏰ Nhắc nhở kiểm tra phòng",
            body: `Phòng ${session.room_number} đang được ${session.user_name} kiểm tra hơn ${session.duration_minutes} phút. Vui lòng hoàn thành!`,
            type: "room_check_reminder",
            action_url: `/rooms/${session.room_id}/check?resume=true`,
          };

          const pushResponse = await fetch(
            `${supabaseUrl}/functions/v1/send-push-notification`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify(pushPayload),
            }
          );

          if (!pushResponse.ok) {
            console.error(
              `[cleanup-sessions] Failed to send push for room ${session.room_number}:`,
              await pushResponse.text()
            );
          } else {
            console.log(
              `[cleanup-sessions] Sent reminder for room ${session.room_number} (${session.duration_minutes} min)`
            );
          }
        } catch (notifyError) {
          console.error("[cleanup-sessions] Error sending notification:", notifyError);
        }
      }
    }

    // Step 2: Run cleanup function to delete old sessions
    const { error: cleanupError } = await supabase.rpc("cleanup_stale_check_sessions");

    if (cleanupError) {
      console.error("[cleanup-sessions] Error running cleanup:", cleanupError);
      throw cleanupError;
    }

    console.log("[cleanup-sessions] Cleanup completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Cleanup and reminders processed",
        staleSessionsCount: staleSessions?.length || 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[cleanup-sessions] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
