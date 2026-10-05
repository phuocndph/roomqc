# RPC Catalog

**Public function names**: 373. **App-defined RPC**: 369; 315 dùng SECURITY DEFINER; 194 chưa có caller trực tiếp trong frontend (có thể được gọi từ trigger/edge/cron hoặc là dead code).

> Sinh tự động từ `pg_proc` + grep `supabase.rpc()`. Xem nguồn: `_generated/db-functions.tsv`, `_generated/rpc-calls.json`.

## Bảng tra cứu

| RPC | Args | Returns | Lang | SecDef | #Callers FE |
|---|---|---|---|---|---|
| `_enqueue_stay_registration_internal` | p_booking_id uuid | integer | plpgsql | ✓ | 0 |
| `_tc_check_block_conflict` | p_room_id uuid, p_check_in date, p_check_out date, p_exclude_block_id uuid DEFAU | uuid | sql | ✓ | 0 |
| `_tc_check_booking_conflict` | p_room_id uuid, p_check_in date, p_check_out date, p_exclude_booking_id uuid DEF | uuid | sql | ✓ | 0 |
| `add_conversation_members` | _conversation_id uuid, _user_ids uuid[] | void | plpgsql | ✓ | 0 |
| `add_laundry_to_draft_batch` | p_tenant_id uuid, p_hotel_id uuid, p_laundry_request_id uuid | uuid | plpgsql | ✓ | 2 |
| `allocate_linen_fifo` | _item_id uuid, _quantity integer | jsonb | plpgsql | ✓ | 0 |
| `apply_asset_group_mapping` | _tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid, _override_existing boolean D | jsonb | plpgsql | ✓ | 0 |
| `apply_promo_code` | p_tenant_id uuid, p_promo_code text, p_original_amount numeric | jsonb | plpgsql |  | 1 |
| `apply_room_standards` | p_room_id uuid, p_user_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 2 |
| `approve_reorder_suggestions` | _suggestion_ids uuid[] | jsonb | plpgsql | ✓ | 1 |
| `approve_task` | _task_id uuid, _note text DEFAULT NULL::text | housekeeping_tasks | plpgsql | ✓ | 1 |
| `approve_tenant` | p_tenant_id uuid, p_admin_id uuid | jsonb | plpgsql | ✓ | 1 |
| `assert_distribution_actor` | p_room_order_id uuid, p_actor_id uuid, OUT tenant_id uuid, OUT hotel_id uuid | record | plpgsql | ✓ | 0 |
| `assert_rpc_actor` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT NU | uuid | plpgsql | ✓ | 0 |
| `assert_rpc_hotel` | p_tenant_id uuid, p_hotel_id uuid | void | plpgsql | ✓ | 0 |
| `assert_rpc_items` | p_tenant_id uuid, p_hotel_id uuid, p_items jsonb | void | plpgsql | ✓ | 0 |
| `assign_default_permissions_to_role` | p_tenant_id uuid, p_role_code text, p_permission_codes text[] | void | plpgsql | ✓ | 0 |
| `atomic_item_consumed` | p_item_id uuid, p_quantity integer | TABLE(quantity_before integer, quantity_ | plpgsql | ✓ | 1 |
| `atomic_item_lost` | p_item_id uuid, p_quantity integer | TABLE(quantity_before integer, quantity_ | plpgsql | ✓ | 1 |
| `atomic_item_to_laundry` | p_item_id uuid, p_quantity integer | void | plpgsql | ✓ | 1 |
| `auto_apply_read_only_after_grace` | – | integer | plpgsql | ✓ | 0 |
| `auto_assign_batch_number` | – | trigger | plpgsql | ✓ | 0 |
| `auto_classify_item_type` | – | trigger | plpgsql |  | 0 |
| `auto_clear_read_only_after_renewal` | – | integer | plpgsql | ✓ | 0 |
| `auto_close_stale_shifts` | – | jsonb | plpgsql | ✓ | 0 |
| `auto_create_batch_records` | – | trigger | plpgsql | ✓ | 0 |
| `auto_offline_inactive_staff` | – | void | sql | ✓ | 0 |
| `auto_sync_room_type_on_room_change` | – | trigger | plpgsql | ✓ | 0 |
| `auto_update_order_floor` | – | trigger | plpgsql | ✓ | 0 |
| `batch_confirm_room_deliveries` | p_room_order_ids uuid[], p_confirmed_by uuid | jsonb | plpgsql | ✓ | 1 |
| `bulk_delete_items` | p_item_ids uuid[], p_user_id uuid | jsonb | plpgsql | ✓ | 1 |
| `bulk_upsert_daily_prices` | _rate_plan_id uuid, _dates date[], _price numeric DEFAULT NULL::numeric, _sale_p | integer | plpgsql | ✓ | 0 |
| `bulk_upsert_rt_availability` | _room_type_id uuid, _dates date[], _qty integer DEFAULT NULL::integer, _is_close | integer | plpgsql | ✓ | 0 |
| `calculate_booking_price` | p_room_type_id uuid, p_booking_type text, p_from_ts timestamp with time zone, p_ | jsonb | plpgsql | ✓ | 2 |
| `calculate_grace_period_end` | – | trigger | plpgsql | ✓ | 0 |
| `calculate_payment_status` | – | trigger | plpgsql |  | 0 |
| `calculate_staff_statistics` | p_user_id uuid, p_hotel_id uuid, p_period_start date, p_period_end date | void | plpgsql | ✓ | 1 |
| `calculate_tenant_storage` | p_tenant_id uuid | bigint | plpgsql | ✓ | 1 |
| `can_create_user` | p_creator_id uuid, p_new_user_level text, p_tenant_id uuid | boolean | plpgsql | ✓ | 0 |
| `can_manage_user` | p_manager_id uuid, p_target_user_id uuid | boolean | plpgsql | ✓ | 0 |
| `can_perform_quick_check` | _room_id uuid | boolean | plpgsql | ✓ | 0 |
| `cancel_booking` | p_booking_id uuid, p_room_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL | jsonb | plpgsql | ✓ | 1 |
| `cancel_booking_payment` | p_payment_id uuid | jsonb | plpgsql | ✓ | 1 |
| `cancel_distribution_order` | p_order_id uuid, p_cancelled_by uuid | jsonb | plpgsql | ✓ | 1 |
| `cancel_subscription_payment` | p_payment_id uuid | jsonb | plpgsql | ✓ | 2 |
| `chat_after_message_insert` | – | trigger | plpgsql | ✓ | 0 |
| `chat_guard_message_update` | – | trigger | plpgsql |  | 0 |
| `check_and_update_batch_status` | p_batch_id uuid | void | plpgsql | ✓ | 0 |
| `check_and_update_order_status` | p_order_id uuid | void | plpgsql | ✓ | 0 |
| `check_created_by_required` | – | trigger | plpgsql |  | 0 |
| `check_duplicate_room_check` | – | trigger | plpgsql | ✓ | 0 |
| `check_expiring_subscriptions` | – | void | plpgsql | ✓ | 1 |
| `check_rate_limit` | _bucket_key text, _max_hits integer, _window_seconds integer | boolean | plpgsql | ✓ | 0 |
| `check_tenant_can_add` | p_tenant_id uuid, p_resource_type text | boolean | plpgsql | ✓ | 1 |
| `cleanup_expired_otps` | – | void | plpgsql | ✓ | 0 |
| `cleanup_old_check_sessions` | – | void | plpgsql | ✓ | 0 |
| `cleanup_orphaned_auth_users` | – | integer | plpgsql | ✓ | 0 |
| `cleanup_rate_limit_hits` | – | void | sql | ✓ | 0 |
| `cleanup_stale_check_sessions` | – | void | plpgsql | ✓ | 0 |
| `clear_tenant_read_only` | p_tenant_id uuid, p_reason text DEFAULT NULL::text | void | plpgsql | ✓ | 1 |
| `close_route_if_complete` | p_order_id uuid, p_actor_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 1 |
| `complete_registration` | p_user_id uuid, p_full_name text, p_phone text, p_tenant_name text, p_email text | jsonb | plpgsql | ✓ | 2 |
| `complete_registration_impl` | p_user_id uuid, p_full_name text, p_phone text, p_tenant_name text, p_email text | jsonb | plpgsql | ✓ | 0 |
| `complete_task` | _task_id uuid, _note text DEFAULT NULL::text | housekeeping_tasks | plpgsql | ✓ | 2 |
| `compute_auto_reorder_suggestions` | _tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 0 |
| `compute_reorder_suggestions` | _tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid, _item_id uuid DEFAULT NULL:: | jsonb | plpgsql | ✓ | 1 |
| `confirm_booking_payment_manual` | p_payment_id uuid, p_booking_id uuid, p_amount numeric, p_total_amount numeric D | jsonb | plpgsql | ✓ | 3 |
| `confirm_delivery_from_room_check` | p_room_order_id uuid, p_confirmed_by uuid | jsonb | plpgsql | ✓ | 1 |
| `confirm_receive_order` | p_order_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_adjustments jsonb DEFAULT | jsonb | plpgsql | ✓ | 1 |
| `confirm_room_delivery` | p_room_order_id uuid, p_confirmed_by uuid | jsonb | plpgsql | ✓ | 1 |
| `confirm_warehouse_delivery` | p_room_order_id uuid, p_delivered_by uuid, p_item_confirmations jsonb DEFAULT NU | jsonb | plpgsql | ✓ | 1 |
| `create_booking_payment_pending` | p_booking_id uuid, p_tenant_id uuid, p_hotel_id uuid, p_amount numeric, p_paymen | jsonb | plpgsql | ✓ | 1 |
| `create_booking_v2` | p_bookings jsonb, p_guest jsonb | jsonb | plpgsql | ✓ | 1 |
| `create_default_categories` | p_tenant_id uuid | void | plpgsql | ✓ | 0 |
| `create_default_tenant_roles` | p_tenant_id uuid | void | plpgsql | ✓ | 0 |
| `create_default_warehouse_for_hotel` | p_hotel_id uuid, p_tenant_id uuid | uuid | plpgsql | ✓ | 0 |
| `create_direct_conversation` | _hotel_id uuid, _peer_user_id uuid | uuid | plpgsql | ✓ | 1 |
| `create_distribution_order` | p_tenant_id uuid, p_hotel_id uuid, p_created_by uuid, p_assigned_to uuid, p_room | jsonb | plpgsql | ✓ | 3 |
| `create_group_conversation` | _hotel_id uuid, _name text, _member_ids uuid[] | uuid | plpgsql | ✓ | 1 |
| `create_inbound_transaction` | p_tenant_id uuid, p_hotel_id uuid, p_transaction_category text, p_from_location  | jsonb | plpgsql | ✓ | 2 |
| `create_laundry_batch_with_items` | p_tenant_id uuid, p_hotel_id uuid, p_vendor_id uuid, p_delivery_date date, p_exp | jsonb | plpgsql | ✓ | 1 |
| `create_laundry_loss_transaction` | p_tenant_id uuid, p_hotel_id uuid, p_created_by uuid, p_items jsonb, p_loss_type | jsonb | plpgsql | ✓ | 1 |
| `create_laundry_return_transaction` | p_tenant_id uuid, p_hotel_id uuid, p_from_location text, p_to_location text, p_c | jsonb | plpgsql | ✓ | 1 |
| `create_new_linen_batch` | _item_id uuid, _quantity integer, _batch_code text | jsonb | plpgsql | ✓ | 1 |
| `create_notification` | p_user_id uuid, p_tenant_id uuid, p_title text, p_body text, p_type text DEFAULT | uuid | plpgsql | ✓ | 0 |
| `create_notification_for_user` | p_user_id uuid, p_tenant_id uuid, p_title text, p_body text, p_type text DEFAULT | uuid | plpgsql | ✓ | 1 |
| `create_outbound_transaction` | p_tenant_id uuid, p_hotel_id uuid, p_transaction_category text, p_from_location  | jsonb | plpgsql | ✓ | 3 |
| `create_room_block` | p_hotel_id uuid, p_room_id uuid, p_start_date date, p_end_date date, p_block_typ | jsonb | plpgsql | ✓ | 1 |
| `create_staff_status_for_new_user` | – | trigger | plpgsql | ✓ | 0 |
| `create_stock_adjustment` | p_tenant_id uuid, p_hotel_id uuid, p_adjustment_type text, p_scheduled_date date | jsonb | plpgsql | ✓ | 1 |
| `create_super_admin` | p_email text, p_full_name text DEFAULT 'Super Admin'::text | jsonb | plpgsql | ✓ | 0 |
| `create_warehouse_transfer` | p_tenant_id uuid, p_hotel_id uuid, p_from_warehouse_id uuid, p_to_warehouse_id u | uuid | plpgsql | ✓ | 1 |
| `delete_chat_message` | _message_id uuid | void | plpgsql | ✓ | 0 |
| `delete_email` | queue_name text, message_id bigint | boolean | plpgsql | ✓ | 0 |
| `delete_inventory_transaction` | p_transaction_id uuid | jsonb | plpgsql | ✓ | 1 |
| `delete_room_block` | p_block_id uuid | jsonb | plpgsql | ✓ | 1 |
| `deliver_stop` | p_stop_id uuid, p_actor_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 1 |
| `duplicate_room_type` | p_source_id uuid, p_new_name text, p_new_code text, p_copy_rates boolean DEFAULT | uuid | plpgsql | ✓ | 1 |
| `enforce_read_only_mutation` | – | trigger | plpgsql | ✓ | 0 |
| `enforce_room_check_photos` | – | trigger | plpgsql | ✓ | 0 |
| `enqueue_email` | queue_name text, payload jsonb | bigint | plpgsql | ✓ | 0 |
| `enqueue_stay_registration` | p_booking_id uuid | integer | plpgsql | ✓ | 1 |
| `ensure_default_rate_plan` | p_room_type_id uuid | uuid | plpgsql | ✓ | 1 |
| `ensure_single_default_warehouse` | – | trigger | plpgsql | ✓ | 0 |
| `ensure_vat_claim_token` | p_invoice_id uuid | TABLE(token text, expires_at timestamp w | plpgsql | ✓ | 1 |
| `exec_cron_update` | _jobname text, _command text | void | plpgsql | ✓ | 0 |
| `fn_can_user_transition_room` | _user_id uuid, _from text, _to text | boolean | plpgsql | ✓ | 0 |
| `fn_is_valid_adjustment_transition` | _from text, _to text | boolean | sql |  | 0 |
| `fn_is_valid_room_transition` | _from text, _to text | boolean | sql |  | 0 |
| `fn_is_valid_task_transition` | _from text, _to text | boolean | sql |  | 0 |
| `fn_normalize_room_status_v2` | _status text | text | sql |  | 0 |
| `fn_room_status_alias` | _status text | text | sql |  | 0 |
| `fn_sync_room_legacy_status` | – | trigger | plpgsql |  | 0 |
| `fn_sync_room_legacy_status_ins` | – | trigger | plpgsql |  | 0 |
| `fn_sync_room_status_on_booking_flag` | – | trigger | plpgsql | ✓ | 0 |
| `fn_write_audit_log` | – | trigger | plpgsql | ✓ | 0 |
| `gen_vat_claim_token` | – | text | plpgsql |  | 0 |
| `generate_guest_invoice_number` | p_tenant_id uuid | text | plpgsql | ✓ | 2 |
| `generate_invoice_number` | – | text | plpgsql |  | 0 |
| `generate_laundry_request_code` | p_tenant_id uuid | text | plpgsql | ✓ | 2 |
| `generate_lost_found_item_code` | p_tenant_id uuid | text | plpgsql | ✓ | 1 |
| `generate_supplement_request_code` | p_tenant_id uuid | text | plpgsql | ✓ | 2 |
| `generate_unique_code` | prefix text, table_name text, column_name text | text | plpgsql |  | 0 |
| `get_abc_analysis` | p_tenant_id uuid, p_hotel_id uuid | TABLE(item_id uuid, item_code text, item | plpgsql | ✓ | 1 |
| `get_all_warehouse_stock_summary` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid | TABLE(warehouse_id uuid, warehouse_name  | plpgsql | ✓ | 1 |
| `get_booking_chargeable_total` | p_booking_id uuid | numeric | sql | ✓ | 1 |
| `get_categories_with_stats` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid | TABLE(id uuid, name text, name_en text,  | plpgsql | ✓ | 1 |
| `get_consumption_trend` | _item_id uuid, _days integer DEFAULT 90 | TABLE(day date, qty_out numeric) | sql | ✓ | 1 |
| `get_conversation_hotel` | _conv_id uuid | uuid | sql | ✓ | 0 |
| `get_conversation_tenant` | _conv_id uuid | uuid | sql | ✓ | 0 |
| `get_current_room_booking` | p_room_id uuid | TABLE(id uuid, guest_name text, guest_ph | sql | ✓ | 1 |
| `get_current_user_role` | – | text | sql | ✓ | 0 |
| `get_current_user_tenant_id` | – | uuid | sql | ✓ | 0 |
| `get_daily_occupancy_trend` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT  | jsonb | plpgsql | ✓ | 1 |
| `get_dashboard_stats` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 1 |
| `get_dead_stock_report` | _tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid, _days_threshold integer DEFA | TABLE(item_id uuid, item_code text, item | sql | ✓ | 1 |
| `get_distribution_order_detail` | p_order_id uuid | jsonb | plpgsql | ✓ | 2 |
| `get_distribution_orders_count` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL | integer | plpgsql | ✓ | 2 |
| `get_distribution_orders_filtered` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL | TABLE(id uuid, order_code text, status t | plpgsql | ✓ | 3 |
| `get_effective_permissions` | _user_id uuid | TABLE(module text, action text, source t | sql | ✓ | 1 |
| `get_financial_report` | p_tenant_id uuid, p_hotel_id uuid, p_start_date date, p_end_date date | jsonb | plpgsql | ✓ | 1 |
| `get_floor_plan` | p_hotel_id uuid | jsonb | plpgsql | ✓ | 1 |
| `get_floor_plan_live` | p_hotel_id uuid | jsonb | plpgsql | ✓ | 1 |
| `get_hotel_performance_stats` | p_tenant_id uuid, p_hotel_id uuid, p_from_date date, p_to_date date | jsonb | plpgsql | ✓ | 1 |
| `get_hotels_breakdown_stats` | p_tenant_id uuid | TABLE(hotel_id uuid, hotel_name text, ho | plpgsql | ✓ | 1 |
| `get_hotels_performance_comparison` | p_tenant_id uuid, p_from_date date, p_to_date date | TABLE(hotel_id uuid, hotel_name text, ho | plpgsql | ✓ | 1 |
| `get_inventory_dashboard_stats` | p_tenant_id uuid, p_hotel_id uuid | jsonb | plpgsql | ✓ | 2 |
| `get_inventory_report` | p_tenant_id uuid, p_hotel_id uuid, p_start_date date, p_end_date date | jsonb | plpgsql | ✓ | 1 |
| `get_inventory_transactions_filtered` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_transaction_type text DE | TABLE(id uuid, transaction_code text, tr | plpgsql | ✓ | 1 |
| `get_inventory_value_over_time` | p_tenant_id uuid, p_hotel_id uuid, p_months integer DEFAULT 12 | TABLE(month date, stock_value numeric, v | plpgsql | ✓ | 1 |
| `get_item_detail` | p_item_id uuid | jsonb | plpgsql | ✓ | 0 |
| `get_items_filtered` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT | TABLE(id uuid, code text, name text, nam | plpgsql | ✓ | 2 |
| `get_labor_cost` | p_tenant_id uuid, p_hotel_id uuid, p_start_date date, p_end_date date | jsonb | plpgsql | ✓ | 1 |
| `get_last_room_check` | _room_id uuid | TABLE(id uuid, check_type text, checked_ | sql | ✓ | 1 |
| `get_latest_consumption_snapshots` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50 | SETOF consumption_snapshots | sql | ✓ | 1 |
| `get_laundry_batch_detail` | p_batch_id uuid | jsonb | plpgsql | ✓ | 1 |
| `get_laundry_batches_filtered` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_vendor_id uuid DEFAULT N | TABLE(id uuid, tenant_id uuid, hotel_id  | plpgsql | ✓ | 1 |
| `get_laundry_dashboard_stats` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 1 |
| `get_laundry_report` | p_tenant_id uuid, p_hotel_id uuid, p_start_date date, p_end_date date | jsonb | plpgsql | ✓ | 1 |
| `get_low_stock_by_warehouses` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50 | TABLE(warehouse_id uuid, warehouse_name  | plpgsql | ✓ | 1 |
| `get_low_stock_items` | p_tenant_id uuid, p_hotel_id uuid, p_limit integer DEFAULT 50 | TABLE(id uuid, code text, name text, cat | plpgsql | ✓ | 3 |
| `get_maintenance_dashboard` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 1 |
| `get_maintenance_report` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT  | jsonb | plpgsql | ✓ | 1 |
| `get_missing_items_for_rooms` | p_room_ids uuid[] | TABLE(room_id uuid, room_number text, it | plpgsql | ✓ | 0 |
| `get_missing_items_from_room_detail` | p_room_ids uuid[] | TABLE(room_id uuid, room_number text, it | plpgsql | ✓ | 1 |
| `get_monthly_expenses` | p_tenant_id uuid, p_months integer, p_hotel_id uuid DEFAULT NULL::uuid | TABLE(month text, purchase bigint, laund | plpgsql | ✓ | 1 |
| `get_monthly_laundry_expenses` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_year integer DEFAULT (EX | TABLE(month text, total_batches bigint,  | plpgsql | ✓ | 1 |
| `get_pending_tenants` | – | TABLE(tenant_id uuid, tenant_name text,  | plpgsql | ✓ | 1 |
| `get_pricing_health` | p_hotel_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 1 |
| `get_qc_daily_trend` | _tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid, _days integer DEFAULT 30 | TABLE(day date, total_tasks bigint, rewo | sql |  | 0 |
| `get_qc_floor_stats` | _tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid, _days integer DEFAULT 30 | TABLE(hotel_id uuid, floor integer, tota | sql |  | 0 |
| `get_qc_staff_stats` | _tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid, _days integer DEFAULT 30 | TABLE(user_id uuid, full_name text, hote | sql |  | 0 |
| `get_recent_activities` | p_tenant_id uuid, p_limit integer DEFAULT 10, p_hotel_id uuid DEFAULT NULL::uuid | TABLE(id uuid, type text, description te | plpgsql | ✓ | 1 |
| `get_room_checks_report` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT  | jsonb | plpgsql | ✓ | 1 |
| `get_room_detail` | p_room_id uuid | jsonb | plpgsql | ✓ | 0 |
| `get_room_distribution_history` | p_room_id uuid | TABLE(order_id uuid, order_code text, or | plpgsql | ✓ | 0 |
| `get_room_items_with_standards` | p_room_id uuid | TABLE(id uuid, room_id uuid, item_id uui | plpgsql | ✓ | 2 |
| `get_room_standards` | p_hotel_id uuid, p_room_type text | TABLE(id uuid, item_id uuid, item_code t | plpgsql | ✓ | 1 |
| `get_rooms_filtered` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_floor integer DEFAULT NU | TABLE(id uuid, tenant_id uuid, hotel_id  | plpgsql | ✓ | 5 |
| `get_rooms_report_stats` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT  | jsonb | plpgsql | ✓ | 1 |
| `get_stale_sessions_for_reminder` | – | TABLE(session_id uuid, room_id uuid, use | sql | ✓ | 0 |
| `get_stock_adjustments_filtered` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL | TABLE(id uuid, adjustment_code text, adj | plpgsql | ✓ | 1 |
| `get_stock_audit_report` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_start_date date DEFAULT  | jsonb | plpgsql | ✓ | 1 |
| `get_super_admin_dashboard_stats` | – | jsonb | plpgsql | ✓ | 1 |
| `get_tape_chart` | p_hotel_id uuid, p_start_date date, p_days integer DEFAULT 14 | jsonb | plpgsql | ✓ | 1 |
| `get_tenant_billing_summary` | p_tenant_id uuid | jsonb | plpgsql | ✓ | 1 |
| `get_top_items` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10 | TABLE(id uuid, code text, name text, thu | plpgsql | ✓ | 1 |
| `get_turnover_analysis` | p_tenant_id uuid, p_hotel_id uuid, p_months integer DEFAULT 3 | TABLE(item_id uuid, item_code text, item | plpgsql | ✓ | 1 |
| `get_user_hotels` | p_user_id uuid | TABLE(id uuid, code text, name text, cit | plpgsql | ✓ | 0 |
| `get_user_level` | _user_id uuid | text | sql | ✓ | 0 |
| `get_user_levels` | – | TABLE(id uuid, code text, name text, hie | sql | ✓ | 1 |
| `get_user_permissions` | _user_id uuid | TABLE(code text, name text, module text, | sql | ✓ | 2 |
| `get_user_permissions_summary` | p_user_id uuid | TABLE(module text, can_view boolean, can | plpgsql | ✓ | 3 |
| `get_user_primary_role` | _user_id uuid | app_role | sql | ✓ | 0 |
| `get_user_subordinates` | p_user_id uuid | TABLE(id uuid, full_name text, email tex | plpgsql | ✓ | 1 |
| `get_users_by_hotel` | p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NUL | SETOF users | plpgsql | ✓ | 1 |
| `get_vat_claim_public` | p_token text | jsonb | plpgsql | ✓ | 1 |
| `get_vendor_performance` | p_vendor_id uuid, p_days integer DEFAULT 30 | jsonb | plpgsql | ✓ | 1 |
| `get_warehouse_stock_summary` | p_warehouse_id uuid | TABLE(item_id uuid, item_name text, item | plpgsql | ✓ | 1 |
| `get_workflow_analytics` | p_workflow_id uuid, p_period text DEFAULT 'month'::text | jsonb | plpgsql | ✓ | 0 |
| `guard_room_type_delete` | – | trigger | plpgsql | ✓ | 0 |
| `handle_item_image_primary` | – | trigger | plpgsql |  | 0 |
| `handle_new_user` | – | trigger | plpgsql | ✓ | 0 |
| `handle_successful_payment` | p_transaction_id uuid | void | plpgsql | ✓ | 0 |
| `handover_batch` | p_batch_id uuid, p_actor_id uuid DEFAULT NULL::uuid, p_adjustments jsonb DEFAULT | jsonb | plpgsql | ✓ | 1 |
| `handover_stop_create_next_route` | p_room_order_id uuid, p_next_shift_code text, p_next_assignee_id uuid DEFAULT NU | jsonb | plpgsql | ✓ | 1 |
| `has_permission` | _user_id uuid, _permission_code text | boolean | sql | ✓ | 0 |
| `has_role` | _user_id uuid, _role app_role | boolean | sql | ✓ | 0 |
| `has_user_level` | _user_id uuid, _level_code text | boolean | sql | ✓ | 0 |
| `has_user_permission` | p_user_id uuid, p_module text, p_action text | boolean | plpgsql | ✓ | 3 |
| `hotels_generate_code` | – | trigger | plpgsql |  | 0 |
| `ignore_reorder_suggestion` | _suggestion_id uuid, _reason text DEFAULT NULL::text, _ignore_days integer DEFAU | jsonb | plpgsql | ✓ | 1 |
| `increment_quantity_in_laundry` | p_item_id uuid, p_quantity integer | void | plpgsql | ✓ | 0 |
| `increment_staff_stat` | p_user_id uuid, p_hotel_id uuid, p_stat_type text, p_increment integer DEFAULT 1 | void | plpgsql | ✓ | 0 |
| `increment_workflow_stats` | p_workflow_id uuid, p_success boolean | void | plpgsql | ✓ | 0 |
| `initialize_warehouse_stock` | p_warehouse_id uuid, p_hotel_id uuid, p_tenant_id uuid | integer | plpgsql | ✓ | 0 |
| `inventory_transactions_generate_code` | – | trigger | plpgsql |  | 0 |
| `invoices_generate_number` | – | trigger | plpgsql |  | 0 |
| `is_conversation_admin` | _conv_id uuid, _user_id uuid | boolean | sql | ✓ | 0 |
| `is_conversation_member` | _conv_id uuid, _user_id uuid | boolean | sql | ✓ | 0 |
| `is_distribution_leader` | _user_id uuid | boolean | sql | ✓ | 0 |
| `is_level_higher_or_equal` | _user_id uuid, _min_level_code text | boolean | sql | ✓ | 0 |
| `is_manager` | – | boolean | sql | ✓ | 0 |
| `is_manager_or_above` | _user uuid | boolean | sql | ✓ | 0 |
| `is_owner_user` | – | boolean | sql | ✓ | 0 |
| `is_qc_manager` | _user_id uuid | boolean | sql | ✓ | 0 |
| `is_route_assignee` | _user_id uuid, _order_id uuid | boolean | sql | ✓ | 0 |
| `is_storekeeper` | _user_id uuid | boolean | sql | ✓ | 0 |
| `is_super_admin` | – | boolean | sql | ✓ | 0 |
| `is_tenant_owner` | – | boolean | sql | ✓ | 0 |
| `is_tenant_read_only` | p_tenant_id uuid | boolean | sql | ✓ | 0 |
| `items_generate_code` | – | trigger | plpgsql |  | 0 |
| `items_generate_qr` | – | trigger | plpgsql |  | 0 |
| `laundry_batch_items_update_inventory` | – | trigger | plpgsql | ✓ | 0 |
| `laundry_batches_generate_code` | – | trigger | plpgsql |  | 0 |
| `laundry_vendors_generate_code` | – | trigger | plpgsql |  | 0 |
| `leave_or_remove_conversation_member` | _conversation_id uuid, _user_id uuid | void | plpgsql | ✓ | 0 |
| `lift_expired_dnd_oos` | – | jsonb | plpgsql | ✓ | 0 |
| `log_activity` | p_tenant_id uuid, p_user_id uuid, p_action text, p_entity_type text, p_entity_id | void | plpgsql | ✓ | 0 |
| `log_shift_history` | – | trigger | plpgsql | ✓ | 0 |
| `log_state_transition` | p_table_name text, p_record_id uuid, p_from_state text, p_to_state text, p_conte | bigint | plpgsql | ✓ | 0 |
| `log_user_roles_change` | – | trigger | plpgsql | ✓ | 0 |
| `maintenance_requests_generate_code` | – | trigger | plpgsql |  | 0 |
| `manager_override_charge` | p_charge_id uuid, p_decision text, p_override_reason text | jsonb | plpgsql | ✓ | 1 |
| `mark_batch_partially_received` | _batch_id uuid, _items jsonb | jsonb | plpgsql | ✓ | 1 |
| `mark_batches_compensation_needed` | – | jsonb | plpgsql | ✓ | 0 |
| `mark_booking_no_show` | _booking_id uuid, _reason text DEFAULT NULL::text, _refund_deposit boolean DEFAU | room_bookings | plpgsql | ✓ | 1 |
| `mark_cannot_access` | p_room_order_id uuid, p_exception_type text, p_exception_reason text DEFAULT NUL | jsonb | plpgsql | ✓ | 1 |
| `mark_conversation_read` | _conversation_id uuid, _up_to_message_id uuid DEFAULT NULL::uuid | void | plpgsql | ✓ | 1 |
| `mark_primary_owner` | – | trigger | plpgsql |  | 0 |
| `mark_vat_claim_issued` | p_claim_id uuid, p_provider text, p_pdf_path text, p_lookup_code text | void | plpgsql | ✓ | 0 |
| `merge_guests` | p_target_id uuid, p_source_ids uuid[] | jsonb | plpgsql | ✓ | 0 |
| `move_booking` | p_booking_id uuid, p_new_room_id uuid, p_new_check_in date, p_new_check_out date | jsonb | plpgsql | ✓ | 1 |
| `move_to_dlq` | source_queue text, dlq_name text, message_id bigint, payload jsonb | bigint | plpgsql | ✓ | 0 |
| `notify_task_rejected` | – | trigger | plpgsql | ✓ | 0 |
| `on_tenant_created` | – | trigger | plpgsql | ✓ | 0 |
| `outbox_next_retry_at` | _retry_count integer | timestamp with time zone | sql |  | 0 |
| `perform_checkin` | p_booking_id uuid, p_room_id uuid, p_early_checkin_charge numeric DEFAULT 0 | jsonb | plpgsql | ✓ | 2 |
| `perform_checkout` | p_booking_id uuid, p_room_id uuid, p_late_checkout_charge numeric DEFAULT 0, p_s | jsonb | plpgsql | ✓ | 2 |
| `perform_group_checkout` | p_checkouts jsonb | jsonb | plpgsql | ✓ | 1 |
| `perform_quick_room_check` | _room_id uuid, _check_type text DEFAULT 'daily'::text, _notes text DEFAULT NULL: | jsonb | plpgsql | ✓ | 1 |
| `prepare_checkout_amounts` | p_booking_id uuid, p_room_id uuid, p_late_checkout_charge numeric DEFAULT 0, p_s | jsonb | plpgsql | ✓ | 1 |
| `prepare_group_checkout_amounts` | p_checkouts jsonb | jsonb | plpgsql | ✓ | 1 |
| `prevent_booking_overlap` | – | trigger | plpgsql |  | 0 |
| `prevent_unauthorized_salary_change` | – | trigger | plpgsql | ✓ | 0 |
| `prevent_user_privilege_escalation` | – | trigger | plpgsql | ✓ | 0 |
| `preview_asset_group_mapping` | _tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid | TABLE(item_id uuid, item_code text, item | plpgsql | ✓ | 0 |
| `process_expired_subscriptions` | – | void | plpgsql | ✓ | 0 |
| `process_room_check_issue_outbox` | _limit integer DEFAULT 50 | jsonb | plpgsql | ✓ | 0 |
| `purchase_order_items_receive` | – | trigger | plpgsql |  | 0 |
| `purchase_orders_generate_code` | – | trigger | plpgsql |  | 0 |
| `qc_approve_task` | _task_id uuid, _score_override integer DEFAULT NULL::integer, _notes text DEFAUL | jsonb | plpgsql | ✓ | 0 |
| `qc_escalate_overdue` | – | integer | plpgsql | ✓ | 0 |
| `qc_force_approve` | _task_id uuid, _reason text | jsonb | plpgsql | ✓ | 0 |
| `qc_reject_task` | _task_id uuid, _reason text, _categories text[] DEFAULT '{}'::text[] | jsonb | plpgsql | ✓ | 0 |
| `queue_email_notification` | p_tenant_id uuid, p_user_id uuid, p_to_email text, p_subject text, p_body_html t | uuid | plpgsql | ✓ | 1 |
| `read_email_batch` | queue_name text, batch_size integer, vt integer | TABLE(msg_id bigint, read_ct integer, me | plpgsql | ✓ | 0 |
| `reassign_subordinates` | p_old_manager_id uuid, p_new_manager_id uuid | integer | plpgsql | ✓ | 0 |
| `receive_batch` | p_batch_id uuid, p_actor_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 1 |
| `reconcile_room_check_outbox` | _hours integer DEFAULT 24 | jsonb | plpgsql | ✓ | 0 |
| `record_booking_payment` | p_booking_id uuid, p_tenant_id uuid, p_hotel_id uuid, p_amount numeric, p_paymen | jsonb | plpgsql | ✓ | 0 |
| `refresh_consumption_snapshots` | _tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 1 |
| `refresh_monthly_expenses` | – | void | plpgsql | ✓ | 0 |
| `reject_room_delivery` | p_distribution_order_room_id uuid, p_rejected_by uuid, p_rejection_reason text | jsonb | plpgsql | ✓ | 1 |
| `reject_task` | _task_id uuid, _reason text | housekeeping_tasks | plpgsql | ✓ | 1 |
| `reject_tenant` | p_tenant_id uuid, p_admin_id uuid, p_reason text | jsonb | plpgsql | ✓ | 1 |
| `rename_chat_group` | _conversation_id uuid, _name text | void | plpgsql | ✓ | 0 |
| `reopen_room_check` | _check_id uuid, _reason text DEFAULT NULL::text | jsonb | plpgsql | ✓ | 1 |
| `reschedule_booking_checkin` | _booking_id uuid, _new_check_in_date date, _new_check_out_date date, _reason tex | room_bookings | plpgsql | ✓ | 1 |
| `resize_booking` | p_booking_id uuid, p_new_check_in date, p_new_check_out date | jsonb | plpgsql | ✓ | 1 |
| `resolve_daily_prices_bulk` | p_room_type_id uuid, p_from date, p_to date, p_apply_to text DEFAULT 'daily'::te | TABLE(date date, base_price numeric, ove | plpgsql | ✓ | 1 |
| `resolve_qc_settings` | _tenant_id uuid, _hotel_id uuid, _task_type text | TABLE(qc_required boolean, sla_minutes i | sql | ✓ | 0 |
| `resolve_today_prices_for_hotel` | p_hotel_id uuid, p_apply_to text DEFAULT 'daily'::text | TABLE(room_type_id uuid, room_type_name  | plpgsql | ✓ | 1 |
| `retry_stay_registration` | p_id uuid | void | plpgsql | ✓ | 1 |
| `retry_stop` | p_room_order_id uuid, p_actor_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 1 |
| `return_to_stock_for_stop` | p_room_order_id uuid, p_actor_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 1 |
| `review_chargeable_consumptions` | p_ids uuid[], p_decision text, p_reason text DEFAULT NULL::text | TABLE(updated_count integer) | plpgsql | ✓ | 1 |
| `review_room_check_issue` | p_issue_id uuid, p_decision text, p_reason text DEFAULT NULL::text | jsonb | plpgsql | ✓ | 1 |
| `room_items_update_inventory` | – | trigger | plpgsql |  | 0 |
| `room_type_pricing_code` | p_room_type text | text | sql |  | 0 |
| `rpc_request_is_trusted` | – | boolean | sql | ✓ | 0 |
| `run_auto_reorder_daily` | – | jsonb | plpgsql | ✓ | 0 |
| `schedule_renewal_reminders` | – | void | plpgsql |  | 1 |
| `send_chat_message` | _conversation_id uuid, _body text, _parent_message_id uuid DEFAULT NULL::uuid, _ | uuid | plpgsql | ✓ | 1 |
| `send_draft_batch` | p_batch_id uuid, p_vendor_id uuid, p_delivery_date date, p_expected_return_date  | jsonb | plpgsql | ✓ | 1 |
| `set_announcement_updated_at` | – | trigger | plpgsql |  | 0 |
| `set_conversation_mute` | _conversation_id uuid, _muted_until timestamp with time zone | void | plpgsql | ✓ | 0 |
| `set_financial_targets_updated_at` | – | trigger | plpgsql |  | 0 |
| `set_tenant_read_only` | p_tenant_id uuid, p_reason text | void | plpgsql | ✓ | 0 |
| `settle_batch_compensation` | _batch_id uuid, _compensation_amount numeric, _notes text DEFAULT NULL::text | jsonb | plpgsql | ✓ | 1 |
| `settle_booking_payment` | p_payment_id uuid, p_gateway_transaction_id text DEFAULT NULL::text | jsonb | plpgsql | ✓ | 2 |
| `settle_subscription_payment` | p_payment_id uuid, p_gateway_transaction_id text DEFAULT NULL::text | jsonb | plpgsql | ✓ | 1 |
| `setup_new_tenant` | p_user_id uuid, p_tenant_name text, p_tenant_email text, p_tenant_phone text, p_ | jsonb | plpgsql | ✓ | 0 |
| `setup_room_initial` | p_room_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_reset_quantities boolean DE | jsonb | plpgsql | ✓ | 1 |
| `stock_adjustment_items_apply` | – | trigger | plpgsql |  | 0 |
| `stock_adjustments_generate_code` | – | trigger | plpgsql |  | 0 |
| `submit_delivery_lean` | _room_id uuid, _distribution_order_room_id uuid, _items_actual jsonb DEFAULT NUL | jsonb | plpgsql | ✓ | 1 |
| `submit_replenish_lean` | _room_id uuid, _items jsonb DEFAULT '[]'::jsonb, _cleaning_requested boolean DEF | jsonb | plpgsql | ✓ | 1 |
| `submit_room_check_for_qc` | _task_id uuid, _room_check_id uuid | jsonb | plpgsql | ✓ | 0 |
| `submit_room_check_lean` | _room_id uuid, _check_type text, _started_at timestamp with time zone, _notes te | jsonb | plpgsql | ✓ | 1 |
| `submit_vat_claim_public` | p_token text, p_company_name text, p_tax_code text, p_company_address text, p_em | jsonb | plpgsql | ✓ | 0 |
| `sync_categories_for_hotel` | p_tenant_id uuid, p_hotel_id uuid | jsonb | plpgsql | ✓ | 1 |
| `sync_pricing_rules_to_hotel_settings` | – | trigger | plpgsql | ✓ | 0 |
| `sync_room_types_from_rooms` | p_hotel_id uuid DEFAULT NULL::uuid | integer | plpgsql | ✓ | 0 |
| `tg_inventory_out_update_reorder` | – | trigger | plpgsql | ✓ | 0 |
| `tg_reorder_suggestions_updated_at` | – | trigger | plpgsql | ✓ | 0 |
| `toggle_message_reaction` | _message_id uuid, _emoji text | boolean | plpgsql | ✓ | 0 |
| `touch_batch_inventory` | – | trigger | plpgsql |  | 0 |
| `touch_room_blocks_updated_at` | – | trigger | plpgsql |  | 0 |
| `transfer_booking_room` | p_booking_id uuid, p_new_room_id uuid, p_reason text DEFAULT NULL::text | jsonb | plpgsql | ✓ | 1 |
| `transition_adjustment_status` | _adjustment_id uuid, _to_status text, _reason text DEFAULT NULL::text, _force bo | stock_adjustments | plpgsql | ✓ | 0 |
| `transition_booking_status` | _booking_id uuid, _to_status text, _reason text DEFAULT NULL::text, _amount_owed | room_bookings | plpgsql | ✓ | 1 |
| `transition_laundry_batch_status` | _batch_id uuid, _to text, _reason text DEFAULT NULL::text | jsonb | plpgsql | ✓ | 0 |
| `transition_room_status` | _room_id uuid, _to_status text, _reason text DEFAULT NULL::text, _dnd_until time | jsonb | plpgsql | ✓ | 5 |
| `transition_task_status` | _task_id uuid, _to_status text, _reason text DEFAULT NULL::text, _force boolean  | housekeeping_tasks | plpgsql | ✓ | 5 |
| `trg_enqueue_stay_registration_on_checkin` | – | trigger | plpgsql | ✓ | 0 |
| `trg_hotel_policy_history` | – | trigger | plpgsql | ✓ | 0 |
| `trg_laundry_batch_snapshot_policy` | – | trigger | plpgsql | ✓ | 0 |
| `trg_rci_set_charge_status` | – | trigger | plpgsql | ✓ | 0 |
| `trg_room_check_issues_outbox_fanout` | – | trigger | plpgsql | ✓ | 0 |
| `trigger_check_tenant_quota` | – | trigger | plpgsql | ✓ | 0 |
| `trigger_update_laundry_stats` | – | trigger | plpgsql |  | 0 |
| `trigger_update_maintenance_stats` | – | trigger | plpgsql |  | 0 |
| `undo_quick_room_check` | _check_id uuid, _reason text DEFAULT NULL::text | jsonb | plpgsql | ✓ | 1 |
| `undo_room_delivery_confirmation` | p_distribution_order_room_id uuid, p_performed_by uuid | jsonb | plpgsql | ✓ | 1 |
| `update_ab_tests_updated_at` | – | trigger | plpgsql |  | 0 |
| `update_adjustment_summary` | – | trigger | plpgsql |  | 0 |
| `update_booking_amount_paid` | p_booking_id uuid, p_amount_to_add numeric, p_total_amount numeric | jsonb | plpgsql | ✓ | 1 |
| `update_distribution_order` | p_order_id uuid, p_assigned_to uuid DEFAULT NULL::uuid, p_notes text DEFAULT NUL | jsonb | plpgsql | ✓ | 1 |
| `update_distribution_order_status` | – | trigger | plpgsql |  | 0 |
| `update_guest_stats_on_checkout` | – | trigger | plpgsql | ✓ | 0 |
| `update_hotel_floor_map_cell_size` | p_hotel_id uuid, p_size jsonb | jsonb | plpgsql | ✓ | 0 |
| `update_purchase_order_totals` | – | trigger | plpgsql |  | 0 |
| `update_room_pricing_rules_updated_at` | – | trigger | plpgsql |  | 0 |
| `update_room_status_safe` | p_room_id uuid, p_new_status text, p_expected_updated_at timestamp with time zon | jsonb | plpgsql | ✓ | 0 |
| `update_staff_status_from_room_check` | – | trigger | plpgsql | ✓ | 0 |
| `update_tenant_usage` | p_tenant_id uuid | void | plpgsql | ✓ | 3 |
| `update_updated_at_column` | – | trigger | plpgsql |  | 0 |
| `update_vendor_stats` | – | trigger | plpgsql |  | 0 |
| `update_workflow_stats` | – | trigger | plpgsql | ✓ | 0 |
| `user_has_hotel_access` | p_user_id uuid, p_hotel_id uuid | boolean | sql | ✓ | 0 |
| `user_has_subordinates` | p_user_id uuid | boolean | sql |  | 1 |
| `validate_booking_dates` | p_room_id uuid, p_check_in date, p_check_out date, p_exclude_booking_id uuid DEF | jsonb | plpgsql | ✓ | 2 |
| `validate_chargeable_approval_status` | – | trigger | plpgsql |  | 0 |
| `validate_hourly_against_daily` | p_room_id uuid, p_booking_date date, p_exclude_booking_id uuid DEFAULT NULL::uui | jsonb | plpgsql | ✓ | 1 |
| `validate_hourly_booking` | p_room_id uuid, p_start_time timestamp with time zone, p_end_time timestamp with | jsonb | plpgsql | ✓ | 2 |
| `validate_item_category_hotel` | – | trigger | plpgsql | ✓ | 0 |
| `validate_plan_change` | p_tenant_id uuid, p_new_plan_id uuid | jsonb | plpgsql | ✓ | 1 |
| `validate_room_check_context` | p_room_id uuid, p_check_type text, p_task_id uuid DEFAULT NULL::uuid | jsonb | plpgsql | ✓ | 1 |
| `validate_room_check_issue_entries` | – | trigger | plpgsql |  | 0 |
| `validate_room_item_hotel` | – | trigger | plpgsql | ✓ | 0 |
| `vendors_generate_code` | – | trigger | plpgsql |  | 0 |
| `works_at_same_hotel` | target_user_id uuid | boolean | sql | ✓ | 0 |

## Chi tiết caller

### `add_laundry_to_draft_batch`

- `src\hooks\useLaundryRequests.ts`
- `src\hooks\useRoomChecks.ts`

### `apply_promo_code`

- `src\hooks\super-admin\usePromoCodes.ts`

### `apply_room_standards`

- `src\hooks\useBulkRoomActions.ts`
- `src\hooks\useRoomStandards.ts`

### `approve_reorder_suggestions`

- `src\hooks\useReorderSuggestions.ts`

### `approve_task`

- `src\hooks\useTaskQc.ts`

### `approve_tenant`

- `src\hooks\super-admin\useTenantApproval.ts`

### `atomic_item_consumed`

- `src\hooks\useRoomChecks.ts`

### `atomic_item_lost`

- `src\hooks\useRoomChecks.ts`

### `atomic_item_to_laundry`

- `src\hooks\useRoomChecks.ts`

### `batch_confirm_room_deliveries`

- `src\hooks\useRoomDistributionHistory.ts`

### `bulk_delete_items`

- `src\hooks\useItems.ts`

### `calculate_booking_price`

- `src\components\bookings\booking-wizard\hooks\useBookingForm.ts`
- `src\hooks\useRoomTypeRates.ts`

### `calculate_staff_statistics`

- `src\hooks\useStaffStatistics.ts`

### `calculate_tenant_storage`

- `src\hooks\useTenantUsage.ts`

### `cancel_booking`

- `src\components\bookings\CancelBookingDialog.tsx`

### `cancel_booking_payment`

- `src\hooks\useBookingPayments.ts`

### `cancel_distribution_order`

- `src\hooks\useDistributionOrders.ts`

### `cancel_subscription_payment`

- `src\components\settings\subscription\PendingPayments.tsx`
- `src\pages\admin\PaymentSettingsPage.tsx`

### `check_expiring_subscriptions`

- `src\hooks\useEmailNotifications.ts`

### `check_tenant_can_add`

- `src\hooks\useTenantUsage.ts`

### `clear_tenant_read_only`

- `src\components\super-admin\tenants\ChangePlanDialog.tsx`

### `close_route_if_complete`

- `src\hooks\useRouteBatch.ts`

### `complete_registration`

- `src\pages\auth\Onboarding.tsx`
- `src\pages\items\CategoriesPage.tsx`

### `complete_task`

- `src\hooks\useHousekeepingTasks.ts`
- `src\hooks\useTaskQc.ts`

### `compute_reorder_suggestions`

- `src\hooks\useReorderSuggestions.ts`

### `confirm_booking_payment_manual`

- `src\components\bookings\BookingPaymentDialog.tsx`
- `src\components\bookings\GroupPaymentDialog.tsx`
- `src\hooks\useBookingPayments.ts`

### `confirm_delivery_from_room_check`

- `src\hooks\usePendingDeliveries.ts`

### `confirm_receive_order`

- `src\hooks\useRouteBatch.ts`

### `confirm_room_delivery`

- `src\hooks\useRoomDistributionHistory.ts`

### `confirm_warehouse_delivery`

- `src\hooks\useDistributionOrders.ts`

### `create_booking_payment_pending`

- `src\hooks\useBookingPayments.ts`

### `create_booking_v2`

- `src\components\bookings\booking-wizard\hooks\useBookingForm.ts`

### `create_direct_conversation`

- `src\hooks\useChat.ts`

### `create_distribution_order`

- `src\hooks\useCreateDistributionFromSupplement.ts`
- `src\hooks\useCreateDistributionFromSupplements.ts`
- `src\hooks\useDistributionOrders.ts`

### `create_group_conversation`

- `src\hooks\useChat.ts`

### `create_inbound_transaction`

- `src\hooks\useInventoryTransactions.ts`
- `src\hooks\usePurchaseOrders.ts`

### `create_laundry_batch_with_items`

- `src\hooks\useLaundryBatches.ts`

### `create_laundry_loss_transaction`

- `src\hooks\useLaundryBatches.ts`

### `create_laundry_return_transaction`

- `src\hooks\useLaundryBatches.ts`

### `create_new_linen_batch`

- `src\hooks\useLaundryCompensation.ts`

### `create_notification_for_user`

- `src\hooks\useNotificationTriggers.ts`

### `create_outbound_transaction`

- `src\hooks\useInventoryTransactions.ts`
- `src\hooks\useRoomSupplements.ts`
- `src\hooks\useSupplementRequests.ts`

### `create_room_block`

- `src\hooks\useTapeChartMutations.ts`

### `create_stock_adjustment`

- `src\hooks\useStockAdjustments.ts`

### `create_warehouse_transfer`

- `src\hooks\useWarehouseTransfer.ts`

### `delete_inventory_transaction`

- `src\hooks\useInventoryTransactions.ts`

### `delete_room_block`

- `src\hooks\useTapeChartMutations.ts`

### `deliver_stop`

- `src\hooks\useRouteBatch.ts`

### `duplicate_room_type`

- `src\hooks\useRoomTypeRates.ts`

### `enqueue_stay_registration`

- `src\hooks\useStayRegistrations.ts`

### `ensure_default_rate_plan`

- `src\hooks\usePricingDaily.ts`

### `ensure_vat_claim_token`

- `src\hooks\useVatClaimToken.ts`

### `generate_guest_invoice_number`

- `src\hooks\useGuestInvoices.ts`
- `src\lib\invoiceHelpers.ts`

### `generate_laundry_request_code`

- `src\hooks\useLaundryRequests.ts`
- `src\hooks\useRoomChecks.ts`

### `generate_lost_found_item_code`

- `src\pages\lost-found\LostFoundPage.tsx`

### `generate_supplement_request_code`

- `src\hooks\useRoomChecks.ts`
- `src\hooks\useSupplementRequests.ts`

### `get_abc_analysis`

- `src\hooks\useReports.ts`

### `get_all_warehouse_stock_summary`

- `src\hooks\useWarehouseReport.ts`

### `get_booking_chargeable_total`

- `src\hooks\useChargeableConsumptions.ts`

### `get_categories_with_stats`

- `src\hooks\useCategories.ts`

### `get_consumption_trend`

- `src\hooks\useConsumptionAnalytics.ts`

### `get_current_room_booking`

- `src\hooks\useRoomBooking.ts`

### `get_daily_occupancy_trend`

- `src\hooks\useRoomsReportData.ts`

### `get_dashboard_stats`

- `src\hooks\useDashboardStats.ts`

### `get_dead_stock_report`

- `src\hooks\useDeadStockReport.ts`

### `get_distribution_order_detail`

- `src\hooks\useDistributionOrders.ts`
- `src\hooks\useRouteBatch.ts`

### `get_distribution_orders_count`

- `src\hooks\useRouteFilters.ts`
- `src\lib\route-data-prefetch.ts`

### `get_distribution_orders_filtered`

- `src\hooks\useDistributionOrders.ts`
- `src\hooks\useRouteFilters.ts`
- `src\lib\route-data-prefetch.ts`

### `get_effective_permissions`

- `src\hooks\useEffectivePermissions.ts`

### `get_financial_report`

- `src\hooks\useReports.ts`

### `get_floor_plan`

- `src\hooks\useFloorPlan.ts`

### `get_floor_plan_live`

- `src\hooks\useFloorPlanLive.ts`

### `get_hotel_performance_stats`

- `src\hooks\useHotelPerformance.ts`

### `get_hotels_breakdown_stats`

- `src\hooks\useDashboardStats.ts`

### `get_hotels_performance_comparison`

- `src\hooks\useHotelPerformance.ts`

### `get_inventory_dashboard_stats`

- `src\hooks\useInventoryDashboard.ts`
- `src\hooks\useInventoryHubBadges.ts`

### `get_inventory_report`

- `src\hooks\useReports.ts`

### `get_inventory_transactions_filtered`

- `src\hooks\useInventoryTransactions.ts`

### `get_inventory_value_over_time`

- `src\hooks\useInventoryDashboard.ts`

### `get_items_filtered`

- `src\components\items\ItemFilters.tsx`
- `src\hooks\useItems.ts`

### `get_labor_cost`

- `src\hooks\useLaborCost.ts`

### `get_last_room_check`

- `src\hooks\useQuickRoomCheck.ts`

### `get_latest_consumption_snapshots`

- `src\hooks\useConsumptionAnalytics.ts`

### `get_laundry_batch_detail`

- `src\hooks\useLaundryBatches.ts`

### `get_laundry_batches_filtered`

- `src\hooks\useLaundryBatches.ts`

### `get_laundry_dashboard_stats`

- `src\hooks\useLaundryDashboard.ts`

### `get_laundry_report`

- `src\hooks\useReports.ts`

### `get_low_stock_by_warehouses`

- `src\hooks\useWarehouseReport.ts`

### `get_low_stock_items`

- `src\hooks\useInventoryDashboard.ts`
- `src\hooks\useOverviewAlerts.ts`
- `src\hooks\useReports.ts`

### `get_maintenance_dashboard`

- `src\hooks\useMaintenanceDashboard.ts`

### `get_maintenance_report`

- `src\hooks\useMaintenanceReport.ts`

### `get_missing_items_from_room_detail`

- `src\components\distribution\hooks\useDistributionForm.ts`

### `get_monthly_expenses`

- `src\hooks\useMonthlyExpenses.ts`

### `get_monthly_laundry_expenses`

- `src\hooks\useLaundryDashboard.ts`

### `get_pending_tenants`

- `src\hooks\super-admin\useTenantApproval.ts`

### `get_pricing_health`

- `src\hooks\usePricingDaily.ts`

### `get_recent_activities`

- `src\hooks\useRecentActivities.ts`

### `get_room_checks_report`

- `src\hooks\useRoomsReportData.ts`

### `get_room_items_with_standards`

- `src\hooks\useRoomSupplements.ts`
- `src\hooks\useRooms.ts`

### `get_room_standards`

- `src\hooks\useRoomStandards.ts`

### `get_rooms_filtered`

- `src\hooks\useHousekeepingKpi.ts`
- `src\hooks\useRoomSupplements.ts`
- `src\hooks\useRooms.ts`
- `src\hooks\useRoomsNeedingActionToday.ts`
- `src\lib\route-data-prefetch.ts`

### `get_rooms_report_stats`

- `src\hooks\useRoomsReportData.ts`

### `get_stock_adjustments_filtered`

- `src\hooks\useStockAdjustments.ts`

### `get_stock_audit_report`

- `src\hooks\useStockAuditReport.ts`

### `get_super_admin_dashboard_stats`

- `src\hooks\useSuperAdminStats.ts`

### `get_tape_chart`

- `src\hooks\useTapeChart.ts`

### `get_tenant_billing_summary`

- `src\hooks\super-admin\useTenantBilling.ts`

### `get_top_items`

- `src\hooks\useTopItems.ts`

### `get_turnover_analysis`

- `src\hooks\useReports.ts`

### `get_user_levels`

- `src\hooks\useUserLevels.ts`

### `get_user_permissions`

- `src\hooks\usePermissions.ts`
- `src\hooks\useUserPermissions.ts`

### `get_user_permissions_summary`

- `src\hooks\useUserModulePermissions.ts`
- `src\hooks\useUserPermissionConfiguration.ts`
- `src\hooks\useUserPermissions.ts`

### `get_user_subordinates`

- `src\hooks\useSubordinates.ts`

### `get_users_by_hotel`

- `src\hooks\useUsers.ts`

### `get_vat_claim_public`

- `src\pages\public\InvoiceVatClaimPage.tsx`

### `get_vendor_performance`

- `src\hooks\useLaundryVendors.ts`

### `get_warehouse_stock_summary`

- `src\hooks\useWarehouseStock.ts`

### `handover_batch`

- `src\hooks\useRouteBatch.ts`

### `handover_stop_create_next_route`

- `src\hooks\useRouteBatch.ts`

### `has_user_permission`

- `src\components\auth\PermissionRoute.tsx`
- `src\hooks\usePermission.ts`
- `src\hooks\useUserPermissions.ts`

### `ignore_reorder_suggestion`

- `src\hooks\useReorderSuggestions.ts`

### `manager_override_charge`

- `src\pages\reception\PendingChargesPage.tsx`

### `mark_batch_partially_received`

- `src\hooks\useLaundryCompensation.ts`

### `mark_booking_no_show`

- `src\hooks\useMarkBookingNoShow.ts`

### `mark_cannot_access`

- `src\hooks\useRouteBatch.ts`

### `mark_conversation_read`

- `src\hooks\useChat.ts`

### `move_booking`

- `src\hooks\useTapeChartMutations.ts`

### `perform_checkin`

- `src\components\rooms\RoomBookingDialog.tsx`
- `src\pages\bookings\BookingsPage.tsx`

### `perform_checkout`

- `src\components\rooms\RoomBookingDialog.tsx`
- `src\pages\bookings\BookingsPage.tsx`

### `perform_group_checkout`

- `src\components\bookings\GroupCheckoutDialog.tsx`

### `perform_quick_room_check`

- `src\hooks\useQuickRoomCheck.ts`

### `prepare_checkout_amounts`

- `src\components\bookings\CheckoutSummaryDialog.tsx`

### `prepare_group_checkout_amounts`

- `src\components\bookings\GroupCheckoutDialog.tsx`

### `queue_email_notification`

- `src\hooks\useEmailNotifications.ts`

### `receive_batch`

- `src\hooks\useRouteBatch.ts`

### `refresh_consumption_snapshots`

- `src\hooks\useConsumptionAnalytics.ts`

### `reject_room_delivery`

- `src\hooks\useRoomDistributionHistory.ts`

### `reject_task`

- `src\hooks\useTaskQc.ts`

### `reject_tenant`

- `src\hooks\super-admin\useTenantApproval.ts`

### `reopen_room_check`

- `src\hooks\useRoomCheckLean.ts`

### `reschedule_booking_checkin`

- `src\hooks\useRescheduleBookingCheckin.ts`

### `resize_booking`

- `src\hooks\useTapeChartMutations.ts`

### `resolve_daily_prices_bulk`

- `src\hooks\usePricingDaily.ts`

### `resolve_today_prices_for_hotel`

- `src\hooks\usePricingDaily.ts`

### `retry_stay_registration`

- `src\hooks\useStayRegistrations.ts`

### `retry_stop`

- `src\hooks\useRouteBatch.ts`

### `return_to_stock_for_stop`

- `src\hooks\useRouteBatch.ts`

### `review_chargeable_consumptions`

- `src\pages\reception\PendingChargesPage.tsx`

### `review_room_check_issue`

- `src\pages\housekeeping\IssuesReviewPage.tsx`

### `schedule_renewal_reminders`

- `src\hooks\super-admin\useRenewalReminders.ts`

### `send_chat_message`

- `src\hooks\useChat.ts`

### `send_draft_batch`

- `src\hooks\useSendDraftBatch.ts`

### `settle_batch_compensation`

- `src\hooks\useLaundryCompensation.ts`

### `settle_booking_payment`

- `src\components\bookings\BookingPaymentDialog.tsx`
- `src\components\bookings\GroupPaymentDialog.tsx`

### `settle_subscription_payment`

- `src\pages\admin\PaymentSettingsPage.tsx`

### `setup_room_initial`

- `src\hooks\useSetupRoom.ts`

### `submit_delivery_lean`

- `src\hooks\useSubmitDeliveryLean.ts`

### `submit_replenish_lean`

- `src\hooks\useSubmitReplenishLean.ts`

### `submit_room_check_lean`

- `src\hooks\useRoomCheckLean.ts`

### `sync_categories_for_hotel`

- `src\hooks\useSyncCategories.ts`

### `transfer_booking_room`

- `src\components\bookings\RoomTransferDialog.tsx`

### `transition_booking_status`

- `src\hooks\useBookingFlagTransition.ts`

### `transition_room_status`

- `src\components\rooms\ReceptionQuickDialog.tsx`
- `src\hooks\useBulkRoomActions.ts`
- `src\hooks\useRoomChecks.ts`
- `src\hooks\useRoomTransition.ts`
- `src\hooks\useRooms.ts`

### `transition_task_status`

- `src\hooks\useCheckoutInspection.ts`
- `src\hooks\useHousekeepingTasks.ts`
- `src\hooks\useRooms.ts`
- `src\hooks\useTaskTransition.ts`
- `src\pages\rooms\RoomCheckPage.tsx`

### `undo_quick_room_check`

- `src\hooks\useUndoQuickRoomCheck.ts`

### `undo_room_delivery_confirmation`

- `src\hooks\useRoomDistributionHistory.ts`

### `update_booking_amount_paid`

- `src\hooks\useBookingPayments.ts`

### `update_distribution_order`

- `src\hooks\useDistributionOrders.ts`

### `update_tenant_usage`

- `src\components\super-admin\tenants\ChangePlanDialog.tsx`
- `src\hooks\useSubscription.ts`
- `src\hooks\useTenantUsage.ts`

### `user_has_subordinates`

- `src\hooks\useSubordinates.ts`

### `validate_booking_dates`

- `src\components\bookings\ExtendBookingDialog.tsx`
- `src\components\bookings\booking-wizard\hooks\useBookingForm.ts`

### `validate_hourly_against_daily`

- `src\components\bookings\booking-wizard\hooks\useBookingForm.ts`

### `validate_hourly_booking`

- `src\components\bookings\RoomTransferDialog.tsx`
- `src\components\bookings\booking-wizard\hooks\useBookingForm.ts`

### `validate_plan_change`

- `src\hooks\useValidatePlanChange.ts`

### `validate_room_check_context`

- `src\hooks\useRoomCheckGuard.ts`


## RPC không có caller frontend (cần kiểm tra)

- `add_conversation_members`(_conversation_id uuid, _user_ids uuid[])
- `allocate_linen_fifo`(_item_id uuid, _quantity integer)
- `apply_asset_group_mapping`(_tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid, _overrid)
- `assert_distribution_actor`(p_room_order_id uuid, p_actor_id uuid, OUT tenant_id uuid, O)
- `assert_rpc_actor`(p_tenant_id uuid, p_hotel_id uuid DEFAULT NULL::uuid, p_acto)
- `assert_rpc_hotel`(p_tenant_id uuid, p_hotel_id uuid)
- `assert_rpc_items`(p_tenant_id uuid, p_hotel_id uuid, p_items jsonb)
- `assign_default_permissions_to_role`(p_tenant_id uuid, p_role_code text, p_permission_codes text[)
- `auto_apply_read_only_after_grace`()
- `auto_assign_batch_number`()
- `auto_classify_item_type`()
- `auto_clear_read_only_after_renewal`()
- `auto_close_stale_shifts`()
- `auto_create_batch_records`()
- `auto_offline_inactive_staff`()
- `auto_sync_room_type_on_room_change`()
- `auto_update_order_floor`()
- `bulk_upsert_daily_prices`(_rate_plan_id uuid, _dates date[], _price numeric DEFAULT NU)
- `bulk_upsert_rt_availability`(_room_type_id uuid, _dates date[], _qty integer DEFAULT NULL)
- `calculate_grace_period_end`()
- `calculate_payment_status`()
- `can_create_user`(p_creator_id uuid, p_new_user_level text, p_tenant_id uuid)
- `can_manage_user`(p_manager_id uuid, p_target_user_id uuid)
- `can_perform_quick_check`(_room_id uuid)
- `chat_after_message_insert`()
- `chat_guard_message_update`()
- `check_and_update_batch_status`(p_batch_id uuid)
- `check_and_update_order_status`(p_order_id uuid)
- `check_created_by_required`()
- `check_duplicate_room_check`()
- `check_rate_limit`(_bucket_key text, _max_hits integer, _window_seconds integer)
- `cleanup_expired_otps`()
- `cleanup_old_check_sessions`()
- `cleanup_orphaned_auth_users`()
- `cleanup_rate_limit_hits`()
- `cleanup_stale_check_sessions`()
- `compute_auto_reorder_suggestions`(_tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid)
- `create_default_categories`(p_tenant_id uuid)
- `create_default_tenant_roles`(p_tenant_id uuid)
- `create_default_warehouse_for_hotel`(p_hotel_id uuid, p_tenant_id uuid)
- `create_notification`(p_user_id uuid, p_tenant_id uuid, p_title text, p_body text,)
- `create_staff_status_for_new_user`()
- `create_super_admin`(p_email text, p_full_name text DEFAULT 'Super Admin'::text)
- `delete_chat_message`(_message_id uuid)
- `delete_email`(queue_name text, message_id bigint)
- `enforce_read_only_mutation`()
- `enforce_room_check_photos`()
- `enqueue_email`(queue_name text, payload jsonb)
- `ensure_single_default_warehouse`()
- `exec_cron_update`(_jobname text, _command text)
- `fn_can_user_transition_room`(_user_id uuid, _from text, _to text)
- `fn_is_valid_adjustment_transition`(_from text, _to text)
- `fn_is_valid_room_transition`(_from text, _to text)
- `fn_is_valid_task_transition`(_from text, _to text)
- `fn_normalize_room_status_v2`(_status text)
- `fn_room_status_alias`(_status text)
- `fn_sync_room_legacy_status`()
- `fn_sync_room_legacy_status_ins`()
- `fn_sync_room_status_on_booking_flag`()
- `fn_write_audit_log`()
- `gen_vat_claim_token`()
- `generate_invoice_number`()
- `generate_unique_code`(prefix text, table_name text, column_name text)
- `get_conversation_hotel`(_conv_id uuid)
- `get_conversation_tenant`(_conv_id uuid)
- `get_current_user_role`()
- `get_current_user_tenant_id`()
- `get_item_detail`(p_item_id uuid)
- `get_missing_items_for_rooms`(p_room_ids uuid[])
- `get_qc_daily_trend`(_tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid, _days in)
- `get_qc_floor_stats`(_tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid, _days in)
- `get_qc_staff_stats`(_tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid, _days in)
- `get_room_detail`(p_room_id uuid)
- `get_room_distribution_history`(p_room_id uuid)
- `get_stale_sessions_for_reminder`()
- `get_user_hotels`(p_user_id uuid)
- `get_user_level`(_user_id uuid)
- `get_user_primary_role`(_user_id uuid)
- `get_workflow_analytics`(p_workflow_id uuid, p_period text DEFAULT 'month'::text)
- `guard_room_type_delete`()
- `handle_item_image_primary`()
- `handle_new_user`()
- `handle_successful_payment`(p_transaction_id uuid)
- `has_permission`(_user_id uuid, _permission_code text)
- `has_role`(_user_id uuid, _role app_role)
- `has_user_level`(_user_id uuid, _level_code text)
- `hotels_generate_code`()
- `increment_quantity_in_laundry`(p_item_id uuid, p_quantity integer)
- `increment_staff_stat`(p_user_id uuid, p_hotel_id uuid, p_stat_type text, p_increme)
- `increment_workflow_stats`(p_workflow_id uuid, p_success boolean)
- `initialize_warehouse_stock`(p_warehouse_id uuid, p_hotel_id uuid, p_tenant_id uuid)
- `inventory_transactions_generate_code`()
- `invoices_generate_number`()
- `is_conversation_admin`(_conv_id uuid, _user_id uuid)
- `is_conversation_member`(_conv_id uuid, _user_id uuid)
- `is_distribution_leader`(_user_id uuid)
- `is_level_higher_or_equal`(_user_id uuid, _min_level_code text)
- `is_manager`()
- `is_manager_or_above`(_user uuid)
- `is_owner_user`()
- `is_qc_manager`(_user_id uuid)
- `is_route_assignee`(_user_id uuid, _order_id uuid)
- `is_storekeeper`(_user_id uuid)
- `is_super_admin`()
- `is_tenant_owner`()
- `is_tenant_read_only`(p_tenant_id uuid)
- `items_generate_code`()
- `items_generate_qr`()
- `laundry_batch_items_update_inventory`()
- `laundry_batches_generate_code`()
- `laundry_vendors_generate_code`()
- `leave_or_remove_conversation_member`(_conversation_id uuid, _user_id uuid)
- `lift_expired_dnd_oos`()
- `log_activity`(p_tenant_id uuid, p_user_id uuid, p_action text, p_entity_ty)
- `log_shift_history`()
- `log_state_transition`(p_table_name text, p_record_id uuid, p_from_state text, p_to)
- `log_user_roles_change`()
- `maintenance_requests_generate_code`()
- `mark_batches_compensation_needed`()
- `mark_primary_owner`()
- `mark_vat_claim_issued`(p_claim_id uuid, p_provider text, p_pdf_path text, p_lookup_)
- `merge_guests`(p_target_id uuid, p_source_ids uuid[])
- `move_to_dlq`(source_queue text, dlq_name text, message_id bigint, payload)
- `notify_task_rejected`()
- `on_tenant_created`()
- `outbox_next_retry_at`(_retry_count integer)
- `prevent_booking_overlap`()
- `prevent_unauthorized_salary_change`()
- `prevent_user_privilege_escalation`()
- `preview_asset_group_mapping`(_tenant_id uuid, _hotel_id uuid DEFAULT NULL::uuid)
- `process_expired_subscriptions`()
- `process_room_check_issue_outbox`(_limit integer DEFAULT 50)
- `purchase_order_items_receive`()
- `purchase_orders_generate_code`()
- `qc_approve_task`(_task_id uuid, _score_override integer DEFAULT NULL::integer)
- `qc_escalate_overdue`()
- `qc_force_approve`(_task_id uuid, _reason text)
- `qc_reject_task`(_task_id uuid, _reason text, _categories text[] DEFAULT '{}')
- `read_email_batch`(queue_name text, batch_size integer, vt integer)
- `reassign_subordinates`(p_old_manager_id uuid, p_new_manager_id uuid)
- `reconcile_room_check_outbox`(_hours integer DEFAULT 24)
- `record_booking_payment`(p_booking_id uuid, p_tenant_id uuid, p_hotel_id uuid, p_amou)
- `refresh_monthly_expenses`()
- `rename_chat_group`(_conversation_id uuid, _name text)
- `resolve_qc_settings`(_tenant_id uuid, _hotel_id uuid, _task_type text)
- `room_items_update_inventory`()
- `room_type_pricing_code`(p_room_type text)
- `rpc_request_is_trusted`()
- `run_auto_reorder_daily`()
- `set_announcement_updated_at`()
- `set_conversation_mute`(_conversation_id uuid, _muted_until timestamp with time zone)
- `set_financial_targets_updated_at`()
- `set_tenant_read_only`(p_tenant_id uuid, p_reason text)
- `setup_new_tenant`(p_user_id uuid, p_tenant_name text, p_tenant_email text, p_t)
- `stock_adjustment_items_apply`()
- `stock_adjustments_generate_code`()
- `submit_room_check_for_qc`(_task_id uuid, _room_check_id uuid)
- `submit_vat_claim_public`(p_token text, p_company_name text, p_tax_code text, p_compan)
- `sync_pricing_rules_to_hotel_settings`()
- `sync_room_types_from_rooms`(p_hotel_id uuid DEFAULT NULL::uuid)
- `tg_inventory_out_update_reorder`()
- `tg_reorder_suggestions_updated_at`()
- `toggle_message_reaction`(_message_id uuid, _emoji text)
- `touch_batch_inventory`()
- `touch_room_blocks_updated_at`()
- `transition_adjustment_status`(_adjustment_id uuid, _to_status text, _reason text DEFAULT N)
- `transition_laundry_batch_status`(_batch_id uuid, _to text, _reason text DEFAULT NULL::text)
- `trg_enqueue_stay_registration_on_checkin`()
- `trg_hotel_policy_history`()
- `trg_laundry_batch_snapshot_policy`()
- `trg_rci_set_charge_status`()
- `trg_room_check_issues_outbox_fanout`()
- `trigger_check_tenant_quota`()
- `trigger_update_laundry_stats`()
- `trigger_update_maintenance_stats`()
- `update_ab_tests_updated_at`()
- `update_adjustment_summary`()
- `update_distribution_order_status`()
- `update_guest_stats_on_checkout`()
- `update_hotel_floor_map_cell_size`(p_hotel_id uuid, p_size jsonb)
- `update_purchase_order_totals`()
- `update_room_pricing_rules_updated_at`()
- `update_room_status_safe`(p_room_id uuid, p_new_status text, p_expected_updated_at tim)
- `update_staff_status_from_room_check`()
- `update_updated_at_column`()
- `update_vendor_stats`()
- `update_workflow_stats`()
- `user_has_hotel_access`(p_user_id uuid, p_hotel_id uuid)
- `validate_chargeable_approval_status`()
- `validate_item_category_hotel`()
- `validate_room_check_issue_entries`()
- `validate_room_item_hotel`()
- `vendors_generate_code`()
- `works_at_same_hotel`(target_user_id uuid)
