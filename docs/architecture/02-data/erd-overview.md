# ERD Overview

Mỗi domain có ERD riêng (xem các file `erd-*.md`). File này là bản đồ tổng + Mermaid theo domain.

**Tổng: 138 bảng vật lý, 324 foreign key, 10 view.**

## Tenant & Auth

```mermaid
erDiagram
  tenants {
    uuid id PK
  }
  hotels {
    uuid id PK
  }
  users {
    uuid id PK
  }
  user_roles {
    uuid id PK
  }
  user_hotels {
    uuid id PK
  }
  roles {
    uuid id PK
  }
  permissions {
    uuid id PK
  }
  role_permissions {
    uuid id PK
  }
  positions {
    uuid id PK
  }
  user_preferences {
    uuid id PK
  }
  users ||--o{ tenants : "approved_by"
  users ||--o{ hotels : "manager_id"
  tenants ||--o{ hotels : "tenant_id"
  positions ||--o{ users : "position_id"
  users ||--o{ users : "reports_to"
  users ||--o{ users : "deactivated_by"
  users ||--o{ users : "created_by"
  tenants ||--o{ users : "tenant_id"
  hotels ||--o{ users : "hotel_id"
  users ||--o{ user_hotels : "assigned_by"
  hotels ||--o{ user_hotels : "hotel_id"
  users ||--o{ user_hotels : "user_id"
  tenants ||--o{ roles : "tenant_id"
  users ||--o{ role_permissions : "granted_by"
  permissions ||--o{ role_permissions : "permission_id"
  roles ||--o{ role_permissions : "role_id"
  tenants ||--o{ positions : "tenant_id"
  hotels ||--o{ user_preferences : "current_hotel_id"
  users ||--o{ user_preferences : "user_id"
```

## Bookings & Guests

```mermaid
erDiagram
  room_bookings {
    uuid id PK
  }
  booking_payments {
    uuid id PK
  }
  booking_consumables {
    uuid id PK
  }
  booking_service_charges {
    uuid id PK
  }
  guests {
    uuid id PK
  }
  pending_group_links {
    uuid id PK
  }
  guest_invoices {
    uuid id PK
  }
  invoices {
    uuid id PK
  }
  guests ||--o{ room_bookings : "guest_id"
  room_bookings ||--o{ booking_payments : "booking_id"
  room_bookings ||--o{ booking_consumables : "booking_id"
  room_bookings ||--o{ booking_service_charges : "booking_id"
  room_bookings ||--o{ guest_invoices : "booking_id"
```

## Rooms & Housekeeping

```mermaid
erDiagram
  rooms {
    uuid id PK
  }
  room_types {
    uuid id PK
  }
  room_type_standards {
    uuid id PK
  }
  room_pricing_rules {
    uuid id PK
  }
  room_items {
    uuid id PK
  }
  room_checks {
    uuid id PK
  }
  room_check_sessions {
    uuid id PK
  }
  room_check_issues {
    uuid id PK
  }
  housekeeping_tasks {
    uuid id PK
  }
  lost_found_items {
    uuid id PK
  }
  rooms ||--o{ room_items : "room_id"
  rooms ||--o{ room_checks : "room_id"
  housekeeping_tasks ||--o{ room_checks : "task_id"
  rooms ||--o{ room_check_sessions : "room_id"
  room_check_issues ||--o{ room_check_issues : "source_issue_id"
  room_checks ||--o{ room_check_issues : "room_check_id"
  rooms ||--o{ housekeeping_tasks : "room_id"
  room_checks ||--o{ housekeeping_tasks : "room_check_id"
  rooms ||--o{ lost_found_items : "room_id"
```

## Inventory

```mermaid
erDiagram
  items {
    uuid id PK
  }
  item_categories {
    uuid id PK
  }
  item_units {
    uuid id PK
  }
  item_images {
    uuid id PK
  }
  warehouses {
    uuid id PK
  }
  warehouse_stock {
    uuid id PK
  }
  inventory_transactions {
    uuid id PK
  }
  distribution_orders {
    uuid id PK
  }
  distribution_order_items {
    uuid id PK
  }
  distribution_order_rooms {
    uuid id PK
  }
  distribution_order_batches {
    uuid id PK
  }
  stock_adjustments {
    uuid id PK
  }
  stock_adjustment_items {
    uuid id PK
  }
  reorder_suggestions {
    uuid id PK
  }
  consumption_snapshots {
    uuid id PK
  }
  chargeable_consumptions {
    uuid id PK
  }
  investigation_logs {
    uuid id PK
  }
  item_categories ||--o{ items : "category_id"
  item_categories ||--o{ item_categories : "parent_id"
  item_units ||--o{ item_units : "base_unit_id"
  items ||--o{ item_images : "item_id"
  items ||--o{ warehouse_stock : "item_id"
  warehouses ||--o{ warehouse_stock : "warehouse_id"
  items ||--o{ inventory_transactions : "item_id"
  warehouses ||--o{ inventory_transactions : "to_warehouse_id"
  warehouses ||--o{ inventory_transactions : "from_warehouse_id"
  inventory_transactions ||--o{ distribution_orders : "transaction_id"
  items ||--o{ distribution_order_items : "item_id"
  distribution_order_rooms ||--o{ distribution_order_items : "distribution_order_room_id"
  distribution_orders ||--o{ distribution_order_rooms : "distribution_order_id"
  distribution_orders ||--o{ distribution_order_rooms : "handover_to_order_id"
  distribution_orders ||--o{ distribution_order_batches : "distribution_order_id"
  stock_adjustments ||--o{ stock_adjustment_items : "adjustment_id"
  items ||--o{ stock_adjustment_items : "item_id"
  items ||--o{ reorder_suggestions : "item_id"
  items ||--o{ consumption_snapshots : "item_id"
  items ||--o{ chargeable_consumptions : "item_id"
  stock_adjustments ||--o{ investigation_logs : "adjustment_id"
```

## Laundry

```mermaid
erDiagram
  laundry_batches {
    uuid id PK
  }
  laundry_batch_items {
    uuid id PK
  }
  laundry_categories {
    uuid id PK
  }
  laundry_requests {
    uuid id PK
  }
  laundry_vendors {
    uuid id PK
  }
  compensation_requests {
    uuid id PK
  }
  batch_inventory {
    uuid id PK
  }
  laundry_vendors ||--o{ laundry_batches : "vendor_id"
  laundry_batches ||--o{ laundry_batch_items : "batch_id"
  laundry_batches ||--o{ laundry_requests : "laundry_batch_id"
```

## Vendors & PO

```mermaid
erDiagram
  vendors {
    uuid id PK
  }
  purchase_orders {
    uuid id PK
  }
  purchase_order_items {
    uuid id PK
  }
  supplement_requests {
    uuid id PK
  }
  vendors ||--o{ purchase_orders : "vendor_id"
  purchase_orders ||--o{ purchase_order_items : "po_id"
```

## Maintenance

```mermaid
erDiagram
  maintenance_requests {
    uuid id PK
  }
  maintenance_categories {
    uuid id PK
  }
```

## Payment & Subscription

```mermaid
erDiagram
  payment_transactions {
    uuid id PK
  }
  bank_payment_settings {
    uuid id PK
  }
  subscription_plans {
    uuid id PK
  }
  plan_price_history {
    uuid id PK
  }
  tenant_usage {
    uuid id PK
  }
  renewal_reminders {
    uuid id PK
  }
  reminder_automation_rules {
    uuid id PK
  }
  reminder_email_templates {
    uuid id PK
  }
  promotional_codes {
    uuid id PK
  }
  promo_code_usage {
    uuid id PK
  }
  subscription_plans ||--o{ payment_transactions : "plan_id"
  subscription_plans ||--o{ plan_price_history : "plan_id"
  promotional_codes ||--o{ promo_code_usage : "promo_code_id"
  payment_transactions ||--o{ promo_code_usage : "payment_transaction_id"
```

## Notifications & Workflows

```mermaid
erDiagram
  notifications {
    uuid id PK
  }
  in_app_notifications {
    uuid id PK
  }
  email_notifications {
    uuid id PK
  }
  push_subscriptions {
    uuid id PK
  }
  notification_preferences {
    uuid id PK
  }
  telegram_connections {
    uuid id PK
  }
  telegram_groups {
    uuid id PK
  }
  workflows {
    uuid id PK
  }
  workflow_actions {
    uuid id PK
  }
  workflow_executions {
    uuid id PK
  }
  workflows ||--o{ workflow_actions : "workflow_id"
  workflows ||--o{ workflow_executions : "workflow_id"
```

## Operations

```mermaid
erDiagram
  shift_history {
    uuid id PK
  }
  staff_status {
    uuid id PK
  }
  staff_statistics {
    uuid id PK
  }
  activity_logs {
    uuid id PK
  }
  backup_logs {
    uuid id PK
  }
  super_admin_activity_log {
    uuid id PK
  }
  platform_settings {
    uuid id PK
  }
  marketing_campaigns {
    uuid id PK
  }
  campaign_engagement {
    uuid id PK
  }
  document_scan_sessions {
    uuid id PK
  }
  checkout_inspection_requests {
    uuid id PK
  }
  hotel_services {
    uuid id PK
  }
  ai_settings {
    uuid id PK
  }
  marketing_campaigns ||--o{ campaign_engagement : "campaign_id"
```

## Bảng chưa phân nhóm (47)

- `ab_tests`
- `announcement_dismissals`
- `announcements`
- `audit_log`
- `conversation_members`
- `conversations`
- `custom_field_values`
- `custom_fields`
- `email_logs`
- `email_send_log`
- `email_send_state`
- `email_templates`
- `email_unsubscribe_tokens`
- `financial_targets`
- `guest_stay_registrations`
- `hotel_fixed_expenses`
- `hotel_policy`
- `hotel_policy_history`
- `hotel_settings`
- `import_export_history`
- `invoice_vat_claims`
- `laundry_batch_audit`
- `message_attachments`
- `message_reactions`
- `message_reads`
- `messages`
- `monthly_targets`
- `password_reset_otps`
- `payment_anomalies`
- `payment_methods`
- `payment_webhook_logs`
- `qc_reviews`
- `qc_sla_settings`
- `rate_limit_hits`
- `rate_plan_daily_prices`
- `rate_plans`
- `room_blocks`
- `room_check_issue_outbox`
- `room_check_issue_reviews`
- `room_type_availability`
- `room_type_rates`
- `seasonal_rate_overrides`
- `shift_notes`
- `shift_reminders`
- `suppressed_emails`
- `user_levels`
- `user_permissions`
