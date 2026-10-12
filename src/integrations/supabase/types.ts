export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ab_tests: {
        Row: {
          created_at: string
          id: string
          name: string
          opened_a: number
          opened_b: number
          sample_size: number
          sent_a: number
          sent_b: number
          status: string
          updated_at: string
          variant_a_subject: string
          variant_b_subject: string
          winner: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          opened_a?: number
          opened_b?: number
          sample_size?: number
          sent_a?: number
          sent_b?: number
          status?: string
          updated_at?: string
          variant_a_subject: string
          variant_b_subject: string
          winner?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          opened_a?: number
          opened_b?: number
          sample_size?: number
          sent_a?: number
          sent_b?: number
          status?: string
          updated_at?: string
          variant_a_subject?: string
          variant_b_subject?: string
          winner?: string | null
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          description: string
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          tenant_id: string
          user_agent: string | null
          user_id: string | null
          user_name: string
          user_role: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          description: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          tenant_id: string
          user_agent?: string | null
          user_id?: string | null
          user_name: string
          user_role?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          description?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          tenant_id?: string
          user_agent?: string | null
          user_id?: string | null
          user_name?: string
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      ai_settings: {
        Row: {
          config_key: string
          config_value: string
          created_at: string
          id: string
          tenant_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config_key: string
          config_value: string
          created_at?: string
          id?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config_key?: string
          config_value?: string
          created_at?: string
          id?: string
          tenant_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_dismissals: {
        Row: {
          announcement_id: string
          dismissed_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_dismissals_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          body: string | null
          content: Json | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          ends_at: string | null
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_dismissible: boolean
          kind: Database["public"]["Enums"]["announcement_kind"]
          placement: Database["public"]["Enums"]["announcement_placement"]
          priority: number
          starts_at: string | null
          title: string
          updated_at: string
          variant: Database["public"]["Enums"]["announcement_variant"]
          version: string | null
        }
        Insert: {
          audience?: string
          body?: string | null
          content?: Json | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_dismissible?: boolean
          kind: Database["public"]["Enums"]["announcement_kind"]
          placement?: Database["public"]["Enums"]["announcement_placement"]
          priority?: number
          starts_at?: string | null
          title: string
          updated_at?: string
          variant?: Database["public"]["Enums"]["announcement_variant"]
          version?: string | null
        }
        Update: {
          audience?: string
          body?: string | null
          content?: Json | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_dismissible?: boolean
          kind?: Database["public"]["Enums"]["announcement_kind"]
          placement?: Database["public"]["Enums"]["announcement_placement"]
          priority?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
          variant?: Database["public"]["Enums"]["announcement_variant"]
          version?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          changed_fields: string[] | null
          context: Json | null
          created_at: string
          hotel_id: string | null
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          changed_fields?: string[] | null
          context?: Json | null
          created_at?: string
          hotel_id?: string | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          changed_fields?: string[] | null
          context?: Json | null
          created_at?: string
          hotel_id?: string | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      backup_logs: {
        Row: {
          backup_scope: string[]
          backup_type: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          duration_seconds: number | null
          error_message: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          status: string
          tenant_id: string
        }
        Insert: {
          backup_scope: string[]
          backup_type: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          status: string
          tenant_id: string
        }
        Update: {
          backup_scope?: string[]
          backup_type?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "backup_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_payment_settings: {
        Row: {
          account_holder: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at: string | null
          hotel_id: string | null
          id: string
          is_active: boolean | null
          payment_prefix: string | null
          qr_template: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_holder: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at?: string | null
          hotel_id?: string | null
          id?: string
          is_active?: boolean | null
          payment_prefix?: string | null
          qr_template?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_holder?: string
          account_number?: string
          bank_code?: string
          bank_name?: string
          created_at?: string | null
          hotel_id?: string | null
          id?: string
          is_active?: boolean | null
          payment_prefix?: string | null
          qr_template?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_payment_settings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "bank_payment_settings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_payment_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_inventory: {
        Row: {
          batch_code: string
          created_at: string
          created_by: string | null
          hotel_id: string
          id: string
          item_id: string
          quantity_available: number
          quantity_initial: number
          received_at: string
          retired_at: string | null
          tenant_id: string
          updated_at: string
          wash_cycles: number
        }
        Insert: {
          batch_code: string
          created_at?: string
          created_by?: string | null
          hotel_id: string
          id?: string
          item_id: string
          quantity_available: number
          quantity_initial: number
          received_at?: string
          retired_at?: string | null
          tenant_id: string
          updated_at?: string
          wash_cycles?: number
        }
        Update: {
          batch_code?: string
          created_at?: string
          created_by?: string | null
          hotel_id?: string
          id?: string
          item_id?: string
          quantity_available?: number
          quantity_initial?: number
          received_at?: string
          retired_at?: string | null
          tenant_id?: string
          updated_at?: string
          wash_cycles?: number
        }
        Relationships: [
          {
            foreignKeyName: "batch_inventory_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "batch_inventory_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_inventory_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_consumables: {
        Row: {
          booking_id: string
          consumed_quantity: number | null
          created_at: string
          id: string
          initial_quantity: number
          item_id: string
          notes: string | null
          remaining_quantity: number | null
          room_id: string
          supplemented_quantity: number
          tenant_id: string
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          booking_id: string
          consumed_quantity?: number | null
          created_at?: string
          id?: string
          initial_quantity?: number
          item_id: string
          notes?: string | null
          remaining_quantity?: number | null
          room_id: string
          supplemented_quantity?: number
          tenant_id: string
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          booking_id?: string
          consumed_quantity?: number | null
          created_at?: string
          id?: string
          initial_quantity?: number
          item_id?: string
          notes?: string | null
          remaining_quantity?: number | null
          room_id?: string
          supplemented_quantity?: number
          tenant_id?: string
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_consumables_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "room_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_consumables_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_consumables_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_consumables_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_consumables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string | null
          created_by: string | null
          gateway_transaction_id: string | null
          hotel_id: string
          id: string
          metadata: Json | null
          notes: string | null
          paid_at: string | null
          payment_method: string
          payment_status: string
          tenant_id: string
          transaction_reference: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string | null
          created_by?: string | null
          gateway_transaction_id?: string | null
          hotel_id: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          paid_at?: string | null
          payment_method: string
          payment_status?: string
          tenant_id: string
          transaction_reference?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string | null
          created_by?: string | null
          gateway_transaction_id?: string | null
          hotel_id?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          payment_status?: string
          tenant_id?: string
          transaction_reference?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "room_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "booking_payments_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "booking_payments_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_service_charges: {
        Row: {
          booking_id: string
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          quantity: number
          service_id: string | null
          service_name: string
          tenant_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          booking_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          quantity?: number
          service_id?: string | null
          service_name: string
          tenant_id: string
          total_price?: number
          unit_price?: number
        }
        Update: {
          booking_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          quantity?: number
          service_id?: string | null
          service_name?: string
          tenant_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_service_charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "room_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_service_charges_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_service_charges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_service_charges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_service_charges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "booking_service_charges_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "hotel_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_service_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_engagement: {
        Row: {
          campaign_id: string
          clicked_at: string | null
          conversion_value: number | null
          converted_at: string | null
          email_opened_at: string | null
          email_sent_at: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          campaign_id: string
          clicked_at?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          email_opened_at?: string | null
          email_sent_at?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          campaign_id?: string
          clicked_at?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          email_opened_at?: string | null
          email_sent_at?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_engagement_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_engagement_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chargeable_consumptions: {
        Row: {
          approval_status: string
          billed_at: string | null
          booking_id: string
          created_at: string | null
          final_status: string | null
          id: string
          is_billed: boolean | null
          item_code: string | null
          item_id: string
          item_name: string
          notes: string | null
          overridden_at: string | null
          overridden_by: string | null
          override_reason: string | null
          quantity: number
          recorded_at: string | null
          recorded_by: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          room_id: string
          source_issue_id: string | null
          tenant_id: string
          total_amount: number | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          approval_status?: string
          billed_at?: string | null
          booking_id: string
          created_at?: string | null
          final_status?: string | null
          id?: string
          is_billed?: boolean | null
          item_code?: string | null
          item_id: string
          item_name: string
          notes?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          quantity?: number
          recorded_at?: string | null
          recorded_by?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id: string
          source_issue_id?: string | null
          tenant_id: string
          total_amount?: number | null
          unit_price?: number
          updated_at?: string | null
        }
        Update: {
          approval_status?: string
          billed_at?: string | null
          booking_id?: string
          created_at?: string | null
          final_status?: string | null
          id?: string
          is_billed?: boolean | null
          item_code?: string | null
          item_id?: string
          item_name?: string
          notes?: string | null
          overridden_at?: string | null
          overridden_by?: string | null
          override_reason?: string | null
          quantity?: number
          recorded_at?: string | null
          recorded_by?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string
          source_issue_id?: string | null
          tenant_id?: string
          total_amount?: number | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chargeable_consumptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "room_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeable_consumptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeable_consumptions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeable_consumptions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeable_consumptions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeable_consumptions_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chargeable_consumptions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeable_consumptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_inspection_requests: {
        Row: {
          assigned_to: string
          booking_id: string
          completed_at: string | null
          created_at: string
          hotel_id: string
          id: string
          notes: string | null
          phase1_damage_data: Json | null
          requested_by: string | null
          room_check_id: string | null
          room_id: string
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          assigned_to: string
          booking_id: string
          completed_at?: string | null
          created_at?: string
          hotel_id: string
          id?: string
          notes?: string | null
          phase1_damage_data?: Json | null
          requested_by?: string | null
          room_check_id?: string | null
          room_id: string
          started_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          assigned_to?: string
          booking_id?: string
          completed_at?: string | null
          created_at?: string
          hotel_id?: string
          id?: string
          notes?: string | null
          phase1_damage_data?: Json | null
          requested_by?: string | null
          room_check_id?: string | null
          room_id?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_inspection_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "room_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_room_check_id_fkey"
            columns: ["room_check_id"]
            isOneToOne: false
            referencedRelation: "room_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_inspection_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          hotel_id: string
          id: string
          item_code: string | null
          item_id: string | null
          item_name: string | null
          paid_at: string | null
          payment_method: string | null
          payment_reference: string | null
          quantity: number
          request_code: string
          request_type: string
          resolution_notes: string | null
          responsible_person_id: string | null
          responsible_person_name: string | null
          source_id: string | null
          source_type: string | null
          status: string
          tenant_id: string
          total_amount: number
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          hotel_id: string
          id?: string
          item_code?: string | null
          item_id?: string | null
          item_name?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          quantity?: number
          request_code: string
          request_type?: string
          resolution_notes?: string | null
          responsible_person_id?: string | null
          responsible_person_name?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          tenant_id: string
          total_amount?: number
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          hotel_id?: string
          id?: string
          item_code?: string | null
          item_id?: string | null
          item_name?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          quantity?: number
          request_code?: string
          request_type?: string
          resolution_notes?: string | null
          responsible_person_id?: string | null
          responsible_person_name?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          tenant_id?: string
          total_amount?: number
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "compensation_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "compensation_requests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "compensation_requests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_requests_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_requests_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_requests_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "compensation_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_snapshots: {
        Row: {
          avg_daily_consumption: number
          created_at: string
          hotel_id: string
          id: string
          item_id: string
          qty_consumed_30d: number
          qty_consumed_7d: number
          qty_consumed_90d: number
          snapshot_date: string
          stock_days_remaining: number | null
          stock_on_date: number
          tenant_id: string
        }
        Insert: {
          avg_daily_consumption?: number
          created_at?: string
          hotel_id: string
          id?: string
          item_id: string
          qty_consumed_30d?: number
          qty_consumed_7d?: number
          qty_consumed_90d?: number
          snapshot_date?: string
          stock_days_remaining?: number | null
          stock_on_date?: number
          tenant_id: string
        }
        Update: {
          avg_daily_consumption?: number
          created_at?: string
          hotel_id?: string
          id?: string
          item_id?: string
          qty_consumed_30d?: number
          qty_consumed_7d?: number
          qty_consumed_90d?: number
          snapshot_date?: string
          stock_days_remaining?: number | null
          stock_on_date?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumption_snapshots_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          last_read_message_id: string | null
          left_at: string | null
          muted_until: string | null
          role: Database["public"]["Enums"]["conversation_member_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          last_read_message_id?: string | null
          left_at?: string | null
          muted_until?: string | null
          role?: Database["public"]["Enums"]["conversation_member_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          last_read_message_id?: string | null
          left_at?: string | null
          muted_until?: string | null
          role?: Database["public"]["Enums"]["conversation_member_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "v_user_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          direct_key: string | null
          hotel_id: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          last_sender_id: string | null
          name: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["conversation_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          direct_key?: string | null
          hotel_id: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_sender_id?: string | null
          name?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["conversation_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          direct_key?: string | null
          hotel_id?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          last_sender_id?: string | null
          name?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["conversation_type"]
          updated_at?: string
        }
        Relationships: []
      }
      custom_field_values: {
        Row: {
          entity_id: string
          entity_type: string
          tenant_id: string
          updated_at: string | null
          values: Json
        }
        Insert: {
          entity_id: string
          entity_type: string
          tenant_id: string
          updated_at?: string | null
          values?: Json
        }
        Update: {
          entity_id?: string
          entity_type?: string
          tenant_id?: string
          updated_at?: string | null
          values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_fields: {
        Row: {
          created_at: string | null
          default_value: string | null
          description: string | null
          display_order: number | null
          entity_type: string
          field_name: string
          field_type: string
          id: string
          label: string
          max_length: number | null
          max_value: number | null
          min_length: number | null
          min_value: number | null
          options: Json | null
          required: boolean | null
          show_in_filters: boolean | null
          show_in_list: boolean | null
          status: string | null
          tenant_id: string
          updated_at: string | null
          validation_rule: string | null
        }
        Insert: {
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          display_order?: number | null
          entity_type: string
          field_name: string
          field_type: string
          id?: string
          label: string
          max_length?: number | null
          max_value?: number | null
          min_length?: number | null
          min_value?: number | null
          options?: Json | null
          required?: boolean | null
          show_in_filters?: boolean | null
          show_in_list?: boolean | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          validation_rule?: string | null
        }
        Update: {
          created_at?: string | null
          default_value?: string | null
          description?: string | null
          display_order?: number | null
          entity_type?: string
          field_name?: string
          field_type?: string
          id?: string
          label?: string
          max_length?: number | null
          max_value?: number | null
          min_length?: number | null
          min_value?: number | null
          options?: Json | null
          required?: boolean | null
          show_in_filters?: boolean | null
          show_in_list?: boolean | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          validation_rule?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_order_batches: {
        Row: {
          batch_number: number
          created_at: string | null
          distribution_order_id: string
          handed_over_at: string | null
          handed_over_by: string | null
          id: string
          received_at: string | null
          received_by: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          batch_number: number
          created_at?: string | null
          distribution_order_id: string
          handed_over_at?: string | null
          handed_over_by?: string | null
          id?: string
          received_at?: string | null
          received_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          batch_number?: number
          created_at?: string | null
          distribution_order_id?: string
          handed_over_at?: string | null
          handed_over_by?: string | null
          id?: string
          received_at?: string | null
          received_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distribution_order_batches_distribution_order_id_fkey"
            columns: ["distribution_order_id"]
            isOneToOne: false
            referencedRelation: "distribution_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_batches_handed_over_by_fkey"
            columns: ["handed_over_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_batches_handed_over_by_fkey"
            columns: ["handed_over_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_batches_handed_over_by_fkey"
            columns: ["handed_over_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "distribution_order_batches_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_batches_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_batches_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      distribution_order_items: {
        Row: {
          created_at: string | null
          distribution_order_room_id: string
          id: string
          item_id: string
          notes: string | null
          quantity: number
          quantity_actual: number | null
          quantity_confirmed: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          distribution_order_room_id: string
          id?: string
          item_id: string
          notes?: string | null
          quantity?: number
          quantity_actual?: number | null
          quantity_confirmed?: number | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          distribution_order_room_id?: string
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          quantity_actual?: number | null
          quantity_confirmed?: number | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distribution_order_items_distribution_order_room_id_fkey"
            columns: ["distribution_order_room_id"]
            isOneToOne: false
            referencedRelation: "distribution_order_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_order_rooms: {
        Row: {
          batch_number: number | null
          booking_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          delivered_at: string | null
          delivered_by: string | null
          distribution_order_id: string
          exception_reason: string | null
          exception_type: string | null
          handover_at: string | null
          handover_to_order_id: string | null
          id: string
          notes: string | null
          rejection_reason: string | null
          returned_at: string | null
          room_id: string
          status: string
          stop_status: string | null
          updated_at: string | null
        }
        Insert: {
          batch_number?: number | null
          booking_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          distribution_order_id: string
          exception_reason?: string | null
          exception_type?: string | null
          handover_at?: string | null
          handover_to_order_id?: string | null
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          returned_at?: string | null
          room_id: string
          status?: string
          stop_status?: string | null
          updated_at?: string | null
        }
        Update: {
          batch_number?: number | null
          booking_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          distribution_order_id?: string
          exception_reason?: string | null
          exception_type?: string | null
          handover_at?: string | null
          handover_to_order_id?: string | null
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          returned_at?: string | null
          room_id?: string
          status?: string
          stop_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distribution_order_rooms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "room_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_rooms_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_rooms_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_rooms_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_rooms_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "distribution_order_rooms_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_rooms_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_rooms_delivered_by_fkey"
            columns: ["delivered_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "distribution_order_rooms_distribution_order_id_fkey"
            columns: ["distribution_order_id"]
            isOneToOne: false
            referencedRelation: "distribution_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_rooms_handover_to_order_id_fkey"
            columns: ["handover_to_order_id"]
            isOneToOne: false
            referencedRelation: "distribution_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_order_rooms_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_orders: {
        Row: {
          assigned_to: string | null
          batch_size: number | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          floor: number | null
          hotel_id: string
          id: string
          notes: string | null
          order_code: string
          received_at: string | null
          received_by: string | null
          released_at: string | null
          released_by: string | null
          rooms_completed: number | null
          shift_code: string | null
          shift_date: string | null
          started_at: string | null
          status: string
          supplement_request_id: string | null
          tenant_id: string
          total_items: number | null
          total_rooms: number | null
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          batch_size?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          floor?: number | null
          hotel_id: string
          id?: string
          notes?: string | null
          order_code: string
          received_at?: string | null
          received_by?: string | null
          released_at?: string | null
          released_by?: string | null
          rooms_completed?: number | null
          shift_code?: string | null
          shift_date?: string | null
          started_at?: string | null
          status?: string
          supplement_request_id?: string | null
          tenant_id: string
          total_items?: number | null
          total_rooms?: number | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          batch_size?: number | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          floor?: number | null
          hotel_id?: string
          id?: string
          notes?: string | null
          order_code?: string
          received_at?: string | null
          received_by?: string | null
          released_at?: string | null
          released_by?: string | null
          rooms_completed?: number | null
          shift_code?: string | null
          shift_date?: string | null
          started_at?: string | null
          status?: string
          supplement_request_id?: string | null
          tenant_id?: string
          total_items?: number | null
          total_rooms?: number | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distribution_orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "distribution_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "distribution_orders_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "distribution_orders_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_orders_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_orders_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_orders_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "distribution_orders_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_orders_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_orders_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "distribution_orders_supplement_request_id_fkey"
            columns: ["supplement_request_id"]
            isOneToOne: false
            referencedRelation: "supplement_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "distribution_orders_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "inventory_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_scan_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          document_type: string
          id: string
          image_url: string | null
          scanned_data: Json | null
          status: string
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          document_type?: string
          id?: string
          image_url?: string | null
          scanned_data?: Json | null
          status?: string
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          document_type?: string
          id?: string
          image_url?: string | null
          scanned_data?: Json | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_scan_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_scan_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_scan_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "document_scan_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          clicked_at: string | null
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          metadata: Json | null
          opened_at: string | null
          recipient_email: string
          recipient_name: string | null
          retry_count: number | null
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
          template_name: string | null
          tenant_id: string
        }
        Insert: {
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          recipient_email: string
          recipient_name?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
          template_name?: string | null
          tenant_id: string
        }
        Update: {
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          recipient_email?: string
          recipient_name?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          template_name?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_notifications: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          metadata: Json | null
          notification_type: string
          retry_count: number | null
          sent_at: string | null
          status: string | null
          subject: string
          tenant_id: string | null
          to_email: string
          user_id: string | null
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json | null
          notification_type: string
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          subject: string
          tenant_id?: string | null
          to_email: string
          user_id?: string | null
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json | null
          notification_type?: string
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          tenant_id?: string | null
          to_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          attachments: Json | null
          available_variables: Json | null
          bcc: Json | null
          category: string
          cc: Json | null
          code: string
          created_at: string | null
          description: string | null
          from_email: string | null
          from_name: string | null
          html_body: string
          id: string
          is_system: boolean | null
          last_edited_at: string | null
          last_edited_by: string | null
          name: string
          reply_to: string | null
          status: string | null
          subject: string
          tenant_id: string
          text_body: string | null
          updated_at: string | null
        }
        Insert: {
          attachments?: Json | null
          available_variables?: Json | null
          bcc?: Json | null
          category: string
          cc?: Json | null
          code: string
          created_at?: string | null
          description?: string | null
          from_email?: string | null
          from_name?: string | null
          html_body: string
          id?: string
          is_system?: boolean | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          name: string
          reply_to?: string | null
          status?: string | null
          subject: string
          tenant_id: string
          text_body?: string | null
          updated_at?: string | null
        }
        Update: {
          attachments?: Json | null
          available_variables?: Json | null
          bcc?: Json | null
          category?: string
          cc?: Json | null
          code?: string
          created_at?: string | null
          description?: string | null
          from_email?: string | null
          from_name?: string | null
          html_body?: string
          id?: string
          is_system?: boolean | null
          last_edited_at?: string | null
          last_edited_by?: string | null
          name?: string
          reply_to?: string | null
          status?: string | null
          subject?: string
          tenant_id?: string
          text_body?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      financial_targets: {
        Row: {
          created_at: string
          created_by: string | null
          hotel_id: string | null
          id: string
          metric: string
          notes: string | null
          period_month: string
          target_value: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hotel_id?: string | null
          id?: string
          metric: string
          notes?: string | null
          period_month: string
          target_value: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hotel_id?: string | null
          id?: string
          metric?: string
          notes?: string | null
          period_month?: string
          target_value?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "financial_targets_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "financial_targets_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_targets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_invoices: {
        Row: {
          accountant_email: string | null
          amount_paid: number
          booking_id: string | null
          check_in_date: string | null
          check_out_date: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          deposit_amount: number
          einvoice_issued_at: string | null
          einvoice_pdf_path: string | null
          einvoice_provider: string | null
          email_sent_at: string | null
          guest_address: string | null
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          guest_tax_code: string | null
          hotel_id: string
          id: string
          invoice_number: string
          invoice_type: string
          issued_at: string | null
          line_items: Json
          notes: string | null
          payment_method: string | null
          room_number: string | null
          service_fee_amount: number
          service_fee_rate: number
          status: string
          subtotal: number
          tenant_id: string
          total_amount: number
          updated_at: string
          vat_amount: number
          vat_claim_status: string
          vat_rate: number
        }
        Insert: {
          accountant_email?: string | null
          amount_paid?: number
          booking_id?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number
          einvoice_issued_at?: string | null
          einvoice_pdf_path?: string | null
          einvoice_provider?: string | null
          email_sent_at?: string | null
          guest_address?: string | null
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          guest_tax_code?: string | null
          hotel_id: string
          id?: string
          invoice_number: string
          invoice_type?: string
          issued_at?: string | null
          line_items?: Json
          notes?: string | null
          payment_method?: string | null
          room_number?: string | null
          service_fee_amount?: number
          service_fee_rate?: number
          status?: string
          subtotal?: number
          tenant_id: string
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_claim_status?: string
          vat_rate?: number
        }
        Update: {
          accountant_email?: string | null
          amount_paid?: number
          booking_id?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          deposit_amount?: number
          einvoice_issued_at?: string | null
          einvoice_pdf_path?: string | null
          einvoice_provider?: string | null
          email_sent_at?: string | null
          guest_address?: string | null
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          guest_tax_code?: string | null
          hotel_id?: string
          id?: string
          invoice_number?: string
          invoice_type?: string
          issued_at?: string | null
          line_items?: Json
          notes?: string | null
          payment_method?: string | null
          room_number?: string | null
          service_fee_amount?: number
          service_fee_rate?: number
          status?: string
          subtotal?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_claim_status?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "guest_invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "room_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "guest_invoices_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "guest_invoices_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_stay_registrations: {
        Row: {
          acked_at: string | null
          attempt_count: number
          booking_id: string | null
          check_in_at: string
          check_out_at: string | null
          created_at: string
          external_ref: string | null
          guest_id: string
          hotel_id: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          payload: Json | null
          purpose: string | null
          response: Json | null
          room_number: string
          status: string
          submitted_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          acked_at?: string | null
          attempt_count?: number
          booking_id?: string | null
          check_in_at: string
          check_out_at?: string | null
          created_at?: string
          external_ref?: string | null
          guest_id: string
          hotel_id: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          purpose?: string | null
          response?: Json | null
          room_number: string
          status?: string
          submitted_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          acked_at?: string | null
          attempt_count?: number
          booking_id?: string | null
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          external_ref?: string | null
          guest_id?: string
          hotel_id?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          purpose?: string | null
          response?: Json | null
          room_number?: string
          status?: string
          submitted_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_stay_registrations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "room_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_stay_registrations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_stay_registrations_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_stay_registrations_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "guest_stay_registrations_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_stay_registrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          address: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          entry_date: string | null
          entry_port: string | null
          ethnicity: string | null
          full_name: string
          gender: string | null
          id: string
          id_expiry_date: string | null
          id_image_url: string | null
          id_issue_date: string | null
          id_issue_place: string | null
          id_number: string | null
          id_type: string | null
          last_stay_date: string | null
          nationality: string | null
          notes: string | null
          occupation: string | null
          permanent_address: string | null
          phone: string | null
          religion: string | null
          tenant_id: string
          total_spent: number
          total_stays: number
          updated_at: string
          vip_level: string
          visa_expiry: string | null
          visa_number: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          entry_date?: string | null
          entry_port?: string | null
          ethnicity?: string | null
          full_name: string
          gender?: string | null
          id?: string
          id_expiry_date?: string | null
          id_image_url?: string | null
          id_issue_date?: string | null
          id_issue_place?: string | null
          id_number?: string | null
          id_type?: string | null
          last_stay_date?: string | null
          nationality?: string | null
          notes?: string | null
          occupation?: string | null
          permanent_address?: string | null
          phone?: string | null
          religion?: string | null
          tenant_id: string
          total_spent?: number
          total_stays?: number
          updated_at?: string
          vip_level?: string
          visa_expiry?: string | null
          visa_number?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          entry_date?: string | null
          entry_port?: string | null
          ethnicity?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          id_expiry_date?: string | null
          id_image_url?: string | null
          id_issue_date?: string | null
          id_issue_place?: string | null
          id_number?: string | null
          id_type?: string | null
          last_stay_date?: string | null
          nationality?: string | null
          notes?: string | null
          occupation?: string | null
          permanent_address?: string | null
          phone?: string | null
          religion?: string | null
          tenant_id?: string
          total_spent?: number
          total_stays?: number
          updated_at?: string
          vip_level?: string
          visa_expiry?: string | null
          visa_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_einvoice_configs: {
        Row: {
          api_base_url: string
          api_password_secret_ref: string | null
          api_username: string
          auto_issue: boolean
          branch_code: string | null
          cached_token: string | null
          cached_token_expires_at: string | null
          created_at: string
          created_by: string | null
          default_invoice_series: string | null
          default_template_code: string | null
          environment: Database["public"]["Enums"]["einvoice_environment"]
          extra_config: Json
          hotel_id: string
          id: string
          is_active: boolean
          last_test_at: string | null
          last_test_message: string | null
          last_test_ok: boolean | null
          provider: Database["public"]["Enums"]["einvoice_provider"]
          sign_type: Database["public"]["Enums"]["einvoice_sign_type"]
          supplier_address: string | null
          supplier_legal_name: string | null
          tax_code: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_base_url?: string
          api_password_secret_ref?: string | null
          api_username: string
          auto_issue?: boolean
          branch_code?: string | null
          cached_token?: string | null
          cached_token_expires_at?: string | null
          created_at?: string
          created_by?: string | null
          default_invoice_series?: string | null
          default_template_code?: string | null
          environment?: Database["public"]["Enums"]["einvoice_environment"]
          extra_config?: Json
          hotel_id: string
          id?: string
          is_active?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          provider?: Database["public"]["Enums"]["einvoice_provider"]
          sign_type?: Database["public"]["Enums"]["einvoice_sign_type"]
          supplier_address?: string | null
          supplier_legal_name?: string | null
          tax_code: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_base_url?: string
          api_password_secret_ref?: string | null
          api_username?: string
          auto_issue?: boolean
          branch_code?: string | null
          cached_token?: string | null
          cached_token_expires_at?: string | null
          created_at?: string
          created_by?: string | null
          default_invoice_series?: string | null
          default_template_code?: string | null
          environment?: Database["public"]["Enums"]["einvoice_environment"]
          extra_config?: Json
          hotel_id?: string
          id?: string
          is_active?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          provider?: Database["public"]["Enums"]["einvoice_provider"]
          sign_type?: Database["public"]["Enums"]["einvoice_sign_type"]
          supplier_address?: string | null
          supplier_legal_name?: string | null
          tax_code?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      hotel_fixed_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          hotel_id: string
          id: string
          label: string | null
          month: string
          note: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          hotel_id: string
          id?: string
          label?: string | null
          month: string
          note?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          hotel_id?: string
          id?: string
          label?: string | null
          month?: string
          note?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_fixed_expenses_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "hotel_fixed_expenses_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_invoices: {
        Row: {
          adjustment_reason: string | null
          adjustment_type: number | null
          buyer: Json
          config_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount_amount: number
          error_code: string | null
          error_message: string | null
          exchange_rate: number
          hotel_id: string
          id: string
          invoice_no: string | null
          invoice_series: string | null
          invoice_type: Database["public"]["Enums"]["einvoice_invoice_type"]
          issued_at: string | null
          last_polled_at: string | null
          line_items: Json
          original_invoice_no: string | null
          original_transaction_uuid: string | null
          parent_invoice_id: string | null
          poll_attempts: number
          provider: Database["public"]["Enums"]["einvoice_provider"]
          provider_request: Json | null
          provider_response: Json | null
          reservation_code: string | null
          source_id: string | null
          source_table: string | null
          status: Database["public"]["Enums"]["einvoice_status"]
          subtotal: number
          template_code: string | null
          template_id: string | null
          tenant_id: string
          total_amount: number
          transaction_uuid: string
          updated_at: string
          vat_amount: number
          viettel_status: string | null
        }
        Insert: {
          adjustment_reason?: string | null
          adjustment_type?: number | null
          buyer?: Json
          config_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          error_code?: string | null
          error_message?: string | null
          exchange_rate?: number
          hotel_id: string
          id?: string
          invoice_no?: string | null
          invoice_series?: string | null
          invoice_type?: Database["public"]["Enums"]["einvoice_invoice_type"]
          issued_at?: string | null
          last_polled_at?: string | null
          line_items?: Json
          original_invoice_no?: string | null
          original_transaction_uuid?: string | null
          parent_invoice_id?: string | null
          poll_attempts?: number
          provider?: Database["public"]["Enums"]["einvoice_provider"]
          provider_request?: Json | null
          provider_response?: Json | null
          reservation_code?: string | null
          source_id?: string | null
          source_table?: string | null
          status?: Database["public"]["Enums"]["einvoice_status"]
          subtotal?: number
          template_code?: string | null
          template_id?: string | null
          tenant_id: string
          total_amount?: number
          transaction_uuid: string
          updated_at?: string
          vat_amount?: number
          viettel_status?: string | null
        }
        Update: {
          adjustment_reason?: string | null
          adjustment_type?: number | null
          buyer?: Json
          config_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          error_code?: string | null
          error_message?: string | null
          exchange_rate?: number
          hotel_id?: string
          id?: string
          invoice_no?: string | null
          invoice_series?: string | null
          invoice_type?: Database["public"]["Enums"]["einvoice_invoice_type"]
          issued_at?: string | null
          last_polled_at?: string | null
          line_items?: Json
          original_invoice_no?: string | null
          original_transaction_uuid?: string | null
          parent_invoice_id?: string | null
          poll_attempts?: number
          provider?: Database["public"]["Enums"]["einvoice_provider"]
          provider_request?: Json | null
          provider_response?: Json | null
          reservation_code?: string | null
          source_id?: string | null
          source_table?: string | null
          status?: Database["public"]["Enums"]["einvoice_status"]
          subtotal?: number
          template_code?: string | null
          template_id?: string | null
          tenant_id?: string
          total_amount?: number
          transaction_uuid?: string
          updated_at?: string
          vat_amount?: number
          viettel_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_invoices_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "hotel_einvoice_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "hotel_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_invoices_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_policy: {
        Row: {
          created_at: string
          description: string | null
          hotel_id: string
          id: string
          is_active: boolean
          policy_key: string
          policy_value: Json
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          hotel_id: string
          id?: string
          is_active?: boolean
          policy_key: string
          policy_value: Json
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          hotel_id?: string
          id?: string
          is_active?: boolean
          policy_key?: string
          policy_value?: Json
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hotel_policy_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "hotel_policy_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_policy_history: {
        Row: {
          change_reason: string | null
          changed_at: string
          changed_by: string | null
          changed_role: string | null
          hotel_id: string
          id: string
          new_value: Json | null
          new_version: number | null
          old_value: Json | null
          old_version: number | null
          policy_id: string | null
          policy_key: string
          tenant_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_role?: string | null
          hotel_id: string
          id?: string
          new_value?: Json | null
          new_version?: number | null
          old_value?: Json | null
          old_version?: number | null
          policy_id?: string | null
          policy_key: string
          tenant_id: string
        }
        Update: {
          change_reason?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_role?: string | null
          hotel_id?: string
          id?: string
          new_value?: Json | null
          new_version?: number | null
          old_value?: Json | null
          old_version?: number | null
          policy_id?: string | null
          policy_key?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hotel_policy_history_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "hotel_policy"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_services: {
        Row: {
          category: Database["public"]["Enums"]["service_category"]
          created_at: string | null
          description: string | null
          hotel_id: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          name_en: string | null
          price: number
          sort_order: number | null
          tenant_id: string
          unit: string
          updated_at: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["service_category"]
          created_at?: string | null
          description?: string | null
          hotel_id: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_en?: string | null
          price?: number
          sort_order?: number | null
          tenant_id: string
          unit?: string
          updated_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["service_category"]
          created_at?: string | null
          description?: string | null
          hotel_id?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_en?: string | null
          price?: number
          sort_order?: number | null
          tenant_id?: string
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotel_services_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "hotel_services_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotel_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hotel_settings: {
        Row: {
          created_at: string
          early_checkin_5_9_pct: number | null
          early_checkin_9_14_pct: number | null
          early_checkin_before5_pct: number | null
          hotel_id: string
          id: string
          late_checkout_12_15_pct: number | null
          late_checkout_15_18_pct: number | null
          late_checkout_after18_pct: number | null
          monthly_discounts: Json | null
          service_fee_rate: number | null
          tenant_id: string
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          created_at?: string
          early_checkin_5_9_pct?: number | null
          early_checkin_9_14_pct?: number | null
          early_checkin_before5_pct?: number | null
          hotel_id: string
          id?: string
          late_checkout_12_15_pct?: number | null
          late_checkout_15_18_pct?: number | null
          late_checkout_after18_pct?: number | null
          monthly_discounts?: Json | null
          service_fee_rate?: number | null
          tenant_id: string
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          created_at?: string
          early_checkin_5_9_pct?: number | null
          early_checkin_9_14_pct?: number | null
          early_checkin_before5_pct?: number | null
          hotel_id?: string
          id?: string
          late_checkout_12_15_pct?: number | null
          late_checkout_15_18_pct?: number | null
          late_checkout_after18_pct?: number | null
          monthly_discounts?: Json | null
          service_fee_rate?: number | null
          tenant_id?: string
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: []
      }
      hotels: {
        Row: {
          address: string | null
          city: string | null
          code: string
          country: string
          created_at: string | null
          description: string | null
          email: string | null
          id: string
          inactive_at: string | null
          inactive_reason: string | null
          logo_url: string | null
          manager_email: string | null
          manager_id: string | null
          manager_name: string | null
          name: string
          phone: string | null
          photo_evidence_mode: Database["public"]["Enums"]["photo_evidence_mode"]
          postal_code: string | null
          qc_mode: Database["public"]["Enums"]["hk_qc_mode"]
          settings: Json | null
          state: string | null
          status: string | null
          tbltkbtt_config: Json
          tenant_id: string
          total_floors: number | null
          total_rooms: number | null
          type: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          country?: string
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          inactive_at?: string | null
          inactive_reason?: string | null
          logo_url?: string | null
          manager_email?: string | null
          manager_id?: string | null
          manager_name?: string | null
          name: string
          phone?: string | null
          photo_evidence_mode?: Database["public"]["Enums"]["photo_evidence_mode"]
          postal_code?: string | null
          qc_mode?: Database["public"]["Enums"]["hk_qc_mode"]
          settings?: Json | null
          state?: string | null
          status?: string | null
          tbltkbtt_config?: Json
          tenant_id: string
          total_floors?: number | null
          total_rooms?: number | null
          type?: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          country?: string
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          inactive_at?: string | null
          inactive_reason?: string | null
          logo_url?: string | null
          manager_email?: string | null
          manager_id?: string | null
          manager_name?: string | null
          name?: string
          phone?: string | null
          photo_evidence_mode?: Database["public"]["Enums"]["photo_evidence_mode"]
          postal_code?: string | null
          qc_mode?: Database["public"]["Enums"]["hk_qc_mode"]
          settings?: Json | null
          state?: string | null
          status?: string | null
          tbltkbtt_config?: Json
          tenant_id?: string
          total_floors?: number | null
          total_rooms?: number | null
          type?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotels_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotels_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotels_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hotels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      housekeeping_tasks: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          awaiting_review_at: string | null
          booking_id: string | null
          cancelled_at: string | null
          checkout_inspection_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          distribution_order_room_id: string | null
          due_at: string | null
          hotel_id: string
          id: string
          notes: string | null
          priority: string
          qc_due_at: string | null
          qc_required: boolean
          qc_status: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_by: string | null
          rework_count: number
          room_check_id: string | null
          room_id: string
          started_at: string | null
          status: string
          task_type: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          awaiting_review_at?: string | null
          booking_id?: string | null
          cancelled_at?: string | null
          checkout_inspection_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          distribution_order_room_id?: string | null
          due_at?: string | null
          hotel_id: string
          id?: string
          notes?: string | null
          priority?: string
          qc_due_at?: string | null
          qc_required?: boolean
          qc_status?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          rework_count?: number
          room_check_id?: string | null
          room_id: string
          started_at?: string | null
          status?: string
          task_type?: string
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          awaiting_review_at?: string | null
          booking_id?: string | null
          cancelled_at?: string | null
          checkout_inspection_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          distribution_order_room_id?: string | null
          due_at?: string | null
          hotel_id?: string
          id?: string
          notes?: string | null
          priority?: string
          qc_due_at?: string | null
          qc_required?: boolean
          qc_status?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          rework_count?: number
          room_check_id?: string | null
          room_id?: string
          started_at?: string | null
          status?: string
          task_type?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_tasks_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "room_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "v_overdue_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_checkout_inspection_id_fkey"
            columns: ["checkout_inspection_id"]
            isOneToOne: false
            referencedRelation: "checkout_inspection_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_distribution_order_room_id_fkey"
            columns: ["distribution_order_room_id"]
            isOneToOne: false
            referencedRelation: "distribution_order_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_room_check_id_fkey"
            columns: ["room_check_id"]
            isOneToOne: false
            referencedRelation: "room_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_export_history: {
        Row: {
          completed_at: string | null
          created_at: string | null
          data_type: string
          duration_seconds: number | null
          error_message: string | null
          failed_count: number | null
          file_name: string | null
          filters: Json | null
          format: string | null
          id: string
          output_file_url: string | null
          skipped_count: number | null
          source_file_url: string | null
          started_at: string | null
          status: string
          success_count: number | null
          tenant_id: string
          total_rows: number | null
          type: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          data_type: string
          duration_seconds?: number | null
          error_message?: string | null
          failed_count?: number | null
          file_name?: string | null
          filters?: Json | null
          format?: string | null
          id?: string
          output_file_url?: string | null
          skipped_count?: number | null
          source_file_url?: string | null
          started_at?: string | null
          status?: string
          success_count?: number | null
          tenant_id: string
          total_rows?: number | null
          type: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          data_type?: string
          duration_seconds?: number | null
          error_message?: string | null
          failed_count?: number | null
          file_name?: string | null
          filters?: Json | null
          format?: string | null
          id?: string
          output_file_url?: string | null
          skipped_count?: number | null
          source_file_url?: string | null
          started_at?: string | null
          status?: string
          success_count?: number | null
          tenant_id?: string
          total_rows?: number | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_export_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_export_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_export_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_export_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      in_app_notifications: {
        Row: {
          action_url: string | null
          body: string
          created_at: string | null
          icon: string | null
          id: string
          is_read: boolean | null
          metadata: Json | null
          read_at: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body: string
          created_at?: string | null
          icon?: string | null
          id?: string
          is_read?: boolean | null
          metadata?: Json | null
          read_at?: string | null
          tenant_id: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string
          created_at?: string | null
          icon?: string | null
          id?: string
          is_read?: boolean | null
          metadata?: Json | null
          read_at?: string | null
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "in_app_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "in_app_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "in_app_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          approved_by: string | null
          created_at: string | null
          created_by: string
          documents: string[] | null
          from_location: string | null
          from_warehouse_id: string | null
          hotel_id: string
          id: string
          idempotency_key_hash: string | null
          idempotency_key_raw: string | null
          item_id: string
          notes: string | null
          photos: string[] | null
          quantity: number
          quantity_after: number
          quantity_before: number
          reference_id: string | null
          reference_type: string | null
          related_id: string | null
          related_type: string | null
          status: string | null
          tenant_id: string
          to_location: string | null
          to_warehouse_id: string | null
          total_value: number | null
          transaction_category: string | null
          transaction_code: string
          transaction_date: string | null
          transaction_type: string
          unit_price: number | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          created_by: string
          documents?: string[] | null
          from_location?: string | null
          from_warehouse_id?: string | null
          hotel_id: string
          id?: string
          idempotency_key_hash?: string | null
          idempotency_key_raw?: string | null
          item_id: string
          notes?: string | null
          photos?: string[] | null
          quantity: number
          quantity_after: number
          quantity_before: number
          reference_id?: string | null
          reference_type?: string | null
          related_id?: string | null
          related_type?: string | null
          status?: string | null
          tenant_id: string
          to_location?: string | null
          to_warehouse_id?: string | null
          total_value?: number | null
          transaction_category?: string | null
          transaction_code: string
          transaction_date?: string | null
          transaction_type: string
          unit_price?: number | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          created_by?: string
          documents?: string[] | null
          from_location?: string | null
          from_warehouse_id?: string | null
          hotel_id?: string
          id?: string
          idempotency_key_hash?: string | null
          idempotency_key_raw?: string | null
          item_id?: string
          notes?: string | null
          photos?: string[] | null
          quantity?: number
          quantity_after?: number
          quantity_before?: number
          reference_id?: string | null
          reference_type?: string | null
          related_id?: string | null
          related_type?: string | null
          status?: string | null
          tenant_id?: string
          to_location?: string | null
          to_warehouse_id?: string | null
          total_value?: number | null
          transaction_category?: string | null
          transaction_code?: string
          transaction_date?: string | null
          transaction_type?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventory_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventory_transactions_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "inventory_transactions_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      investigation_logs: {
        Row: {
          action: string
          adjustment_id: string | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          new_status: string | null
          notes: string | null
          performed_at: string
          performed_by: string
          performed_by_name: string | null
          previous_status: string | null
          reason_code: string | null
          resolution_type: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          adjustment_id?: string | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          performed_at?: string
          performed_by: string
          performed_by_name?: string | null
          previous_status?: string | null
          reason_code?: string | null
          resolution_type?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          adjustment_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          performed_at?: string
          performed_by?: string
          performed_by_name?: string | null
          previous_status?: string | null
          reason_code?: string | null
          resolution_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investigation_logs_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "stock_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investigation_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investigation_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investigation_logs_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "investigation_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_api_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint: string
          error_message: string | null
          hotel_id: string | null
          id: string
          invoice_id: string | null
          method: string
          provider: Database["public"]["Enums"]["einvoice_provider"]
          request_body: Json | null
          response_body: Json | null
          status_code: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          error_message?: string | null
          hotel_id?: string | null
          id?: string
          invoice_id?: string | null
          method: string
          provider: Database["public"]["Enums"]["einvoice_provider"]
          request_body?: Json | null
          response_body?: Json | null
          status_code?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          error_message?: string | null
          hotel_id?: string | null
          id?: string
          invoice_id?: string | null
          method?: string
          provider?: Database["public"]["Enums"]["einvoice_provider"]
          request_body?: Json | null
          response_body?: Json | null
          status_code?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_api_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "hotel_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_files: {
        Row: {
          checksum: string | null
          created_at: string
          file_size: number | null
          file_type: Database["public"]["Enums"]["einvoice_file_type"]
          hotel_id: string
          id: string
          invoice_id: string
          mime_type: string | null
          storage_bucket: string
          storage_path: string
          tenant_id: string
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          file_size?: number | null
          file_type: Database["public"]["Enums"]["einvoice_file_type"]
          hotel_id: string
          id?: string
          invoice_id: string
          mime_type?: string | null
          storage_bucket?: string
          storage_path: string
          tenant_id: string
        }
        Update: {
          checksum?: string | null
          created_at?: string
          file_size?: number | null
          file_type?: Database["public"]["Enums"]["einvoice_file_type"]
          hotel_id?: string
          id?: string
          invoice_id?: string
          mime_type?: string | null
          storage_bucket?: string
          storage_path?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_files_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "hotel_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_templates: {
        Row: {
          created_at: string
          extra: Json
          hotel_id: string
          id: string
          invoice_series: string
          is_active: boolean
          is_default: boolean
          provider: Database["public"]["Enums"]["einvoice_provider"]
          template_code: string
          template_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          extra?: Json
          hotel_id: string
          id?: string
          invoice_series: string
          is_active?: boolean
          is_default?: boolean
          provider?: Database["public"]["Enums"]["einvoice_provider"]
          template_code: string
          template_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          extra?: Json
          hotel_id?: string
          id?: string
          invoice_series?: string
          is_active?: boolean
          is_default?: boolean
          provider?: Database["public"]["Enums"]["einvoice_provider"]
          template_code?: string
          template_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_vat_claims: {
        Row: {
          claim_token: string
          claimed_at: string | null
          company_address: string | null
          company_name: string | null
          created_at: string
          einvoice_lookup_code: string | null
          einvoice_pdf_path: string | null
          email: string | null
          expires_at: string
          hotel_id: string | null
          id: string
          invoice_id: string
          issued_at: string | null
          notes: string | null
          status: string
          tax_code: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          claim_token: string
          claimed_at?: string | null
          company_address?: string | null
          company_name?: string | null
          created_at?: string
          einvoice_lookup_code?: string | null
          einvoice_pdf_path?: string | null
          email?: string | null
          expires_at?: string
          hotel_id?: string | null
          id?: string
          invoice_id: string
          issued_at?: string | null
          notes?: string | null
          status?: string
          tax_code?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          claim_token?: string
          claimed_at?: string | null
          company_address?: string | null
          company_name?: string | null
          created_at?: string
          einvoice_lookup_code?: string | null
          einvoice_pdf_path?: string | null
          email?: string | null
          expires_at?: string
          hotel_id?: string | null
          id?: string
          invoice_id?: string
          issued_at?: string | null
          notes?: string | null
          status?: string
          tax_code?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_vat_claims_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "guest_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string | null
          created_by: string | null
          discount_amount: number
          due_date: string
          id: string
          invoice_date: string
          invoice_number: string
          items: Json | null
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          subscription_plan_id: string | null
          subtotal: number
          tax_amount: number
          tenant_id: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          discount_amount?: number
          due_date: string
          id?: string
          invoice_date?: string
          invoice_number: string
          items?: Json | null
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          subscription_plan_id?: string | null
          subtotal?: number
          tax_amount?: number
          tenant_id: string
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          discount_amount?: number
          due_date?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          items?: Json | null
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          subscription_plan_id?: string | null
          subtotal?: number
          tax_amount?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invoices_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_categories: {
        Row: {
          code: string | null
          color: string | null
          created_at: string | null
          default_item_type: string | null
          depreciable: boolean | null
          depreciation_rate: number | null
          description: string | null
          hotel_id: string | null
          icon: string | null
          id: string
          is_launderable: boolean | null
          level: number | null
          max_stock_level: number | null
          min_stock_level: number | null
          name: string
          name_en: string | null
          parent_id: string | null
          preferred_vendor_id: string | null
          reorder_point: number | null
          require_inspection: boolean | null
          sort_order: number | null
          status: string | null
          tenant_id: string
          track_serial_numbers: boolean | null
          updated_at: string | null
          useful_life_months: number | null
        }
        Insert: {
          code?: string | null
          color?: string | null
          created_at?: string | null
          default_item_type?: string | null
          depreciable?: boolean | null
          depreciation_rate?: number | null
          description?: string | null
          hotel_id?: string | null
          icon?: string | null
          id?: string
          is_launderable?: boolean | null
          level?: number | null
          max_stock_level?: number | null
          min_stock_level?: number | null
          name: string
          name_en?: string | null
          parent_id?: string | null
          preferred_vendor_id?: string | null
          reorder_point?: number | null
          require_inspection?: boolean | null
          sort_order?: number | null
          status?: string | null
          tenant_id: string
          track_serial_numbers?: boolean | null
          updated_at?: string | null
          useful_life_months?: number | null
        }
        Update: {
          code?: string | null
          color?: string | null
          created_at?: string | null
          default_item_type?: string | null
          depreciable?: boolean | null
          depreciation_rate?: number | null
          description?: string | null
          hotel_id?: string | null
          icon?: string | null
          id?: string
          is_launderable?: boolean | null
          level?: number | null
          max_stock_level?: number | null
          min_stock_level?: number | null
          name?: string
          name_en?: string | null
          parent_id?: string | null
          preferred_vendor_id?: string | null
          reorder_point?: number | null
          require_inspection?: boolean | null
          sort_order?: number | null
          status?: string | null
          tenant_id?: string
          track_serial_numbers?: boolean | null
          updated_at?: string | null
          useful_life_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_categories_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "item_categories_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_categories_preferred_vendor_id_fkey"
            columns: ["preferred_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_images: {
        Row: {
          created_at: string | null
          created_by: string | null
          display_order: number | null
          file_name: string | null
          file_size: number | null
          id: string
          is_primary: boolean | null
          item_id: string
          mime_type: string | null
          tenant_id: string
          url: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          is_primary?: boolean | null
          item_id: string
          mime_type?: string | null
          tenant_id: string
          url: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          is_primary?: boolean | null
          item_id?: string
          mime_type?: string | null
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_images_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_images_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_images_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "item_images_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_images_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_units: {
        Row: {
          base_unit_id: string | null
          code: string
          conversion_factor: number | null
          created_at: string | null
          id: string
          name: string
          status: string | null
          symbol: string | null
          tenant_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          base_unit_id?: string | null
          code: string
          conversion_factor?: number | null
          created_at?: string | null
          id?: string
          name: string
          status?: string | null
          symbol?: string | null
          tenant_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          base_unit_id?: string | null
          code?: string
          conversion_factor?: number | null
          created_at?: string | null
          id?: string
          name?: string
          status?: string | null
          symbol?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_units_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "item_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          asset_group: Database["public"]["Enums"]["asset_group"] | null
          auto_reorder_enabled: boolean
          brand: string | null
          category_id: string | null
          charge_price: number | null
          code: string
          created_at: string | null
          current_wash_cycles: number | null
          description: string | null
          expected_lifetime_days: number | null
          hotel_id: string
          id: string
          is_chargeable: boolean | null
          is_complimentary: boolean | null
          is_perishable: boolean | null
          item_type: Database["public"]["Enums"]["item_type"]
          last_outbound_at: string | null
          lead_time_days: number | null
          max_wash_cycles: number | null
          migration_review_reason: string | null
          migration_review_required: boolean
          minimum_stock: number | null
          model: string | null
          name: string
          name_en: string | null
          preferred_vendor_id: string | null
          qr_code: string | null
          quantity_damaged: number | null
          quantity_in_laundry: number | null
          quantity_in_stock: number | null
          quantity_in_use: number | null
          quantity_lost: number | null
          quantity_pending: number | null
          quantity_total: number | null
          reorder_max_qty: number | null
          reorder_point: number | null
          safety_factor: number
          specifications: Json | null
          status: string | null
          tenant_id: string
          unit: string
          unit_price: number | null
          updated_at: string | null
        }
        Insert: {
          asset_group?: Database["public"]["Enums"]["asset_group"] | null
          auto_reorder_enabled?: boolean
          brand?: string | null
          category_id?: string | null
          charge_price?: number | null
          code: string
          created_at?: string | null
          current_wash_cycles?: number | null
          description?: string | null
          expected_lifetime_days?: number | null
          hotel_id: string
          id?: string
          is_chargeable?: boolean | null
          is_complimentary?: boolean | null
          is_perishable?: boolean | null
          item_type?: Database["public"]["Enums"]["item_type"]
          last_outbound_at?: string | null
          lead_time_days?: number | null
          max_wash_cycles?: number | null
          migration_review_reason?: string | null
          migration_review_required?: boolean
          minimum_stock?: number | null
          model?: string | null
          name: string
          name_en?: string | null
          preferred_vendor_id?: string | null
          qr_code?: string | null
          quantity_damaged?: number | null
          quantity_in_laundry?: number | null
          quantity_in_stock?: number | null
          quantity_in_use?: number | null
          quantity_lost?: number | null
          quantity_pending?: number | null
          quantity_total?: number | null
          reorder_max_qty?: number | null
          reorder_point?: number | null
          safety_factor?: number
          specifications?: Json | null
          status?: string | null
          tenant_id: string
          unit?: string
          unit_price?: number | null
          updated_at?: string | null
        }
        Update: {
          asset_group?: Database["public"]["Enums"]["asset_group"] | null
          auto_reorder_enabled?: boolean
          brand?: string | null
          category_id?: string | null
          charge_price?: number | null
          code?: string
          created_at?: string | null
          current_wash_cycles?: number | null
          description?: string | null
          expected_lifetime_days?: number | null
          hotel_id?: string
          id?: string
          is_chargeable?: boolean | null
          is_complimentary?: boolean | null
          is_perishable?: boolean | null
          item_type?: Database["public"]["Enums"]["item_type"]
          last_outbound_at?: string | null
          lead_time_days?: number | null
          max_wash_cycles?: number | null
          migration_review_reason?: string | null
          migration_review_required?: boolean
          minimum_stock?: number | null
          model?: string | null
          name?: string
          name_en?: string | null
          preferred_vendor_id?: string | null
          qr_code?: string | null
          quantity_damaged?: number | null
          quantity_in_laundry?: number | null
          quantity_in_stock?: number | null
          quantity_in_use?: number | null
          quantity_lost?: number | null
          quantity_pending?: number | null
          quantity_total?: number | null
          reorder_max_qty?: number | null
          reorder_point?: number | null
          safety_factor?: number
          specifications?: Json | null
          status?: string | null
          tenant_id?: string
          unit?: string
          unit_price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "items_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_preferred_vendor_id_fkey"
            columns: ["preferred_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_batch_audit: {
        Row: {
          batch_id: string
          created_at: string
          details: Json | null
          from_status: string | null
          hotel_id: string
          id: string
          performed_by: string | null
          reason: string | null
          tenant_id: string
          to_status: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          details?: Json | null
          from_status?: string | null
          hotel_id: string
          id?: string
          performed_by?: string | null
          reason?: string | null
          tenant_id: string
          to_status: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          details?: Json | null
          from_status?: string | null
          hotel_id?: string
          id?: string
          performed_by?: string | null
          reason?: string | null
          tenant_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "laundry_batch_audit_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "laundry_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_batch_items: {
        Row: {
          batch_id: string
          condition_note: string | null
          created_at: string | null
          id: string
          item_id: string
          quantity_damaged: number | null
          quantity_delivered: number
          quantity_lost: number | null
          quantity_returned: number | null
          return_condition: string | null
          weight_kg: number | null
        }
        Insert: {
          batch_id: string
          condition_note?: string | null
          created_at?: string | null
          id?: string
          item_id: string
          quantity_damaged?: number | null
          quantity_delivered: number
          quantity_lost?: number | null
          quantity_returned?: number | null
          return_condition?: string | null
          weight_kg?: number | null
        }
        Update: {
          batch_id?: string
          condition_note?: string | null
          created_at?: string | null
          id?: string
          item_id?: string
          quantity_damaged?: number | null
          quantity_delivered?: number
          quantity_lost?: number | null
          quantity_returned?: number | null
          return_condition?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "laundry_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "laundry_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_batch_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_batches: {
        Row: {
          actual_cost: number | null
          actual_return_date: string | null
          batch_code: string
          compensation_amount: number | null
          compensation_settled_at: string | null
          compensation_settled_by: string | null
          created_at: string | null
          delivery_date: string | null
          delivery_person_name: string | null
          delivery_photos: string[] | null
          delivery_staff_id: string | null
          estimated_cost: number | null
          expected_return_date: string | null
          hotel_id: string
          id: string
          items_damaged: number | null
          items_lost: number | null
          notes: string | null
          partially_received_at: string | null
          policy_snapshot: Json | null
          quality_rating: number | null
          receiver_name: string | null
          return_notes: string | null
          return_photos: string[] | null
          return_staff_id: string | null
          status: string | null
          tenant_id: string
          timeliness_rating: number | null
          total_items: number
          total_weight_kg: number
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          actual_cost?: number | null
          actual_return_date?: string | null
          batch_code: string
          compensation_amount?: number | null
          compensation_settled_at?: string | null
          compensation_settled_by?: string | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_person_name?: string | null
          delivery_photos?: string[] | null
          delivery_staff_id?: string | null
          estimated_cost?: number | null
          expected_return_date?: string | null
          hotel_id: string
          id?: string
          items_damaged?: number | null
          items_lost?: number | null
          notes?: string | null
          partially_received_at?: string | null
          policy_snapshot?: Json | null
          quality_rating?: number | null
          receiver_name?: string | null
          return_notes?: string | null
          return_photos?: string[] | null
          return_staff_id?: string | null
          status?: string | null
          tenant_id: string
          timeliness_rating?: number | null
          total_items: number
          total_weight_kg?: number
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          actual_cost?: number | null
          actual_return_date?: string | null
          batch_code?: string
          compensation_amount?: number | null
          compensation_settled_at?: string | null
          compensation_settled_by?: string | null
          created_at?: string | null
          delivery_date?: string | null
          delivery_person_name?: string | null
          delivery_photos?: string[] | null
          delivery_staff_id?: string | null
          estimated_cost?: number | null
          expected_return_date?: string | null
          hotel_id?: string
          id?: string
          items_damaged?: number | null
          items_lost?: number | null
          notes?: string | null
          partially_received_at?: string | null
          policy_snapshot?: Json | null
          quality_rating?: number | null
          receiver_name?: string | null
          return_notes?: string | null
          return_photos?: string[] | null
          return_staff_id?: string | null
          status?: string | null
          tenant_id?: string
          timeliness_rating?: number | null
          total_items?: number
          total_weight_kg?: number
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laundry_batches_delivery_staff_id_fkey"
            columns: ["delivery_staff_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_batches_delivery_staff_id_fkey"
            columns: ["delivery_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_batches_delivery_staff_id_fkey"
            columns: ["delivery_staff_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "laundry_batches_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "laundry_batches_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_batches_return_staff_id_fkey"
            columns: ["return_staff_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_batches_return_staff_id_fkey"
            columns: ["return_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_batches_return_staff_id_fkey"
            columns: ["return_staff_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "laundry_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_batches_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "laundry_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_categories: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          display_order: number | null
          express_surcharge: number | null
          express_turnaround_hours: number | null
          id: string
          name: string
          price_per_item: number | null
          price_per_kg: number | null
          require_count_verification: boolean | null
          require_weight_verification: boolean | null
          standard_turnaround_hours: number | null
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          express_surcharge?: number | null
          express_turnaround_hours?: number | null
          id?: string
          name: string
          price_per_item?: number | null
          price_per_kg?: number | null
          require_count_verification?: boolean | null
          require_weight_verification?: boolean | null
          standard_turnaround_hours?: number | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          express_surcharge?: number | null
          express_turnaround_hours?: number | null
          id?: string
          name?: string
          price_per_item?: number | null
          price_per_kg?: number | null
          require_count_verification?: boolean | null
          require_weight_verification?: boolean | null
          standard_turnaround_hours?: number | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laundry_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_requests: {
        Row: {
          added_at: string | null
          created_at: string
          hotel_id: string
          id: string
          items: Json
          laundry_batch_id: string | null
          notes: string | null
          request_code: string
          requested_by: string | null
          room_check_id: string | null
          room_id: string
          status: string
          tenant_id: string
          total_quantity: number
          updated_at: string
        }
        Insert: {
          added_at?: string | null
          created_at?: string
          hotel_id: string
          id?: string
          items?: Json
          laundry_batch_id?: string | null
          notes?: string | null
          request_code: string
          requested_by?: string | null
          room_check_id?: string | null
          room_id: string
          status?: string
          tenant_id: string
          total_quantity?: number
          updated_at?: string
        }
        Update: {
          added_at?: string | null
          created_at?: string
          hotel_id?: string
          id?: string
          items?: Json
          laundry_batch_id?: string | null
          notes?: string | null
          request_code?: string
          requested_by?: string | null
          room_check_id?: string | null
          room_id?: string
          status?: string
          tenant_id?: string
          total_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "laundry_requests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "laundry_requests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_requests_laundry_batch_id_fkey"
            columns: ["laundry_batch_id"]
            isOneToOne: false
            referencedRelation: "laundry_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "laundry_requests_room_check_id_fkey"
            columns: ["room_check_id"]
            isOneToOne: false
            referencedRelation: "room_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laundry_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      laundry_vendors: {
        Row: {
          address: string | null
          code: string
          contact_person: string | null
          contract_info: Json | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          rating: number | null
          status: string | null
          tenant_id: string
          total_orders: number | null
          total_value: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          code: string
          contact_person?: string | null
          contract_info?: Json | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          status?: string | null
          tenant_id: string
          total_orders?: number | null
          total_value?: number | null
          type: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          code?: string
          contact_person?: string | null
          contract_info?: Json | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          status?: string | null
          tenant_id?: string
          total_orders?: number | null
          total_value?: number | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laundry_vendors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_found_items: {
        Row: {
          category: string
          claimed_by_name: string | null
          claimed_by_phone: string | null
          claimed_date: string | null
          created_at: string
          description: string | null
          found_by: string | null
          found_date: string
          found_location: string | null
          hotel_id: string
          id: string
          item_code: string | null
          item_name: string
          notes: string | null
          photo_urls: Json
          room_id: string | null
          status: string
          storage_location: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category?: string
          claimed_by_name?: string | null
          claimed_by_phone?: string | null
          claimed_date?: string | null
          created_at?: string
          description?: string | null
          found_by?: string | null
          found_date?: string
          found_location?: string | null
          hotel_id: string
          id?: string
          item_code?: string | null
          item_name: string
          notes?: string | null
          photo_urls?: Json
          room_id?: string | null
          status?: string
          storage_location?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          claimed_by_name?: string | null
          claimed_by_phone?: string | null
          claimed_date?: string | null
          created_at?: string
          description?: string | null
          found_by?: string | null
          found_date?: string
          found_location?: string | null
          hotel_id?: string
          id?: string
          item_code?: string | null
          item_name?: string
          notes?: string | null
          photo_urls?: Json
          room_id?: string | null
          status?: string
          storage_location?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lost_found_items_found_by_fkey"
            columns: ["found_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_found_items_found_by_fkey"
            columns: ["found_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_found_items_found_by_fkey"
            columns: ["found_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lost_found_items_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "lost_found_items_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_found_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_found_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_categories: {
        Row: {
          checklist_items: string[] | null
          code: string
          color: string | null
          created_at: string | null
          default_assignee_id: string | null
          default_priority: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          name: string
          require_approval: boolean | null
          require_photos: boolean | null
          sla_hours: number | null
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          checklist_items?: string[] | null
          code: string
          color?: string | null
          created_at?: string | null
          default_assignee_id?: string | null
          default_priority?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          name: string
          require_approval?: boolean | null
          require_photos?: boolean | null
          sla_hours?: number | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          checklist_items?: string[] | null
          code?: string
          color?: string | null
          created_at?: string | null
          default_assignee_id?: string | null
          default_priority?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          name?: string
          require_approval?: boolean | null
          require_photos?: boolean | null
          sla_hours?: number | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_categories_default_assignee_id_fkey"
            columns: ["default_assignee_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_categories_default_assignee_id_fkey"
            columns: ["default_assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_categories_default_assignee_id_fkey"
            columns: ["default_assignee_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "maintenance_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          accepted_at: string | null
          actual_cost: number | null
          assigned_to: string | null
          completed_at: string | null
          completion_notes: string | null
          completion_photos: string[] | null
          created_at: string | null
          description: string
          documents: string[] | null
          estimated_cost: number | null
          expected_completion_date: string | null
          hotel_id: string
          id: string
          issue_type: string
          item_id: string | null
          location: string
          notes: string | null
          parts_used: string[] | null
          photos: string[] | null
          priority: string | null
          reported_at: string | null
          reported_by: string
          request_code: string
          room_id: string | null
          solution: string | null
          started_at: string | null
          status: string | null
          tenant_id: string
          title: string
          under_warranty: boolean | null
          updated_at: string | null
          warranty_info: string | null
        }
        Insert: {
          accepted_at?: string | null
          actual_cost?: number | null
          assigned_to?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          completion_photos?: string[] | null
          created_at?: string | null
          description: string
          documents?: string[] | null
          estimated_cost?: number | null
          expected_completion_date?: string | null
          hotel_id: string
          id?: string
          issue_type: string
          item_id?: string | null
          location: string
          notes?: string | null
          parts_used?: string[] | null
          photos?: string[] | null
          priority?: string | null
          reported_at?: string | null
          reported_by: string
          request_code: string
          room_id?: string | null
          solution?: string | null
          started_at?: string | null
          status?: string | null
          tenant_id: string
          title: string
          under_warranty?: boolean | null
          updated_at?: string | null
          warranty_info?: string | null
        }
        Update: {
          accepted_at?: string | null
          actual_cost?: number | null
          assigned_to?: string | null
          completed_at?: string | null
          completion_notes?: string | null
          completion_photos?: string[] | null
          created_at?: string | null
          description?: string
          documents?: string[] | null
          estimated_cost?: number | null
          expected_completion_date?: string | null
          hotel_id?: string
          id?: string
          issue_type?: string
          item_id?: string | null
          location?: string
          notes?: string | null
          parts_used?: string[] | null
          photos?: string[] | null
          priority?: string | null
          reported_at?: string | null
          reported_by?: string
          request_code?: string
          room_id?: string | null
          solution?: string | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string
          title?: string
          under_warranty?: boolean | null
          updated_at?: string | null
          warranty_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "maintenance_requests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "maintenance_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          banner_text: string | null
          campaign_type: string
          clicks: number | null
          conversions: number | null
          created_at: string | null
          created_by: string | null
          cta_link: string | null
          cta_text: string | null
          description: string | null
          email_subject: string | null
          email_template: string | null
          emails_opened: number | null
          emails_sent: number | null
          ends_at: string | null
          id: string
          name: string
          promotional_code_id: string | null
          starts_at: string
          status: string | null
          target_audience: string | null
          target_plan_codes: string[] | null
          updated_at: string | null
        }
        Insert: {
          banner_text?: string | null
          campaign_type: string
          clicks?: number | null
          conversions?: number | null
          created_at?: string | null
          created_by?: string | null
          cta_link?: string | null
          cta_text?: string | null
          description?: string | null
          email_subject?: string | null
          email_template?: string | null
          emails_opened?: number | null
          emails_sent?: number | null
          ends_at?: string | null
          id?: string
          name: string
          promotional_code_id?: string | null
          starts_at: string
          status?: string | null
          target_audience?: string | null
          target_plan_codes?: string[] | null
          updated_at?: string | null
        }
        Update: {
          banner_text?: string | null
          campaign_type?: string
          clicks?: number | null
          conversions?: number | null
          created_at?: string | null
          created_by?: string | null
          cta_link?: string | null
          cta_text?: string | null
          description?: string | null
          email_subject?: string | null
          email_template?: string | null
          emails_opened?: number | null
          emails_sent?: number | null
          ends_at?: string | null
          id?: string
          name?: string
          promotional_code_id?: string | null
          starts_at?: string
          status?: string | null
          target_audience?: string | null
          target_plan_codes?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "marketing_campaigns_promotional_code_id_fkey"
            columns: ["promotional_code_id"]
            isOneToOne: false
            referencedRelation: "promotional_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          conversation_id: string
          created_at: string
          file_name: string | null
          height: number | null
          id: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          tenant_id: string
          width: number | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          file_name?: string | null
          height?: number | null
          id?: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          tenant_id: string
          width?: number | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          file_name?: string | null
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          tenant_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          conversation_id: string
          created_at: string
          emoji: string
          message_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          emoji: string
          message_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          emoji?: string
          message_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          conversation_id: string
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          client_msg_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          mentioned_user_ids: string[]
          parent_message_id: string | null
          sender_id: string
          tenant_id: string
        }
        Insert: {
          body?: string | null
          client_msg_id?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          mentioned_user_ids?: string[]
          parent_message_id?: string | null
          sender_id: string
          tenant_id: string
        }
        Update: {
          body?: string | null
          client_msg_id?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          mentioned_user_ids?: string[]
          parent_message_id?: string | null
          sender_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "v_user_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_targets: {
        Row: {
          created_at: string
          hotel_id: string
          id: string
          month: string
          occupancy_target: number | null
          revenue_target: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hotel_id: string
          id?: string
          month: string
          occupancy_target?: number | null
          revenue_target?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hotel_id?: string
          id?: string
          month?: string
          occupancy_target?: number | null
          revenue_target?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_targets_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "monthly_targets_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          critical_stock_threshold: number | null
          daily_report_time: string | null
          email_critical_stock: boolean
          email_daily_report: boolean | null
          email_dead_stock_digest: boolean
          email_laundry_completed: boolean | null
          email_low_stock: boolean | null
          email_maintenance_new: boolean | null
          email_po_approved: boolean | null
          email_weekly_report: boolean | null
          id: string
          inapp_approval_request: boolean | null
          inapp_booking_events: boolean
          inapp_laundry_completed: boolean | null
          inapp_laundry_delayed: boolean
          inapp_low_stock: boolean | null
          inapp_maintenance_new: boolean | null
          inapp_realtime: boolean | null
          inapp_task_assigned: boolean | null
          laundry_delay_hours: number | null
          low_stock_threshold: number | null
          overdue_maintenance_days: number | null
          push_enabled: boolean | null
          quiet_hours_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          tenant_id: string
          updated_at: string | null
          user_id: string
          weekly_report_day: number | null
        }
        Insert: {
          created_at?: string | null
          critical_stock_threshold?: number | null
          daily_report_time?: string | null
          email_critical_stock?: boolean
          email_daily_report?: boolean | null
          email_dead_stock_digest?: boolean
          email_laundry_completed?: boolean | null
          email_low_stock?: boolean | null
          email_maintenance_new?: boolean | null
          email_po_approved?: boolean | null
          email_weekly_report?: boolean | null
          id?: string
          inapp_approval_request?: boolean | null
          inapp_booking_events?: boolean
          inapp_laundry_completed?: boolean | null
          inapp_laundry_delayed?: boolean
          inapp_low_stock?: boolean | null
          inapp_maintenance_new?: boolean | null
          inapp_realtime?: boolean | null
          inapp_task_assigned?: boolean | null
          laundry_delay_hours?: number | null
          low_stock_threshold?: number | null
          overdue_maintenance_days?: number | null
          push_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          tenant_id: string
          updated_at?: string | null
          user_id: string
          weekly_report_day?: number | null
        }
        Update: {
          created_at?: string | null
          critical_stock_threshold?: number | null
          daily_report_time?: string | null
          email_critical_stock?: boolean
          email_daily_report?: boolean | null
          email_dead_stock_digest?: boolean
          email_laundry_completed?: boolean | null
          email_low_stock?: boolean | null
          email_maintenance_new?: boolean | null
          email_po_approved?: boolean | null
          email_weekly_report?: boolean | null
          id?: string
          inapp_approval_request?: boolean | null
          inapp_booking_events?: boolean
          inapp_laundry_completed?: boolean | null
          inapp_laundry_delayed?: boolean
          inapp_low_stock?: boolean | null
          inapp_maintenance_new?: boolean | null
          inapp_realtime?: boolean | null
          inapp_task_assigned?: boolean | null
          laundry_delay_hours?: number | null
          low_stock_threshold?: number | null
          overdue_maintenance_days?: number | null
          push_enabled?: boolean | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
          weekly_report_day?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          category: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_read: boolean | null
          message: string
          read_at: string | null
          related_id: string | null
          related_type: string | null
          role: string | null
          tenant_id: string
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          category: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          role?: string | null
          tenant_id: string
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          category?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          role?: string | null
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      password_reset_otps: {
        Row: {
          attempts: number
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_hash: string
          used: boolean
        }
        Insert: {
          attempts?: number
          created_at?: string
          email: string
          expires_at: string
          id?: string
          otp_hash: string
          used?: boolean
        }
        Update: {
          attempts?: number
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          used?: boolean
        }
        Relationships: []
      }
      payment_anomalies: {
        Row: {
          amount_diff: number | null
          anomaly_type: Database["public"]["Enums"]["payment_anomaly_type"]
          created_at: string
          expected_amount: number | null
          expected_invoice_number: string | null
          expected_payment_id: string | null
          id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          sepay_account: string | null
          sepay_amount: number
          sepay_content: string | null
          sepay_date: string | null
          sepay_reference: string | null
          sepay_tx_id: string
          status: Database["public"]["Enums"]["payment_anomaly_status"]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          amount_diff?: number | null
          anomaly_type: Database["public"]["Enums"]["payment_anomaly_type"]
          created_at?: string
          expected_amount?: number | null
          expected_invoice_number?: string | null
          expected_payment_id?: string | null
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sepay_account?: string | null
          sepay_amount: number
          sepay_content?: string | null
          sepay_date?: string | null
          sepay_reference?: string | null
          sepay_tx_id: string
          status?: Database["public"]["Enums"]["payment_anomaly_status"]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_diff?: number | null
          anomaly_type?: Database["public"]["Enums"]["payment_anomaly_type"]
          created_at?: string
          expected_amount?: number | null
          expected_invoice_number?: string | null
          expected_payment_id?: string | null
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sepay_account?: string | null
          sepay_amount?: number
          sepay_content?: string | null
          sepay_date?: string | null
          sepay_reference?: string | null
          sepay_tx_id?: string
          status?: Database["public"]["Enums"]["payment_anomaly_status"]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_anomalies_expected_payment_id_fkey"
            columns: ["expected_payment_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          billing_address: Json | null
          billing_email: string | null
          billing_name: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          created_at: string | null
          gateway: string
          gateway_payment_method_id: string
          id: string
          is_default: boolean | null
          is_verified: boolean | null
          tenant_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          billing_address?: Json | null
          billing_email?: string | null
          billing_name?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string | null
          gateway: string
          gateway_payment_method_id: string
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          tenant_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          billing_address?: Json | null
          billing_email?: string | null
          billing_name?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string | null
          gateway?: string
          gateway_payment_method_id?: string
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          tenant_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          billing_cycle: string | null
          created_at: string | null
          currency: string
          gateway_transaction_id: string | null
          id: string
          invoice_id: string | null
          metadata: Json | null
          notes: string | null
          payment_date: string | null
          payment_gateway: string | null
          payment_method: string | null
          payment_status: string
          plan_id: string | null
          tenant_id: string
          transaction_reference: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          billing_cycle?: string | null
          created_at?: string | null
          currency?: string
          gateway_transaction_id?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          notes?: string | null
          payment_date?: string | null
          payment_gateway?: string | null
          payment_method?: string | null
          payment_status?: string
          plan_id?: string | null
          tenant_id: string
          transaction_reference?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          billing_cycle?: string | null
          created_at?: string | null
          currency?: string
          gateway_transaction_id?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          notes?: string | null
          payment_date?: string | null
          payment_gateway?: string | null
          payment_method?: string | null
          payment_status?: string
          plan_id?: string | null
          tenant_id?: string
          transaction_reference?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payment_invoice"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_logs: {
        Row: {
          created_at: string | null
          error: string | null
          event_id: string | null
          event_type: string
          gateway: string
          id: string
          payload: Json
          processed: boolean | null
          processed_at: string | null
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          event_id?: string | null
          event_type: string
          gateway: string
          id?: string
          payload: Json
          processed?: boolean | null
          processed_at?: string | null
        }
        Update: {
          created_at?: string | null
          error?: string | null
          event_id?: string | null
          event_type?: string
          gateway?: string
          id?: string
          payload?: Json
          processed?: boolean | null
          processed_at?: string | null
        }
        Relationships: []
      }
      pending_group_links: {
        Row: {
          added_by: string
          chat_id: string | null
          created_at: string | null
          department: string | null
          expires_at: string | null
          group_type: string | null
          hotel_id: string | null
          id: string
          notification_types: string[] | null
          status: string | null
          telegram_user_id: string
          tenant_id: string
        }
        Insert: {
          added_by: string
          chat_id?: string | null
          created_at?: string | null
          department?: string | null
          expires_at?: string | null
          group_type?: string | null
          hotel_id?: string | null
          id?: string
          notification_types?: string[] | null
          status?: string | null
          telegram_user_id: string
          tenant_id: string
        }
        Update: {
          added_by?: string
          chat_id?: string | null
          created_at?: string | null
          department?: string | null
          expires_at?: string | null
          group_type?: string | null
          hotel_id?: string | null
          id?: string
          notification_types?: string[] | null
          status?: string | null
          telegram_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_group_links_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "pending_group_links_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_group_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          code: string
          created_at: string | null
          description: string | null
          id: string
          module: string
          name: string
          updated_at: string | null
        }
        Insert: {
          action: string
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          module: string
          name: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          module?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      plan_price_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_price_monthly: number | null
          new_price_yearly: number | null
          old_price_monthly: number | null
          old_price_yearly: number | null
          plan_id: string
          reason: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_price_monthly?: number | null
          new_price_yearly?: number | null
          old_price_monthly?: number | null
          old_price_yearly?: number | null
          plan_id: string
          reason?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_price_monthly?: number | null
          new_price_yearly?: number | null
          old_price_monthly?: number | null
          old_price_yearly?: number | null
          plan_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_price_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_price_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_price_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "plan_price_history_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      positions: {
        Row: {
          code: string
          created_at: string | null
          department: string | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          status: string | null
          tenant_id: string
          updated_at: string | null
          user_level_code: string
        }
        Insert: {
          code: string
          created_at?: string | null
          department?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          user_level_code: string
        }
        Update: {
          code?: string
          created_at?: string | null
          department?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          user_level_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code_usage: {
        Row: {
          discount_applied: number
          final_amount: number
          id: string
          original_amount: number
          payment_transaction_id: string | null
          promo_code_id: string
          tenant_id: string
          used_at: string | null
        }
        Insert: {
          discount_applied: number
          final_amount: number
          id?: string
          original_amount: number
          payment_transaction_id?: string | null
          promo_code_id: string
          tenant_id: string
          used_at?: string | null
        }
        Update: {
          discount_applied?: number
          final_amount?: number
          id?: string
          original_amount?: number
          payment_transaction_id?: string | null
          promo_code_id?: string
          tenant_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_usage_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_usage_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promotional_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promotional_codes: {
        Row: {
          applicable_billing_cycles: string[] | null
          applicable_plans: string[] | null
          code: string
          created_at: string | null
          created_by: string | null
          current_uses: number | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          max_uses: number | null
          max_uses_per_tenant: number | null
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          applicable_billing_cycles?: string[] | null
          applicable_plans?: string[] | null
          code: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          max_uses_per_tenant?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          applicable_billing_cycles?: string[] | null
          applicable_plans?: string[] | null
          code?: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          max_uses_per_tenant?: number | null
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotional_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotional_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotional_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          notes: string | null
          po_id: string
          quantity_ordered: number
          quantity_received: number | null
          total_price: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          notes?: string | null
          po_id: string
          quantity_ordered: number
          quantity_received?: number | null
          total_price?: number | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          po_id?: string
          quantity_ordered?: number
          quantity_received?: number | null
          total_price?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          actual_delivery_date: string | null
          approved_by: string | null
          created_at: string | null
          expected_delivery_date: string | null
          hotel_id: string
          id: string
          notes: string | null
          order_date: string
          po_code: string
          requested_by: string
          shipping_address: string | null
          shipping_fee: number | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          actual_delivery_date?: string | null
          approved_by?: string | null
          created_at?: string | null
          expected_delivery_date?: string | null
          hotel_id: string
          id?: string
          notes?: string | null
          order_date?: string
          po_code: string
          requested_by: string
          shipping_address?: string | null
          shipping_fee?: number | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          actual_delivery_date?: string | null
          approved_by?: string | null
          created_at?: string | null
          expected_delivery_date?: string | null
          hotel_id?: string
          id?: string
          notes?: string | null
          order_date?: string
          po_code?: string
          requested_by?: string
          shipping_address?: string | null
          shipping_fee?: number | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "purchase_orders_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "purchase_orders_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          device_name: string | null
          endpoint: string
          failed_count: number | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          p256dh_key: string
          tenant_id: string
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          device_name?: string | null
          endpoint: string
          failed_count?: number | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          p256dh_key: string
          tenant_id: string
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          device_name?: string | null
          endpoint?: string
          failed_count?: number | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          p256dh_key?: string
          tenant_id?: string
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      qc_reviews: {
        Row: {
          decision: string
          hotel_id: string
          id: string
          reason: string | null
          reject_categories: string[] | null
          reviewed_at: string
          reviewer_id: string
          rework_iteration: number
          room_check_id: string | null
          score_override: number | null
          task_id: string
          tenant_id: string
        }
        Insert: {
          decision: string
          hotel_id: string
          id?: string
          reason?: string | null
          reject_categories?: string[] | null
          reviewed_at?: string
          reviewer_id: string
          rework_iteration?: number
          room_check_id?: string | null
          score_override?: number | null
          task_id: string
          tenant_id: string
        }
        Update: {
          decision?: string
          hotel_id?: string
          id?: string
          reason?: string | null
          reject_categories?: string[] | null
          reviewed_at?: string
          reviewer_id?: string
          rework_iteration?: number
          room_check_id?: string | null
          score_override?: number | null
          task_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "qc_reviews_room_check_id_fkey"
            columns: ["room_check_id"]
            isOneToOne: false
            referencedRelation: "room_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "housekeeping_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_sla_settings: {
        Row: {
          auto_escalate: boolean
          created_at: string
          hotel_id: string | null
          id: string
          max_rework_count: number
          qc_required: boolean
          sla_minutes: number
          task_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_escalate?: boolean
          created_at?: string
          hotel_id?: string | null
          id?: string
          max_rework_count?: number
          qc_required?: boolean
          sla_minutes?: number
          task_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_escalate?: boolean
          created_at?: string
          hotel_id?: string | null
          id?: string
          max_rework_count?: number
          qc_required?: boolean
          sla_minutes?: number
          task_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_sla_settings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "qc_sla_settings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_sla_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket_key: string
          hit_at: string
          id: string
        }
        Insert: {
          bucket_key: string
          hit_at?: string
          id?: string
        }
        Update: {
          bucket_key?: string
          hit_at?: string
          id?: string
        }
        Relationships: []
      }
      rate_plan_daily_prices: {
        Row: {
          created_at: string
          date: string
          id: string
          is_closed: boolean
          price: number | null
          rate_plan_id: string
          sale_price: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_closed?: boolean
          price?: number | null
          rate_plan_id: string
          sale_price?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_closed?: boolean
          price?: number | null
          rate_plan_id?: string
          sale_price?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_plan_daily_prices_rate_plan_id_fkey"
            columns: ["rate_plan_id"]
            isOneToOne: false
            referencedRelation: "rate_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_plan_daily_prices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_plans: {
        Row: {
          created_at: string
          hotel_id: string | null
          id: string
          inclusions: string[]
          is_active: boolean
          is_default: boolean
          name: string
          policies: string[]
          price: number | null
          room_type_id: string
          sale_end_date: string | null
          sale_price: number | null
          sale_start_date: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hotel_id?: string | null
          id?: string
          inclusions?: string[]
          is_active?: boolean
          is_default?: boolean
          name: string
          policies?: string[]
          price?: number | null
          room_type_id: string
          sale_end_date?: string | null
          sale_price?: number | null
          sale_start_date?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hotel_id?: string | null
          id?: string
          inclusions?: string[]
          is_active?: boolean
          is_default?: boolean
          name?: string
          policies?: string[]
          price?: number | null
          room_type_id?: string
          sale_end_date?: string | null
          sale_price?: number | null
          sale_start_date?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_plans_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "rate_plans_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_plans_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rate_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_automation_rules: {
        Row: {
          action_template: string | null
          action_type: string
          conditions: Json | null
          created_at: string | null
          enabled: boolean
          id: string
          name: string
          trigger_type: string
          trigger_value: string
          updated_at: string | null
        }
        Insert: {
          action_template?: string | null
          action_type?: string
          conditions?: Json | null
          created_at?: string | null
          enabled?: boolean
          id?: string
          name: string
          trigger_type: string
          trigger_value: string
          updated_at?: string | null
        }
        Update: {
          action_template?: string | null
          action_type?: string
          conditions?: Json | null
          created_at?: string | null
          enabled?: boolean
          id?: string
          name?: string
          trigger_type?: string
          trigger_value?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      reminder_email_templates: {
        Row: {
          category: string
          content: string
          created_at: string | null
          id: string
          name: string
          status: string
          subject: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string | null
          id?: string
          name: string
          status?: string
          subject: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          id?: string
          name?: string
          status?: string
          subject?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      renewal_reminders: {
        Row: {
          created_at: string | null
          email_body: string | null
          email_subject: string | null
          error_message: string | null
          id: string
          reminder_type: string
          scheduled_for: string
          sent_at: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          email_body?: string | null
          email_subject?: string | null
          error_message?: string | null
          id?: string
          reminder_type: string
          scheduled_for: string
          sent_at?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          email_body?: string | null
          email_subject?: string | null
          error_message?: string | null
          id?: string
          reminder_type?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reorder_suggestions: {
        Row: {
          approved_by: string | null
          converted_po_id: string | null
          created_at: string
          created_by: string | null
          current_stock: number
          hotel_id: string
          id: string
          ignored_by: string | null
          ignored_reason: string | null
          ignored_until: string | null
          item_id: string
          metadata: Json | null
          on_order_qty: number
          reason: string
          status: string
          suggested_qty: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          converted_po_id?: string | null
          created_at?: string
          created_by?: string | null
          current_stock?: number
          hotel_id: string
          id?: string
          ignored_by?: string | null
          ignored_reason?: string | null
          ignored_until?: string | null
          item_id: string
          metadata?: Json | null
          on_order_qty?: number
          reason?: string
          status?: string
          suggested_qty: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          converted_po_id?: string | null
          created_at?: string
          created_by?: string | null
          current_stock?: number
          hotel_id?: string
          id?: string
          ignored_by?: string | null
          ignored_reason?: string | null
          ignored_until?: string | null
          item_id?: string
          metadata?: Json | null
          on_order_qty?: number
          reason?: string
          status?: string
          suggested_qty?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reorder_suggestions_converted_po_id_fkey"
            columns: ["converted_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reorder_suggestions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          hierarchy_level: number
          id: string
          is_system: boolean | null
          name: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          hierarchy_level?: number
          id?: string
          is_system?: boolean | null
          name: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          hierarchy_level?: number
          id?: string
          is_system?: boolean | null
          name?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      room_blocks: {
        Row: {
          block_type: string
          created_at: string
          created_by: string | null
          end_date: string
          hotel_id: string
          id: string
          reason: string | null
          room_id: string
          start_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          block_type?: string
          created_at?: string
          created_by?: string | null
          end_date: string
          hotel_id: string
          id?: string
          reason?: string | null
          room_id: string
          start_date: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          block_type?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          hotel_id?: string
          id?: string
          reason?: string | null
          room_id?: string
          start_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_blocks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_bookings: {
        Row: {
          actual_check_in: string | null
          actual_check_out: string | null
          amount_paid: number | null
          booking_group_id: string | null
          booking_hours: number | null
          booking_months: number | null
          booking_reference: string | null
          booking_source: string | null
          booking_type: string
          check_in_date: string
          check_out_date: string
          created_at: string | null
          created_by: string | null
          damage_charges: number | null
          damage_items: Json | null
          damage_notes: string | null
          deposit_amount: number | null
          early_checkin_charge: number | null
          expected_check_in_time: string | null
          expected_check_out_time: string | null
          extra_charges: number | null
          guest_address: string | null
          guest_count: number | null
          guest_date_of_birth: string | null
          guest_email: string | null
          guest_gender: string | null
          guest_id: string | null
          guest_id_image_url: string | null
          guest_id_number: string | null
          guest_id_type: string | null
          guest_name: string
          guest_nationality: string | null
          guest_phone: string | null
          hotel_id: string
          hourly_end_time: string | null
          hourly_rate: number | null
          hourly_start_time: string | null
          id: string
          late_checkout_charge: number | null
          monthly_rate: number | null
          net_revenue: number | null
          notes: string | null
          ota_commission_amount: number | null
          ota_commission_rate: number | null
          ota_paid_amount: number | null
          ota_payment_type: string | null
          overnight_end_time: string | null
          overnight_rate: number | null
          overnight_start_time: string | null
          paid_at: string | null
          payment_status: string | null
          price_breakdown: Json | null
          room_id: string
          room_price: number | null
          service_charges: number | null
          service_fee_amount: number | null
          service_fee_rate: number | null
          skipper_amount_loss: number | null
          skipper_amount_owed: number | null
          skipper_at: string | null
          skipper_marked_at: string | null
          skipper_marked_by: string | null
          skipper_note: string | null
          skipper_reason: string | null
          sleep_out_at: string | null
          sleep_out_note: string | null
          sleep_out_reason: string | null
          status: string
          subtotal: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          amount_paid?: number | null
          booking_group_id?: string | null
          booking_hours?: number | null
          booking_months?: number | null
          booking_reference?: string | null
          booking_source?: string | null
          booking_type?: string
          check_in_date: string
          check_out_date: string
          created_at?: string | null
          created_by?: string | null
          damage_charges?: number | null
          damage_items?: Json | null
          damage_notes?: string | null
          deposit_amount?: number | null
          early_checkin_charge?: number | null
          expected_check_in_time?: string | null
          expected_check_out_time?: string | null
          extra_charges?: number | null
          guest_address?: string | null
          guest_count?: number | null
          guest_date_of_birth?: string | null
          guest_email?: string | null
          guest_gender?: string | null
          guest_id?: string | null
          guest_id_image_url?: string | null
          guest_id_number?: string | null
          guest_id_type?: string | null
          guest_name: string
          guest_nationality?: string | null
          guest_phone?: string | null
          hotel_id: string
          hourly_end_time?: string | null
          hourly_rate?: number | null
          hourly_start_time?: string | null
          id?: string
          late_checkout_charge?: number | null
          monthly_rate?: number | null
          net_revenue?: number | null
          notes?: string | null
          ota_commission_amount?: number | null
          ota_commission_rate?: number | null
          ota_paid_amount?: number | null
          ota_payment_type?: string | null
          overnight_end_time?: string | null
          overnight_rate?: number | null
          overnight_start_time?: string | null
          paid_at?: string | null
          payment_status?: string | null
          price_breakdown?: Json | null
          room_id: string
          room_price?: number | null
          service_charges?: number | null
          service_fee_amount?: number | null
          service_fee_rate?: number | null
          skipper_amount_loss?: number | null
          skipper_amount_owed?: number | null
          skipper_at?: string | null
          skipper_marked_at?: string | null
          skipper_marked_by?: string | null
          skipper_note?: string | null
          skipper_reason?: string | null
          sleep_out_at?: string | null
          sleep_out_note?: string | null
          sleep_out_reason?: string | null
          status?: string
          subtotal?: number | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          amount_paid?: number | null
          booking_group_id?: string | null
          booking_hours?: number | null
          booking_months?: number | null
          booking_reference?: string | null
          booking_source?: string | null
          booking_type?: string
          check_in_date?: string
          check_out_date?: string
          created_at?: string | null
          created_by?: string | null
          damage_charges?: number | null
          damage_items?: Json | null
          damage_notes?: string | null
          deposit_amount?: number | null
          early_checkin_charge?: number | null
          expected_check_in_time?: string | null
          expected_check_out_time?: string | null
          extra_charges?: number | null
          guest_address?: string | null
          guest_count?: number | null
          guest_date_of_birth?: string | null
          guest_email?: string | null
          guest_gender?: string | null
          guest_id?: string | null
          guest_id_image_url?: string | null
          guest_id_number?: string | null
          guest_id_type?: string | null
          guest_name?: string
          guest_nationality?: string | null
          guest_phone?: string | null
          hotel_id?: string
          hourly_end_time?: string | null
          hourly_rate?: number | null
          hourly_start_time?: string | null
          id?: string
          late_checkout_charge?: number | null
          monthly_rate?: number | null
          net_revenue?: number | null
          notes?: string | null
          ota_commission_amount?: number | null
          ota_commission_rate?: number | null
          ota_paid_amount?: number | null
          ota_payment_type?: string | null
          overnight_end_time?: string | null
          overnight_rate?: number | null
          overnight_start_time?: string | null
          paid_at?: string | null
          payment_status?: string | null
          price_breakdown?: Json | null
          room_id?: string
          room_price?: number | null
          service_charges?: number | null
          service_fee_amount?: number | null
          service_fee_rate?: number | null
          skipper_amount_loss?: number | null
          skipper_amount_owed?: number | null
          skipper_at?: string | null
          skipper_marked_at?: string | null
          skipper_marked_by?: string | null
          skipper_note?: string | null
          skipper_reason?: string | null
          sleep_out_at?: string | null
          sleep_out_note?: string | null
          sleep_out_reason?: string | null
          status?: string
          subtotal?: number | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "room_bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "room_bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_skipper_marked_by_fkey"
            columns: ["skipper_marked_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_skipper_marked_by_fkey"
            columns: ["skipper_marked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_skipper_marked_by_fkey"
            columns: ["skipper_marked_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "room_bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      room_check_issue_outbox: {
        Row: {
          attempts: number
          created_at: string
          dead_letter_at: string | null
          dead_letter_reason: string | null
          hotel_id: string
          id: string
          idempotency_key_hash: string | null
          idempotency_key_raw: string | null
          issue_id: string
          job_kind: string
          last_error: string | null
          next_retry_at: string
          payload: Json | null
          processed_at: string | null
          result: Json | null
          retry_count: number
          room_check_id: string
          schema_version: number
          status: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dead_letter_at?: string | null
          dead_letter_reason?: string | null
          hotel_id: string
          id?: string
          idempotency_key_hash?: string | null
          idempotency_key_raw?: string | null
          issue_id: string
          job_kind: string
          last_error?: string | null
          next_retry_at?: string
          payload?: Json | null
          processed_at?: string | null
          result?: Json | null
          retry_count?: number
          room_check_id: string
          schema_version?: number
          status?: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dead_letter_at?: string | null
          dead_letter_reason?: string | null
          hotel_id?: string
          id?: string
          idempotency_key_hash?: string | null
          idempotency_key_raw?: string | null
          issue_id?: string
          job_kind?: string
          last_error?: string | null
          next_retry_at?: string
          payload?: Json | null
          processed_at?: string | null
          result?: Json | null
          retry_count?: number
          room_check_id?: string
          schema_version?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_check_issue_outbox_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "room_check_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      room_check_issue_reviews: {
        Row: {
          charge_id: string | null
          created_at: string
          decision: string
          hotel_id: string
          id: string
          issue_id: string
          reason: string | null
          reviewer_id: string
          tenant_id: string
        }
        Insert: {
          charge_id?: string | null
          created_at?: string
          decision: string
          hotel_id: string
          id?: string
          issue_id: string
          reason?: string | null
          reviewer_id: string
          tenant_id: string
        }
        Update: {
          charge_id?: string | null
          created_at?: string
          decision?: string
          hotel_id?: string
          id?: string
          issue_id?: string
          reason?: string | null
          reviewer_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_check_issue_reviews_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "room_check_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      room_check_issues: {
        Row: {
          asset_group: string | null
          bucket: string
          charge_status: Database["public"]["Enums"]["charge_status"]
          charge_to_guest: boolean | null
          client_issue_id: string | null
          created_at: string
          extra: Json | null
          hotel_id: string
          id: string
          issue_role: Database["public"]["Enums"]["issue_role"]
          item_id: string | null
          item_name: string | null
          item_type: string | null
          kind: string | null
          needs_review: boolean | null
          notes: string | null
          photos: string[] | null
          quality_issue: boolean
          quantity: number
          retire_reason: string | null
          review_decision: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          room_check_id: string
          room_id: string
          source: string | null
          source_issue_id: string | null
          sub_reason: string | null
          suspicious: boolean
          tenant_id: string
          ui_action: string | null
        }
        Insert: {
          asset_group?: string | null
          bucket: string
          charge_status?: Database["public"]["Enums"]["charge_status"]
          charge_to_guest?: boolean | null
          client_issue_id?: string | null
          created_at?: string
          extra?: Json | null
          hotel_id: string
          id?: string
          issue_role?: Database["public"]["Enums"]["issue_role"]
          item_id?: string | null
          item_name?: string | null
          item_type?: string | null
          kind?: string | null
          needs_review?: boolean | null
          notes?: string | null
          photos?: string[] | null
          quality_issue?: boolean
          quantity: number
          retire_reason?: string | null
          review_decision?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_check_id: string
          room_id: string
          source?: string | null
          source_issue_id?: string | null
          sub_reason?: string | null
          suspicious?: boolean
          tenant_id: string
          ui_action?: string | null
        }
        Update: {
          asset_group?: string | null
          bucket?: string
          charge_status?: Database["public"]["Enums"]["charge_status"]
          charge_to_guest?: boolean | null
          client_issue_id?: string | null
          created_at?: string
          extra?: Json | null
          hotel_id?: string
          id?: string
          issue_role?: Database["public"]["Enums"]["issue_role"]
          item_id?: string | null
          item_name?: string | null
          item_type?: string | null
          kind?: string | null
          needs_review?: boolean | null
          notes?: string | null
          photos?: string[] | null
          quality_issue?: boolean
          quantity?: number
          retire_reason?: string | null
          review_decision?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_check_id?: string
          room_id?: string
          source?: string | null
          source_issue_id?: string | null
          sub_reason?: string | null
          suspicious?: boolean
          tenant_id?: string
          ui_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_check_issues_room_check_id_fkey"
            columns: ["room_check_id"]
            isOneToOne: false
            referencedRelation: "room_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_check_issues_source_issue_id_fkey"
            columns: ["source_issue_id"]
            isOneToOne: false
            referencedRelation: "room_check_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      room_check_sessions: {
        Row: {
          check_type: string
          id: string
          room_id: string
          started_at: string
          tenant_id: string
          user_id: string
          user_name: string
        }
        Insert: {
          check_type: string
          id?: string
          room_id: string
          started_at?: string
          tenant_id: string
          user_id: string
          user_name: string
        }
        Update: {
          check_type?: string
          id?: string
          room_id?: string
          started_at?: string
          tenant_id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_check_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_check_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      room_checks: {
        Row: {
          check_mode: string | null
          check_type: string
          checked_at: string | null
          checked_by: string
          cleanliness_score: number | null
          hotel_id: string | null
          id: string
          items_complete: boolean | null
          items_consumed: Json | null
          items_damaged: Json | null
          items_lost: Json | null
          items_missing: Json | null
          items_replaced: Json | null
          items_sent_to_laundry: Json | null
          minibar_count: number
          notes: string | null
          photos: string[] | null
          qc_required: boolean
          qc_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          room_id: string
          score_override: number | null
          started_at: string | null
          status: string
          summary_issue_count: number
          summary_ok_count: number
          task_id: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          check_mode?: string | null
          check_type: string
          checked_at?: string | null
          checked_by: string
          cleanliness_score?: number | null
          hotel_id?: string | null
          id?: string
          items_complete?: boolean | null
          items_consumed?: Json | null
          items_damaged?: Json | null
          items_lost?: Json | null
          items_missing?: Json | null
          items_replaced?: Json | null
          items_sent_to_laundry?: Json | null
          minibar_count?: number
          notes?: string | null
          photos?: string[] | null
          qc_required?: boolean
          qc_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id: string
          score_override?: number | null
          started_at?: string | null
          status?: string
          summary_issue_count?: number
          summary_ok_count?: number
          task_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          check_mode?: string | null
          check_type?: string
          checked_at?: string | null
          checked_by?: string
          cleanliness_score?: number | null
          hotel_id?: string | null
          id?: string
          items_complete?: boolean | null
          items_consumed?: Json | null
          items_damaged?: Json | null
          items_lost?: Json | null
          items_missing?: Json | null
          items_replaced?: Json | null
          items_sent_to_laundry?: Json | null
          minibar_count?: number
          notes?: string | null
          photos?: string[] | null
          qc_required?: boolean
          qc_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string
          score_override?: number | null
          started_at?: string | null
          status?: string
          summary_issue_count?: number
          summary_ok_count?: number
          task_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_checks_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "room_checks_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_checks_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_checks_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "room_checks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_checks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "housekeeping_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      room_items: {
        Row: {
          assigned_at: string | null
          condition: string | null
          id: string
          is_verified: boolean | null
          item_id: string
          last_checked_at: string | null
          last_checked_by: string | null
          notes: string | null
          quantity: number
          room_id: string
          standard_quantity: number | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          assigned_at?: string | null
          condition?: string | null
          id?: string
          is_verified?: boolean | null
          item_id: string
          last_checked_at?: string | null
          last_checked_by?: string | null
          notes?: string | null
          quantity?: number
          room_id: string
          standard_quantity?: number | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          assigned_at?: string | null
          condition?: string | null
          id?: string
          is_verified?: boolean | null
          item_id?: string
          last_checked_at?: string | null
          last_checked_by?: string | null
          notes?: string | null
          quantity?: number
          room_id?: string
          standard_quantity?: number | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_items_last_checked_by_fkey"
            columns: ["last_checked_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_items_last_checked_by_fkey"
            columns: ["last_checked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_items_last_checked_by_fkey"
            columns: ["last_checked_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "room_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_pricing_rules: {
        Row: {
          created_at: string | null
          default_service_fee_rate: number | null
          default_vat_rate: number | null
          early_checkin_5_9: number | null
          early_checkin_9_14: number | null
          early_checkin_before_5: number | null
          high_season_surcharge: number | null
          hotel_id: string | null
          id: string
          late_checkout_12_15: number | null
          late_checkout_15_18: number | null
          late_checkout_after_18: number | null
          standard_checkin_time: string | null
          standard_checkout_time: string | null
          tenant_id: string
          updated_at: string | null
          weekend_surcharge: number | null
        }
        Insert: {
          created_at?: string | null
          default_service_fee_rate?: number | null
          default_vat_rate?: number | null
          early_checkin_5_9?: number | null
          early_checkin_9_14?: number | null
          early_checkin_before_5?: number | null
          high_season_surcharge?: number | null
          hotel_id?: string | null
          id?: string
          late_checkout_12_15?: number | null
          late_checkout_15_18?: number | null
          late_checkout_after_18?: number | null
          standard_checkin_time?: string | null
          standard_checkout_time?: string | null
          tenant_id: string
          updated_at?: string | null
          weekend_surcharge?: number | null
        }
        Update: {
          created_at?: string | null
          default_service_fee_rate?: number | null
          default_vat_rate?: number | null
          early_checkin_5_9?: number | null
          early_checkin_9_14?: number | null
          early_checkin_before_5?: number | null
          high_season_surcharge?: number | null
          hotel_id?: string | null
          id?: string
          late_checkout_12_15?: number | null
          late_checkout_15_18?: number | null
          late_checkout_after_18?: number | null
          standard_checkin_time?: string | null
          standard_checkout_time?: string | null
          tenant_id?: string
          updated_at?: string | null
          weekend_surcharge?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_pricing_rules_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "room_pricing_rules_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_pricing_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      room_type_availability: {
        Row: {
          available_qty: number
          created_at: string
          date: string
          hotel_id: string | null
          id: string
          is_closed: boolean
          room_type_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          available_qty?: number
          created_at?: string
          date: string
          hotel_id?: string | null
          id?: string
          is_closed?: boolean
          room_type_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          available_qty?: number
          created_at?: string
          date?: string
          hotel_id?: string | null
          id?: string
          is_closed?: boolean
          room_type_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_type_availability_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "room_type_availability_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_availability_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_availability_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      room_type_rates: {
        Row: {
          created_at: string
          daily_rate: number
          hotel_id: string | null
          hourly_first_block_hours: number | null
          hourly_first_block_price: number | null
          hourly_rate: number | null
          id: string
          monthly_rate: number | null
          overnight_end_time: string | null
          overnight_rate: number | null
          overnight_start_time: string | null
          room_type_id: string
          tenant_id: string
          updated_at: string
          weekday_multiplier: Json
        }
        Insert: {
          created_at?: string
          daily_rate?: number
          hotel_id?: string | null
          hourly_first_block_hours?: number | null
          hourly_first_block_price?: number | null
          hourly_rate?: number | null
          id?: string
          monthly_rate?: number | null
          overnight_end_time?: string | null
          overnight_rate?: number | null
          overnight_start_time?: string | null
          room_type_id: string
          tenant_id: string
          updated_at?: string
          weekday_multiplier?: Json
        }
        Update: {
          created_at?: string
          daily_rate?: number
          hotel_id?: string | null
          hourly_first_block_hours?: number | null
          hourly_first_block_price?: number | null
          hourly_rate?: number | null
          id?: string
          monthly_rate?: number | null
          overnight_end_time?: string | null
          overnight_rate?: number | null
          overnight_start_time?: string | null
          room_type_id?: string
          tenant_id?: string
          updated_at?: string
          weekday_multiplier?: Json
        }
        Relationships: [
          {
            foreignKeyName: "room_type_rates_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "room_type_rates_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_rates_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: true
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      room_type_standards: {
        Row: {
          created_at: string | null
          hotel_id: string
          id: string
          item_id: string
          quantity: number
          room_type: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          hotel_id: string
          id?: string
          item_id: string
          quantity?: number
          room_type: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          hotel_id?: string
          id?: string
          item_id?: string
          quantity?: number
          room_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_type_standards_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "room_type_standards_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_standards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_type_standards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types: {
        Row: {
          base_price: number | null
          bed_type: string | null
          beds_count: number | null
          code: string
          color: string | null
          created_at: string | null
          default_items: Json | null
          description: string | null
          display_order: number | null
          has_balcony: boolean | null
          has_bathtub: boolean | null
          has_kitchen: boolean | null
          hotel_id: string | null
          icon: string | null
          id: string
          max_guests: number | null
          name: string
          square_meters: number | null
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          base_price?: number | null
          bed_type?: string | null
          beds_count?: number | null
          code: string
          color?: string | null
          created_at?: string | null
          default_items?: Json | null
          description?: string | null
          display_order?: number | null
          has_balcony?: boolean | null
          has_bathtub?: boolean | null
          has_kitchen?: boolean | null
          hotel_id?: string | null
          icon?: string | null
          id?: string
          max_guests?: number | null
          name: string
          square_meters?: number | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          base_price?: number | null
          bed_type?: string | null
          beds_count?: number | null
          code?: string
          color?: string | null
          created_at?: string | null
          default_items?: Json | null
          description?: string | null
          display_order?: number | null
          has_balcony?: boolean | null
          has_bathtub?: boolean | null
          has_kitchen?: boolean | null
          hotel_id?: string | null
          icon?: string | null
          id?: string
          max_guests?: number | null
          name?: string
          square_meters?: number | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_types_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "room_types_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          amenities: string[] | null
          area_sqm: number | null
          base_price: number | null
          bed_type: string | null
          created_at: string | null
          dnd_reason: string | null
          dnd_until: string | null
          floor: number
          has_balcony: boolean | null
          has_window: boolean | null
          hotel_id: string
          hourly_price: number | null
          id: string
          last_deep_clean_at: string | null
          last_status_changed_at: string | null
          last_status_changed_by: string | null
          legacy_status: string | null
          max_guests: number | null
          max_hours: number | null
          min_hours: number | null
          monthly_price: number | null
          notes: string | null
          oos_reason: string | null
          oos_until: string | null
          room_number: string
          room_type: string
          smoking_allowed: boolean | null
          status: string | null
          tenant_id: string
          updated_at: string | null
          view_type: string | null
        }
        Insert: {
          amenities?: string[] | null
          area_sqm?: number | null
          base_price?: number | null
          bed_type?: string | null
          created_at?: string | null
          dnd_reason?: string | null
          dnd_until?: string | null
          floor: number
          has_balcony?: boolean | null
          has_window?: boolean | null
          hotel_id: string
          hourly_price?: number | null
          id?: string
          last_deep_clean_at?: string | null
          last_status_changed_at?: string | null
          last_status_changed_by?: string | null
          legacy_status?: string | null
          max_guests?: number | null
          max_hours?: number | null
          min_hours?: number | null
          monthly_price?: number | null
          notes?: string | null
          oos_reason?: string | null
          oos_until?: string | null
          room_number: string
          room_type: string
          smoking_allowed?: boolean | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          view_type?: string | null
        }
        Update: {
          amenities?: string[] | null
          area_sqm?: number | null
          base_price?: number | null
          bed_type?: string | null
          created_at?: string | null
          dnd_reason?: string | null
          dnd_until?: string | null
          floor?: number
          has_balcony?: boolean | null
          has_window?: boolean | null
          hotel_id?: string
          hourly_price?: number | null
          id?: string
          last_deep_clean_at?: string | null
          last_status_changed_at?: string | null
          last_status_changed_by?: string | null
          legacy_status?: string | null
          max_guests?: number | null
          max_hours?: number | null
          min_hours?: number | null
          monthly_price?: number | null
          notes?: string | null
          oos_reason?: string | null
          oos_until?: string | null
          room_number?: string
          room_type?: string
          smoking_allowed?: boolean | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          view_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "rooms_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_last_status_changed_by_fkey"
            columns: ["last_status_changed_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_last_status_changed_by_fkey"
            columns: ["last_status_changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_last_status_changed_by_fkey"
            columns: ["last_status_changed_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "rooms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_rate_overrides: {
        Row: {
          active: boolean
          adjust_type: string
          adjust_value: number
          apply_to: string[]
          created_at: string
          from_date: string
          hotel_id: string | null
          id: string
          mode: string
          name: string
          priority: number
          room_type_ids: string[]
          tenant_id: string
          to_date: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          adjust_type: string
          adjust_value: number
          apply_to?: string[]
          created_at?: string
          from_date: string
          hotel_id?: string | null
          id?: string
          mode: string
          name: string
          priority?: number
          room_type_ids?: string[]
          tenant_id: string
          to_date: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          adjust_type?: string
          adjust_value?: number
          apply_to?: string[]
          created_at?: string
          from_date?: string
          hotel_id?: string | null
          id?: string
          mode?: string
          name?: string
          priority?: number
          room_type_ids?: string[]
          tenant_id?: string
          to_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_rate_overrides_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "seasonal_rate_overrides_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seasonal_rate_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_history: {
        Row: {
          created_at: string
          duration_minutes: number | null
          end_at: string
          hotel_id: string | null
          id: string
          notes: string | null
          start_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          end_at: string
          hotel_id?: string | null
          id?: string
          notes?: string | null
          start_at: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          end_at?: string
          hotel_id?: string | null
          id?: string
          notes?: string | null
          start_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_history_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "shift_history_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      shift_notes: {
        Row: {
          author_id: string | null
          author_name: string | null
          content: string
          created_at: string
          hotel_id: string | null
          id: string
          note_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          content: string
          created_at?: string
          hotel_id?: string | null
          id?: string
          note_date: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          content?: string
          created_at?: string
          hotel_id?: string | null
          id?: string
          note_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_notes_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "shift_notes_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_reminders: {
        Row: {
          created_at: string
          id: string
          notification_channels: string[] | null
          reminded_at: string
          reminder_type: string
          shift_start_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_channels?: string[] | null
          reminded_at?: string
          reminder_type?: string
          shift_start_at: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_channels?: string[] | null
          reminded_at?: string
          reminder_type?: string
          shift_start_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      staff_statistics: {
        Row: {
          average_task_completion_time: string | null
          hotel_id: string
          id: string
          items_checked: number | null
          last_calculated_at: string | null
          laundry_batches_processed: number | null
          maintenance_tasks_completed: number | null
          on_time_completion_rate: number | null
          period_end: string
          period_start: string
          user_id: string
        }
        Insert: {
          average_task_completion_time?: string | null
          hotel_id: string
          id?: string
          items_checked?: number | null
          last_calculated_at?: string | null
          laundry_batches_processed?: number | null
          maintenance_tasks_completed?: number | null
          on_time_completion_rate?: number | null
          period_end: string
          period_start: string
          user_id: string
        }
        Update: {
          average_task_completion_time?: string | null
          hotel_id?: string
          id?: string
          items_checked?: number | null
          last_calculated_at?: string | null
          laundry_batches_processed?: number | null
          maintenance_tasks_completed?: number | null
          on_time_completion_rate?: number | null
          period_end?: string
          period_start?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_statistics_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "staff_statistics_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_statistics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_statistics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_statistics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      staff_status: {
        Row: {
          created_at: string | null
          current_activity: string | null
          current_activity_type: string | null
          current_location: string | null
          id: string
          last_seen_at: string | null
          shift_end_at: string | null
          shift_start_at: string | null
          status: string
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_activity?: string | null
          current_activity_type?: string | null
          current_location?: string | null
          id?: string
          last_seen_at?: string | null
          shift_end_at?: string | null
          shift_start_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_activity?: string | null
          current_activity_type?: string | null
          current_location?: string | null
          id?: string
          last_seen_at?: string | null
          shift_end_at?: string | null
          shift_start_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stock_adjustment_items: {
        Row: {
          actual_quantity: number
          adjustment_id: string
          approved_at: string | null
          approved_by: string | null
          checked_at: string | null
          checked_by: string | null
          created_at: string | null
          difference: number | null
          discrepancy_reason: string | null
          id: string
          investigation_completed_at: string | null
          investigation_notes: string | null
          investigation_started_at: string | null
          investigation_status: string | null
          item_id: string
          linked_document_id: string | null
          linked_document_type: string | null
          notes: string | null
          photos: string[] | null
          resolution_notes: string | null
          resolution_type: string | null
          responsible_person_id: string | null
          status: string | null
          system_quantity: number
          unit_price: number | null
          value_difference: number | null
        }
        Insert: {
          actual_quantity: number
          adjustment_id: string
          approved_at?: string | null
          approved_by?: string | null
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string | null
          difference?: number | null
          discrepancy_reason?: string | null
          id?: string
          investigation_completed_at?: string | null
          investigation_notes?: string | null
          investigation_started_at?: string | null
          investigation_status?: string | null
          item_id: string
          linked_document_id?: string | null
          linked_document_type?: string | null
          notes?: string | null
          photos?: string[] | null
          resolution_notes?: string | null
          resolution_type?: string | null
          responsible_person_id?: string | null
          status?: string | null
          system_quantity: number
          unit_price?: number | null
          value_difference?: number | null
        }
        Update: {
          actual_quantity?: number
          adjustment_id?: string
          approved_at?: string | null
          approved_by?: string | null
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string | null
          difference?: number | null
          discrepancy_reason?: string | null
          id?: string
          investigation_completed_at?: string | null
          investigation_notes?: string | null
          investigation_started_at?: string | null
          investigation_status?: string | null
          item_id?: string
          linked_document_id?: string | null
          linked_document_type?: string | null
          notes?: string | null
          photos?: string[] | null
          resolution_notes?: string | null
          resolution_type?: string | null
          responsible_person_id?: string | null
          status?: string | null
          system_quantity?: number
          unit_price?: number | null
          value_difference?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_items_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "stock_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjustment_code: string
          adjustment_type: string
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          assigned_to: string[] | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          hotel_id: string
          id: string
          notes: string | null
          scheduled_date: string | null
          started_at: string | null
          status: string | null
          tenant_id: string
          total_discrepancies: number | null
          total_items_checked: number | null
          total_value_difference: number | null
          updated_at: string | null
        }
        Insert: {
          adjustment_code: string
          adjustment_type: string
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          hotel_id: string
          id?: string
          notes?: string | null
          scheduled_date?: string | null
          started_at?: string | null
          status?: string | null
          tenant_id: string
          total_discrepancies?: number | null
          total_items_checked?: number | null
          total_value_difference?: number | null
          updated_at?: string | null
        }
        Update: {
          adjustment_code?: string
          adjustment_type?: string
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string[] | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          hotel_id?: string
          id?: string
          notes?: string | null
          scheduled_date?: string | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string
          total_discrepancies?: number | null
          total_items_checked?: number | null
          total_value_difference?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_adjustments_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "stock_adjustments_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          display_order: number | null
          features: Json | null
          id: string
          is_active: boolean | null
          max_hotels: number | null
          max_items: number | null
          max_rooms: number | null
          max_storage_gb: number | null
          max_users: number | null
          min_subscription_days: number | null
          name: string
          price_monthly: number
          price_per_room_daily: number | null
          price_yearly: number
          pricing_model: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_hotels?: number | null
          max_items?: number | null
          max_rooms?: number | null
          max_storage_gb?: number | null
          max_users?: number | null
          min_subscription_days?: number | null
          name: string
          price_monthly?: number
          price_per_room_daily?: number | null
          price_yearly?: number
          pricing_model?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_hotels?: number | null
          max_items?: number | null
          max_rooms?: number | null
          max_storage_gb?: number | null
          max_users?: number | null
          min_subscription_days?: number | null
          name?: string
          price_monthly?: number
          price_per_room_daily?: number | null
          price_yearly?: number
          pricing_model?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      super_admin_activity_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string | null
          description: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string | null
          description: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string | null
          description?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "super_admin_activity_log_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "super_admin_activity_log_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "super_admin_activity_log_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      supplement_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          distribution_order_id: string | null
          hotel_id: string
          id: string
          items: Json
          notes: string | null
          rejection_reason: string | null
          request_code: string
          request_type: string
          requested_by: string | null
          room_check_id: string | null
          room_id: string
          status: string
          tenant_id: string
          total_value: number
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          distribution_order_id?: string | null
          hotel_id: string
          id?: string
          items?: Json
          notes?: string | null
          rejection_reason?: string | null
          request_code: string
          request_type: string
          requested_by?: string | null
          room_check_id?: string | null
          room_id: string
          status?: string
          tenant_id: string
          total_value?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          distribution_order_id?: string | null
          hotel_id?: string
          id?: string
          items?: Json
          notes?: string | null
          rejection_reason?: string | null
          request_code?: string
          request_type?: string
          requested_by?: string | null
          room_check_id?: string | null
          room_id?: string
          status?: string
          tenant_id?: string
          total_value?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplement_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "supplement_requests_distribution_order_id_fkey"
            columns: ["distribution_order_id"]
            isOneToOne: false
            referencedRelation: "distribution_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_requests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "supplement_requests_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "supplement_requests_room_check_id_fkey"
            columns: ["room_check_id"]
            isOneToOne: false
            referencedRelation: "room_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplement_requests_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "inventory_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      telegram_connections: {
        Row: {
          chat_id: string
          chat_title: string | null
          chat_type: string | null
          created_at: string | null
          first_name: string | null
          id: string
          is_active: boolean | null
          notification_types: string[] | null
          tenant_id: string
          updated_at: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          chat_id: string
          chat_title?: string | null
          chat_type?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          notification_types?: string[] | null
          tenant_id: string
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          chat_id?: string
          chat_title?: string | null
          chat_type?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          notification_types?: string[] | null
          tenant_id?: string
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      telegram_groups: {
        Row: {
          added_by: string | null
          chat_id: string
          chat_title: string
          created_at: string | null
          department: string | null
          group_type: string | null
          hotel_id: string | null
          id: string
          is_active: boolean | null
          notification_types: string[] | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          added_by?: string | null
          chat_id: string
          chat_title: string
          created_at?: string | null
          department?: string | null
          group_type?: string | null
          hotel_id?: string | null
          id?: string
          is_active?: boolean | null
          notification_types?: string[] | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          added_by?: string | null
          chat_id?: string
          chat_title?: string
          created_at?: string | null
          department?: string | null
          group_type?: string | null
          hotel_id?: string | null
          id?: string
          is_active?: boolean | null
          notification_types?: string[] | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_groups_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_groups_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_groups_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "telegram_groups_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "telegram_groups_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_usage: {
        Row: {
          current_hotels_count: number | null
          current_items_count: number | null
          current_rooms_count: number | null
          current_storage_bytes: number | null
          current_users_count: number | null
          id: string
          last_calculated_at: string | null
          peak_hotels_count: number | null
          peak_storage_bytes: number | null
          peak_users_count: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          current_hotels_count?: number | null
          current_items_count?: number | null
          current_rooms_count?: number | null
          current_storage_bytes?: number | null
          current_users_count?: number | null
          id?: string
          last_calculated_at?: string | null
          peak_hotels_count?: number | null
          peak_storage_bytes?: number | null
          peak_users_count?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          current_hotels_count?: number | null
          current_items_count?: number | null
          current_rooms_count?: number | null
          current_storage_bytes?: number | null
          current_users_count?: number | null
          id?: string
          last_calculated_at?: string | null
          peak_hotels_count?: number | null
          peak_storage_bytes?: number | null
          peak_users_count?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          auto_renew: boolean | null
          billing_address: string | null
          billing_cycle: string | null
          billing_email: string | null
          created_at: string | null
          email: string
          grace_period_days_override: number | null
          grace_period_ends_at: string | null
          id: string
          is_read_only: boolean
          logo_url: string | null
          name: string
          payment_method: string | null
          payment_tolerance_vnd: number
          phone: string | null
          read_only_reason: string | null
          read_only_since: string | null
          registered_rooms: number | null
          rejection_reason: string | null
          settings: Json | null
          subscription_current_period_end: string | null
          subscription_current_period_start: string | null
          subscription_duration_days: number | null
          subscription_end_date: string | null
          subscription_expires_at: string | null
          subscription_plan: string | null
          subscription_plan_id: string | null
          subscription_start_date: string | null
          subscription_started_at: string | null
          subscription_status: string | null
          tax_id: string | null
          trial_end_date: string | null
          trial_ends_at: string | null
          updated_at: string | null
          usage_mode: string
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_renew?: boolean | null
          billing_address?: string | null
          billing_cycle?: string | null
          billing_email?: string | null
          created_at?: string | null
          email: string
          grace_period_days_override?: number | null
          grace_period_ends_at?: string | null
          id?: string
          is_read_only?: boolean
          logo_url?: string | null
          name: string
          payment_method?: string | null
          payment_tolerance_vnd?: number
          phone?: string | null
          read_only_reason?: string | null
          read_only_since?: string | null
          registered_rooms?: number | null
          rejection_reason?: string | null
          settings?: Json | null
          subscription_current_period_end?: string | null
          subscription_current_period_start?: string | null
          subscription_duration_days?: number | null
          subscription_end_date?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          subscription_plan_id?: string | null
          subscription_start_date?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          tax_id?: string | null
          trial_end_date?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          usage_mode?: string
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_renew?: boolean | null
          billing_address?: string | null
          billing_cycle?: string | null
          billing_email?: string | null
          created_at?: string | null
          email?: string
          grace_period_days_override?: number | null
          grace_period_ends_at?: string | null
          id?: string
          is_read_only?: boolean
          logo_url?: string | null
          name?: string
          payment_method?: string | null
          payment_tolerance_vnd?: number
          phone?: string | null
          read_only_reason?: string | null
          read_only_since?: string | null
          registered_rooms?: number | null
          rejection_reason?: string | null
          settings?: Json | null
          subscription_current_period_end?: string | null
          subscription_current_period_start?: string | null
          subscription_duration_days?: number | null
          subscription_end_date?: string | null
          subscription_expires_at?: string | null
          subscription_plan?: string | null
          subscription_plan_id?: string | null
          subscription_start_date?: string | null
          subscription_started_at?: string | null
          subscription_status?: string | null
          tax_id?: string | null
          trial_end_date?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          usage_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tenants_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_hotels: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          can_approve_requests: boolean | null
          can_create_managers: boolean | null
          can_create_staff: boolean | null
          can_export_data: boolean | null
          can_view_reports: boolean | null
          hotel_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          can_approve_requests?: boolean | null
          can_create_managers?: boolean | null
          can_create_staff?: boolean | null
          can_export_data?: boolean | null
          can_view_reports?: boolean | null
          hotel_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          can_approve_requests?: boolean | null
          can_create_managers?: boolean | null
          can_create_staff?: boolean | null
          can_export_data?: boolean | null
          can_view_reports?: boolean | null
          hotel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_hotels_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hotels_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hotels_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_hotels_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "user_hotels_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hotels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hotels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hotels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_levels: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          hierarchy_level: number
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          hierarchy_level: number
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          hierarchy_level?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          action: string
          created_at: string | null
          created_by: string | null
          enabled: boolean
          id: string
          module: string
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean
          id?: string
          module: string
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          created_by?: string | null
          enabled?: boolean
          id?: string
          module?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          current_hotel_id: string | null
          id: string
          preferences: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          current_hotel_id?: string | null
          id?: string
          preferences?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          current_hotel_id?: string | null
          id?: string
          preferences?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_current_hotel_id_fkey"
            columns: ["current_hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "user_preferences_current_hotel_id_fkey"
            columns: ["current_hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          account_locked: boolean | null
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          deleted_at: string | null
          department: string | null
          email: string
          full_name: string
          hotel_id: string | null
          hourly_wage_vnd: number | null
          id: string
          is_primary_owner: boolean | null
          is_super_admin: boolean | null
          last_login_at: string | null
          last_login_ip: unknown
          locked_reason: string | null
          login_count: number | null
          metadata: Json | null
          monthly_salary_vnd: number | null
          must_change_password: boolean | null
          notes: string | null
          phone: string | null
          position_id: string | null
          reports_to: string | null
          role: string
          status: string | null
          telegram_username: string | null
          tenant_id: string | null
          updated_at: string | null
          user_level_code: string | null
        }
        Insert: {
          account_locked?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deleted_at?: string | null
          department?: string | null
          email: string
          full_name: string
          hotel_id?: string | null
          hourly_wage_vnd?: number | null
          id: string
          is_primary_owner?: boolean | null
          is_super_admin?: boolean | null
          last_login_at?: string | null
          last_login_ip?: unknown
          locked_reason?: string | null
          login_count?: number | null
          metadata?: Json | null
          monthly_salary_vnd?: number | null
          must_change_password?: boolean | null
          notes?: string | null
          phone?: string | null
          position_id?: string | null
          reports_to?: string | null
          role?: string
          status?: string | null
          telegram_username?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_level_code?: string | null
        }
        Update: {
          account_locked?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deleted_at?: string | null
          department?: string | null
          email?: string
          full_name?: string
          hotel_id?: string | null
          hourly_wage_vnd?: number | null
          id?: string
          is_primary_owner?: boolean | null
          is_super_admin?: boolean | null
          last_login_at?: string | null
          last_login_ip?: unknown
          locked_reason?: string | null
          login_count?: number | null
          metadata?: Json | null
          monthly_salary_vnd?: number | null
          must_change_password?: boolean | null
          notes?: string | null
          phone?: string | null
          position_id?: string | null
          reports_to?: string | null
          role?: string
          status?: string | null
          telegram_username?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_level_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "users_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "users_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "users_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_user_level_code_fkey"
            columns: ["user_level_code"]
            isOneToOne: false
            referencedRelation: "user_levels"
            referencedColumns: ["code"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_name: string | null
          category: string
          code: string
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          delivery_time: string | null
          documents: string[] | null
          email: string | null
          id: string
          minimum_order_value: number | null
          name: string
          notes: string | null
          on_time_delivery_rate: number | null
          payment_terms: string | null
          phone: string | null
          products_services: string[] | null
          rating: number | null
          status: string | null
          tax_code: string | null
          tenant_id: string
          total_orders: number | null
          total_value: number | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          category: string
          code: string
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_time?: string | null
          documents?: string[] | null
          email?: string | null
          id?: string
          minimum_order_value?: number | null
          name: string
          notes?: string | null
          on_time_delivery_rate?: number | null
          payment_terms?: string | null
          phone?: string | null
          products_services?: string[] | null
          rating?: number | null
          status?: string | null
          tax_code?: string | null
          tenant_id: string
          total_orders?: number | null
          total_value?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          category?: string
          code?: string
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          delivery_time?: string | null
          documents?: string[] | null
          email?: string | null
          id?: string
          minimum_order_value?: number | null
          name?: string
          notes?: string | null
          on_time_delivery_rate?: number | null
          payment_terms?: string | null
          phone?: string | null
          products_services?: string[] | null
          rating?: number | null
          status?: string | null
          tax_code?: string | null
          tenant_id?: string
          total_orders?: number | null
          total_value?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_stock: {
        Row: {
          created_at: string
          id: string
          item_id: string
          last_transaction_id: string | null
          last_updated: string
          maximum_stock: number | null
          minimum_stock: number | null
          quantity: number
          tenant_id: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          last_transaction_id?: string | null
          last_updated?: string
          maximum_stock?: number | null
          minimum_stock?: number | null
          quantity?: number
          tenant_id: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          last_transaction_id?: string | null
          last_updated?: string
          maximum_stock?: number | null
          minimum_stock?: number | null
          quantity?: number
          tenant_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          code: string
          created_at: string
          description: string | null
          hotel_id: string
          id: string
          is_active: boolean
          is_default: boolean
          location_type: Database["public"]["Enums"]["warehouse_location_type"]
          name: string
          sort_order: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          description?: string | null
          hotel_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          location_type?: Database["public"]["Enums"]["warehouse_location_type"]
          name: string
          sort_order?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          description?: string | null
          hotel_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          location_type?: Database["public"]["Enums"]["warehouse_location_type"]
          name?: string
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "warehouses_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_actions: {
        Row: {
          action_config: Json
          action_type: string
          continue_on_failure: boolean | null
          created_at: string | null
          id: string
          max_retries: number | null
          order_index: number
          retry_delay_seconds: number | null
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          continue_on_failure?: boolean | null
          created_at?: string | null
          id?: string
          max_retries?: number | null
          order_index?: number
          retry_delay_seconds?: number | null
          updated_at?: string | null
          workflow_id: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          continue_on_failure?: boolean | null
          created_at?: string | null
          id?: string
          max_retries?: number | null
          order_index?: number
          retry_delay_seconds?: number | null
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_actions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_executions: {
        Row: {
          actions_completed: number | null
          actions_failed: number | null
          completed_at: string | null
          created_at: string | null
          duration_seconds: number | null
          error_message: string | null
          execution_log: Json | null
          id: string
          started_at: string | null
          status: string
          trigger_data: Json | null
          workflow_id: string
        }
        Insert: {
          actions_completed?: number | null
          actions_failed?: number | null
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          execution_log?: Json | null
          id?: string
          started_at?: string | null
          status?: string
          trigger_data?: Json | null
          workflow_id: string
        }
        Update: {
          actions_completed?: number | null
          actions_failed?: number | null
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          execution_log?: Json | null
          id?: string
          started_at?: string | null
          status?: string
          trigger_data?: Json | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          failed_count: number | null
          id: string
          last_error: string | null
          last_run_at: string | null
          last_run_status: string | null
          name: string
          status: string | null
          success_count: number | null
          tenant_id: string
          total_executions: number | null
          trigger_event: string | null
          trigger_schedule: string | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          failed_count?: number | null
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_run_status?: string | null
          name: string
          status?: string | null
          success_count?: number | null
          tenant_id: string
          total_executions?: number | null
          trigger_event?: string | null
          trigger_schedule?: string | null
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          failed_count?: number | null
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_run_status?: string | null
          name?: string
          status?: string | null
          success_count?: number | null
          tenant_id?: string
          total_executions?: number | null
          trigger_event?: string | null
          trigger_schedule?: string | null
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      dashboard_activities: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          metadata: Json | null
          tenant_id: string | null
          type: string | null
          user_avatar: string | null
          user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_stats: {
        Row: {
          active_laundry_batches: number | null
          cleaning_rooms: number | null
          hotel_id: string | null
          hotel_name: string | null
          low_stock_items_count: number | null
          maintenance_rooms: number | null
          occupied_rooms: number | null
          pending_maintenance_requests: number | null
          tenant_id: string | null
          total_damaged: number | null
          total_in_laundry: number | null
          total_in_stock: number | null
          total_in_use: number | null
          total_inventory_value: number | null
          total_items: number | null
          total_quantity: number | null
          total_rooms: number | null
          vacant_rooms: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hotels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_avg_cost: {
        Row: {
          avg_cost: number | null
          item_id: string | null
          last_inbound_at: string | null
          tenant_id: string | null
          total_qty_in: number | null
          total_value_in: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_expenses: {
        Row: {
          laundry_amount: number | null
          maintenance_amount: number | null
          month: string | null
          purchase_amount: number | null
          tenant_id: string | null
          total_amount: number | null
        }
        Relationships: []
      }
      qc_floor_stats_30d: {
        Row: {
          floor: number | null
          hotel_id: string | null
          pending_tasks: number | null
          rework_rate_pct: number | null
          rework_tasks: number | null
          tenant_id: string | null
          total_tasks: number | null
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_tasks_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_staff_stats_30d: {
        Row: {
          approved_count: number | null
          full_name: string | null
          hotel_id: string | null
          pending_count: number | null
          rework_count: number | null
          rework_rate_pct: number | null
          tenant_id: string | null
          total_completed: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_tasks_assigned_to_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_assigned_to_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_assigned_to_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      room_check_staff_items_view: {
        Row: {
          asset_group: Database["public"]["Enums"]["asset_group"] | null
          badge_label: string | null
          condition: string | null
          display_name: string | null
          hotel_id: string | null
          item_code: string | null
          item_id: string | null
          item_type: Database["public"]["Enums"]["item_type"] | null
          room_id: string | null
          room_item_id: string | null
          room_quantity_current: number | null
          room_quantity_expected: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "items_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_with_levels: {
        Row: {
          account_locked: boolean | null
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          hierarchy_level: number | null
          hotel_id: string | null
          id: string | null
          is_super_admin: boolean | null
          last_login_at: string | null
          login_count: number | null
          phone: string | null
          status: string | null
          tenant_id: string | null
          user_level_code: string | null
          user_level_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "users_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_user_level_code_fkey"
            columns: ["user_level_code"]
            isOneToOne: false
            referencedRelation: "user_levels"
            referencedColumns: ["code"]
          },
        ]
      }
      v_overdue_checkins: {
        Row: {
          actual_check_in: string | null
          actual_check_out: string | null
          amount_paid: number | null
          booking_group_id: string | null
          booking_hours: number | null
          booking_months: number | null
          booking_reference: string | null
          booking_source: string | null
          booking_type: string | null
          check_in_date: string | null
          check_out_date: string | null
          created_at: string | null
          created_by: string | null
          damage_charges: number | null
          damage_items: Json | null
          damage_notes: string | null
          deposit_amount: number | null
          early_checkin_charge: number | null
          expected_check_in_time: string | null
          expected_check_out_time: string | null
          extra_charges: number | null
          guest_address: string | null
          guest_count: number | null
          guest_date_of_birth: string | null
          guest_email: string | null
          guest_gender: string | null
          guest_id: string | null
          guest_id_image_url: string | null
          guest_id_number: string | null
          guest_id_type: string | null
          guest_name: string | null
          guest_nationality: string | null
          guest_phone: string | null
          hotel_id: string | null
          hourly_end_time: string | null
          hourly_rate: number | null
          hourly_start_time: string | null
          hours_overdue: number | null
          id: string | null
          late_checkout_charge: number | null
          monthly_rate: number | null
          net_revenue: number | null
          notes: string | null
          ota_commission_amount: number | null
          ota_commission_rate: number | null
          ota_paid_amount: number | null
          ota_payment_type: string | null
          paid_at: string | null
          payment_status: string | null
          room_id: string | null
          room_price: number | null
          service_charges: number | null
          service_fee_amount: number | null
          service_fee_rate: number | null
          skipper_amount_loss: number | null
          skipper_amount_owed: number | null
          skipper_at: string | null
          skipper_marked_at: string | null
          skipper_marked_by: string | null
          skipper_note: string | null
          skipper_reason: string | null
          sleep_out_at: string | null
          sleep_out_note: string | null
          sleep_out_reason: string | null
          status: string | null
          subtotal: number | null
          tenant_id: string | null
          total_amount: number | null
          updated_at: string | null
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          amount_paid?: number | null
          booking_group_id?: string | null
          booking_hours?: number | null
          booking_months?: number | null
          booking_reference?: string | null
          booking_source?: string | null
          booking_type?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string | null
          created_by?: string | null
          damage_charges?: number | null
          damage_items?: Json | null
          damage_notes?: string | null
          deposit_amount?: number | null
          early_checkin_charge?: number | null
          expected_check_in_time?: string | null
          expected_check_out_time?: string | null
          extra_charges?: number | null
          guest_address?: string | null
          guest_count?: number | null
          guest_date_of_birth?: string | null
          guest_email?: string | null
          guest_gender?: string | null
          guest_id?: string | null
          guest_id_image_url?: string | null
          guest_id_number?: string | null
          guest_id_type?: string | null
          guest_name?: string | null
          guest_nationality?: string | null
          guest_phone?: string | null
          hotel_id?: string | null
          hourly_end_time?: string | null
          hourly_rate?: number | null
          hourly_start_time?: string | null
          hours_overdue?: never
          id?: string | null
          late_checkout_charge?: number | null
          monthly_rate?: number | null
          net_revenue?: number | null
          notes?: string | null
          ota_commission_amount?: number | null
          ota_commission_rate?: number | null
          ota_paid_amount?: number | null
          ota_payment_type?: string | null
          paid_at?: string | null
          payment_status?: string | null
          room_id?: string | null
          room_price?: number | null
          service_charges?: number | null
          service_fee_amount?: number | null
          service_fee_rate?: number | null
          skipper_amount_loss?: number | null
          skipper_amount_owed?: number | null
          skipper_at?: string | null
          skipper_marked_at?: string | null
          skipper_marked_by?: string | null
          skipper_note?: string | null
          skipper_reason?: string | null
          sleep_out_at?: string | null
          sleep_out_note?: string | null
          sleep_out_reason?: string | null
          status?: string | null
          subtotal?: number | null
          tenant_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          actual_check_in?: string | null
          actual_check_out?: string | null
          amount_paid?: number | null
          booking_group_id?: string | null
          booking_hours?: number | null
          booking_months?: number | null
          booking_reference?: string | null
          booking_source?: string | null
          booking_type?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          created_at?: string | null
          created_by?: string | null
          damage_charges?: number | null
          damage_items?: Json | null
          damage_notes?: string | null
          deposit_amount?: number | null
          early_checkin_charge?: number | null
          expected_check_in_time?: string | null
          expected_check_out_time?: string | null
          extra_charges?: number | null
          guest_address?: string | null
          guest_count?: number | null
          guest_date_of_birth?: string | null
          guest_email?: string | null
          guest_gender?: string | null
          guest_id?: string | null
          guest_id_image_url?: string | null
          guest_id_number?: string | null
          guest_id_type?: string | null
          guest_name?: string | null
          guest_nationality?: string | null
          guest_phone?: string | null
          hotel_id?: string | null
          hourly_end_time?: string | null
          hourly_rate?: number | null
          hourly_start_time?: string | null
          hours_overdue?: never
          id?: string | null
          late_checkout_charge?: number | null
          monthly_rate?: number | null
          net_revenue?: number | null
          notes?: string | null
          ota_commission_amount?: number | null
          ota_commission_rate?: number | null
          ota_paid_amount?: number | null
          ota_payment_type?: string | null
          paid_at?: string | null
          payment_status?: string | null
          room_id?: string | null
          room_price?: number | null
          service_charges?: number | null
          service_fee_amount?: number | null
          service_fee_rate?: number | null
          skipper_amount_loss?: number | null
          skipper_amount_owed?: number | null
          skipper_at?: string | null
          skipper_marked_at?: string | null
          skipper_marked_by?: string | null
          skipper_note?: string | null
          skipper_reason?: string | null
          sleep_out_at?: string | null
          sleep_out_note?: string | null
          sleep_out_reason?: string | null
          status?: string | null
          subtotal?: number | null
          tenant_id?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "room_bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "room_bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_skipper_marked_by_fkey"
            columns: ["skipper_marked_by"]
            isOneToOne: false
            referencedRelation: "user_with_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_skipper_marked_by_fkey"
            columns: ["skipper_marked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_bookings_skipper_marked_by_fkey"
            columns: ["skipper_marked_by"]
            isOneToOne: false
            referencedRelation: "v_user_effective_roles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "room_bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_conversations: {
        Row: {
          hotel_id: string | null
          id: string | null
          last_message_at: string | null
          last_message_preview: string | null
          last_read_message_id: string | null
          last_sender_id: string | null
          muted_until: string | null
          name: string | null
          tenant_id: string | null
          type: Database["public"]["Enums"]["conversation_type"] | null
          unread_count: number | null
          viewer_id: string | null
        }
        Relationships: []
      }
      v_user_effective_roles: {
        Row: {
          hotel_id: string | null
          is_manager: boolean | null
          is_owner: boolean | null
          is_staff: boolean | null
          is_super_admin: boolean | null
          roles: string[] | null
          tenant_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "dashboard_stats"
            referencedColumns: ["hotel_id"]
          },
          {
            foreignKeyName: "users_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _enqueue_stay_registration_internal: {
        Args: { p_booking_id: string }
        Returns: number
      }
      _tc_check_block_conflict: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_exclude_block_id?: string
          p_room_id: string
        }
        Returns: string
      }
      _tc_check_booking_conflict: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_exclude_booking_id?: string
          p_room_id: string
        }
        Returns: string
      }
      add_conversation_members: {
        Args: { _conversation_id: string; _user_ids: string[] }
        Returns: undefined
      }
      add_laundry_to_draft_batch: {
        Args: {
          p_hotel_id: string
          p_laundry_request_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      allocate_linen_fifo: {
        Args: { _item_id: string; _quantity: number }
        Returns: Json
      }
      apply_asset_group_mapping: {
        Args: {
          _hotel_id?: string
          _override_existing?: boolean
          _tenant_id: string
        }
        Returns: Json
      }
      apply_promo_code: {
        Args: {
          p_original_amount: number
          p_promo_code: string
          p_tenant_id: string
        }
        Returns: Json
      }
      apply_room_standards: {
        Args: { p_room_id: string; p_user_id?: string }
        Returns: Json
      }
      approve_reorder_suggestions: {
        Args: { _suggestion_ids: string[] }
        Returns: Json
      }
      approve_task: {
        Args: { _note?: string; _task_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          awaiting_review_at: string | null
          booking_id: string | null
          cancelled_at: string | null
          checkout_inspection_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          distribution_order_room_id: string | null
          due_at: string | null
          hotel_id: string
          id: string
          notes: string | null
          priority: string
          qc_due_at: string | null
          qc_required: boolean
          qc_status: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_by: string | null
          rework_count: number
          room_check_id: string | null
          room_id: string
          started_at: string | null
          status: string
          task_type: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "housekeeping_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_tenant: {
        Args: { p_admin_id: string; p_tenant_id: string }
        Returns: Json
      }
      assign_default_permissions_to_role: {
        Args: {
          p_permission_codes: string[]
          p_role_code: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      atomic_item_consumed: {
        Args: { p_item_id: string; p_quantity: number }
        Returns: {
          quantity_after: number
          quantity_before: number
          unit_price: number
        }[]
      }
      atomic_item_lost: {
        Args: { p_item_id: string; p_quantity: number }
        Returns: {
          quantity_after: number
          quantity_before: number
          unit_price: number
        }[]
      }
      atomic_item_to_laundry: {
        Args: { p_item_id: string; p_quantity: number }
        Returns: undefined
      }
      auto_apply_read_only_after_grace: { Args: never; Returns: number }
      auto_clear_read_only_after_renewal: { Args: never; Returns: number }
      auto_close_stale_shifts: { Args: never; Returns: Json }
      auto_offline_inactive_staff: { Args: never; Returns: undefined }
      batch_confirm_room_deliveries: {
        Args: { p_confirmed_by: string; p_room_order_ids: string[] }
        Returns: Json
      }
      bulk_delete_items: {
        Args: { p_item_ids: string[]; p_user_id: string }
        Returns: Json
      }
      bulk_upsert_daily_prices: {
        Args: {
          _dates: string[]
          _is_closed?: boolean
          _price?: number
          _rate_plan_id: string
          _reset?: boolean
          _sale_price?: number
        }
        Returns: number
      }
      bulk_upsert_rt_availability: {
        Args: {
          _dates: string[]
          _is_closed?: boolean
          _qty?: number
          _room_type_id: string
        }
        Returns: number
      }
      calculate_booking_price: {
        Args: {
          p_apply_early_late?: boolean
          p_booking_type: string
          p_from_ts: string
          p_hotel_id?: string
          p_room_type_id: string
          p_to_ts: string
        }
        Returns: Json
      }
      calculate_staff_statistics: {
        Args: {
          p_hotel_id: string
          p_period_end: string
          p_period_start: string
          p_user_id: string
        }
        Returns: undefined
      }
      calculate_tenant_storage: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      can_create_user: {
        Args: {
          p_creator_id: string
          p_new_user_level: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      can_manage_user: {
        Args: { p_manager_id: string; p_target_user_id: string }
        Returns: boolean
      }
      can_perform_quick_check: { Args: { _room_id: string }; Returns: boolean }
      cancel_booking:
        | { Args: { p_booking_id: string; p_room_id?: string }; Returns: Json }
        | {
            Args: {
              p_booking_id: string
              p_reason?: string
              p_refund_deposit?: boolean
              p_room_id?: string
            }
            Returns: Json
          }
      cancel_booking_payment: {
        Args: { p_payment_id: string }
        Returns: Json
      }
      cancel_subscription_payment: {
        Args: { p_payment_id: string }
        Returns: Json
      }
      cancel_distribution_order: {
        Args: { p_cancelled_by: string; p_order_id: string }
        Returns: Json
      }
      check_and_update_batch_status: {
        Args: { p_batch_id: string }
        Returns: undefined
      }
      check_and_update_order_status: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      check_expiring_subscriptions: { Args: never; Returns: undefined }
      check_rate_limit: {
        Args: {
          _bucket_key: string
          _max_hits: number
          _window_seconds: number
        }
        Returns: boolean
      }
      check_tenant_can_add: {
        Args: { p_resource_type: string; p_tenant_id: string }
        Returns: boolean
      }
      cleanup_expired_otps: { Args: never; Returns: undefined }
      cleanup_old_check_sessions: { Args: never; Returns: undefined }
      cleanup_orphaned_auth_users: { Args: never; Returns: number }
      cleanup_rate_limit_hits: { Args: never; Returns: undefined }
      cleanup_stale_check_sessions: { Args: never; Returns: undefined }
      clear_tenant_read_only: {
        Args: { p_reason?: string; p_tenant_id: string }
        Returns: undefined
      }
      close_route_if_complete: {
        Args: { p_actor_id?: string; p_order_id: string }
        Returns: Json
      }
      complete_registration: {
        Args: {
          p_email: string
          p_full_name: string
          p_hotel_address: string
          p_hotel_email: string
          p_hotel_name: string
          p_hotel_phone: string
          p_phone: string
          p_tenant_name: string
          p_total_rooms: number
          p_user_id: string
        }
        Returns: Json
      }
      complete_task: {
        Args: { _note?: string; _task_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          awaiting_review_at: string | null
          booking_id: string | null
          cancelled_at: string | null
          checkout_inspection_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          distribution_order_room_id: string | null
          due_at: string | null
          hotel_id: string
          id: string
          notes: string | null
          priority: string
          qc_due_at: string | null
          qc_required: boolean
          qc_status: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_by: string | null
          rework_count: number
          room_check_id: string | null
          room_id: string
          started_at: string | null
          status: string
          task_type: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "housekeeping_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_auto_reorder_suggestions: {
        Args: { _hotel_id?: string; _tenant_id: string }
        Returns: Json
      }
      compute_reorder_suggestions: {
        Args: { _hotel_id?: string; _item_id?: string; _tenant_id: string }
        Returns: Json
      }
      confirm_booking_payment_manual: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_payment_id: string
          p_total_amount?: number
        }
        Returns: Json
      }
      confirm_delivery_from_room_check: {
        Args: { p_confirmed_by: string; p_room_order_id: string }
        Returns: Json
      }
      confirm_receive_order: {
        Args: { p_actor_id?: string; p_adjustments?: Json; p_order_id: string }
        Returns: Json
      }
      confirm_room_delivery: {
        Args: { p_confirmed_by: string; p_room_order_id: string }
        Returns: Json
      }
      confirm_warehouse_delivery: {
        Args: {
          p_delivered_by: string
          p_item_confirmations?: Json
          p_room_order_id: string
        }
        Returns: Json
      }
      create_booking_v2: {
        Args: { p_bookings: Json; p_guest: Json }
        Returns: Json
      }
      create_booking_payment_pending: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_hotel_id: string
          p_metadata?: Json
          p_notes?: string
          p_payment_method: string
          p_tenant_id: string
          p_total_amount?: number
          p_transaction_reference?: string
        }
        Returns: Json
      }
      create_default_categories: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      create_default_tenant_roles: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      create_default_warehouse_for_hotel: {
        Args: { p_hotel_id: string; p_tenant_id: string }
        Returns: string
      }
      create_direct_conversation: {
        Args: { _hotel_id: string; _peer_user_id: string }
        Returns: string
      }
      create_distribution_order: {
        Args: {
          p_assigned_to: string
          p_auto_release?: boolean
          p_created_by: string
          p_hotel_id: string
          p_notes?: string
          p_rooms: Json
          p_supplement_request_ids?: string[]
          p_tenant_id: string
        }
        Returns: Json
      }
      create_group_conversation: {
        Args: { _hotel_id: string; _member_ids: string[]; _name: string }
        Returns: string
      }
      create_inbound_transaction: {
        Args: {
          p_created_by: string
          p_documents?: string[]
          p_from_location: string
          p_hotel_id: string
          p_items: Json
          p_notes?: string
          p_photos?: string[]
          p_related_id?: string
          p_related_type?: string
          p_tenant_id: string
          p_to_location: string
          p_to_warehouse_id?: string
          p_transaction_category: string
        }
        Returns: Json
      }
      create_laundry_batch_with_items: {
        Args: {
          p_delivery_date: string
          p_delivery_staff_id: string
          p_expected_return_date: string
          p_hotel_id: string
          p_items: Json
          p_notes: string
          p_receiver_name: string
          p_tenant_id: string
          p_vendor_id: string
        }
        Returns: Json
      }
      create_laundry_loss_transaction: {
        Args: {
          p_created_by: string
          p_hotel_id: string
          p_items: Json
          p_loss_type: string
          p_notes?: string
          p_related_id?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_laundry_return_transaction: {
        Args: {
          p_created_by: string
          p_from_location: string
          p_hotel_id: string
          p_items: Json
          p_notes?: string
          p_related_id?: string
          p_tenant_id: string
          p_to_location: string
        }
        Returns: Json
      }
      create_new_linen_batch: {
        Args: { _batch_code: string; _item_id: string; _quantity: number }
        Returns: Json
      }
      create_notification: {
        Args: {
          p_action_url?: string
          p_body: string
          p_icon?: string
          p_metadata?: Json
          p_tenant_id: string
          p_title: string
          p_type?: string
          p_user_id: string
        }
        Returns: string
      }
      create_notification_for_user: {
        Args: {
          p_action_url?: string
          p_body: string
          p_icon?: string
          p_metadata?: Json
          p_tenant_id: string
          p_title: string
          p_type?: string
          p_user_id: string
        }
        Returns: string
      }
      create_outbound_transaction: {
        Args: {
          p_created_by: string
          p_documents?: string[]
          p_from_location: string
          p_from_warehouse_id?: string
          p_hotel_id: string
          p_items: Json
          p_notes?: string
          p_photos?: string[]
          p_recipient_name?: string
          p_recipient_signature?: string
          p_related_id?: string
          p_related_type?: string
          p_tenant_id: string
          p_to_location: string
          p_transaction_category: string
        }
        Returns: Json
      }
      create_room_block: {
        Args: {
          p_block_type?: string
          p_end_date: string
          p_hotel_id: string
          p_reason?: string
          p_room_id: string
          p_start_date: string
        }
        Returns: Json
      }
      create_stock_adjustment: {
        Args: {
          p_adjustment_type: string
          p_assigned_to: string[]
          p_created_by: string
          p_hotel_id: string
          p_item_ids: string[]
          p_notes?: string
          p_scheduled_date: string
          p_tenant_id: string
        }
        Returns: Json
      }
      create_super_admin: {
        Args: { p_email: string; p_full_name?: string }
        Returns: Json
      }
      create_warehouse_transfer: {
        Args: {
          p_created_by?: string
          p_from_warehouse_id: string
          p_hotel_id: string
          p_items: Json
          p_notes?: string
          p_tenant_id: string
          p_to_warehouse_id: string
        }
        Returns: string
      }
      delete_chat_message: { Args: { _message_id: string }; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_inventory_transaction: {
        Args: { p_transaction_id: string }
        Returns: Json
      }
      delete_room_block: { Args: { p_block_id: string }; Returns: Json }
      deliver_stop: {
        Args: { p_actor_id?: string; p_stop_id: string }
        Returns: Json
      }
      duplicate_room_type: {
        Args: {
          p_copy_default_items?: boolean
          p_copy_rates?: boolean
          p_new_code: string
          p_new_name: string
          p_source_id: string
        }
        Returns: string
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_stay_registration: {
        Args: { p_booking_id: string }
        Returns: number
      }
      ensure_default_rate_plan: {
        Args: { p_room_type_id: string }
        Returns: string
      }
      ensure_vat_claim_token: {
        Args: { p_invoice_id: string }
        Returns: {
          expires_at: string
          status: string
          token: string
        }[]
      }
      exec_cron_update: {
        Args: { _command: string; _jobname: string }
        Returns: undefined
      }
      fn_can_user_transition_room: {
        Args: { _from: string; _to: string; _user_id: string }
        Returns: boolean
      }
      fn_is_valid_adjustment_transition: {
        Args: { _from: string; _to: string }
        Returns: boolean
      }
      fn_is_valid_room_transition: {
        Args: { _from: string; _to: string }
        Returns: boolean
      }
      fn_is_valid_task_transition: {
        Args: { _from: string; _to: string }
        Returns: boolean
      }
      fn_normalize_room_status_v2: {
        Args: { _status: string }
        Returns: string
      }
      fn_room_status_alias: { Args: { _status: string }; Returns: string }
      gen_vat_claim_token: { Args: never; Returns: string }
      generate_guest_invoice_number: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      generate_invoice_number: { Args: never; Returns: string }
      generate_laundry_request_code: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      generate_lost_found_item_code: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      generate_supplement_request_code: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      generate_unique_code: {
        Args: { column_name: string; prefix: string; table_name: string }
        Returns: string
      }
      get_abc_analysis: {
        Args: { p_hotel_id: string; p_tenant_id: string }
        Returns: {
          abc_class: string
          category_name: string
          cumulative_percentage: number
          cumulative_value: number
          item_code: string
          item_id: string
          item_name: string
          percentage: number
          total_value: number
        }[]
      }
      get_all_warehouse_stock_summary: {
        Args: { p_hotel_id?: string; p_tenant_id: string }
        Returns: {
          is_default: boolean
          low_stock_count: number
          total_items: number
          total_quantity: number
          total_value: number
          warehouse_code: string
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_booking_chargeable_total: {
        Args: { p_booking_id: string }
        Returns: number
      }
      get_categories_with_stats: {
        Args: { p_hotel_id?: string; p_tenant_id: string }
        Returns: {
          color: string
          description: string
          icon: string
          id: string
          items_count: number
          name: string
          name_en: string
          sort_order: number
          total_value: number
        }[]
      }
      get_consumption_trend: {
        Args: { _days?: number; _item_id: string }
        Returns: {
          day: string
          qty_out: number
        }[]
      }
      get_conversation_hotel: { Args: { _conv_id: string }; Returns: string }
      get_conversation_tenant: { Args: { _conv_id: string }; Returns: string }
      get_current_room_booking: {
        Args: { p_room_id: string }
        Returns: {
          actual_check_in: string
          actual_check_out: string
          amount_paid: number
          booking_hours: number
          booking_months: number
          booking_source: string
          booking_type: string
          check_in_date: string
          check_out_date: string
          damage_charges: number
          deposit_amount: number
          early_checkin_charge: number
          expected_check_in_time: string
          expected_check_out_time: string
          extra_charges: number
          guest_count: number
          guest_email: string
          guest_name: string
          guest_phone: string
          hourly_rate: number
          id: string
          late_checkout_charge: number
          monthly_rate: number
          notes: string
          paid_at: string
          payment_status: string
          room_price: number
          service_charges: number
          service_fee_amount: number
          service_fee_rate: number
          status: string
          subtotal: number
          total_amount: number
          vat_amount: number
          vat_rate: number
        }[]
      }
      get_current_user_role: { Args: never; Returns: string }
      get_current_user_tenant_id: { Args: never; Returns: string }
      get_daily_occupancy_trend: {
        Args: {
          p_end_date?: string
          p_hotel_id?: string
          p_start_date?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_dashboard_stats: {
        Args: { p_hotel_id?: string; p_tenant_id: string }
        Returns: Json
      }
      get_dead_stock_report: {
        Args: {
          _days_threshold?: number
          _hotel_id?: string
          _tenant_id: string
        }
        Returns: {
          asset_group: Database["public"]["Enums"]["asset_group"]
          category_id: string
          days_since_last_out: number
          hotel_id: string
          item_code: string
          item_id: string
          item_name: string
          last_outbound_at: string
          quantity_in_stock: number
          total_value: number
          unit_price: number
        }[]
      }
      get_distribution_order_detail: {
        Args: { p_order_id: string }
        Returns: Json
      }
      get_distribution_orders_count: {
        Args: {
          p_assigned_to?: string
          p_floor?: number
          p_hotel_id?: string
          p_shift_code?: string
          p_shift_date?: string
          p_status?: string
          p_tenant_id: string
        }
        Returns: number
      }
      get_distribution_orders_filtered: {
        Args: {
          p_assigned_to?: string
          p_floor?: number
          p_hotel_id?: string
          p_limit?: number
          p_offset?: number
          p_shift_code?: string
          p_shift_date?: string
          p_status?: string
          p_tenant_id: string
        }
        Returns: {
          assigned_to: string
          assigned_to_name: string
          completed_at: string
          created_at: string
          created_by: string
          created_by_name: string
          floor: number
          hotel_id: string
          hotel_name: string
          id: string
          notes: string
          order_code: string
          released_at: string
          rooms_completed: number
          shift_code: string
          shift_date: string
          started_at: string
          status: string
          total_items: number
          total_rooms: number
        }[]
      }
      get_effective_permissions: {
        Args: { _user_id: string }
        Returns: {
          action: string
          module: string
          source: string
        }[]
      }
      get_einvoice_password: { Args: { _config_id: string }; Returns: string }
      get_financial_report: {
        Args: {
          p_end_date: string
          p_hotel_id: string
          p_start_date: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_floor_plan: { Args: { p_hotel_id: string }; Returns: Json }
      get_floor_plan_live: { Args: { p_hotel_id: string }; Returns: Json }
      get_hotel_performance_stats: {
        Args: {
          p_from_date: string
          p_hotel_id: string
          p_tenant_id: string
          p_to_date: string
        }
        Returns: Json
      }
      get_hotels_breakdown_stats: {
        Args: { p_tenant_id: string }
        Returns: {
          hotel_code: string
          hotel_id: string
          hotel_name: string
          in_laundry: number
          in_stock: number
          in_use: number
          low_stock_count: number
          total_items: number
          total_value: number
        }[]
      }
      get_hotels_performance_comparison: {
        Args: { p_from_date: string; p_tenant_id: string; p_to_date: string }
        Returns: {
          cost_per_room: number
          efficiency_score: number
          hotel_code: string
          hotel_id: string
          hotel_name: string
          inventory_turnover_rate: number
          inventory_value: number
          laundry_cost: number
          laundry_quality: number
          maintenance_completion_rate: number
          maintenance_cost: number
          purchase_value: number
          total_operating_cost: number
          total_rooms: number
        }[]
      }
      get_inventory_dashboard_stats: {
        Args: { p_hotel_id: string; p_tenant_id: string }
        Returns: Json
      }
      get_inventory_report: {
        Args: {
          p_end_date: string
          p_hotel_id: string
          p_start_date: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_inventory_transactions_filtered:
        | {
            Args: {
              p_category_id?: string
              p_created_by?: string
              p_date_from?: string
              p_date_to?: string
              p_hotel_id?: string
              p_limit?: number
              p_offset?: number
              p_search?: string
              p_tenant_id: string
              p_transaction_type?: string
            }
            Returns: {
              category_name: string
              created_at: string
              created_by: string
              created_by_avatar: string
              created_by_name: string
              from_location: string
              id: string
              item_code: string
              item_id: string
              item_images: string[]
              item_name: string
              notes: string
              quantity: number
              quantity_after: number
              quantity_before: number
              to_location: string
              total_count: number
              total_value: number
              transaction_category: string
              transaction_code: string
              transaction_type: string
              unit_price: number
            }[]
          }
        | {
            Args: {
              p_category_id?: string
              p_created_by?: string
              p_date_from?: string
              p_date_to?: string
              p_hotel_id?: string
              p_limit?: number
              p_offset?: number
              p_page?: number
              p_page_size?: number
              p_search?: string
              p_tenant_id: string
              p_transaction_type?: string
            }
            Returns: {
              category_name: string
              created_at: string
              created_by: string
              created_by_avatar: string
              created_by_name: string
              from_location: string
              id: string
              item_code: string
              item_id: string
              item_images: string[]
              item_name: string
              notes: string
              quantity: number
              quantity_after: number
              quantity_before: number
              to_location: string
              total_count: number
              total_value: number
              transaction_category: string
              transaction_code: string
              transaction_type: string
              unit_price: number
            }[]
          }
      get_inventory_value_over_time: {
        Args: { p_hotel_id: string; p_months?: number; p_tenant_id: string }
        Returns: {
          month: string
          stock_value: number
          value_in: number
          value_out: number
        }[]
      }
      get_item_detail: { Args: { p_item_id: string }; Returns: Json }
      get_items_filtered: {
        Args: {
          p_category_id?: string
          p_hotel_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
          p_stock_status?: string
          p_tenant_id: string
          p_warehouse_id?: string
        }
        Returns: {
          brand: string
          category_color: string
          category_id: string
          category_name: string
          code: string
          created_at: string
          description: string
          hotel_id: string
          id: string
          minimum_stock: number
          model: string
          name: string
          name_en: string
          quantity_damaged: number
          quantity_in_laundry: number
          quantity_in_stock: number
          quantity_in_use: number
          quantity_lost: number
          quantity_total: number
          reorder_point: number
          status: string
          stock_status: string
          total_count: number
          unit: string
          unit_price: number
          updated_at: string
          warehouse_breakdown: Json
        }[]
      }
      get_labor_cost: {
        Args: {
          p_end_date: string
          p_hotel_id: string
          p_start_date: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_last_room_check: {
        Args: { _room_id: string }
        Returns: {
          check_type: string
          checked_at: string
          checked_by: string
          checker_name: string
          cleanliness_score: number
          id: string
          issues_count: number
          items_complete: boolean
          notes: string
          photos: string[]
          qc_status: string
        }[]
      }
      get_latest_consumption_snapshots: {
        Args: { p_hotel_id?: string; p_limit?: number; p_tenant_id: string }
        Returns: {
          avg_daily_consumption: number
          created_at: string
          hotel_id: string
          id: string
          item_id: string
          qty_consumed_30d: number
          qty_consumed_7d: number
          qty_consumed_90d: number
          snapshot_date: string
          stock_days_remaining: number | null
          stock_on_date: number
          tenant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "consumption_snapshots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_laundry_batch_detail: { Args: { p_batch_id: string }; Returns: Json }
      get_laundry_batches_filtered: {
        Args: {
          p_from_date?: string
          p_hotel_id?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_status?: string
          p_tenant_id: string
          p_to_date?: string
          p_vendor_id?: string
        }
        Returns: {
          actual_cost: number
          actual_return_date: string
          batch_code: string
          created_at: string
          delivery_date: string
          estimated_cost: number
          expected_return_date: string
          hotel_id: string
          id: string
          notes: string
          status: string
          tenant_id: string
          total_count: number
          total_items: number
          total_weight_kg: number
          updated_at: string
          vendor_id: string
          vendor_logo: string
          vendor_name: string
          vendor_rating: number
        }[]
      }
      get_laundry_dashboard_stats: {
        Args: { p_hotel_id?: string; p_tenant_id: string }
        Returns: Json
      }
      get_laundry_report: {
        Args: {
          p_end_date: string
          p_hotel_id: string
          p_start_date: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_low_stock_by_warehouses: {
        Args: { p_hotel_id?: string; p_limit?: number; p_tenant_id: string }
        Returns: {
          category_name: string
          item_code: string
          item_id: string
          item_name: string
          minimum_stock: number
          quantity: number
          shortage: number
          unit_price: number
          warehouse_code: string
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_low_stock_items: {
        Args: { p_hotel_id: string; p_limit?: number; p_tenant_id: string }
        Returns: {
          category_id: string
          category_name: string
          code: string
          id: string
          images: string[]
          minimum_stock: number
          name: string
          quantity_in_stock: number
          reorder_point: number
          shortage: number
          shortage_percent: number
          unit_price: number
        }[]
      }
      get_maintenance_dashboard: {
        Args: { p_hotel_id?: string; p_tenant_id: string }
        Returns: Json
      }
      get_maintenance_report: {
        Args: {
          p_end_date?: string
          p_hotel_id?: string
          p_start_date?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_missing_items_for_rooms: {
        Args: { p_room_ids: string[] }
        Returns: {
          current_qty: number
          item_id: string
          item_name: string
          item_stock: number
          missing_qty: number
          room_id: string
          room_number: string
          standard_qty: number
        }[]
      }
      get_missing_items_from_room_detail: {
        Args: { p_room_ids: string[] }
        Returns: {
          current_qty: number
          item_code: string
          item_id: string
          item_name: string
          item_stock: number
          missing_qty: number
          room_id: string
          room_number: string
          standard_qty: number
        }[]
      }
      get_monthly_expenses: {
        Args: { p_hotel_id?: string; p_months: number; p_tenant_id: string }
        Returns: {
          laundry: number
          maintenance: number
          month: string
          purchase: number
          total: number
        }[]
      }
      get_monthly_laundry_expenses: {
        Args: { p_hotel_id?: string; p_tenant_id: string; p_year?: number }
        Returns: {
          actual_cost: number
          estimated_cost: number
          month: string
          total_batches: number
          total_items: number
        }[]
      }
      get_pending_tenants: {
        Args: never
        Returns: {
          created_at: string
          owner_email: string
          owner_name: string
          subscription_tier: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      get_pricing_health: { Args: { p_hotel_id?: string }; Returns: Json }
      get_qc_daily_trend: {
        Args: { _days?: number; _hotel_id?: string; _tenant_id: string }
        Returns: {
          day: string
          rework_rate_pct: number
          rework_tasks: number
          total_tasks: number
        }[]
      }
      get_qc_floor_stats: {
        Args: { _days?: number; _hotel_id?: string; _tenant_id: string }
        Returns: {
          floor: number
          hotel_id: string
          pending_tasks: number
          rework_rate_pct: number
          rework_tasks: number
          total_tasks: number
        }[]
      }
      get_qc_staff_stats: {
        Args: { _days?: number; _hotel_id?: string; _tenant_id: string }
        Returns: {
          approved_count: number
          full_name: string
          hotel_id: string
          pending_count: number
          rework_count: number
          rework_rate_pct: number
          total_completed: number
          user_id: string
        }[]
      }
      get_recent_activities: {
        Args: { p_hotel_id?: string; p_limit?: number; p_tenant_id: string }
        Returns: {
          created_at: string
          description: string
          id: string
          metadata: Json
          type: string
          user_avatar: string
          user_name: string
        }[]
      }
      get_room_checks_report: {
        Args: {
          p_end_date?: string
          p_hotel_id?: string
          p_start_date?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_room_detail: { Args: { p_room_id: string }; Returns: Json }
      get_room_distribution_history: {
        Args: { p_room_id: string }
        Returns: {
          assigned_to_name: string
          confirmed_at: string
          confirmed_by_name: string
          created_at: string
          delivered_at: string
          items: Json
          order_code: string
          order_id: string
          order_status: string
          rejection_reason: string
          room_status: string
          total_items: number
          total_quantity: number
        }[]
      }
      get_room_items_with_standards: {
        Args: { p_room_id: string }
        Returns: {
          asset_group: string
          category_id: string
          category_name: string
          condition: string
          default_item_type: string
          id: string
          is_chargeable: boolean
          item_code: string
          item_id: string
          item_name: string
          item_type: string
          notes: string
          quantity: number
          room_id: string
          standard_quantity: number
          unit: string
          unit_price: number
        }[]
      }
      get_room_standards: {
        Args: { p_hotel_id: string; p_room_type: string }
        Returns: {
          category_color: string
          category_name: string
          id: string
          item_code: string
          item_id: string
          item_name: string
          item_thumbnail: string
          quantity: number
        }[]
      }
      get_rooms_filtered: {
        Args: {
          p_floor?: number
          p_hotel_id?: string
          p_missing_items_only?: boolean
          p_room_type?: string
          p_search?: string
          p_status?: string
          p_tenant_id: string
        }
        Returns: {
          amenities: string[]
          area_sqm: number
          base_price: number
          bed_type: string
          created_at: string
          floor: number
          has_balcony: boolean
          has_window: boolean
          hotel_code: string
          hotel_id: string
          hotel_name: string
          id: string
          items_in_laundry: number
          last_check_at: string
          last_check_score: number
          max_guests: number
          missing_items: number
          notes: string
          room_number: string
          room_type: string
          smoking_allowed: boolean
          status: string
          tenant_id: string
          total_items: number
          updated_at: string
          view_type: string
        }[]
      }
      get_rooms_report_stats: {
        Args: {
          p_end_date?: string
          p_hotel_id?: string
          p_start_date?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_stale_sessions_for_reminder: {
        Args: never
        Returns: {
          check_type: string
          duration_minutes: number
          hotel_id: string
          room_id: string
          room_number: string
          session_id: string
          started_at: string
          tenant_id: string
          user_id: string
          user_name: string
        }[]
      }
      get_stock_adjustments_filtered: {
        Args: {
          p_adjustment_type?: string
          p_created_by?: string
          p_date_from?: string
          p_date_to?: string
          p_hotel_id?: string
          p_limit?: number
          p_offset?: number
          p_status?: string
          p_tenant_id: string
        }
        Returns: {
          adjustment_code: string
          adjustment_type: string
          approved_by: string
          approved_by_name: string
          assigned_to: string[]
          assigned_to_names: string[]
          completed_at: string
          created_at: string
          created_by: string
          created_by_name: string
          id: string
          notes: string
          scheduled_date: string
          started_at: string
          status: string
          total_count: number
          total_discrepancies: number
          total_items_checked: number
          total_value_difference: number
          updated_at: string
        }[]
      }
      get_stock_audit_report: {
        Args: {
          p_end_date?: string
          p_hotel_id?: string
          p_start_date?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_super_admin_dashboard_stats: { Args: never; Returns: Json }
      get_tape_chart: {
        Args: { p_days?: number; p_hotel_id: string; p_start_date: string }
        Returns: Json
      }
      get_tenant_billing_summary: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      get_top_items: {
        Args: { p_hotel_id?: string; p_limit?: number; p_tenant_id: string }
        Returns: {
          category_color: string
          category_name: string
          code: string
          id: string
          name: string
          quantity_in_use: number
          quantity_total: number
          stock_status: string
          thumbnail: string
          utilization_rate: number
        }[]
      }
      get_turnover_analysis: {
        Args: { p_hotel_id: string; p_months?: number; p_tenant_id: string }
        Returns: {
          avg_stock: number
          category_name: string
          days_in_stock: number
          item_code: string
          item_id: string
          item_name: string
          status: string
          total_usage: number
          turnover_rate: number
        }[]
      }
      get_user_hotels: {
        Args: { p_user_id: string }
        Returns: {
          city: string
          code: string
          id: string
          name: string
          status: string
          total_rooms: number
        }[]
      }
      get_user_level: { Args: { _user_id: string }; Returns: string }
      get_user_levels: {
        Args: never
        Returns: {
          code: string
          description: string
          hierarchy_level: number
          id: string
          name: string
        }[]
      }
      get_user_permissions: {
        Args: { _user_id: string }
        Returns: {
          action: string
          code: string
          module: string
          name: string
          source: string
        }[]
      }
      get_user_permissions_summary: {
        Args: { p_user_id: string }
        Returns: {
          can_approve: boolean
          can_assign: boolean
          can_create: boolean
          can_delete: boolean
          can_export: boolean
          can_manage: boolean
          can_update: boolean
          can_view: boolean
          module: string
        }[]
      }
      get_user_primary_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_subordinates: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          subordinate_count: number
          user_level_code: string
        }[]
      }
      get_users_by_hotel: {
        Args: {
          p_hotel_id?: string
          p_tenant_id: string
          p_user_id?: string
          p_user_level?: string
        }
        Returns: {
          account_locked: boolean | null
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          deleted_at: string | null
          department: string | null
          email: string
          full_name: string
          hotel_id: string | null
          hourly_wage_vnd: number | null
          id: string
          is_primary_owner: boolean | null
          is_super_admin: boolean | null
          last_login_at: string | null
          last_login_ip: unknown
          locked_reason: string | null
          login_count: number | null
          metadata: Json | null
          monthly_salary_vnd: number | null
          must_change_password: boolean | null
          notes: string | null
          phone: string | null
          position_id: string | null
          reports_to: string | null
          role: string
          status: string | null
          telegram_username: string | null
          tenant_id: string | null
          updated_at: string | null
          user_level_code: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_vat_claim_public: { Args: { p_token: string }; Returns: Json }
      get_vendor_performance: {
        Args: { p_days?: number; p_vendor_id: string }
        Returns: Json
      }
      get_warehouse_stock_summary: {
        Args: { p_warehouse_id: string }
        Returns: {
          category_name: string
          item_code: string
          item_id: string
          item_name: string
          minimum_stock: number
          quantity: number
          stock_status: string
        }[]
      }
      get_workflow_analytics: {
        Args: { p_period?: string; p_workflow_id: string }
        Returns: Json
      }
      handle_successful_payment: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      handover_batch: {
        Args: { p_actor_id?: string; p_adjustments?: Json; p_batch_id: string }
        Returns: Json
      }
      handover_stop_create_next_route: {
        Args: {
          p_actor_id?: string
          p_next_assignee_id?: string
          p_next_shift_code: string
          p_room_order_id: string
        }
        Returns: Json
      }
      has_permission: {
        Args: { _permission_code: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_user_level: {
        Args: { _level_code: string; _user_id: string }
        Returns: boolean
      }
      has_user_permission: {
        Args: { p_action: string; p_module: string; p_user_id: string }
        Returns: boolean
      }
      ignore_reorder_suggestion: {
        Args: {
          _ignore_days?: number
          _reason?: string
          _suggestion_id: string
        }
        Returns: Json
      }
      increment_quantity_in_laundry: {
        Args: { p_item_id: string; p_quantity: number }
        Returns: undefined
      }
      increment_staff_stat: {
        Args: {
          p_hotel_id: string
          p_increment?: number
          p_stat_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      increment_workflow_stats: {
        Args: { p_success: boolean; p_workflow_id: string }
        Returns: undefined
      }
      initialize_warehouse_stock: {
        Args: {
          p_hotel_id: string
          p_tenant_id: string
          p_warehouse_id: string
        }
        Returns: number
      }
      is_conversation_admin: {
        Args: { _conv_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { _conv_id: string; _user_id: string }
        Returns: boolean
      }
      is_distribution_leader: { Args: { _user_id: string }; Returns: boolean }
      is_level_higher_or_equal: {
        Args: { _min_level_code: string; _user_id: string }
        Returns: boolean
      }
      is_manager: { Args: never; Returns: boolean }
      is_manager_or_above: { Args: { _user: string }; Returns: boolean }
      is_owner_user: { Args: never; Returns: boolean }
      is_qc_manager: { Args: { _user_id: string }; Returns: boolean }
      is_route_assignee: {
        Args: { _order_id: string; _user_id: string }
        Returns: boolean
      }
      is_storekeeper: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_tenant_owner: { Args: never; Returns: boolean }
      is_tenant_read_only: { Args: { p_tenant_id: string }; Returns: boolean }
      leave_or_remove_conversation_member: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: undefined
      }
      lift_expired_dnd_oos: { Args: never; Returns: Json }
      log_activity: {
        Args: {
          p_action: string
          p_description: string
          p_entity_id: string
          p_entity_name: string
          p_entity_type: string
          p_new_values?: Json
          p_old_values?: Json
          p_tenant_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      log_state_transition: {
        Args: {
          p_action: string
          p_context?: Json
          p_from_state: string
          p_hotel_id: string
          p_reason?: string
          p_record_id: string
          p_table_name: string
          p_tenant_id: string
          p_to_state: string
        }
        Returns: number
      }
      manager_override_charge: {
        Args: {
          p_charge_id: string
          p_decision: string
          p_override_reason: string
        }
        Returns: Json
      }
      mark_batch_partially_received: {
        Args: { _batch_id: string; _items: Json }
        Returns: Json
      }
      mark_batches_compensation_needed: { Args: never; Returns: Json }
      mark_booking_no_show: {
        Args: {
          _booking_id: string
          _reason?: string
          _refund_deposit?: boolean
        }
        Returns: {
          actual_check_in: string | null
          actual_check_out: string | null
          amount_paid: number | null
          booking_group_id: string | null
          booking_hours: number | null
          booking_months: number | null
          booking_reference: string | null
          booking_source: string | null
          booking_type: string
          check_in_date: string
          check_out_date: string
          created_at: string | null
          created_by: string | null
          damage_charges: number | null
          damage_items: Json | null
          damage_notes: string | null
          deposit_amount: number | null
          early_checkin_charge: number | null
          expected_check_in_time: string | null
          expected_check_out_time: string | null
          extra_charges: number | null
          guest_address: string | null
          guest_count: number | null
          guest_date_of_birth: string | null
          guest_email: string | null
          guest_gender: string | null
          guest_id: string | null
          guest_id_image_url: string | null
          guest_id_number: string | null
          guest_id_type: string | null
          guest_name: string
          guest_nationality: string | null
          guest_phone: string | null
          hotel_id: string
          hourly_end_time: string | null
          hourly_rate: number | null
          hourly_start_time: string | null
          id: string
          late_checkout_charge: number | null
          monthly_rate: number | null
          net_revenue: number | null
          notes: string | null
          ota_commission_amount: number | null
          ota_commission_rate: number | null
          ota_paid_amount: number | null
          ota_payment_type: string | null
          overnight_end_time: string | null
          overnight_rate: number | null
          overnight_start_time: string | null
          paid_at: string | null
          payment_status: string | null
          price_breakdown: Json | null
          room_id: string
          room_price: number | null
          service_charges: number | null
          service_fee_amount: number | null
          service_fee_rate: number | null
          skipper_amount_loss: number | null
          skipper_amount_owed: number | null
          skipper_at: string | null
          skipper_marked_at: string | null
          skipper_marked_by: string | null
          skipper_note: string | null
          skipper_reason: string | null
          sleep_out_at: string | null
          sleep_out_note: string | null
          sleep_out_reason: string | null
          status: string
          subtotal: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
          vat_amount: number | null
          vat_rate: number | null
        }
        SetofOptions: {
          from: "*"
          to: "room_bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_cannot_access: {
        Args: {
          p_actor_id?: string
          p_exception_reason?: string
          p_exception_type: string
          p_room_order_id: string
        }
        Returns: Json
      }
      mark_conversation_read: {
        Args: { _conversation_id: string; _up_to_message_id?: string }
        Returns: undefined
      }
      mark_vat_claim_issued: {
        Args: {
          p_claim_id: string
          p_lookup_code: string
          p_pdf_path: string
          p_provider: string
        }
        Returns: undefined
      }
      merge_guests: {
        Args: { p_source_ids: string[]; p_target_id: string }
        Returns: Json
      }
      move_booking: {
        Args: {
          p_booking_id: string
          p_new_check_in: string
          p_new_check_out: string
          p_new_room_id: string
        }
        Returns: Json
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      outbox_next_retry_at: { Args: { _retry_count: number }; Returns: string }
      perform_checkin: {
        Args: {
          p_booking_id: string
          p_early_checkin_charge?: number
          p_room_id: string
        }
        Returns: Json
      }
      perform_checkout: {
        Args: {
          p_booking_id: string
          p_check_out_date?: string
          p_damage_charges?: number
          p_damage_items?: Json
          p_damage_notes?: string
          p_late_checkout_charge?: number
          p_new_amount_paid?: number
          p_room_id: string
          p_service_charges?: number
          p_subtotal?: number
        }
        Returns: Json
      }
      perform_group_checkout: {
        Args: { p_checkouts: Json }
        Returns: Json
      }
      prepare_checkout_amounts: {
        Args: {
          p_booking_id: string
          p_damage_charges?: number
          p_damage_items?: Json
          p_damage_notes?: string
          p_late_checkout_charge?: number
          p_room_id: string
          p_service_charges?: number
          p_subtotal?: number
        }
        Returns: Json
      }
      prepare_group_checkout_amounts: {
        Args: { p_checkouts: Json }
        Returns: Json
      }
      perform_quick_room_check: {
        Args: {
          _check_type?: string
          _notes?: string
          _photos?: string[]
          _room_id: string
        }
        Returns: Json
      }
      preview_asset_group_mapping: {
        Args: { _hotel_id?: string; _tenant_id: string }
        Returns: {
          confidence: string
          current_group: Database["public"]["Enums"]["asset_group"]
          item_code: string
          item_id: string
          item_name: string
          item_type: string
          needs_review: boolean
          suggested_group: Database["public"]["Enums"]["asset_group"]
        }[]
      }
      process_expired_subscriptions: { Args: never; Returns: undefined }
      process_room_check_issue_outbox: {
        Args: { _limit?: number }
        Returns: Json
      }
      qc_approve_task: {
        Args: { _notes?: string; _score_override?: number; _task_id: string }
        Returns: Json
      }
      qc_escalate_overdue: { Args: never; Returns: number }
      qc_force_approve: {
        Args: { _reason: string; _task_id: string }
        Returns: Json
      }
      qc_reject_task: {
        Args: { _categories?: string[]; _reason: string; _task_id: string }
        Returns: Json
      }
      queue_email_notification: {
        Args: {
          p_body_html: string
          p_metadata?: Json
          p_notification_type: string
          p_subject: string
          p_tenant_id: string
          p_to_email: string
          p_user_id: string
        }
        Returns: string
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reassign_subordinates: {
        Args: { p_new_manager_id: string; p_old_manager_id: string }
        Returns: number
      }
      receive_batch: {
        Args: { p_actor_id?: string; p_batch_id: string }
        Returns: Json
      }
      reconcile_room_check_outbox: { Args: { _hours?: number }; Returns: Json }
      record_booking_payment: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_hotel_id: string
          p_metadata?: Json
          p_payment_method: string
          p_tenant_id: string
          p_total_amount?: number
          p_transaction_reference?: string
        }
        Returns: Json
      }
      refresh_consumption_snapshots: {
        Args: { _hotel_id?: string; _tenant_id: string }
        Returns: Json
      }
      refresh_monthly_expenses: { Args: never; Returns: undefined }
      reject_room_delivery: {
        Args: {
          p_distribution_order_room_id: string
          p_rejected_by: string
          p_rejection_reason: string
        }
        Returns: Json
      }
      reject_task: {
        Args: { _reason: string; _task_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          awaiting_review_at: string | null
          booking_id: string | null
          cancelled_at: string | null
          checkout_inspection_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          distribution_order_room_id: string | null
          due_at: string | null
          hotel_id: string
          id: string
          notes: string | null
          priority: string
          qc_due_at: string | null
          qc_required: boolean
          qc_status: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_by: string | null
          rework_count: number
          room_check_id: string | null
          room_id: string
          started_at: string | null
          status: string
          task_type: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "housekeeping_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_tenant: {
        Args: { p_admin_id: string; p_reason: string; p_tenant_id: string }
        Returns: Json
      }
      rename_chat_group: {
        Args: { _conversation_id: string; _name: string }
        Returns: undefined
      }
      reopen_room_check: {
        Args: { _check_id: string; _reason?: string }
        Returns: Json
      }
      reschedule_booking_checkin: {
        Args: {
          _booking_id: string
          _new_check_in_date: string
          _new_check_out_date: string
          _reason?: string
        }
        Returns: {
          actual_check_in: string | null
          actual_check_out: string | null
          amount_paid: number | null
          booking_group_id: string | null
          booking_hours: number | null
          booking_months: number | null
          booking_reference: string | null
          booking_source: string | null
          booking_type: string
          check_in_date: string
          check_out_date: string
          created_at: string | null
          created_by: string | null
          damage_charges: number | null
          damage_items: Json | null
          damage_notes: string | null
          deposit_amount: number | null
          early_checkin_charge: number | null
          expected_check_in_time: string | null
          expected_check_out_time: string | null
          extra_charges: number | null
          guest_address: string | null
          guest_count: number | null
          guest_date_of_birth: string | null
          guest_email: string | null
          guest_gender: string | null
          guest_id: string | null
          guest_id_image_url: string | null
          guest_id_number: string | null
          guest_id_type: string | null
          guest_name: string
          guest_nationality: string | null
          guest_phone: string | null
          hotel_id: string
          hourly_end_time: string | null
          hourly_rate: number | null
          hourly_start_time: string | null
          id: string
          late_checkout_charge: number | null
          monthly_rate: number | null
          net_revenue: number | null
          notes: string | null
          ota_commission_amount: number | null
          ota_commission_rate: number | null
          ota_paid_amount: number | null
          ota_payment_type: string | null
          overnight_end_time: string | null
          overnight_rate: number | null
          overnight_start_time: string | null
          paid_at: string | null
          payment_status: string | null
          price_breakdown: Json | null
          room_id: string
          room_price: number | null
          service_charges: number | null
          service_fee_amount: number | null
          service_fee_rate: number | null
          skipper_amount_loss: number | null
          skipper_amount_owed: number | null
          skipper_at: string | null
          skipper_marked_at: string | null
          skipper_marked_by: string | null
          skipper_note: string | null
          skipper_reason: string | null
          sleep_out_at: string | null
          sleep_out_note: string | null
          sleep_out_reason: string | null
          status: string
          subtotal: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
          vat_amount: number | null
          vat_rate: number | null
        }
        SetofOptions: {
          from: "*"
          to: "room_bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resize_booking: {
        Args: {
          p_booking_id: string
          p_new_check_in: string
          p_new_check_out: string
        }
        Returns: Json
      }
      resolve_daily_prices_bulk: {
        Args: {
          p_apply_to?: string
          p_from: string
          p_hotel_id?: string
          p_room_type_id: string
          p_to: string
        }
        Returns: {
          base_price: number
          date: string
          final_price: number
          is_closed: boolean
          override_price: number
          seasonals: Json
          source: string
        }[]
      }
      resolve_qc_settings: {
        Args: { _hotel_id: string; _task_type: string; _tenant_id: string }
        Returns: {
          auto_escalate: boolean
          max_rework_count: number
          qc_required: boolean
          sla_minutes: number
        }[]
      }
      resolve_today_prices_for_hotel: {
        Args: { p_apply_to?: string; p_hotel_id: string }
        Returns: {
          base_price: number
          final_price: number
          has_override: boolean
          has_seasonal: boolean
          is_closed: boolean
          room_type_code: string
          room_type_id: string
          room_type_name: string
        }[]
      }
      retry_stay_registration: { Args: { p_id: string }; Returns: undefined }
      retry_stop: {
        Args: { p_actor_id?: string; p_room_order_id: string }
        Returns: Json
      }
      return_to_stock_for_stop: {
        Args: { p_actor_id?: string; p_room_order_id: string }
        Returns: Json
      }
      review_chargeable_consumptions: {
        Args: { p_decision: string; p_ids: string[]; p_reason?: string }
        Returns: {
          updated_count: number
        }[]
      }
      review_room_check_issue: {
        Args: { p_decision: string; p_issue_id: string; p_reason?: string }
        Returns: Json
      }
      room_type_pricing_code: { Args: { p_room_type: string }; Returns: string }
      run_auto_reorder_daily: { Args: never; Returns: Json }
      schedule_renewal_reminders: { Args: never; Returns: undefined }
      send_chat_message: {
        Args: {
          _attachments?: Json
          _body: string
          _client_msg_id?: string
          _conversation_id: string
          _mentioned_user_ids?: string[]
          _parent_message_id?: string
        }
        Returns: string
      }
      send_draft_batch: {
        Args: {
          p_batch_id: string
          p_delivery_date: string
          p_delivery_staff_id: string
          p_expected_return_date: string
          p_notes?: string
          p_receiver_name: string
          p_vendor_id: string
        }
        Returns: Json
      }
      set_conversation_mute: {
        Args: { _conversation_id: string; _muted_until: string }
        Returns: undefined
      }
      set_einvoice_password: {
        Args: { _config_id: string; _password: string }
        Returns: string
      }
      set_tenant_read_only: {
        Args: { p_reason: string; p_tenant_id: string }
        Returns: undefined
      }
      settle_batch_compensation: {
        Args: {
          _batch_id: string
          _compensation_amount: number
          _notes?: string
        }
        Returns: Json
      }
      settle_booking_payment: {
        Args: {
          p_gateway_transaction_id?: string
          p_payment_id: string
        }
        Returns: Json
      }
      settle_subscription_payment: {
        Args: {
          p_gateway_transaction_id?: string
          p_payment_id: string
        }
        Returns: Json
      }
      setup_new_tenant: {
        Args: {
          p_hotel_address: string
          p_hotel_email: string
          p_hotel_name: string
          p_hotel_phone: string
          p_tenant_email: string
          p_tenant_name: string
          p_tenant_phone: string
          p_total_rooms: number
          p_user_id: string
        }
        Returns: Json
      }
      setup_room_initial: {
        Args: {
          p_reset_quantities?: boolean
          p_room_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      submit_delivery_lean: {
        Args: {
          _distribution_order_room_id: string
          _items_actual?: Json
          _notes?: string
          _photos?: string[]
          _room_id: string
          _task_id?: string
        }
        Returns: Json
      }
      submit_replenish_lean: {
        Args: {
          _cleaning_requested?: boolean
          _items?: Json
          _notes?: string
          _photos?: string[]
          _room_id: string
          _task_id?: string
        }
        Returns: Json
      }
      submit_room_check_for_qc: {
        Args: { _room_check_id: string; _task_id: string }
        Returns: Json
      }
      submit_room_check_lean: {
        Args: {
          _check_type: string
          _items_consumed?: Json
          _items_damaged?: Json
          _items_lost?: Json
          _items_missing?: Json
          _items_replaced?: Json
          _items_sent_to_laundry?: Json
          _notes?: string
          _photos?: string[]
          _room_id: string
          _started_at: string
          _task_id?: string
        }
        Returns: Json
      }
      submit_vat_claim_public: {
        Args: {
          p_company_address: string
          p_company_name: string
          p_email: string
          p_tax_code: string
          p_token: string
        }
        Returns: Json
      }
      sync_categories_for_hotel: {
        Args: { p_hotel_id: string; p_tenant_id: string }
        Returns: Json
      }
      sync_room_types_from_rooms: {
        Args: { p_hotel_id?: string }
        Returns: number
      }
      toggle_message_reaction: {
        Args: { _emoji: string; _message_id: string }
        Returns: boolean
      }
      transfer_booking_room: {
        Args: { p_booking_id: string; p_new_room_id: string; p_reason?: string }
        Returns: Json
      }
      transition_adjustment_status: {
        Args: {
          _adjustment_id: string
          _force?: boolean
          _reason?: string
          _to_status: string
        }
        Returns: {
          adjustment_code: string
          adjustment_type: string
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          assigned_to: string[] | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          hotel_id: string
          id: string
          notes: string | null
          scheduled_date: string | null
          started_at: string | null
          status: string | null
          tenant_id: string
          total_discrepancies: number | null
          total_items_checked: number | null
          total_value_difference: number | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "stock_adjustments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_booking_status: {
        Args: {
          _amount_owed?: number
          _booking_id: string
          _reason?: string
          _to_status: string
        }
        Returns: {
          actual_check_in: string | null
          actual_check_out: string | null
          amount_paid: number | null
          booking_group_id: string | null
          booking_hours: number | null
          booking_months: number | null
          booking_reference: string | null
          booking_source: string | null
          booking_type: string
          check_in_date: string
          check_out_date: string
          created_at: string | null
          created_by: string | null
          damage_charges: number | null
          damage_items: Json | null
          damage_notes: string | null
          deposit_amount: number | null
          early_checkin_charge: number | null
          expected_check_in_time: string | null
          expected_check_out_time: string | null
          extra_charges: number | null
          guest_address: string | null
          guest_count: number | null
          guest_date_of_birth: string | null
          guest_email: string | null
          guest_gender: string | null
          guest_id: string | null
          guest_id_image_url: string | null
          guest_id_number: string | null
          guest_id_type: string | null
          guest_name: string
          guest_nationality: string | null
          guest_phone: string | null
          hotel_id: string
          hourly_end_time: string | null
          hourly_rate: number | null
          hourly_start_time: string | null
          id: string
          late_checkout_charge: number | null
          monthly_rate: number | null
          net_revenue: number | null
          notes: string | null
          ota_commission_amount: number | null
          ota_commission_rate: number | null
          ota_paid_amount: number | null
          ota_payment_type: string | null
          overnight_end_time: string | null
          overnight_rate: number | null
          overnight_start_time: string | null
          paid_at: string | null
          payment_status: string | null
          price_breakdown: Json | null
          room_id: string
          room_price: number | null
          service_charges: number | null
          service_fee_amount: number | null
          service_fee_rate: number | null
          skipper_amount_loss: number | null
          skipper_amount_owed: number | null
          skipper_at: string | null
          skipper_marked_at: string | null
          skipper_marked_by: string | null
          skipper_note: string | null
          skipper_reason: string | null
          sleep_out_at: string | null
          sleep_out_note: string | null
          sleep_out_reason: string | null
          status: string
          subtotal: number | null
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
          vat_amount: number | null
          vat_rate: number | null
        }
        SetofOptions: {
          from: "*"
          to: "room_bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_laundry_batch_status: {
        Args: { _batch_id: string; _reason?: string; _to: string }
        Returns: Json
      }
      transition_room_status: {
        Args: {
          _dnd_until?: string
          _force?: boolean
          _oos_until?: string
          _reason?: string
          _room_id: string
          _to_status: string
        }
        Returns: Json
      }
      transition_task_status: {
        Args: {
          _force?: boolean
          _reason?: string
          _task_id: string
          _to_status: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          awaiting_review_at: string | null
          booking_id: string | null
          cancelled_at: string | null
          checkout_inspection_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          distribution_order_room_id: string | null
          due_at: string | null
          hotel_id: string
          id: string
          notes: string | null
          priority: string
          qc_due_at: string | null
          qc_required: boolean
          qc_status: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_by: string | null
          rework_count: number
          room_check_id: string | null
          room_id: string
          started_at: string | null
          status: string
          task_type: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "housekeeping_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      undo_quick_room_check: {
        Args: { _check_id: string; _reason?: string }
        Returns: Json
      }
      undo_room_delivery_confirmation: {
        Args: { p_distribution_order_room_id: string; p_performed_by: string }
        Returns: Json
      }
      update_booking_amount_paid: {
        Args: {
          p_amount_to_add: number
          p_booking_id: string
          p_total_amount: number
        }
        Returns: Json
      }
      update_distribution_order: {
        Args: {
          p_assigned_to?: string
          p_notes?: string
          p_order_id: string
          p_rooms?: Json
        }
        Returns: Json
      }
      update_hotel_floor_map_cell_size: {
        Args: { p_hotel_id: string; p_size: Json }
        Returns: Json
      }
      update_room_status_safe: {
        Args: {
          p_expected_updated_at?: string
          p_new_status: string
          p_room_id: string
        }
        Returns: Json
      }
      update_tenant_usage: { Args: { p_tenant_id: string }; Returns: undefined }
      user_has_hotel_access: {
        Args: { p_hotel_id: string; p_user_id: string }
        Returns: boolean
      }
      user_has_subordinates: { Args: { p_user_id: string }; Returns: boolean }
      validate_booking_dates: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_exclude_booking_id?: string
          p_room_id: string
        }
        Returns: Json
      }
      validate_hourly_against_daily: {
        Args: {
          p_booking_date: string
          p_exclude_booking_id?: string
          p_room_id: string
        }
        Returns: Json
      }
      validate_hourly_booking: {
        Args: {
          p_end_time: string
          p_exclude_booking_id?: string
          p_room_id: string
          p_start_time: string
        }
        Returns: Json
      }
      validate_plan_change: {
        Args: { p_new_plan_id: string; p_tenant_id: string }
        Returns: Json
      }
      validate_room_check_context: {
        Args: { p_check_type: string; p_room_id: string; p_task_id?: string }
        Returns: Json
      }
      works_at_same_hotel: {
        Args: { target_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      announcement_kind:
        | "promo_popup"
        | "version_update"
        | "ad_banner"
        | "system_notice"
      announcement_placement:
        | "popup_center"
        | "top_banner"
        | "bottom_strip"
        | "inline_card"
      announcement_variant: "info" | "success" | "warning" | "promo"
      app_role:
        | "super_admin"
        | "owner"
        | "hotel_manager"
        | "department_manager"
        | "staff"
      asset_group:
        | "linen"
        | "consumable_free"
        | "minibar"
        | "stationery"
        | "equipment_large"
        | "electronic_accessory"
        | "furniture"
        | "glassware"
        | "bathroom_hardware"
      charge_status:
        | "not_applicable"
        | "not_chargeable"
        | "pending_manager_review"
        | "pending_fo_confirm"
        | "fo_rejected"
        | "chargeable_confirmed"
        | "chargeable_rejected"
      conversation_member_role: "admin" | "member"
      conversation_type: "direct" | "group"
      einvoice_environment: "sandbox" | "production"
      einvoice_file_type: "pdf" | "xml" | "zip" | "signed_xml" | "other"
      einvoice_invoice_type: "normal" | "adjustment" | "replacement"
      einvoice_provider: "viettel_sinvoice" | "misa" | "vnpt" | "easyinvoice"
      einvoice_sign_type: "cloud" | "usb_token"
      einvoice_status:
        | "draft"
        | "queued"
        | "processing"
        | "signing"
        | "issued"
        | "cancelled"
        | "adjusted"
        | "replaced"
        | "failed"
      hk_qc_mode: "self" | "peer" | "strict"
      issue_role: "primary_issue" | "derived_action"
      item_type: "linen" | "consumable" | "equipment" | "furniture"
      payment_anomaly_status: "open" | "resolved" | "ignored"
      payment_anomaly_type: "unmatched" | "amount_mismatch" | "duplicate"
      photo_evidence_mode: "none" | "on_issue" | "always"
      service_category:
        | "wellness"
        | "transport"
        | "food_beverage"
        | "laundry_extra"
        | "other"
      warehouse_location_type: "warehouse" | "room" | "floor" | "external"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      announcement_kind: [
        "promo_popup",
        "version_update",
        "ad_banner",
        "system_notice",
      ],
      announcement_placement: [
        "popup_center",
        "top_banner",
        "bottom_strip",
        "inline_card",
      ],
      announcement_variant: ["info", "success", "warning", "promo"],
      app_role: [
        "super_admin",
        "owner",
        "hotel_manager",
        "department_manager",
        "staff",
      ],
      asset_group: [
        "linen",
        "consumable_free",
        "minibar",
        "stationery",
        "equipment_large",
        "electronic_accessory",
        "furniture",
        "glassware",
        "bathroom_hardware",
      ],
      charge_status: [
        "not_applicable",
        "not_chargeable",
        "pending_manager_review",
        "pending_fo_confirm",
        "fo_rejected",
        "chargeable_confirmed",
        "chargeable_rejected",
      ],
      conversation_member_role: ["admin", "member"],
      conversation_type: ["direct", "group"],
      einvoice_environment: ["sandbox", "production"],
      einvoice_file_type: ["pdf", "xml", "zip", "signed_xml", "other"],
      einvoice_invoice_type: ["normal", "adjustment", "replacement"],
      einvoice_provider: ["viettel_sinvoice", "misa", "vnpt", "easyinvoice"],
      einvoice_sign_type: ["cloud", "usb_token"],
      einvoice_status: [
        "draft",
        "queued",
        "processing",
        "signing",
        "issued",
        "cancelled",
        "adjusted",
        "replaced",
        "failed",
      ],
      hk_qc_mode: ["self", "peer", "strict"],
      issue_role: ["primary_issue", "derived_action"],
      item_type: ["linen", "consumable", "equipment", "furniture"],
      payment_anomaly_status: ["open", "resolved", "ignored"],
      payment_anomaly_type: ["unmatched", "amount_mismatch", "duplicate"],
      photo_evidence_mode: ["none", "on_issue", "always"],
      service_category: [
        "wellness",
        "transport",
        "food_beverage",
        "laundry_extra",
        "other",
      ],
      warehouse_location_type: ["warehouse", "room", "floor", "external"],
    },
  },
} as const
