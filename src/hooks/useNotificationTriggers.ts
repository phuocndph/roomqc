import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';
import { 
  getNotificationRecipients, 
  getUserById, 
  getUserReportsTo,
  getStaffSupervisor,
  getManagersOfHotel,
  RecipientRole 
} from '@/utils/notificationRecipients';

// ==================== TELEGRAM NOTIFICATION HELPER ====================

export type TelegramNotificationType = 'booking' | 'checkin' | 'checkout' | 'maintenance' | 'inventory' | 'payment' | 'laundry' | 'system';

interface SendTelegramNotificationParams {
  tenantId: string;
  hotelId?: string; // Filter groups by specific hotel
  userIds?: string[];
  groupIds?: string[];
  sendToAllGroups?: boolean;
  sendToOwnerGroups?: boolean;
  sendToManagementGroups?: boolean;
  sendToStaffGroups?: boolean;
  // NEW: Department-based routing
  department?: string; // housekeeping, maintenance, laundry, inventory, accounting, front_desk, general
  notificationTypeFilter?: string; // checkout, checkin, maintenance_new, etc.
  title: string;
  message: string;
  notificationType?: TelegramNotificationType;
  actionUrl?: string;
}

// Helper function to send Telegram notifications
export async function sendTelegramNotification({
  tenantId,
  hotelId,
  userIds,
  groupIds,
  sendToAllGroups,
  sendToOwnerGroups,
  sendToManagementGroups,
  sendToStaffGroups,
  department,
  notificationTypeFilter,
  title,
  message,
  notificationType = 'system',
  actionUrl,
}: SendTelegramNotificationParams): Promise<{ success: boolean; sent: number; total: number }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-telegram-notification', {
      body: {
        tenant_id: tenantId,
        hotel_id: hotelId,
        user_ids: userIds,
        group_ids: groupIds,
        send_to_all_groups: sendToAllGroups,
        send_to_owner_groups: sendToOwnerGroups,
        send_to_management_groups: sendToManagementGroups,
        send_to_staff_groups: sendToStaffGroups,
        department,
        notification_type_filter: notificationTypeFilter,
        title,
        message,
        notification_type: notificationType,
        action_url: actionUrl,
      },
    });

    if (error) {
      console.error('[Telegram] Error sending notification:', error);
      return { success: false, sent: 0, total: 0 };
    }

    
    return data as { success: boolean; sent: number; total: number };
  } catch (err) {
    console.error('[Telegram] Failed to send notification:', err);
    return { success: false, sent: 0, total: 0 };
  }
}

export type NotificationType = 
  | 'low_stock'
  | 'critical_stock'
  | 'laundry_completed'
  | 'maintenance_new'
  | 'maintenance_completed'
  | 'maintenance_overdue'
  | 'po_approved'
  | 'po_pending_approval'
  | 'task_assigned'
  | 'room_check_completed'
  | 'room_checkout'
  | 'approval_request'
  | 'info'
  | 'warning'
  | 'success'
  | 'error';

interface CreateNotificationParams {
  userId: string;
  tenantId: string;
  title: string;
  body: string;
  type?: NotificationType;
  actionUrl?: string;
  icon?: string;
  metadata?: Json;
}

// Create a single in-app notification using RPC to bypass RLS
export async function createInAppNotification({
  userId,
  tenantId,
  title,
  body,
  type = 'info',
  actionUrl,
  icon,
  metadata,
}: CreateNotificationParams): Promise<string | null> {
  try {
    // Use RPC function to bypass RLS while maintaining tenant security
    const { data, error } = await supabase.rpc('create_notification_for_user', {
      p_user_id: userId,
      p_tenant_id: tenantId,
      p_title: title,
      p_body: body,
      p_type: type,
      p_action_url: actionUrl ?? null,
      p_icon: icon ?? null,
      p_metadata: metadata ?? null,
    });

    if (error) throw error;
    return data as string;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

// Create notifications for multiple recipients using RPC - PARALLEL
export async function createMultipleNotifications({
  recipientIds,
  tenantId,
  title,
  body,
  type = 'info',
  actionUrl,
  icon,
  metadata,
}: {
  recipientIds: string[];
  tenantId: string;
  title: string;
  body: string;
  type?: NotificationType;
  actionUrl?: string;
  icon?: string;
  metadata?: Json;
}): Promise<number> {
  if (recipientIds.length === 0) return 0;

  // Create notifications in parallel for speed
  const results = await Promise.allSettled(
    recipientIds.map(userId =>
      supabase.rpc('create_notification_for_user', {
        p_user_id: userId,
        p_tenant_id: tenantId,
        p_title: title,
        p_body: body,
        p_type: type,
        p_action_url: actionUrl ?? null,
        p_icon: icon ?? null,
        p_metadata: metadata ?? null,
      })
    )
  );

  const successCount = results.filter(
    r => r.status === 'fulfilled' && !r.value.error
  ).length;

  return successCount;
}

export type PushSendResult = {
  ok: boolean;
  sent: number;
  message?: string;
  error?: string;
};

async function sendPushNotificationWithResult({
  userId,
  tenantId,
  title,
  body,
  actionUrl,
  tag,
  notificationType,
  icon,
  image,
}: {
  userId: string;
  tenantId: string;
  title: string;
  body: string;
  actionUrl?: string;
  tag?: string;
  notificationType?: NotificationType;
  icon?: string;
  image?: string;
}): Promise<PushSendResult> {
  try {
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: userId,
        tenant_id: tenantId,
        title,
        body,
        icon,
        image,
        notification_type: notificationType,
        action_url: actionUrl || '/',
        data: { url: actionUrl || '/', type: notificationType },
        tag,
      },
    });

    if (error) throw error;

    const sent = typeof (data as any)?.sent === 'number' ? (data as any).sent : 0;
    const message = typeof (data as any)?.message === 'string' ? (data as any).message : undefined;

    return {
      ok: sent > 0,
      sent,
      message,
    };
  } catch (err) {
    return {
      ok: false,
      sent: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendPushNotification(params: {
  userId: string;
  tenantId: string;
  title: string;
  body: string;
  actionUrl?: string;
  tag?: string;
  notificationType?: NotificationType;
  icon?: string;
  image?: string;
}): Promise<boolean> {
  const result = await sendPushNotificationWithResult(params);
  if (!result.ok) {
    console.warn('[Push] sendPushNotification failed:', result);
  }
  return result.ok;
}

// Send push notifications to multiple users - BATCH for speed
export async function sendMultiplePushNotifications({
  recipientIds,
  tenantId,
  title,
  body,
  actionUrl,
  tag,
  notificationType,
  icon,
  image,
}: {
  recipientIds: string[];
  tenantId: string;
  title: string;
  body: string;
  actionUrl?: string;
  tag?: string;
  notificationType?: NotificationType;
  icon?: string;
  image?: string;
}): Promise<number> {
  if (recipientIds.length === 0) return 0;

  // Use batch API call with user_ids array for speed
  try {
    const { data, error } = await supabase.functions.invoke('send-push-notification', {
      body: {
        user_ids: recipientIds,
        tenant_id: tenantId,
        title,
        body,
        icon,
        image,
        notification_type: notificationType,
        action_url: actionUrl || '/',
        data: { url: actionUrl || '/', type: notificationType },
        tag,
      },
    });

    if (error) {
      console.error('[Push] Batch send error:', error);
      return 0;
    }

    return typeof data?.sent === 'number' ? data.sent : 0;
  } catch (err) {
    console.error('[Push] Batch send failed:', err);
    return 0;
  }
}

// ==================== SUPERVISOR-BASED NOTIFICATIONS ====================

// Helper: Notify the supervisor of a staff member
// If staff has a reports_to manager, notify only that manager
// If no supervisor, notify all managers of the hotel
export async function notifyStaffSupervisor({
  staffUserId,
  tenantId,
  hotelId,
  title,
  body,
  type = 'info',
  actionUrl,
  icon,
  metadata,
}: {
  staffUserId: string;
  tenantId: string;
  hotelId?: string;
  title: string;
  body: string;
  type?: NotificationType;
  actionUrl?: string;
  icon?: string;
  metadata?: Json;
}): Promise<{ supervisorId?: string; fallbackToAllManagers: boolean; recipientCount: number }> {
  // 1. Try to get the specific supervisor from reports_to
  const supervisor = await getStaffSupervisor(staffUserId);
  
  if (supervisor) {
    // Send to specific supervisor only - PARALLEL
    await Promise.all([
      createInAppNotification({
        userId: supervisor.id,
        tenantId,
        title,
        body,
        type,
        actionUrl,
        icon,
        metadata,
      }),
      sendPushNotification({
        userId: supervisor.id,
        tenantId,
        title,
        body,
        actionUrl,
        notificationType: type,
      }),
    ]);

    return { supervisorId: supervisor.id, fallbackToAllManagers: false, recipientCount: 1 };
  }

  // 2. No supervisor assigned - fallback to all managers of the hotel
  if (hotelId) {
    const managers = await getManagersOfHotel(hotelId);
    const recipientIds = managers.map(m => m.id).filter(id => id !== staffUserId);

    if (recipientIds.length > 0) {
      // Send in-app and push PARALLEL
      await Promise.all([
        createMultipleNotifications({
          recipientIds,
          tenantId,
          title,
          body,
          type,
          actionUrl,
          icon,
          metadata,
        }),
        sendMultiplePushNotifications({
          recipientIds,
          tenantId,
          title,
          body,
          actionUrl,
          notificationType: type,
        }),
      ]);

      return { fallbackToAllManagers: true, recipientCount: recipientIds.length };
    }
  }

  console.warn('[notifyStaffSupervisor] No supervisor or managers found for staff:', staffUserId);
  return { fallbackToAllManagers: true, recipientCount: 0 };
}

// ==================== ROLE-BASED TRIGGERS ====================

// Trigger for low stock alert - sends to managers and owner
export async function triggerLowStockAlert({
  tenantId,
  hotelId,
  itemName,
  currentStock,
  minimumStock,
  itemId,
  triggeredByUserId,
}: {
  tenantId: string;
  hotelId: string;
  itemName: string;
  currentStock: number;
  minimumStock: number;
  itemId: string;
  triggeredByUserId?: string;
}) {
  const title = 'Cảnh báo tồn kho thấp';
  const body = `${itemName} chỉ còn ${currentStock}/${minimumStock} đơn vị`;
  const actionUrl = `/items/${itemId}`;
  const type: NotificationType = currentStock <= 5 ? 'critical_stock' : 'low_stock';

  // Get managers and owner
  const recipients = await getNotificationRecipients({
    tenantId,
    hotelId,
    targetRoles: ['manager', 'owner'],
    excludeUserId: triggeredByUserId,
  });

  const recipientIds = recipients.map(r => r.id);

  // Send all notifications in PARALLEL for speed
  await Promise.all([
    createMultipleNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      type,
      actionUrl,
      icon: 'alert-triangle',
      metadata: { itemId, currentStock, minimumStock, hotelId } as Json,
    }),
    sendMultiplePushNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `low-stock-${itemId}`,
      notificationType: type,
    }),
    sendTelegramNotification({
      tenantId,
      hotelId,
      department: 'inventory',
      notificationTypeFilter: 'inventory_low',
      sendToManagementGroups: true,
      sendToStaffGroups: true,
      title,
      message: body,
      notificationType: 'inventory',
      actionUrl,
    }),
  ]);
}

// Trigger when room status changes to check_out - notify hotel staff
export async function triggerRoomCheckoutNotification({
  tenantId,
  hotelId,
  roomId,
  roomNumber,
  changedByUserId,
}: {
  tenantId: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  changedByUserId?: string;
}) {
  const title = `Phòng ${roomNumber} - Checkout`;
  const body = `Khách đã trả phòng. Vui lòng kiểm tra đồ dùng trong phòng.`;
  const actionUrl = `/rooms/${roomId}/check?type=checkout`;

  // Get all hotel staff user IDs (avoid joining users table to prevent RLS issues)
  const { data: staffRows, error: staffError } = await supabase
    .from('user_hotels')
    .select('user_id')
    .eq('hotel_id', hotelId);

  if (staffError) {
    console.error('Error fetching hotel staff for checkout notification:', staffError);
    return;
  }

  // If hotel has only one user (owner), don't exclude them - they should still receive notification
  const allUserIds = (staffRows || [])
    .map(r => r.user_id)
    .filter((id): id is string => !!id);
  
  const isSingleUserHotel = allUserIds.length <= 1;

  const recipientIds = Array.from(
    new Set(
      allUserIds.filter(id => isSingleUserHotel ? true : id !== changedByUserId)
    )
  );

  if (recipientIds.length === 0) {
    console.warn('[Room Checkout] No recipients found for hotel:', hotelId);
    return;
  }

  // Send all notifications in PARALLEL for speed
  await Promise.all([
    createMultipleNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      type: 'room_checkout',
      actionUrl,
      icon: 'door-open',
      metadata: { roomId, roomNumber, hotelId } as Json,
    }),
    sendMultiplePushNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `room-checkout-${roomId}`,
      notificationType: 'room_checkout',
    }),
    sendTelegramNotification({
      tenantId,
      hotelId,
      sendToStaffGroups: true,
      notificationTypeFilter: 'checkout',
      title,
      message: body,
      notificationType: 'checkout',
      actionUrl,
    }),
  ]);
}

// Trigger when room status changes to check_in - notify hotel staff
export async function triggerRoomCheckinNotification({
  tenantId,
  hotelId,
  roomId,
  roomNumber,
  guestName,
  changedByUserId,
}: {
  tenantId: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  guestName?: string;
  changedByUserId?: string;
}) {
  const title = `Phòng ${roomNumber} - Check-in`;
  const body = guestName 
    ? `Khách "${guestName}" đã nhận phòng.` 
    : `Khách đã nhận phòng.`;
  const actionUrl = `/rooms/${roomId}`;

  // Send Telegram notification to staff groups
  await sendTelegramNotification({
    tenantId,
    hotelId,
    sendToStaffGroups: true,
    notificationTypeFilter: 'checkin',
    title,
    message: body,
    notificationType: 'checkin',
    actionUrl,
  });
}

// Trigger when new booking is created
export async function triggerNewBookingNotification({
  tenantId,
  hotelId,
  roomNumber,
  guestName,
  checkInDate,
  checkOutDate,
  bookingId,
}: {
  tenantId: string;
  hotelId: string;
  roomNumber: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  bookingId: string;
}) {
  const title = `Đặt phòng mới - ${roomNumber}`;
  const body = `Khách: ${guestName}\nNhận: ${checkInDate}\nTrả: ${checkOutDate}`;
  const actionUrl = `/bookings?status=confirmed`;

  // Send Telegram notification to management and staff groups
  await sendTelegramNotification({
    tenantId,
    hotelId,
    sendToManagementGroups: true,
    sendToStaffGroups: true,
    notificationTypeFilter: 'booking',
    title,
    message: body,
    notificationType: 'booking',
    actionUrl,
  });
}

export async function triggerMaintenanceNewNotification({
  tenantId,
  hotelId,
  requestCode,
  title,
  location,
  requestId,
  createdByUserId,
}: {
  tenantId: string;
  hotelId: string;
  requestCode: string;
  title: string;
  location: string;
  requestId: string;
  createdByUserId: string;
}) {
  const notifTitle = 'Yêu cầu bảo trì mới';
  const body = `${requestCode}: ${title} tại ${location}`;
  const actionUrl = `/maintenance/requests/${requestId}`;

  // Send supervisor notifications and Telegram in PARALLEL
  await Promise.all([
    notifyStaffSupervisor({
      staffUserId: createdByUserId,
      tenantId,
      hotelId,
      title: notifTitle,
      body,
      type: 'maintenance_new',
      actionUrl,
      icon: 'wrench',
      metadata: { requestId, requestCode, hotelId, createdBy: createdByUserId } as Json,
    }),
    sendTelegramNotification({
      tenantId,
      hotelId,
      sendToManagementGroups: true,
      sendToStaffGroups: true,
      notificationTypeFilter: 'maintenance_new',
      title: notifTitle,
      message: body,
      notificationType: 'maintenance',
      actionUrl,
    }),
  ]);
}

// Trigger for maintenance completed - sends to original reporter
export async function triggerMaintenanceCompletedNotification({
  tenantId,
  hotelId,
  requestCode,
  title,
  requestId,
  reportedByUserId,
  completedByUserId,
}: {
  tenantId: string;
  hotelId?: string;
  requestCode: string;
  title: string;
  requestId: string;
  reportedByUserId: string;
  completedByUserId: string;
}) {
  const notifTitle = 'Yêu cầu bảo trì đã hoàn thành';
  const body = `${requestCode}: ${title} đã được xử lý xong`;
  const actionUrl = `/maintenance/requests/${requestId}`;

  const notificationPromises: Promise<any>[] = [
    // Always send Telegram notification
    sendTelegramNotification({
      tenantId,
      hotelId,
      sendToManagementGroups: true,
      sendToStaffGroups: true,
      notificationTypeFilter: 'maintenance_completed',
      title: notifTitle,
      message: body,
      notificationType: 'maintenance',
      actionUrl,
    }),
  ];

  // Only send in-app and push to reporter if different from completer
  if (reportedByUserId !== completedByUserId) {
    notificationPromises.push(
      createInAppNotification({
        userId: reportedByUserId,
        tenantId,
        title: notifTitle,
        body,
        type: 'maintenance_completed',
        actionUrl,
        icon: 'check-circle',
        metadata: { requestId, requestCode, completedBy: completedByUserId } as Json,
      }),
      sendPushNotification({
        userId: reportedByUserId,
        tenantId,
        title: notifTitle,
        body,
        actionUrl,
        tag: `maintenance-complete-${requestId}`,
        notificationType: 'maintenance_completed',
      })
    );
  }

  await Promise.all(notificationPromises);
}

// Trigger for laundry batch completed - sends to hotel staff
export async function triggerLaundryCompletedNotification({
  tenantId,
  hotelId,
  batchCode,
  totalItems,
  batchId,
  completedByUserId,
}: {
  tenantId: string;
  hotelId: string;
  batchCode: string;
  totalItems: number;
  batchId: string;
  completedByUserId?: string;
}) {
  const title = 'Đồ giặt đã nhập kho';
  const body = `Lô ${batchCode} với ${totalItems} món đã nhập kho thành công`;
  const actionUrl = `/laundry/batches/${batchId}`;

  // Notify managers and housekeeping staff
  const recipients = await getNotificationRecipients({
    tenantId,
    hotelId,
    targetRoles: ['manager'],
    excludeUserId: completedByUserId,
  });

  const recipientIds = recipients.map(r => r.id);

  // Send all notifications in PARALLEL
  await Promise.all([
    createMultipleNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      type: 'laundry_completed',
      actionUrl,
      icon: 'shirt',
      metadata: { batchId, batchCode, totalItems, hotelId } as Json,
    }),
    sendMultiplePushNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `laundry-${batchId}`,
      notificationType: 'laundry_completed',
    }),
    sendTelegramNotification({
      tenantId,
      hotelId,
      sendToManagementGroups: true,
      sendToStaffGroups: true,
      notificationTypeFilter: 'laundry',
      title,
      message: body,
      notificationType: 'laundry',
      actionUrl,
    }),
  ]);
}

// Trigger for PO pending approval - sends to approvers (managers/owner)
export async function triggerPOPendingApprovalNotification({
  tenantId,
  hotelId,
  poCode,
  poId,
  createdByUserId,
}: {
  tenantId: string;
  hotelId?: string;
  poCode: string;
  poId: string;
  createdByUserId: string;
}) {
  const title = 'Đơn đặt hàng chờ duyệt';
  const body = `Đơn hàng ${poCode} cần được phê duyệt`;
  const actionUrl = `/purchase-orders/${poId}`;

  const recipients = await getNotificationRecipients({
    tenantId,
    hotelId,
    targetRoles: ['manager', 'owner'],
    excludeUserId: createdByUserId,
  });

  const recipientIds = recipients.map(r => r.id);

  // Send all in PARALLEL
  await Promise.all([
    createMultipleNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      type: 'po_pending_approval',
      actionUrl,
      icon: 'file-text',
      metadata: { poId, poCode, createdBy: createdByUserId } as Json,
    }),
    sendMultiplePushNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `po-pending-${poId}`,
      notificationType: 'po_pending_approval',
    }),
  ]);
}

// Trigger for PO approved - sends to creator
export async function triggerPOApprovedNotification({
  tenantId,
  poCode,
  poId,
  createdByUserId,
  approvedByUserId,
}: {
  tenantId: string;
  poCode: string;
  poId: string;
  createdByUserId: string;
  approvedByUserId: string;
}) {
  if (createdByUserId === approvedByUserId) return;

  const title = 'Đơn đặt hàng được duyệt';
  const body = `Đơn hàng ${poCode} đã được phê duyệt`;
  const actionUrl = `/purchase-orders/${poId}`;

  // Send in-app and push in PARALLEL
  await Promise.all([
    createInAppNotification({
      userId: createdByUserId,
      tenantId,
      title,
      body,
      type: 'po_approved',
      actionUrl,
      icon: 'check-circle',
      metadata: { poId, poCode, approvedBy: approvedByUserId } as Json,
    }),
    sendPushNotification({
      userId: createdByUserId,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `po-${poId}`,
      notificationType: 'po_approved',
    }),
  ]);
}

// Trigger for task assigned - sends to assigned user
export async function triggerTaskAssignedNotification({
  tenantId,
  assignedToUserId,
  assignedByUserId,
  taskType,
  taskTitle,
  taskId,
  actionUrl,
}: {
  tenantId: string;
  assignedToUserId: string;
  assignedByUserId: string;
  taskType: 'maintenance' | 'room_check' | 'laundry' | 'distribution';
  taskTitle: string;
  taskId: string;
  actionUrl: string;
}) {
  if (assignedToUserId === assignedByUserId) return;

  const assigner = await getUserById(assignedByUserId);
  const taskTypeLabels: Record<string, string> = {
    maintenance: 'Bảo trì',
    room_check: 'Kiểm tra phòng',
    laundry: 'Giặt là',
    distribution: 'Phân phối',
  };

  const title = 'Bạn được phân công công việc mới';
  const body = `${taskTypeLabels[taskType]}: ${taskTitle} - Phân công bởi ${assigner?.full_name || 'Quản lý'}`;

  // Send in-app and push in PARALLEL
  await Promise.all([
    createInAppNotification({
      userId: assignedToUserId,
      tenantId,
      title,
      body,
      type: 'task_assigned',
      actionUrl,
      icon: 'user-check',
      metadata: { taskId, taskType, assignedBy: assignedByUserId } as Json,
    }),
    sendPushNotification({
      userId: assignedToUserId,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `task-${taskType}-${taskId}`,
      notificationType: 'task_assigned',
    }),
  ]);
}

// Trigger for room check completed - sends to staff's supervisor
export async function triggerRoomCheckCompletedNotification({
  tenantId,
  hotelId,
  roomNumber,
  checkId,
  completedByUserId,
  hasIssues,
}: {
  tenantId: string;
  hotelId: string;
  roomNumber: string;
  checkId: string;
  completedByUserId: string;
  hasIssues: boolean;
}) {
  const checker = await getUserById(completedByUserId);
  const title = hasIssues ? 'Kiểm tra phòng có vấn đề' : 'Kiểm tra phòng hoàn thành';
  const body = `Phòng ${roomNumber} đã được kiểm tra bởi ${checker?.full_name || 'Nhân viên'}${hasIssues ? ' - Có vấn đề cần xử lý' : ''}`;
  const actionUrl = `/room-checks/${checkId}`;

  // Use supervisor-based notification
  await notifyStaffSupervisor({
    staffUserId: completedByUserId,
    tenantId,
    hotelId,
    title,
    body,
    type: 'room_check_completed',
    actionUrl,
    icon: hasIssues ? 'alert-circle' : 'check-circle',
    metadata: { checkId, roomNumber, hotelId, completedBy: completedByUserId, hasIssues } as Json,
  });
}

// ==================== DISTRIBUTION ORDER TRIGGERS ====================

// Trigger when distribution order is created - notify assigned staff
export async function triggerDistributionOrderCreated({
  tenantId,
  hotelId,
  orderId,
  orderCode,
  assignedToUserId,
  createdByUserId,
  totalRooms,
  totalItems,
}: {
  tenantId: string;
  hotelId: string;
  orderId: string;
  orderCode: string;
  assignedToUserId: string | null;
  createdByUserId: string;
  totalRooms: number;
  totalItems: number;
}) {
  if (!assignedToUserId || assignedToUserId === createdByUserId) return;

  const creator = await getUserById(createdByUserId);
  const title = 'Phiếu giao hàng mới';
  const body = `${orderCode}: ${totalRooms} phòng, ${totalItems} sản phẩm - Phân công bởi ${creator?.full_name || 'Quản lý'}`;
  const actionUrl = `/inventory/distributions/${orderId}`;

  // Send in-app and push in PARALLEL
  await Promise.all([
    createInAppNotification({
      userId: assignedToUserId,
      tenantId,
      title,
      body,
      type: 'task_assigned',
      actionUrl,
      icon: 'truck',
      metadata: { orderId, orderCode, totalRooms, totalItems, createdBy: createdByUserId } as Json,
    }),
    sendPushNotification({
      userId: assignedToUserId,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `distribution-${orderId}`,
      notificationType: 'task_assigned',
    }),
  ]);
}

// Trigger when delivery is confirmed - notify order creator
export async function triggerDistributionDeliveryConfirmed({
  tenantId,
  orderId,
  orderCode,
  roomNumber,
  createdByUserId,
  confirmedByUserId,
  allCompleted,
}: {
  tenantId: string;
  orderId: string;
  orderCode: string;
  roomNumber: string;
  createdByUserId: string;
  confirmedByUserId: string;
  allCompleted: boolean;
}) {
  if (createdByUserId === confirmedByUserId) return;

  const confirmer = await getUserById(confirmedByUserId);
  const title = allCompleted ? 'Phiếu giao hàng hoàn thành' : 'Xác nhận giao hàng';
  const body = allCompleted 
    ? `${orderCode}: Tất cả các phòng đã xác nhận nhận hàng`
    : `${orderCode}: Phòng ${roomNumber} đã xác nhận nhận hàng - bởi ${confirmer?.full_name || 'Nhân viên'}`;
  const actionUrl = `/inventory/distributions/${orderId}`;

  // Send in-app and push in PARALLEL
  await Promise.all([
    createInAppNotification({
      userId: createdByUserId,
      tenantId,
      title,
      body,
      type: allCompleted ? 'success' : 'info',
      actionUrl,
      icon: allCompleted ? 'check-circle' : 'truck',
      metadata: { orderId, orderCode, roomNumber, confirmedBy: confirmedByUserId, allCompleted } as Json,
    }),
    sendPushNotification({
      userId: createdByUserId,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `distribution-confirm-${orderId}`,
      notificationType: allCompleted ? 'success' : 'info',
    }),
  ]);
}

// Trigger when delivery is rejected - notify creator and assigned staff
export async function triggerDistributionDeliveryRejected({
  tenantId,
  hotelId,
  orderId,
  orderCode,
  roomNumber,
  createdByUserId,
  assignedToUserId,
  rejectedByUserId,
  rejectionReason,
}: {
  tenantId: string;
  hotelId: string;
  orderId: string;
  orderCode: string;
  roomNumber: string;
  createdByUserId: string;
  assignedToUserId: string | null;
  rejectedByUserId: string;
  rejectionReason: string;
}) {
  const rejecter = await getUserById(rejectedByUserId);
  const title = 'Giao hàng bị từ chối';
  const body = `${orderCode}: Phòng ${roomNumber} từ chối nhận hàng - ${rejectionReason}`;
  const actionUrl = `/inventory/distributions/${orderId}`;

  // Build notification promises
  const notificationPromises: Promise<any>[] = [];

  // Notify creator
  if (createdByUserId !== rejectedByUserId) {
    notificationPromises.push(
      createInAppNotification({
        userId: createdByUserId,
        tenantId,
        title,
        body,
        type: 'warning',
        actionUrl,
        icon: 'alert-triangle',
        metadata: { orderId, orderCode, roomNumber, rejectedBy: rejectedByUserId, reason: rejectionReason } as Json,
      }),
      sendPushNotification({
        userId: createdByUserId,
        tenantId,
        title,
        body,
        actionUrl,
        tag: `distribution-reject-${orderId}`,
        notificationType: 'warning',
      })
    );
  }

  // Notify assigned staff
  if (assignedToUserId && assignedToUserId !== rejectedByUserId && assignedToUserId !== createdByUserId) {
    notificationPromises.push(
      createInAppNotification({
        userId: assignedToUserId,
        tenantId,
        title,
        body,
        type: 'warning',
        actionUrl,
        icon: 'alert-triangle',
        metadata: { orderId, orderCode, roomNumber, rejectedBy: rejectedByUserId, reason: rejectionReason } as Json,
      }),
      sendPushNotification({
        userId: assignedToUserId,
        tenantId,
        title,
        body,
        actionUrl,
        tag: `distribution-reject-${orderId}`,
        notificationType: 'warning',
      })
    );
  }

  // Execute all in PARALLEL
  await Promise.all(notificationPromises);
}

// Trigger when distribution order is cancelled - notify assigned staff
export async function triggerDistributionOrderCancelled({
  tenantId,
  orderId,
  orderCode,
  assignedToUserId,
  cancelledByUserId,
}: {
  tenantId: string;
  orderId: string;
  orderCode: string;
  assignedToUserId: string | null;
  cancelledByUserId: string;
}) {
  if (!assignedToUserId || assignedToUserId === cancelledByUserId) return;

  const canceller = await getUserById(cancelledByUserId);
  const title = 'Phiếu giao hàng đã hủy';
  const body = `${orderCode} đã bị hủy bởi ${canceller?.full_name || 'Quản lý'}`;
  const actionUrl = `/inventory/distributions`;

  // Send in-app and push in PARALLEL
  await Promise.all([
    createInAppNotification({
      userId: assignedToUserId,
      tenantId,
      title,
      body,
      type: 'warning',
      actionUrl,
      icon: 'x-circle',
      metadata: { orderId, orderCode, cancelledBy: cancelledByUserId } as Json,
    }),
    sendPushNotification({
      userId: assignedToUserId,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `distribution-cancel-${orderId}`,
      notificationType: 'warning',
    }),
  ]);
}

// Generic notification trigger (legacy support)
export async function triggerNotification(
  userId: string,
  tenantId: string,
  title: string,
  body: string,
  type: NotificationType = 'info',
  actionUrl?: string,
  sendPush: boolean = true
): Promise<{ inAppId: string | null; push: PushSendResult & { attempted: boolean } }> {
  const inAppId = await createInAppNotification({
    userId,
    tenantId,
    title,
    body,
    type,
    actionUrl,
  });

  if (!sendPush) {
    return {
      inAppId,
      push: { attempted: false, ok: false, sent: 0, message: 'Push not requested' },
    };
  }

  const pushResult = await sendPushNotificationWithResult({
    userId,
    tenantId,
    title,
    body,
    actionUrl,
    notificationType: type,
  });

  return {
    inAppId,
    push: { attempted: true, ...pushResult },
  };
}


// ==================== ADJUSTMENT PENDING APPROVAL NOTIFICATION ====================

// Trigger when stock adjustment status becomes 'completed' - notify managers/owner
export async function triggerAdjustmentPendingApproval({
  tenantId,
  hotelId,
  adjustmentId,
  adjustmentCode,
  triggeredByUserId,
}: {
  tenantId: string;
  hotelId: string;
  adjustmentId: string;
  adjustmentCode: string;
  triggeredByUserId?: string;
}) {
  const title = '📋 Phiếu kiểm kê cần duyệt';
  const body = `Phiếu ${adjustmentCode} đã hoàn thành và đang chờ duyệt`;
  const actionUrl = `/inventory/adjustments/${adjustmentId}`;

  // Get managers and owner
  const recipients = await getNotificationRecipients({
    tenantId,
    hotelId,
    targetRoles: ['manager', 'owner'],
    excludeUserId: triggeredByUserId,
  });

  const recipientIds = recipients.map(r => r.id);

  if (recipientIds.length === 0) {
    console.warn('[triggerAdjustmentPendingApproval] No recipients found for tenant:', tenantId);
    return;
  }

  // Send all notifications in PARALLEL for speed
  await Promise.allSettled([
    createMultipleNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      type: 'approval_request',
      actionUrl,
      icon: 'clipboard-check',
      metadata: { adjustmentId, adjustmentCode, hotelId } as Json,
    }),
    sendMultiplePushNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `adj-pending-${adjustmentId}`,
      notificationType: 'approval_request',
    }),
    sendTelegramNotification({
      tenantId,
      hotelId,
      department: 'inventory',
      notificationTypeFilter: 'inventory_adjustment',
      sendToManagementGroups: true,
      title,
      message: body,
      notificationType: 'inventory',
      actionUrl,
    }),
  ]);


}

// ==================== ADJUSTMENT ASSIGNED NOTIFICATION ====================

// Trigger when stock adjustment is created - notify assigned users
export async function triggerAdjustmentAssigned({
  tenantId,
  hotelId,
  adjustmentId,
  adjustmentCode,
  scheduledDate,
  assignedToUserIds,
  createdByUserId,
}: {
  tenantId: string;
  hotelId: string;
  adjustmentId: string;
  adjustmentCode: string;
  scheduledDate: string;
  assignedToUserIds: string[];
  createdByUserId: string;
}) {
  if (!assignedToUserIds || assignedToUserIds.length === 0) return;
  
  const title = '📋 Bạn được phân công kiểm kê';
  const body = `Phiếu ${adjustmentCode} - Ngày kiểm: ${scheduledDate}`;
  const actionUrl = `/inventory/adjustments/${adjustmentId}/check`;

  // Filter out the creator from recipients
  const recipientIds = assignedToUserIds.filter(id => id !== createdByUserId);

  if (recipientIds.length === 0) return;

  // Send all notifications in PARALLEL for speed
  await Promise.allSettled([
    createMultipleNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      type: 'task_assigned',
      actionUrl,
      icon: 'clipboard-list',
      metadata: { adjustmentId, adjustmentCode, hotelId, scheduledDate } as Json,
    }),
    sendMultiplePushNotifications({
      recipientIds,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `adj-assigned-${adjustmentId}`,
      notificationType: 'task_assigned',
    }),
    sendTelegramNotification({
      tenantId,
      hotelId,
      userIds: recipientIds,
      department: 'inventory',
      notificationTypeFilter: 'inventory_assignment',
      sendToStaffGroups: true,
      title,
      message: body,
      notificationType: 'inventory',
      actionUrl,
    }),
  ]);

  
}

// ==================== HOUSEKEEPING TASK ASSIGNMENT NOTIFICATION ====================

import { TASK_TYPE_LABELS, PRIORITY_LABELS } from '@/types/housekeeping.types';

/**
 * Trigger notification when a housekeeping task is assigned or reassigned to a staff member
 * Sends: In-app + Push + Telegram
 */
export async function triggerHousekeepingTaskAssignedNotification({
  tenantId,
  hotelId,
  assignedToUserId,
  assignedByUserId,
  taskId,
  taskType,
  roomNumber,
  priority,
  reason,
  isReassignment,
}: {
  tenantId: string;
  hotelId: string;
  assignedToUserId: string;
  assignedByUserId: string;
  taskId: string;
  taskType: string;
  roomNumber: string;
  priority: string;
  reason?: string;
  isReassignment: boolean;
}): Promise<void> {
  // Don't notify if user assigns to themselves
  if (assignedToUserId === assignedByUserId) {
    
    return;
  }

  // Get assigner name
  const assigner = await getUserById(assignedByUserId);
  const taskTypeLabel = TASK_TYPE_LABELS[taskType as keyof typeof TASK_TYPE_LABELS] || taskType;
  const priorityLabel = PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS] || priority;

  // Build title: New assignment vs Reassignment
  const title = isReassignment 
    ? 'Bạn được chuyển công việc mới' 
    : 'Bạn được giao công việc mới';

  // Build detailed body
  const bodyParts = [
    `📍 Phòng ${roomNumber}`,
    `📋 ${taskTypeLabel}`,
    `⚡ Ưu tiên: ${priorityLabel}`,
    `👤 Giao bởi: ${assigner?.full_name || 'Quản lý'}`
  ];
  
  if (reason) {
    bodyParts.push(`📝 Lý do: ${reason}`);
  }

  const body = bodyParts.join('\n');
  const actionUrl = `/my-tasks?task=${taskId}`;

  

  // Send all channels in parallel: In-app + Push + Telegram
  await Promise.allSettled([
    createInAppNotification({
      userId: assignedToUserId,
      tenantId,
      title,
      body,
      type: 'task_assigned',
      actionUrl,
      icon: 'user-check',
      metadata: { 
        taskId, 
        taskType, 
        roomNumber,
        priority,
        assignedBy: assignedByUserId,
        isReassignment 
      } as Json,
    }),
    sendPushNotification({
      userId: assignedToUserId,
      tenantId,
      title,
      body,
      actionUrl,
      tag: `task-housekeeping-${taskId}`,
      notificationType: 'task_assigned',
    }),
    // Telegram notification to individual user
    sendTelegramNotification({
      tenantId,
      hotelId,
      userIds: [assignedToUserId],
      title,
      message: body,
      notificationType: 'system',
      actionUrl,
    }),
  ]);

  
}
