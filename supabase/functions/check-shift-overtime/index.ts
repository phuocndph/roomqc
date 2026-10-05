import { createClient } from "npm:@supabase/supabase-js@2";
import { requireCronAuth } from '../_shared/cronAuth.ts'


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface StaffOnShift {
  user_id: string;
  tenant_id: string;
  shift_start_at: string;
  user: {
    full_name: string;
    email: string;
    telegram_username: string | null;
  };
  telegram_chat_id: string | null;
  push_subscriptions: { subscription: string }[];
}

interface ShiftSettings {
  warning_hours: number;
  max_shift_hours: number;
  reminder_enabled: boolean;
  reminder_channels: ("push" | "telegram")[];
}

const DEFAULT_SETTINGS: ShiftSettings = {
  warning_hours: 10,
  max_shift_hours: 12,
  reminder_enabled: true,
  reminder_channels: ["push", "telegram"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = requireCronAuth(req, corsHeaders)
  if (denied) return denied



  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting shift overtime check...");

    // Get all staff currently on shift with long duration
    const now = new Date();

    // Query staff_status to find on-shift staff
    const { data: onShiftStaff, error: staffError } = await supabase
      .from("staff_status")
      .select(
        `
        user_id,
        tenant_id,
        shift_start_at,
        shift_end_at
      `
      )
      .not("shift_start_at", "is", null);

    if (staffError) {
      console.error("Error fetching staff status:", staffError);
      throw staffError;
    }

    if (!onShiftStaff || onShiftStaff.length === 0) {
      console.log("No staff on shift");
      return new Response(
        JSON.stringify({ message: "No staff on shift", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user info separately
    const userIds = onShiftStaff.map((s) => s.user_id);
    const { data: usersData } = await supabase
      .from("users")
      .select("id, full_name, email, telegram_username")
      .in("id", userIds);

    const userMap = new Map(usersData?.map((u) => [u.id, u]) || []);

    // Filter to only currently on-shift staff
    const activeStaff = onShiftStaff.filter((s) => {
      if (!s.shift_start_at) return false;
      if (!s.shift_end_at) return true;
      return new Date(s.shift_start_at) > new Date(s.shift_end_at);
    });

    console.log(`Found ${activeStaff.length} staff currently on shift`);

    // Get tenant settings for each unique tenant
    const tenantIds = [...new Set(activeStaff.map((s) => s.tenant_id))];
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, settings")
      .in("id", tenantIds);

    const tenantSettingsMap = new Map<string, ShiftSettings>();
    tenants?.forEach((t) => {
      const settings = (t.settings as Record<string, unknown>)
        ?.shift_settings as ShiftSettings;
      tenantSettingsMap.set(t.id, { ...DEFAULT_SETTINGS, ...settings });
    });

    let processedCount = 0;
    let sentCount = 0;

    for (const staff of activeStaff) {
      const user = userMap.get(staff.user_id);
      const settings =
        tenantSettingsMap.get(staff.tenant_id) || DEFAULT_SETTINGS;

      if (!settings.reminder_enabled) {
        console.log(
          `Skipping ${user?.full_name || staff.user_id}: reminders disabled for tenant`
        );
        continue;
      }

      const shiftStart = new Date(staff.shift_start_at);
      const hoursWorked =
        (now.getTime() - shiftStart.getTime()) / (1000 * 60 * 60);

      // Check if exceeds warning threshold
      if (hoursWorked < settings.warning_hours) {
        continue;
      }

      const reminderType =
        hoursWorked >= settings.max_shift_hours ? "overtime" : "warning";

      // Check if we already sent a reminder for this shift
      const { data: existingReminder } = await supabase
        .from("shift_reminders")
        .select("id")
        .eq("user_id", staff.user_id)
        .eq("shift_start_at", staff.shift_start_at)
        .eq("reminder_type", reminderType)
        .maybeSingle();

      if (existingReminder) {
        console.log(
          `Already sent ${reminderType} reminder for ${user?.full_name || staff.user_id}`
        );
        continue;
      }

      console.log(
        `Sending ${reminderType} reminder to ${user?.full_name || staff.user_id} (${hoursWorked.toFixed(1)}h worked)`
      );

      // Get push subscriptions and telegram chat_id
      const { data: pushSubs } = await supabase
        .from("push_subscriptions")
        .select("subscription")
        .eq("user_id", staff.user_id);

      const { data: telegramConn } = await supabase
        .from("telegram_connections")
        .select("chat_id")
        .eq("user_id", staff.user_id)
        .eq("is_active", true)
        .maybeSingle();

      const message =
        reminderType === "overtime"
          ? `⚠️ Bạn đã làm việc ${hoursWorked.toFixed(0)} giờ, vượt quá giới hạn ${settings.max_shift_hours} giờ. Vui lòng kết thúc ca!`
          : `⏰ Nhắc nhở: Bạn đã làm việc ${hoursWorked.toFixed(0)} giờ. Đừng quên kết thúc ca khi xong việc nhé!`;

      const notificationPromises: Promise<unknown>[] = [];

      // Send push notification
      if (
        settings.reminder_channels.includes("push") &&
        pushSubs &&
        pushSubs.length > 0
      ) {
        notificationPromises.push(
          supabase.functions.invoke("send-push-notification", {
            body: {
              user_id: staff.user_id,
              title:
                reminderType === "overtime"
                  ? "⚠️ Làm việc quá giờ!"
                  : "⏰ Nhắc nhở ca làm việc",
              body: message,
              data: { type: "shift_reminder", reminderType },
            },
          })
        );
      }

      // Send Telegram notification
      if (
        settings.reminder_channels.includes("telegram") &&
        telegramConn?.chat_id
      ) {
        notificationPromises.push(
          supabase.functions.invoke("send-telegram-notification", {
            body: {
              chatId: telegramConn.chat_id,
              message,
            },
          })
        );
      }

      // Execute notifications
      await Promise.allSettled(notificationPromises);

      // Record the reminder
      await supabase.from("shift_reminders").insert({
        tenant_id: staff.tenant_id,
        user_id: staff.user_id,
        shift_start_at: staff.shift_start_at,
        reminder_type: reminderType,
        notification_channels: settings.reminder_channels,
      });

      processedCount++;
      sentCount++;
    }

    console.log(`Processed ${processedCount} staff, sent ${sentCount} reminders`);

    return new Response(
      JSON.stringify({
        message: "Shift overtime check completed",
        processed: processedCount,
        sent: sentCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in check-shift-overtime:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
