# Table Usage

108 bảng/quan hệ được FE sử dụng / 138 bảng vật lý trong DB (+ 10 view).

| Table | RLS | #Cols | FE ops | #Files |
|---|---|---|---|---|
| `ab_tests` | ✓ | 13 | insert, select | 2 |
| `activity_logs` | ✓ | 15 | insert, select | 6 |
| `ai_settings` | ✓ | 7 | select, upsert | 1 |
| `announcement_dismissals` | ✓ | 3 | insert, select | 1 |
| `announcements` | ✓ | 21 | delete, insert, select, update | 3 |
| `audit_log` | ✓ | 13 | select | 2 |
| `avatars` | ? | 0 | update | 1 |
| `backup_logs` | ✓ | 12 | select | 1 |
| `backups` | ? | 0 |  | 1 |
| `bank_payment_settings` | ✓ | 12 | delete, insert, select, update | 1 |
| `batch_inventory` | ✓ | 13 | select | 1 |
| `booking_consumables` | ✓ | 13 | insert, select, update | 2 |
| `booking_payments` | ✓ | 15 | select | 5 |
| `booking_service_charges` | ✓ | 11 | delete, insert, select, update | 4 |
| `campaign_engagement` | ✓ | 8 | select | 1 |
| `chargeable_consumptions` | ✓ | 26 | delete, insert, select, update | 6 |
| `checkout_inspection_requests` | ✓ | 14 | insert, select, update | 4 |
| `compensation_requests` | ✓ | 25 | insert | 1 |
| `consumption_snapshots` | ✓ | 13 | _(không dùng từ FE)_ | 0 |
| `conversation_members` | ✓ | 9 | select | 2 |
| `conversations` | ✓ | 12 | select | 1 |
| `custom_field_values` | ✓ | 5 | _(không dùng từ FE)_ | 0 |
| `custom_fields` | ✓ | 21 | _(không dùng từ FE)_ | 0 |
| `dashboard_activities` | ? | 8 | _(không dùng từ FE)_ | 0 |
| `dashboard_stats` | ? | 18 | _(không dùng từ FE)_ | 0 |
| `distribution_order_batches` | ✓ | 10 | select | 1 |
| `distribution_order_items` | ✓ | 10 | select | 3 |
| `distribution_order_rooms` | ✓ | 20 | select | 4 |
| `distribution_orders` | ✓ | 25 | select, update | 6 |
| `document_scan_sessions` | ✓ | 9 | insert, select | 1 |
| `email_logs` | ✓ | 17 | _(không dùng từ FE)_ | 0 |
| `email_notifications` | ✓ | 15 | select | 1 |
| `email_send_log` | ✓ | 8 | _(không dùng từ FE)_ | 0 |
| `email_send_state` | ✓ | 7 | _(không dùng từ FE)_ | 0 |
| `email_templates` | ✓ | 22 | _(không dùng từ FE)_ | 0 |
| `email_unsubscribe_tokens` | ✓ | 5 | _(không dùng từ FE)_ | 0 |
| `financial_targets` | ✓ | 10 | delete, select, upsert | 1 |
| `guest_invoices` | ✓ | 37 | insert, select, update | 4 |
| `guest_stay_registrations` | ✓ | 20 | _(không dùng từ FE)_ | 0 |
| `guests` | ✓ | 30 | insert, select, update | 4 |
| `hotel_fixed_expenses` | ✓ | 10 | select, upsert | 2 |
| `hotel_policy` | ✓ | 11 | _(không dùng từ FE)_ | 0 |
| `hotel_policy_history` | ✓ | 13 | _(không dùng từ FE)_ | 0 |
| `hotel_services` | ✓ | 14 | delete, insert, select, update | 1 |
| `hotel_settings` | ✓ | 14 | select, upsert | 2 |
| `hotels` | ✓ | 29 | delete, insert, select, update | 11 |
| `housekeeping_tasks` | ✓ | 32 | insert, select, update | 18 |
| `import_export_history` | ✓ | 20 | _(không dùng từ FE)_ | 0 |
| `in_app_notifications` | ✓ | 12 | delete, insert, select, update | 4 |
| `inventory_transactions` | ✓ | 30 | insert, select | 7 |
| `investigation_logs` | ✓ | 16 | insert | 1 |
| `invoice_vat_claims` | ✓ | 18 | _(không dùng từ FE)_ | 0 |
| `invoices` | ✓ | 19 | insert, select | 4 |
| `item_avg_cost` | ? | 6 | _(không dùng từ FE)_ | 0 |
| `item_categories` | ✓ | 26 | delete, insert, select, update | 9 |
| `item_images` | ✓ | 11 | delete, insert, select, update | 2 |
| `item_units` | ✓ | 11 | insert, select | 1 |
| `items` | ✓ | 43 | delete, insert, select, update | 26 |
| `laundry_batch_audit` | ✓ | 10 | _(không dùng từ FE)_ | 0 |
| `laundry_batch_items` | ✓ | 11 | update | 1 |
| `laundry_batches` | ✓ | 32 | insert, select, update | 11 |
| `laundry_categories` | ✓ | 16 | insert, select | 1 |
| `laundry_requests` | ✓ | 15 | insert, select, update | 3 |
| `laundry_vendors` | ✓ | 17 | insert, select, update | 2 |
| `lost_found_items` | ✓ | 20 | insert, select, update | 2 |
| `maintenance_categories` | ✓ | 17 | insert, select, update | 1 |
| `maintenance_requests` | ✓ | 32 | insert, select, update | 12 |
| `marketing_campaigns` | ✓ | 22 | insert, select, update | 1 |
| `message_attachments` | ✓ | 11 | select | 1 |
| `message_reactions` | ✓ | 6 | _(không dùng từ FE)_ | 0 |
| `message_reads` | ✓ | 4 | _(không dùng từ FE)_ | 0 |
| `messages` | ✓ | 11 | select | 1 |
| `monthly_targets` | ✓ | 8 | select, upsert | 2 |
| `notification_preferences` | ✓ | 31 | insert, select, update | 1 |
| `notifications` | ✓ | 16 | insert | 2 |
| `password_reset_otps` | ✓ | 7 | _(không dùng từ FE)_ | 0 |
| `payment_anomalies` | ✓ | 19 | select, update | 1 |
| `payment_methods` | ✓ | 16 | _(không dùng từ FE)_ | 0 |
| `payment_transactions` | ✓ | 17 | insert, select | 7 |
| `payment_webhook_logs` | ✓ | 9 | _(không dùng từ FE)_ | 0 |
| `pending_group_links` | ✓ | 12 | insert, update | 1 |
| `permissions` | ✓ | 8 | select | 2 |
| `plan_price_history` | ✓ | 9 | insert, select | 1 |
| `platform_settings` | ✓ | 7 | select, update, upsert | 2 |
| `positions` | ✓ | 11 | delete, insert, select, update | 1 |
| `promo_code_usage` | ✓ | 8 | select | 2 |
| `promotional_codes` | ✓ | 16 | insert, select, update | 2 |
| `purchase_order_items` | ✓ | 9 | insert, select, update | 2 |
| `purchase_orders` | ✓ | 19 | delete, insert, select, update | 4 |
| `push_subscriptions` | ✓ | 13 | delete, select, update, upsert | 2 |
| `qc_floor_stats_30d` | ? | 7 | _(không dùng từ FE)_ | 0 |
| `qc_reviews` | ✓ | 12 | _(không dùng từ FE)_ | 0 |
| `qc_sla_settings` | ✓ | 10 | _(không dùng từ FE)_ | 0 |
| `qc_staff_stats_30d` | ? | 9 | _(không dùng từ FE)_ | 0 |
| `rate_limit_hits` | ✓ | 3 | _(không dùng từ FE)_ | 0 |
| `rate_plan_daily_prices` | ✓ | 9 | _(không dùng từ FE)_ | 0 |
| `rate_plans` | ✓ | 16 | _(không dùng từ FE)_ | 0 |
| `reminder_automation_rules` | ✓ | 10 | delete, insert, select, update | 1 |
| `reminder_email_templates` | ✓ | 9 | delete, insert, select, update | 1 |
| `renewal_reminders` | ✓ | 10 | delete, select, update | 1 |
| `reorder_suggestions` | ✓ | 18 | select | 3 |
| `role_permissions` | ✓ | 5 | delete, insert, select | 2 |
| `roles` | ✓ | 9 | delete, insert, select, update | 1 |
| `room_blocks` | ✓ | 11 | _(không dùng từ FE)_ | 0 |
| `room_bookings` | ✓ | 74 | insert, select, update | 36 |
| `room_check_issue_outbox` | ✓ | 20 | _(không dùng từ FE)_ | 0 |
| `room_check_issue_reviews` | ✓ | 9 | _(không dùng từ FE)_ | 0 |
| `room_check_issues` | ✓ | 32 | select | 1 |
| `room_check_sessions` | ✓ | 7 | delete, insert, select, update | 1 |
| `room_check_staff_items_view` | ? | 13 | _(không dùng từ FE)_ | 0 |
| `room_checks` | ✓ | 30 | delete, insert, select, update | 15 |
| `room_items` | ✓ | 14 | insert, select, update, upsert | 8 |
| `room_pricing_rules` | ✓ | 17 | insert, select, update | 2 |
| `room_type_availability` | ✓ | 9 | _(không dùng từ FE)_ | 0 |
| `room_type_rates` | ✓ | 15 | select | 2 |
| `room_type_standards` | ✓ | 7 | delete, insert, select, update | 2 |
| `room_types` | ✓ | 21 | insert, select | 5 |
| `rooms` | ✓ | 31 | delete, insert, select, update | 25 |
| `seasonal_rate_overrides` | ✓ | 15 | _(không dùng từ FE)_ | 0 |
| `shift_history` | ✓ | 9 | select | 2 |
| `shift_notes` | ✓ | 9 | insert, select | 1 |
| `shift_reminders` | ✓ | 8 | _(không dùng từ FE)_ | 0 |
| `staff_statistics` | ✓ | 11 | select | 1 |
| `staff_status` | ✓ | 12 | select, update, upsert | 5 |
| `stock_adjustment_items` | ✓ | 26 | insert, select, update | 2 |
| `stock_adjustments` | ✓ | 20 | insert, select, update | 7 |
| `subscription_plans` | ✓ | 19 | insert, select, update | 3 |
| `super_admin_activity_log` | ✓ | 10 | select | 1 |
| `supplement_requests` | ✓ | 20 | insert, select, update | 5 |
| `suppressed_emails` | ✓ | 5 | _(không dùng từ FE)_ | 0 |
| `telegram_connections` | ✓ | 12 | select, update | 3 |
| `telegram_groups` | ✓ | 12 | delete, insert, select, update | 3 |
| `tenant_usage` | ✓ | 12 | select | 2 |
| `tenants` | ✓ | 39 | delete, select, update | 15 |
| `user_hotels` | ✓ | 9 | delete, insert, select, update | 9 |
| `user_levels` | ✓ | 6 | _(không dùng từ FE)_ | 0 |
| `user_permissions` | ✓ | 9 | _(không dùng từ FE)_ | 0 |
| `user_preferences` | ✓ | 5 | select, upsert | 2 |
| `user_roles` | ✓ | 5 | select | 3 |
| `user_with_levels` | ? | 16 | _(không dùng từ FE)_ | 0 |
| `users` | ✓ | 33 | delete, insert, select, update | 21 |
| `v_overdue_checkins` | ? | 71 | _(không dùng từ FE)_ | 0 |
| `v_user_conversations` | ? | 12 | select | 2 |
| `v_user_effective_roles` | ? | 8 | _(không dùng từ FE)_ | 0 |
| `vendors` | ✓ | 27 | delete, insert, select, update | 3 |
| `warehouse_stock` | ✓ | 11 | delete, select | 2 |
| `warehouses` | ✓ | 13 | delete, insert, select, update | 2 |
| `workflow_actions` | ✓ | 10 | delete, insert | 1 |
| `workflow_executions` | ✓ | 12 | select | 1 |
| `workflows` | ✓ | 18 | delete, insert, select, update | 1 |

## Bảng không được gọi từ FE (42)

Có thể: (a) backend-only / trigger, (b) dead code, (c) gọi qua RPC.

- `consumption_snapshots`
- `custom_field_values`
- `custom_fields`
- `dashboard_activities`
- `dashboard_stats`
- `email_logs`
- `email_send_log`
- `email_send_state`
- `email_templates`
- `email_unsubscribe_tokens`
- `guest_stay_registrations`
- `hotel_policy`
- `hotel_policy_history`
- `import_export_history`
- `invoice_vat_claims`
- `item_avg_cost`
- `laundry_batch_audit`
- `message_reactions`
- `message_reads`
- `password_reset_otps`
- `payment_methods`
- `payment_webhook_logs`
- `qc_floor_stats_30d`
- `qc_reviews`
- `qc_sla_settings`
- `qc_staff_stats_30d`
- `rate_limit_hits`
- `rate_plan_daily_prices`
- `rate_plans`
- `room_blocks`
- `room_check_issue_outbox`
- `room_check_issue_reviews`
- `room_check_staff_items_view`
- `room_type_availability`
- `seasonal_rate_overrides`
- `shift_reminders`
- `suppressed_emails`
- `user_levels`
- `user_permissions`
- `user_with_levels`
- `v_overdue_checkins`
- `v_user_effective_roles`
