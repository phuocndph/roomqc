# RLS Policies

343 policies trên 138 tables.

## Tables KHÔNG bật RLS (0)


## Bảng × Policy

### `ab_tests` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Super admins manage ab_tests | ALL | {public} | `(EXISTS ( SELECT 1    FROM users   WHERE ((users.id = ( SELECT auth.uid() AS uid` | `` |

### `activity_logs` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can view activity logs from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `ai_settings` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Only owners can delete AI settings | DELETE | {authenticated} | `(EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = ( SELECT auth.uid() AS uid))` | `` |
| Only owners can insert AI settings | INSERT | {authenticated} | `` | `(EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = ( SELECT auth.uid() AS uid))` |
| Only owners can update AI settings | UPDATE | {authenticated} | `(EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = ( SELECT auth.uid() AS uid))` | `` |
| Users can read AI settings of their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `announcement_dismissals` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users delete own dismissals | DELETE | {authenticated} | `(( SELECT auth.uid() AS uid) = user_id)` | `` |
| Users insert own dismissals | INSERT | {authenticated} | `` | `(( SELECT auth.uid() AS uid) = user_id)` |
| Users read own dismissals | SELECT | {authenticated} | `(( SELECT auth.uid() AS uid) = user_id)` | `` |

### `announcements` (5 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Anyone authenticated can read active announcements | SELECT | {authenticated} | `((is_active = true) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends` | `` |
| Super admin manage announcements (delete) | DELETE | {authenticated} | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` | `` |
| Super admin manage announcements (insert) | INSERT | {authenticated} | `` | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` |
| Super admin manage announcements (select) | SELECT | {authenticated} | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` | `` |
| Super admin manage announcements (update) | UPDATE | {authenticated} | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` |

### `audit_log` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Owner views all tenant audit | SELECT | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |

### `backup_logs` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can insert backup logs | INSERT | {authenticated} | `` | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` |
| Users can view backup logs from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `bank_payment_settings` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| bank_payment_settings_tenant_delete | DELETE | {authenticated} | `(is_super_admin(( SELECT auth.uid() AS uid)) OR ((tenant_id = get_current_user_t` | `` |
| bank_payment_settings_tenant_insert | INSERT | {authenticated} | `` | `(is_super_admin(( SELECT auth.uid() AS uid)) OR ((tenant_id = get_current_user_t` |
| bank_payment_settings_tenant_select | SELECT | {authenticated} | `((tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT aut` | `` |
| bank_payment_settings_tenant_update | UPDATE | {authenticated} | `(is_super_admin(( SELECT auth.uid() AS uid)) OR ((tenant_id = get_current_user_t` | `(is_super_admin(( SELECT auth.uid() AS uid)) OR ((tenant_id = get_current_user_t` |

### `batch_inventory` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| bi_modify_owner_manager | ALL | {authenticated} | `((tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT aut` | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` |
| bi_select | SELECT | {authenticated} | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` | `` |

### `booking_consumables` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can delete booking consumables in their tenant | DELETE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can insert booking consumables in their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can update booking consumables in their tenant | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view booking consumables from their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `booking_payments` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| booking_payments_insert | INSERT | {authenticated} | `` | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` |
| booking_payments_select | SELECT | {authenticated} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |
| booking_payments_update | UPDATE | {authenticated} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |

### `booking_service_charges` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| booking_service_charges_delete | DELETE | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| booking_service_charges_insert | INSERT | {authenticated} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| booking_service_charges_select | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| booking_service_charges_update | UPDATE | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `campaign_engagement` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenants can view their own engagement | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `chargeable_consumptions` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant users can delete their own consumptions | DELETE | {authenticated} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |
| Tenant users can insert consumptions | INSERT | {authenticated} | `` | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` |
| Tenant users can update their own consumptions | UPDATE | {authenticated} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |
| Tenant users can view their own consumptions | SELECT | {authenticated} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |

### `checkout_inspection_requests` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create inspections in their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can delete inspections in their tenant | DELETE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can update inspections in their tenant | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view inspections in their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `compensation_requests` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create compensation requests in their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can update compensation requests in their tenant | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view compensation requests in their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `consumption_snapshots` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| consumption_snapshots_read | SELECT | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (has_role(( SELECT auth.uid() AS` | `` |
| consumption_snapshots_service_update | UPDATE | {service_role} | `true` | `true` |
| consumption_snapshots_service_write | INSERT | {service_role} | `` | `true` |

### `conversation_members` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| convm_admin_delete | DELETE | {authenticated} | `((user_id = ( SELECT auth.uid() AS uid)) OR is_conversation_admin(conversation_i` | `` |
| convm_select | SELECT | {authenticated} | `is_conversation_member(conversation_id, ( SELECT auth.uid() AS uid))` | `` |
| convm_self_insert | INSERT | {authenticated} | `` | `((user_id = ( SELECT auth.uid() AS uid)) OR is_conversation_admin(conversation_i` |
| convm_self_update | UPDATE | {authenticated} | `((user_id = ( SELECT auth.uid() AS uid)) OR is_conversation_admin(conversation_i` | `` |

### `conversations` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| conv_insert_self | INSERT | {authenticated} | `` | `(created_by = ( SELECT auth.uid() AS uid))` |
| conv_select_member | SELECT | {authenticated} | `is_conversation_member(id, ( SELECT auth.uid() AS uid))` | `` |
| conv_update_admin | UPDATE | {authenticated} | `is_conversation_admin(id, ( SELECT auth.uid() AS uid))` | `` |

### `custom_field_values` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users manage custom field values in their tenant | ALL | {public} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |

### `custom_fields` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins manage custom fields | ALL | {public} | `((tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users view custom fields in their tenant | SELECT | {public} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |

### `distribution_order_batches` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| distribution_batches_delete_policy | DELETE | {public} | `((distribution_order_id IN ( SELECT distribution_orders.id    FROM distribution_` | `` |
| distribution_batches_insert_policy | INSERT | {public} | `` | `((distribution_order_id IN ( SELECT distribution_orders.id    FROM distribution_` |
| distribution_batches_select_policy | SELECT | {public} | `(distribution_order_id IN ( SELECT dist_ord.id    FROM distribution_orders dist_` | `` |
| distribution_batches_update_policy | UPDATE | {public} | `(distribution_order_id IN ( SELECT dist_ord.id    FROM distribution_orders dist_` | `` |

### `distribution_order_items` (5 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can manage distribution order items | ALL | {public} | `(distribution_order_room_id IN ( SELECT dor.id    FROM (distribution_order_rooms` | `` |
| distribution_items_delete_policy | DELETE | {public} | `((distribution_order_room_id IN ( SELECT dor.id    FROM (distribution_order_room` | `` |
| distribution_items_insert_policy | INSERT | {public} | `` | `((distribution_order_room_id IN ( SELECT dor.id    FROM (distribution_order_room` |
| distribution_items_select_policy | SELECT | {public} | `(distribution_order_room_id IN ( SELECT dor.id    FROM (distribution_order_rooms` | `` |
| distribution_items_update_policy | UPDATE | {public} | `(distribution_order_room_id IN ( SELECT dor.id    FROM (distribution_order_rooms` | `` |

### `distribution_order_rooms` (5 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can manage distribution order rooms | ALL | {public} | `(distribution_order_id IN ( SELECT distribution_orders.id    FROM distribution_o` | `` |
| distribution_rooms_delete_policy | DELETE | {public} | `((distribution_order_id IN ( SELECT distribution_orders.id    FROM distribution_` | `` |
| distribution_rooms_insert_policy | INSERT | {public} | `` | `((distribution_order_id IN ( SELECT distribution_orders.id    FROM distribution_` |
| distribution_rooms_select_policy | SELECT | {public} | `(distribution_order_id IN ( SELECT dist_ord.id    FROM distribution_orders dist_` | `` |
| distribution_rooms_update_policy | UPDATE | {public} | `(distribution_order_id IN ( SELECT dist_ord.id    FROM distribution_orders dist_` | `` |

### `distribution_orders` (7 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create distribution orders in their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can delete distribution orders in their tenant | DELETE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can update distribution orders in their tenant | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| distribution_orders_delete_policy | DELETE | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| distribution_orders_insert_policy | INSERT | {public} | `` | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` |
| distribution_orders_select_policy | SELECT | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| distribution_orders_update_policy | UPDATE | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |

### `document_scan_sessions` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant users can update scan sessions | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Tenant users can view scan sessions | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can create scan sessions | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |

### `email_logs` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users view email logs in their tenant | SELECT | {public} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |

### `email_notifications` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can view their email notifications | SELECT | {authenticated} | `((user_id = ( SELECT auth.uid() AS uid)) OR is_super_admin(( SELECT auth.uid() A` | `` |

### `email_send_log` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Service role can insert send log | INSERT | {public} | `` | `(( SELECT auth.role() AS role) = 'service_role'::text)` |
| Service role can read send log | SELECT | {public} | `(( SELECT auth.role() AS role) = 'service_role'::text)` | `` |
| Service role can update send log | UPDATE | {public} | `(( SELECT auth.role() AS role) = 'service_role'::text)` | `(( SELECT auth.role() AS role) = 'service_role'::text)` |

### `email_send_state` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Service role can manage send state | ALL | {public} | `(( SELECT auth.role() AS role) = 'service_role'::text)` | `(( SELECT auth.role() AS role) = 'service_role'::text)` |

### `email_templates` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins manage email templates | ALL | {public} | `((tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users view own tenant templates | SELECT | {public} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |

### `email_unsubscribe_tokens` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Service role can insert tokens | INSERT | {public} | `` | `(( SELECT auth.role() AS role) = 'service_role'::text)` |
| Service role can mark tokens as used | UPDATE | {public} | `(( SELECT auth.role() AS role) = 'service_role'::text)` | `(( SELECT auth.role() AS role) = 'service_role'::text)` |
| Service role can read tokens | SELECT | {public} | `(( SELECT auth.role() AS role) = 'service_role'::text)` | `` |

### `financial_targets` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Owners and managers can manage targets | ALL | {authenticated} | `(EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = ( SELECT auth.uid() AS uid))` | `(EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = ( SELECT auth.uid() AS uid))` |
| Tenant members can view targets | SELECT | {authenticated} | `(EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = ( SELECT auth.uid() AS uid))` | `` |

### `guest_invoices` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant isolation for guest_invoices | ALL | {authenticated} | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` |

### `guest_stay_registrations` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| stay_reg_tenant_insert | INSERT | {authenticated} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| stay_reg_tenant_select | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| stay_reg_tenant_update | UPDATE | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `guests` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant isolation for guests | ALL | {authenticated} | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` |

### `hotel_fixed_expenses` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant members can view fixed expenses | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| hotel_fixed_expenses_delete_owner_mgr | DELETE | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` | `` |
| hotel_fixed_expenses_insert_owner_mgr | INSERT | {authenticated} | `` | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` |
| hotel_fixed_expenses_update_owner_mgr | UPDATE | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` |

### `hotel_policy` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| hp_delete | DELETE | {authenticated} | `((tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT aut` | `` |
| hp_insert | INSERT | {authenticated} | `` | `((tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT aut` |
| hp_select | SELECT | {authenticated} | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` | `` |
| hp_update | UPDATE | {authenticated} | `((tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT aut` | `` |

### `hotel_policy_history` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| hph_select | SELECT | {authenticated} | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` | `` |

### `hotel_services` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| hotel_services_delete_owner_mgr | DELETE | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| hotel_services_insert_owner_mgr | INSERT | {authenticated} | `` | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` |
| hotel_services_select | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| hotel_services_update_owner_mgr | UPDATE | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` |

### `hotel_settings` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| hotel_settings_tenant_read | SELECT | {authenticated} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |
| hotel_settings_tenant_write_owner_mgr | ALL | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` |

### `hotels` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Owners can manage hotels | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view hotels from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `housekeeping_tasks` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create tasks in their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can delete tasks in their tenant | DELETE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can update tasks in their tenant | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view tasks in their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `import_export_history` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users create import/export records | INSERT | {public} | `` | `((tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users view import/export history in their tenant | SELECT | {public} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |

### `in_app_notifications` (6 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Authenticated users can receive notifications | INSERT | {authenticated} | `` | `((user_id = ( SELECT auth.uid() AS uid)) OR (tenant_id = ( SELECT users.tenant_i` |
| Service role can insert notifications | INSERT | {service_role} | `` | `true` |
| Users can insert notifications | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can insert notifications for their tenant | INSERT | {public} | `` | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` |
| Users can update own notifications | UPDATE | {public} | `(( SELECT auth.uid() AS uid) = user_id)` | `` |
| Users can view own notifications | SELECT | {public} | `(( SELECT auth.uid() AS uid) = user_id)` | `` |

### `inventory_transactions` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can update transactions | UPDATE | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Staff can create transactions | INSERT | {authenticated} | `` | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` |
| Users can view inventory transactions with hotel access | SELECT | {authenticated} | `(EXISTS ( SELECT 1    FROM (user_roles ur      JOIN users u ON ((u.id = ur.user_` | `` |
| Users can view transactions from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `investigation_logs` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create investigation logs in their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can view investigation logs in their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `invoice_vat_claims` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| tenant members can manage claims | ALL | {authenticated} | `(tenant_id = get_current_user_tenant_id())` | `(tenant_id = get_current_user_tenant_id())` |
| tenant members can read claims | SELECT | {authenticated} | `(tenant_id = get_current_user_tenant_id())` | `` |

### `invoices` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant members can view their invoices | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Tenant owners can manage invoices | ALL | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |

### `item_categories` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage categories | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view categories from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `item_images` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can delete item images in their tenant | DELETE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can insert item images in their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can update item images in their tenant | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view item images in their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `item_units` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage units | ALL | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view units from their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `items` (5 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can create items | INSERT | {authenticated} | `` | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` |
| Managers can update items | UPDATE | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Owners can delete items | DELETE | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view items from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view items with hotel access | SELECT | {authenticated} | `((EXISTS ( SELECT 1    FROM user_roles   WHERE ((user_roles.user_id = ( SELECT a` | `` |

### `laundry_batch_audit` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| lba_tenant_select | SELECT | {public} | `(tenant_id = get_current_user_tenant_id())` | `` |

### `laundry_batch_items` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Staff can manage laundry batch items | ALL | {authenticated} | `(batch_id IN ( SELECT laundry_batches.id    FROM laundry_batches   WHERE (laundr` | `` |
| Users can view laundry batch items | SELECT | {authenticated} | `(batch_id IN ( SELECT laundry_batches.id    FROM laundry_batches   WHERE (laundr` | `` |

### `laundry_batches` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Staff can manage laundry batches | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view laundry batches from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view laundry batches with hotel access | SELECT | {authenticated} | `(EXISTS ( SELECT 1    FROM (user_roles ur      JOIN users u ON ((u.id = ur.user_` | `` |

### `laundry_categories` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage laundry categories | ALL | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view laundry categories from their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `laundry_requests` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create laundry requests in their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can update laundry requests in their tenant | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view laundry requests in their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `laundry_vendors` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage vendors | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view vendors from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `lost_found_items` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant isolation for lost_found_items | ALL | {authenticated} | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` |

### `maintenance_categories` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage categories | ALL | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view categories from their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `maintenance_requests` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Staff can create maintenance requests | INSERT | {authenticated} | `` | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` |
| Users can view maintenance requests from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view maintenance requests with hotel access | SELECT | {authenticated} | `(EXISTS ( SELECT 1    FROM (user_roles ur      JOIN users u ON ((u.id = ur.user_` | `` |

### `marketing_campaigns` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Super admins manage marketing campaigns | ALL | {authenticated} | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` |

### `message_attachments` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| att_insert | INSERT | {authenticated} | `` | `is_conversation_member(conversation_id, ( SELECT auth.uid() AS uid))` |
| att_select | SELECT | {authenticated} | `is_conversation_member(conversation_id, ( SELECT auth.uid() AS uid))` | `` |

### `message_reactions` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| react_delete | DELETE | {authenticated} | `(user_id = ( SELECT auth.uid() AS uid))` | `` |
| react_insert | INSERT | {authenticated} | `` | `((user_id = ( SELECT auth.uid() AS uid)) AND is_conversation_member(conversation` |
| react_select | SELECT | {authenticated} | `is_conversation_member(conversation_id, ( SELECT auth.uid() AS uid))` | `` |

### `message_reads` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| reads_insert | INSERT | {authenticated} | `` | `((user_id = ( SELECT auth.uid() AS uid)) AND is_conversation_member(conversation` |
| reads_select | SELECT | {authenticated} | `is_conversation_member(conversation_id, ( SELECT auth.uid() AS uid))` | `` |

### `messages` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| msg_insert | INSERT | {authenticated} | `` | `((sender_id = ( SELECT auth.uid() AS uid)) AND is_conversation_member(conversati` |
| msg_select | SELECT | {authenticated} | `is_conversation_member(conversation_id, ( SELECT auth.uid() AS uid))` | `` |
| msg_update_sender | UPDATE | {authenticated} | `(sender_id = ( SELECT auth.uid() AS uid))` | `` |

### `monthly_targets` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant members can view monthly targets | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| monthly_targets_delete_owner_mgr | DELETE | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` | `` |
| monthly_targets_insert_owner_mgr | INSERT | {authenticated} | `` | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` |
| monthly_targets_update_owner_mgr | UPDATE | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` |

### `notification_preferences` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create their own notification preferences | INSERT | {public} | `` | `(user_id = ( SELECT auth.uid() AS uid))` |
| Users can delete their own notification preferences | DELETE | {public} | `(user_id = ( SELECT auth.uid() AS uid))` | `` |
| Users can update their own notification preferences | UPDATE | {public} | `(user_id = ( SELECT auth.uid() AS uid))` | `` |
| Users can view their own notification preferences | SELECT | {public} | `(user_id = ( SELECT auth.uid() AS uid))` | `` |

### `notifications` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| System can create notifications | INSERT | {authenticated} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can update their notifications | UPDATE | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view their notifications | SELECT | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |

### `password_reset_otps` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create OTPs for their email | INSERT | {authenticated} | `` | `(email = ( SELECT users.email    FROM users   WHERE (users.id = ( SELECT auth.ui` |
| password_reset_otps_deny_select | SELECT | {public} | `false` | `` |

### `payment_anomalies` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| anomalies_select_owner | SELECT | {authenticated} | `(EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = ( SELECT auth.uid() AS uid))` | `` |
| anomalies_update_owner | UPDATE | {authenticated} | `(EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = ( SELECT auth.uid() AS uid))` | `` |

### `payment_methods` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant owners can manage payment methods | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Tenant owners can view payment methods | SELECT | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |

### `payment_transactions` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant owners can insert payment transactions | INSERT | {public} | `` | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` |
| Tenant owners can update their payment transactions | UPDATE | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Tenant owners can view their payment transactions | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `payment_webhook_logs` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Service role can insert webhook logs | INSERT | {service_role} | `` | `true` |
| Super admins read webhook logs | SELECT | {authenticated} | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` | `` |

### `pending_group_links` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create pending links for their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can update their tenant's pending links | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view their tenant's pending links | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `permissions` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can view all permissions | SELECT | {authenticated} | `true` | `` |

### `plan_price_history` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Super admins can view price history | SELECT | {authenticated} | `is_super_admin(( SELECT auth.uid() AS uid))` | `` |

### `platform_settings` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Super admins manage platform settings | ALL | {authenticated} | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` |
| platform_settings_deny_non_superadmin_select | SELECT | {public} | `is_super_admin(( SELECT auth.uid() AS uid))` | `` |

### `positions` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Owners and managers can manage positions | ALL | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE ((users.id = ( SELE` | `` |
| Users can view positions in their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `promo_code_usage` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenants can view their own promo usage | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can insert promo usage for their tenant | INSERT | {authenticated} | `` | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` |

### `promotional_codes` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Authenticated users can view active promo codes | SELECT | {authenticated} | `((is_active = true) AND ((valid_until IS NULL) OR (valid_until > now())))` | `` |

### `purchase_order_items` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage PO items | ALL | {authenticated} | `((po_id IN ( SELECT purchase_orders.id    FROM purchase_orders   WHERE (purchase` | `` |
| Users can view PO items | SELECT | {authenticated} | `(po_id IN ( SELECT purchase_orders.id    FROM purchase_orders   WHERE (purchase_` | `` |

### `purchase_orders` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage purchase orders | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view purchase orders from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `push_subscriptions` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can delete own push subscriptions | DELETE | {public} | `(( SELECT auth.uid() AS uid) = user_id)` | `` |
| Users can insert own push subscriptions | INSERT | {public} | `` | `(( SELECT auth.uid() AS uid) = user_id)` |
| Users can update own push subscriptions | UPDATE | {public} | `(( SELECT auth.uid() AS uid) = user_id)` | `` |
| Users can view own push subscriptions | SELECT | {public} | `(( SELECT auth.uid() AS uid) = user_id)` | `` |

### `qc_reviews` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant members read qc_reviews | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `qc_sla_settings` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Owner/Manager manage SLA | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Tenant members read SLA | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `rate_limit_hits` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| service role manages rate limit hits | ALL | {service_role} | `true` | `true` |

### `rate_plan_daily_prices` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| rpdp_tenant_modify | ALL | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` |
| rpdp_tenant_select | SELECT | {authenticated} | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` | `` |

### `rate_plans` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| rp_tenant_modify | ALL | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` |
| rp_tenant_select | SELECT | {authenticated} | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` | `` |

### `reminder_automation_rules` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Super admins manage reminder rules | ALL | {authenticated} | `is_super_admin(( SELECT auth.uid() AS uid))` | `is_super_admin(( SELECT auth.uid() AS uid))` |

### `reminder_email_templates` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Super admins manage reminder templates | ALL | {authenticated} | `is_super_admin(( SELECT auth.uid() AS uid))` | `is_super_admin(( SELECT auth.uid() AS uid))` |

### `renewal_reminders` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant owners can view their reminders | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `reorder_suggestions` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| reorder_insert_system | INSERT | {authenticated} | `` | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` |
| reorder_select_tenant | SELECT | {authenticated} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |
| reorder_update_manager | UPDATE | {authenticated} | `((tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `role_permissions` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can manage role permissions in their tenant | ALL | {authenticated} | `((role_id IN ( SELECT roles.id    FROM roles   WHERE ((roles.tenant_id IN ( SELE` | `` |
| Users can view role permissions from their tenant | SELECT | {authenticated} | `(role_id IN ( SELECT roles.id    FROM roles   WHERE (roles.tenant_id IN ( SELECT` | `` |

### `roles` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can manage roles in their tenant | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view roles from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `room_blocks` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| room_blocks_delete_manager | DELETE | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (has_role(( SELECT auth.uid() AS` | `` |
| room_blocks_insert_manager | INSERT | {authenticated} | `` | `((tenant_id = get_current_user_tenant_id()) AND (has_role(( SELECT auth.uid() AS` |
| room_blocks_select_same_tenant | SELECT | {authenticated} | `(tenant_id = get_current_user_tenant_id())` | `` |
| room_blocks_update_manager | UPDATE | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (has_role(( SELECT auth.uid() AS` | `` |

### `room_bookings` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can delete room bookings | DELETE | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Staff and managers can insert room bookings | INSERT | {public} | `` | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` |
| Staff and managers can update room bookings | UPDATE | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view room bookings from their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `room_check_issue_outbox` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| rcio_tenant_select | SELECT | {public} | `(tenant_id = get_current_user_tenant_id())` | `` |

### `room_check_issue_reviews` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| rcir_tenant_select | SELECT | {public} | `(tenant_id = get_current_user_tenant_id())` | `` |

### `room_check_issues` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| rci_tenant_select | SELECT | {public} | `(tenant_id = get_current_user_tenant_id())` | `` |

### `room_check_sessions` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create their own check sessions | INSERT | {public} | `` | `((user_id = ( SELECT auth.uid() AS uid)) AND (tenant_id IN ( SELECT users.tenant` |
| Users can delete their own check sessions | DELETE | {public} | `((user_id = ( SELECT auth.uid() AS uid)) AND (tenant_id IN ( SELECT users.tenant` | `` |
| Users can view check sessions in their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `room_checks` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Staff can create room checks | INSERT | {authenticated} | `` | `((room_id IN ( SELECT rooms.id    FROM rooms   WHERE (rooms.tenant_id IN ( SELEC` |
| Users can view room checks | SELECT | {authenticated} | `(room_id IN ( SELECT rooms.id    FROM rooms   WHERE (rooms.tenant_id IN ( SELECT` | `` |

### `room_items` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Staff can manage room items | ALL | {authenticated} | `(room_id IN ( SELECT rooms.id    FROM rooms   WHERE (rooms.tenant_id IN ( SELECT` | `` |
| Users can view room items | SELECT | {authenticated} | `(room_id IN ( SELECT rooms.id    FROM rooms   WHERE (rooms.tenant_id IN ( SELECT` | `` |

### `room_pricing_rules` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can view pricing rules for their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| room_pricing_rules_owner_mgr_write | ALL | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` |

### `room_type_availability` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| rta_tenant_modify | ALL | {authenticated} | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` |
| rta_tenant_select | SELECT | {authenticated} | `(tenant_id IN ( SELECT u.tenant_id    FROM users u   WHERE (u.id = ( SELECT auth` | `` |

### `room_type_rates` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| rtr_tenant_modify | ALL | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` |
| rtr_tenant_select | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `room_type_standards` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage room standards | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view room standards from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `room_types` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage room types | ALL | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view room types from their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `rooms` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage rooms | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view rooms from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view rooms with hotel access | SELECT | {authenticated} | `(EXISTS ( SELECT 1    FROM ((user_roles ur      JOIN users u ON ((u.id = ur.user` | `` |

### `seasonal_rate_overrides` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| sro_tenant_modify | ALL | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` |
| sro_tenant_select | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `shift_history` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can view all shift history in tenant | SELECT | {public} | `(EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = ( SELECT auth.uid() AS uid))` | `` |
| Users can view own shift history | SELECT | {public} | `(( SELECT auth.uid() AS uid) = user_id)` | `` |

### `shift_notes` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant members can delete shift notes | DELETE | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Tenant members can insert shift notes | INSERT | {authenticated} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Tenant members can update shift notes | UPDATE | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Tenant members can view shift notes | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `shift_reminders` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can view all reminders in tenant | SELECT | {public} | `(EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = ( SELECT auth.uid() AS uid))` | `` |
| Service can insert reminders | INSERT | {service_role} | `` | `true` |
| Users can view their own reminders | SELECT | {public} | `(( SELECT auth.uid() AS uid) = user_id)` | `` |

### `staff_statistics` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can view staff statistics from their tenant | SELECT | {public} | `(hotel_id IN ( SELECT h.id    FROM (hotels h      JOIN users u ON ((u.tenant_id ` | `` |

### `staff_status` (5 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can update any staff status in tenant | UPDATE | {authenticated} | `((tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| System can insert status for any user in tenant | INSERT | {authenticated} | `` | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` |
| Users can insert their own status | INSERT | {authenticated} | `` | `((user_id = ( SELECT auth.uid() AS uid)) AND (tenant_id = ( SELECT users.tenant_` |
| Users can update their own status | UPDATE | {authenticated} | `(user_id = ( SELECT auth.uid() AS uid))` | `` |
| Users can view staff status in their tenant | SELECT | {authenticated} | `(tenant_id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT` | `` |

### `stock_adjustment_items` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage adjustment items | ALL | {authenticated} | `((adjustment_id IN ( SELECT stock_adjustments.id    FROM stock_adjustments   WHE` | `` |
| Users can view adjustment items | SELECT | {authenticated} | `(adjustment_id IN ( SELECT stock_adjustments.id    FROM stock_adjustments   WHER` | `` |

### `stock_adjustments` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage stock adjustments | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view stock adjustments from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `subscription_plans` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Anyone can view active subscription plans | SELECT | {public} | `(is_active = true)` | `` |
| Anyone can view subscription plans | SELECT | {authenticated} | `true` | `` |

### `super_admin_activity_log` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Super admins read activity log | SELECT | {authenticated} | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` | `` |

### `supplement_requests` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create supplement requests in their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can update supplement requests in their tenant | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view supplement requests in their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| supplement_requests_delete_owner_mgr | DELETE | {authenticated} | `((tenant_id = get_current_user_tenant_id()) AND (is_super_admin(( SELECT auth.ui` | `` |

### `suppressed_emails` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Service role can insert suppressed emails | INSERT | {public} | `` | `(( SELECT auth.role() AS role) = 'service_role'::text)` |
| Service role can read suppressed emails | SELECT | {public} | `(( SELECT auth.role() AS role) = 'service_role'::text)` | `` |

### `telegram_connections` (3 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can manage own telegram connections | ALL | {public} | `(( SELECT auth.uid() AS uid) = user_id)` | `` |
| Users can view own telegram connections | SELECT | {public} | `(( SELECT auth.uid() AS uid) = user_id)` | `` |
| View telegram connections policy | SELECT | {public} | `((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1    FROM users u  ` | `` |

### `telegram_groups` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Owners and managers can manage telegram groups | ALL | {public} | `(EXISTS ( SELECT 1    FROM (user_roles ur      JOIN users u ON ((u.id = ur.user_` | `` |
| Users can view tenant telegram groups | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `tenant_usage` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Tenant owners can view their usage | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `tenants` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| tenants_select_own | SELECT | {authenticated} | `(id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT auth.u` | `` |
| tenants_select_super_admin | SELECT | {authenticated} | `is_super_admin(( SELECT auth.uid() AS uid))` | `` |
| tenants_update_owner | UPDATE | {authenticated} | `((id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT auth.` | `((id = ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELECT auth.` |
| tenants_update_super_admin | UPDATE | {authenticated} | `is_super_admin(( SELECT auth.uid() AS uid))` | `is_super_admin(( SELECT auth.uid() AS uid))` |

### `user_hotels` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins manage hotel assignments | ALL | {public} | `((hotel_id IN ( SELECT h.id    FROM hotels h   WHERE (h.tenant_id = ( SELECT use` | `` |
| Users view their hotel assignments | SELECT | {public} | `((user_id = ( SELECT auth.uid() AS uid)) OR (hotel_id IN ( SELECT h.id    FROM h` | `` |

### `user_levels` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Authenticated users can view user levels | SELECT | {authenticated} | `true` | `` |

### `user_permissions` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Owners and managers can manage user permissions | ALL | {public} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` |
| Users can view permissions scoped by role | SELECT | {public} | `((user_id = ( SELECT auth.uid() AS uid)) OR is_super_admin(( SELECT auth.uid() A` | `` |

### `user_preferences` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can manage their own preferences | ALL | {authenticated} | `(user_id = ( SELECT auth.uid() AS uid))` | `(user_id = ( SELECT auth.uid() AS uid))` |

### `user_roles` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Owners manage non-super-admin roles in their tenant | ALL | {authenticated} | `(has_role(( SELECT auth.uid() AS uid), 'owner'::app_role) AND (role <> 'super_ad` | `(has_role(( SELECT auth.uid() AS uid), 'owner'::app_role) AND (role <> 'super_ad` |
| Super admins can view all roles | SELECT | {public} | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` | `` |
| Super admins manage all roles | ALL | {authenticated} | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` | `has_role(( SELECT auth.uid() AS uid), 'super_admin'::app_role)` |
| Users can view their own roles | SELECT | {public} | `(user_id = ( SELECT auth.uid() AS uid))` | `` |

### `users` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| users_delete_subordinates | DELETE | {authenticated} | `(is_super_admin(( SELECT auth.uid() AS uid)) OR ((tenant_id = get_current_user_t` | `` |
| users_insert_in_tenant | INSERT | {authenticated} | `` | `(is_super_admin(( SELECT auth.uid() AS uid)) OR ((tenant_id = get_current_user_t` |
| users_select_self_or_tenant | SELECT | {authenticated} | `(is_super_admin(( SELECT auth.uid() AS uid)) OR (id = ( SELECT auth.uid() AS uid` | `` |
| users_update_self_or_managed | UPDATE | {public} | `(is_super_admin(( SELECT auth.uid() AS uid)) OR (id = ( SELECT auth.uid() AS uid` | `(is_super_admin(( SELECT auth.uid() AS uid)) OR ((id = ( SELECT auth.uid() AS ui` |

### `vendors` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage vendors | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view vendors from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `warehouse_stock` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create warehouse_stock for their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can delete warehouse_stock of their tenant | DELETE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can update warehouse_stock of their tenant | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view warehouse_stock of their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `warehouses` (4 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create warehouses for their tenant | INSERT | {public} | `` | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` |
| Users can delete warehouses of their tenant | DELETE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can update warehouses of their tenant | UPDATE | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |
| Users can view warehouses of their tenant | SELECT | {public} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

### `workflow_actions` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage workflow actions | ALL | {authenticated} | `((workflow_id IN ( SELECT workflows.id    FROM workflows   WHERE (workflows.tena` | `` |
| Users can view workflow actions from their tenant | SELECT | {authenticated} | `(workflow_id IN ( SELECT workflows.id    FROM workflows   WHERE (workflows.tenan` | `` |

### `workflow_executions` (1 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Users can view execution logs from their tenant | SELECT | {authenticated} | `(workflow_id IN ( SELECT workflows.id    FROM workflows   WHERE (workflows.tenan` | `` |

### `workflows` (2 policies)

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Managers can manage workflows | ALL | {authenticated} | `((tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELE` | `` |
| Users can view workflows from their tenant | SELECT | {authenticated} | `(tenant_id IN ( SELECT users.tenant_id    FROM users   WHERE (users.id = ( SELEC` | `` |

