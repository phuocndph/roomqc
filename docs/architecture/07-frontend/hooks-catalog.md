# Hooks Catalog

225 hooks. Nguồn: `src/hooks/`.

| Hook | RPC dùng | Bảng dùng | Query keys (mẫu) |
|---|---|---|---|
| `useAccessibleReports` | – | – |  |
| `useActiveAnnouncements` | – | `announcements`, `announcement_dismissals` | 'announcements', 'active' |
| `useActiveBanner` | – | – |  |
| `useActiveRoomBookings` | – | `room_bookings` | 'active-room-bookings', tenantId, hotelId |
| `useAnnouncementsAdmin` | – | `announcements` | 'announcements', 'admin' |
| `useAutoSave` | – | – |  |
| `useAvailableRooms` | – | `rooms`, `room_types`, `room_type_rates`, `room_bookings` | 'available-rooms' |
| `useBackupLogs` | – | `backup_logs` | 'backup-logs', tenantId |
| `useBankPaymentSettings` | – | `bank_payment_settings` | 'bank-payment-settings', hotelId |
| `useBookingConflicts` | – | `room_bookings` | 'booking-conflicts', tenantId, isAllHotelsMode ? ' |
| `useBookingConsumables` | – | `booking_consumables`, `room_items`, `room_checks`, `users` | 'booking-consumables', bookingId |
| `useBookingFlagTransition` | `transition_booking_status` | – | 'room-bookings' |
| `useBookingIssues` | – | `room_checks`, `room_bookings` | 'booking-issues' |
| `useBookingPayments` | `create_booking_payment_pending`, `confirm_booking_payment_manual`, `cancel_booking_payment`, `update_booking_amount_paid` | `booking_payments` | 'booking-payment', paymentId |
| `useBookingServiceCharges` | – | `booking_service_charges`, `chargeable_consumptions`, `room_ | 'booking-service-charges', bookingId, tenantId |
| `useBookingSheetDetails` | – | `room_bookings`, `booking_service_charges`, `chargeable_cons | 'booking-sheet-details', bookingId, tenantId |
| `useBookingStats` | – | `rooms`, `room_bookings`, `booking_payments` | 'booking-stats', hotelId, isAllHotelsMode, today |
| `useBulkCreateRooms` | – | `tenant_usage`, `tenants`, `rooms` | 'rooms' |
| `useBulkRoomActions` | `apply_room_standards`, `transition_room_status` | `room_items`, `room_checks`, `rooms` | 'rooms' |
| `useCashFlowReport` | – | `booking_payments`, `purchase_orders`, `laundry_batches`, `m |  'cash-flow-report', tenantId, hotelKey, period.cu |
| `useCategories` | `get_categories_with_stats` | `item_categories`, `items` | 'categories' |
| `useChangelog` | – | – |  |
| `useChangelogList` | – | – | 'changelog-list' |
| `useChargeableConsumptions` | `get_booking_chargeable_total` | `chargeable_consumptions`, `items` | 'chargeable-consumptions', bookingId |
| `useChat` | `send_chat_message`, `mark_conversation_read`, `create_direct_conversation`, `create_group_conversation` | `v_user_conversations`, `conversation_members`, `users`, `me | 'chat-conversations', tenantId, hotelId, user?.id |
| `useCheckoutInspection` | `transition_task_status` | `checkout_inspection_requests`, `housekeeping_tasks`, `rooms | 'checkout-inspection', bookingId |
| `useCompletedTasksToday` | – | `housekeeping_tasks` | 'completed-tasks-today', userId, selectedHotel?.id |
| `useConsumptionAnalytics` | `get_latest_consumption_snapshots`, `get_consumption_trend`, `refresh_consumption_snapshots` | `items` |  'consumption-snapshots-latest', tenant?.id, isAll |
| `useCreateDistributionFromSupplement` | `create_distribution_order` | `supplement_requests`, `distribution_orders`, `user_hotels` | 'supplement-requests' |
| `useCreateDistributionFromSupplements` | `create_distribution_order` | `supplement_requests` | 'distribution-orders' |
| `useDashboardStats` | `get_dashboard_stats`, `get_hotels_breakdown_stats` | – | 'dashboard-stats', tenantId, isAllHotelsMode ? 'al |
| `useDeadStockReport` | `get_dead_stock_report` | – |  'dead-stock-report', tenant?.id, isAllHotelsMode  |
| `useDeliveryTaskItems` | – | `distribution_order_rooms`, `distribution_order_items` | 'delivery-task-items', distributionOrderRoomId |
| `useDistributionOrders` | `get_distribution_orders_filtered`, `get_distribution_order_detail`, `create_distribution_order`, `cancel_distribution_order`, `confirm_warehouse_delivery`, `update_distribution_order` | – | 'distribution-orders', tenant?.id, isAllHotelsMode |
| `useEffectivePermissions` | `get_effective_permissions` | – | 'effective-permissions', targetId |
| `useEmailNotification` | – | – |  |
| `useEmailNotifications` | `queue_email_notification`, `check_expiring_subscriptions` | `email_notifications` | 'email-notifications', tenant?.id, status |
| `useEnsureVersionDraft` | – | `announcements` | 'announcements', 'version-draft', APP_VERSION |
| `useFinancialTargets` | – | `financial_targets` | 'financial-targets', tenantId, hotelId ?? 'all', m |
| `useFirstAccessibleRoute` | – | – |  |
| `useFixedExpenses` | – | `hotel_fixed_expenses`, `monthly_targets` | 'fixed-expenses', tenantId, hotelId, monthStr |
| `useFloorMapCellSize` | – | – |  |
| `useFloorMapCellSizeRemote` | `update_hotel_floor_map_cell_size` | `hotels` | 'floor-map-cell-size', tenantId, hotelId |
| `useFloorPlan` | `get_floor_plan` | – | 'floor-plan', hotelId |
| `useFloorPlanLive` | `get_floor_plan_live` | – | 'floor-plan-live', hotelId |
| `useGracePeriod` | – | – |  |
| `useGroupBooking` | – | `room_bookings` | 'group-booking', bookingGroupId |
| `useGroupCheckoutCalculations` | – | `room_checks`, `room_bookings` |  |
| `useGuardedMutation` | – | – |  |
| `useGuestInvoices` | `generate_guest_invoice_number` | `guest_invoices` | 'guest-invoices', tenantId, hotelId, filters |
| `useGuests` | – | `guests`, `room_bookings` | 'guests', tenantId, filters |
| `useGuestStayHistory` | – | `room_bookings` | 'guest-stay-history', tenantId, guestPhone, guestI |
| `useGuestsV2` | – | `guests` | 'guests-v2', tenantId, segment, search, sortBy, so |
| `useHotelPerformance` | `get_hotel_performance_stats`, `get_hotels_performance_comparison` | – | 'hotel-performance-stats', tenantId, hotelId, date |
| `useHotelPhotoMode` | – | `hotels` | 'hotel-photo-mode', hotelId |
| `useHotelPolicy` | – | `hotel_policy`, `hotel_policy_history` | 'hotel-policies', tenantId, selectedHotel?.id |
| `useHotelPricingRules` | – | `hotel_settings` | 'hotel-pricing-rules', hotelId |
| `useHotelQcMode` | – | `hotels` | 'hotel-qc-mode', hotelId |
| `useHotels` | – | `hotels`, `users` | 'hotels', tenantId, filters |
| `useHotelServices` | – | `hotel_services` | 'hotel-services', tenantId, selectedHotelId, activ |
| `useHotelStaffList` | – | `user_hotels` | 'hotel-staff-list', hotelId |
| `useHousekeepingDashboardPanels` | – | `room_bookings`, `housekeeping_tasks` | 'hk-checkout-today', tenantId, hotelId, today |
| `useHousekeepingKpi` | `get_rooms_filtered` | `room_bookings` | 'hk-kpi', tenantId, hotelId |
| `useHousekeepingOpsSummary` | – | `maintenance_requests`, `lost_found_items`, `laundry_batches | 'hk-ops-summary', tenantId, hotelId |
| `useHousekeepingTasks` | `complete_task`, `transition_task_status` | `housekeeping_tasks` | 'housekeeping-task', taskId |
| `useIdlePrefetch` | – | – |  |
| `useImageUpload` | – | – |  |
| `useInventoryDashboard` | `get_inventory_dashboard_stats`, `get_low_stock_items`, `get_inventory_value_over_time` | – | 'inventory-dashboard', tenant?.id, isAllHotelsMode |
| `useInventoryHubBadges` | `get_inventory_dashboard_stats` | `reorder_suggestions`, `distribution_orders`, `stock_adjustm | 'inventory-hub-badges', tenantId |
| `useInventoryHubShortcuts` | – | – |  |
| `useInventoryTransactions` | `get_inventory_transactions_filtered`, `create_inbound_transaction`, `create_outbound_transaction`, `delete_inventory_transaction` | `inventory_transactions` | 'inventory-transactions', tenant?.id, isAllHotelsM |
| `useItemCategories` | – | `item_categories` | 'item-categories' |
| `useItemImages` | – | `item_images` | 'item-images', itemId |
| `useItems` | `get_items_filtered`, `bulk_delete_items` | `item_images`, `items`, `inventory_transactions`, `room_item | 'items' |
| `useItemUnits` | – | `item_units` | 'item-units', tenantId |
| `useLaborCost` | `get_labor_cost` | – |  'labor-cost', tenantId, hotelId ?? 'all', dateRan |
| `useLaundryBatches` | `get_laundry_batches_filtered`, `get_laundry_batch_detail`, `create_laundry_batch_with_items`, `create_laundry_return_transaction`, `create_laundry_loss_transaction` | `notifications`, `laundry_batches`, `laundry_batch_items`, ` | 'laundry-batches', tenantId, selectedHotel?.id, is |
| `useLaundryCategories` | – | `laundry_categories` | 'laundry-categories', tenantId |
| `useLaundryCompensation` | `mark_batch_partially_received`, `settle_batch_compensation`, `create_new_linen_batch` | `laundry_batches`, `batch_inventory` | 'laundry-compensation', tenantId, selectedHotel?.i |
| `useLaundryDashboard` | `get_laundry_dashboard_stats`, `get_monthly_laundry_expenses` | – | 'laundry-dashboard-stats', tenant?.id, isAllHotels |
| `useLaundryRequests` | `generate_laundry_request_code`, `add_laundry_to_draft_batch` | `laundry_requests`, `laundry_batches` | 'laundry-requests', tenantId, selectedHotel?.id, i |
| `useLaundryVendors` | `get_vendor_performance` | `laundry_vendors` | 'laundry-vendors', tenant?.id, filters |
| `useLeanDraft` | – | – |  |
| `useLongPress` | – | – |  |
| `useLostFound` | – | `lost_found_items` | 'lost-found', tenantId, hotelId, filters |
| `useMaintenanceCategories` | – | `maintenance_categories` | 'maintenance-categories', tenantId |
| `useMaintenanceDashboard` | `get_maintenance_dashboard` | – | 'maintenance-dashboard', tenantId, isAllHotelsMode |
| `useMaintenanceReport` | `get_maintenance_report` | – |  'maintenance-report', tenantId, isAllHotelsMode ? |
| `useMaintenanceRequests` | – | `maintenance_requests` | 'maintenance-requests', tenantId, selectedHotel?.i |
| `useManagersByHotel` | – | `user_hotels` | 'managers-by-hotel', tenant?.id, hotelId |
| `useMarkBookingNoShow` | `mark_booking_no_show` | – | 'overdue-checkins' |
| `useMarketingCampaigns` | – | `marketing_campaigns`, `campaign_engagement` | 'marketing-campaigns', filters |
| `useMobileNavPreferences` | – | `user_preferences` |  |
| `useMonthlyExpenses` | `get_monthly_expenses` | – | 'monthly-expenses', tenantId, months, isAllHotelsM |
| `useNotificationPreferences` | – | `notification_preferences` | 'notification-preferences', authUser?.id |
| `useNotificationTriggers` | `create_notification_for_user` | `user_hotels` |  |
| `useOnlinePresence` | – | `staff_status` | 'online-presence', tenantId |
| `useOnShiftStaffList` | – | `user_hotels`, `staff_status` | 'on-shift-staff-list', hotelId |
| `useOnShiftStaffListAll` | – | `users`, `staff_status` | 'on-shift-staff-list-all', tenantId |
| `useOperationsInsights` | – | `room_bookings` |  'operations-insights', tenantId, hotelId ?? 'all' |
| `useOperationsReport` | – | `inventory_transactions`, `stock_adjustments` | 'operations-report', tenantId, isAllHotelsMode ? ' |
| `useOutboundReport` | – | `inventory_transactions` |  'outbound-report', tenant?.id, isAllHotelsMode ?  |
| `useOutOfStockCount` | – | `items` | 'out-of-stock-count', tenantId |
| `useOverdueCheckins` | – | `v_overdue_checkins` | 'overdue-checkins', tenantId, hotelId, isAllHotels |
| `useOverviewAlerts` | `get_low_stock_items` | `room_bookings`, `maintenance_requests`, `laundry_batches` | 'overview-alerts', tenantId, hotelKey |
| `useOverviewKpiStrip` | – | `rooms`, `room_bookings`, `maintenance_requests`, `laundry_b | 'overview-room-aggregate', tenantId, hotelKey, cur |
| `usePendingCounts` | – | `supplement_requests`, `laundry_requests`, `distribution_ord | 'pending-counts-all' |
| `usePendingDeliveries` | `confirm_delivery_from_room_check` | `distribution_order_rooms`, `distribution_order_items` | 'pending-deliveries', roomId |
| `usePendingPayments` | – | `payment_transactions` | 'pending-payments', tenantId |
| `usePendingReviewCount` | – | `housekeeping_tasks` | 'pending-review-count' |
| `usePendingRoomDistributions` | – | `distribution_order_rooms` | 'pending-room-distributions', selectedHotel?.id, i |
| `usePermission` | `has_user_permission` | – | 'has-permission', user?.id, module, action |
| `usePermissions` | `get_user_permissions` | `permissions`, `user_roles`, `role_permissions` | 'all-permissions' |
| `usePlatformSettings` | – | `platform_settings`, `activity_logs` | 'platform-settings' |
| `usePositions` | – | `positions` | 'positions', tenantId, userLevelCode |
| `usePostUpdateToast` | – | – |  |
| `usePricingDaily` | `ensure_default_rate_plan`, `resolve_daily_prices_bulk`, `get_pricing_health`, `resolve_today_prices_for_hotel` | `room_type_rates`, `rate_plans`, `rate_plan_daily_prices`, ` | 'room-type-rate', tenantId, roomTypeId |
| `usePricingManagement` | – | `subscription_plans`, `plan_price_history`, `tenants` | 'all-subscription-plans' |
| `usePricingRules` | – | `room_pricing_rules`, `booking_consumables` | 'pricing-rules', hotelId |
| `useProfile` | – | `users` | 'user' |
| `usePromoCodes` | `apply_promo_code` | `promotional_codes`, `promo_code_usage` | 'promo-codes', filters |
| `usePullToRefresh` | – | – |  |
| `usePurchaseOrders` | `create_inbound_transaction` | `purchase_orders`, `purchase_order_items` | 'purchase-orders', tenantId, selectedHotel?.id, is |
| `usePushNotifications` | – | `push_subscriptions` |  |
| `usePWAInstall` | – | – |  |
| `usePWAUpdate` | – | – |  |
| `useQcStats` | `get_qc_staff_stats`, `get_qc_floor_stats`, `get_qc_daily_trend` | `housekeeping_tasks` | 'qc-staff-stats', tenantId, hotelId, days |
| `useQuickRoomCheck` | `get_last_room_check`, `perform_quick_room_check` | – | 'last-room-check', roomId |
| `useQuotaCheck` | – | – |  |
| `useReadOnlyMode` | – | `tenants` | 'tenant-read-only', tenantId |
| `useRecentActivities` | `get_recent_activities` | – | 'recent-activities', tenantId, limit, isAllHotelsM |
| `useReceptionRoomDetail` | – | `rooms`, `room_bookings`, `booking_service_charges`, `charge | 'reception-room-detail', roomId, bookingId, tenant |
| `useRecurringIssues` | – | `maintenance_requests` | 'recurring-issues', tenantId, isAllHotelsMode ? 'a |
| `useRenewalReminders` | `schedule_renewal_reminders` | `renewal_reminders`, `reminder_automation_rules`, `reminder_ | 'renewal-reminders', filters |
| `useReorderSuggestions` | `approve_reorder_suggestions`, `ignore_reorder_suggestion`, `compute_reorder_suggestions` | `reorder_suggestions`, `vendors` | 'reorder-suggestions' |
| `useReportExport` | – | – |  |
| `useReports` | `get_inventory_report`, `get_financial_report`, `get_abc_analysis`, `get_turnover_analysis`, `get_laundry_report`, `get_low_stock_items` | `inventory_transactions`, `laundry_batches`, `stock_adjustme | 'inventory-report', tenantId, isAllHotelsMode ? 'a |
| `useRescheduleBookingCheckin` | `reschedule_booking_checkin` | – | 'overdue-checkins' |
| `useRevenueReport` | – | `room_bookings`, `room_checks` | 'revenue-report', tenantId, isAllHotelsMode ? 'all |
| `useRoles` | – | `user_roles` | 'roles' |
| `useRolesManagement` | – | `roles`, `role_permissions`, `permissions` | 'roles', tenantId |
| `useRoomAuditLog` | – | `audit_log`, `users` | 'audit-log', 'rooms', roomId, limit |
| `useRoomAvailabilityWindow` | – | `room_bookings` | 'room-availability', tenantId, roomId |
| `useRoomBooking` | `get_current_room_booking` | `room_bookings` | 'room-booking', roomId |
| `useRoomCheckGuard` | `validate_room_check_context` | – | 'room-check-guard', roomId, checkType, taskId ?? n |
| `useRoomCheckLean` | `submit_room_check_lean`, `reopen_room_check` | – | 'rooms' |
| `useRoomCheckLeanConfig` | – | `hotels` | 'room-check-lean-config', hotelId |
| `useRoomChecks` | `transition_room_status`, `atomic_item_to_laundry`, `atomic_item_lost`, `atomic_item_consumed`, `generate_supplement_request_code`, `generate_laundry_request_code`, `add_laundry_to_draft_batch` | `room_checks`, `housekeeping_tasks`, `inventory_transactions | 'room-checks', roomId |
| `useRoomCheckSession` | – | `room_check_sessions` |  |
| `useRoomDistributionHistory` | `confirm_room_delivery`, `batch_confirm_room_deliveries`, `reject_room_delivery`, `undo_room_delivery_confirmation` | `distribution_order_rooms` | 'room-distribution-history', roomId |
| `useRoomItems` | – | `room_items` | 'room' |
| `useRoomLastCheck` | – | `room_checks` | 'room-last-check', roomId |
| `useRoomPerformance` | – | `room_bookings` | 'room-performance', roomId, tenantId, days |
| `useRoomRevenueMetrics` | – | – |  |
| `useRooms` | `get_rooms_filtered`, `get_room_items_with_standards`, `transition_room_status`, `transition_task_status` | `rooms`, `room_checks`, `room_items`, `housekeeping_tasks` | 'rooms', tenantId, selectedHotel?.id, isAllHotelsM |
| `useRoomsNeedingActionToday` | `get_rooms_filtered` | `room_bookings`, `housekeeping_tasks` | 'hk-action-buckets', tenantId, hotelId |
| `useRoomsReportData` | `get_rooms_report_stats`, `get_room_checks_report`, `get_daily_occupancy_trend` | – | 'rooms-report-stats', tenantId, hotelId, dateRange |
| `useRoomStandards` | `get_room_standards`, `apply_room_standards` | `room_type_standards` | 'room-standards', hotelId, roomType |
| `useRoomSubscriptionLimit` | – | `rooms` | 'actual-room-count', tenantId |
| `useRoomSupplements` | `get_room_items_with_standards`, `create_outbound_transaction`, `get_rooms_filtered` | `rooms`, `items`, `room_items` | 'room-supplements', roomId |
| `useRoomTransition` | `transition_room_status` | – | 'rooms' |
| `useRoomTypePricing` | – | `room_types`, `room_type_rates` | 'room-type-pricing-fixed', tenantId, hotelId ?? nu |
| `useRoomTypeRates` | `duplicate_room_type`, `calculate_booking_price` | `room_type_rates` | 'room-type-rates', tenantId, hotelId ?? 'all' |
| `useRoomTypes` | – | `room_types` | 'room-types', tenantId |
| `useRoomViewDensity` | – | – |  |
| `useRouteBatch` | `get_distribution_order_detail`, `handover_batch`, `receive_batch`, `deliver_stop`, `mark_cannot_access`, `retry_stop`, `return_to_stock_for_stop`, `handover_stop_create_next_route`, `close_route_if_complete`, `confirm_receive_order` | `distribution_order_batches`, `distribution_orders` | 'route-batches', orderId |
| `useRouteFilters` | `get_distribution_orders_filtered`, `get_distribution_orders_count` | `distribution_orders` |  'distribution-routes', tenant?.id, isAllHotelsMod |
| `useSeasonalRates` | – | `seasonal_rate_overrides` | 'seasonal-rates', tenantId, hotelId ?? 'all' |
| `useSendDraftBatch` | `send_draft_batch` | – | 'laundry-batches' |
| `useSetupRoom` | `setup_room_initial` | `rooms` | 'room', roomId |
| `useShiftHistory` | – | `shift_history` | 'shift-history', tenantId, filters |
| `useShiftManagement` | – | `staff_status` | 'my-staff-status', user?.id |
| `useShiftNotes` | – | `shift_notes` | 'shift-notes', tenantId, hotelId, dateFrom, dateTo |
| `useShiftSettings` | – | `tenants` | 'shift-settings', tenantId |
| `useShiftTimer` | – | – |  |
| `useStaffActivity` | – | `activity_logs` | 'staff-activities', tenantId, userId, limit, isAll |
| `useStaffStatistics` | `calculate_staff_statistics` | `staff_statistics` | 'staff-statistics', tenant?.id, selectedHotel?.id, |
| `useStaffStatus` | – | `users`, `staff_status` | 'staff-status', tenantId, isAllHotelsMode ? 'all'  |
| `useStayRegistrations` | `retry_stay_registration`, `enqueue_stay_registration` | `guest_stay_registrations` | 'stay-registrations', tenantId, params.hotelId ??  |
| `useStockAdjustments` | `get_stock_adjustments_filtered`, `create_stock_adjustment` | `stock_adjustments`, `stock_adjustment_items`, `investigatio | 'stock-adjustments', tenant?.id, isAllHotelsMode ? |
| `useStockAuditReport` | `get_stock_audit_report` | – | 'stock-audit-report', tenantId, isAllHotelsMode ?  |
| `useStockoutItems` | – | – |  |
| `useSubmitDeliveryLean` | `submit_delivery_lean` | – | 'rooms' |
| `useSubmitReplenishLean` | `submit_replenish_lean` | – | 'rooms' |
| `useSubordinates` | `get_user_subordinates`, `user_has_subordinates` | – | 'subordinates', userId |
| `useSubscription` | `update_tenant_usage` | `subscription_plans`, `tenants`, `invoices`, `payment_transa | 'subscription-plans' |
| `useSuperAdminAuth` | – | – |  |
| `useSuperAdminStats` | `get_super_admin_dashboard_stats` | `payment_transactions`, `tenants` | 'super-admin-stats' |
| `useSupplementRequests` | `generate_supplement_request_code`, `create_outbound_transaction` | `supplement_requests` | 'supplement-requests', tenantId, selectedHotel?.id |
| `useSwipeGesture` | – | – |  |
| `useSyncCategories` | `sync_categories_for_hotel` | – | 'items' |
| `useTapeChart` | `get_tape_chart` | – | 'tape-chart', hotelId |
| `useTapeChartMutations` | `create_room_block`, `delete_room_block`, `move_booking`, `resize_booking` | – | 'tape-chart', hotelId |
| `useTapeChartPrefs` | – | – |  |
| `useTaskQc` | `complete_task`, `approve_task`, `reject_task` | `rooms` | 'housekeeping-tasks' |
| `useTaskTransition` | `transition_task_status` | – | 'housekeeping-tasks' |
| `useTelegramNotification` | – | – |  |
| `useTenant` | – | `tenants` | 'tenant', tenantId |
| `useTenantApproval` | `get_pending_tenants`, `approve_tenant`, `reject_tenant` | – | 'pending-tenants' |
| `useTenantBilling` | `get_tenant_billing_summary` | `payment_transactions`, `invoices` | 'tenant-payments', tenantId |
| `useTenantChannel` | – | – |  |
| `useTenants` | – | `tenants`, `invoices`, `activity_logs` | 'super-admin-tenants' |
| `useTenantUsage` | `check_tenant_can_add`, `update_tenant_usage`, `calculate_tenant_storage` | `tenant_usage` | 'tenant-usage', tenant?.id |
| `useTheme` | – | – |  |
| `useTopItems` | `get_top_items` | – | 'top-items', tenantId, limit, isAllHotelsMode ? 'a |
| `useUndoQuickRoomCheck` | `undo_quick_room_check` | – | 'rooms' |
| `useUnifiedTasks` | – | `housekeeping_tasks`, `stock_adjustments` | 'unified-tasks', userId, selectedHotel?.id |
| `useUpdateRoomCheckLeanConfig` | – | `hotels` | 'room-check-lean-config', vars.hotelId |
| `useUsageMode` | – | – |  |
| `useUser` | – | `users`, `user_roles` | 'user', authUser?.id |
| `useUserHotels` | – | `user_hotels` | 'user-hotels', userId |
| `useUserLevels` | `get_user_levels` | – | 'user-levels' |
| `useUserModulePermissions` | `get_user_permissions_summary` | – | 'user-module-permissions', user?.id |
| `useUserPermissionConfiguration` | `get_user_permissions_summary` | `user_permissions` | 'user-permission-configuration', userId |
| `useUserPermissions` | `get_user_permissions_summary`, `get_user_permissions`, `has_user_permission` | `user_permissions` | 'user-permissions', userId |
| `useUsers` | `get_users_by_hotel` | `users` | 'users', tenant?.id, currentUser?.id, currentUser? |
| `useValidatePlanChange` | `validate_plan_change` | – | 'validate-plan-change', tenantId, newPlanId |
| `useVatClaimToken` | `ensure_vat_claim_token` | – | 'vat-claim-token', invoiceId |
| `useVendors` | – | `vendors`, `purchase_orders` | 'vendors', tenantId, filters |
| `useWarehouseReport` | `get_all_warehouse_stock_summary`, `get_low_stock_by_warehouses` | – | 'warehouse-stock-report', tenant?.id, isAllHotelsM |
| `useWarehouses` | – | `warehouses`, `warehouse_stock` | 'warehouses', tenant?.id, isAllHotelsMode ? 'all'  |
| `useWarehouseStock` | `get_warehouse_stock_summary` | `warehouse_stock` | 'warehouse-stock', warehouseId |
| `useWarehouseTransfer` | `create_warehouse_transfer` | – | 'warehouse-stock' |
| `useWindowSize` | – | – |  |
| `useWorkflows` | – | `workflows`, `workflow_actions`, `workflow_executions` | 'workflows', tenantId |
