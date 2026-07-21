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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_merchant_access: {
        Row: {
          admin_user_id: string
          created_at: string
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          merchant_id: string
          notes: string | null
          revoked_at: string | null
          updated_at: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          merchant_id: string
          notes?: string | null
          revoked_at?: string | null
          updated_at?: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          merchant_id?: string
          notes?: string | null
          revoked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_merchant_access_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_merchant_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_merchant_access_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_merchant_access_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string | null
          action_category: string | null
          actor_email: string | null
          actor_name: string | null
          actor_role: string | null
          actor_user_id: string | null
          archived: boolean | null
          carrier_id: string | null
          changes: Json | null
          created_at: string
          error_message: string | null
          id: string
          impersonation_session_id: string | null
          impersonator_user_id: string | null
          is_impersonation: boolean
          location_id: string | null
          merchant_id: string | null
          metadata: Json | null
          organization_id: string | null
          organization_name: string | null
          organization_type: string | null
          pii_access_type: string | null
          resource_id: string | null
          resource_name: string | null
          resource_type: string | null
          severity: string | null
          staff_profile_id: string | null
          status: string | null
        }
        Insert: {
          action?: string | null
          action_category?: string | null
          actor_email?: string | null
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          archived?: boolean | null
          carrier_id?: string | null
          changes?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          impersonation_session_id?: string | null
          impersonator_user_id?: string | null
          is_impersonation?: boolean
          location_id?: string | null
          merchant_id?: string | null
          metadata?: Json | null
          organization_id?: string | null
          organization_name?: string | null
          organization_type?: string | null
          pii_access_type?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string | null
          severity?: string | null
          staff_profile_id?: string | null
          status?: string | null
        }
        Update: {
          action?: string | null
          action_category?: string | null
          actor_email?: string | null
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          archived?: boolean | null
          carrier_id?: string | null
          changes?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          impersonation_session_id?: string | null
          impersonator_user_id?: string | null
          is_impersonation?: boolean
          location_id?: string | null
          merchant_id?: string | null
          metadata?: Json | null
          organization_id?: string | null
          organization_name?: string | null
          organization_type?: string | null
          pii_access_type?: string | null
          resource_id?: string | null
          resource_name?: string | null
          resource_type?: string | null
          severity?: string | null
          staff_profile_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_impersonation_session_id_fkey"
            columns: ["impersonation_session_id"]
            isOneToOne: false
            referencedRelation: "impersonation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "audit_logs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billable_services: {
        Row: {
          additional_unit_price: number | null
          base_price_monthly: number
          card_surcharge_pct: number
          created_at: string
          display_name: string
          id: string
          included_quantity: number
          is_active: boolean
          metadata: Json
          pricing_model: string
          service_category: string
          service_code: string
          unit_label: string
          updated_at: string
        }
        Insert: {
          additional_unit_price?: number | null
          base_price_monthly: number
          card_surcharge_pct?: number
          created_at?: string
          display_name: string
          id?: string
          included_quantity?: number
          is_active?: boolean
          metadata?: Json
          pricing_model: string
          service_category: string
          service_code: string
          unit_label?: string
          updated_at?: string
        }
        Update: {
          additional_unit_price?: number | null
          base_price_monthly?: number
          card_surcharge_pct?: number
          created_at?: string
          display_name?: string
          id?: string
          included_quantity?: number
          is_active?: boolean
          metadata?: Json
          pricing_model?: string
          service_category?: string
          service_code?: string
          unit_label?: string
          updated_at?: string
        }
        Relationships: []
      }
      carriers: {
        Row: {
          clerk_org_id: string
          created_at: string | null
          id: string
          name: string
          public_metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          clerk_org_id: string
          created_at?: string | null
          id?: string
          name: string
          public_metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          clerk_org_id?: string
          created_at?: string | null
          id?: string
          name?: string
          public_metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carriers_clerk_org_id_fkey"
            columns: ["clerk_org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_drawer_operations: {
        Row: {
          amount: number
          approved_by: string | null
          balance_after: number | null
          cash_drawer_id: string
          id: string
          operation_type: string
          order_id: string | null
          payment_id: string | null
          performed_at: string
          performed_by: string
          reason: string | null
          receipt_printed: boolean | null
          requires_approval: boolean | null
          session_id: string
          vendor_id: string | null
        }
        Insert: {
          amount: number
          approved_by?: string | null
          balance_after?: number | null
          cash_drawer_id: string
          id?: string
          operation_type: string
          order_id?: string | null
          payment_id?: string | null
          performed_at?: string
          performed_by: string
          reason?: string | null
          receipt_printed?: boolean | null
          requires_approval?: boolean | null
          session_id: string
          vendor_id?: string | null
        }
        Update: {
          amount?: number
          approved_by?: string | null
          balance_after?: number | null
          cash_drawer_id?: string
          id?: string
          operation_type?: string
          order_id?: string | null
          payment_id?: string | null
          performed_at?: string
          performed_by?: string
          reason?: string | null
          receipt_printed?: boolean | null
          requires_approval?: boolean | null
          session_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_drawer_operations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_operations_cash_drawer_id_fkey"
            columns: ["cash_drawer_id"]
            isOneToOne: false
            referencedRelation: "cash_drawers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_operations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_operations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_operations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "pci_safe_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_operations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "vw_platform_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_operations_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_operations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_drawer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_operations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_drawer_sessions: {
        Row: {
          business_date: string
          cash_drawer_id: string
          closed_at: string | null
          closed_by: string | null
          closing_amount: number | null
          closing_count_details: Json | null
          closing_count_verified: boolean | null
          created_at: string
          expected_cash: number | null
          id: string
          is_blind_count: boolean | null
          location_id: string
          merchant_id: string
          opened_at: string
          opened_by: string
          opening_amount: number
          opening_count_details: Json | null
          opening_count_verified: boolean | null
          status: string | null
          variance: number | null
          variance_notes: string | null
        }
        Insert: {
          business_date?: string
          cash_drawer_id: string
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          closing_count_details?: Json | null
          closing_count_verified?: boolean | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          is_blind_count?: boolean | null
          location_id: string
          merchant_id: string
          opened_at?: string
          opened_by: string
          opening_amount: number
          opening_count_details?: Json | null
          opening_count_verified?: boolean | null
          status?: string | null
          variance?: number | null
          variance_notes?: string | null
        }
        Update: {
          business_date?: string
          cash_drawer_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_amount?: number | null
          closing_count_details?: Json | null
          closing_count_verified?: boolean | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          is_blind_count?: boolean | null
          location_id?: string
          merchant_id?: string
          opened_at?: string
          opened_by?: string
          opening_amount?: number
          opening_count_details?: Json | null
          opening_count_verified?: boolean | null
          status?: string | null
          variance?: number | null
          variance_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_drawer_sessions_cash_drawer_id_fkey"
            columns: ["cash_drawer_id"]
            isOneToOne: false
            referencedRelation: "cash_drawers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_drawers: {
        Row: {
          created_at: string
          current_session_id: string | null
          device_id: string | null
          drawer_number: number | null
          id: string
          is_active: boolean | null
          is_open: boolean | null
          location_id: string
          merchant_id: string
          name: string
          station_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_session_id?: string | null
          device_id?: string | null
          drawer_number?: number | null
          id?: string
          is_active?: boolean | null
          is_open?: boolean | null
          location_id: string
          merchant_id: string
          name: string
          station_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_session_id?: string | null
          device_id?: string | null
          drawer_number?: number | null
          id?: string
          is_active?: boolean | null
          is_open?: boolean | null
          location_id?: string
          merchant_id?: string
          name?: string
          station_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_drawers_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "cash_drawers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number | null
          id: string
          image: string | null
          is_active: boolean
          is_global: boolean | null
          location_id: string | null
          merchant_id: string
          name: string
          source_external_id: string | null
          source_system: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image?: string | null
          is_active?: boolean
          is_global?: boolean | null
          location_id?: string | null
          merchant_id: string
          name: string
          source_external_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image?: string | null
          is_active?: boolean
          is_global?: boolean | null
          location_id?: string | null
          merchant_id?: string
          name?: string
          source_external_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      category_items: {
        Row: {
          category_id: string
          created_at: string
          custom_cash_price: number | null
          custom_delivery_price: number | null
          custom_price: number | null
          display_order: number | null
          id: string
          is_available: boolean | null
          is_featured: boolean | null
          menu_id: string | null
          menu_item_id: string
          merchant_id: string
          updated_at: string | null
        }
        Insert: {
          category_id: string
          created_at?: string
          custom_cash_price?: number | null
          custom_delivery_price?: number | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_available?: boolean | null
          is_featured?: boolean | null
          menu_id?: string | null
          menu_item_id: string
          merchant_id: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string
          custom_cash_price?: number | null
          custom_delivery_price?: number | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_available?: boolean | null
          is_featured?: boolean | null
          menu_id?: string | null
          menu_item_id?: string
          merchant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_id"]
          },
          {
            foreignKeyName: "menu_item_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_categories_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_categories_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "menu_item_categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      category_modifier_groups: {
        Row: {
          category_id: string
          created_at: string
          display_order: number | null
          id: string
          location_id: string | null
          merchant_id: string
          modifier_group_id: string
          updated_at: string | null
        }
        Insert: {
          category_id: string
          created_at?: string
          display_order?: number | null
          id?: string
          location_id?: string | null
          merchant_id: string
          modifier_group_id: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string
          display_order?: number | null
          id?: string
          location_id?: string | null
          merchant_id?: string
          modifier_group_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_modifier_groups_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_modifier_groups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_modifier_groups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_modifier_groups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "category_modifier_groups_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_modifier_groups_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_modifier_groups_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      category_schedules: {
        Row: {
          category_id: string
          created_at: string
          id: string
          menu_id: string | null
          merchant_id: string | null
          schedule_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          menu_id?: string | null
          merchant_id?: string | null
          schedule_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          menu_id?: string | null
          merchant_id?: string | null
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_schedules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_schedules_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "location_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_schedules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_schedules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_schedules_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      cfd_carousel_images: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          image_url: string
          is_active: boolean | null
          location_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          location_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          location_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfd_carousel_images_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfd_carousel_images_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfd_carousel_images_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      cfd_ordering_panel_images: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          image_url: string
          is_active: boolean | null
          location_id: string
          panel_slot: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          location_id: string
          panel_slot: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          location_id?: string
          panel_slot?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfd_ordering_panel_images_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfd_ordering_panel_images_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfd_ordering_panel_images_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      chargebacks: {
        Row: {
          amount: number
          card_network: string | null
          created_at: string
          defendable: boolean | null
          defense_deadline: string | null
          defense_documents: Json | null
          defense_submitted_at: string | null
          dispute_psp_reference: string | null
          id: string
          location_id: string
          merchant_id: string
          original_payment_id: string
          reason_code: string
          reason_description: string | null
          received_at: string
          resolution: string | null
          resolution_amount: number | null
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          card_network?: string | null
          created_at?: string
          defendable?: boolean | null
          defense_deadline?: string | null
          defense_documents?: Json | null
          defense_submitted_at?: string | null
          dispute_psp_reference?: string | null
          id?: string
          location_id: string
          merchant_id: string
          original_payment_id: string
          reason_code: string
          reason_description?: string | null
          received_at?: string
          resolution?: string | null
          resolution_amount?: number | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          card_network?: string | null
          created_at?: string
          defendable?: boolean | null
          defense_deadline?: string | null
          defense_documents?: Json | null
          defense_submitted_at?: string | null
          dispute_psp_reference?: string | null
          id?: string
          location_id?: string
          merchant_id?: string
          original_payment_id?: string
          reason_code?: string
          reason_description?: string | null
          received_at?: string
          resolution?: string | null
          resolution_amount?: number | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chargebacks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargebacks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargebacks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "chargebacks_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargebacks_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargebacks_original_payment_id_fkey"
            columns: ["original_payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargebacks_original_payment_id_fkey"
            columns: ["original_payment_id"]
            isOneToOne: false
            referencedRelation: "pci_safe_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargebacks_original_payment_id_fkey"
            columns: ["original_payment_id"]
            isOneToOne: false
            referencedRelation: "vw_platform_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      clover_import_dry_runs: {
        Row: {
          committed_at: string | null
          created_at: string
          created_by_clerk_user_id: string
          expires_at: string
          file_hash: string
          file_name: string
          fingerprint: string
          id: string
          merchant_id: string
          payload: Json
          status: string
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          created_by_clerk_user_id: string
          expires_at?: string
          file_hash: string
          file_name: string
          fingerprint: string
          id?: string
          merchant_id: string
          payload: Json
          status?: string
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          created_by_clerk_user_id?: string
          expires_at?: string
          file_hash?: string
          file_name?: string
          fingerprint?: string
          id?: string
          merchant_id?: string
          payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "clover_import_dry_runs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clover_import_dry_runs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_activities: {
        Row: {
          activity_type: string
          created_at: string | null
          customer_id: string
          id: string
          merchant_id: string
          metadata: Json | null
          related_order_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          customer_id: string
          id?: string
          merchant_id: string
          metadata?: Json | null
          related_order_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          customer_id?: string
          id?: string
          merchant_id?: string
          metadata?: Json | null
          related_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_activities_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_feedback: {
        Row: {
          ambiance_rating: number | null
          comment: string | null
          created_at: string | null
          customer_id: string
          food_rating: number | null
          id: string
          is_flagged: boolean | null
          is_public: boolean | null
          location_id: string
          merchant_id: string
          order_id: string | null
          overall_rating: number
          responded_at: string | null
          responded_by: string | null
          response: string | null
          server_staff_id: string | null
          service_rating: number | null
          session_id: string | null
          source: string
          updated_at: string | null
          value_rating: number | null
        }
        Insert: {
          ambiance_rating?: number | null
          comment?: string | null
          created_at?: string | null
          customer_id: string
          food_rating?: number | null
          id?: string
          is_flagged?: boolean | null
          is_public?: boolean | null
          location_id: string
          merchant_id: string
          order_id?: string | null
          overall_rating: number
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          server_staff_id?: string | null
          service_rating?: number | null
          session_id?: string | null
          source?: string
          updated_at?: string | null
          value_rating?: number | null
        }
        Update: {
          ambiance_rating?: number | null
          comment?: string | null
          created_at?: string | null
          customer_id?: string
          food_rating?: number | null
          id?: string
          is_flagged?: boolean | null
          is_public?: boolean | null
          location_id?: string
          merchant_id?: string
          order_id?: string | null
          overall_rating?: number
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
          server_staff_id?: string | null
          service_rating?: number | null
          session_id?: string | null
          source?: string
          updated_at?: string | null
          value_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "customer_feedback_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_server_staff_id_fkey"
            columns: ["server_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          customer_id: string
          id: string
          merchant_id: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          customer_id: string
          id?: string
          merchant_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          customer_id?: string
          id?: string
          merchant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payment_methods: {
        Row: {
          billing_address_line1: string | null
          billing_postal_code: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last_four: string | null
          cardholder_name: string | null
          created_at: string
          customer_id: string
          customer_vault_id: string
          id: string
          is_active: boolean
          is_default: boolean
          last_used_at: string | null
          merchant_id: string
          payment_device_id: string
          payment_method_token: string | null
          updated_at: string
        }
        Insert: {
          billing_address_line1?: string | null
          billing_postal_code?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last_four?: string | null
          cardholder_name?: string | null
          created_at?: string
          customer_id: string
          customer_vault_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_used_at?: string | null
          merchant_id: string
          payment_device_id: string
          payment_method_token?: string | null
          updated_at?: string
        }
        Update: {
          billing_address_line1?: string | null
          billing_postal_code?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last_four?: string | null
          cardholder_name?: string | null
          created_at?: string
          customer_id?: string
          customer_vault_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_used_at?: string | null
          merchant_id?: string
          payment_device_id?: string
          payment_method_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payment_methods_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_methods_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_methods_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_methods_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_methods_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payment_methods_payment_device_id_fkey"
            columns: ["payment_device_id"]
            isOneToOne: false
            referencedRelation: "location_payment_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_saved_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          created_at: string
          customer_id: string
          delivery_notes: string | null
          id: string
          is_default: boolean
          label: string
          postal_code: string
          state: string
          updated_at: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          created_at?: string
          customer_id: string
          delivery_notes?: string | null
          id?: string
          is_default?: boolean
          label?: string
          postal_code: string
          state: string
          updated_at?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          created_at?: string
          customer_id?: string
          delivery_notes?: string | null
          id?: string
          is_default?: boolean
          label?: string
          postal_code?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_saved_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_saved_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_saved_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          allergy_notes: string | null
          anniversary: string | null
          avg_spend: number | null
          avg_tip_percent: number | null
          birthday: string | null
          company_name: string | null
          created_at: string
          dietary_preferences: string[] | null
          email: string | null
          email_opt_in: boolean | null
          email_opt_in_at: string | null
          id: string
          is_active: boolean | null
          last_order_date: string | null
          last_visit: string | null
          lifetime_spend: number | null
          marketing_unsubscribed_at: string | null
          merchant_id: string | null
          name: string | null
          notes: string | null
          phone: string | null
          preferred_language: string | null
          preferred_seating: string | null
          preferred_server_id: string | null
          preferred_table: string | null
          receipt_via_email: boolean | null
          receipt_via_sms: boolean | null
          referral_code: string | null
          referred_by_customer_id: string | null
          sms_opt_in: boolean | null
          sms_opt_in_at: string | null
          tags: string[] | null
          total_orders: number | null
          updated_at: string | null
          vip_level: string | null
          visits: number | null
        }
        Insert: {
          address?: string | null
          allergy_notes?: string | null
          anniversary?: string | null
          avg_spend?: number | null
          avg_tip_percent?: number | null
          birthday?: string | null
          company_name?: string | null
          created_at?: string
          dietary_preferences?: string[] | null
          email?: string | null
          email_opt_in?: boolean | null
          email_opt_in_at?: string | null
          id?: string
          is_active?: boolean | null
          last_order_date?: string | null
          last_visit?: string | null
          lifetime_spend?: number | null
          marketing_unsubscribed_at?: string | null
          merchant_id?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: string | null
          preferred_seating?: string | null
          preferred_server_id?: string | null
          preferred_table?: string | null
          receipt_via_email?: boolean | null
          receipt_via_sms?: boolean | null
          referral_code?: string | null
          referred_by_customer_id?: string | null
          sms_opt_in?: boolean | null
          sms_opt_in_at?: string | null
          tags?: string[] | null
          total_orders?: number | null
          updated_at?: string | null
          vip_level?: string | null
          visits?: number | null
        }
        Update: {
          address?: string | null
          allergy_notes?: string | null
          anniversary?: string | null
          avg_spend?: number | null
          avg_tip_percent?: number | null
          birthday?: string | null
          company_name?: string | null
          created_at?: string
          dietary_preferences?: string[] | null
          email?: string | null
          email_opt_in?: boolean | null
          email_opt_in_at?: string | null
          id?: string
          is_active?: boolean | null
          last_order_date?: string | null
          last_visit?: string | null
          lifetime_spend?: number | null
          marketing_unsubscribed_at?: string | null
          merchant_id?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: string | null
          preferred_seating?: string | null
          preferred_server_id?: string | null
          preferred_table?: string | null
          receipt_via_email?: boolean | null
          receipt_via_sms?: boolean | null
          referral_code?: string | null
          referred_by_customer_id?: string | null
          sms_opt_in?: boolean | null
          sms_opt_in_at?: string | null
          tags?: string[] | null
          total_orders?: number | null
          updated_at?: string | null
          vip_level?: string | null
          visits?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_preferred_server_id_fkey"
            columns: ["preferred_server_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_referred_by_customer_id_fkey"
            columns: ["referred_by_customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_referred_by_customer_id_fkey"
            columns: ["referred_by_customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_referred_by_customer_id_fkey"
            columns: ["referred_by_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_zones: {
        Row: {
          created_at: string
          delivery_fee: number | null
          delivery_fee_cents: number
          display_order: number
          estimated_minutes: number | null
          free_delivery_threshold: number | null
          free_delivery_threshold_cents: number | null
          id: string
          is_active: boolean
          min_order: number | null
          min_order_cents: number | null
          polygon_coordinates: Json | null
          radius_miles: number | null
          store_config_id: string
          updated_at: string
          zone_name: string
          zone_type: string
        }
        Insert: {
          created_at?: string
          delivery_fee?: number | null
          delivery_fee_cents?: number
          display_order?: number
          estimated_minutes?: number | null
          free_delivery_threshold?: number | null
          free_delivery_threshold_cents?: number | null
          id?: string
          is_active?: boolean
          min_order?: number | null
          min_order_cents?: number | null
          polygon_coordinates?: Json | null
          radius_miles?: number | null
          store_config_id: string
          updated_at?: string
          zone_name: string
          zone_type: string
        }
        Update: {
          created_at?: string
          delivery_fee?: number | null
          delivery_fee_cents?: number
          display_order?: number
          estimated_minutes?: number | null
          free_delivery_threshold?: number | null
          free_delivery_threshold_cents?: number | null
          id?: string
          is_active?: boolean
          min_order?: number | null
          min_order_cents?: number | null
          polygon_coordinates?: Json | null
          radius_miles?: number | null
          store_config_id?: string
          updated_at?: string
          zone_name?: string
          zone_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_store_config_id_fkey"
            columns: ["store_config_id"]
            isOneToOne: false
            referencedRelation: "online_store_config"
            referencedColumns: ["id"]
          },
        ]
      }
      device_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_key: string
          alert_type: string
          auto_resolved: boolean | null
          created_at: string | null
          device_name: string | null
          id: string
          is_resolved: boolean | null
          location_id: string
          merchant_id: string
          message: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          station_id: string | null
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_key: string
          alert_type: string
          auto_resolved?: boolean | null
          created_at?: string | null
          device_name?: string | null
          id?: string
          is_resolved?: boolean | null
          location_id: string
          merchant_id: string
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          station_id?: string | null
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_key?: string
          alert_type?: string
          auto_resolved?: boolean | null
          created_at?: string | null
          device_name?: string | null
          id?: string
          is_resolved?: boolean | null
          location_id?: string
          merchant_id?: string
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          station_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "device_alerts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_alerts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_alerts_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      device_assignments: {
        Row: {
          assigned_at: string
          device_id: string
          from_location_id: string | null
          from_merchant_id: string | null
          id: string
          new_status: Database["public"]["Enums"]["device_lifecycle_status"]
          notes: string | null
          performed_by: string
          performed_by_name: string | null
          previous_status:
            | Database["public"]["Enums"]["device_lifecycle_status"]
            | null
          reason: string | null
          to_location_id: string | null
          to_merchant_id: string | null
          tracking_number: string | null
        }
        Insert: {
          assigned_at?: string
          device_id: string
          from_location_id?: string | null
          from_merchant_id?: string | null
          id?: string
          new_status: Database["public"]["Enums"]["device_lifecycle_status"]
          notes?: string | null
          performed_by: string
          performed_by_name?: string | null
          previous_status?:
            | Database["public"]["Enums"]["device_lifecycle_status"]
            | null
          reason?: string | null
          to_location_id?: string | null
          to_merchant_id?: string | null
          tracking_number?: string | null
        }
        Update: {
          assigned_at?: string
          device_id?: string
          from_location_id?: string | null
          from_merchant_id?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["device_lifecycle_status"]
          notes?: string | null
          performed_by?: string
          performed_by_name?: string | null
          previous_status?:
            | Database["public"]["Enums"]["device_lifecycle_status"]
            | null
          reason?: string | null
          to_location_id?: string | null
          to_merchant_id?: string | null
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_assignments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "admin_device_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "device_assignments_from_merchant_id_fkey"
            columns: ["from_merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_from_merchant_id_fkey"
            columns: ["from_merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "device_assignments_to_merchant_id_fkey"
            columns: ["to_merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_to_merchant_id_fkey"
            columns: ["to_merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      device_catalog: {
        Row: {
          created_at: string
          device_category: string
          discontinued_at: string | null
          hardware_revision: string | null
          id: string
          image_url: string | null
          is_active: boolean
          manufacturer: string
          model_name: string
          model_sku: string | null
          monthly_fee: number | null
          monthly_fee_cents: number | null
          notes: string | null
          specs: Json
          unit_cost: number | null
          unit_cost_cents: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_category: string
          discontinued_at?: string | null
          hardware_revision?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          manufacturer: string
          model_name: string
          model_sku?: string | null
          monthly_fee?: number | null
          monthly_fee_cents?: number | null
          notes?: string | null
          specs?: Json
          unit_cost?: number | null
          unit_cost_cents?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_category?: string
          discontinued_at?: string | null
          hardware_revision?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          manufacturer?: string
          model_name?: string
          model_sku?: string | null
          monthly_fee?: number | null
          monthly_fee_cents?: number | null
          notes?: string | null
          specs?: Json
          unit_cost?: number | null
          unit_cost_cents?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      device_config_history: {
        Row: {
          change_type: string
          config_snapshot: Json | null
          created_at: string
          device_id: string
          id: string
          new_value: string | null
          notes: string | null
          performed_by: string | null
          performed_by_name: string | null
          previous_value: string | null
        }
        Insert: {
          change_type: string
          config_snapshot?: Json | null
          created_at?: string
          device_id: string
          id?: string
          new_value?: string | null
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          previous_value?: string | null
        }
        Update: {
          change_type?: string
          config_snapshot?: Json | null
          created_at?: string
          device_id?: string
          id?: string
          new_value?: string | null
          notes?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
          previous_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_config_history_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "admin_device_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_config_history_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      device_heartbeats: {
        Row: {
          app_version: string | null
          battery_level: number | null
          cfd_connected: boolean | null
          cpu_usage: number | null
          created_at: string
          heartbeat_at: string
          id: string
          is_online: boolean
          location_id: string
          metadata: Json | null
          network_type: string | null
          printer_status: string | null
          ram_free_mb: number | null
          station_id: string
          storage_free_mb: number | null
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          battery_level?: number | null
          cfd_connected?: boolean | null
          cpu_usage?: number | null
          created_at?: string
          heartbeat_at?: string
          id?: string
          is_online?: boolean
          location_id: string
          metadata?: Json | null
          network_type?: string | null
          printer_status?: string | null
          ram_free_mb?: number | null
          station_id: string
          storage_free_mb?: number | null
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          battery_level?: number | null
          cfd_connected?: boolean | null
          cpu_usage?: number | null
          created_at?: string
          heartbeat_at?: string
          id?: string
          is_online?: boolean
          location_id?: string
          metadata?: Json | null
          network_type?: string | null
          printer_status?: string | null
          ram_free_mb?: number | null
          station_id?: string
          storage_free_mb?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_heartbeats_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_heartbeats_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_heartbeats_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "device_heartbeats_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: true
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      device_inventory: {
        Row: {
          app_version: string | null
          catalog_id: string
          condition: string
          created_at: string
          created_by: string | null
          firmware_version: string | null
          id: string
          last_config_at: string | null
          linked_payment_terminal_id: string | null
          linked_printer_id: string | null
          linked_station_id: string | null
          location_id: string | null
          mac_address: string | null
          merchant_id: string | null
          notes: string | null
          purchase_order_number: string | null
          purchased_at: string | null
          serial_number: string
          status: Database["public"]["Enums"]["device_lifecycle_status"]
          updated_at: string
          warranty_expires_at: string | null
        }
        Insert: {
          app_version?: string | null
          catalog_id: string
          condition?: string
          created_at?: string
          created_by?: string | null
          firmware_version?: string | null
          id?: string
          last_config_at?: string | null
          linked_payment_terminal_id?: string | null
          linked_printer_id?: string | null
          linked_station_id?: string | null
          location_id?: string | null
          mac_address?: string | null
          merchant_id?: string | null
          notes?: string | null
          purchase_order_number?: string | null
          purchased_at?: string | null
          serial_number: string
          status?: Database["public"]["Enums"]["device_lifecycle_status"]
          updated_at?: string
          warranty_expires_at?: string | null
        }
        Update: {
          app_version?: string | null
          catalog_id?: string
          condition?: string
          created_at?: string
          created_by?: string | null
          firmware_version?: string | null
          id?: string
          last_config_at?: string | null
          linked_payment_terminal_id?: string | null
          linked_printer_id?: string | null
          linked_station_id?: string | null
          location_id?: string | null
          mac_address?: string | null
          merchant_id?: string | null
          notes?: string | null
          purchase_order_number?: string | null
          purchased_at?: string | null
          serial_number?: string
          status?: Database["public"]["Enums"]["device_lifecycle_status"]
          updated_at?: string
          warranty_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_inventory_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "device_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_linked_payment_terminal_id_fkey"
            columns: ["linked_payment_terminal_id"]
            isOneToOne: false
            referencedRelation: "payment_terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_linked_printer_id_fkey"
            columns: ["linked_printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_linked_station_id_fkey"
            columns: ["linked_station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "device_inventory_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      device_login_history: {
        Row: {
          app_version: string | null
          created_at: string
          device_id: string
          device_model: string | null
          device_name: string | null
          id: string
          ip_address: unknown
          location_id: string
          logged_in_at: string
          logged_out_at: string | null
          logout_reason: string | null
          merchant_id: string
          os_version: string | null
          session_id: string | null
          staff_id: string | null
          staff_name: string | null
          station_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_id: string
          device_model?: string | null
          device_name?: string | null
          id?: string
          ip_address?: unknown
          location_id: string
          logged_in_at?: string
          logged_out_at?: string | null
          logout_reason?: string | null
          merchant_id: string
          os_version?: string | null
          session_id?: string | null
          staff_id?: string | null
          staff_name?: string | null
          station_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_id?: string
          device_model?: string | null
          device_name?: string | null
          id?: string
          ip_address?: unknown
          location_id?: string
          logged_in_at?: string
          logged_out_at?: string | null
          logout_reason?: string | null
          merchant_id?: string
          os_version?: string | null
          session_id?: string | null
          staff_id?: string | null
          staff_name?: string | null
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_login_history_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_login_history_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_login_history_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "device_login_history_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_login_history_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_login_history_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "station_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_login_history_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_login_history_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      device_notes: {
        Row: {
          content: string
          created_at: string
          created_by: string
          created_by_name: string | null
          device_id: string
          external_ticket_id: string | null
          id: string
          note_type: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          created_by_name?: string | null
          device_id: string
          external_ticket_id?: string | null
          id?: string
          note_type?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          device_id?: string
          external_ticket_id?: string | null
          id?: string
          note_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_notes_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "admin_device_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_notes_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_usage_log: {
        Row: {
          applied_at: string
          applied_by_staff_profiles_id: string | null
          discount_amount: number
          discount_id: string
          id: string
          location_id: string
          order_id: string | null
          order_item_id: string | null
          usage_date: string
          voided: boolean | null
          voided_at: string | null
        }
        Insert: {
          applied_at?: string
          applied_by_staff_profiles_id?: string | null
          discount_amount: number
          discount_id: string
          id?: string
          location_id: string
          order_id?: string | null
          order_item_id?: string | null
          usage_date?: string
          voided?: boolean | null
          voided_at?: string | null
        }
        Update: {
          applied_at?: string
          applied_by_staff_profiles_id?: string | null
          discount_amount?: number
          discount_id?: string
          id?: string
          location_id?: string
          order_id?: string | null
          order_item_id?: string | null
          usage_date?: string
          voided?: boolean | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_usage_log_applied_by_staff_profiles_id_fkey"
            columns: ["applied_by_staff_profiles_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_usage_log_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_usage_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_usage_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_usage_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "discount_usage_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_usage_log_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      discounts: {
        Row: {
          allowed_role_levels: string[] | null
          applicable_days: number[] | null
          applicable_hours_end: string | null
          applicable_hours_start: string | null
          applies_to_categories: string[] | null
          code: string | null
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          display_order: number | null
          end_date: string | null
          exclude_alcohol: boolean | null
          exclude_categories: string[] | null
          id: string
          is_active: boolean
          location_id: string | null
          max_discount_amount: number | null
          max_uses_per_day: number | null
          max_uses_per_order: number | null
          merchant_id: string
          min_purchase_amount: number | null
          name: string
          requires_manager_approval: boolean | null
          scope: Database["public"]["Enums"]["discount_scope"] | null
          stackable: boolean | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          allowed_role_levels?: string[] | null
          applicable_days?: number[] | null
          applicable_hours_end?: string | null
          applicable_hours_start?: string | null
          applies_to_categories?: string[] | null
          code?: string | null
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value: number
          display_order?: number | null
          end_date?: string | null
          exclude_alcohol?: boolean | null
          exclude_categories?: string[] | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          max_discount_amount?: number | null
          max_uses_per_day?: number | null
          max_uses_per_order?: number | null
          merchant_id: string
          min_purchase_amount?: number | null
          name: string
          requires_manager_approval?: boolean | null
          scope?: Database["public"]["Enums"]["discount_scope"] | null
          stackable?: boolean | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          allowed_role_levels?: string[] | null
          applicable_days?: number[] | null
          applicable_hours_end?: string | null
          applicable_hours_start?: string | null
          applies_to_categories?: string[] | null
          code?: string | null
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          display_order?: number | null
          end_date?: string | null
          exclude_alcohol?: boolean | null
          exclude_categories?: string[] | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          max_discount_amount?: number | null
          max_uses_per_day?: number | null
          max_uses_per_order?: number | null
          merchant_id?: string
          min_purchase_amount?: number | null
          name?: string
          requires_manager_approval?: boolean | null
          scope?: Database["public"]["Enums"]["discount_scope"] | null
          stackable?: boolean | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discounts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discounts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discounts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "discounts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discounts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_daily_tips: {
        Row: {
          cash_payment_tips: number
          cash_tips_declared: number | null
          charged_tips: number | null
          charged_tips_processor_fee: number
          cover_count: number | null
          created_at: string
          gross_sales: number | null
          hours_worked: number | null
          id: string
          is_verified: boolean | null
          location_id: string
          merchant_id: string
          shift_date: string
          staff_profile_id: string
          tip_out_given: number | null
          tip_out_received: number | null
          tip_pool_contributed: number | null
          tip_pool_received: number | null
          total_tips: number | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          cash_payment_tips?: number
          cash_tips_declared?: number | null
          charged_tips?: number | null
          charged_tips_processor_fee?: number
          cover_count?: number | null
          created_at?: string
          gross_sales?: number | null
          hours_worked?: number | null
          id?: string
          is_verified?: boolean | null
          location_id: string
          merchant_id: string
          shift_date: string
          staff_profile_id: string
          tip_out_given?: number | null
          tip_out_received?: number | null
          tip_pool_contributed?: number | null
          tip_pool_received?: number | null
          total_tips?: number | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          cash_payment_tips?: number
          cash_tips_declared?: number | null
          charged_tips?: number | null
          charged_tips_processor_fee?: number
          cover_count?: number | null
          created_at?: string
          gross_sales?: number | null
          hours_worked?: number | null
          id?: string
          is_verified?: boolean | null
          location_id?: string
          merchant_id?: string
          shift_date?: string
          staff_profile_id?: string
          tip_out_given?: number | null
          tip_out_received?: number | null
          tip_pool_contributed?: number | null
          tip_pool_received?: number | null
          total_tips?: number | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_daily_tips_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_daily_tips_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_daily_tips_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "employee_daily_tips_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_daily_tips_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_daily_tips_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_daily_tips_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_plan_objects: {
        Row: {
          capacity: number | null
          category: Database["public"]["Enums"]["floor_object_category"]
          color_override: string | null
          created_at: string | null
          default_turn_time: number | null
          floor_plan_id: string
          height: number | null
          id: string
          is_active: boolean | null
          is_combinable: boolean | null
          is_reservable: boolean | null
          is_visible: boolean | null
          label_override: string | null
          location_id: string
          merchant_id: string
          min_capacity: number | null
          name: string
          rotation: number | null
          section_id: string | null
          shape_id: string
          updated_at: string | null
          width: number | null
          x: number
          y: number
          z_index: number | null
          zone_name: string | null
        }
        Insert: {
          capacity?: number | null
          category: Database["public"]["Enums"]["floor_object_category"]
          color_override?: string | null
          created_at?: string | null
          default_turn_time?: number | null
          floor_plan_id: string
          height?: number | null
          id?: string
          is_active?: boolean | null
          is_combinable?: boolean | null
          is_reservable?: boolean | null
          is_visible?: boolean | null
          label_override?: string | null
          location_id: string
          merchant_id: string
          min_capacity?: number | null
          name: string
          rotation?: number | null
          section_id?: string | null
          shape_id: string
          updated_at?: string | null
          width?: number | null
          x?: number
          y?: number
          z_index?: number | null
          zone_name?: string | null
        }
        Update: {
          capacity?: number | null
          category?: Database["public"]["Enums"]["floor_object_category"]
          color_override?: string | null
          created_at?: string | null
          default_turn_time?: number | null
          floor_plan_id?: string
          height?: number | null
          id?: string
          is_active?: boolean | null
          is_combinable?: boolean | null
          is_reservable?: boolean | null
          is_visible?: boolean | null
          label_override?: string | null
          location_id?: string
          merchant_id?: string
          min_capacity?: number | null
          name?: string
          rotation?: number | null
          section_id?: string | null
          shape_id?: string
          updated_at?: string | null
          width?: number | null
          x?: number
          y?: number
          z_index?: number | null
          zone_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "floor_plan_objects_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plan_objects_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plan_objects_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plan_objects_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "floor_plan_objects_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plan_objects_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_plans: {
        Row: {
          background_color: string | null
          canvas_height: number
          canvas_width: number
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          grid_size: number | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          location_id: string
          merchant_id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          background_color?: string | null
          canvas_height?: number
          canvas_width?: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          grid_size?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          location_id: string
          merchant_id: string
          name: string
          updated_at?: string | null
        }
        Update: {
          background_color?: string | null
          canvas_height?: number
          canvas_width?: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          grid_size?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          location_id?: string
          merchant_id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "floor_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plans_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plans_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plans_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "floor_plans_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_plans_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          completed_at: string | null
          created_at: string
          key: string
          op: string
          result_json: Json | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          key: string
          op: string
          result_json?: Json | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          key?: string
          op?: string
          result_json?: Json | null
          status?: string
        }
        Relationships: []
      }
      impersonation_sessions: {
        Row: {
          end_reason: string | null
          ended_at: string | null
          hq_user_id: string
          id: string
          ip_address: unknown
          last_validated_at: string
          reason: string | null
          started_at: string
          target_merchant_id: string
          user_agent: string | null
        }
        Insert: {
          end_reason?: string | null
          ended_at?: string | null
          hq_user_id: string
          id?: string
          ip_address?: unknown
          last_validated_at?: string
          reason?: string | null
          started_at?: string
          target_merchant_id: string
          user_agent?: string | null
        }
        Update: {
          end_reason?: string | null
          ended_at?: string | null
          hq_user_id?: string
          id?: string
          ip_address?: unknown
          last_validated_at?: string
          reason?: string | null
          started_at?: string
          target_merchant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_target_merchant_id_fkey"
            columns: ["target_merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_sessions_target_merchant_id_fkey"
            columns: ["target_merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          count_id: string
          counted_quantity: number | null
          created_at: string
          expected_quantity: number
          id: string
          inventory_item_id: string
          variance: number | null
          variance_cost: number | null
        }
        Insert: {
          count_id: string
          counted_quantity?: number | null
          created_at?: string
          expected_quantity?: number
          id?: string
          inventory_item_id: string
          variance?: number | null
          variance_cost?: number | null
        }
        Update: {
          count_id?: string
          counted_quantity?: number | null
          created_at?: string
          expected_quantity?: number
          id?: string
          inventory_item_id?: string
          variance?: number | null
          variance_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          approved_at: string | null
          approved_by_name: string | null
          approved_by_user_id: string | null
          assigned_to_name: string | null
          assigned_to_user_id: string | null
          completed_at: string | null
          count_name: string
          created_at: string
          id: string
          location_id: string
          merchant_id: string
          notes: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_name?: string | null
          approved_by_user_id?: string | null
          assigned_to_name?: string | null
          assigned_to_user_id?: string | null
          completed_at?: string | null
          count_name: string
          created_at?: string
          id?: string
          location_id: string
          merchant_id: string
          notes?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_name?: string | null
          approved_by_user_id?: string | null
          assigned_to_name?: string | null
          assigned_to_user_id?: string | null
          completed_at?: string | null
          count_name?: string
          created_at?: string
          id?: string
          location_id?: string
          merchant_id?: string
          notes?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "inventory_counts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string | null
          cost_per_unit: number | null
          created_at: string | null
          current_stock: number | null
          id: string
          is_active: boolean | null
          location_id: string | null
          merchant_id: string
          name: string
          par_level: number | null
          reorder_point: number | null
          reorder_quantity: number | null
          sku: string | null
          stock_mode: Database["public"]["Enums"]["inventory_stock_mode"] | null
          unit_type: string
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          category?: string | null
          cost_per_unit?: number | null
          created_at?: string | null
          current_stock?: number | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          merchant_id: string
          name: string
          par_level?: number | null
          reorder_point?: number | null
          reorder_quantity?: number | null
          sku?: string | null
          stock_mode?:
            | Database["public"]["Enums"]["inventory_stock_mode"]
            | null
          unit_type: string
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          category?: string | null
          cost_per_unit?: number | null
          created_at?: string | null
          current_stock?: number | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          merchant_id?: string
          name?: string
          par_level?: number | null
          reorder_point?: number | null
          reorder_quantity?: number | null
          sku?: string | null
          stock_mode?:
            | Database["public"]["Enums"]["inventory_stock_mode"]
            | null
          unit_type?: string
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_default_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "inventory_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfer_items: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          quantity_received: number | null
          quantity_sent: number
          transfer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          quantity_received?: number | null
          quantity_sent: number
          transfer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          quantity_received?: number | null
          quantity_sent?: number
          transfer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfer_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          created_at: string
          from_location_id: string
          id: string
          initiated_by_name: string | null
          initiated_by_user_id: string | null
          merchant_id: string
          notes: string | null
          received_at: string | null
          received_by_name: string | null
          received_by_user_id: string | null
          status: string
          to_location_id: string
          transfer_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_location_id: string
          id?: string
          initiated_by_name?: string | null
          initiated_by_user_id?: string | null
          merchant_id: string
          notes?: string | null
          received_at?: string | null
          received_by_name?: string | null
          received_by_user_id?: string | null
          status?: string
          to_location_id: string
          transfer_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_location_id?: string
          id?: string
          initiated_by_name?: string | null
          initiated_by_user_id?: string | null
          merchant_id?: string
          notes?: string | null
          received_at?: string | null
          received_by_name?: string | null
          received_by_user_id?: string | null
          status?: string
          to_location_id?: string
          transfer_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "inventory_transfers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          menu_item_id: string | null
          name: string
          quantity: number
          sort_order: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          menu_item_id?: string | null
          name: string
          quantity?: number
          sort_order?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          menu_item_id?: string | null
          name?: string
          quantity?: number
          sort_order?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
        ]
      }
      invoice_number_sequences: {
        Row: {
          last_number: number
          merchant_id: string
        }
        Insert: {
          last_number?: number
          merchant_id: string
        }
        Update: {
          last_number?: number
          merchant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_number_sequences_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_number_sequences_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          customer_id: string | null
          discount_amount: number
          due_date: string | null
          id: string
          invoice_number: string
          location_id: string | null
          merchant_id: string
          note: string | null
          payment_due_type: string
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          invoice_number: string
          location_id?: string | null
          merchant_id: string
          note?: string | null
          payment_due_type?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          invoice_number?: string
          location_id?: string | null
          merchant_id?: string
          note?: string | null
          payment_due_type?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "invoices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_addons: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          menu_item_id: string | null
          merchant_id: string | null
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          menu_item_id?: string | null
          merchant_id?: string | null
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          menu_item_id?: string | null
          merchant_id?: string | null
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_addons_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_addons_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "item_addons_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_addons_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_sizes: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          menu_item_id: string | null
          merchant_id: string | null
          name: string
          price_modifier: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          menu_item_id?: string | null
          merchant_id?: string | null
          name: string
          price_modifier?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          menu_item_id?: string | null
          merchant_id?: string | null
          name?: string
          price_modifier?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_sizes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_sizes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "item_sizes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_sizes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_stock: {
        Row: {
          created_at: string
          id: string
          last_restocked_at: string | null
          location_id: string
          menu_item_id: string
          quantity: number
          reorder_threshold: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_restocked_at?: string | null
          location_id: string
          menu_item_id: string
          quantity?: number
          reorder_threshold?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_restocked_at?: string | null
          location_id?: string
          menu_item_id?: string
          quantity?: number
          reorder_threshold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "item_stock_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_stock_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
        ]
      }
      kds_displays: {
        Row: {
          alert_minutes: number | null
          auto_bump_minutes: number | null
          columns: number | null
          created_at: string | null
          display_color: string | null
          display_mode: string
          display_name: string
          font_scale: number | null
          id: string
          is_active: boolean | null
          location_id: string
          merchant_id: string
          online_order_priority: boolean | null
          routing_mode: string
          show_all_items: boolean | null
          show_allergy_flags: boolean | null
          show_online_orders: boolean | null
          show_order_notes: boolean | null
          show_order_source: boolean | null
          show_ready_by_countdown: boolean | null
          show_server_name: boolean | null
          sound_config: Json | null
          sound_on_new_order: boolean | null
          sound_on_rush: boolean | null
          station_id: string
          updated_at: string | null
          warning_minutes: number | null
        }
        Insert: {
          alert_minutes?: number | null
          auto_bump_minutes?: number | null
          columns?: number | null
          created_at?: string | null
          display_color?: string | null
          display_mode?: string
          display_name: string
          font_scale?: number | null
          id?: string
          is_active?: boolean | null
          location_id: string
          merchant_id: string
          online_order_priority?: boolean | null
          routing_mode?: string
          show_all_items?: boolean | null
          show_allergy_flags?: boolean | null
          show_online_orders?: boolean | null
          show_order_notes?: boolean | null
          show_order_source?: boolean | null
          show_ready_by_countdown?: boolean | null
          show_server_name?: boolean | null
          sound_config?: Json | null
          sound_on_new_order?: boolean | null
          sound_on_rush?: boolean | null
          station_id: string
          updated_at?: string | null
          warning_minutes?: number | null
        }
        Update: {
          alert_minutes?: number | null
          auto_bump_minutes?: number | null
          columns?: number | null
          created_at?: string | null
          display_color?: string | null
          display_mode?: string
          display_name?: string
          font_scale?: number | null
          id?: string
          is_active?: boolean | null
          location_id?: string
          merchant_id?: string
          online_order_priority?: boolean | null
          routing_mode?: string
          show_all_items?: boolean | null
          show_allergy_flags?: boolean | null
          show_online_orders?: boolean | null
          show_order_notes?: boolean | null
          show_order_source?: boolean | null
          show_ready_by_countdown?: boolean | null
          show_server_name?: boolean | null
          sound_config?: Json | null
          sound_on_new_order?: boolean | null
          sound_on_rush?: boolean | null
          station_id?: string
          updated_at?: string | null
          warning_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kds_displays_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_displays_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_displays_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "kds_displays_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_displays_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_displays_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: true
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      kds_item_status: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          bumped_at: string | null
          bumped_by: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          kds_display_id: string | null
          order_id: string
          order_item_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          bumped_at?: string | null
          bumped_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          kds_display_id?: string | null
          order_id: string
          order_item_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          bumped_at?: string | null
          bumped_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          kds_display_id?: string | null
          order_id?: string
          order_item_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "kds_item_status_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_item_status_bumped_by_fkey"
            columns: ["bumped_by"]
            isOneToOne: false
            referencedRelation: "location_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_item_status_kds_display_id_fkey"
            columns: ["kds_display_id"]
            isOneToOne: false
            referencedRelation: "kds_displays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_item_status_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kds_item_status_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      kds_routing_rules: {
        Row: {
          created_at: string | null
          id: string
          kds_display_id: string
          rule_type: string
          rule_value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          kds_display_id: string
          rule_type: string
          rule_value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          kds_display_id?: string
          rule_type?: string
          rule_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "kds_routing_rules_kds_display_id_fkey"
            columns: ["kds_display_id"]
            isOneToOne: false
            referencedRelation: "kds_displays"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosk_pickup_sequences: {
        Row: {
          business_date: string
          current_value: number
          location_id: string
          updated_at: string
        }
        Insert: {
          business_date: string
          current_value?: number
          location_id: string
          updated_at?: string
        }
        Update: {
          business_date?: string
          current_value?: number
          location_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_pickup_sequences_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_pickup_sequences_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_pickup_sequences_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      kiosk_profiles: {
        Row: {
          accent_color: string | null
          admin_pin_hash: string | null
          attract_image_urls: Json
          attract_video_url: string | null
          auto_print_receipt: boolean
          background_color: string
          cart_reset_timeout_seconds: number
          created_at: string
          font_family: string | null
          header_text_color: string | null
          hero_image_url: string | null
          id: string
          idle_timeout_seconds: number
          is_active: boolean
          location_id: string
          logo_url: string | null
          loyalty_enrollment_enabled: boolean
          merchant_id: string
          orientation: string
          payment_terminal_id: string | null
          pickup_number_prefix: string | null
          primary_color: string
          profile_name: string
          published_at: string | null
          receipt_email_prompt: boolean
          receipt_sms_prompt: boolean
          secondary_color: string | null
          show_allergens: boolean
          show_calorie_info: boolean
          template_id: string
          text_color: string
          tip_presets: Json
          tip_screen_enabled: boolean
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          accent_color?: string | null
          admin_pin_hash?: string | null
          attract_image_urls?: Json
          attract_video_url?: string | null
          auto_print_receipt?: boolean
          background_color?: string
          cart_reset_timeout_seconds?: number
          created_at?: string
          font_family?: string | null
          header_text_color?: string | null
          hero_image_url?: string | null
          id?: string
          idle_timeout_seconds?: number
          is_active?: boolean
          location_id: string
          logo_url?: string | null
          loyalty_enrollment_enabled?: boolean
          merchant_id: string
          orientation?: string
          payment_terminal_id?: string | null
          pickup_number_prefix?: string | null
          primary_color?: string
          profile_name?: string
          published_at?: string | null
          receipt_email_prompt?: boolean
          receipt_sms_prompt?: boolean
          secondary_color?: string | null
          show_allergens?: boolean
          show_calorie_info?: boolean
          template_id?: string
          text_color?: string
          tip_presets?: Json
          tip_screen_enabled?: boolean
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          accent_color?: string | null
          admin_pin_hash?: string | null
          attract_image_urls?: Json
          attract_video_url?: string | null
          auto_print_receipt?: boolean
          background_color?: string
          cart_reset_timeout_seconds?: number
          created_at?: string
          font_family?: string | null
          header_text_color?: string | null
          hero_image_url?: string | null
          id?: string
          idle_timeout_seconds?: number
          is_active?: boolean
          location_id?: string
          logo_url?: string | null
          loyalty_enrollment_enabled?: boolean
          merchant_id?: string
          orientation?: string
          payment_terminal_id?: string | null
          pickup_number_prefix?: string | null
          primary_color?: string
          profile_name?: string
          published_at?: string | null
          receipt_email_prompt?: boolean
          receipt_sms_prompt?: boolean
          secondary_color?: string | null
          show_allergens?: boolean
          show_calorie_info?: boolean
          template_id?: string
          text_color?: string
          tip_presets?: Json
          tip_screen_enabled?: boolean
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "kiosk_profiles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_profiles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_profiles_payment_terminal_id_fkey"
            columns: ["payment_terminal_id"]
            isOneToOne: false
            referencedRelation: "payment_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      location_banking_profiles: {
        Row: {
          account_holder_name: string
          account_number_last_four: string
          account_type: string
          bank_account_token: string | null
          bank_name: string
          created_at: string
          id: string
          is_active: boolean
          is_verified: boolean
          location_id: string
          merchant_id: string
          minimum_payout_amount: number
          payout_day_of_month: number | null
          payout_day_of_week: number | null
          payout_frequency: string
          routing_number_last_four: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          account_holder_name: string
          account_number_last_four: string
          account_type?: string
          bank_account_token?: string | null
          bank_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          location_id: string
          merchant_id: string
          minimum_payout_amount?: number
          payout_day_of_month?: number | null
          payout_day_of_week?: number | null
          payout_frequency?: string
          routing_number_last_four: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          account_holder_name?: string
          account_number_last_four?: string
          account_type?: string
          bank_account_token?: string | null
          bank_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_verified?: boolean
          location_id?: string
          merchant_id?: string
          minimum_payout_amount?: number
          payout_day_of_month?: number | null
          payout_day_of_week?: number | null
          payout_frequency?: string
          routing_number_last_four?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_banking_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_banking_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_banking_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_banking_profiles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_banking_profiles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      location_category_item_overrides: {
        Row: {
          category_id: string
          created_at: string
          custom_cash_price: number | null
          custom_delivery_price: number | null
          custom_price: number | null
          display_order: number | null
          id: string
          is_available: boolean | null
          is_featured: boolean | null
          is_tax_exempt: boolean | null
          location_id: string
          menu_item_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          custom_cash_price?: number | null
          custom_delivery_price?: number | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_available?: boolean | null
          is_featured?: boolean | null
          is_tax_exempt?: boolean | null
          location_id: string
          menu_item_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          custom_cash_price?: number | null
          custom_delivery_price?: number | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_available?: boolean | null
          is_featured?: boolean | null
          is_tax_exempt?: boolean | null
          location_id?: string
          menu_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_category_item_overrides_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_category_item_overrides_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_item_overrides_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
        ]
      }
      location_category_overrides: {
        Row: {
          category_id: string
          created_at: string
          custom_image: string | null
          custom_subtitle: string | null
          custom_title: string | null
          display_order: number | null
          id: string
          is_active: boolean
          location_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          custom_image?: string | null
          custom_subtitle?: string | null
          custom_title?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          location_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          custom_image?: string | null
          custom_subtitle?: string | null
          custom_title?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          location_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_category_overrides_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      location_category_prep_defaults: {
        Row: {
          category_id: string
          created_at: string
          id: string
          location_id: string
          merchant_id: string
          prep_station_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          location_id: string
          merchant_id: string
          prep_station_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          location_id?: string
          merchant_id?: string
          prep_station_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_category_prep_defaults_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_prep_defaults_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_prep_defaults_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_prep_defaults_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_category_prep_defaults_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_prep_defaults_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_category_prep_defaults_prep_station_id_fkey"
            columns: ["prep_station_id"]
            isOneToOne: false
            referencedRelation: "prep_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_exclusive_items: {
        Row: {
          allergens: string[] | null
          availability: boolean
          card_bg_color: string | null
          cash_price: number | null
          category_id: string | null
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          image: string | null
          location_id: string
          meal_types: string[] | null
          name: string
          price: number
          stock_tracking_mode: string | null
          updated_at: string
        }
        Insert: {
          allergens?: string[] | null
          availability?: boolean
          card_bg_color?: string | null
          cash_price?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          image?: string | null
          location_id: string
          meal_types?: string[] | null
          name: string
          price: number
          stock_tracking_mode?: string | null
          updated_at?: string
        }
        Update: {
          allergens?: string[] | null
          availability?: boolean
          card_bg_color?: string | null
          cash_price?: number | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          image?: string | null
          location_id?: string
          meal_types?: string[] | null
          name?: string
          price?: number
          stock_tracking_mode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_exclusive_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_exclusive_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_exclusive_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_exclusive_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      location_inventory_overrides: {
        Row: {
          cost_per_unit: number | null
          created_at: string | null
          custom_cost: number | null
          custom_reorder_threshold: number | null
          id: string
          inventory_item_id: string
          location_id: string
          notes: string | null
          reorder_point: number | null
          updated_at: string | null
        }
        Insert: {
          cost_per_unit?: number | null
          created_at?: string | null
          custom_cost?: number | null
          custom_reorder_threshold?: number | null
          id?: string
          inventory_item_id: string
          location_id: string
          notes?: string | null
          reorder_point?: number | null
          updated_at?: string | null
        }
        Update: {
          cost_per_unit?: number | null
          created_at?: string | null
          custom_cost?: number | null
          custom_reorder_threshold?: number | null
          id?: string
          inventory_item_id?: string
          location_id?: string
          notes?: string | null
          reorder_point?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_inventory_overrides_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_inventory_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_inventory_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_inventory_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      location_inventory_stock: {
        Row: {
          created_at: string | null
          id: string
          inventory_item_id: string
          location_id: string
          reorder_threshold: number | null
          stock_quantity: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_item_id: string
          location_id: string
          reorder_threshold?: number | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          location_id?: string
          reorder_threshold?: number | null
          stock_quantity?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_inventory_stock_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_inventory_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_inventory_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_inventory_stock_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      location_invites: {
        Row: {
          accepted_at: string | null
          clerk_invite_id: string | null
          created_at: string
          email: string
          expires_at: string
          first_name: string | null
          hourly_rate: number | null
          id: string
          invite_type: string | null
          invited_by_user_id: string
          last_name: string | null
          location_assignments: Json | null
          location_id: string | null
          merchant_id: string | null
          phone: string | null
          role_code: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          clerk_invite_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          first_name?: string | null
          hourly_rate?: number | null
          id?: string
          invite_type?: string | null
          invited_by_user_id: string
          last_name?: string | null
          location_assignments?: Json | null
          location_id?: string | null
          merchant_id?: string | null
          phone?: string | null
          role_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          clerk_invite_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          first_name?: string | null
          hourly_rate?: number | null
          id?: string
          invite_type?: string | null
          invited_by_user_id?: string
          last_name?: string | null
          location_assignments?: Json | null
          location_id?: string | null
          merchant_id?: string | null
          phone?: string | null
          role_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_invites_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_invites_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_invites_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_invites_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_invites_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_invites_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_invites_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      location_item_modifier_groups: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          location_id: string
          menu_item_id: string
          merchant_id: string
          modifier_group_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          location_id: string
          menu_item_id: string
          merchant_id: string
          modifier_group_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          location_id?: string
          menu_item_id?: string
          merchant_id?: string
          modifier_group_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_item_modifier_groups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_item_modifier_groups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_item_modifier_groups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_item_modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_item_modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "location_item_modifier_groups_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_item_modifier_groups_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_item_modifier_groups_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      location_item_overrides: {
        Row: {
          available_channels: Json | null
          created_at: string
          current_stock: number | null
          custom_cash_price: number | null
          custom_delivery_price: number | null
          custom_price: number | null
          id: string
          is_available: boolean | null
          is_new: boolean
          is_popular: boolean
          is_tax_exempt: boolean | null
          location_id: string
          low_stock_threshold: number | null
          menu_item_id: string
          prep_station_id: string | null
          price_modifier: number | null
          price_modifier_type: string | null
          stock_tracking_mode: string | null
          tax_category: string | null
          updated_at: string
        }
        Insert: {
          available_channels?: Json | null
          created_at?: string
          current_stock?: number | null
          custom_cash_price?: number | null
          custom_delivery_price?: number | null
          custom_price?: number | null
          id?: string
          is_available?: boolean | null
          is_new?: boolean
          is_popular?: boolean
          is_tax_exempt?: boolean | null
          location_id: string
          low_stock_threshold?: number | null
          menu_item_id: string
          prep_station_id?: string | null
          price_modifier?: number | null
          price_modifier_type?: string | null
          stock_tracking_mode?: string | null
          tax_category?: string | null
          updated_at?: string
        }
        Update: {
          available_channels?: Json | null
          created_at?: string
          current_stock?: number | null
          custom_cash_price?: number | null
          custom_delivery_price?: number | null
          custom_price?: number | null
          id?: string
          is_available?: boolean | null
          is_new?: boolean
          is_popular?: boolean
          is_tax_exempt?: boolean | null
          location_id?: string
          low_stock_threshold?: number | null
          menu_item_id?: string
          prep_station_id?: string | null
          price_modifier?: number | null
          price_modifier_type?: string | null
          stock_tracking_mode?: string | null
          tax_category?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_item_overrides_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_item_overrides_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "location_item_overrides_prep_station_id_fkey"
            columns: ["prep_station_id"]
            isOneToOne: false
            referencedRelation: "prep_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_members: {
        Row: {
          assigned_at: string
          employment_type: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean
          is_primary_location: boolean | null
          location_id: string | null
          merchant_id: string | null
          pin_code: string | null
          pin_hashed: string | null
          pin_plain: string | null
          role_code: string
          staff_profile_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_at?: string
          employment_type?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          is_primary_location?: boolean | null
          location_id?: string | null
          merchant_id?: string | null
          pin_code?: string | null
          pin_hashed?: string | null
          pin_plain?: string | null
          role_code: string
          staff_profile_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_at?: string
          employment_type?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          is_primary_location?: boolean | null
          location_id?: string | null
          merchant_id?: string | null
          pin_code?: string | null
          pin_hashed?: string | null
          pin_plain?: string | null
          role_code?: string
          staff_profile_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_members_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_members_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_members_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_members_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_members_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_members_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "location_members_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      location_menu_category_overrides: {
        Row: {
          category_id: string
          created_at: string
          custom_title: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          location_id: string
          menu_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          custom_title?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          location_id: string
          menu_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          custom_title?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          location_id?: string
          menu_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_menu_category_overrides_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menu_category_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menu_category_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menu_category_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_menu_category_overrides_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menu_category_overrides_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_id"]
          },
        ]
      }
      location_menu_item_overrides: {
        Row: {
          category_id: string | null
          created_at: string
          custom_cash_price: number | null
          custom_delivery_price: number | null
          custom_price: number | null
          id: string
          is_available: boolean
          location_id: string
          menu_id: string | null
          menu_item_id: string
          stock_tracking_mode: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          custom_cash_price?: number | null
          custom_delivery_price?: number | null
          custom_price?: number | null
          id?: string
          is_available?: boolean
          location_id: string
          menu_id?: string | null
          menu_item_id: string
          stock_tracking_mode?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          custom_cash_price?: number | null
          custom_delivery_price?: number | null
          custom_price?: number | null
          id?: string
          is_available?: boolean
          location_id?: string
          menu_id?: string | null
          menu_item_id?: string
          stock_tracking_mode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_menu_item_overrides_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menu_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menu_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menu_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_menu_item_overrides_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menu_item_overrides_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_id"]
          },
          {
            foreignKeyName: "location_menu_item_overrides_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menu_item_overrides_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
        ]
      }
      location_menus: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean
          location_id: string
          menu_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean
          location_id: string
          menu_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean
          location_id?: string
          menu_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_menus_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menus_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menus_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_menus_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_menus_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_id"]
          },
        ]
      }
      location_modifier_group_overrides: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          location_id: string
          merchant_id: string
          modifier_group_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          location_id: string
          merchant_id: string
          modifier_group_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          location_id?: string
          merchant_id?: string
          modifier_group_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_modifier_group_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_modifier_group_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_modifier_group_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_modifier_group_overrides_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_modifier_group_overrides_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_modifier_group_overrides_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      location_modifier_item_overrides: {
        Row: {
          created_at: string | null
          current_stock: number | null
          delivery_price_modifier: number | null
          display_order: number | null
          id: string
          is_active: boolean | null
          location_id: string
          low_stock_threshold: number | null
          merchant_id: string
          modifier_group_item_id: string
          price_modifier: number | null
          stock_tracking_mode: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_stock?: number | null
          delivery_price_modifier?: number | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          location_id: string
          low_stock_threshold?: number | null
          merchant_id: string
          modifier_group_item_id: string
          price_modifier?: number | null
          stock_tracking_mode?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_stock?: number | null
          delivery_price_modifier?: number | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          location_id?: string
          low_stock_threshold?: number | null
          merchant_id?: string
          modifier_group_item_id?: string
          price_modifier?: number | null
          stock_tracking_mode?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_modifier_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_modifier_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_modifier_item_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_modifier_item_overrides_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_modifier_item_overrides_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_modifier_item_overrides_modifier_group_item_id_fkey"
            columns: ["modifier_group_item_id"]
            isOneToOne: false
            referencedRelation: "modifier_group_items"
            referencedColumns: ["id"]
          },
        ]
      }
      location_payment_devices: {
        Row: {
          activated_at: string | null
          carrier_id: string
          created_at: string
          device_label: string | null
          environment: string
          id: string
          is_active: boolean
          last_health_check_at: string | null
          last_health_check_status: string | null
          last_synced_from_crm_at: string | null
          location_id: string
          merchant_id: string
          metadata: Json
          provider: string
          provider_gateway_id: string | null
          provider_merchant_id: string | null
          provider_public_key: string | null
          provider_secret_id: string | null
          status: string
          supports_apple_pay: boolean
          supports_customer_vault: boolean
          supports_google_pay: boolean
          suspended_at: string | null
          suspended_reason: string | null
          tpn: string | null
          updated_at: string
          use_for_online_ordering: boolean
          webhook_secret_id: string | null
          whitelist_origins: string[]
          whitelist_synced_at: string | null
        }
        Insert: {
          activated_at?: string | null
          carrier_id: string
          created_at?: string
          device_label?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          last_health_check_at?: string | null
          last_health_check_status?: string | null
          last_synced_from_crm_at?: string | null
          location_id: string
          merchant_id: string
          metadata?: Json
          provider?: string
          provider_gateway_id?: string | null
          provider_merchant_id?: string | null
          provider_public_key?: string | null
          provider_secret_id?: string | null
          status?: string
          supports_apple_pay?: boolean
          supports_customer_vault?: boolean
          supports_google_pay?: boolean
          suspended_at?: string | null
          suspended_reason?: string | null
          tpn?: string | null
          updated_at?: string
          use_for_online_ordering?: boolean
          webhook_secret_id?: string | null
          whitelist_origins?: string[]
          whitelist_synced_at?: string | null
        }
        Update: {
          activated_at?: string | null
          carrier_id?: string
          created_at?: string
          device_label?: string | null
          environment?: string
          id?: string
          is_active?: boolean
          last_health_check_at?: string | null
          last_health_check_status?: string | null
          last_synced_from_crm_at?: string | null
          location_id?: string
          merchant_id?: string
          metadata?: Json
          provider?: string
          provider_gateway_id?: string | null
          provider_merchant_id?: string | null
          provider_public_key?: string | null
          provider_secret_id?: string | null
          status?: string
          supports_apple_pay?: boolean
          supports_customer_vault?: boolean
          supports_google_pay?: boolean
          suspended_at?: string | null
          suspended_reason?: string | null
          tpn?: string | null
          updated_at?: string
          use_for_online_ordering?: boolean
          webhook_secret_id?: string | null
          whitelist_origins?: string[]
          whitelist_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_payment_devices_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_payment_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_payment_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_payment_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_payment_devices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_payment_devices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      location_schedule_overrides: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          location_id: string
          merchant_id: string
          schedule_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_id: string
          merchant_id: string
          schedule_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string
          merchant_id?: string
          schedule_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_schedule_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_schedule_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_schedule_overrides_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_schedule_overrides_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_schedule_overrides_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_schedule_overrides_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      location_vendor_pricing: {
        Row: {
          id: string
          inventory_item_id: string
          last_updated: string | null
          location_id: string
          unit_cost: number
          vendor_id: string
        }
        Insert: {
          id?: string
          inventory_item_id: string
          last_updated?: string | null
          location_id: string
          unit_cost: number
          vendor_id: string
        }
        Update: {
          id?: string
          inventory_item_id?: string
          last_updated?: string | null
          location_id?: string
          unit_cost?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_vendor_pricing_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_vendor_pricing_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_vendor_pricing_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_vendor_pricing_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_vendor_pricing_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      location_vendors: {
        Row: {
          account_number: string | null
          created_at: string | null
          id: string
          is_preferred: boolean | null
          location_id: string
          notes: string | null
          vendor_id: string
        }
        Insert: {
          account_number?: string | null
          created_at?: string | null
          id?: string
          is_preferred?: boolean | null
          location_id: string
          notes?: string | null
          vendor_id: string
        }
        Update: {
          account_number?: string | null
          created_at?: string | null
          id?: string
          is_preferred?: boolean | null
          location_id?: string
          notes?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_vendors_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_vendors_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_vendors_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "location_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          auto_clock_out_enabled: boolean
          auto_clock_out_time: string
          business_day_end_hour: number
          business_day_start_hour: number | null
          business_hours: Json | null
          cfd_pricing_display_mode: string
          city: string
          code: string | null
          country: string
          created_at: string | null
          description: string | null
          dual_pricing_percentage: number
          ein: string | null
          ein_last_four: string | null
          email: string | null
          id: string
          is_accepting_orders: boolean
          is_active: boolean
          kds_workflow_mode: string
          latitude: number | null
          longitude: number | null
          luqra_mid: string | null
          luqra_mid_assigned_at: string | null
          luqra_mid_descriptor: string | null
          luqra_mid_status: string
          merchant_id: string
          name: string
          onboarding_completed: boolean | null
          onboarding_step: number | null
          phone: string | null
          pos_config: Json
          postal_code: string
          pricing_strategy: string
          processor_fee_percentage: number
          public_metadata: Json | null
          sales_tax_rate: number | null
          state: string
          tax_id: string | null
          tax_registration_status: string | null
          timezone: string
          tip_surcharge_percentage: number
          updated_at: string
          use_merchant_pricing_defaults: boolean
          uses_global_menu: boolean
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          auto_clock_out_enabled?: boolean
          auto_clock_out_time?: string
          business_day_end_hour?: number
          business_day_start_hour?: number | null
          business_hours?: Json | null
          cfd_pricing_display_mode?: string
          city?: string
          code?: string | null
          country?: string
          created_at?: string | null
          description?: string | null
          dual_pricing_percentage?: number
          ein?: string | null
          ein_last_four?: string | null
          email?: string | null
          id?: string
          is_accepting_orders?: boolean
          is_active?: boolean
          kds_workflow_mode?: string
          latitude?: number | null
          longitude?: number | null
          luqra_mid?: string | null
          luqra_mid_assigned_at?: string | null
          luqra_mid_descriptor?: string | null
          luqra_mid_status?: string
          merchant_id: string
          name: string
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          phone?: string | null
          pos_config?: Json
          postal_code?: string
          pricing_strategy?: string
          processor_fee_percentage?: number
          public_metadata?: Json | null
          sales_tax_rate?: number | null
          state?: string
          tax_id?: string | null
          tax_registration_status?: string | null
          timezone?: string
          tip_surcharge_percentage?: number
          updated_at?: string
          use_merchant_pricing_defaults?: boolean
          uses_global_menu?: boolean
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          auto_clock_out_enabled?: boolean
          auto_clock_out_time?: string
          business_day_end_hour?: number
          business_day_start_hour?: number | null
          business_hours?: Json | null
          cfd_pricing_display_mode?: string
          city?: string
          code?: string | null
          country?: string
          created_at?: string | null
          description?: string | null
          dual_pricing_percentage?: number
          ein?: string | null
          ein_last_four?: string | null
          email?: string | null
          id?: string
          is_accepting_orders?: boolean
          is_active?: boolean
          kds_workflow_mode?: string
          latitude?: number | null
          longitude?: number | null
          luqra_mid?: string | null
          luqra_mid_assigned_at?: string | null
          luqra_mid_descriptor?: string | null
          luqra_mid_status?: string
          merchant_id?: string
          name?: string
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          phone?: string | null
          pos_config?: Json
          postal_code?: string
          pricing_strategy?: string
          processor_fee_percentage?: number
          public_metadata?: Json | null
          sales_tax_rate?: number | null
          state?: string
          tax_id?: string | null
          tax_registration_status?: string | null
          timezone?: string
          tip_surcharge_percentage?: number
          updated_at?: string
          use_merchant_pricing_defaults?: boolean
          uses_global_menu?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "locations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_enrollments: {
        Row: {
          current_points: number
          current_punches: number
          current_visits: number
          customer_id: string
          enrolled_at: string | null
          id: string
          is_active: boolean | null
          last_earn_at: string | null
          last_redeem_at: string | null
          lifetime_points: number
          lifetime_punches: number
          lifetime_visits: number
          merchant_id: string
          program_id: string
          total_reward_value: number
          total_rewards_earned: number
          total_rewards_redeemed: number
          updated_at: string | null
        }
        Insert: {
          current_points?: number
          current_punches?: number
          current_visits?: number
          customer_id: string
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          last_earn_at?: string | null
          last_redeem_at?: string | null
          lifetime_points?: number
          lifetime_punches?: number
          lifetime_visits?: number
          merchant_id: string
          program_id: string
          total_reward_value?: number
          total_rewards_earned?: number
          total_rewards_redeemed?: number
          updated_at?: string | null
        }
        Update: {
          current_points?: number
          current_punches?: number
          current_visits?: number
          customer_id?: string
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          last_earn_at?: string | null
          last_redeem_at?: string | null
          lifetime_points?: number
          lifetime_punches?: number
          lifetime_visits?: number
          merchant_id?: string
          program_id?: string
          total_reward_value?: number
          total_rewards_earned?: number
          total_rewards_redeemed?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_enrollments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_enrollments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_enrollments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_enrollments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_enrollments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_enrollments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          auto_enroll: boolean | null
          cooldown_minutes: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          display_color: string | null
          display_icon: string | null
          earn_on_discounted: boolean | null
          ends_at: string | null
          excluded_categories: string[] | null
          excluded_item_ids: string[] | null
          id: string
          is_active: boolean | null
          is_stackable: boolean | null
          location_ids: string[] | null
          max_active_rewards: number | null
          merchant_id: string
          min_order_amount: number | null
          name: string
          points_per_dollar: number | null
          points_redemption_threshold: number | null
          points_redemption_value: number | null
          program_type: string
          punch_category_id: string | null
          punch_menu_item_id: string | null
          punch_target_type: string | null
          punches_required: number | null
          reward_category_id: string | null
          reward_description: string
          reward_expiry_days: number | null
          reward_max_value: number | null
          reward_menu_item_id: string | null
          reward_type: string
          reward_value: number | null
          starts_at: string | null
          updated_at: string | null
          visits_required: number | null
        }
        Insert: {
          auto_enroll?: boolean | null
          cooldown_minutes?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_color?: string | null
          display_icon?: string | null
          earn_on_discounted?: boolean | null
          ends_at?: string | null
          excluded_categories?: string[] | null
          excluded_item_ids?: string[] | null
          id?: string
          is_active?: boolean | null
          is_stackable?: boolean | null
          location_ids?: string[] | null
          max_active_rewards?: number | null
          merchant_id: string
          min_order_amount?: number | null
          name: string
          points_per_dollar?: number | null
          points_redemption_threshold?: number | null
          points_redemption_value?: number | null
          program_type: string
          punch_category_id?: string | null
          punch_menu_item_id?: string | null
          punch_target_type?: string | null
          punches_required?: number | null
          reward_category_id?: string | null
          reward_description: string
          reward_expiry_days?: number | null
          reward_max_value?: number | null
          reward_menu_item_id?: string | null
          reward_type: string
          reward_value?: number | null
          starts_at?: string | null
          updated_at?: string | null
          visits_required?: number | null
        }
        Update: {
          auto_enroll?: boolean | null
          cooldown_minutes?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_color?: string | null
          display_icon?: string | null
          earn_on_discounted?: boolean | null
          ends_at?: string | null
          excluded_categories?: string[] | null
          excluded_item_ids?: string[] | null
          id?: string
          is_active?: boolean | null
          is_stackable?: boolean | null
          location_ids?: string[] | null
          max_active_rewards?: number | null
          merchant_id?: string
          min_order_amount?: number | null
          name?: string
          points_per_dollar?: number | null
          points_redemption_threshold?: number | null
          points_redemption_value?: number | null
          program_type?: string
          punch_category_id?: string | null
          punch_menu_item_id?: string | null
          punch_target_type?: string | null
          punches_required?: number | null
          reward_category_id?: string | null
          reward_description?: string
          reward_expiry_days?: number | null
          reward_max_value?: number | null
          reward_menu_item_id?: string | null
          reward_type?: string
          reward_value?: number | null
          starts_at?: string | null
          updated_at?: string | null
          visits_required?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_programs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_programs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_programs_punch_category_id_fkey"
            columns: ["punch_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_programs_punch_menu_item_id_fkey"
            columns: ["punch_menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_programs_punch_menu_item_id_fkey"
            columns: ["punch_menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "loyalty_programs_reward_category_id_fkey"
            columns: ["reward_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_programs_reward_menu_item_id_fkey"
            columns: ["reward_menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_programs_reward_menu_item_id_fkey"
            columns: ["reward_menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          created_at: string | null
          customer_id: string
          earned_at: string | null
          enrollment_id: string
          expires_at: string | null
          id: string
          merchant_id: string
          program_id: string
          redeemed_at: string | null
          redeemed_location_id: string | null
          redeemed_order_id: string | null
          reward_category_id: string | null
          reward_description: string
          reward_max_value: number | null
          reward_menu_item_id: string | null
          reward_type: string
          reward_value: number
          status: string
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          earned_at?: string | null
          enrollment_id: string
          expires_at?: string | null
          id?: string
          merchant_id: string
          program_id: string
          redeemed_at?: string | null
          redeemed_location_id?: string | null
          redeemed_order_id?: string | null
          reward_category_id?: string | null
          reward_description: string
          reward_max_value?: number | null
          reward_menu_item_id?: string | null
          reward_type: string
          reward_value: number
          status?: string
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          earned_at?: string | null
          enrollment_id?: string
          expires_at?: string | null
          id?: string
          merchant_id?: string
          program_id?: string
          redeemed_at?: string | null
          redeemed_location_id?: string | null
          redeemed_order_id?: string | null
          reward_category_id?: string | null
          reward_description?: string
          reward_max_value?: number | null
          reward_menu_item_id?: string | null
          reward_type?: string
          reward_value?: number
          status?: string
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "loyalty_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_redeemed_location_id_fkey"
            columns: ["redeemed_location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_redeemed_location_id_fkey"
            columns: ["redeemed_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_redeemed_location_id_fkey"
            columns: ["redeemed_location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "loyalty_rewards_redeemed_order_id_fkey"
            columns: ["redeemed_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_reward_category_id_fkey"
            columns: ["reward_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_reward_menu_item_id_fkey"
            columns: ["reward_menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_reward_menu_item_id_fkey"
            columns: ["reward_menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          balance_points: number
          balance_punches: number
          balance_visits: number
          created_at: string | null
          customer_id: string
          description: string
          enrollment_id: string
          id: string
          location_id: string | null
          merchant_id: string
          metadata: Json | null
          order_id: string | null
          points_delta: number
          program_id: string
          punches_delta: number
          reward_id: string | null
          staff_id: string | null
          transaction_type: string
          visits_delta: number
        }
        Insert: {
          balance_points?: number
          balance_punches?: number
          balance_visits?: number
          created_at?: string | null
          customer_id: string
          description: string
          enrollment_id: string
          id?: string
          location_id?: string | null
          merchant_id: string
          metadata?: Json | null
          order_id?: string | null
          points_delta?: number
          program_id: string
          punches_delta?: number
          reward_id?: string | null
          staff_id?: string | null
          transaction_type: string
          visits_delta?: number
        }
        Update: {
          balance_points?: number
          balance_punches?: number
          balance_visits?: number
          created_at?: string | null
          customer_id?: string
          description?: string
          enrollment_id?: string
          id?: string
          location_id?: string | null
          merchant_id?: string
          metadata?: Json | null
          order_id?: string | null
          points_delta?: number
          program_id?: string
          punches_delta?: number
          reward_id?: string | null
          staff_id?: string | null
          transaction_type?: string
          visits_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "loyalty_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "loyalty_transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      luqra_batches: {
        Row: {
          amex_count: number
          amex_sales: number
          approved_batches: number
          batch_date: string | null
          batched_amount: number
          created_at: string
          credits_amount: number
          deposit_id: string | null
          discover_count: number
          discover_sales: number
          doing_business_as: string | null
          ebt_count: number
          ebt_sales: number
          first_seen_at: string
          has_duplicate_rejects_within_30_days: boolean
          id: string
          last_seen_at: string
          location_id: string | null
          mastercard_count: number
          mastercard_sales: number
          merchant_id: string
          merchant_reference_number: string | null
          mid: string
          net_deposit: number
          pin_count: number
          pin_sales: number
          raw: Json
          reject_reason: string | null
          rejects_amount: number
          statement_date: string | null
          transactions_count: number
          updated_at: string
          visa_count: number
          visa_sales: number
        }
        Insert: {
          amex_count?: number
          amex_sales?: number
          approved_batches?: number
          batch_date?: string | null
          batched_amount?: number
          created_at?: string
          credits_amount?: number
          deposit_id?: string | null
          discover_count?: number
          discover_sales?: number
          doing_business_as?: string | null
          ebt_count?: number
          ebt_sales?: number
          first_seen_at?: string
          has_duplicate_rejects_within_30_days?: boolean
          id: string
          last_seen_at?: string
          location_id?: string | null
          mastercard_count?: number
          mastercard_sales?: number
          merchant_id: string
          merchant_reference_number?: string | null
          mid: string
          net_deposit?: number
          pin_count?: number
          pin_sales?: number
          raw?: Json
          reject_reason?: string | null
          rejects_amount?: number
          statement_date?: string | null
          transactions_count?: number
          updated_at?: string
          visa_count?: number
          visa_sales?: number
        }
        Update: {
          amex_count?: number
          amex_sales?: number
          approved_batches?: number
          batch_date?: string | null
          batched_amount?: number
          created_at?: string
          credits_amount?: number
          deposit_id?: string | null
          discover_count?: number
          discover_sales?: number
          doing_business_as?: string | null
          ebt_count?: number
          ebt_sales?: number
          first_seen_at?: string
          has_duplicate_rejects_within_30_days?: boolean
          id?: string
          last_seen_at?: string
          location_id?: string | null
          mastercard_count?: number
          mastercard_sales?: number
          merchant_id?: string
          merchant_reference_number?: string | null
          mid?: string
          net_deposit?: number
          pin_count?: number
          pin_sales?: number
          raw?: Json
          reject_reason?: string | null
          rejects_amount?: number
          statement_date?: string | null
          transactions_count?: number
          updated_at?: string
          visa_count?: number
          visa_sales?: number
        }
        Relationships: [
          {
            foreignKeyName: "luqra_batches_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "luqra_deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "luqra_batches_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_batches_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      luqra_chargebacks: {
        Row: {
          acquirer_reference_number: string | null
          application_id: string | null
          auth_code: string | null
          card_brand: number | null
          cardholder_account_number: string | null
          case_amount: number
          case_number: string
          case_type: number | null
          created_at: string
          current_status: string | null
          date_loaded: string | null
          date_transaction: string | null
          debit_credit: string | null
          dispute_type: string | null
          doing_business_as: string | null
          first_seen_at: string
          history: Json
          id: number
          is_reversal: string | null
          item_type: number | null
          last_date_loaded: string | null
          last_seen_at: string
          location_id: string | null
          merch_amount: number
          merchant_id: string
          mid: string
          raw: Json
          reason_code: string | null
          reason_description: string | null
          reconciled_at: string | null
          reconciled_payment_id: string | null
          resolution_to: string | null
          status_id: number | null
          trans_id: string | null
          updated_at: string
        }
        Insert: {
          acquirer_reference_number?: string | null
          application_id?: string | null
          auth_code?: string | null
          card_brand?: number | null
          cardholder_account_number?: string | null
          case_amount?: number
          case_number: string
          case_type?: number | null
          created_at?: string
          current_status?: string | null
          date_loaded?: string | null
          date_transaction?: string | null
          debit_credit?: string | null
          dispute_type?: string | null
          doing_business_as?: string | null
          first_seen_at?: string
          history?: Json
          id: number
          is_reversal?: string | null
          item_type?: number | null
          last_date_loaded?: string | null
          last_seen_at?: string
          location_id?: string | null
          merch_amount?: number
          merchant_id: string
          mid: string
          raw?: Json
          reason_code?: string | null
          reason_description?: string | null
          reconciled_at?: string | null
          reconciled_payment_id?: string | null
          resolution_to?: string | null
          status_id?: number | null
          trans_id?: string | null
          updated_at?: string
        }
        Update: {
          acquirer_reference_number?: string | null
          application_id?: string | null
          auth_code?: string | null
          card_brand?: number | null
          cardholder_account_number?: string | null
          case_amount?: number
          case_number?: string
          case_type?: number | null
          created_at?: string
          current_status?: string | null
          date_loaded?: string | null
          date_transaction?: string | null
          debit_credit?: string | null
          dispute_type?: string | null
          doing_business_as?: string | null
          first_seen_at?: string
          history?: Json
          id?: number
          is_reversal?: string | null
          item_type?: number | null
          last_date_loaded?: string | null
          last_seen_at?: string
          location_id?: string | null
          merch_amount?: number
          merchant_id?: string
          mid?: string
          raw?: Json
          reason_code?: string | null
          reason_description?: string | null
          reconciled_at?: string | null
          reconciled_payment_id?: string | null
          resolution_to?: string | null
          status_id?: number | null
          trans_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "luqra_chargebacks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_chargebacks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_chargebacks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "luqra_chargebacks_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_chargebacks_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_chargebacks_reconciled_payment_id_fkey"
            columns: ["reconciled_payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_chargebacks_reconciled_payment_id_fkey"
            columns: ["reconciled_payment_id"]
            isOneToOne: false
            referencedRelation: "pci_safe_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_chargebacks_reconciled_payment_id_fkey"
            columns: ["reconciled_payment_id"]
            isOneToOne: false
            referencedRelation: "vw_platform_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      luqra_deposits: {
        Row: {
          adjustment_amount: number
          batch_total: number
          chargeback_amount: number
          chargeback_case_number: string | null
          created_at: string
          daily_fees: number
          dda_number: string | null
          deposit_date: string
          doing_business_as: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          location_id: string | null
          merchant_id: string
          mid: string
          net_batches: number
          net_deposit: number
          raw: Json
          reference_number: string | null
          reserved_funds: number
          routing_number: string | null
          split_funding_amount: number
          statement_date: string | null
          updated_at: string
        }
        Insert: {
          adjustment_amount?: number
          batch_total?: number
          chargeback_amount?: number
          chargeback_case_number?: string | null
          created_at?: string
          daily_fees?: number
          dda_number?: string | null
          deposit_date: string
          doing_business_as?: string | null
          first_seen_at?: string
          id: string
          last_seen_at?: string
          location_id?: string | null
          merchant_id: string
          mid: string
          net_batches?: number
          net_deposit?: number
          raw?: Json
          reference_number?: string | null
          reserved_funds?: number
          routing_number?: string | null
          split_funding_amount?: number
          statement_date?: string | null
          updated_at?: string
        }
        Update: {
          adjustment_amount?: number
          batch_total?: number
          chargeback_amount?: number
          chargeback_case_number?: string | null
          created_at?: string
          daily_fees?: number
          dda_number?: string | null
          deposit_date?: string
          doing_business_as?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          location_id?: string | null
          merchant_id?: string
          mid?: string
          net_batches?: number
          net_deposit?: number
          raw?: Json
          reference_number?: string | null
          reserved_funds?: number
          routing_number?: string | null
          split_funding_amount?: number
          statement_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "luqra_deposits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_deposits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_deposits_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "luqra_deposits_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_deposits_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      luqra_sync_runs: {
        Row: {
          date_from: string | null
          date_to: string | null
          error_code: string | null
          finished_at: string | null
          id: string
          location_id: string | null
          merchant_id: string
          mid: string
          pages_fetched: number
          resource: string
          rows_ingested: number
          rows_reconciled: number
          rows_updated: number
          started_at: string
          status: string
        }
        Insert: {
          date_from?: string | null
          date_to?: string | null
          error_code?: string | null
          finished_at?: string | null
          id?: string
          location_id?: string | null
          merchant_id: string
          mid: string
          pages_fetched?: number
          resource: string
          rows_ingested?: number
          rows_reconciled?: number
          rows_updated?: number
          started_at?: string
          status?: string
        }
        Update: {
          date_from?: string | null
          date_to?: string | null
          error_code?: string | null
          finished_at?: string | null
          id?: string
          location_id?: string | null
          merchant_id?: string
          mid?: string
          pages_fetched?: number
          resource?: string
          rows_ingested?: number
          rows_reconciled?: number
          rows_updated?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "luqra_sync_runs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_sync_runs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_sync_runs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "luqra_sync_runs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_sync_runs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      luqra_transactions: {
        Row: {
          account_first6: string | null
          account_last4: string | null
          amount_dollars: number
          authorization_number: string
          batch_id: string
          card_type: string | null
          created_at: string
          debit_credit_indicator: string | null
          deposit_id: string | null
          doing_business_as: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          legal_business_name: string | null
          location_id: string | null
          merchant_id: string
          mid: string
          original_transaction_date: string
          pos_entry_mode: string | null
          raw: Json
          reconciled_at: string | null
          reconciled_order_id: string | null
          reconciled_payment_id: string | null
          reject_reason: string | null
          terminal_id: string | null
          transaction_code: string | null
          transaction_code_description: string | null
          transaction_date: string | null
          updated_at: string
        }
        Insert: {
          account_first6?: string | null
          account_last4?: string | null
          amount_dollars?: number
          authorization_number: string
          batch_id: string
          card_type?: string | null
          created_at?: string
          debit_credit_indicator?: string | null
          deposit_id?: string | null
          doing_business_as?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          legal_business_name?: string | null
          location_id?: string | null
          merchant_id: string
          mid: string
          original_transaction_date: string
          pos_entry_mode?: string | null
          raw?: Json
          reconciled_at?: string | null
          reconciled_order_id?: string | null
          reconciled_payment_id?: string | null
          reject_reason?: string | null
          terminal_id?: string | null
          transaction_code?: string | null
          transaction_code_description?: string | null
          transaction_date?: string | null
          updated_at?: string
        }
        Update: {
          account_first6?: string | null
          account_last4?: string | null
          amount_dollars?: number
          authorization_number?: string
          batch_id?: string
          card_type?: string | null
          created_at?: string
          debit_credit_indicator?: string | null
          deposit_id?: string | null
          doing_business_as?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          legal_business_name?: string | null
          location_id?: string | null
          merchant_id?: string
          mid?: string
          original_transaction_date?: string
          pos_entry_mode?: string | null
          raw?: Json
          reconciled_at?: string | null
          reconciled_order_id?: string | null
          reconciled_payment_id?: string | null
          reject_reason?: string | null
          terminal_id?: string | null
          transaction_code?: string | null
          transaction_code_description?: string | null
          transaction_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "luqra_transactions_deposit_id_fkey"
            columns: ["deposit_id"]
            isOneToOne: false
            referencedRelation: "luqra_deposits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "luqra_transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_transactions_reconciled_payment_id_fkey"
            columns: ["reconciled_payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_transactions_reconciled_payment_id_fkey"
            columns: ["reconciled_payment_id"]
            isOneToOne: false
            referencedRelation: "pci_safe_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "luqra_transactions_reconciled_payment_id_fkey"
            columns: ["reconciled_payment_id"]
            isOneToOne: false
            referencedRelation: "vw_platform_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          audience_filter: Json | null
          audience_tags: string[] | null
          audience_type: string
          body: string
          campaign_type: string
          created_at: string | null
          created_by: string | null
          id: string
          merchant_id: string
          name: string
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string | null
          total_bounced: number | null
          total_clicked: number | null
          total_delivered: number | null
          total_opened: number | null
          total_recipients: number | null
          total_unsubscribed: number | null
          updated_at: string | null
        }
        Insert: {
          audience_filter?: Json | null
          audience_tags?: string[] | null
          audience_type?: string
          body: string
          campaign_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          merchant_id: string
          name: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          total_bounced?: number | null
          total_clicked?: number | null
          total_delivered?: number | null
          total_opened?: number | null
          total_recipients?: number | null
          total_unsubscribed?: number | null
          updated_at?: string | null
        }
        Update: {
          audience_filter?: Json | null
          audience_tags?: string[] | null
          audience_type?: string
          body?: string
          campaign_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          merchant_id?: string
          name?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          total_bounced?: number | null
          total_clicked?: number | null
          total_delivered?: number | null
          total_opened?: number | null
          total_recipients?: number | null
          total_unsubscribed?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_recipients: {
        Row: {
          campaign_id: string
          channel: string
          clicked_at: string | null
          created_at: string | null
          customer_id: string
          delivered_at: string | null
          destination: string
          error_message: string | null
          id: string
          opened_at: string | null
          sent_at: string | null
          status: string
          unsubscribed_at: string | null
        }
        Insert: {
          campaign_id: string
          channel: string
          clicked_at?: string | null
          created_at?: string | null
          customer_id: string
          delivered_at?: string | null
          destination: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          unsubscribed_at?: string | null
        }
        Update: {
          campaign_id?: string
          channel?: string
          clicked_at?: string | null
          created_at?: string | null
          customer_id?: string
          delivered_at?: string | null
          destination?: string
          error_message?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          status?: string
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_recipients_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: string | null
          staff_profile_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: string | null
          staff_profile_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: string | null
          staff_profile_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "members_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          category_id: string
          created_at: string
          custom_image: string | null
          custom_subtitle: string | null
          custom_title: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          menu_id: string
          merchant_id: string
          updated_at: string | null
        }
        Insert: {
          category_id: string
          created_at?: string
          custom_image?: string | null
          custom_subtitle?: string | null
          custom_title?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          menu_id: string
          merchant_id: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string
          custom_image?: string | null
          custom_subtitle?: string | null
          custom_title?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          menu_id?: string
          merchant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_categories_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_categories_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_id"]
          },
          {
            foreignKeyName: "menu_categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_discounts: {
        Row: {
          created_at: string
          discount_id: string
          id: string
          menu_item_id: string
          merchant_id: string
        }
        Insert: {
          created_at?: string
          discount_id: string
          id?: string
          menu_item_id: string
          merchant_id: string
        }
        Update: {
          created_at?: string
          discount_id?: string
          id?: string
          menu_item_id?: string
          merchant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_discounts_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_discounts_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_discounts_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "menu_item_discounts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_discounts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_menus: {
        Row: {
          created_at: string
          custom_cash_price: number | null
          custom_price: number | null
          display_order: number | null
          id: string
          is_available: boolean
          is_migrated: boolean | null
          menu_id: string
          menu_item_id: string
          merchant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_cash_price?: number | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_available?: boolean
          is_migrated?: boolean | null
          menu_id: string
          menu_item_id: string
          merchant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_cash_price?: number | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_available?: boolean
          is_migrated?: boolean | null
          menu_id?: string
          menu_item_id?: string
          merchant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_menus_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_menus_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_id"]
          },
          {
            foreignKeyName: "menu_item_menus_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_menus_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "menu_item_menus_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_menus_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_modifier_groups: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          menu_item_id: string
          merchant_id: string
          modifier_group_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          menu_item_id: string
          merchant_id: string
          modifier_group_id: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          menu_item_id?: string
          merchant_id?: string
          modifier_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_recipes: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string | null
          menu_item_id: string
          merchant_id: string
          quantity_multiplier: number
          quantity_used: number | null
          recipe_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          menu_item_id: string
          merchant_id: string
          quantity_multiplier?: number
          quantity_used?: number | null
          recipe_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          menu_item_id?: string
          merchant_id?: string
          quantity_multiplier?: number
          quantity_used?: number | null
          recipe_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_recipes_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "menu_item_recipes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_recipes_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          allergens: string[] | null
          availability: boolean
          available_channels: Json | null
          card_bg_color: string | null
          cash_price: number | null
          created_at: string
          delivery_price: number | null
          description: string | null
          dietary_flags: string[]
          id: string
          image: string | null
          is_tax_exempt: boolean | null
          location_id: string | null
          meal_types: string[] | null
          merchant_id: string
          name: string
          price: number
          source_external_id: string | null
          source_system: string | null
          stock_tracking_mode: string | null
          tax_category: string
          updated_at: string
          use_delivery_price: boolean | null
          version: number
        }
        Insert: {
          allergens?: string[] | null
          availability?: boolean
          available_channels?: Json | null
          card_bg_color?: string | null
          cash_price?: number | null
          created_at?: string
          delivery_price?: number | null
          description?: string | null
          dietary_flags?: string[]
          id?: string
          image?: string | null
          is_tax_exempt?: boolean | null
          location_id?: string | null
          meal_types?: string[] | null
          merchant_id: string
          name: string
          price: number
          source_external_id?: string | null
          source_system?: string | null
          stock_tracking_mode?: string | null
          tax_category?: string
          updated_at?: string
          use_delivery_price?: boolean | null
          version?: number
        }
        Update: {
          allergens?: string[] | null
          availability?: boolean
          available_channels?: Json | null
          card_bg_color?: string | null
          cash_price?: number | null
          created_at?: string
          delivery_price?: number | null
          description?: string | null
          dietary_flags?: string[]
          id?: string
          image?: string | null
          is_tax_exempt?: boolean | null
          location_id?: string | null
          meal_types?: string[] | null
          merchant_id?: string
          name?: string
          price?: number
          source_external_id?: string | null
          source_system?: string | null
          stock_tracking_mode?: string | null
          tax_category?: string
          updated_at?: string
          use_delivery_price?: boolean | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "menu_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_schedules: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          menu_id: string
          merchant_id: string
          schedule_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          menu_id: string
          merchant_id: string
          schedule_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          menu_id?: string
          merchant_id?: string
          schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "menu_schedules_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_schedules_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_id"]
          },
          {
            foreignKeyName: "menu_schedules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_schedules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_schedules_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number | null
          id: string
          image: string | null
          is_active: boolean
          location_id: string | null
          merchant_id: string
          name: string
          source_external_id: string | null
          source_system: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image?: string | null
          is_active?: boolean
          location_id?: string | null
          merchant_id: string
          name: string
          source_external_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image?: string | null
          is_active?: boolean
          location_id?: string | null
          merchant_id?: string
          name?: string
          source_external_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "menus_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_billing_profiles: {
        Row: {
          account_holder_name: string | null
          account_number_last_four: string | null
          account_type: string | null
          bank_name: string | null
          billing_email: string | null
          billing_method: string
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last_four: string | null
          card_token: string | null
          created_at: string
          customer_vault_id: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          is_verified: boolean
          location_id: string | null
          merchant_id: string
          payment_device_id: string | null
          platform_billing_config_id: string | null
          routing_number_last_four: string | null
          updated_at: string
          vault_initial_transaction_id: string | null
          verified_at: string | null
        }
        Insert: {
          account_holder_name?: string | null
          account_number_last_four?: string | null
          account_type?: string | null
          bank_name?: string | null
          billing_email?: string | null
          billing_method?: string
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last_four?: string | null
          card_token?: string | null
          created_at?: string
          customer_vault_id?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          is_verified?: boolean
          location_id?: string | null
          merchant_id: string
          payment_device_id?: string | null
          platform_billing_config_id?: string | null
          routing_number_last_four?: string | null
          updated_at?: string
          vault_initial_transaction_id?: string | null
          verified_at?: string | null
        }
        Update: {
          account_holder_name?: string | null
          account_number_last_four?: string | null
          account_type?: string | null
          bank_name?: string | null
          billing_email?: string | null
          billing_method?: string
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last_four?: string | null
          card_token?: string | null
          created_at?: string
          customer_vault_id?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          is_verified?: boolean
          location_id?: string | null
          merchant_id?: string
          payment_device_id?: string | null
          platform_billing_config_id?: string | null
          routing_number_last_four?: string | null
          updated_at?: string
          vault_initial_transaction_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_billing_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_billing_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_billing_profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "merchant_billing_profiles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_billing_profiles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_billing_profiles_payment_device_id_fkey"
            columns: ["payment_device_id"]
            isOneToOne: false
            referencedRelation: "location_payment_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_billing_profiles_platform_billing_config_id_fkey"
            columns: ["platform_billing_config_id"]
            isOneToOne: false
            referencedRelation: "platform_billing_provider_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_notes: {
        Row: {
          author_name: string
          author_role: string | null
          author_user_id: string
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          merchant_id: string
          updated_at: string
        }
        Insert: {
          author_name: string
          author_role?: string | null
          author_user_id: string
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          merchant_id: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          author_role?: string | null
          author_user_id?: string
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          merchant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_notes_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_notes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_notes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_payment_credential_access_log: {
        Row: {
          actor_user_id: string | null
          called_at: string
          function_name: string
          id: string
          merchant_id: string
          merchant_payment_credential_id: string | null
          metadata: Json
          store_config_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          called_at?: string
          function_name: string
          id?: string
          merchant_id: string
          merchant_payment_credential_id?: string | null
          metadata?: Json
          store_config_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          called_at?: string
          function_name?: string
          id?: string
          merchant_id?: string
          merchant_payment_credential_id?: string | null
          metadata?: Json
          store_config_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_payment_credential_a_merchant_payment_credential__fkey"
            columns: ["merchant_payment_credential_id"]
            isOneToOne: false
            referencedRelation: "merchant_payment_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_payment_credential_access_log_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_payment_credential_access_log_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_payment_credential_access_log_store_config_id_fkey"
            columns: ["store_config_id"]
            isOneToOne: false
            referencedRelation: "online_store_config"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_payment_credentials: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          merchant_id: string
          private_api_key_secret_id: string
          provider: string
          tokenization_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id: string
          private_api_key_secret_id: string
          provider: string
          tokenization_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id?: string
          private_api_key_secret_id?: string
          provider?: string
          tokenization_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_payment_credentials_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_payment_credentials_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_plan_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          merchant_id: string
          plan_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          merchant_id: string
          plan_id: string
          status: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          merchant_id?: string
          plan_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_plan_subscriptions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_plan_subscriptions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_plan_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_subscription_services: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          metadata: Json
          quantity: number
          service_id: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          metadata?: Json
          quantity?: number
          service_id: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          metadata?: Json
          quantity?: number
          service_id?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_subscription_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "billable_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_subscription_services_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "merchant_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_subscriptions: {
        Row: {
          billing_profile_id: string | null
          cancel_reason: string | null
          canceled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          location_id: string
          merchant_id: string
          metadata: Json
          monthly_amount: number
          next_billing_date: string
          plan_id: string
          started_at: string
          station_count: number
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_profile_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          location_id: string
          merchant_id: string
          metadata?: Json
          monthly_amount: number
          next_billing_date: string
          plan_id: string
          started_at?: string
          station_count?: number
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_profile_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          location_id?: string
          merchant_id?: string
          metadata?: Json
          monthly_amount?: number
          next_billing_date?: string
          plan_id?: string
          started_at?: string
          station_count?: number
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_subscriptions_billing_profile_id_fkey"
            columns: ["billing_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_subscriptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_subscriptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_subscriptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "merchant_subscriptions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_subscriptions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          activated_at: string | null
          business_address_line1: string | null
          business_address_line2: string | null
          business_city: string | null
          business_country: string | null
          business_legal_name: string | null
          business_postal_code: string | null
          business_state: string | null
          business_type: string | null
          carrier_id: string | null
          cascade_is_settled_enabled: boolean
          clerk_org_id: string
          created_at: string | null
          dba_name: string | null
          dual_pricing_percentage: number
          ein_last_four: string | null
          external_merchant_id: string | null
          id: string
          name: string
          onboarding_completed_at: string | null
          onboarding_status: string
          owner_email: string | null
          owner_first_name: string | null
          owner_last_name: string | null
          owner_phone: string | null
          pricing_strategy: string
          public_metadata: Json | null
          suspended_at: string | null
          suspension_initiated_at: string | null
          suspension_reason: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          activated_at?: string | null
          business_address_line1?: string | null
          business_address_line2?: string | null
          business_city?: string | null
          business_country?: string | null
          business_legal_name?: string | null
          business_postal_code?: string | null
          business_state?: string | null
          business_type?: string | null
          carrier_id?: string | null
          cascade_is_settled_enabled?: boolean
          clerk_org_id: string
          created_at?: string | null
          dba_name?: string | null
          dual_pricing_percentage?: number
          ein_last_four?: string | null
          external_merchant_id?: string | null
          id?: string
          name: string
          onboarding_completed_at?: string | null
          onboarding_status?: string
          owner_email?: string | null
          owner_first_name?: string | null
          owner_last_name?: string | null
          owner_phone?: string | null
          pricing_strategy?: string
          public_metadata?: Json | null
          suspended_at?: string | null
          suspension_initiated_at?: string | null
          suspension_reason?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          activated_at?: string | null
          business_address_line1?: string | null
          business_address_line2?: string | null
          business_city?: string | null
          business_country?: string | null
          business_legal_name?: string | null
          business_postal_code?: string | null
          business_state?: string | null
          business_type?: string | null
          carrier_id?: string | null
          cascade_is_settled_enabled?: boolean
          clerk_org_id?: string
          created_at?: string | null
          dba_name?: string | null
          dual_pricing_percentage?: number
          ein_last_four?: string | null
          external_merchant_id?: string | null
          id?: string
          name?: string
          onboarding_completed_at?: string | null
          onboarding_status?: string
          owner_email?: string | null
          owner_first_name?: string | null
          owner_last_name?: string | null
          owner_phone?: string | null
          pricing_strategy?: string
          public_metadata?: Json | null
          suspended_at?: string | null
          suspension_initiated_at?: string | null
          suspension_reason?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchants_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchants_clerk_org_id_fkey"
            columns: ["clerk_org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_log: {
        Row: {
          body: string | null
          campaign_id: string | null
          channel: string
          cost: number | null
          created_at: string
          customer_id: string | null
          direction: string
          error_code: string | null
          from_number: string | null
          id: string
          merchant_id: string | null
          messaging_profile_id: string | null
          occurred_at: string | null
          raw: Json | null
          recipient_id: string | null
          status: string | null
          telnyx_message_id: string | null
          to_number: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          channel?: string
          cost?: number | null
          created_at?: string
          customer_id?: string | null
          direction: string
          error_code?: string | null
          from_number?: string | null
          id?: string
          merchant_id?: string | null
          messaging_profile_id?: string | null
          occurred_at?: string | null
          raw?: Json | null
          recipient_id?: string | null
          status?: string | null
          telnyx_message_id?: string | null
          to_number?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          channel?: string
          cost?: number | null
          created_at?: string
          customer_id?: string | null
          direction?: string
          error_code?: string | null
          from_number?: string | null
          id?: string
          merchant_id?: string | null
          messaging_profile_id?: string | null
          occurred_at?: string | null
          raw?: Json | null
          recipient_id?: string | null
          status?: string | null
          telnyx_message_id?: string | null
          to_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_log_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_log_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_log_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "marketing_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_group_item_recipes: {
        Row: {
          created_at: string | null
          id: string
          inventory_item_id: string
          merchant_id: string
          modifier_group_item_id: string
          quantity_used: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_item_id: string
          merchant_id: string
          modifier_group_item_id: string
          quantity_used?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          merchant_id?: string
          modifier_group_item_id?: string
          quantity_used?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "modifier_group_item_recipes_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_group_item_recipes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_group_item_recipes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_group_item_recipes_modifier_group_item_id_fkey"
            columns: ["modifier_group_item_id"]
            isOneToOne: false
            referencedRelation: "modifier_group_items"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_group_items: {
        Row: {
          created_at: string
          delivery_price_modifier: number | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean
          is_default: boolean | null
          merchant_id: string
          modifier_group_id: string
          name: string
          price_modifier: number
          source_external_id: string | null
          source_system: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_price_modifier?: number | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          merchant_id: string
          modifier_group_id: string
          name: string
          price_modifier?: number
          source_external_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_price_modifier?: number | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          is_default?: boolean | null
          merchant_id?: string
          modifier_group_id?: string
          name?: string
          price_modifier?: number
          source_external_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_group_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_group_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_group_items_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_required: boolean
          location_id: string | null
          max_selections: number | null
          merchant_id: string
          min_selections: number
          name: string
          source_external_id: string | null
          source_system: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean
          location_id?: string | null
          max_selections?: number | null
          merchant_id: string
          min_selections?: number
          name: string
          source_external_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean
          location_id?: string | null
          max_selections?: number | null
          merchant_id?: string
          min_selections?: number
          name?: string
          source_external_id?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_groups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_groups_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "modifier_groups_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_groups_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      online_order_payment_intents: {
        Row: {
          amount: number | null
          amount_cents: number
          card_last4: string | null
          card_token: string | null
          card_type: string | null
          created_at: string
          delivery_fee: number | null
          delivery_fee_cents: number
          expires_at: string
          id: string
          ipospays_tpn: string
          location_id: string
          merchant_id: string
          order_data: Json
          order_id: string | null
          payment_method: string | null
          payment_response: Json | null
          session_id: string
          status: string
          store_config_id: string
          subtotal: number | null
          subtotal_cents: number
          tax: number | null
          tax_cents: number
          tip: number | null
          tip_cents: number
          transaction_reference_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          amount_cents: number
          card_last4?: string | null
          card_token?: string | null
          card_type?: string | null
          created_at?: string
          delivery_fee?: number | null
          delivery_fee_cents?: number
          expires_at?: string
          id?: string
          ipospays_tpn: string
          location_id: string
          merchant_id: string
          order_data: Json
          order_id?: string | null
          payment_method?: string | null
          payment_response?: Json | null
          session_id: string
          status?: string
          store_config_id: string
          subtotal?: number | null
          subtotal_cents: number
          tax?: number | null
          tax_cents: number
          tip?: number | null
          tip_cents?: number
          transaction_reference_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          amount_cents?: number
          card_last4?: string | null
          card_token?: string | null
          card_type?: string | null
          created_at?: string
          delivery_fee?: number | null
          delivery_fee_cents?: number
          expires_at?: string
          id?: string
          ipospays_tpn?: string
          location_id?: string
          merchant_id?: string
          order_data?: Json
          order_id?: string | null
          payment_method?: string | null
          payment_response?: Json | null
          session_id?: string
          status?: string
          store_config_id?: string
          subtotal?: number | null
          subtotal_cents?: number
          tax?: number | null
          tax_cents?: number
          tip?: number | null
          tip_cents?: number
          transaction_reference_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "online_order_payment_intents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_payment_intents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_payment_intents_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "online_order_payment_intents_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_payment_intents_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_payment_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_payment_intents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "online_order_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_payment_intents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "qr_online_order_sessions_safe_v1"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_payment_intents_store_config_id_fkey"
            columns: ["store_config_id"]
            isOneToOne: false
            referencedRelation: "online_store_config"
            referencedColumns: ["id"]
          },
        ]
      }
      online_order_sessions: {
        Row: {
          cart_data: Json | null
          created_at: string
          customer_email: string | null
          customer_email_opt_in: boolean
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_sms_opt_in: boolean
          delivery_address: Json | null
          delivery_zone_id: string | null
          expires_at: string | null
          floor_plan_object_id: string | null
          id: string
          is_authenticated: boolean
          loyalty_points_balance: number | null
          loyalty_points_to_apply: number | null
          order_id: string | null
          order_type: string | null
          requested_time: string | null
          session_token: string | null
          store_config_id: string
          supabase_auth_id: string | null
          table_label: string | null
          table_qr_code_id: string | null
          updated_at: string
        }
        Insert: {
          cart_data?: Json | null
          created_at?: string
          customer_email?: string | null
          customer_email_opt_in?: boolean
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_sms_opt_in?: boolean
          delivery_address?: Json | null
          delivery_zone_id?: string | null
          expires_at?: string | null
          floor_plan_object_id?: string | null
          id?: string
          is_authenticated?: boolean
          loyalty_points_balance?: number | null
          loyalty_points_to_apply?: number | null
          order_id?: string | null
          order_type?: string | null
          requested_time?: string | null
          session_token?: string | null
          store_config_id: string
          supabase_auth_id?: string | null
          table_label?: string | null
          table_qr_code_id?: string | null
          updated_at?: string
        }
        Update: {
          cart_data?: Json | null
          created_at?: string
          customer_email?: string | null
          customer_email_opt_in?: boolean
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_sms_opt_in?: boolean
          delivery_address?: Json | null
          delivery_zone_id?: string | null
          expires_at?: string | null
          floor_plan_object_id?: string | null
          id?: string
          is_authenticated?: boolean
          loyalty_points_balance?: number | null
          loyalty_points_to_apply?: number | null
          order_id?: string | null
          order_type?: string | null
          requested_time?: string | null
          session_token?: string | null
          store_config_id?: string
          supabase_auth_id?: string | null
          table_label?: string | null
          table_qr_code_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "online_order_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_floor_plan_object_id_fkey"
            columns: ["floor_plan_object_id"]
            isOneToOne: false
            referencedRelation: "floor_plan_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_store_config_id_fkey"
            columns: ["store_config_id"]
            isOneToOne: false
            referencedRelation: "online_store_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_table_qr_code_id_fkey"
            columns: ["table_qr_code_id"]
            isOneToOne: false
            referencedRelation: "table_qr_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      online_orders: {
        Row: {
          created_at: string
          delivery_company: string | null
          delivery_driver: string | null
          delivery_tracking: string | null
          estimated_delivery: string | null
          external_reference: string | null
          id: string
          location_id: string
          merchant_id: string
          order_id: string
          placed_at: string | null
          provider: Database["public"]["Enums"]["online_order_provider"]
          provider_metadata: Json | null
          provider_order_id: string
          provider_restaurant_id: string | null
          provider_status: string
          raw_payload: Json | null
          ready_by: string | null
          status_updated_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_company?: string | null
          delivery_driver?: string | null
          delivery_tracking?: string | null
          estimated_delivery?: string | null
          external_reference?: string | null
          id?: string
          location_id: string
          merchant_id: string
          order_id: string
          placed_at?: string | null
          provider: Database["public"]["Enums"]["online_order_provider"]
          provider_metadata?: Json | null
          provider_order_id: string
          provider_restaurant_id?: string | null
          provider_status?: string
          raw_payload?: Json | null
          ready_by?: string | null
          status_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_company?: string | null
          delivery_driver?: string | null
          delivery_tracking?: string | null
          estimated_delivery?: string | null
          external_reference?: string | null
          id?: string
          location_id?: string
          merchant_id?: string
          order_id?: string
          placed_at?: string | null
          provider?: Database["public"]["Enums"]["online_order_provider"]
          provider_metadata?: Json | null
          provider_order_id?: string
          provider_restaurant_id?: string | null
          provider_status?: string
          raw_payload?: Json | null
          ready_by?: string | null
          status_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "online_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "online_orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      online_store_config: {
        Row: {
          accent_color: string | null
          accepts_card_on_delivery: boolean
          accepts_cash_on_delivery: boolean
          accepts_delivery: boolean
          accepts_dine_in: boolean
          accepts_online_payments: boolean
          accepts_pickup: boolean
          address: Json | null
          auto_accept_orders: boolean
          background_color: string
          border_color: string | null
          card_color: string | null
          created_at: string
          custom_domain: string | null
          delivery_fee: number | null
          delivery_fee_cents: number | null
          delivery_pricing_enabled: boolean
          delivery_radius_miles: number | null
          description: string | null
          email: string | null
          estimated_prep_minutes: number | null
          facebook_pixel_id: string | null
          favicon_url: string | null
          font_family: string | null
          free_delivery_threshold: number | null
          free_delivery_threshold_cents: number | null
          google_analytics_id: string | null
          header_style: string
          header_text_color: string | null
          hero_image_url: string | null
          id: string
          ipospays_ftd_ecom_key: string | null
          ipospays_tpn: string | null
          is_active: boolean
          location_id: string
          logo_url: string | null
          max_future_order_days: number | null
          menu_layout: string
          merchant_id: string
          meta_description: string | null
          meta_title: string | null
          min_order: number | null
          min_order_cents: number | null
          notification_prefs: Json
          og_image_url: string | null
          operating_hours: Json
          phone: string | null
          pricing_disclosure_text: string | null
          primary_color: string
          published_at: string | null
          qr_fulfillment_mode: string
          qr_geofence_enabled: boolean
          qr_kill_switch: boolean
          qr_service_fee_pct: number
          secondary_color: string | null
          setup_approved_at: string | null
          setup_completed_at: string | null
          setup_rejection_reason: string | null
          setup_request_status: string
          setup_requested_at: string | null
          setup_requested_by: string | null
          setup_reviewed_at: string | null
          setup_reviewed_by: string | null
          slug: string
          store_name: string
          template_id: string
          text_color: string
          tip_enabled: boolean
          tip_presets: Json | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          accepts_card_on_delivery?: boolean
          accepts_cash_on_delivery?: boolean
          accepts_delivery?: boolean
          accepts_dine_in?: boolean
          accepts_online_payments?: boolean
          accepts_pickup?: boolean
          address?: Json | null
          auto_accept_orders?: boolean
          background_color?: string
          border_color?: string | null
          card_color?: string | null
          created_at?: string
          custom_domain?: string | null
          delivery_fee?: number | null
          delivery_fee_cents?: number | null
          delivery_pricing_enabled?: boolean
          delivery_radius_miles?: number | null
          description?: string | null
          email?: string | null
          estimated_prep_minutes?: number | null
          facebook_pixel_id?: string | null
          favicon_url?: string | null
          font_family?: string | null
          free_delivery_threshold?: number | null
          free_delivery_threshold_cents?: number | null
          google_analytics_id?: string | null
          header_style?: string
          header_text_color?: string | null
          hero_image_url?: string | null
          id?: string
          ipospays_ftd_ecom_key?: string | null
          ipospays_tpn?: string | null
          is_active?: boolean
          location_id: string
          logo_url?: string | null
          max_future_order_days?: number | null
          menu_layout?: string
          merchant_id: string
          meta_description?: string | null
          meta_title?: string | null
          min_order?: number | null
          min_order_cents?: number | null
          notification_prefs?: Json
          og_image_url?: string | null
          operating_hours?: Json
          phone?: string | null
          pricing_disclosure_text?: string | null
          primary_color?: string
          published_at?: string | null
          qr_fulfillment_mode?: string
          qr_geofence_enabled?: boolean
          qr_kill_switch?: boolean
          qr_service_fee_pct?: number
          secondary_color?: string | null
          setup_approved_at?: string | null
          setup_completed_at?: string | null
          setup_rejection_reason?: string | null
          setup_request_status?: string
          setup_requested_at?: string | null
          setup_requested_by?: string | null
          setup_reviewed_at?: string | null
          setup_reviewed_by?: string | null
          slug: string
          store_name: string
          template_id?: string
          text_color?: string
          tip_enabled?: boolean
          tip_presets?: Json | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          accepts_card_on_delivery?: boolean
          accepts_cash_on_delivery?: boolean
          accepts_delivery?: boolean
          accepts_dine_in?: boolean
          accepts_online_payments?: boolean
          accepts_pickup?: boolean
          address?: Json | null
          auto_accept_orders?: boolean
          background_color?: string
          border_color?: string | null
          card_color?: string | null
          created_at?: string
          custom_domain?: string | null
          delivery_fee?: number | null
          delivery_fee_cents?: number | null
          delivery_pricing_enabled?: boolean
          delivery_radius_miles?: number | null
          description?: string | null
          email?: string | null
          estimated_prep_minutes?: number | null
          facebook_pixel_id?: string | null
          favicon_url?: string | null
          font_family?: string | null
          free_delivery_threshold?: number | null
          free_delivery_threshold_cents?: number | null
          google_analytics_id?: string | null
          header_style?: string
          header_text_color?: string | null
          hero_image_url?: string | null
          id?: string
          ipospays_ftd_ecom_key?: string | null
          ipospays_tpn?: string | null
          is_active?: boolean
          location_id?: string
          logo_url?: string | null
          max_future_order_days?: number | null
          menu_layout?: string
          merchant_id?: string
          meta_description?: string | null
          meta_title?: string | null
          min_order?: number | null
          min_order_cents?: number | null
          notification_prefs?: Json
          og_image_url?: string | null
          operating_hours?: Json
          phone?: string | null
          pricing_disclosure_text?: string | null
          primary_color?: string
          published_at?: string | null
          qr_fulfillment_mode?: string
          qr_geofence_enabled?: boolean
          qr_kill_switch?: boolean
          qr_service_fee_pct?: number
          secondary_color?: string | null
          setup_approved_at?: string | null
          setup_completed_at?: string | null
          setup_rejection_reason?: string | null
          setup_request_status?: string
          setup_requested_at?: string | null
          setup_requested_by?: string | null
          setup_reviewed_at?: string | null
          setup_reviewed_by?: string | null
          slug?: string
          store_name?: string
          template_id?: string
          text_color?: string
          tip_enabled?: boolean
          tip_presets?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "online_store_config_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_store_config_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_store_config_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "online_store_config_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_store_config_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      online_store_pages: {
        Row: {
          body_text: string | null
          created_at: string
          cta_link: string | null
          cta_text: string | null
          display_order: number
          id: string
          image_url: string | null
          images: Json | null
          is_visible: boolean
          page_type: string
          section_type: string
          store_config_id: string
          style_overrides: Json | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          body_text?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          images?: Json | null
          is_visible?: boolean
          page_type?: string
          section_type: string
          store_config_id: string
          style_overrides?: Json | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          body_text?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          images?: Json | null
          is_visible?: boolean
          page_type?: string
          section_type?: string
          store_config_id?: string
          style_overrides?: Json | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "online_store_pages_store_config_id_fkey"
            columns: ["store_config_id"]
            isOneToOne: false
            referencedRelation: "online_store_config"
            referencedColumns: ["id"]
          },
        ]
      }
      open_item_categories: {
        Row: {
          created_at: string
          default_tax_rate_id: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_taxable: boolean | null
          location_id: string | null
          max_amount: number | null
          merchant_id: string
          name: string
          requires_manager_approval: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_tax_rate_id?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_taxable?: boolean | null
          location_id?: string | null
          max_amount?: number | null
          merchant_id: string
          name: string
          requires_manager_approval?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_tax_rate_id?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_taxable?: boolean | null
          location_id?: string | null
          max_amount?: number | null
          merchant_id?: string
          name?: string
          requires_manager_approval?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_item_categories_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_item_categories_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_item_categories_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "open_item_categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_item_categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_courses: {
        Row: {
          completed_at: string | null
          course_number: number
          created_at: string | null
          fired_at: string | null
          fired_by: string | null
          id: string
          in_progress_at: string | null
          notes: string | null
          order_id: string
          served_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          course_number: number
          created_at?: string | null
          fired_at?: string | null
          fired_by?: string | null
          id?: string
          in_progress_at?: string | null
          notes?: string | null
          order_id: string
          served_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          course_number?: number
          created_at?: string | null
          fired_at?: string | null
          fired_by?: string | null
          id?: string
          in_progress_at?: string | null
          notes?: string | null
          order_id?: string
          served_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_courses_fired_by_fkey"
            columns: ["fired_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_courses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_discounts: {
        Row: {
          applied_at: string
          applied_by_staff_profiles_id: string | null
          applied_to_item_ids: string[] | null
          approved_by_staff_profiles_id: string | null
          calculated_amount: number
          calculated_cash_amount: number | null
          created_at: string
          discount_id: string | null
          discount_name: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          order_id: string
          pre_discount_cash_subtotal: number | null
          pre_discount_subtotal: number
          reason: string | null
          source: Database["public"]["Enums"]["discount_source"]
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          applied_at?: string
          applied_by_staff_profiles_id?: string | null
          applied_to_item_ids?: string[] | null
          approved_by_staff_profiles_id?: string | null
          calculated_amount: number
          calculated_cash_amount?: number | null
          created_at?: string
          discount_id?: string | null
          discount_name: string
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id?: string
          order_id: string
          pre_discount_cash_subtotal?: number | null
          pre_discount_subtotal: number
          reason?: string | null
          source?: Database["public"]["Enums"]["discount_source"]
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          applied_at?: string
          applied_by_staff_profiles_id?: string | null
          applied_to_item_ids?: string[] | null
          approved_by_staff_profiles_id?: string | null
          calculated_amount?: number
          calculated_cash_amount?: number | null
          created_at?: string
          discount_id?: string | null
          discount_name?: string
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          order_id?: string
          pre_discount_cash_subtotal?: number | null
          pre_discount_subtotal?: number
          reason?: string | null
          source?: Database["public"]["Enums"]["discount_source"]
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_discounts_applied_by_staff_profiles_id_fkey"
            columns: ["applied_by_staff_profiles_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_discounts_approved_by_staff_profiles_id_fkey"
            columns: ["approved_by_staff_profiles_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_discounts_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_discounts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_discounts_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_modifiers: {
        Row: {
          created_at: string
          id: string
          is_no: boolean
          metadata: Json | null
          modifier_group_id: string | null
          modifier_group_name: string
          modifier_item_id: string | null
          modifier_name: string
          order_item_id: string
          price_modifier: number
          quantity: number
          total_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_no?: boolean
          metadata?: Json | null
          modifier_group_id?: string | null
          modifier_group_name: string
          modifier_item_id?: string | null
          modifier_name: string
          order_item_id: string
          price_modifier?: number
          quantity?: number
          total_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_no?: boolean
          metadata?: Json | null
          modifier_group_id?: string | null
          modifier_group_name?: string
          modifier_item_id?: string | null
          modifier_name?: string
          order_item_id?: string
          price_modifier?: number
          quantity?: number
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_modifiers_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_modifiers_modifier_item_id_fkey"
            columns: ["modifier_item_id"]
            isOneToOne: false
            referencedRelation: "modifier_group_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_modifiers_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          assigned_to_staff_id: string | null
          base_card_price: number | null
          base_cash_price: number | null
          cash_price: number | null
          cash_subtotal: number | null
          cash_tax_amount: number | null
          cash_unit_price: number | null
          category_id: string | null
          category_name: string | null
          completed_at: string | null
          course_number: number | null
          created_at: string
          discount_amount: number | null
          discount_applied_by: string | null
          discount_approved_by: string | null
          discount_cash_amount: number | null
          discount_id: string | null
          discount_name: string | null
          discount_reason: string | null
          discount_source: Database["public"]["Enums"]["discount_source"] | null
          discount_type: Database["public"]["Enums"]["discount_type"] | null
          discount_value: number | null
          display_order: number | null
          fire_time: string | null
          id: string
          is_open_item: boolean | null
          is_prioritized: boolean | null
          is_tax_exempt: boolean | null
          is_to_go: boolean | null
          is_voided: boolean | null
          item_description: string | null
          item_name: string
          item_status: string
          kitchen_notes: string | null
          kitchen_status: string | null
          location_exclusive_item_id: string | null
          menu_id: string | null
          menu_item_id: string | null
          menu_name: string | null
          metadata: Json | null
          open_item_description: string | null
          open_item_name: string | null
          open_item_price: number | null
          order_id: string
          paid_quantity: number | null
          payment_id: string | null
          pre_discount_subtotal: number | null
          prep_station: string | null
          price_paid: number | null
          quantity: number
          refunded_amount: number | null
          refunded_quantity: number | null
          rush: boolean | null
          seat_number: number | null
          selected_size_id: string | null
          selected_size_name: string | null
          sent_to_kitchen_at: string | null
          size_price_modifier: number | null
          special_instructions: string | null
          started_preparing_at: string | null
          subtotal: number
          tax_amount: number | null
          tax_rate: number | null
          unit_price: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          assigned_to_staff_id?: string | null
          base_card_price?: number | null
          base_cash_price?: number | null
          cash_price?: number | null
          cash_subtotal?: number | null
          cash_tax_amount?: number | null
          cash_unit_price?: number | null
          category_id?: string | null
          category_name?: string | null
          completed_at?: string | null
          course_number?: number | null
          created_at?: string
          discount_amount?: number | null
          discount_applied_by?: string | null
          discount_approved_by?: string | null
          discount_cash_amount?: number | null
          discount_id?: string | null
          discount_name?: string | null
          discount_reason?: string | null
          discount_source?:
            | Database["public"]["Enums"]["discount_source"]
            | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          display_order?: number | null
          fire_time?: string | null
          id?: string
          is_open_item?: boolean | null
          is_prioritized?: boolean | null
          is_tax_exempt?: boolean | null
          is_to_go?: boolean | null
          is_voided?: boolean | null
          item_description?: string | null
          item_name: string
          item_status?: string
          kitchen_notes?: string | null
          kitchen_status?: string | null
          location_exclusive_item_id?: string | null
          menu_id?: string | null
          menu_item_id?: string | null
          menu_name?: string | null
          metadata?: Json | null
          open_item_description?: string | null
          open_item_name?: string | null
          open_item_price?: number | null
          order_id: string
          paid_quantity?: number | null
          payment_id?: string | null
          pre_discount_subtotal?: number | null
          prep_station?: string | null
          price_paid?: number | null
          quantity?: number
          refunded_amount?: number | null
          refunded_quantity?: number | null
          rush?: boolean | null
          seat_number?: number | null
          selected_size_id?: string | null
          selected_size_name?: string | null
          sent_to_kitchen_at?: string | null
          size_price_modifier?: number | null
          special_instructions?: string | null
          started_preparing_at?: string | null
          subtotal: number
          tax_amount?: number | null
          tax_rate?: number | null
          unit_price: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          assigned_to_staff_id?: string | null
          base_card_price?: number | null
          base_cash_price?: number | null
          cash_price?: number | null
          cash_subtotal?: number | null
          cash_tax_amount?: number | null
          cash_unit_price?: number | null
          category_id?: string | null
          category_name?: string | null
          completed_at?: string | null
          course_number?: number | null
          created_at?: string
          discount_amount?: number | null
          discount_applied_by?: string | null
          discount_approved_by?: string | null
          discount_cash_amount?: number | null
          discount_id?: string | null
          discount_name?: string | null
          discount_reason?: string | null
          discount_source?:
            | Database["public"]["Enums"]["discount_source"]
            | null
          discount_type?: Database["public"]["Enums"]["discount_type"] | null
          discount_value?: number | null
          display_order?: number | null
          fire_time?: string | null
          id?: string
          is_open_item?: boolean | null
          is_prioritized?: boolean | null
          is_tax_exempt?: boolean | null
          is_to_go?: boolean | null
          is_voided?: boolean | null
          item_description?: string | null
          item_name?: string
          item_status?: string
          kitchen_notes?: string | null
          kitchen_status?: string | null
          location_exclusive_item_id?: string | null
          menu_id?: string | null
          menu_item_id?: string | null
          menu_name?: string | null
          metadata?: Json | null
          open_item_description?: string | null
          open_item_name?: string | null
          open_item_price?: number | null
          order_id?: string
          paid_quantity?: number | null
          payment_id?: string | null
          pre_discount_subtotal?: number | null
          prep_station?: string | null
          price_paid?: number | null
          quantity?: number
          refunded_amount?: number | null
          refunded_quantity?: number | null
          rush?: boolean | null
          seat_number?: number | null
          selected_size_id?: string | null
          selected_size_name?: string | null
          sent_to_kitchen_at?: string | null
          size_price_modifier?: number | null
          special_instructions?: string | null
          started_preparing_at?: string | null
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          unit_price?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_assigned_to_staff_id_fkey"
            columns: ["assigned_to_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_discount_applied_by_fkey"
            columns: ["discount_applied_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_discount_approved_by_fkey"
            columns: ["discount_approved_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_location_exclusive_item_id_fkey"
            columns: ["location_exclusive_item_id"]
            isOneToOne: false
            referencedRelation: "location_exclusive_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_selected_size_id_fkey"
            columns: ["selected_size_id"]
            isOneToOne: false
            referencedRelation: "item_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notifications: {
        Row: {
          channel: string
          error: string | null
          event: string
          id: string
          merchant_id: string
          order_id: string
          provider_id: string | null
          recipient: string
          sent_at: string
          status: string
        }
        Insert: {
          channel: string
          error?: string | null
          event: string
          id?: string
          merchant_id: string
          order_id: string
          provider_id?: string | null
          recipient: string
          sent_at?: string
          status: string
        }
        Update: {
          channel?: string
          error?: string | null
          event?: string
          id?: string
          merchant_id?: string
          order_id?: string
          provider_id?: string | null
          recipient?: string
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notifications_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notifications_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_number_day_sequences: {
        Row: {
          created_at: string
          date_str: string
          merchant_id: string
          sequence_name: string
        }
        Insert: {
          created_at?: string
          date_str: string
          merchant_id: string
          sequence_name: string
        }
        Update: {
          created_at?: string
          date_str?: string
          merchant_id?: string
          sequence_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_number_day_sequences_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_number_day_sequences_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payment_items: {
        Row: {
          created_at: string
          id: string
          order_item_id: string
          order_payment_id: string
          quantity_paid: number
          subtotal_paid: number
          tax_paid: number | null
          unit_price_paid: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_item_id: string
          order_payment_id: string
          quantity_paid?: number
          subtotal_paid: number
          tax_paid?: number | null
          unit_price_paid: number
        }
        Update: {
          created_at?: string
          id?: string
          order_item_id?: string
          order_payment_id?: string
          quantity_paid?: number
          subtotal_paid?: number
          tax_paid?: number | null
          unit_price_paid?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_payment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payment_items_order_payment_id_fkey"
            columns: ["order_payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payment_items_order_payment_id_fkey"
            columns: ["order_payment_id"]
            isOneToOne: false
            referencedRelation: "pci_safe_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payment_items_order_payment_id_fkey"
            columns: ["order_payment_id"]
            isOneToOne: false
            referencedRelation: "vw_platform_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          acquirer: string | null
          amount: number
          amount_tendered: number | null
          approved_at: string | null
          auth_code: string | null
          authorization_code: string | null
          authorized_at: string | null
          avs_response_code: string | null
          batch_number: string | null
          captured_at: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last_four: string | null
          card_token: string | null
          card_type: string | null
          cash_discount_applied: boolean | null
          change_given: number | null
          covers_items: string[] | null
          customer_vault_id: string | null
          cvv_response_code: string | null
          dejavoo_batch_number: string | null
          dejavoo_invoice_number: string | null
          dejavoo_response_code: string | null
          dejavoo_response_message: string | null
          dejavoo_transaction_type: string | null
          device_id: string | null
          discount_portion: number | null
          dual_pricing_fee: number
          dual_pricing_percentage_snapshot: number
          dvpaylite_application_type: string | null
          dvpaylite_request_id: string | null
          emv_data: Json | null
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          gateway_fee: number | null
          id: string
          idempotency_key: string | null
          initiated_at: string
          initiated_by: string | null
          is_cash_priced: boolean | null
          is_returned: boolean | null
          is_settled: boolean | null
          is_voided: boolean | null
          location_id: string | null
          merchant_id: string | null
          metadata: Json | null
          order_id: string
          original_amount: number | null
          original_tip_amount: number | null
          original_tip_fee: number | null
          parent_payment_id: string | null
          payment_device_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          processed_by_staff_id: string | null
          processed_by_user_id: string | null
          processor_fee_percentage_snapshot: number
          processor_name: string | null
          processor_response: Json | null
          processor_response_code: string | null
          processor_response_text: string | null
          reference_number: string | null
          refund_reason: string | null
          refunded_amount: number | null
          refunded_at: string | null
          refunded_by: string | null
          refunded_dual_pricing_fee: number
          refunded_tip_fee: number
          result_code: string | null
          result_message: string | null
          retry_count: number | null
          return_amount: number | null
          return_auth_code: string | null
          return_number: string | null
          return_reason: string | null
          return_reference_id: string | null
          return_rrn: string | null
          returned_at: string | null
          returned_by: string | null
          rrn: string | null
          service_charge: number
          service_charge_refunded: number
          settled_at: string | null
          settlement_batch_id: string | null
          split_count: number | null
          split_index: number | null
          split_portion_index: number | null
          split_total: number | null
          status: Database["public"]["Enums"]["payment_status"]
          subtotal_portion: number | null
          tax_portion: number | null
          terminal_id: string | null
          terminal_request: Json | null
          terminal_response: Json | null
          terminal_type: Database["public"]["Enums"]["terminal_type"]
          tip_adjusted_at: string | null
          tip_adjusted_by: string | null
          tip_amount: number
          tip_fee: number
          tip_surcharge_percentage_snapshot: number
          total_amount: number
          transaction_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          acquirer?: string | null
          amount: number
          amount_tendered?: number | null
          approved_at?: string | null
          auth_code?: string | null
          authorization_code?: string | null
          authorized_at?: string | null
          avs_response_code?: string | null
          batch_number?: string | null
          captured_at?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last_four?: string | null
          card_token?: string | null
          card_type?: string | null
          cash_discount_applied?: boolean | null
          change_given?: number | null
          covers_items?: string[] | null
          customer_vault_id?: string | null
          cvv_response_code?: string | null
          dejavoo_batch_number?: string | null
          dejavoo_invoice_number?: string | null
          dejavoo_response_code?: string | null
          dejavoo_response_message?: string | null
          dejavoo_transaction_type?: string | null
          device_id?: string | null
          discount_portion?: number | null
          dual_pricing_fee?: number
          dual_pricing_percentage_snapshot?: number
          dvpaylite_application_type?: string | null
          dvpaylite_request_id?: string | null
          emv_data?: Json | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          gateway_fee?: number | null
          id?: string
          idempotency_key?: string | null
          initiated_at?: string
          initiated_by?: string | null
          is_cash_priced?: boolean | null
          is_returned?: boolean | null
          is_settled?: boolean | null
          is_voided?: boolean | null
          location_id?: string | null
          merchant_id?: string | null
          metadata?: Json | null
          order_id: string
          original_amount?: number | null
          original_tip_amount?: number | null
          original_tip_fee?: number | null
          parent_payment_id?: string | null
          payment_device_id?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          processed_by_staff_id?: string | null
          processed_by_user_id?: string | null
          processor_fee_percentage_snapshot?: number
          processor_name?: string | null
          processor_response?: Json | null
          processor_response_code?: string | null
          processor_response_text?: string | null
          reference_number?: string | null
          refund_reason?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          refunded_dual_pricing_fee?: number
          refunded_tip_fee?: number
          result_code?: string | null
          result_message?: string | null
          retry_count?: number | null
          return_amount?: number | null
          return_auth_code?: string | null
          return_number?: string | null
          return_reason?: string | null
          return_reference_id?: string | null
          return_rrn?: string | null
          returned_at?: string | null
          returned_by?: string | null
          rrn?: string | null
          service_charge?: number
          service_charge_refunded?: number
          settled_at?: string | null
          settlement_batch_id?: string | null
          split_count?: number | null
          split_index?: number | null
          split_portion_index?: number | null
          split_total?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
          subtotal_portion?: number | null
          tax_portion?: number | null
          terminal_id?: string | null
          terminal_request?: Json | null
          terminal_response?: Json | null
          terminal_type: Database["public"]["Enums"]["terminal_type"]
          tip_adjusted_at?: string | null
          tip_adjusted_by?: string | null
          tip_amount?: number
          tip_fee?: number
          tip_surcharge_percentage_snapshot?: number
          total_amount: number
          transaction_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          acquirer?: string | null
          amount?: number
          amount_tendered?: number | null
          approved_at?: string | null
          auth_code?: string | null
          authorization_code?: string | null
          authorized_at?: string | null
          avs_response_code?: string | null
          batch_number?: string | null
          captured_at?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last_four?: string | null
          card_token?: string | null
          card_type?: string | null
          cash_discount_applied?: boolean | null
          change_given?: number | null
          covers_items?: string[] | null
          customer_vault_id?: string | null
          cvv_response_code?: string | null
          dejavoo_batch_number?: string | null
          dejavoo_invoice_number?: string | null
          dejavoo_response_code?: string | null
          dejavoo_response_message?: string | null
          dejavoo_transaction_type?: string | null
          device_id?: string | null
          discount_portion?: number | null
          dual_pricing_fee?: number
          dual_pricing_percentage_snapshot?: number
          dvpaylite_application_type?: string | null
          dvpaylite_request_id?: string | null
          emv_data?: Json | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          gateway_fee?: number | null
          id?: string
          idempotency_key?: string | null
          initiated_at?: string
          initiated_by?: string | null
          is_cash_priced?: boolean | null
          is_returned?: boolean | null
          is_settled?: boolean | null
          is_voided?: boolean | null
          location_id?: string | null
          merchant_id?: string | null
          metadata?: Json | null
          order_id?: string
          original_amount?: number | null
          original_tip_amount?: number | null
          original_tip_fee?: number | null
          parent_payment_id?: string | null
          payment_device_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          processed_by_staff_id?: string | null
          processed_by_user_id?: string | null
          processor_fee_percentage_snapshot?: number
          processor_name?: string | null
          processor_response?: Json | null
          processor_response_code?: string | null
          processor_response_text?: string | null
          reference_number?: string | null
          refund_reason?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          refunded_dual_pricing_fee?: number
          refunded_tip_fee?: number
          result_code?: string | null
          result_message?: string | null
          retry_count?: number | null
          return_amount?: number | null
          return_auth_code?: string | null
          return_number?: string | null
          return_reason?: string | null
          return_reference_id?: string | null
          return_rrn?: string | null
          returned_at?: string | null
          returned_by?: string | null
          rrn?: string | null
          service_charge?: number
          service_charge_refunded?: number
          settled_at?: string | null
          settlement_batch_id?: string | null
          split_count?: number | null
          split_index?: number | null
          split_portion_index?: number | null
          split_total?: number | null
          status?: Database["public"]["Enums"]["payment_status"]
          subtotal_portion?: number | null
          tax_portion?: number | null
          terminal_id?: string | null
          terminal_request?: Json | null
          terminal_response?: Json | null
          terminal_type?: Database["public"]["Enums"]["terminal_type"]
          tip_adjusted_at?: string | null
          tip_adjusted_by?: string | null
          tip_amount?: number
          tip_fee?: number
          tip_surcharge_percentage_snapshot?: number
          total_amount?: number
          transaction_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "order_payments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_parent_payment_id_fkey"
            columns: ["parent_payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_parent_payment_id_fkey"
            columns: ["parent_payment_id"]
            isOneToOne: false
            referencedRelation: "pci_safe_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_parent_payment_id_fkey"
            columns: ["parent_payment_id"]
            isOneToOne: false
            referencedRelation: "vw_platform_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_payment_device_id_fkey"
            columns: ["payment_device_id"]
            isOneToOne: false
            referencedRelation: "location_payment_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_processed_by_staff_id_fkey"
            columns: ["processed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_processed_by_user_id_fkey"
            columns: ["processed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_refunded_by_fkey"
            columns: ["refunded_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_returned_by_fkey"
            columns: ["returned_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_settlement_batch_id_fkey"
            columns: ["settlement_batch_id"]
            isOneToOne: false
            referencedRelation: "settlement_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_tip_adjusted_by_fkey"
            columns: ["tip_adjusted_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_refund_items: {
        Row: {
          created_at: string
          id: string
          inventory_updated: boolean | null
          order_item_id: string
          order_payment_item_id: string | null
          quantity_refunded: number
          refund_reason: Database["public"]["Enums"]["refund_reason_type"]
          refund_reason_detail: string | null
          return_to_inventory: boolean | null
          reversal_id: string
          subtotal_refunded: number
          tax_refunded: number
          total_refunded: number
          unit_price_refunded: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_updated?: boolean | null
          order_item_id: string
          order_payment_item_id?: string | null
          quantity_refunded?: number
          refund_reason: Database["public"]["Enums"]["refund_reason_type"]
          refund_reason_detail?: string | null
          return_to_inventory?: boolean | null
          reversal_id: string
          subtotal_refunded: number
          tax_refunded?: number
          total_refunded: number
          unit_price_refunded: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_updated?: boolean | null
          order_item_id?: string
          order_payment_item_id?: string | null
          quantity_refunded?: number
          refund_reason?: Database["public"]["Enums"]["refund_reason_type"]
          refund_reason_detail?: string | null
          return_to_inventory?: boolean | null
          reversal_id?: string
          subtotal_refunded?: number
          tax_refunded?: number
          total_refunded?: number
          unit_price_refunded?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_refund_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refund_items_order_payment_item_id_fkey"
            columns: ["order_payment_item_id"]
            isOneToOne: false
            referencedRelation: "order_payment_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_refund_items_reversal_id_fkey"
            columns: ["reversal_id"]
            isOneToOne: false
            referencedRelation: "reversals"
            referencedColumns: ["id"]
          },
        ]
      }
      order_sequences: {
        Row: {
          last_order_number: number
          location_id: string
          sequence_date: string
        }
        Insert: {
          last_order_number?: number
          location_id: string
          sequence_date?: string
        }
        Update: {
          last_order_number?: number
          location_id?: string
          sequence_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_sequences_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_sequences_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_sequences_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by_staff_id: string | null
          changed_by_user_id: string | null
          device_id: string | null
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          metadata: Json | null
          notes: string | null
          order_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_at?: string
          changed_by_staff_id?: string | null
          changed_by_user_id?: string | null
          device_id?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          order_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_at?: string
          changed_by_staff_id?: string | null
          changed_by_user_id?: string | null
          device_id?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          order_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_staff_id_fkey"
            columns: ["changed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orderout_accounts: {
        Row: {
          account_manager_email: string
          created_at: string
          id: string
          merchant_id: string
          oo_account_id: string | null
          oo_billing_account_id: string
          raw_response: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          account_manager_email: string
          created_at?: string
          id?: string
          merchant_id: string
          oo_account_id?: string | null
          oo_billing_account_id?: string
          raw_response?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_manager_email?: string
          created_at?: string
          id?: string
          merchant_id?: string
          oo_account_id?: string | null
          oo_billing_account_id?: string
          raw_response?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orderout_accounts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orderout_accounts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      orderout_menu_links: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_pushed_at: string | null
          last_sync_id: string | null
          menu_id: string
          oo_menu_id: string
          oo_menu_name: string | null
          orderout_restaurant_id: string
          platform_statuses: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_pushed_at?: string | null
          last_sync_id?: string | null
          menu_id: string
          oo_menu_id: string
          oo_menu_name?: string | null
          orderout_restaurant_id: string
          platform_statuses?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_pushed_at?: string | null
          last_sync_id?: string | null
          menu_id?: string
          oo_menu_id?: string
          oo_menu_name?: string | null
          orderout_restaurant_id?: string
          platform_statuses?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orderout_menu_links_last_sync_id_fkey"
            columns: ["last_sync_id"]
            isOneToOne: false
            referencedRelation: "orderout_menu_syncs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orderout_menu_links_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orderout_menu_links_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_id"]
          },
          {
            foreignKeyName: "orderout_menu_links_orderout_restaurant_id_fkey"
            columns: ["orderout_restaurant_id"]
            isOneToOne: false
            referencedRelation: "orderout_restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orderout_menu_syncs: {
        Row: {
          created_at: string
          error_details: Json | null
          expected_channels: string[] | null
          id: string
          items_failed: number
          items_synced: number
          menu_id: string | null
          menu_payload_snapshot: Json | null
          oo_menu_id: string | null
          orderout_restaurant_id: string
          pushed_to_channels: string[] | null
          sync_direction: string
          sync_status: string
          synced_at: string | null
        }
        Insert: {
          created_at?: string
          error_details?: Json | null
          expected_channels?: string[] | null
          id?: string
          items_failed?: number
          items_synced?: number
          menu_id?: string | null
          menu_payload_snapshot?: Json | null
          oo_menu_id?: string | null
          orderout_restaurant_id: string
          pushed_to_channels?: string[] | null
          sync_direction: string
          sync_status?: string
          synced_at?: string | null
        }
        Update: {
          created_at?: string
          error_details?: Json | null
          expected_channels?: string[] | null
          id?: string
          items_failed?: number
          items_synced?: number
          menu_id?: string | null
          menu_payload_snapshot?: Json | null
          oo_menu_id?: string | null
          orderout_restaurant_id?: string
          pushed_to_channels?: string[] | null
          sync_direction?: string
          sync_status?: string
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orderout_menu_syncs_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orderout_menu_syncs_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_id"]
          },
          {
            foreignKeyName: "orderout_menu_syncs_orderout_restaurant_id_fkey"
            columns: ["orderout_restaurant_id"]
            isOneToOne: false
            referencedRelation: "orderout_restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orderout_orders: {
        Row: {
          accept_status: string
          accepted_at: string | null
          cancel_source: string | null
          cancelled_at: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_address: Json | null
          delivery_platform: string
          event_type: string
          id: string
          oo_external_reference_id: string | null
          oo_order_number: string
          order_id: string
          order_type: string
          orderout_restaurant_id: string
          placed_on: string | null
          platform_delivery_fee: number | null
          platform_discount: number | null
          platform_payment_status: string | null
          platform_service_fee: number | null
          platform_subtotal: number | null
          platform_tax: number | null
          platform_tip: number | null
          platform_total: number | null
          raw_webhook_payload: Json
          ready_by: string | null
          reject_reason: string | null
          rejected_at: string | null
        }
        Insert: {
          accept_status?: string
          accepted_at?: string | null
          cancel_source?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: Json | null
          delivery_platform: string
          event_type: string
          id?: string
          oo_external_reference_id?: string | null
          oo_order_number: string
          order_id: string
          order_type: string
          orderout_restaurant_id: string
          placed_on?: string | null
          platform_delivery_fee?: number | null
          platform_discount?: number | null
          platform_payment_status?: string | null
          platform_service_fee?: number | null
          platform_subtotal?: number | null
          platform_tax?: number | null
          platform_tip?: number | null
          platform_total?: number | null
          raw_webhook_payload: Json
          ready_by?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
        }
        Update: {
          accept_status?: string
          accepted_at?: string | null
          cancel_source?: string | null
          cancelled_at?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          delivery_address?: Json | null
          delivery_platform?: string
          event_type?: string
          id?: string
          oo_external_reference_id?: string | null
          oo_order_number?: string
          order_id?: string
          order_type?: string
          orderout_restaurant_id?: string
          placed_on?: string | null
          platform_delivery_fee?: number | null
          platform_discount?: number | null
          platform_payment_status?: string | null
          platform_service_fee?: number | null
          platform_subtotal?: number | null
          platform_tax?: number | null
          platform_tip?: number | null
          platform_total?: number | null
          raw_webhook_payload?: Json
          ready_by?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orderout_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orderout_orders_orderout_restaurant_id_fkey"
            columns: ["orderout_restaurant_id"]
            isOneToOne: false
            referencedRelation: "orderout_restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orderout_restaurants: {
        Row: {
          auto_accept_orders: boolean
          auto_print: boolean
          channels_confirmed_at: string | null
          channels_confirmed_by_merchant: string[]
          channels_confirmed_by_user_id: string | null
          connected_channels: Json | null
          created_at: string
          id: string
          is_accepting_orders: boolean
          last_order_received_at: string | null
          location_id: string
          merchant_id: string | null
          oo_account_id: string | null
          oo_restaurant_id: string | null
          orderout_account_id: string
          pos_uuid: string
          prep_time_minutes: number
          raw_response: Json | null
          status: string
          updated_at: string
          use_delivery_pricing: boolean
        }
        Insert: {
          auto_accept_orders?: boolean
          auto_print?: boolean
          channels_confirmed_at?: string | null
          channels_confirmed_by_merchant?: string[]
          channels_confirmed_by_user_id?: string | null
          connected_channels?: Json | null
          created_at?: string
          id?: string
          is_accepting_orders?: boolean
          last_order_received_at?: string | null
          location_id: string
          merchant_id?: string | null
          oo_account_id?: string | null
          oo_restaurant_id?: string | null
          orderout_account_id: string
          pos_uuid: string
          prep_time_minutes?: number
          raw_response?: Json | null
          status?: string
          updated_at?: string
          use_delivery_pricing?: boolean
        }
        Update: {
          auto_accept_orders?: boolean
          auto_print?: boolean
          channels_confirmed_at?: string | null
          channels_confirmed_by_merchant?: string[]
          channels_confirmed_by_user_id?: string | null
          connected_channels?: Json | null
          created_at?: string
          id?: string
          is_accepting_orders?: boolean
          last_order_received_at?: string | null
          location_id?: string
          merchant_id?: string | null
          oo_account_id?: string | null
          oo_restaurant_id?: string | null
          orderout_account_id?: string
          pos_uuid?: string
          prep_time_minutes?: number
          raw_response?: Json | null
          status?: string
          updated_at?: string
          use_delivery_pricing?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "orderout_restaurants_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orderout_restaurants_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orderout_restaurants_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "orderout_restaurants_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orderout_restaurants_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orderout_restaurants_orderout_account_id_fkey"
            columns: ["orderout_account_id"]
            isOneToOne: false
            referencedRelation: "orderout_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          amount_due: number
          amount_paid: number
          assigned_server_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          card_subtotal: number | null
          card_tax_amount: number | null
          card_total: number | null
          cash_amount_due: number | null
          cash_discount_amount: number | null
          cash_discount_applied: boolean | null
          cash_subtotal: number | null
          cash_tax_amount: number | null
          cash_total: number | null
          check_status: string | null
          completed_at: string | null
          created_at: string
          created_by_staff_id: string | null
          created_by_user_id: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          declined_at: string | null
          declined_reason: string | null
          delivered_at: string | null
          delivery_address: Json | null
          delivery_platform: string | null
          device_id: string | null
          discount_amount: number
          display_number: string | null
          effective_cash_amount_due: number | null
          effective_subtotal: number | null
          effective_tax_amount: number | null
          effective_total: number | null
          estimated_delivery_time: string | null
          estimated_ready_at: string | null
          external_id: string | null
          id: string
          internal_notes: string | null
          inventory_deducted: boolean
          is_offline: boolean | null
          is_prepaid: boolean | null
          kitchen_notes: string | null
          last_synced_at: string | null
          location_id: string
          merchant_id: string
          metadata: Json | null
          order_number: string
          order_source: string | null
          order_type: Database["public"]["Enums"]["order_type"]
          payment_pricing_mode:
            | Database["public"]["Enums"]["pricing_mode"]
            | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          platform_order_number: string | null
          ready_at: string | null
          receipt_token: string
          reopen_count: number
          seat_number: string | null
          sent_to_kitchen_at: string | null
          service_charge: number
          service_charge_applies_on: string | null
          service_charge_is_manual: boolean
          service_charge_name: string | null
          service_charge_rate: number | null
          service_charge_rule_id: string | null
          session_id: string | null
          special_instructions: string | null
          split_payment_path:
            | Database["public"]["Enums"]["split_payment_path_enum"]
            | null
          started_preparing_at: string | null
          station_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          sync_version: number | null
          table_number: string | null
          tax_amount: number
          tip_amount: number
          total_amount: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          accepted_at?: string | null
          amount_due?: number
          amount_paid?: number
          assigned_server_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          card_subtotal?: number | null
          card_tax_amount?: number | null
          card_total?: number | null
          cash_amount_due?: number | null
          cash_discount_amount?: number | null
          cash_discount_applied?: boolean | null
          cash_subtotal?: number | null
          cash_tax_amount?: number | null
          cash_total?: number | null
          check_status?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_staff_id?: string | null
          created_by_user_id?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          declined_at?: string | null
          declined_reason?: string | null
          delivered_at?: string | null
          delivery_address?: Json | null
          delivery_platform?: string | null
          device_id?: string | null
          discount_amount?: number
          display_number?: string | null
          effective_cash_amount_due?: number | null
          effective_subtotal?: number | null
          effective_tax_amount?: number | null
          effective_total?: number | null
          estimated_delivery_time?: string | null
          estimated_ready_at?: string | null
          external_id?: string | null
          id?: string
          internal_notes?: string | null
          inventory_deducted?: boolean
          is_offline?: boolean | null
          is_prepaid?: boolean | null
          kitchen_notes?: string | null
          last_synced_at?: string | null
          location_id: string
          merchant_id: string
          metadata?: Json | null
          order_number: string
          order_source?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_pricing_mode?:
            | Database["public"]["Enums"]["pricing_mode"]
            | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          platform_order_number?: string | null
          ready_at?: string | null
          receipt_token?: string
          reopen_count?: number
          seat_number?: string | null
          sent_to_kitchen_at?: string | null
          service_charge?: number
          service_charge_applies_on?: string | null
          service_charge_is_manual?: boolean
          service_charge_name?: string | null
          service_charge_rate?: number | null
          service_charge_rule_id?: string | null
          session_id?: string | null
          special_instructions?: string | null
          split_payment_path?:
            | Database["public"]["Enums"]["split_payment_path_enum"]
            | null
          started_preparing_at?: string | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          sync_version?: number | null
          table_number?: string | null
          tax_amount?: number
          tip_amount?: number
          total_amount?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          accepted_at?: string | null
          amount_due?: number
          amount_paid?: number
          assigned_server_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          card_subtotal?: number | null
          card_tax_amount?: number | null
          card_total?: number | null
          cash_amount_due?: number | null
          cash_discount_amount?: number | null
          cash_discount_applied?: boolean | null
          cash_subtotal?: number | null
          cash_tax_amount?: number | null
          cash_total?: number | null
          check_status?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_staff_id?: string | null
          created_by_user_id?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          declined_at?: string | null
          declined_reason?: string | null
          delivered_at?: string | null
          delivery_address?: Json | null
          delivery_platform?: string | null
          device_id?: string | null
          discount_amount?: number
          display_number?: string | null
          effective_cash_amount_due?: number | null
          effective_subtotal?: number | null
          effective_tax_amount?: number | null
          effective_total?: number | null
          estimated_delivery_time?: string | null
          estimated_ready_at?: string | null
          external_id?: string | null
          id?: string
          internal_notes?: string | null
          inventory_deducted?: boolean
          is_offline?: boolean | null
          is_prepaid?: boolean | null
          kitchen_notes?: string | null
          last_synced_at?: string | null
          location_id?: string
          merchant_id?: string
          metadata?: Json | null
          order_number?: string
          order_source?: string | null
          order_type?: Database["public"]["Enums"]["order_type"]
          payment_pricing_mode?:
            | Database["public"]["Enums"]["pricing_mode"]
            | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          platform_order_number?: string | null
          ready_at?: string | null
          receipt_token?: string
          reopen_count?: number
          seat_number?: string | null
          sent_to_kitchen_at?: string | null
          service_charge?: number
          service_charge_applies_on?: string | null
          service_charge_is_manual?: boolean
          service_charge_name?: string | null
          service_charge_rate?: number | null
          service_charge_rule_id?: string | null
          session_id?: string | null
          special_instructions?: string | null
          split_payment_path?:
            | Database["public"]["Enums"]["split_payment_path_enum"]
            | null
          started_preparing_at?: string | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          sync_version?: number | null
          table_number?: string | null
          tax_amount?: number
          tip_amount?: number
          total_amount?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_server_id_fkey"
            columns: ["assigned_server_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_service_charge_rule_id_fkey"
            columns: ["service_charge_rule_id"]
            isOneToOne: false
            referencedRelation: "service_charge_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          imageURL: string | null
          name: string | null
          public_metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id: string
          imageURL?: string | null
          name?: string | null
          public_metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          imageURL?: string | null
          name?: string | null
          public_metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_audit_log: {
        Row: {
          action: string
          error_message: string | null
          event_timestamp: string
          fields_accessed: string[] | null
          id: string
          ip_address: unknown
          location_id: string | null
          merchant_id: string | null
          request_path: string | null
          resource_id: string | null
          resource_type: string
          staff_profile_id: string | null
          success: boolean
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action: string
          error_message?: string | null
          event_timestamp?: string
          fields_accessed?: string[] | null
          id?: string
          ip_address?: unknown
          location_id?: string | null
          merchant_id?: string | null
          request_path?: string | null
          resource_id?: string | null
          resource_type: string
          staff_profile_id?: string | null
          success: boolean
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action?: string
          error_message?: string | null
          event_timestamp?: string
          fields_accessed?: string[] | null
          id?: string
          ip_address?: unknown
          location_id?: string | null
          merchant_id?: string | null
          request_path?: string | null
          resource_id?: string | null
          resource_type?: string
          staff_profile_id?: string | null
          success?: boolean
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      payment_credential_access_log: {
        Row: {
          actor_user_id: string | null
          called_at: string
          device_id: string
          function_name: string
          id: string
          metadata: Json
          store_config_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          called_at?: string
          device_id: string
          function_name: string
          id?: string
          metadata?: Json
          store_config_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          called_at?: string
          device_id?: string
          function_name?: string
          id?: string
          metadata?: Json
          store_config_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_credential_access_log_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "location_payment_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_credential_access_log_store_config_id_fkey"
            columns: ["store_config_id"]
            isOneToOne: false
            referencedRelation: "online_store_config"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number | null
          auth_code: string | null
          event_timestamp: string
          event_type: string
          id: string
          location_id: string | null
          new_status: string | null
          order_id: string | null
          payment_id: string
          previous_status: string | null
          psp_reference: string | null
          raw_response: Json | null
          reason: string | null
          response_message: string | null
          result_code: string | null
          staff_id: string | null
          terminal_id: string | null
          tip_amount: number | null
        }
        Insert: {
          amount?: number | null
          auth_code?: string | null
          event_timestamp?: string
          event_type: string
          id?: string
          location_id?: string | null
          new_status?: string | null
          order_id?: string | null
          payment_id: string
          previous_status?: string | null
          psp_reference?: string | null
          raw_response?: Json | null
          reason?: string | null
          response_message?: string | null
          result_code?: string | null
          staff_id?: string | null
          terminal_id?: string | null
          tip_amount?: number | null
        }
        Update: {
          amount?: number | null
          auth_code?: string | null
          event_timestamp?: string
          event_type?: string
          id?: string
          location_id?: string | null
          new_status?: string | null
          order_id?: string | null
          payment_id?: string
          previous_status?: string | null
          psp_reference?: string | null
          raw_response?: Json | null
          reason?: string | null
          response_message?: string | null
          result_code?: string | null
          staff_id?: string | null
          terminal_id?: string | null
          tip_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "pci_safe_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "vw_platform_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_terminals: {
        Row: {
          api_base_url: string | null
          api_environment: string | null
          auth_key: string | null
          auth_key_encrypted: string | null
          auth_key_secret_id: string | null
          auto_settle: boolean | null
          battery_level: number | null
          castles_batch_number: string | null
          castles_counter_updated_at: string | null
          castles_ip_address: string | null
          castles_last_pos_txn_id: string
          castles_port: number
          castles_txn_counter: number
          connection_type: string | null
          consecutive_failures: number | null
          created_at: string | null
          firmware_version: string | null
          health_check_interval: number | null
          id: string
          is_active: boolean | null
          is_connected: boolean | null
          last_batch_at: string | null
          last_connection_status: string | null
          last_connection_test_at: string | null
          last_error_message: string | null
          last_transaction_at: string | null
          local_ip_address: unknown
          local_port: number | null
          location_id: string
          merchant_id: string
          metadata: Json | null
          open_batch_count: number | null
          print_customer_receipt: boolean | null
          print_merchant_receipt: boolean | null
          register_id: string | null
          serial_number: string | null
          settle_time: string | null
          signature_threshold: number | null
          spin_proxy_timeout: number | null
          station_id: string | null
          supports_contactless: boolean | null
          supports_debit: boolean | null
          supports_ebt: boolean | null
          supports_emv: boolean | null
          supports_manual_entry: boolean | null
          supports_tip_adjust: boolean | null
          terminal_model: string | null
          terminal_name: string
          terminal_type: string | null
          tpn: string | null
          tpn_encrypted: string | null
          updated_at: string | null
        }
        Insert: {
          api_base_url?: string | null
          api_environment?: string | null
          auth_key?: string | null
          auth_key_encrypted?: string | null
          auth_key_secret_id?: string | null
          auto_settle?: boolean | null
          battery_level?: number | null
          castles_batch_number?: string | null
          castles_counter_updated_at?: string | null
          castles_ip_address?: string | null
          castles_last_pos_txn_id?: string
          castles_port?: number
          castles_txn_counter?: number
          connection_type?: string | null
          consecutive_failures?: number | null
          created_at?: string | null
          firmware_version?: string | null
          health_check_interval?: number | null
          id?: string
          is_active?: boolean | null
          is_connected?: boolean | null
          last_batch_at?: string | null
          last_connection_status?: string | null
          last_connection_test_at?: string | null
          last_error_message?: string | null
          last_transaction_at?: string | null
          local_ip_address?: unknown
          local_port?: number | null
          location_id: string
          merchant_id: string
          metadata?: Json | null
          open_batch_count?: number | null
          print_customer_receipt?: boolean | null
          print_merchant_receipt?: boolean | null
          register_id?: string | null
          serial_number?: string | null
          settle_time?: string | null
          signature_threshold?: number | null
          spin_proxy_timeout?: number | null
          station_id?: string | null
          supports_contactless?: boolean | null
          supports_debit?: boolean | null
          supports_ebt?: boolean | null
          supports_emv?: boolean | null
          supports_manual_entry?: boolean | null
          supports_tip_adjust?: boolean | null
          terminal_model?: string | null
          terminal_name: string
          terminal_type?: string | null
          tpn?: string | null
          tpn_encrypted?: string | null
          updated_at?: string | null
        }
        Update: {
          api_base_url?: string | null
          api_environment?: string | null
          auth_key?: string | null
          auth_key_encrypted?: string | null
          auth_key_secret_id?: string | null
          auto_settle?: boolean | null
          battery_level?: number | null
          castles_batch_number?: string | null
          castles_counter_updated_at?: string | null
          castles_ip_address?: string | null
          castles_last_pos_txn_id?: string
          castles_port?: number
          castles_txn_counter?: number
          connection_type?: string | null
          consecutive_failures?: number | null
          created_at?: string | null
          firmware_version?: string | null
          health_check_interval?: number | null
          id?: string
          is_active?: boolean | null
          is_connected?: boolean | null
          last_batch_at?: string | null
          last_connection_status?: string | null
          last_connection_test_at?: string | null
          last_error_message?: string | null
          last_transaction_at?: string | null
          local_ip_address?: unknown
          local_port?: number | null
          location_id?: string
          merchant_id?: string
          metadata?: Json | null
          open_batch_count?: number | null
          print_customer_receipt?: boolean | null
          print_merchant_receipt?: boolean | null
          register_id?: string | null
          serial_number?: string | null
          settle_time?: string | null
          signature_threshold?: number | null
          spin_proxy_timeout?: number | null
          station_id?: string | null
          supports_contactless?: boolean | null
          supports_debit?: boolean | null
          supports_ebt?: boolean | null
          supports_emv?: boolean | null
          supports_manual_entry?: boolean | null
          supports_tip_adjust?: boolean | null
          terminal_model?: string | null
          terminal_name?: string
          terminal_type?: string | null
          tpn?: string | null
          tpn_encrypted?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_terminals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_terminals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_terminals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "payment_terminals_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_terminals_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_terminals_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      pci_export_function_registry: {
        Row: {
          function_name: string
          notes: string | null
          registered_at: string
        }
        Insert: {
          function_name: string
          notes?: string | null
          registered_at?: string
        }
        Update: {
          function_name?: string
          notes?: string | null
          registered_at?: string
        }
        Relationships: []
      }
      pending_finalize_journal: {
        Row: {
          batch_uuid: string
          castles_response: Json
          merchant_id: string
          retried_at: string | null
          saved_at: string
          terminal_id: string
        }
        Insert: {
          batch_uuid: string
          castles_response: Json
          merchant_id: string
          retried_at?: string | null
          saved_at?: string
          terminal_id: string
        }
        Update: {
          batch_uuid?: string
          castles_response?: Json
          merchant_id?: string
          retried_at?: string | null
          saved_at?: string
          terminal_id?: string
        }
        Relationships: []
      }
      pending_org_admin_invites: {
        Row: {
          accepted_at: string | null
          clerk_invite_id: string | null
          clerk_user_id: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: number
          invited_by: string | null
          last_name: string | null
          merchant_access: Json | null
          organization_id: string | null
          role: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          clerk_invite_id?: string | null
          clerk_user_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: number
          invited_by?: string | null
          last_name?: string | null
          merchant_access?: Json | null
          organization_id?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          clerk_invite_id?: string | null
          clerk_user_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: number
          invited_by?: string | null
          last_name?: string | null
          merchant_access?: Json | null
          organization_id?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitee_user"
            columns: ["clerk_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_org_admin_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending-org-admin-invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          code: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          scope: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          scope: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          scope?: string
        }
        Relationships: []
      }
      phone_verifications: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          max_attempts: number
          merchant_id: string
          phone: string
          request_ip: unknown
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          merchant_id: string
          phone: string
          request_ip?: unknown
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          max_attempts?: number
          merchant_id?: string
          phone?: string
          request_ip?: unknown
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_verifications_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_verifications_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_login_attempts: {
        Row: {
          attempted_at: string
          device_id: string
          id: string
          ip_address: unknown
          location_id: string
          staff_profile_id: string | null
          succeeded: boolean
        }
        Insert: {
          attempted_at?: string
          device_id: string
          id?: string
          ip_address?: unknown
          location_id: string
          staff_profile_id?: string | null
          succeeded: boolean
        }
        Update: {
          attempted_at?: string
          device_id?: string
          id?: string
          ip_address?: unknown
          location_id?: string
          staff_profile_id?: string | null
          succeeded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pin_login_attempts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pin_login_attempts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pin_login_attempts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      platform_billing_provider_configs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          private_api_key_secret_id: string
          provider: string
          tokenization_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          private_api_key_secret_id: string
          provider: string
          tokenization_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          private_api_key_secret_id?: string
          provider?: string
          tokenization_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      prep_stations: {
        Row: {
          color: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          location_id: string
          merchant_id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          location_id: string
          merchant_id: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          location_id?: string
          merchant_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prep_stations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_stations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_stations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "prep_stations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_stations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      printer_routing_rules: {
        Row: {
          created_at: string | null
          id: string
          is_enabled: boolean
          printer_id: string
          rule_type: string
          rule_value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean
          printer_id: string
          rule_type: string
          rule_value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_enabled?: boolean
          printer_id?: string
          rule_type?: string
          rule_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "printer_routing_rules_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      printers: {
        Row: {
          auto_print_receipt: boolean | null
          bluetooth_address: string | null
          connection_type: string
          copies: number | null
          created_at: string | null
          device_id: string | null
          error_count: number | null
          id: string
          is_active: boolean | null
          is_connected: boolean | null
          is_default_kitchen: boolean | null
          is_default_receipt: boolean | null
          last_print_at: string | null
          last_status: string | null
          last_status_at: string | null
          location_id: string
          max_chars_per_line: number | null
          merchant_id: string
          metadata: Json | null
          network_address: unknown
          network_port: number | null
          paper_width: number
          print_density: number | null
          print_logo: boolean | null
          print_modifiers: boolean
          print_order_tickets: boolean | null
          printer_model: string | null
          printer_name: string
          printer_role: string
          printer_type: string
          receipt_footer: string | null
          receipt_header: string | null
          routing_mode: string
          serial_number: string | null
          station_id: string | null
          supports_auto_cut: boolean | null
          supports_barcode: boolean | null
          supports_cash_drawer_kick: boolean | null
          supports_logo: boolean | null
          supports_qr_code: boolean | null
          updated_at: string | null
          usb_device_path: string | null
        }
        Insert: {
          auto_print_receipt?: boolean | null
          bluetooth_address?: string | null
          connection_type: string
          copies?: number | null
          created_at?: string | null
          device_id?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          is_connected?: boolean | null
          is_default_kitchen?: boolean | null
          is_default_receipt?: boolean | null
          last_print_at?: string | null
          last_status?: string | null
          last_status_at?: string | null
          location_id: string
          max_chars_per_line?: number | null
          merchant_id: string
          metadata?: Json | null
          network_address?: unknown
          network_port?: number | null
          paper_width?: number
          print_density?: number | null
          print_logo?: boolean | null
          print_modifiers?: boolean
          print_order_tickets?: boolean | null
          printer_model?: string | null
          printer_name: string
          printer_role?: string
          printer_type: string
          receipt_footer?: string | null
          receipt_header?: string | null
          routing_mode?: string
          serial_number?: string | null
          station_id?: string | null
          supports_auto_cut?: boolean | null
          supports_barcode?: boolean | null
          supports_cash_drawer_kick?: boolean | null
          supports_logo?: boolean | null
          supports_qr_code?: boolean | null
          updated_at?: string | null
          usb_device_path?: string | null
        }
        Update: {
          auto_print_receipt?: boolean | null
          bluetooth_address?: string | null
          connection_type?: string
          copies?: number | null
          created_at?: string | null
          device_id?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          is_connected?: boolean | null
          is_default_kitchen?: boolean | null
          is_default_receipt?: boolean | null
          last_print_at?: string | null
          last_status?: string | null
          last_status_at?: string | null
          location_id?: string
          max_chars_per_line?: number | null
          merchant_id?: string
          metadata?: Json | null
          network_address?: unknown
          network_port?: number | null
          paper_width?: number
          print_density?: number | null
          print_logo?: boolean | null
          print_modifiers?: boolean
          print_order_tickets?: boolean | null
          printer_model?: string | null
          printer_name?: string
          printer_role?: string
          printer_type?: string
          receipt_footer?: string | null
          receipt_header?: string | null
          routing_mode?: string
          serial_number?: string | null
          station_id?: string | null
          supports_auto_cut?: boolean | null
          supports_barcode?: boolean | null
          supports_cash_drawer_kick?: boolean | null
          supports_logo?: boolean | null
          supports_qr_code?: boolean | null
          updated_at?: string | null
          usb_device_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "printers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "printers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printers_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_usage: {
        Row: {
          applied_by_staff_id: string | null
          created_at: string | null
          customer_id: string | null
          discount_applied: number
          id: string
          location_id: string
          merchant_id: string
          order_id: string
          promotion_id: string
        }
        Insert: {
          applied_by_staff_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          discount_applied: number
          id?: string
          location_id: string
          merchant_id: string
          order_id: string
          promotion_id: string
        }
        Update: {
          applied_by_staff_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          discount_applied?: number
          id?: string
          location_id?: string
          merchant_id?: string
          order_id?: string
          promotion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_usage_applied_by_staff_id_fkey"
            columns: ["applied_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_usage_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_usage_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_usage_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_usage_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_usage_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_usage_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "promotion_usage_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_usage_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_usage_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          active_days: number[] | null
          active_time_end: string | null
          active_time_start: string | null
          applies_to: string | null
          auto_apply: boolean | null
          birthday_window: string | null
          bogo_buy_quantity: number | null
          bogo_get_category_id: string | null
          bogo_get_item_id: string | null
          bogo_get_quantity: number | null
          comeback_days: number | null
          created_at: string | null
          created_by: string | null
          current_uses: number | null
          description: string | null
          discount_max: number | null
          discount_type: string
          discount_value: number | null
          ends_at: string | null
          free_item_id: string | null
          id: string
          is_active: boolean | null
          location_ids: string[] | null
          max_uses_per_customer: number | null
          max_uses_per_day: number | null
          max_uses_total: number | null
          merchant_id: string
          min_order_amount: number | null
          name: string
          promo_code: string | null
          promo_type: string
          starts_at: string | null
          target_categories: string[] | null
          target_item_ids: string[] | null
          threshold_amount: number | null
          total_discount_given: number | null
          total_redemptions: number | null
          updated_at: string | null
        }
        Insert: {
          active_days?: number[] | null
          active_time_end?: string | null
          active_time_start?: string | null
          applies_to?: string | null
          auto_apply?: boolean | null
          birthday_window?: string | null
          bogo_buy_quantity?: number | null
          bogo_get_category_id?: string | null
          bogo_get_item_id?: string | null
          bogo_get_quantity?: number | null
          comeback_days?: number | null
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          discount_max?: number | null
          discount_type: string
          discount_value?: number | null
          ends_at?: string | null
          free_item_id?: string | null
          id?: string
          is_active?: boolean | null
          location_ids?: string[] | null
          max_uses_per_customer?: number | null
          max_uses_per_day?: number | null
          max_uses_total?: number | null
          merchant_id: string
          min_order_amount?: number | null
          name: string
          promo_code?: string | null
          promo_type: string
          starts_at?: string | null
          target_categories?: string[] | null
          target_item_ids?: string[] | null
          threshold_amount?: number | null
          total_discount_given?: number | null
          total_redemptions?: number | null
          updated_at?: string | null
        }
        Update: {
          active_days?: number[] | null
          active_time_end?: string | null
          active_time_start?: string | null
          applies_to?: string | null
          auto_apply?: boolean | null
          birthday_window?: string | null
          bogo_buy_quantity?: number | null
          bogo_get_category_id?: string | null
          bogo_get_item_id?: string | null
          bogo_get_quantity?: number | null
          comeback_days?: number | null
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          discount_max?: number | null
          discount_type?: string
          discount_value?: number | null
          ends_at?: string | null
          free_item_id?: string | null
          id?: string
          is_active?: boolean | null
          location_ids?: string[] | null
          max_uses_per_customer?: number | null
          max_uses_per_day?: number | null
          max_uses_total?: number | null
          merchant_id?: string
          min_order_amount?: number | null
          name?: string
          promo_code?: string | null
          promo_type?: string
          starts_at?: string | null
          target_categories?: string[] | null
          target_item_ids?: string[] | null
          threshold_amount?: number | null
          total_discount_given?: number | null
          total_redemptions?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_bogo_get_category_id_fkey"
            columns: ["bogo_get_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_bogo_get_item_id_fkey"
            columns: ["bogo_get_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_bogo_get_item_id_fkey"
            columns: ["bogo_get_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "promotions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_free_item_id_fkey"
            columns: ["free_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_free_item_id_fkey"
            columns: ["free_item_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["menu_item_id"]
          },
          {
            foreignKeyName: "promotions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_ledger: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          employee_id: string
          id: string
          source_shift_id: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          employee_id: string
          id?: string
          source_shift_id?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          employee_id?: string
          id?: string
          source_shift_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pto_ledger_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_ledger_source_shift_id_fkey"
            columns: ["source_shift_id"]
            isOneToOne: false
            referencedRelation: "staff_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      pto_policies: {
        Row: {
          accrual_method: string
          accrual_rate: number
          created_at: string | null
          id: string
          max_balance: number | null
          merchant_id: string
          name: string
        }
        Insert: {
          accrual_method: string
          accrual_rate: number
          created_at?: string | null
          id?: string
          max_balance?: number | null
          merchant_id: string
          name: string
        }
        Update: {
          accrual_method?: string
          accrual_rate?: number
          created_at?: string | null
          id?: string
          max_balance?: number | null
          merchant_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pto_policies_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pto_policies_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          id: string
          inventory_item_id: string | null
          item_category: string | null
          item_name: string | null
          item_sku: string | null
          item_unit_type: string | null
          line_total: number | null
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number | null
          unit_cost: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_item_id?: string | null
          item_category?: string | null
          item_name?: string | null
          item_sku?: string | null
          item_unit_type?: string | null
          line_total?: number | null
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number | null
          unit_cost: number
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_item_id?: string | null
          item_category?: string | null
          item_name?: string | null
          item_sku?: string | null
          item_unit_type?: string | null
          line_total?: number | null
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_payments: {
        Row: {
          amount: number
          card_last_four: string | null
          created_at: string | null
          id: string
          notes: string | null
          paid_at: string | null
          paid_by_name: string | null
          paid_by_user_id: string | null
          paid_to: string | null
          payment_method: string
          purchase_order_id: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amount: number
          card_last_four?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by_name?: string | null
          paid_by_user_id?: string | null
          paid_to?: string | null
          payment_method: string
          purchase_order_id: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          card_last_four?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by_name?: string | null
          paid_by_user_id?: string | null
          paid_to?: string | null
          payment_method?: string
          purchase_order_id?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_payments_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          card_last_four: string | null
          created_at: string | null
          created_by: string | null
          delivered_at: string | null
          delivered_by: string | null
          delivery_logged_by_name: string | null
          delivery_logged_by_user_id: string | null
          delivery_notes: string | null
          expense_category: string | null
          expense_notes: string | null
          expense_vendor_name: string | null
          id: string
          is_adhoc_expense: boolean | null
          location_id: string | null
          merchant_id: string
          ordered_at: string | null
          paid_at: string | null
          payment_method: string | null
          po_number: string
          received_at: string | null
          status: string
          total_amount: number | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          card_last_four?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_logged_by_name?: string | null
          delivery_logged_by_user_id?: string | null
          delivery_notes?: string | null
          expense_category?: string | null
          expense_notes?: string | null
          expense_vendor_name?: string | null
          id?: string
          is_adhoc_expense?: boolean | null
          location_id?: string | null
          merchant_id: string
          ordered_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          po_number: string
          received_at?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          card_last_four?: string | null
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_logged_by_name?: string | null
          delivery_logged_by_user_id?: string | null
          delivery_notes?: string | null
          expense_category?: string | null
          expense_notes?: string | null
          expense_vendor_name?: string | null
          id?: string
          is_adhoc_expense?: boolean | null
          location_id?: string | null
          merchant_id?: string
          ordered_at?: string | null
          paid_at?: string | null
          payment_method?: string | null
          po_number?: string
          received_at?: string | null
          status?: string
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "purchase_orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
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
      qr_guest_alert_rate_limit: {
        Row: {
          id: number
          online_order_session_id: string
          raised_at: string
        }
        Insert: {
          id?: number
          online_order_session_id: string
          raised_at?: string
        }
        Update: {
          id?: number
          online_order_session_id?: string
          raised_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_guest_alert_rate_limit_online_order_session_id_fkey"
            columns: ["online_order_session_id"]
            isOneToOne: false
            referencedRelation: "online_order_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_guest_alert_rate_limit_online_order_session_id_fkey"
            columns: ["online_order_session_id"]
            isOneToOne: false
            referencedRelation: "qr_online_order_sessions_safe_v1"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_guest_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_key: string
          alert_type: string
          created_at: string
          floor_plan_object_id: string | null
          id: string
          location_id: string
          merchant_id: string
          message: string | null
          online_order_session_id: string | null
          order_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          table_label: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_key: string
          alert_type: string
          created_at?: string
          floor_plan_object_id?: string | null
          id?: string
          location_id: string
          merchant_id: string
          message?: string | null
          online_order_session_id?: string | null
          order_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          table_label: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_key?: string
          alert_type?: string
          created_at?: string
          floor_plan_object_id?: string | null
          id?: string
          location_id?: string
          merchant_id?: string
          message?: string | null
          online_order_session_id?: string | null
          order_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          table_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_guest_alerts_floor_plan_object_id_fkey"
            columns: ["floor_plan_object_id"]
            isOneToOne: false
            referencedRelation: "floor_plan_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_guest_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_guest_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_guest_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "qr_guest_alerts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_guest_alerts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_scan_events: {
        Row: {
          floor_plan_object_id: string | null
          id: string
          ip_hash: string | null
          location_id: string
          merchant_id: string
          occurred_at: string
          online_order_session_id: string | null
          order_id: string | null
          stage: string
          table_qr_code_id: string | null
          user_agent: string | null
        }
        Insert: {
          floor_plan_object_id?: string | null
          id?: string
          ip_hash?: string | null
          location_id: string
          merchant_id: string
          occurred_at?: string
          online_order_session_id?: string | null
          order_id?: string | null
          stage: string
          table_qr_code_id?: string | null
          user_agent?: string | null
        }
        Update: {
          floor_plan_object_id?: string | null
          id?: string
          ip_hash?: string | null
          location_id?: string
          merchant_id?: string
          occurred_at?: string
          online_order_session_id?: string | null
          order_id?: string | null
          stage?: string
          table_qr_code_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      qr_scan_rate_limit: {
        Row: {
          id: number
          ip_hash: string | null
          location_id: string
          merchant_id: string
          scanned_at: string
          table_qr_code_id: string
        }
        Insert: {
          id?: number
          ip_hash?: string | null
          location_id: string
          merchant_id: string
          scanned_at?: string
          table_qr_code_id: string
        }
        Update: {
          id?: number
          ip_hash?: string | null
          location_id?: string
          merchant_id?: string
          scanned_at?: string
          table_qr_code_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_scan_rate_limit_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scan_rate_limit_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scan_rate_limit_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "qr_scan_rate_limit_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scan_rate_limit_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_scan_rate_limit_table_qr_code_id_fkey"
            columns: ["table_qr_code_id"]
            isOneToOne: false
            referencedRelation: "table_qr_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_sends: {
        Row: {
          created_by: string | null
          delivery_method: string
          error_message: string | null
          id: string
          merchant_id: string
          order_id: string
          receipt_template_id: string | null
          recipient: string
          send_token: string
          sent_at: string
          status: string
        }
        Insert: {
          created_by?: string | null
          delivery_method: string
          error_message?: string | null
          id?: string
          merchant_id: string
          order_id: string
          receipt_template_id?: string | null
          recipient: string
          send_token?: string
          sent_at?: string
          status: string
        }
        Update: {
          created_by?: string | null
          delivery_method?: string
          error_message?: string | null
          id?: string
          merchant_id?: string
          order_id?: string
          receipt_template_id?: string | null
          recipient?: string
          send_token?: string
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_sends_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_sends_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_sends_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_sends_receipt_template_id_fkey"
            columns: ["receipt_template_id"]
            isOneToOne: false
            referencedRelation: "receipt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_templates: {
        Row: {
          created_at: string | null
          footer_text: string | null
          group_by_seat: boolean
          group_by_station: boolean | null
          header_text: string | null
          id: string
          is_active: boolean | null
          large_item_text: boolean | null
          location_id: string | null
          logo_url: string | null
          merchant_id: string
          modifier_style: string
          show_allergy_alert: boolean | null
          show_approved_by: boolean | null
          show_barcode: boolean | null
          show_break_details: boolean | null
          show_customer_phone: boolean
          show_item_modifiers: boolean | null
          show_logo: boolean | null
          show_loyalty_rewards: boolean | null
          show_mods_large: boolean | null
          show_order_type: boolean | null
          show_qr_code: boolean | null
          show_ready_by_time: boolean | null
          show_server_name: boolean | null
          show_tax_breakdown: boolean | null
          show_tip_line: boolean | null
          show_void_reason: boolean | null
          template_name: string
          template_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          footer_text?: string | null
          group_by_seat?: boolean
          group_by_station?: boolean | null
          header_text?: string | null
          id?: string
          is_active?: boolean | null
          large_item_text?: boolean | null
          location_id?: string | null
          logo_url?: string | null
          merchant_id: string
          modifier_style?: string
          show_allergy_alert?: boolean | null
          show_approved_by?: boolean | null
          show_barcode?: boolean | null
          show_break_details?: boolean | null
          show_customer_phone?: boolean
          show_item_modifiers?: boolean | null
          show_logo?: boolean | null
          show_loyalty_rewards?: boolean | null
          show_mods_large?: boolean | null
          show_order_type?: boolean | null
          show_qr_code?: boolean | null
          show_ready_by_time?: boolean | null
          show_server_name?: boolean | null
          show_tax_breakdown?: boolean | null
          show_tip_line?: boolean | null
          show_void_reason?: boolean | null
          template_name: string
          template_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          footer_text?: string | null
          group_by_seat?: boolean
          group_by_station?: boolean | null
          header_text?: string | null
          id?: string
          is_active?: boolean | null
          large_item_text?: boolean | null
          location_id?: string | null
          logo_url?: string | null
          merchant_id?: string
          modifier_style?: string
          show_allergy_alert?: boolean | null
          show_approved_by?: boolean | null
          show_barcode?: boolean | null
          show_break_details?: boolean | null
          show_customer_phone?: boolean
          show_item_modifiers?: boolean | null
          show_logo?: boolean | null
          show_loyalty_rewards?: boolean | null
          show_mods_large?: boolean | null
          show_order_type?: boolean | null
          show_qr_code?: boolean | null
          show_ready_by_time?: boolean | null
          show_server_name?: boolean | null
          show_tax_breakdown?: boolean | null
          show_tip_line?: boolean | null
          show_void_reason?: boolean | null
          template_name?: string
          template_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "receipt_templates_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_templates_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_items: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          ingredient_name: string
          inventory_item_id: string | null
          merchant_id: string
          quantity: number
          recipe_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          ingredient_name: string
          inventory_item_id?: string | null
          merchant_id: string
          quantity: number
          recipe_id: string
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          ingredient_name?: string
          inventory_item_id?: string | null
          merchant_id?: string
          quantity?: number
          recipe_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          instructions: string | null
          merchant_id: string
          name: string
          servings: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          merchant_id: string
          name: string
          servings?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          instructions?: string | null
          merchant_id?: string
          name?: string
          servings?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          arrived_at: string | null
          assigned_table_ids: string[] | null
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmation_number: string
          confirmation_sent_at: string | null
          created_at: string | null
          created_by_staff_id: string | null
          customer_id: string | null
          deposit_amount: number | null
          deposit_paid_at: string | null
          deposit_payment_id: string | null
          duration_minutes: number | null
          email: string | null
          external_reference: string | null
          id: string
          is_vip: boolean | null
          location_id: string
          merchant_id: string
          no_show_marked_at: string | null
          notes: string | null
          party_name: string
          party_size: number
          phone: string
          preferred_section: string | null
          reminder_hours_before: number | null
          reminder_sent_at: string | null
          reservation_date: string
          reservation_time: string
          seated_at: string | null
          seated_session_id: string | null
          seating_preference: string | null
          source: string | null
          special_requests: string | null
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string | null
        }
        Insert: {
          arrived_at?: string | null
          assigned_table_ids?: string[] | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_number: string
          confirmation_sent_at?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          deposit_paid_at?: string | null
          deposit_payment_id?: string | null
          duration_minutes?: number | null
          email?: string | null
          external_reference?: string | null
          id?: string
          is_vip?: boolean | null
          location_id: string
          merchant_id: string
          no_show_marked_at?: string | null
          notes?: string | null
          party_name: string
          party_size: number
          phone: string
          preferred_section?: string | null
          reminder_hours_before?: number | null
          reminder_sent_at?: string | null
          reservation_date: string
          reservation_time: string
          seated_at?: string | null
          seated_session_id?: string | null
          seating_preference?: string | null
          source?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string | null
        }
        Update: {
          arrived_at?: string | null
          assigned_table_ids?: string[] | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_number?: string
          confirmation_sent_at?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          deposit_paid_at?: string | null
          deposit_payment_id?: string | null
          duration_minutes?: number | null
          email?: string | null
          external_reference?: string | null
          id?: string
          is_vip?: boolean | null
          location_id?: string
          merchant_id?: string
          no_show_marked_at?: string | null
          notes?: string | null
          party_name?: string
          party_size?: number
          phone?: string
          preferred_section?: string | null
          reminder_hours_before?: number | null
          reminder_sent_at?: string | null
          reservation_date?: string
          reservation_time?: string
          seated_at?: string | null
          seated_session_id?: string | null
          seating_preference?: string | null
          source?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "reservations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_seated_session_id_fkey"
            columns: ["seated_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      reversals: {
        Row: {
          amount: number
          approved_by: string | null
          completed_at: string | null
          emv_data: Json | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          initiated_by: string | null
          location_id: string
          merchant_id: string
          original_payment_id: string
          original_psp_reference: string | null
          processed_at: string | null
          raw_response: Json | null
          reason_code: string | null
          reason_description: string | null
          requested_at: string
          response_message: string | null
          result_code: string | null
          reversal_psp_reference: string | null
          reversal_reference_id: string
          reversal_type: string
          status: string
          terminal_response: Json | null
        }
        Insert: {
          amount: number
          approved_by?: string | null
          completed_at?: string | null
          emv_data?: Json | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          initiated_by?: string | null
          location_id: string
          merchant_id: string
          original_payment_id: string
          original_psp_reference?: string | null
          processed_at?: string | null
          raw_response?: Json | null
          reason_code?: string | null
          reason_description?: string | null
          requested_at?: string
          response_message?: string | null
          result_code?: string | null
          reversal_psp_reference?: string | null
          reversal_reference_id: string
          reversal_type: string
          status?: string
          terminal_response?: Json | null
        }
        Update: {
          amount?: number
          approved_by?: string | null
          completed_at?: string | null
          emv_data?: Json | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          initiated_by?: string | null
          location_id?: string
          merchant_id?: string
          original_payment_id?: string
          original_psp_reference?: string | null
          processed_at?: string | null
          raw_response?: Json | null
          reason_code?: string | null
          reason_description?: string | null
          requested_at?: string
          response_message?: string | null
          result_code?: string | null
          reversal_psp_reference?: string | null
          reversal_reference_id?: string
          reversal_type?: string
          status?: string
          terminal_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "reversals_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversals_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "reversals_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversals_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversals_original_payment_id_fkey"
            columns: ["original_payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversals_original_payment_id_fkey"
            columns: ["original_payment_id"]
            isOneToOne: false
            referencedRelation: "pci_safe_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reversals_original_payment_id_fkey"
            columns: ["original_payment_id"]
            isOneToOne: false
            referencedRelation: "vw_platform_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permission_code: string | null
          role_code: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission_code?: string | null
          role_code?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          permission_code?: string | null
          role_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_system_role: boolean | null
          level: number
          level_type: string | null
          name: string
          organization_type: Database["public"]["Enums"]["organization_type"]
          requires_clerk_account: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          level: number
          level_type?: string | null
          name: string
          organization_type: Database["public"]["Enums"]["organization_type"]
          requires_clerk_account?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_system_role?: boolean | null
          level?: number
          level_type?: string | null
          name?: string
          organization_type?: Database["public"]["Enums"]["organization_type"]
          requires_clerk_account?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      schedule_time_slots: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          merchant_id: string
          schedule_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          merchant_id: string
          schedule_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          merchant_id?: string
          schedule_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_time_slots_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_time_slots_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_time_slots_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          location_id: string | null
          merchant_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          merchant_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          merchant_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "schedules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts: {
        Row: {
          acknowledged_at: string | null
          alert_type: string
          created_at: string
          details: Json | null
          device_id: string | null
          id: string
          ip_address: unknown
          location_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          alert_type: string
          created_at?: string
          details?: Json | null
          device_id?: string | null
          id?: string
          ip_address?: unknown
          location_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          alert_type?: string
          created_at?: string
          details?: Json | null
          device_id?: string | null
          id?: string
          ip_address?: unknown
          location_id?: string | null
        }
        Relationships: []
      }
      server_sections: {
        Row: {
          assigned_staff_id: string | null
          assigned_user_id: string | null
          color: string | null
          created_at: string | null
          current_guest_count: number | null
          current_table_count: number | null
          floor_plan_id: string
          id: string
          is_active: boolean | null
          location_id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          assigned_staff_id?: string | null
          assigned_user_id?: string | null
          color?: string | null
          created_at?: string | null
          current_guest_count?: number | null
          current_table_count?: number | null
          floor_plan_id: string
          id?: string
          is_active?: boolean | null
          location_id: string
          name: string
          updated_at?: string | null
        }
        Update: {
          assigned_staff_id?: string | null
          assigned_user_id?: string | null
          color?: string | null
          created_at?: string | null
          current_guest_count?: number | null
          current_table_count?: number | null
          floor_plan_id?: string
          id?: string
          is_active?: boolean | null
          location_id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "server_sections_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_sections_floor_plan_id_fkey"
            columns: ["floor_plan_id"]
            isOneToOne: false
            referencedRelation: "floor_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_sections_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_sections_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_sections_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      service_charge_rules: {
        Row: {
          applies_on: string
          applies_to_order_types: string[]
          auto_apply: boolean
          created_at: string
          id: string
          is_active: boolean
          is_taxable: boolean
          location_id: string | null
          merchant_id: string
          min_party_size: number
          name: string
          rate_percent: number
          updated_at: string
        }
        Insert: {
          applies_on?: string
          applies_to_order_types?: string[]
          auto_apply?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          location_id?: string | null
          merchant_id: string
          min_party_size?: number
          name?: string
          rate_percent: number
          updated_at?: string
        }
        Update: {
          applies_on?: string
          applies_to_order_types?: string[]
          auto_apply?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          location_id?: string | null
          merchant_id?: string
          min_party_size?: number
          name?: string
          rate_percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_charge_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_charge_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_charge_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "service_charge_rules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_charge_rules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      session_kick_notifications: {
        Row: {
          created_at: string | null
          device_id: string
          id: string
          kick_reason: string | null
          kicked_by_staff_name: string | null
          session_id: string
        }
        Insert: {
          created_at?: string | null
          device_id: string
          id?: string
          kick_reason?: string | null
          kicked_by_staff_name?: string | null
          session_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: string
          id?: string
          kick_reason?: string | null
          kicked_by_staff_name?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_kick_notifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "station_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_batches: {
        Row: {
          acquirer: string | null
          assessment_fees: number | null
          batch_id: string
          batch_number: string | null
          business_date: string
          business_date_end: string | null
          business_date_start: string | null
          castles_batch_num: string | null
          castles_pos_txn_id: string | null
          castles_return_code: string | null
          castles_settle_info: Json | null
          closed_at: string | null
          created_at: string
          failure_reason: string | null
          funded_date: string | null
          gross_amount: number | null
          id: string
          interchange_fees: number | null
          last_attempt_at: string | null
          location_id: string
          merchant_id: string
          net_deposit: number | null
          opened_at: string
          payment_terminal_id: string | null
          processor_fees: number | null
          raw_response: Json | null
          refund_amount: number | null
          refund_count: number | null
          retry_count: number
          sales_count: number | null
          settlement_date: string | null
          status: string | null
          terminal_id: string | null
          tip_amount: number | null
          transaction_count: number | null
          updated_at: string
          void_count: number | null
        }
        Insert: {
          acquirer?: string | null
          assessment_fees?: number | null
          batch_id: string
          batch_number?: string | null
          business_date: string
          business_date_end?: string | null
          business_date_start?: string | null
          castles_batch_num?: string | null
          castles_pos_txn_id?: string | null
          castles_return_code?: string | null
          castles_settle_info?: Json | null
          closed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          funded_date?: string | null
          gross_amount?: number | null
          id?: string
          interchange_fees?: number | null
          last_attempt_at?: string | null
          location_id: string
          merchant_id: string
          net_deposit?: number | null
          opened_at?: string
          payment_terminal_id?: string | null
          processor_fees?: number | null
          raw_response?: Json | null
          refund_amount?: number | null
          refund_count?: number | null
          retry_count?: number
          sales_count?: number | null
          settlement_date?: string | null
          status?: string | null
          terminal_id?: string | null
          tip_amount?: number | null
          transaction_count?: number | null
          updated_at?: string
          void_count?: number | null
        }
        Update: {
          acquirer?: string | null
          assessment_fees?: number | null
          batch_id?: string
          batch_number?: string | null
          business_date?: string
          business_date_end?: string | null
          business_date_start?: string | null
          castles_batch_num?: string | null
          castles_pos_txn_id?: string | null
          castles_return_code?: string | null
          castles_settle_info?: Json | null
          closed_at?: string | null
          created_at?: string
          failure_reason?: string | null
          funded_date?: string | null
          gross_amount?: number | null
          id?: string
          interchange_fees?: number | null
          last_attempt_at?: string | null
          location_id?: string
          merchant_id?: string
          net_deposit?: number | null
          opened_at?: string
          payment_terminal_id?: string | null
          processor_fees?: number | null
          raw_response?: Json | null
          refund_amount?: number | null
          refund_count?: number | null
          retry_count?: number
          sales_count?: number | null
          settlement_date?: string | null
          status?: string | null
          terminal_id?: string | null
          tip_amount?: number | null
          transaction_count?: number | null
          updated_at?: string
          void_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "settlement_batches_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_batches_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_batches_payment_terminal_id_fkey"
            columns: ["payment_terminal_id"]
            isOneToOne: false
            referencedRelation: "payment_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_trade_requests: {
        Row: {
          created_at: string | null
          id: string
          manager_reason: string | null
          merchant_id: string
          offered_shift_id: string | null
          recipient_id: string | null
          requested_shift_id: string | null
          requester_id: string
          reviewed_by: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          manager_reason?: string | null
          merchant_id: string
          offered_shift_id?: string | null
          recipient_id?: string | null
          requested_shift_id?: string | null
          requester_id: string
          reviewed_by?: string | null
          status?: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          manager_reason?: string | null
          merchant_id?: string
          offered_shift_id?: string | null
          recipient_id?: string | null
          requested_shift_id?: string | null
          requester_id?: string
          reviewed_by?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_trade_requests_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_trade_requests_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_trade_requests_offered_shift_id_fkey"
            columns: ["offered_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_trade_requests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_trade_requests_requested_shift_id_fkey"
            columns: ["requested_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_trade_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_trade_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          color: string | null
          created_at: string | null
          employee_id: string | null
          end_time: string
          id: string
          location_id: string
          merchant_id: string
          notes: string | null
          role_id: string | null
          role_name: string | null
          schedule_id: string | null
          start_time: string
          status: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          employee_id?: string | null
          end_time: string
          id?: string
          location_id: string
          merchant_id: string
          notes?: string | null
          role_id?: string | null
          role_name?: string | null
          schedule_id?: string | null
          start_time: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          employee_id?: string | null
          end_time?: string
          id?: string
          location_id?: string
          merchant_id?: string
          notes?: string | null
          role_id?: string | null
          role_name?: string | null
          schedule_id?: string | null
          start_time?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "shifts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          banner_text: string | null
          created_at: string | null
          custom_domain: string | null
          description: string | null
          id: string
          is_active: boolean | null
          location_id: string | null
          logo_url: string | null
          merchant_id: string
          online_ordering_config: Json | null
          payment_device_id: string | null
          subdomain: string | null
          theme_config: Json | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          banner_text?: string | null
          created_at?: string | null
          custom_domain?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          logo_url?: string | null
          merchant_id: string
          online_ordering_config?: Json | null
          payment_device_id?: string | null
          subdomain?: string | null
          theme_config?: Json | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          banner_text?: string | null
          created_at?: string | null
          custom_domain?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          logo_url?: string | null
          merchant_id?: string
          online_ordering_config?: Json | null
          payment_device_id?: string | null
          subdomain?: string | null
          theme_config?: Json | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "sites_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_payment_device_id_fkey"
            columns: ["payment_device_id"]
            isOneToOne: false
            referencedRelation: "location_payment_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          account_type: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          merchant_id: string
          phone: string | null
          public_metadata: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_type: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          merchant_id: string
          phone?: string | null
          public_metadata?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_type?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          merchant_id?: string
          phone?: string | null
          public_metadata?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profiles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          break_logs: Json | null
          clock_in_time: string
          clock_out_time: string | null
          created_at: string | null
          declared_cash_tips: number
          device_id: string | null
          hourly_rate_snapshot: number
          id: string
          is_verified: boolean | null
          location_id: string
          merchant_id: string
          notes: string | null
          staff_profile_id: string
          station_id: string | null
          station_session_id: string | null
          status: string
          tips_declared_at: string | null
          updated_at: string | null
        }
        Insert: {
          break_logs?: Json | null
          clock_in_time?: string
          clock_out_time?: string | null
          created_at?: string | null
          declared_cash_tips?: number
          device_id?: string | null
          hourly_rate_snapshot?: number
          id?: string
          is_verified?: boolean | null
          location_id: string
          merchant_id: string
          notes?: string | null
          staff_profile_id: string
          station_id?: string | null
          station_session_id?: string | null
          status: string
          tips_declared_at?: string | null
          updated_at?: string | null
        }
        Update: {
          break_logs?: Json | null
          clock_in_time?: string
          clock_out_time?: string | null
          created_at?: string | null
          declared_cash_tips?: number
          device_id?: string | null
          hourly_rate_snapshot?: number
          id?: string
          is_verified?: boolean | null
          location_id?: string
          merchant_id?: string
          notes?: string | null
          staff_profile_id?: string
          station_id?: string | null
          station_session_id?: string | null
          status?: string
          tips_declared_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "staff_shifts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_station_session_id_fkey"
            columns: ["station_session_id"]
            isOneToOne: false
            referencedRelation: "station_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      station_devices: {
        Row: {
          app_version: string | null
          auto_cut: boolean | null
          connection_address: string | null
          connection_port: number | null
          connection_type: string
          created_at: string | null
          device_id: string | null
          device_model: string | null
          device_name: string
          device_type: string
          id: string
          ip_address: unknown
          is_active: boolean | null
          is_connected: boolean | null
          last_error: string | null
          last_seen_at: string | null
          location_id: string
          merchant_id: string
          open_cash_drawer: boolean | null
          os_version: string | null
          payment_terminal_id: string | null
          printer_dpi: number | null
          printer_width: number | null
          serial_number: string | null
          session_id: string | null
          staff_id: string | null
          staff_name: string | null
          station_id: string
          updated_at: string | null
        }
        Insert: {
          app_version?: string | null
          auto_cut?: boolean | null
          connection_address?: string | null
          connection_port?: number | null
          connection_type: string
          created_at?: string | null
          device_id?: string | null
          device_model?: string | null
          device_name: string
          device_type: string
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          is_connected?: boolean | null
          last_error?: string | null
          last_seen_at?: string | null
          location_id: string
          merchant_id: string
          open_cash_drawer?: boolean | null
          os_version?: string | null
          payment_terminal_id?: string | null
          printer_dpi?: number | null
          printer_width?: number | null
          serial_number?: string | null
          session_id?: string | null
          staff_id?: string | null
          staff_name?: string | null
          station_id: string
          updated_at?: string | null
        }
        Update: {
          app_version?: string | null
          auto_cut?: boolean | null
          connection_address?: string | null
          connection_port?: number | null
          connection_type?: string
          created_at?: string | null
          device_id?: string | null
          device_model?: string | null
          device_name?: string
          device_type?: string
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          is_connected?: boolean | null
          last_error?: string | null
          last_seen_at?: string | null
          location_id?: string
          merchant_id?: string
          open_cash_drawer?: boolean | null
          os_version?: string | null
          payment_terminal_id?: string | null
          printer_dpi?: number | null
          printer_width?: number | null
          serial_number?: string | null
          session_id?: string | null
          staff_id?: string | null
          staff_name?: string | null
          station_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "station_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_devices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "station_devices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_devices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_devices_payment_terminal_id_fkey"
            columns: ["payment_terminal_id"]
            isOneToOne: false
            referencedRelation: "payment_terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_devices_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "station_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_devices_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_devices_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      station_sessions: {
        Row: {
          app_version: string | null
          device_id: string
          device_model: string | null
          device_name: string | null
          ended_at: string | null
          hardware_model: string | null
          id: string
          ip_address: string | null
          kick_reason: string | null
          kicked_by_device_id: string | null
          kicked_by_staff_name: string | null
          last_activity_at: string | null
          location_id: string
          merchant_id: string
          os_version: string | null
          session_status: string
          staff_name: string | null
          staff_profile_id: string | null
          started_at: string
          station_id: string
        }
        Insert: {
          app_version?: string | null
          device_id: string
          device_model?: string | null
          device_name?: string | null
          ended_at?: string | null
          hardware_model?: string | null
          id?: string
          ip_address?: string | null
          kick_reason?: string | null
          kicked_by_device_id?: string | null
          kicked_by_staff_name?: string | null
          last_activity_at?: string | null
          location_id: string
          merchant_id: string
          os_version?: string | null
          session_status?: string
          staff_name?: string | null
          staff_profile_id?: string | null
          started_at?: string
          station_id: string
        }
        Update: {
          app_version?: string | null
          device_id?: string
          device_model?: string | null
          device_name?: string | null
          ended_at?: string | null
          hardware_model?: string | null
          id?: string
          ip_address?: string | null
          kick_reason?: string | null
          kicked_by_device_id?: string | null
          kicked_by_staff_name?: string | null
          last_activity_at?: string | null
          location_id?: string
          merchant_id?: string
          os_version?: string | null
          session_status?: string
          staff_name?: string | null
          staff_profile_id?: string | null
          started_at?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "station_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_sessions_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_sessions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          android_sdk_version: number | null
          app_version: string | null
          battery_level: number | null
          can_apply_discounts: boolean | null
          can_create_orders: boolean | null
          can_process_payments: boolean | null
          can_update_kitchen_status: boolean | null
          can_void_orders: boolean | null
          created_at: string | null
          current_receipt_printer_id: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          device_id: string | null
          device_manufacturer: string | null
          device_model: string | null
          device_name: string | null
          hardware_model: string | null
          has_builtin_cfd: boolean | null
          has_builtin_printer: boolean | null
          has_cash_drawer_port: boolean | null
          has_nfc: boolean | null
          id: string
          ip_address: unknown
          is_active: boolean | null
          is_online: boolean | null
          kiosk_profile_id: string | null
          last_heartbeat_at: string | null
          last_sync_at: string | null
          local_ip_address: unknown
          location_id: string
          mac_address: string | null
          merchant_id: string
          network_ssid: string | null
          network_type: string | null
          os_version: string | null
          pos_config_overrides: Json
          ram_free_mb: number | null
          screen_density: number | null
          screen_height: number | null
          screen_width: number | null
          station_code: string | null
          station_name: string
          station_number: number | null
          station_type: string
          storage_free_mb: number | null
          sync_role: string | null
          updated_at: string | null
          view_scope: string | null
        }
        Insert: {
          android_sdk_version?: number | null
          app_version?: string | null
          battery_level?: number | null
          can_apply_discounts?: boolean | null
          can_create_orders?: boolean | null
          can_process_payments?: boolean | null
          can_update_kitchen_status?: boolean | null
          can_void_orders?: boolean | null
          created_at?: string | null
          current_receipt_printer_id?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          device_id?: string | null
          device_manufacturer?: string | null
          device_model?: string | null
          device_name?: string | null
          hardware_model?: string | null
          has_builtin_cfd?: boolean | null
          has_builtin_printer?: boolean | null
          has_cash_drawer_port?: boolean | null
          has_nfc?: boolean | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          is_online?: boolean | null
          kiosk_profile_id?: string | null
          last_heartbeat_at?: string | null
          last_sync_at?: string | null
          local_ip_address?: unknown
          location_id: string
          mac_address?: string | null
          merchant_id: string
          network_ssid?: string | null
          network_type?: string | null
          os_version?: string | null
          pos_config_overrides?: Json
          ram_free_mb?: number | null
          screen_density?: number | null
          screen_height?: number | null
          screen_width?: number | null
          station_code?: string | null
          station_name: string
          station_number?: number | null
          station_type?: string
          storage_free_mb?: number | null
          sync_role?: string | null
          updated_at?: string | null
          view_scope?: string | null
        }
        Update: {
          android_sdk_version?: number | null
          app_version?: string | null
          battery_level?: number | null
          can_apply_discounts?: boolean | null
          can_create_orders?: boolean | null
          can_process_payments?: boolean | null
          can_update_kitchen_status?: boolean | null
          can_void_orders?: boolean | null
          created_at?: string | null
          current_receipt_printer_id?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          device_id?: string | null
          device_manufacturer?: string | null
          device_model?: string | null
          device_name?: string | null
          hardware_model?: string | null
          has_builtin_cfd?: boolean | null
          has_builtin_printer?: boolean | null
          has_cash_drawer_port?: boolean | null
          has_nfc?: boolean | null
          id?: string
          ip_address?: unknown
          is_active?: boolean | null
          is_online?: boolean | null
          kiosk_profile_id?: string | null
          last_heartbeat_at?: string | null
          last_sync_at?: string | null
          local_ip_address?: unknown
          location_id?: string
          mac_address?: string | null
          merchant_id?: string
          network_ssid?: string | null
          network_type?: string | null
          os_version?: string | null
          pos_config_overrides?: Json
          ram_free_mb?: number | null
          screen_density?: number | null
          screen_height?: number | null
          screen_width?: number | null
          station_code?: string | null
          station_name?: string
          station_number?: number | null
          station_type?: string
          storage_free_mb?: number | null
          sync_role?: string | null
          updated_at?: string | null
          view_scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stations_current_receipt_printer_id_fkey"
            columns: ["current_receipt_printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_kiosk_profile_id_fkey"
            columns: ["kiosk_profile_id"]
            isOneToOne: false
            referencedRelation: "kiosk_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "stations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_update_log: {
        Row: {
          change_amount: number | null
          created_at: string | null
          id: string
          inventory_item_id: string | null
          location_id: string | null
          merchant_id: string
          new_stock: number | null
          previous_stock: number | null
          purchase_order_id: string | null
          update_reason: string | null
          update_source: string
          updated_by_name: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          change_amount?: number | null
          created_at?: string | null
          id?: string
          inventory_item_id?: string | null
          location_id?: string | null
          merchant_id: string
          new_stock?: number | null
          previous_stock?: number | null
          purchase_order_id?: string | null
          update_reason?: string | null
          update_source: string
          updated_by_name?: string | null
          updated_by_user_id?: string | null
        }
        Update: {
          change_amount?: number | null
          created_at?: string | null
          id?: string
          inventory_item_id?: string | null
          location_id?: string | null
          merchant_id?: string
          new_stock?: number | null
          previous_stock?: number | null
          purchase_order_id?: string | null
          update_reason?: string | null
          update_source?: string
          updated_by_name?: string | null
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_update_log_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_update_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_update_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_update_log_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "stock_update_log_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_update_log_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_update_log_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoice_sequences: {
        Row: {
          created_at: string
          last_number: number
          updated_at: string
          yearmonth: string
        }
        Insert: {
          created_at?: string
          last_number?: number
          updated_at?: string
          yearmonth: string
        }
        Update: {
          created_at?: string
          last_number?: number
          updated_at?: string
          yearmonth?: string
        }
        Relationships: []
      }
      subscription_invoices: {
        Row: {
          billing_method: string
          billing_period_end: string
          billing_period_start: string
          billing_profile_id: string | null
          card_surcharge: number
          created_at: string
          due_date: string
          id: string
          invoice_number: string
          last_payment_attempt_at: string | null
          last_payment_error: string | null
          line_items: Json
          location_id: string
          merchant_id: string
          metadata: Json
          nmi_response: Json | null
          nmi_transaction_id: string | null
          paid_at: string | null
          payment_attempt_count: number
          station_count_snapshot: number
          status: string
          subscription_id: string
          subtotal: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          billing_method: string
          billing_period_end: string
          billing_period_start: string
          billing_profile_id?: string | null
          card_surcharge?: number
          created_at?: string
          due_date: string
          id?: string
          invoice_number: string
          last_payment_attempt_at?: string | null
          last_payment_error?: string | null
          line_items?: Json
          location_id: string
          merchant_id: string
          metadata?: Json
          nmi_response?: Json | null
          nmi_transaction_id?: string | null
          paid_at?: string | null
          payment_attempt_count?: number
          station_count_snapshot?: number
          status?: string
          subscription_id: string
          subtotal: number
          total_amount: number
          updated_at?: string
        }
        Update: {
          billing_method?: string
          billing_period_end?: string
          billing_period_start?: string
          billing_profile_id?: string | null
          card_surcharge?: number
          created_at?: string
          due_date?: string
          id?: string
          invoice_number?: string
          last_payment_attempt_at?: string | null
          last_payment_error?: string | null
          line_items?: Json
          location_id?: string
          merchant_id?: string
          metadata?: Json
          nmi_response?: Json | null
          nmi_transaction_id?: string | null
          paid_at?: string | null
          payment_attempt_count?: number
          station_count_snapshot?: number
          status?: string
          subscription_id?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_billing_profile_id_fkey"
            columns: ["billing_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "subscription_invoices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "merchant_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          base_price_monthly: number
          card_surcharge_pct: number
          created_at: string
          description: string | null
          display_name: string
          display_order: number
          id: string
          included_stations: number
          is_active: boolean
          max_locations: number | null
          metadata: Json
          min_locations: number | null
          monthly_price_cents: number
          per_extra_station_price: number
          plan_code: string
          plan_scope: string
          updated_at: string
        }
        Insert: {
          base_price_monthly: number
          card_surcharge_pct?: number
          created_at?: string
          description?: string | null
          display_name: string
          display_order?: number
          id?: string
          included_stations?: number
          is_active?: boolean
          max_locations?: number | null
          metadata?: Json
          min_locations?: number | null
          monthly_price_cents?: number
          per_extra_station_price?: number
          plan_code: string
          plan_scope?: string
          updated_at?: string
        }
        Update: {
          base_price_monthly?: number
          card_surcharge_pct?: number
          created_at?: string
          description?: string | null
          display_name?: string
          display_order?: number
          id?: string
          included_stations?: number
          is_active?: boolean
          max_locations?: number | null
          metadata?: Json
          min_locations?: number | null
          monthly_price_cents?: number
          per_extra_station_price?: number
          plan_code?: string
          plan_scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_ticket_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          message_id: string | null
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          message_id?: string | null
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          message_id?: string | null
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_ticket_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          created_at: string | null
          edited_at: string | null
          id: string
          is_internal: boolean | null
          message: string
          read_by_admin: boolean | null
          read_by_merchant: boolean | null
          sender_id: string
          sender_name: string
          sender_role: string
          ticket_id: string
        }
        Insert: {
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_internal?: boolean | null
          message: string
          read_by_admin?: boolean | null
          read_by_merchant?: boolean | null
          sender_id: string
          sender_name: string
          sender_role: string
          ticket_id: string
        }
        Update: {
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_internal?: boolean | null
          message?: string
          read_by_admin?: boolean | null
          read_by_merchant?: boolean | null
          sender_id?: string
          sender_name?: string
          sender_role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          carrier_id: string | null
          category: string
          created_at: string | null
          description: string
          first_response_at: string | null
          id: string
          last_message_at: string | null
          location_id: string | null
          merchant_id: string
          metadata: Json | null
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subject: string
          submitted_by: string
          submitted_by_email: string | null
          submitted_by_name: string
          tags: string[] | null
          ticket_number: string
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          carrier_id?: string | null
          category?: string
          created_at?: string | null
          description: string
          first_response_at?: string | null
          id?: string
          last_message_at?: string | null
          location_id?: string | null
          merchant_id: string
          metadata?: Json | null
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject: string
          submitted_by: string
          submitted_by_email?: string | null
          submitted_by_name: string
          tags?: string[] | null
          ticket_number: string
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          carrier_id?: string | null
          category?: string
          created_at?: string | null
          description?: string
          first_response_at?: string | null
          id?: string
          last_message_at?: string | null
          location_id?: string | null
          merchant_id?: string
          metadata?: Json | null
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string
          submitted_by?: string
          submitted_by_email?: string | null
          submitted_by_name?: string
          tags?: string[] | null
          ticket_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "support_tickets_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      suspension_events: {
        Row: {
          created_at: string
          event_type: string
          forced: boolean
          id: string
          initiated_by_user_id: string | null
          merchant_id: string
          open_drawer_sessions: Json
          open_drawer_sessions_count: number
          open_orders: Json
          open_orders_count: number
          reason: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          forced?: boolean
          id?: string
          initiated_by_user_id?: string | null
          merchant_id: string
          open_drawer_sessions?: Json
          open_drawer_sessions_count?: number
          open_orders?: Json
          open_orders_count?: number
          reason?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          forced?: boolean
          id?: string
          initiated_by_user_id?: string | null
          merchant_id?: string
          open_drawer_sessions?: Json
          open_drawer_sessions_count?: number
          open_orders?: Json
          open_orders_count?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suspension_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suspension_events_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_resolution_events: {
        Row: {
          created_at: string
          id: string
          idempotency_key: string | null
          location_id: string | null
          merchant_id: string
          metadata: Json | null
          op_type: string
          order_id: string | null
          payment_id: string | null
          reason: string
          resolution: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          location_id?: string | null
          merchant_id: string
          metadata?: Json | null
          op_type: string
          order_id?: string | null
          payment_id?: string | null
          reason: string
          resolution: string
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idempotency_key?: string | null
          location_id?: string | null
          merchant_id?: string
          metadata?: Json | null
          op_type?: string
          order_id?: string | null
          payment_id?: string | null
          reason?: string
          resolution?: string
          staff_id?: string
        }
        Relationships: []
      }
      table_metrics: {
        Row: {
          avg_check: number | null
          avg_time_to_check: number | null
          avg_time_to_food: number | null
          avg_time_to_order: number | null
          avg_turn_time: number | null
          created_at: string | null
          id: string
          location_id: string
          metric_date: string
          metric_hour: number | null
          revenue_per_seat_hour: number | null
          table_id: string
          total_covers: number | null
          total_revenue: number | null
          total_sessions: number | null
        }
        Insert: {
          avg_check?: number | null
          avg_time_to_check?: number | null
          avg_time_to_food?: number | null
          avg_time_to_order?: number | null
          avg_turn_time?: number | null
          created_at?: string | null
          id?: string
          location_id: string
          metric_date: string
          metric_hour?: number | null
          revenue_per_seat_hour?: number | null
          table_id: string
          total_covers?: number | null
          total_revenue?: number | null
          total_sessions?: number | null
        }
        Update: {
          avg_check?: number | null
          avg_time_to_check?: number | null
          avg_time_to_food?: number | null
          avg_time_to_order?: number | null
          avg_turn_time?: number | null
          created_at?: string | null
          id?: string
          location_id?: string
          metric_date?: string
          metric_hour?: number | null
          revenue_per_seat_hour?: number | null
          table_id?: string
          total_covers?: number | null
          total_revenue?: number | null
          total_sessions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "table_metrics_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_metrics_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_metrics_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "table_metrics_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "floor_plan_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      table_qr_codes: {
        Row: {
          created_at: string
          created_by: string | null
          floor_plan_object_id: string
          id: string
          is_active: boolean
          last_scanned_at: string | null
          location_id: string
          merchant_id: string
          rotated_at: string | null
          scan_count: number
          table_label: string
          token: string
          token_version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          floor_plan_object_id: string
          id?: string
          is_active?: boolean
          last_scanned_at?: string | null
          location_id: string
          merchant_id: string
          rotated_at?: string | null
          scan_count?: number
          table_label: string
          token: string
          token_version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          floor_plan_object_id?: string
          id?: string
          is_active?: boolean
          last_scanned_at?: string | null
          location_id?: string
          merchant_id?: string
          rotated_at?: string | null
          scan_count?: number
          table_label?: string
          token?: string
          token_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "table_qr_codes_floor_plan_object_id_fkey"
            columns: ["floor_plan_object_id"]
            isOneToOne: false
            referencedRelation: "floor_plan_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_qr_codes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_qr_codes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_qr_codes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "table_qr_codes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_qr_codes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_session_events: {
        Row: {
          event_data: Json | null
          event_type: Database["public"]["Enums"]["session_event_type"]
          id: string
          minutes_since_previous: number | null
          notes: string | null
          occurred_at: string | null
          session_id: string
          triggered_by_staff_id: string | null
          triggered_by_system: boolean | null
          triggered_by_user_id: string | null
        }
        Insert: {
          event_data?: Json | null
          event_type: Database["public"]["Enums"]["session_event_type"]
          id?: string
          minutes_since_previous?: number | null
          notes?: string | null
          occurred_at?: string | null
          session_id: string
          triggered_by_staff_id?: string | null
          triggered_by_system?: boolean | null
          triggered_by_user_id?: string | null
        }
        Update: {
          event_data?: Json | null
          event_type?: Database["public"]["Enums"]["session_event_type"]
          id?: string
          minutes_since_previous?: number | null
          notes?: string | null
          occurred_at?: string | null
          session_id?: string
          triggered_by_staff_id?: string | null
          triggered_by_system?: boolean | null
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_session_events_triggered_by_staff_id_fkey"
            columns: ["triggered_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      table_session_tables: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          seated_position: number | null
          session_id: string
          table_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          seated_position?: number | null
          session_id: string
          table_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          seated_position?: number | null
          session_id?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_session_tables_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_session_tables_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "floor_plan_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          actual_duration: number | null
          check_presented_at: string | null
          cleared_at: string | null
          closed_at: string | null
          closed_by: string | null
          course_pacing: string | null
          created_at: string | null
          current_course: number | null
          customer_id: string | null
          estimated_duration: number | null
          first_order_at: string | null
          food_served_at: string | null
          guest_name: string | null
          guest_notes: string | null
          guest_phone: string | null
          id: string
          is_active: boolean | null
          is_complaint: boolean | null
          is_vip: boolean | null
          location_id: string
          merchant_id: string
          needs_attention: boolean | null
          order_id: string | null
          paid_at: string | null
          party_size: number
          quoted_time: string | null
          reservation_id: string | null
          seated_at: string | null
          server_staff_id: string | null
          server_user_id: string | null
          session_number: string | null
          status: Database["public"]["Enums"]["table_status"]
          updated_at: string | null
          waitlist_id: string | null
          working_course: number | null
        }
        Insert: {
          actual_duration?: number | null
          check_presented_at?: string | null
          cleared_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          course_pacing?: string | null
          created_at?: string | null
          current_course?: number | null
          customer_id?: string | null
          estimated_duration?: number | null
          first_order_at?: string | null
          food_served_at?: string | null
          guest_name?: string | null
          guest_notes?: string | null
          guest_phone?: string | null
          id?: string
          is_active?: boolean | null
          is_complaint?: boolean | null
          is_vip?: boolean | null
          location_id: string
          merchant_id: string
          needs_attention?: boolean | null
          order_id?: string | null
          paid_at?: string | null
          party_size: number
          quoted_time?: string | null
          reservation_id?: string | null
          seated_at?: string | null
          server_staff_id?: string | null
          server_user_id?: string | null
          session_number?: string | null
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string | null
          waitlist_id?: string | null
          working_course?: number | null
        }
        Update: {
          actual_duration?: number | null
          check_presented_at?: string | null
          cleared_at?: string | null
          closed_at?: string | null
          closed_by?: string | null
          course_pacing?: string | null
          created_at?: string | null
          current_course?: number | null
          customer_id?: string | null
          estimated_duration?: number | null
          first_order_at?: string | null
          food_served_at?: string | null
          guest_name?: string | null
          guest_notes?: string | null
          guest_phone?: string | null
          id?: string
          is_active?: boolean | null
          is_complaint?: boolean | null
          is_vip?: boolean | null
          location_id?: string
          merchant_id?: string
          needs_attention?: boolean | null
          order_id?: string | null
          paid_at?: string | null
          party_size?: number
          quoted_time?: string | null
          reservation_id?: string | null
          seated_at?: string | null
          server_staff_id?: string | null
          server_user_id?: string | null
          session_number?: string | null
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string | null
          waitlist_id?: string | null
          working_course?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "table_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_server_staff_id_fkey"
            columns: ["server_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          location_id: string
          name: string
          percentage: number
          tax_category: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_id: string
          name: string
          percentage: number
          tax_category: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string
          name?: string
          percentage?: number
          tax_category?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      time_off_requests: {
        Row: {
          created_at: string | null
          employee_id: string
          end_date: string
          id: string
          merchant_id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          type: string
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          end_date: string
          id?: string
          merchant_id: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          type: string
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          merchant_id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tip_distribution_details: {
        Row: {
          cash_tips: number | null
          charged_tips: number | null
          created_at: string | null
          gross_sales: number | null
          hours_worked: number | null
          id: string
          individual_tips_earned: number | null
          manual_adjustment: number | null
          net_tips: number | null
          role_code: string
          session_id: string
          staff_name: string | null
          staff_profile_id: string
          tip_out_clipped: number
          tip_out_given: number | null
          tip_out_received: number | null
          tip_pool_contributed: number | null
          tip_pool_received: number | null
          updated_at: string | null
        }
        Insert: {
          cash_tips?: number | null
          charged_tips?: number | null
          created_at?: string | null
          gross_sales?: number | null
          hours_worked?: number | null
          id?: string
          individual_tips_earned?: number | null
          manual_adjustment?: number | null
          net_tips?: number | null
          role_code: string
          session_id: string
          staff_name?: string | null
          staff_profile_id: string
          tip_out_clipped?: number
          tip_out_given?: number | null
          tip_out_received?: number | null
          tip_pool_contributed?: number | null
          tip_pool_received?: number | null
          updated_at?: string | null
        }
        Update: {
          cash_tips?: number | null
          charged_tips?: number | null
          created_at?: string | null
          gross_sales?: number | null
          hours_worked?: number | null
          id?: string
          individual_tips_earned?: number | null
          manual_adjustment?: number | null
          net_tips?: number | null
          role_code?: string
          session_id?: string
          staff_name?: string | null
          staff_profile_id?: string
          tip_out_clipped?: number
          tip_out_given?: number | null
          tip_out_received?: number | null
          tip_pool_contributed?: number | null
          tip_pool_received?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tip_distribution_details_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "tip_distribution_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_distribution_details_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tip_distribution_sessions: {
        Row: {
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          calculated_at: string | null
          calculated_by: string | null
          config_snapshot: Json | null
          created_at: string | null
          data_cutoff_at: string | null
          data_start_after: string | null
          id: string
          location_id: string
          merchant_id: string
          reconciliation_acknowledged_at: string | null
          rounding_adjustment: number | null
          sequence_number: number
          session_date: string
          shift_period: string | null
          status: string | null
          total_distributed: number | null
          total_tip_outs: number | null
          total_tips_collected: number | null
          total_tips_pooled: number | null
          updated_at: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          calculated_at?: string | null
          calculated_by?: string | null
          config_snapshot?: Json | null
          created_at?: string | null
          data_cutoff_at?: string | null
          data_start_after?: string | null
          id?: string
          location_id: string
          merchant_id: string
          reconciliation_acknowledged_at?: string | null
          rounding_adjustment?: number | null
          sequence_number?: number
          session_date: string
          shift_period?: string | null
          status?: string | null
          total_distributed?: number | null
          total_tip_outs?: number | null
          total_tips_collected?: number | null
          total_tips_pooled?: number | null
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          calculated_at?: string | null
          calculated_by?: string | null
          config_snapshot?: Json | null
          created_at?: string | null
          data_cutoff_at?: string | null
          data_start_after?: string | null
          id?: string
          location_id?: string
          merchant_id?: string
          reconciliation_acknowledged_at?: string | null
          rounding_adjustment?: number | null
          sequence_number?: number
          session_date?: string
          shift_period?: string | null
          status?: string | null
          total_distributed?: number | null
          total_tip_outs?: number | null
          total_tips_collected?: number | null
          total_tips_pooled?: number | null
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tip_distribution_sessions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_distribution_sessions_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_distribution_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_distribution_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_distribution_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "tip_distribution_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_distribution_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_distribution_sessions_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tip_out_rules: {
        Row: {
          created_at: string | null
          effective_date: string | null
          end_date: string | null
          from_role_code: string
          id: string
          is_active: boolean | null
          location_id: string
          merchant_id: string
          tip_out_type: string
          tip_out_value: number
          to_role_code: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          effective_date?: string | null
          end_date?: string | null
          from_role_code: string
          id?: string
          is_active?: boolean | null
          location_id: string
          merchant_id: string
          tip_out_type: string
          tip_out_value: number
          to_role_code: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          effective_date?: string | null
          end_date?: string | null
          from_role_code?: string
          id?: string
          is_active?: boolean | null
          location_id?: string
          merchant_id?: string
          tip_out_type?: string
          tip_out_value?: number
          to_role_code?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tip_out_rules_from_role_code_fkey"
            columns: ["from_role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tip_out_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_out_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_out_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "tip_out_rules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_out_rules_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_out_rules_to_role_code_fkey"
            columns: ["to_role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      tip_payroll_exports: {
        Row: {
          created_at: string
          destination: string
          error_message: string | null
          exported_at: string
          exported_by: string | null
          external_reference: string | null
          id: string
          location_id: string
          merchant_id: string
          payload: Json | null
          response: Json | null
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination: string
          error_message?: string | null
          exported_at?: string
          exported_by?: string | null
          external_reference?: string | null
          id?: string
          location_id: string
          merchant_id: string
          payload?: Json | null
          response?: Json | null
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination?: string
          error_message?: string | null
          exported_at?: string
          exported_by?: string | null
          external_reference?: string | null
          id?: string
          location_id?: string
          merchant_id?: string
          payload?: Json | null
          response?: Json | null
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tip_payroll_exports_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_payroll_exports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_payroll_exports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_payroll_exports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "tip_payroll_exports_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_payroll_exports_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_payroll_exports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "tip_distribution_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      tip_pool_configs: {
        Row: {
          contributing_role_codes: string[]
          created_at: string | null
          created_by: string | null
          description: string | null
          distribution_method: string
          effective_date: string | null
          end_date: string | null
          id: string
          is_active: boolean | null
          location_id: string
          merchant_id: string
          name: string
          policy_interval: string
          priority: number
          source_percentage: number | null
          tip_source: string
          updated_at: string | null
        }
        Insert: {
          contributing_role_codes?: string[]
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          distribution_method?: string
          effective_date?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          location_id: string
          merchant_id: string
          name: string
          policy_interval?: string
          priority?: number
          source_percentage?: number | null
          tip_source?: string
          updated_at?: string | null
        }
        Update: {
          contributing_role_codes?: string[]
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          distribution_method?: string
          effective_date?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string
          merchant_id?: string
          name?: string
          policy_interval?: string
          priority?: number
          source_percentage?: number | null
          tip_source?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tip_pool_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_pool_configs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_pool_configs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_pool_configs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "tip_pool_configs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tip_pool_configs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      tip_pool_role_shares: {
        Row: {
          created_at: string | null
          id: string
          is_eligible: boolean | null
          points_per_hour: number | null
          role_code: string
          share_percentage: number | null
          tip_pool_config_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_eligible?: boolean | null
          points_per_hour?: number | null
          role_code: string
          share_percentage?: number | null
          tip_pool_config_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_eligible?: boolean | null
          points_per_hour?: number | null
          role_code?: string
          share_percentage?: number | null
          tip_pool_config_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tip_pool_role_shares_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "tip_pool_role_shares_tip_pool_config_id_fkey"
            columns: ["tip_pool_config_id"]
            isOneToOne: false
            referencedRelation: "tip_pool_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_conversions: {
        Row: {
          conversion_factor: number
          created_at: string
          from_unit: string
          id: string
          inventory_item_id: string | null
          merchant_id: string
          to_unit: string
          updated_at: string
        }
        Insert: {
          conversion_factor: number
          created_at?: string
          from_unit: string
          id?: string
          inventory_item_id?: string | null
          merchant_id: string
          to_unit: string
          updated_at?: string
        }
        Update: {
          conversion_factor?: number
          created_at?: string
          from_unit?: string
          id?: string
          inventory_item_id?: string | null
          merchant_id?: string
          to_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_conversions_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role_code: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_code: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          public_metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          public_metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          public_metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      vendor_items: {
        Row: {
          created_at: string | null
          default_cost: number | null
          id: string
          inventory_item_id: string
          is_preferred: boolean | null
          pack_size: string | null
          updated_at: string | null
          vendor_id: string
          vendor_sku: string | null
        }
        Insert: {
          created_at?: string | null
          default_cost?: number | null
          id?: string
          inventory_item_id: string
          is_preferred?: boolean | null
          pack_size?: string | null
          updated_at?: string | null
          vendor_id: string
          vendor_sku?: string | null
        }
        Update: {
          created_at?: string | null
          default_cost?: number | null
          id?: string
          inventory_item_id?: string
          is_preferred?: boolean | null
          pack_size?: string | null
          updated_at?: string | null
          vendor_id?: string
          vendor_sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          location_id: string | null
          merchant_id: string
          name: string
          payment_terms: string | null
          phone: string | null
          state: string | null
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          merchant_id: string
          name: string
          payment_terms?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          merchant_id?: string
          name?: string
          payment_terms?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "vendors_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          actual_wait_minutes: number | null
          arrived_at: string | null
          cancelled_at: string | null
          created_at: string | null
          created_by_staff_id: string | null
          customer_id: string | null
          email: string | null
          estimated_ready_at: string | null
          expired_at: string | null
          id: string
          last_notification_type: string | null
          location_id: string
          merchant_id: string
          notes: string | null
          notification_count: number | null
          notification_failures: number | null
          notified_at: string | null
          party_name: string
          party_size: number
          phone: string | null
          position_in_queue: number | null
          preferred_section: string | null
          quoted_wait_minutes: number | null
          seated_at: string | null
          seated_session_id: string | null
          seating_preference: string | null
          status: Database["public"]["Enums"]["waitlist_status"]
        }
        Insert: {
          actual_wait_minutes?: number | null
          arrived_at?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          customer_id?: string | null
          email?: string | null
          estimated_ready_at?: string | null
          expired_at?: string | null
          id?: string
          last_notification_type?: string | null
          location_id: string
          merchant_id: string
          notes?: string | null
          notification_count?: number | null
          notification_failures?: number | null
          notified_at?: string | null
          party_name: string
          party_size: number
          phone?: string | null
          position_in_queue?: number | null
          preferred_section?: string | null
          quoted_wait_minutes?: number | null
          seated_at?: string | null
          seated_session_id?: string | null
          seating_preference?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
        }
        Update: {
          actual_wait_minutes?: number | null
          arrived_at?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          created_by_staff_id?: string | null
          customer_id?: string | null
          email?: string | null
          estimated_ready_at?: string | null
          expired_at?: string | null
          id?: string
          last_notification_type?: string | null
          location_id?: string
          merchant_id?: string
          notes?: string | null
          notification_count?: number | null
          notification_failures?: number | null
          notified_at?: string | null
          party_name?: string
          party_size?: number
          phone?: string | null
          position_in_queue?: number | null
          preferred_section?: string | null
          quoted_wait_minutes?: number | null
          seated_at?: string | null
          seated_session_id?: string | null
          seating_preference?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "waitlist_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_seated_session_id_fkey"
            columns: ["seated_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_sms_rate_limit: {
        Row: {
          id: number
          merchant_id: string
          sent_at: string
        }
        Insert: {
          id?: number
          merchant_id: string
          sent_at?: string
        }
        Update: {
          id?: number
          merchant_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_sms_rate_limit_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_sms_rate_limit_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_logs: {
        Row: {
          created_at: string
          estimated_cost: number | null
          id: string
          inventory_item_id: string
          location_id: string
          logged_by_name: string | null
          logged_by_user_id: string | null
          merchant_id: string
          notes: string | null
          quantity: number
          reason: string
          waste_date: string
        }
        Insert: {
          created_at?: string
          estimated_cost?: number | null
          id?: string
          inventory_item_id: string
          location_id: string
          logged_by_name?: string | null
          logged_by_user_id?: string | null
          merchant_id: string
          notes?: string | null
          quantity: number
          reason: string
          waste_date?: string
        }
        Update: {
          created_at?: string
          estimated_cost?: number | null
          id?: string
          inventory_item_id?: string
          location_id?: string
          logged_by_name?: string | null
          logged_by_user_id?: string | null
          merchant_id?: string
          notes?: string | null
          quantity?: number
          reason?: string
          waste_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_logs_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "waste_logs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_dead_letter_queue: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string | null
          id: string
          max_retries: number
          next_retry_at: string | null
          raw_payload: Json
          resolved_at: string | null
          retry_count: number
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          raw_payload: Json
          resolved_at?: string | null
          retry_count?: number
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          raw_payload?: Json
          resolved_at?: string | null
          retry_count?: number
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      active_customers: {
        Row: {
          address: string | null
          allergy_notes: string | null
          anniversary: string | null
          avg_spend: number | null
          avg_tip_percent: number | null
          birthday: string | null
          company_name: string | null
          created_at: string | null
          dietary_preferences: string[] | null
          email: string | null
          email_opt_in: boolean | null
          email_opt_in_at: string | null
          id: string | null
          is_active: boolean | null
          last_order_date: string | null
          last_visit: string | null
          lifetime_spend: number | null
          marketing_unsubscribed_at: string | null
          merchant_id: string | null
          name: string | null
          notes: string | null
          phone: string | null
          preferred_language: string | null
          preferred_seating: string | null
          preferred_server_id: string | null
          preferred_table: string | null
          receipt_via_email: boolean | null
          receipt_via_sms: boolean | null
          sms_opt_in: boolean | null
          sms_opt_in_at: string | null
          tags: string[] | null
          total_orders: number | null
          updated_at: string | null
          vip_level: string | null
          visits: number | null
        }
        Insert: {
          address?: string | null
          allergy_notes?: string | null
          anniversary?: string | null
          avg_spend?: number | null
          avg_tip_percent?: number | null
          birthday?: string | null
          company_name?: string | null
          created_at?: string | null
          dietary_preferences?: string[] | null
          email?: string | null
          email_opt_in?: boolean | null
          email_opt_in_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_order_date?: string | null
          last_visit?: string | null
          lifetime_spend?: number | null
          marketing_unsubscribed_at?: string | null
          merchant_id?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: string | null
          preferred_seating?: string | null
          preferred_server_id?: string | null
          preferred_table?: string | null
          receipt_via_email?: boolean | null
          receipt_via_sms?: boolean | null
          sms_opt_in?: boolean | null
          sms_opt_in_at?: string | null
          tags?: string[] | null
          total_orders?: number | null
          updated_at?: string | null
          vip_level?: string | null
          visits?: number | null
        }
        Update: {
          address?: string | null
          allergy_notes?: string | null
          anniversary?: string | null
          avg_spend?: number | null
          avg_tip_percent?: number | null
          birthday?: string | null
          company_name?: string | null
          created_at?: string | null
          dietary_preferences?: string[] | null
          email?: string | null
          email_opt_in?: boolean | null
          email_opt_in_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_order_date?: string | null
          last_visit?: string | null
          lifetime_spend?: number | null
          marketing_unsubscribed_at?: string | null
          merchant_id?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: string | null
          preferred_seating?: string | null
          preferred_server_id?: string | null
          preferred_table?: string | null
          receipt_via_email?: boolean | null
          receipt_via_sms?: boolean | null
          sms_opt_in?: boolean | null
          sms_opt_in_at?: string | null
          tags?: string[] | null
          total_orders?: number | null
          updated_at?: string | null
          vip_level?: string | null
          visits?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_preferred_server_id_fkey"
            columns: ["preferred_server_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_device_inventory: {
        Row: {
          app_version: string | null
          catalog_id: string | null
          condition: string | null
          created_at: string | null
          device_category: string | null
          firmware_version: string | null
          id: string | null
          last_config_at: string | null
          linked_payment_terminal_id: string | null
          linked_printer_id: string | null
          linked_station_id: string | null
          location_id: string | null
          location_name: string | null
          mac_address: string | null
          manufacturer: string | null
          merchant_id: string | null
          merchant_name: string | null
          model_name: string | null
          model_sku: string | null
          monthly_fee: number | null
          monthly_fee_cents: number | null
          purchase_order_number: string | null
          purchased_at: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["device_lifecycle_status"] | null
          updated_at: string | null
          warranty_expires_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_inventory_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "device_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_linked_payment_terminal_id_fkey"
            columns: ["linked_payment_terminal_id"]
            isOneToOne: false
            referencedRelation: "payment_terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_linked_printer_id_fkey"
            columns: ["linked_printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_linked_station_id_fkey"
            columns: ["linked_station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "device_inventory_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_inventory_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_device_summary: {
        Row: {
          device_category: string | null
          device_count: number | null
          manufacturer: string | null
          model_name: string | null
          status: Database["public"]["Enums"]["device_lifecycle_status"] | null
        }
        Relationships: []
      }
      admin_merchant_summary: {
        Row: {
          active_locations: number | null
          active_staff_count: number | null
          clerk_org_id: string | null
          created_at: string | null
          derived_status: string | null
          id: string | null
          last_order_at: string | null
          logo_url: string | null
          name: string | null
          orders_today: number | null
          public_metadata: Json | null
          revenue_today: number | null
          total_locations: number | null
          type: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchants_clerk_org_id_fkey"
            columns: ["clerk_org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profile_summary: {
        Row: {
          address: string | null
          allergy_notes: string | null
          anniversary: string | null
          birthday: string | null
          company_name: string | null
          created_at: string | null
          dietary_preferences: string[] | null
          email: string | null
          email_opt_in: boolean | null
          id: string | null
          merchant_id: string | null
          name: string | null
          notes_count: number | null
          phone: string | null
          preferred_language: string | null
          preferred_seating: string | null
          preferred_server_id: string | null
          preferred_table: string | null
          receipt_via_email: boolean | null
          receipt_via_sms: boolean | null
          sms_opt_in: boolean | null
          tags: string[] | null
          updated_at: string | null
          vip_level: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_preferred_server_id_fkey"
            columns: ["preferred_server_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      location_summary: {
        Row: {
          active_staff_count: number | null
          city: string | null
          code: string | null
          created_at: string | null
          id: string | null
          is_accepting_orders: boolean | null
          is_active: boolean | null
          manager_count: number | null
          merchant_id: string | null
          name: string | null
          state: string | null
          timezone: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      pci_safe_order_payments: {
        Row: {
          amount: number | null
          amount_tendered: number | null
          approved_at: string | null
          auth_code: string | null
          authorization_code: string | null
          authorized_at: string | null
          batch_number: string | null
          captured_at: string | null
          card_last_four: string | null
          card_type: string | null
          cash_discount_applied: boolean | null
          change_given: number | null
          covers_items: string[] | null
          dejavoo_batch_number: string | null
          dejavoo_response_code: string | null
          dejavoo_response_message: string | null
          dejavoo_transaction_type: string | null
          device_id: string | null
          discount_portion: number | null
          dvpaylite_application_type: string | null
          entry_mode: string | null
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          gateway_fee: number | null
          id: string | null
          initiated_at: string | null
          is_cash_priced: boolean | null
          is_returned: boolean | null
          is_settled: boolean | null
          is_voided: boolean | null
          location_id: string | null
          merchant_id: string | null
          order_id: string | null
          original_amount: number | null
          original_tip_amount: number | null
          parent_payment_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          processed_by_staff_id: string | null
          processed_by_user_id: string | null
          processor_name: string | null
          reference_number: string | null
          refund_reason: string | null
          refunded_amount: number | null
          refunded_at: string | null
          refunded_by: string | null
          result_code: string | null
          result_message: string | null
          retry_count: number | null
          return_amount: number | null
          return_auth_code: string | null
          return_number: string | null
          return_reason: string | null
          return_reference_id: string | null
          return_rrn: string | null
          returned_at: string | null
          returned_by: string | null
          rrn: string | null
          settled_at: string | null
          split_count: number | null
          split_index: number | null
          split_portion_index: number | null
          split_total: number | null
          status: Database["public"]["Enums"]["payment_status"] | null
          subtotal_portion: number | null
          tax_portion: number | null
          terminal_id: string | null
          terminal_type: Database["public"]["Enums"]["terminal_type"] | null
          tip_adjusted_at: string | null
          tip_adjusted_by: string | null
          tip_amount: number | null
          total_amount: number | null
          transaction_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number | null
          amount_tendered?: number | null
          approved_at?: string | null
          auth_code?: string | null
          authorization_code?: string | null
          authorized_at?: string | null
          batch_number?: string | null
          captured_at?: string | null
          card_last_four?: string | null
          card_type?: string | null
          cash_discount_applied?: boolean | null
          change_given?: number | null
          covers_items?: string[] | null
          dejavoo_batch_number?: string | null
          dejavoo_response_code?: string | null
          dejavoo_response_message?: string | null
          dejavoo_transaction_type?: string | null
          device_id?: string | null
          discount_portion?: number | null
          dvpaylite_application_type?: string | null
          entry_mode?: never
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          gateway_fee?: number | null
          id?: string | null
          initiated_at?: string | null
          is_cash_priced?: boolean | null
          is_returned?: boolean | null
          is_settled?: boolean | null
          is_voided?: boolean | null
          location_id?: string | null
          merchant_id?: string | null
          order_id?: string | null
          original_amount?: number | null
          original_tip_amount?: number | null
          parent_payment_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          processed_by_staff_id?: string | null
          processed_by_user_id?: string | null
          processor_name?: string | null
          reference_number?: string | null
          refund_reason?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          result_code?: string | null
          result_message?: string | null
          retry_count?: number | null
          return_amount?: number | null
          return_auth_code?: string | null
          return_number?: string | null
          return_reason?: string | null
          return_reference_id?: string | null
          return_rrn?: string | null
          returned_at?: string | null
          returned_by?: string | null
          rrn?: string | null
          settled_at?: string | null
          split_count?: number | null
          split_index?: number | null
          split_portion_index?: number | null
          split_total?: number | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          subtotal_portion?: number | null
          tax_portion?: number | null
          terminal_id?: string | null
          terminal_type?: Database["public"]["Enums"]["terminal_type"] | null
          tip_adjusted_at?: string | null
          tip_adjusted_by?: string | null
          tip_amount?: number | null
          total_amount?: number | null
          transaction_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number | null
          amount_tendered?: number | null
          approved_at?: string | null
          auth_code?: string | null
          authorization_code?: string | null
          authorized_at?: string | null
          batch_number?: string | null
          captured_at?: string | null
          card_last_four?: string | null
          card_type?: string | null
          cash_discount_applied?: boolean | null
          change_given?: number | null
          covers_items?: string[] | null
          dejavoo_batch_number?: string | null
          dejavoo_response_code?: string | null
          dejavoo_response_message?: string | null
          dejavoo_transaction_type?: string | null
          device_id?: string | null
          discount_portion?: number | null
          dvpaylite_application_type?: string | null
          entry_mode?: never
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          gateway_fee?: number | null
          id?: string | null
          initiated_at?: string | null
          is_cash_priced?: boolean | null
          is_returned?: boolean | null
          is_settled?: boolean | null
          is_voided?: boolean | null
          location_id?: string | null
          merchant_id?: string | null
          order_id?: string | null
          original_amount?: number | null
          original_tip_amount?: number | null
          parent_payment_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          processed_by_staff_id?: string | null
          processed_by_user_id?: string | null
          processor_name?: string | null
          reference_number?: string | null
          refund_reason?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          refunded_by?: string | null
          result_code?: string | null
          result_message?: string | null
          retry_count?: number | null
          return_amount?: number | null
          return_auth_code?: string | null
          return_number?: string | null
          return_reason?: string | null
          return_reference_id?: string | null
          return_rrn?: string | null
          returned_at?: string | null
          returned_by?: string | null
          rrn?: string | null
          settled_at?: string | null
          split_count?: number | null
          split_index?: number | null
          split_portion_index?: number | null
          split_total?: number | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          subtotal_portion?: number | null
          tax_portion?: number | null
          terminal_id?: string | null
          terminal_type?: Database["public"]["Enums"]["terminal_type"] | null
          tip_adjusted_at?: string | null
          tip_adjusted_by?: string | null
          tip_amount?: number | null
          total_amount?: number | null
          transaction_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "order_payments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_parent_payment_id_fkey"
            columns: ["parent_payment_id"]
            isOneToOne: false
            referencedRelation: "order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_parent_payment_id_fkey"
            columns: ["parent_payment_id"]
            isOneToOne: false
            referencedRelation: "pci_safe_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_parent_payment_id_fkey"
            columns: ["parent_payment_id"]
            isOneToOne: false
            referencedRelation: "vw_platform_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_processed_by_staff_id_fkey"
            columns: ["processed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_processed_by_user_id_fkey"
            columns: ["processed_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_refunded_by_fkey"
            columns: ["refunded_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_returned_by_fkey"
            columns: ["returned_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_tip_adjusted_by_fkey"
            columns: ["tip_adjusted_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payments_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_guest_alerts_safe_v1: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_key: string | null
          alert_type: string | null
          created_at: string | null
          floor_plan_object_id: string | null
          id: string | null
          location_id: string | null
          merchant_id: string | null
          online_order_session_id: string | null
          order_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          table_label: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_key?: string | null
          alert_type?: string | null
          created_at?: string | null
          floor_plan_object_id?: string | null
          id?: string | null
          location_id?: string | null
          merchant_id?: string | null
          online_order_session_id?: string | null
          order_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          table_label?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_key?: string | null
          alert_type?: string | null
          created_at?: string | null
          floor_plan_object_id?: string | null
          id?: string | null
          location_id?: string | null
          merchant_id?: string | null
          online_order_session_id?: string | null
          order_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          table_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_guest_alerts_floor_plan_object_id_fkey"
            columns: ["floor_plan_object_id"]
            isOneToOne: false
            referencedRelation: "floor_plan_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_guest_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_guest_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_guest_alerts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "qr_guest_alerts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_guest_alerts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_online_order_sessions_safe_v1: {
        Row: {
          created_at: string | null
          customer_id: string | null
          delivery_zone_id: string | null
          expires_at: string | null
          floor_plan_object_id: string | null
          id: string | null
          is_authenticated: boolean | null
          loyalty_points_balance: number | null
          loyalty_points_to_apply: number | null
          order_id: string | null
          order_type: string | null
          requested_time: string | null
          store_config_id: string | null
          table_label: string | null
          table_qr_code_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          delivery_zone_id?: string | null
          expires_at?: string | null
          floor_plan_object_id?: string | null
          id?: string | null
          is_authenticated?: boolean | null
          loyalty_points_balance?: number | null
          loyalty_points_to_apply?: number | null
          order_id?: string | null
          order_type?: string | null
          requested_time?: string | null
          store_config_id?: string | null
          table_label?: string | null
          table_qr_code_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          delivery_zone_id?: string | null
          expires_at?: string | null
          floor_plan_object_id?: string | null
          id?: string | null
          is_authenticated?: boolean | null
          loyalty_points_balance?: number | null
          loyalty_points_to_apply?: number | null
          order_id?: string | null
          order_type?: string | null
          requested_time?: string | null
          store_config_id?: string | null
          table_label?: string | null
          table_qr_code_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "online_order_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "active_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profile_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_floor_plan_object_id_fkey"
            columns: ["floor_plan_object_id"]
            isOneToOne: false
            referencedRelation: "floor_plan_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_store_config_id_fkey"
            columns: ["store_config_id"]
            isOneToOne: false
            referencedRelation: "online_store_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_order_sessions_table_qr_code_id_fkey"
            columns: ["table_qr_code_id"]
            isOneToOne: false
            referencedRelation: "table_qr_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_scan_events_safe_v1: {
        Row: {
          floor_plan_object_id: string | null
          id: string | null
          location_id: string | null
          merchant_id: string | null
          occurred_at: string | null
          online_order_session_id: string | null
          order_id: string | null
          stage: string | null
          table_qr_code_id: string | null
        }
        Insert: {
          floor_plan_object_id?: string | null
          id?: string | null
          location_id?: string | null
          merchant_id?: string | null
          occurred_at?: string | null
          online_order_session_id?: string | null
          order_id?: string | null
          stage?: string | null
          table_qr_code_id?: string | null
        }
        Update: {
          floor_plan_object_id?: string | null
          id?: string | null
          location_id?: string | null
          merchant_id?: string | null
          occurred_at?: string | null
          online_order_session_id?: string | null
          order_id?: string | null
          stage?: string | null
          table_qr_code_id?: string | null
        }
        Relationships: []
      }
      v_cash_drawer_summary: {
        Row: {
          business_date: string | null
          cash_transactions: number | null
          location_id: string | null
          net_cash_in_drawer: number | null
          total_cash_received: number | null
          total_cash_tips: number | null
          total_change_given: number | null
          total_tendered: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      v_eod_cash_summary: {
        Row: {
          business_date: string | null
          cash_drawer_id: string | null
          closed_by: string | null
          closing_amount: number | null
          drawer_name: string | null
          expected_cash: number | null
          location_id: string | null
          no_sale_count: number | null
          opened_by: string | null
          opening_amount: number | null
          total_cash_drops: number | null
          total_cash_refunds: number | null
          total_cash_sales: number | null
          total_pay_ins: number | null
          total_pay_outs: number | null
          variance: number | null
          variance_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_drawer_sessions_cash_drawer_id_fkey"
            columns: ["cash_drawer_id"]
            isOneToOne: false
            referencedRelation: "cash_drawers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
        ]
      }
      v_location_menu_items: {
        Row: {
          allergens: string[] | null
          base_cash_price: number | null
          base_delivery_price: number | null
          base_price: number | null
          card_bg_color: string | null
          description: string | null
          display_order: number | null
          effective_available: boolean | null
          effective_cash_price: number | null
          effective_delivery_price: number | null
          effective_price: number | null
          effective_stock_mode: string | null
          has_location_override: boolean | null
          image: string | null
          item_name: string | null
          location_available: boolean | null
          location_cash_price: number | null
          location_delivery_price: number | null
          location_id: string | null
          location_name: string | null
          location_price: number | null
          location_stock_mode: string | null
          meal_types: string[] | null
          menu_available: boolean | null
          menu_cash_price: number | null
          menu_id: string | null
          menu_item_id: string | null
          menu_item_menu_id: string | null
          menu_name: string | null
          menu_price: number | null
          merchant_id: string | null
          use_delivery_price: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "menus_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_platform_transactions: {
        Row: {
          amount: number | null
          authorization_code: string | null
          card_last_four: string | null
          card_type: string | null
          created_at: string | null
          customer_name: string | null
          id: string | null
          location_id: string | null
          location_name: string | null
          merchant_id: string | null
          merchant_name: string | null
          order_id: string | null
          order_number: string | null
          order_status: Database["public"]["Enums"]["order_status"] | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          reference_number: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          tip_amount: number | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_location_menu_items"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "admin_merchant_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _assert_order_station_match: {
        Args: { p_order_id: string; p_station_id: string }
        Returns: undefined
      }
      _check_session_not_locked: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      _clover_should_overwrite: {
        Args: {
          p_last_commit_at: string
          p_policy: string
          p_row_updated_at: string
          p_source_system: string
        }
        Returns: boolean
      }
      _distribute_weighted_with_remainder: {
        Args: {
          p_filter_sql: string
          p_session_id: string
          p_target_column: string
          p_total: number
          p_weight_expr: string
        }
        Returns: undefined
      }
      _distribute_with_remainder: {
        Args: {
          p_filter_sql: string
          p_session_id: string
          p_target_column: string
          p_total: number
        }
        Returns: undefined
      }
      _idempotency_claim: {
        Args: { p_key: string; p_op: string }
        Returns: Json
      }
      _idempotency_complete: {
        Args: { p_key: string; p_op: string; p_result: Json }
        Returns: undefined
      }
      _inventory_value_at: {
        Args: { p_at: string; p_location_id: string; p_merchant_id: string }
        Returns: number
      }
      accept_online_order: { Args: { p_order_id: string }; Returns: Json }
      acknowledge_kds_item_void: {
        Args: { p_kds_display_id: string; p_order_item_id: string }
        Returns: Json
      }
      acknowledge_kds_notice: {
        Args: { p_kds_display_id?: string; p_order_item_id: string }
        Returns: Json
      }
      auto_clock_out_stale_shifts: {
        Args: { p_location_id?: string | null; p_now?: string }
        Returns: Json
      }
      activate_nmi_payment_device: {
        Args: {
          p_device_id: string
          p_provider_gateway_id: string
          p_provider_merchant_id: string
          p_public_key: string
          p_security_key: string
          p_webhook_secret?: string
        }
        Returns: string
      }
      add_category_to_menu: {
        Args: {
          p_category_id: string
          p_custom_title?: string
          p_display_order?: number
          p_menu_id: string
        }
        Returns: Json
      }
      add_floor_plan_object: {
        Args: {
          p_capacity?: number
          p_category: Database["public"]["Enums"]["floor_object_category"]
          p_floor_plan_id: string
          p_height?: number
          p_name: string
          p_rotation?: number
          p_shape_id: string
          p_width?: number
          p_x?: number
          p_y?: number
        }
        Returns: Json
      }
      add_item_to_category: {
        Args: {
          p_category_id: string
          p_custom_price?: number
          p_display_order?: number
          p_is_featured?: boolean
          p_menu_item_id: string
        }
        Returns: Json
      }
      add_open_item_v2: {
        Args: {
          p_is_tax_exempt?: boolean
          p_item_name: string
          p_order_id: string
          p_quantity?: number
          p_seat_number?: number
          p_special_instructions?: string
          p_unit_price: number
        }
        Returns: Json
      }
      add_open_item_v2_dep: {
        Args: {
          p_is_tax_exempt?: boolean
          p_item_name: string
          p_order_id: string
          p_quantity?: number
          p_special_instructions?: string
          p_unit_price: number
        }
        Returns: Json
      }
      add_open_item_v3: {
        Args: {
          p_idempotency_key?: string
          p_is_tax_exempt?: boolean
          p_item_name: string
          p_order_id: string
          p_quantity?: number
          p_seat_number?: number
          p_special_instructions?: string
          p_station_id?: string
          p_unit_price: number
        }
        Returns: Json
      }
      add_order_item: {
        Args: {
          p_cash_price?: number
          p_category_name?: string
          p_course_number?: number
          p_item_description?: string
          p_item_name: string
          p_location_exclusive_item_id?: string
          p_menu_item_id?: string
          p_modifiers?: Json
          p_order_id: string
          p_prep_station?: string
          p_quantity?: number
          p_selected_size_id?: string
          p_selected_size_name?: string
          p_size_price_modifier?: number
          p_special_instructions?: string
          p_unit_price: number
          p_use_cash_price?: boolean
        }
        Returns: Json
      }
      add_order_item_modifier: {
        Args: {
          p_modifier_group_id: string
          p_modifier_group_name: string
          p_modifier_item_id: string
          p_modifier_name: string
          p_order_item_id: string
          p_price_modifier: number
          p_quantity?: number
        }
        Returns: Json
      }
      add_order_item_modifier_v2: {
        Args: {
          p_idempotency_key?: string
          p_modifier_group_id: string
          p_modifier_group_name: string
          p_modifier_item_id: string
          p_modifier_name: string
          p_order_item_id: string
          p_price_modifier: number
          p_quantity?: number
          p_station_id?: string
        }
        Returns: Json
      }
      add_order_item_v2: {
        Args: {
          p_cash_unit_price?: number
          p_category_id?: string
          p_category_name?: string
          p_course_number?: number
          p_item_name?: string
          p_location_exclusive_item_id?: string
          p_menu_id?: string
          p_menu_item_id?: string
          p_menu_name?: string
          p_modifiers?: Json
          p_order_id: string
          p_quantity?: number
          p_seat_number?: number
          p_selected_size_id?: string
          p_selected_size_name?: string
          p_size_price_modifier?: number
          p_special_instructions?: string
          p_unit_price?: number
        }
        Returns: Json
      }
      add_order_item_v2_dep: {
        Args: {
          p_cash_unit_price?: number
          p_category_name?: string
          p_course_number?: number
          p_item_name: string
          p_location_exclusive_item_id?: string
          p_menu_item_id?: string
          p_modifiers?: Json
          p_order_id: string
          p_quantity?: number
          p_selected_size_id?: string
          p_selected_size_name?: string
          p_size_price_modifier?: number
          p_special_instructions?: string
          p_unit_price: number
        }
        Returns: Json
      }
      add_order_item_v3:
        | {
            Args: {
              p_cash_unit_price?: number
              p_category_id?: string
              p_category_name?: string
              p_course_number?: number
              p_idempotency_key?: string
              p_item_name?: string
              p_location_exclusive_item_id?: string
              p_menu_id?: string
              p_menu_item_id?: string
              p_menu_name?: string
              p_modifiers?: Json
              p_order_id: string
              p_quantity?: number
              p_seat_number?: number
              p_selected_size_id?: string
              p_selected_size_name?: string
              p_size_price_modifier?: number
              p_special_instructions?: string
              p_station_id?: string
              p_unit_price?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_cash_unit_price?: number
              p_category_name: string
              p_course_number?: number
              p_item_name: string
              p_location_exclusive_item_id: string
              p_menu_item_id: string
              p_modifiers?: Json
              p_order_id: string
              p_quantity: number
              p_selected_size_id?: string
              p_selected_size_name?: string
              p_size_price_modifier?: number
              p_special_instructions?: string
              p_unit_price: number
            }
            Returns: Json
          }
      add_order_item_with_course: {
        Args: {
          p_cash_price?: number
          p_category_name?: string
          p_course_number?: number
          p_item_description?: string
          p_item_name: string
          p_location_exclusive_item_id?: string
          p_menu_item_id?: string
          p_modifiers?: Json
          p_order_id: string
          p_prep_station?: string
          p_quantity?: number
          p_selected_size_id?: string
          p_selected_size_name?: string
          p_size_price_modifier?: number
          p_special_instructions?: string
          p_unit_price: number
          p_use_cash_price?: boolean
        }
        Returns: Json
      }
      add_order_items_batch: {
        Args: { p_items: Json; p_order_id: string }
        Returns: Json
      }
      add_ticket_message: {
        Args: {
          p_is_internal?: boolean
          p_message: string
          p_sender_id: string
          p_sender_name: string
          p_sender_role: string
          p_ticket_id: string
        }
        Returns: Json
      }
      add_ticket_message_with_attachments: {
        Args: {
          p_attachments?: Json
          p_is_internal?: boolean
          p_message: string
          p_sender_id: string
          p_sender_name: string
          p_sender_role: string
          p_ticket_id: string
        }
        Returns: Json
      }
      add_to_waitlist: {
        Args: {
          p_email?: string
          p_location_id: string
          p_notes?: string
          p_party_name: string
          p_party_size: number
          p_phone?: string
          p_preferred_section?: string
          p_quoted_wait_minutes?: number
          p_seating_preference?: string
        }
        Returns: Json
      }
      adjust_tips: {
        Args: { p_adjustments: Json; p_order_id: string; p_staff_id?: string }
        Returns: Json
      }
      adjust_tips_v2: {
        Args: { p_adjustments: Json; p_order_id: string; p_staff_id?: string }
        Returns: Json
      }
      admin_bulk_reset_pins: {
        Args: { p_location_id?: string; p_merchant_id: string }
        Returns: {
          new_pin: string
          staff_name: string
          staff_profile_id: string
        }[]
      }
      admin_get_unified_staff_view: {
        Args: { p_location_id?: string; p_merchant_id: string }
        Returns: {
          account_type: string
          avatar_url: string
          clerk_user_id: string
          display_name: string
          email: string
          first_name: string
          is_clerk_user: boolean
          last_name: string
          last_updated_at: string
          location_assignments: Json
          member_created_at: string
          member_id: string
          overall_is_active: boolean
          phone: string
          primary_location_id: string
          primary_location_name: string
          staff_profile_id: string
          total_locations: number
          user_id: string
        }[]
      }
      admin_reset_staff_pin: {
        Args: {
          p_custom_pin?: string
          p_location_id: string
          p_staff_profile_id: string
        }
        Returns: {
          error_message: string
          new_pin: string
          success: boolean
        }[]
      }
      admin_toggle_staff_status: {
        Args: {
          p_location_id: string
          p_new_status: boolean
          p_staff_profile_id: string
        }
        Returns: {
          error_message: string
          staff_name: string
          success: boolean
        }[]
      }
      advance_course:
        | {
            Args: {
              p_fire_course?: boolean
              p_notes?: string
              p_session_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_fire_course?: boolean
              p_notes?: string
              p_session_id: string
              p_staff_id?: string
            }
            Returns: Json
          }
      app_set_location_price: {
        Args: {
          p_inventory_item_id: string
          p_location_id: string
          p_price: number
          p_vendor_id: string
        }
        Returns: undefined
      }
      app_set_location_stock: {
        Args: {
          p_inventory_item_id: string
          p_location_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      app_upsert_inventory_item: {
        Args: {
          p_category: string
          p_cost: number
          p_is_global?: boolean
          p_item_id: string
          p_location_id: string
          p_name: string
          p_sku: string
          p_unit_type: string
        }
        Returns: Json
      }
      app_upsert_vendor: {
        Args: {
          p_email: string
          p_location_id: string
          p_name: string
          p_phone: string
          p_vendor_id: string
        }
        Returns: Json
      }
      apply_order_discount_to_item: {
        Args: { p_order_id: string; p_order_item_id: string }
        Returns: undefined
      }
      apply_refund_to_payment:
        | {
            Args: {
              p_initiated_by?: string
              p_payment_id: string
              p_refund_amount: number
              p_return_auth_code?: string
              p_return_number?: string
              p_return_reason?: string
              p_return_reference_id?: string
              p_return_rrn?: string
              p_reversal_type: Database["public"]["Enums"]["reversal_type"]
            }
            Returns: undefined
          }
        | {
            Args: {
              p_initiated_by?: string
              p_payment_id: string
              p_refund_amount: number
              p_restore_paid_quantity?: boolean
              p_return_auth_code?: string
              p_return_number?: string
              p_return_reason?: string
              p_return_reference_id?: string
              p_return_rrn?: string
              p_reversal_type: Database["public"]["Enums"]["reversal_type"]
            }
            Returns: undefined
          }
      apply_refund_to_payment_v2: {
        Args: {
          p_idempotency_key?: string
          p_initiated_by?: string
          p_payment_id: string
          p_refund_amount: number
          p_restore_paid_quantity?: boolean
          p_return_auth_code?: string
          p_return_number?: string
          p_return_reason?: string
          p_return_reference_id?: string
          p_return_rrn?: string
          p_reversal_type: Database["public"]["Enums"]["reversal_type"]
          p_station_id?: string
        }
        Returns: undefined
      }
      apply_refund_to_payment_v3: {
        Args: {
          p_idempotency_key?: string
          p_initiated_by?: string
          p_payment_id: string
          p_refund_amount: number
          p_restore_paid_quantity?: boolean
          p_return_auth_code?: string
          p_return_number?: string
          p_return_reason?: string
          p_return_reference_id?: string
          p_return_rrn?: string
          p_reversal_type: Database["public"]["Enums"]["reversal_type"]
          p_station_id?: string
          p_tip_refund_amount?: number
        }
        Returns: undefined
      }
      apply_refund_to_payment_v4: {
        Args: {
          p_idempotency_key?: string
          p_initiated_by?: string
          p_payment_id: string
          p_refund_amount: number
          p_restore_paid_quantity?: boolean
          p_return_auth_code?: string
          p_return_number?: string
          p_return_reason?: string
          p_return_reference_id?: string
          p_return_rrn?: string
          p_reversal_type: Database["public"]["Enums"]["reversal_type"]
          p_station_id?: string
          p_tip_refund_amount?: number
        }
        Returns: undefined
      }
      apply_service_charge_v1: {
        Args: {
          p_idempotency_key?: string
          p_order_id: string
          p_party_size?: number
          p_station_id?: string
        }
        Returns: Json
      }
      approve_shift_swap: {
        Args: { p_manager_id: string; p_request_id: string }
        Returns: boolean
      }
      approve_tip_distribution: {
        Args: { p_approved_by: string; p_session_id: string }
        Returns: Json
      }
      archive_location: { Args: { p_location_id: string }; Returns: Json }
      assert_pci_safe_exports: { Args: never; Returns: undefined }
      assign_device: {
        Args: {
          p_device_id: string
          p_new_status: Database["public"]["Enums"]["device_lifecycle_status"]
          p_notes?: string
          p_reason?: string
          p_to_location_id?: string
          p_to_merchant_id?: string
          p_tracking_number?: string
        }
        Returns: Json
      }
      assign_reservation_tables: {
        Args: { p_reservation_id: string; p_table_ids: string[] }
        Returns: Json
      }
      authorize_location_access: {
        Args: { p_location_id: string }
        Returns: undefined
      }
      authorize_merchant_access: {
        Args: { p_merchant_id: string }
        Returns: undefined
      }
      broadcast_qr_guest_alert_event: {
        Args: { p_event: string; p_location_id: string; p_payload: Json }
        Returns: undefined
      }
      bulk_adjust_menu_item_delivery_prices: {
        Args: {
          p_actor_user_id: string
          p_item_ids: string[]
          p_location_id: string
          p_merchant_id: string
          p_operation: string
          p_rounding: string
          p_value: number
        }
        Returns: Json
      }
      bulk_adjust_menu_item_menu_delivery_prices: {
        Args: {
          p_actor_user_id: string
          p_item_ids: string[]
          p_location_id: string
          p_menu_id: string
          p_merchant_id: string
          p_operation: string
          p_rounding: string
          p_value: number
        }
        Returns: Json
      }
      bulk_adjust_menu_item_menu_prices: {
        Args: {
          p_actor_user_id: string
          p_item_ids: string[]
          p_location_id: string
          p_menu_id: string
          p_merchant_id: string
          p_operation: string
          p_rounding: string
          p_value: number
        }
        Returns: Json
      }
      bulk_adjust_menu_item_prices: {
        Args: {
          p_actor_user_id: string
          p_item_ids: string[]
          p_location_id: string
          p_merchant_id: string
          p_operation: string
          p_rounding: string
          p_value: number
        }
        Returns: Json
      }
      bulk_update_order_item_status: {
        Args: {
          p_order_item_ids: string[]
          p_staff_id?: string
          p_status: string
        }
        Returns: Json
      }
      bulk_update_order_item_status_v2: {
        Args: {
          p_expected_sync_version?: number
          p_idempotency_key?: string
          p_order_item_ids: string[]
          p_staff_id?: string
          p_status: string
        }
        Returns: Json
      }
      calculate_billable_service_amounts: {
        Args: {
          p_billing_method?: string
          p_quantity: number
          p_service_id: string
        }
        Returns: {
          additional_unit_price: number
          base_price_monthly: number
          card_surcharge: number
          card_surcharge_pct: number
          display_name: string
          included_quantity: number
          pricing_model: string
          quantity: number
          service_category: string
          service_code: string
          subtotal: number
          total_amount: number
        }[]
      }
      calculate_item_totals: {
        Args: {
          p_cash_price: number
          p_discount_amount?: number
          p_quantity: number
          p_tax_rate: number
          p_unit_price: number
        }
        Returns: Json
      }
      calculate_order_dual_totals: {
        Args: { p_order_id: string }
        Returns: Json
      }
      calculate_order_tax: { Args: { p_order_id: string }; Returns: Json }
      calculate_order_totals_fast: {
        Args: { p_order_id: string }
        Returns: Json
      }
      calculate_subscription_amounts: {
        Args: {
          p_billing_method?: string
          p_plan_id: string
          p_station_count: number
        }
        Returns: {
          base_price_monthly: number
          card_surcharge: number
          card_surcharge_pct: number
          included_stations: number
          per_extra_station_price: number
          station_overage: number
          subtotal: number
          total_amount: number
        }[]
      }
      calculate_tip_distribution: {
        Args: {
          p_calculated_by?: string
          p_location_id: string
          p_merchant_id: string
          p_session_date: string
          p_shift_period?: string
        }
        Returns: Json
      }
      calculate_tip_distribution_v2: {
        Args: {
          p_calculated_by?: string
          p_location_id: string
          p_merchant_id: string
          p_session_date: string
          p_shift_period?: string
        }
        Returns: Json
      }
      can_modify_item: { Args: { p_order_item_id: string }; Returns: boolean }
      cancel_merchant_suspension: {
        Args: { p_initiated_by?: string; p_merchant_id: string }
        Returns: Json
      }
      cancel_online_order_by_customer: {
        Args: { p_order_id: string; p_reason?: string; p_session_token: string }
        Returns: Json
      }
      cancel_order: {
        Args: { p_cancel_reason?: string; p_order_id: string }
        Returns: Json
      }
      cancel_reservation_for_voided_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: Json
      }
      cancel_transfer: {
        Args: { p_transfer_id: string; p_user_id: string; p_user_name: string }
        Returns: Json
      }
      capture_preauth_v1: {
        Args: {
          p_capture_amount: number
          p_payment_id: string
          p_staff_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      capture_preauth_v3: {
        Args: {
          p_capture_amount: number
          p_payment_id: string
          p_staff_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      check_device_session_status: {
        Args: { p_device_id: string; p_session_id: string }
        Returns: Json
      }
      check_merchant_access: {
        Args: { required_permission?: string; target_merchant_id: string }
        Returns: boolean
      }
      check_recent_payment: {
        Args: {
          p_amount_cents?: number
          p_lookback_seconds?: number
          p_order_id: string
          p_split_portion_index?: number
        }
        Returns: Json
      }
      check_recent_refund: {
        Args: {
          p_amount_cents?: number
          p_idempotency_key?: string
          p_lookback_seconds?: number
          p_order_id: string
        }
        Returns: Json
      }
      check_table_availability: {
        Args: {
          p_date: string
          p_duration_minutes?: number
          p_location_id: string
          p_party_size: number
          p_time: string
        }
        Returns: Json
      }
      claim_order_v1: {
        Args: {
          p_expected_station_id?: string
          p_order_id: string
          p_station_id: string
        }
        Returns: Json
      }
      claim_station:
        | {
            Args: {
              p_device_id: string
              p_device_model?: string
              p_device_name?: string
              p_force_takeover?: boolean
              p_staff_name?: string
              p_staff_profile_id?: string
              p_station_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_device_id: string
              p_device_name?: string
              p_force_takeover?: boolean
              p_staff_name?: string
              p_staff_profile_id?: string
              p_station_id: string
            }
            Returns: Json
          }
      claim_waitlist_sms_slot: {
        Args: { p_max_per_hour?: number; p_merchant_id: string }
        Returns: Json
      }
      cleanup_old_order_sequences: {
        Args: { p_keep_days?: number }
        Returns: number
      }
      cleanup_phone_verifications: { Args: never; Returns: number }
      cleanup_qr_pii_data: {
        Args: {
          p_contact_retention_days?: number
          p_network_signal_retention_days?: number
          p_rate_limit_retention_days?: number
          p_resolved_alert_message_retention_days?: number
          p_scan_event_retention_days?: number
        }
        Returns: Json
      }
      clear_order_item_instructions: {
        Args: { p_order_item_id: string }
        Returns: Json
      }
      clear_order_items: { Args: { p_order_id: string }; Returns: Json }
      close_cash_drawer_session: {
        Args: {
          p_cash_drawer_id: string
          p_closed_by: string
          p_closing_amount: number
          p_closing_count_details?: Json
          p_is_blind_count?: boolean
          p_session_id: string
          p_variance_notes?: string
        }
        Returns: Json
      }
      close_check: {
        Args: { p_order_id: string; p_staff_id?: string }
        Returns: Json
      }
      compute_merchant_menu_fingerprint: {
        Args: { p_merchant_id: string }
        Returns: string
      }
      copy_schedule_shifts: {
        Args: {
          p_include_employees?: boolean
          p_source_schedule_id: string
          p_target_schedule_id: string
        }
        Returns: undefined
      }
      create_adhoc_expense: {
        Args: {
          p_card_last_four: string
          p_expense_category: string
          p_expense_notes: string
          p_expense_vendor_name: string
          p_items: Json
          p_location_id: string
          p_merchant_id: string
          p_payment_method: string
          p_total_amount: number
          p_user_id: string
          p_user_name: string
        }
        Returns: Json
      }
      create_floor_plan: {
        Args: {
          p_canvas_height?: number
          p_canvas_width?: number
          p_description?: string
          p_is_default?: boolean
          p_location_id: string
          p_name: string
        }
        Returns: Json
      }
      create_inventory_count: {
        Args: {
          p_assigned_to_name?: string
          p_assigned_to_user_id?: string
          p_count_name: string
          p_item_ids?: Json
          p_location_id: string
          p_merchant_id: string
        }
        Returns: Json
      }
      create_next_course: { Args: { p_order_id: string }; Returns: Json }
      create_nmi_payment_device: {
        Args: {
          p_device_label?: string
          p_environment?: string
          p_location_id: string
          p_use_for_online_ordering?: boolean
        }
        Returns: string
      }
      create_order: {
        Args: {
          p_created_by_staff_id?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_device_id?: string
          p_location_id: string
          p_merchant_id: string
          p_order_type?: Database["public"]["Enums"]["order_type"]
          p_special_instructions?: string
          p_table_number?: string
        }
        Returns: Json
      }
      create_order_v2: {
        Args: {
          p_created_by_staff_id: string
          p_customer_name: string
          p_customer_phone: string
          p_device_id: string
          p_location_id: string
          p_merchant_id: string
          p_order_type: Database["public"]["Enums"]["order_type"]
          p_special_instructions: string
          p_station_id?: string
          p_table_number: string
        }
        Returns: Json
      }
      create_order_v3: {
        Args: {
          p_created_by_staff_id: string
          p_customer_name: string
          p_customer_phone: string
          p_device_id: string
          p_idempotency_key?: string
          p_location_id: string
          p_merchant_id: string
          p_order_type: Database["public"]["Enums"]["order_type"]
          p_special_instructions: string
          p_station_id?: string
          p_table_number: string
        }
        Returns: Json
      }
      create_reservation: {
        Args: {
          p_assigned_table_ids?: string[]
          p_duration_minutes?: number
          p_email?: string
          p_is_vip?: boolean
          p_location_id: string
          p_notes?: string
          p_party_name: string
          p_party_size: number
          p_phone: string
          p_preferred_section?: string
          p_reservation_date: string
          p_reservation_time: string
          p_seating_preference?: string
          p_source?: string
          p_special_requests?: string
        }
        Returns: Json
      }
      create_reversal: {
        Args: {
          p_amount: number
          p_approved_by: string
          p_initiated_by: string
          p_original_payment_id: string
          p_original_psp_reference: string
          p_reason_code: Database["public"]["Enums"]["refund_reason_type"]
          p_reason_description: string
          p_reversal_reference_id: string
          p_reversal_type: Database["public"]["Enums"]["reversal_type"]
        }
        Returns: {
          amount: number
          approved_by: string | null
          completed_at: string | null
          emv_data: Json | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          initiated_by: string | null
          location_id: string
          merchant_id: string
          original_payment_id: string
          original_psp_reference: string | null
          processed_at: string | null
          raw_response: Json | null
          reason_code: string | null
          reason_description: string | null
          requested_at: string
          response_message: string | null
          result_code: string | null
          reversal_psp_reference: string | null
          reversal_reference_id: string
          reversal_type: string
          status: string
          terminal_response: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "reversals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_reversal_v2: {
        Args: {
          p_amount: number
          p_approved_by: string
          p_idempotency_key?: string
          p_initiated_by: string
          p_original_payment_id: string
          p_original_psp_reference: string
          p_reason_code: Database["public"]["Enums"]["refund_reason_type"]
          p_reason_description: string
          p_reversal_reference_id: string
          p_reversal_type: Database["public"]["Enums"]["reversal_type"]
        }
        Returns: {
          amount: number
          approved_by: string | null
          completed_at: string | null
          emv_data: Json | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          initiated_by: string | null
          location_id: string
          merchant_id: string
          original_payment_id: string
          original_psp_reference: string | null
          processed_at: string | null
          raw_response: Json | null
          reason_code: string | null
          reason_description: string | null
          requested_at: string
          response_message: string | null
          result_code: string | null
          reversal_psp_reference: string | null
          reversal_reference_id: string
          reversal_type: string
          status: string
          terminal_response: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "reversals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_support_ticket:
        | {
            Args: {
              p_carrier_id?: string
              p_category: string
              p_description: string
              p_location_id: string
              p_merchant_id: string
              p_metadata?: Json
              p_subject: string
              p_submitted_by: string
              p_submitted_by_email?: string
              p_submitted_by_name: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_attachments?: Json
              p_carrier_id?: string
              p_category: string
              p_description: string
              p_location_id: string
              p_merchant_id: string
              p_metadata?: Json
              p_subject: string
              p_submitted_by: string
              p_submitted_by_email?: string
              p_submitted_by_name: string
            }
            Returns: Json
          }
      current_user_id: { Args: never; Returns: string }
      current_user_org_ids: { Args: never; Returns: string[] }
      debug_pin_test: {
        Args: { p_location_id: string; p_pin_code: string }
        Returns: {
          generated_hash: string
          is_match: boolean
          staff_name: string
          stored_hash: string
        }[]
      }
      declare_cash_tips_for_shift: {
        Args: { p_amount: number; p_shift_id: string }
        Returns: Json
      }
      decline_online_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: Json
      }
      decrement_location_stock: {
        Args: {
          p_inventory_item_id: string
          p_location_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      detect_schedule_conflicts: {
        Args: {
          p_end_date: string
          p_exclude_schedule_id?: string
          p_location_id: string
          p_merchant_id: string
          p_start_date: string
        }
        Returns: Json
      }
      duplicate_menu_to_location: {
        Args: {
          p_copy_current_prices?: boolean
          p_new_menu_name?: string
          p_source_menu_id: string
          p_target_location_id: string
        }
        Returns: Json
      }
      duplicate_order_item: {
        Args: { p_order_item_id: string; p_quantity?: number }
        Returns: Json
      }
      duplicate_order_item_v2: {
        Args: {
          p_idempotency_key?: string
          p_order_item_id: string
          p_quantity?: number
          p_station_id?: string
        }
        Returns: Json
      }
      end_impersonation_session: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: undefined
      }
      end_station_session: { Args: { p_session_id: string }; Returns: Json }
      ensure_course_exists: {
        Args: { p_course_number: number; p_order_id: string }
        Returns: string
      }
      estimate_wait_time: {
        Args: { p_location_id: string; p_party_size: number }
        Returns: number
      }
      export_tip_distribution: {
        Args: {
          p_destination: string
          p_exported_by: string
          p_session_id: string
        }
        Returns: Json
      }
      finalize_castles_settlement: {
        Args: {
          p_batch_uuid: string
          p_castles_response: Json
          p_merchant_id: string
        }
        Returns: Json
      }
      find_duplicate_customers: {
        Args: { p_merchant_id: string }
        Returns: {
          customers: Json
          reason: string
        }[]
      }
      fire_course:
        | {
            Args: {
              p_course_number: number
              p_notes?: string
              p_order_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_course_number: number
              p_notes?: string
              p_order_id: string
              p_staff_id?: string
            }
            Returns: Json
          }
      generate_invoice_number: {
        Args: { p_merchant_id: string }
        Returns: string
      }
      generate_order_number: {
        Args: { p_location_id: string; p_station_id?: string }
        Returns: string
      }
      generate_order_number_internal: {
        Args: { p_location_id: string; p_merchant_id: string }
        Returns: string
      }
      generate_po_number: { Args: never; Returns: string }
      generate_subscription_invoice: {
        Args: { p_due_date?: string; p_subscription_id: string }
        Returns: string
      }
      generate_subscription_invoice_number: {
        Args: { p_for_date?: string }
        Returns: string
      }
      generate_subscription_invoice_snapshot: {
        Args: { p_due_date?: string; p_subscription_id: string }
        Returns: string
      }
      generate_table_qr_code: {
        Args: { p_floor_plan_object_id: string; p_regenerate?: boolean }
        Returns: Json
      }
      get_active_cfd_images: {
        Args: { target_location_id: string }
        Returns: {
          image_url: string
        }[]
      }
      get_active_orders_v1: {
        Args: {
          p_business_day_start?: string
          p_limit?: number
          p_location_id: string
          p_station_id?: string
        }
        Returns: Json[]
      }
      get_active_organization_count: {
        Args: { p_days: number }
        Returns: number
      }
      get_active_station_count: {
        Args: { p_location_id: string }
        Returns: number
      }
      get_admin_merchant_breakdown: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_location_ids?: string[]
          p_merchant_ids?: string[]
          p_payment_status?: string[]
        }
        Returns: {
          active_locations: number
          avg_ticket: number
          card_revenue: number
          cash_discount_count: number
          cash_revenue: number
          daily_revenue_trend: Json
          last_transaction_at: string
          merchant_id: string
          merchant_name: string
          order_count: number
          payment_method_breakdown: Json
          prior_total_revenue: number
          refund_count: number
          revenue_change_pct: number
          tip_total: number
          total_fees: number
          total_locations: number
          total_revenue: number
          transaction_count: number
          unsettled_amount: number
          void_count: number
          void_rate_pct: number
          void_refund_amount: number
        }[]
      }
      get_admin_merchant_ids: { Args: never; Returns: string[] }
      get_admin_settlement_batch_payments: {
        Args: { p_batch_id: string; p_merchant_id?: string }
        Returns: {
          captured_at: string
          initiated_at: string
          is_returned: boolean
          is_voided: boolean
          location_id: string
          location_name: string
          merchant_id: string
          merchant_name: string
          order_id: string
          order_number: string
          payment_id: string
          payment_method: string
          payment_status: string
          refund_amount: number
          tip_amount: number
          total_amount: number
        }[]
      }
      get_admin_settlement_batches: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_merchant_ids?: string[]
          p_status?: string[]
        }
        Returns: {
          acquirer: string
          batch_id: string
          batch_number: string
          business_date: string
          closed_at: string
          discrepancy_amount: number
          funded_date: string
          gross_amount: number
          has_discrepancy: boolean
          id: string
          linked_payment_amount: number
          linked_payment_count: number
          location_id: string
          location_name: string
          merchant_id: string
          merchant_name: string
          net_deposit: number
          opened_at: string
          refund_amount: number
          refund_count: number
          sales_count: number
          settlement_date: string
          status: string
          tip_amount: number
          transaction_count: number
          void_count: number
        }[]
      }
      get_admin_transaction_detail: {
        Args: { p_order_id: string }
        Returns: Json
      }
      get_admin_transaction_summary: {
        Args: {
          p_card_type?: string
          p_date_from?: string
          p_date_to?: string
          p_location_ids?: string[]
          p_max_amount?: number
          p_merchant_ids?: string[]
          p_min_amount?: number
          p_payment_method?: string[]
          p_payment_status?: string[]
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_staff_id?: string
          p_status?: string[]
        }
        Returns: {
          current_avg_tip: number
          current_avg_tip_pct: number
          current_card_count: number
          current_card_revenue: number
          current_cash_count: number
          current_cash_revenue: number
          current_period_from: string
          current_period_to: string
          current_total_revenue: number
          current_total_transactions: number
          current_void_rate_pct: number
          current_void_return_amount: number
          current_void_return_count: number
          previous_avg_tip: number
          previous_avg_tip_pct: number
          previous_card_count: number
          previous_card_revenue: number
          previous_cash_count: number
          previous_cash_revenue: number
          previous_period_from: string
          previous_period_to: string
          previous_total_revenue: number
          previous_total_transactions: number
          previous_void_rate_pct: number
          previous_void_return_amount: number
          previous_void_return_count: number
        }[]
      }
      get_admin_transactions: {
        Args: {
          p_card_type?: string
          p_date_from?: string
          p_date_to?: string
          p_location_ids?: string[]
          p_max_amount?: number
          p_merchant_ids?: string[]
          p_min_amount?: number
          p_page?: number
          p_page_size?: number
          p_payment_method?: string[]
          p_payment_status?: string[]
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_staff_id?: string
          p_status?: string[]
        }
        Returns: {
          amount: number
          authorization_code: string
          card_last_four: string
          card_type: string
          created_at: string
          customer_name: string
          discount_amount: number
          display_number: string
          entry_mode: string
          id: string
          location_id: string
          location_name: string
          merchant_id: string
          merchant_name: string
          order_id: string
          order_number: string
          order_status: string
          payment_method: string
          payment_status: string
          reference_number: string
          staff_id: string
          staff_name: string
          status: string
          subtotal_amount: number
          tax_amount: number
          tip_amount: number
          total_amount: number
          total_count: number
        }[]
      }
      get_admin_transactions_export: {
        Args: {
          p_card_type?: string
          p_date_from?: string
          p_date_to?: string
          p_limit?: number
          p_location_ids?: string[]
          p_max_amount?: number
          p_merchant_ids?: string[]
          p_min_amount?: number
          p_payment_method?: string[]
          p_payment_status?: string[]
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_staff_id?: string
          p_status?: string[]
        }
        Returns: {
          amount_tendered: number
          authorization_code: string
          batch_number: string
          card_last_four: string
          card_type: string
          change_given: number
          created_at: string
          customer_name: string
          device_id: string
          discount_amount: number
          display_number: string
          entry_mode: string
          is_returned: boolean
          is_voided: boolean
          location_id: string
          location_name: string
          merchant_id: string
          merchant_name: string
          order_id: string
          order_number: string
          order_status: string
          order_type: string
          payment_id: string
          payment_method: string
          payment_status: string
          reference_number: string
          return_amount: number
          return_reason: string
          service_charge_amount: number
          staff_name: string
          subtotal_amount: number
          tax_amount: number
          terminal_serial: string
          tip_amount: number
          total_amount: number
          total_count: number
          void_reason: string
        }[]
      }
      get_aggregate_stock: {
        Args: { p_inventory_item_id: string }
        Returns: Json
      }
      get_avg_kitchen_time: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_minutes: number
          date: string
          overall_avg: number
        }[]
      }
      get_avg_table_turn_time: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_minutes: number
          date: string
          overall_avg: number
        }[]
      }
      get_avg_ticket_by_day: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_ticket: number
          date: string
        }[]
      }
      get_avg_time_to_first_order: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_days: number
        }[]
      }
      get_batch_payments_v1: {
        Args: { p_settlement_batch_id: string }
        Returns: Json
      }
      get_batch_payments_v2: {
        Args: { p_settlement_batch_id: string }
        Returns: Json
      }
      get_batch_summary_v1: {
        Args: { p_settlement_batch_id: string }
        Returns: Json
      }
      get_batches_with_live_totals_v1: {
        Args: { p_business_day: string; p_location_id: string }
        Returns: Json
      }
      get_busiest_locations: {
        Args: { p_from: string; p_to: string }
        Returns: {
          location_id: string
          location_name: string
          merchant_name: string
          order_count: number
        }[]
      }
      get_business_day_activity_summary_v1: {
        Args: {
          p_business_date?: string
          p_location_id: string
          p_terminal_id?: string
        }
        Returns: Json
      }
      get_business_day_bounds: {
        Args: {
          p_end_date?: string
          p_location_id: string
          p_start_date?: string
        }
        Returns: {
          end_ts: string
          start_ts: string
        }[]
      }
      get_business_day_summary_v1: {
        Args: { p_business_date?: string; p_location_id: string }
        Returns: Json
      }
      get_cash_flow_report: {
        Args: {
          p_end_date: string
          p_location_id: string
          p_merchant_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_cash_vs_card_split: {
        Args: { p_from: string; p_to: string }
        Returns: {
          order_count: number
          pricing_mode: string
          revenue: number
        }[]
      }
      get_categories_for_location: {
        Args: { p_location_id?: string; p_merchant_id: string }
        Returns: Json
      }
      get_chargeback_volume_by_month: {
        Args: { p_from: string; p_to: string }
        Returns: {
          chargeback_count: number
          month: string
          total_amount: number
        }[]
      }
      get_churn_risk_merchants: {
        Args: { p_from: string; p_to: string }
        Returns: {
          change_pct: number
          current_revenue: number
          last_period_revenue: number
          merchant_id: string
          merchant_name: string
        }[]
      }
      get_cogs_report: {
        Args: {
          p_end_date: string
          p_location_id: string
          p_merchant_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_course_status: {
        Args: { p_course_number: number; p_order_id: string }
        Returns: Json
      }
      get_customer_activity_timeline: {
        Args: { p_customer_id: string; p_limit?: number }
        Returns: {
          activity_id: string
          activity_label: string
          activity_type: string
          amount_value: number
          created_at: string
          currency: string
          description: string
          is_clickable: boolean
          related_entity_id: string
          related_entity_type: string
        }[]
      }
      get_customer_channel_trend: {
        Args: { p_customer_id: string; p_days?: number }
        Returns: {
          channel: string
          count_previous: number
          count_recent: number
          percentage_previous: number
          percentage_recent: number
          trend_label: string
        }[]
      }
      get_customer_most_ordered_items: {
        Args: { p_customer_id: string; p_limit?: number }
        Returns: {
          item_id: string
          item_name: string
          order_count: number
          total_quantity: number
        }[]
      }
      get_customer_order_channels: {
        Args: { p_customer_id: string }
        Returns: {
          channel: string
          order_count: number
          percentage: number
        }[]
      }
      get_customer_percentile: {
        Args: { p_customer_id: string; p_merchant_id: string }
        Returns: {
          is_top_tier: boolean
          percentile: number
          rank_position: number
          total_customers: number
        }[]
      }
      get_customer_profile: { Args: { p_customer_id: string }; Returns: Json }
      get_customer_spend_trend: {
        Args: { p_customer_id: string; p_months?: number }
        Returns: {
          month: string
          month_date: string
          order_count: number
          total_spend: number
        }[]
      }
      get_customer_top_items: {
        Args: { p_customer_id: string; p_days?: number; p_limit?: number }
        Returns: {
          frequency_label: string
          is_new_favorite: boolean
          item_id: string
          item_name: string
          last_ordered_at: string
          order_count: number
          total_spent: number
        }[]
      }
      get_customer_visit_pattern: {
        Args: { p_customer_id: string; p_days?: number }
        Returns: {
          day_of_week: string
          hour_of_day: number
          is_peak: boolean
          visit_count: number
        }[]
      }
      get_customer_visit_trend: {
        Args: {
          p_compare_days?: number
          p_customer_id: string
          p_recent_days?: number
        }
        Returns: {
          previous_visits: number
          recent_visits: number
          trend_direction: string
          trend_percentage: number
        }[]
      }
      get_device_active_session:
        | {
            Args: { p_device_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.get_device_active_session(p_device_id => text), public.get_device_active_session(p_device_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_device_id: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.get_device_active_session(p_device_id => text), public.get_device_active_session(p_device_id => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      get_discrepancy_report: {
        Args: { p_purchase_order_id: string }
        Returns: {
          inventory_item_id: string
          item_id: string
          item_name: string
          item_sku: string
          item_unit_type: string
          quantity_ordered: number
          quantity_received: number
          status: string
          unit_cost: number
        }[]
      }
      get_dual_pricing_adoption: {
        Args: { p_from: string; p_to: string }
        Returns: {
          adopted_merchants: number
          adoption_pct: number
          total_merchants: number
        }[]
      }
      get_effective_item_cost: {
        Args: {
          p_inventory_item_id: string
          p_location_id: string
          p_vendor_id?: string
        }
        Returns: number
      }
      get_effective_price: {
        Args: {
          p_category_id?: string
          p_item_id: string
          p_location_id?: string
          p_menu_id?: string
        }
        Returns: Json
      }
      get_effective_pricing: {
        Args: { p_location_id: string }
        Returns: {
          dual_pricing_percentage: number
          pricing_strategy: string
          source: string
        }[]
      }
      get_effective_reorder_threshold: {
        Args: { p_inventory_item_id: string; p_location_id: string }
        Returns: number
      }
      get_eligible_promotions: {
        Args: {
          p_customer_id: string
          p_location_id?: string
          p_merchant_id: string
          p_order_items?: Json
          p_order_total?: number
        }
        Returns: Json
      }
      get_eod_cash_summary: {
        Args: { p_business_date?: string; p_location_id: string }
        Returns: Json
      }
      get_feature_adoption_rates: {
        Args: { p_from: string; p_to: string }
        Returns: {
          adopted_count: number
          adoption_pct: number
          feature: string
          total_merchants: number
        }[]
      }
      get_financial_kpis: {
        Args: {
          p_end_date: string
          p_location_id: string
          p_merchant_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_floor_plan: { Args: { p_floor_plan_id: string }; Returns: Json }
      get_floor_plan_objects_with_sessions: {
        Args: { p_floor_plan_id: string }
        Returns: {
          capacity: number
          category: string
          color_override: string
          created_at: string
          current_course: number
          default_turn_time: number
          floor_plan_id: string
          guest_name: string
          height: number
          id: string
          is_active: boolean
          is_combinable: boolean
          is_reservable: boolean
          is_vip: boolean
          is_visible: boolean
          label_override: string
          location_id: string
          merchant_id: string
          merged_tables: string[]
          min_capacity: number
          name: string
          needs_attention: boolean
          order_id: string
          party_size: number
          reservation_id: string
          rotation: number
          seated_at: string
          section_id: string
          server_staff_id: string
          session_id: string
          session_number: string
          session_status: string
          shape_id: string
          updated_at: string
          waitlist_id: string
          width: number
          x: number
          y: number
          z_index: number
          zone_name: string
        }[]
      }
      get_floor_plan_status: {
        Args: { p_floor_plan_id: string }
        Returns: Json
      }
      get_food_cost_analysis: {
        Args: {
          p_end_date: string
          p_location_id: string
          p_merchant_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_effective_pos_config: {
        Args: { p_station_id: string }
        Returns: Json
      }
      get_items_for_location: {
        Args: { p_location_id?: string; p_merchant_id: string }
        Returns: Json
      }
      get_items_for_location_library: {
        Args: { p_location_id?: string; p_merchant_id: string }
        Returns: Json
      }
      get_kds_tickets: {
        Args: { p_location_id: string; p_statuses?: string[] }
        Returns: Json
      }
      get_kds_tickets_v2: {
        Args: {
          p_kds_display_id?: string
          p_location_id: string
          p_statuses?: string[]
        }
        Returns: Json
      }
      get_kitchen_performance_stats: {
        Args: {
          p_end_date?: string
          p_location_id?: string
          p_merchant_id: string
          p_start_date?: string
        }
        Returns: Json
      }
      get_location_floor_plans: {
        Args: { p_location_id: string }
        Returns: Json
      }
      get_location_item_price: {
        Args: {
          p_is_cash?: boolean
          p_location_id: string
          p_menu_item_id: string
        }
        Returns: number
      }
      get_location_payment_device_secret: {
        Args: { p_device_id?: string; p_location_id: string }
        Returns: {
          decrypted_secret: string
          device_id: string
          tpn: string
        }[]
      }
      get_location_role: { Args: { p_location_id: string }; Returns: string }
      get_location_stations_with_status: {
        Args: { p_location_id: string }
        Returns: Json
      }
      get_location_table_status_v2: {
        Args: { p_location_id: string }
        Returns: {
          current_course: number
          first_order_at: string
          food_served_at: string
          guest_name: string
          guest_phone: string
          is_vip: boolean
          needs_attention: boolean
          order_id: string
          party_size: number
          reservation_id: string
          seated_at: string
          section_id: string
          server_staff_id: string
          session_id: string
          session_number: string
          session_status: string
          table_capacity: number
          table_category: string
          table_id: string
          table_name: string
          waitlist_id: string
        }[]
      }
      get_menu_for_location: {
        Args: { p_location_id?: string; p_menu_id: string }
        Returns: Json
      }
      get_menu_item_details: {
        Args: { p_item_id: string; p_location_id?: string }
        Returns: Json
      }
      get_menu_with_categories: {
        Args: { p_location_id?: string; p_menu_id: string }
        Returns: Json
      }
      get_merchant_acquisition: {
        Args: { p_from: string; p_to: string }
        Returns: {
          new_locations: number
          new_merchants: number
          period: string
        }[]
      }
      get_merchant_drain_status: {
        Args: { p_merchant_id: string }
        Returns: Json
      }
      get_merchant_payment_api_secret: {
        Args: { p_merchant_id: string; p_provider?: string }
        Returns: {
          credential_id: string
          decrypted_secret: string
          is_active: boolean
          merchant_id: string
          provider: string
          tokenization_key: string
        }[]
      }
      get_merchant_retention: {
        Args: { p_from: string; p_to: string }
        Returns: {
          churned: number
          new_merchants: number
          retained: number
          retention_rate: number
        }[]
      }
      get_merchant_subscription_status: {
        Args: { p_merchant_id: string }
        Returns: Json
      }
      get_my_carrier_id: { Args: never; Returns: string }
      get_my_claim: { Args: { claim: string }; Returns: string }
      get_my_hq_permissions: { Args: never; Returns: string[] }
      get_my_hq_role: {
        Args: never
        Returns: {
          level: number
          role_code: string
          role_name: string
        }[]
      }
      get_nmi_device_credentials: {
        Args: { p_device_id: string }
        Returns: {
          decrypted_security_key: string
          device_id: string
          environment: string
          location_id: string
          merchant_id: string
          provider_gateway_id: string
          provider_merchant_id: string
          provider_public_key: string
        }[]
      }
      get_onboarding_funnel: {
        Args: { p_from: string; p_to: string }
        Returns: {
          merchant_count: number
          stage: string
        }[]
      }
      get_open_batches_v1: { Args: { p_location_id: string }; Returns: Json }
      get_order_courses: { Args: { p_order_id: string }; Returns: Json }
      get_order_details: { Args: { p_order_id: string }; Returns: Json }
      get_order_flow_stats: {
        Args: {
          p_end_date?: string
          p_location_id?: string
          p_merchant_id: string
          p_start_date?: string
        }
        Returns: Json
      }
      get_order_item: { Args: { p_order_item_id: string }; Returns: Json }
      get_organization_info: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      get_payment_failure_rate_by_day: {
        Args: { p_from: string; p_to: string }
        Returns: {
          date: string
          failed_txns: number
          failure_rate_pct: number
          total_txns: number
        }[]
      }
      get_payment_method_mix: {
        Args: { p_from: string; p_to: string }
        Returns: {
          payment_method: string
          total_amount: number
          txn_count: number
        }[]
      }
      get_payment_summary_stats: {
        Args: { p_from: string; p_to: string }
        Returns: {
          overall_failure_rate: number
          total_chargeback_amount: number
          total_chargebacks: number
          total_failed: number
          total_transactions: number
        }[]
      }
      get_payment_terminal_credentials: {
        Args: { p_terminal_id: string }
        Returns: string
      }
      get_peak_hours_heatmap: {
        Args: { p_from: string; p_to: string }
        Returns: {
          day_of_week: number
          hour: number
          order_count: number
        }[]
      }
      get_platform_billing_provider_config: {
        Args: { p_provider?: string }
        Returns: {
          api_key_configured: boolean
          created_at: string
          id: string
          is_active: boolean
          label: string
          provider: string
          tokenization_key: string
          updated_at: string
        }[]
      }
      get_platform_billing_provider_secret: {
        Args: { p_provider?: string }
        Returns: {
          config_id: string
          decrypted_secret: string
          is_active: boolean
          label: string
          provider: string
          tokenization_key: string
        }[]
      }
      get_platform_fees_summary: {
        Args: {
          p_location_id?: string
          p_merchant_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      get_platform_gmv_by_day: {
        Args: { p_from: string; p_to: string }
        Returns: {
          date: string
          order_count: number
          revenue: number
        }[]
      }
      get_pos_full_sync: { Args: { p_location_id: string }; Returns: Json }
      get_pos_inventory_sync: { Args: { p_location_id: string }; Returns: Json }
      get_pto_balance: { Args: { p_employee_id: string }; Returns: number }
      get_public_receipt: {
        Args: { p_order_token: string; p_send_token?: string }
        Returns: Json
      }
      get_qr_guest_alert_open_count: {
        Args: { p_location_id: string }
        Returns: Json
      }
      get_qr_order_status: { Args: { p_session_token: string }; Returns: Json }
      get_refund_rate_by_day: {
        Args: { p_from: string; p_to: string }
        Returns: {
          date: string
          refund_rate_pct: number
        }[]
      }
      get_reservations: {
        Args: {
          p_date?: string
          p_include_cancelled?: boolean
          p_location_id: string
        }
        Returns: Json
      }
      get_revenue_by_merchant: {
        Args: { p_from: string; p_to: string }
        Returns: {
          merchant_id: string
          merchant_name: string
          revenue: number
        }[]
      }
      get_revenue_by_order_type: {
        Args: { p_from: string; p_to: string }
        Returns: {
          order_count: number
          order_type: string
          revenue: number
        }[]
      }
      get_sales_by_item_report: {
        Args: {
          p_end_date: string
          p_location_id: string
          p_merchant_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_service_timeline_breakdown: {
        Args: {
          p_end_date: string
          p_location_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_session_variance_analysis: {
        Args: { p_session_id: string }
        Returns: Json
      }
      get_staff_performance_stats: {
        Args: {
          p_end_date?: string
          p_location_id?: string
          p_merchant_id: string
          p_start_date?: string
        }
        Returns: Json
      }
      get_station_status: { Args: { p_station_id: string }; Returns: Json }
      get_storefront_payment_config: {
        Args: { p_location_id: string }
        Returns: {
          device_id: string
          environment: string
          provider: string
          provider_public_key: string
          supports_apple_pay: boolean
          supports_customer_vault: boolean
          supports_google_pay: boolean
        }[]
      }
      get_support_dashboard_stats: { Args: never; Returns: Json }
      get_table_performance_stats: {
        Args: {
          p_end_date?: string
          p_location_id?: string
          p_merchant_id: string
          p_start_date?: string
        }
        Returns: Json
      }
      get_terminal_credentials: {
        Args: { p_terminal_id: string }
        Returns: Json
      }
      get_terminal_type_distribution: {
        Args: { p_from: string; p_to: string }
        Returns: {
          terminal_count: number
          terminal_type: string
        }[]
      }
      get_tip_rate_by_day: {
        Args: { p_from: string; p_to: string }
        Returns: {
          date: string
          tip_rate_pct: number
        }[]
      }
      get_top_performing_merchants: {
        Args: { p_days: number; p_limit: number }
        Returns: {
          growth: number
          id: string
          name: string
          revenue: number
          transactions: number
        }[]
      }
      get_transaction_volume_by_day: {
        Args: { p_from: string; p_to: string }
        Returns: {
          date: string
          total_amount: number
          txn_count: number
        }[]
      }
      get_unified_staff_view: {
        Args: { p_location_id?: string; p_merchant_id: string }
        Returns: {
          account_type: string
          avatar_url: string
          clerk_user_id: string
          display_name: string
          email: string
          first_name: string
          is_clerk_user: boolean
          last_name: string
          last_updated_at: string
          location_assignments: Json
          member_created_at: string
          member_id: string
          overall_is_active: boolean
          phone: string
          primary_location_id: string
          primary_location_name: string
          staff_profile_id: string
          total_locations: number
          user_id: string
        }[]
      }
      get_unread_ticket_counts: { Args: never; Returns: Json }
      get_unsettled_summary_by_terminal: {
        Args: { p_location_id?: string; p_merchant_id: string }
        Returns: {
          castles_ip_address: string
          castles_port: number
          day_span: number
          gross_amount: number
          has_stuck_batch: boolean
          is_active: boolean
          is_connected: boolean
          newest_payment_date: string
          oldest_payment_date: string
          payment_count: number
          stuck_batch_status: string
          stuck_batch_uuid: string
          terminal_name: string
          terminal_type: string
          terminal_uuid: string
          tip_amount: number
          total_amount: number
        }[]
      }
      get_user_accessible_locations: {
        Args: { p_user_id: string }
        Returns: {
          is_primary: boolean
          location_id: string
          location_name: string
          role_code: string
          role_name: string
        }[]
      }
      get_voids_report: {
        Args: {
          p_end_date: string
          p_location_id: string
          p_merchant_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_waitlist: {
        Args: { p_include_completed?: boolean; p_location_id: string }
        Returns: Json
      }
      handle_time_clock: {
        Args: {
          p_action_type: string
          p_device_id?: string
          p_location_id: string
          p_pin_code: string
        }
        Returns: Json
      }
      handle_time_clock_v2: {
        Args: {
          p_action_type: string
          p_device_id: string
          p_location_id: string
          p_pin_code: string
          p_station_id?: string
        }
        Returns: Json
      }
      hq_can_impersonate_merchant: {
        Args: { p_merchant_id: string }
        Returns: boolean
      }
      hq_has_permission: {
        Args: { p_permission_code: string }
        Returns: boolean
      }
      import_clover_menu: {
        Args: {
          p_dry_run_id: string
          p_field_update_policy?: string
          p_flag_resolutions?: Json
          p_target: Json
        }
        Returns: Json
      }
      increment_castles_txn_counter: {
        Args: { p_terminal_id: string }
        Returns: number
      }
      increment_location_stock: {
        Args: {
          p_inventory_item_id: string
          p_location_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      increment_order_sync_version: {
        Args: { p_order_id: string }
        Returns: number
      }
      initialize_location_stock: {
        Args: { p_location_id: string }
        Returns: number
      }
      initiate_transfer: {
        Args: {
          p_from_location_id: string
          p_items: Json
          p_merchant_id: string
          p_notes: string
          p_to_location_id: string
          p_user_id: string
          p_user_name: string
        }
        Returns: Json
      }
      is_dexapos_admin: { Args: never; Returns: boolean }
      is_location_member: { Args: { p_location_id: string }; Returns: boolean }
      is_merchant_admin: { Args: { p_merchant_id: string }; Returns: boolean }
      is_merchant_admin_or_impersonating: {
        Args: { p_merchant_id: string }
        Returns: boolean
      }
      is_merchant_owner: { Args: { p_merchant_id: string }; Returns: boolean }
      issue_phone_verification_otp: {
        Args: {
          p_code: string
          p_expires_at?: string
          p_merchant_id: string
          p_phone: string
          p_request_ip?: unknown
        }
        Returns: Json
      }
      link_order_to_session: {
        Args: { p_order_id: string; p_session_id: string; p_staff_id?: string }
        Returns: Json
      }
      list_billable_services: {
        Args: never
        Returns: {
          additional_unit_price: number | null
          base_price_monthly: number
          card_surcharge_pct: number
          created_at: string
          display_name: string
          id: string
          included_quantity: number
          is_active: boolean
          metadata: Json
          pricing_model: string
          service_category: string
          service_code: string
          unit_label: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "billable_services"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_location_payment_devices: {
        Args: { p_location_id: string }
        Returns: {
          created_at: string
          device_label: string
          environment: string
          has_provider_secret: boolean
          has_webhook_secret: boolean
          id: string
          is_active: boolean
          last_synced_from_crm_at: string
          location_id: string
          merchant_id: string
          provider: string
          provider_gateway_id: string
          provider_merchant_id: string
          provider_public_key: string
          status: string
          tpn: string
          updated_at: string
          use_for_online_ordering: boolean
          whitelist_origins: string[]
          whitelist_synced_at: string
        }[]
      }
      list_merchant_payment_credentials: {
        Args: { p_merchant_id: string }
        Returns: {
          api_key_configured: boolean
          created_at: string
          id: string
          is_active: boolean
          merchant_id: string
          provider: string
          tokenization_key: string
          updated_at: string
        }[]
      }
      list_merchant_subscriptions: {
        Args: { p_merchant_id?: string }
        Returns: {
          billing_method: string
          billing_profile_id: string
          cancel_reason: string
          canceled_at: string
          created_at: string
          current_period_end: string
          current_period_start: string
          display_name: string
          id: string
          location_id: string
          location_name: string
          merchant_id: string
          metadata: Json
          monthly_amount: number
          next_billing_date: string
          plan_code: string
          plan_id: string
          station_count: number
          status: string
          trial_ends_at: string
          updated_at: string
        }[]
      }
      list_subscription_invoices: {
        Args: {
          p_limit?: number
          p_location_id?: string
          p_merchant_id?: string
        }
        Returns: {
          billing_method: string
          billing_period_end: string
          billing_period_start: string
          card_surcharge: number
          created_at: string
          due_date: string
          id: string
          invoice_number: string
          last_payment_attempt_at: string
          last_payment_error: string
          line_items: Json
          location_id: string
          location_name: string
          merchant_id: string
          metadata: Json
          nmi_response: Json
          nmi_transaction_id: string
          paid_at: string
          payment_attempt_count: number
          station_count_snapshot: number
          status: string
          subscription_id: string
          subtotal: number
          total_amount: number
          updated_at: string
        }[]
      }
      list_subscription_plans: {
        Args: never
        Returns: {
          base_price_monthly: number
          card_surcharge_pct: number
          created_at: string
          description: string | null
          display_name: string
          display_order: number
          id: string
          included_stations: number
          is_active: boolean
          max_locations: number | null
          metadata: Json
          min_locations: number | null
          monthly_price_cents: number
          per_extra_station_price: number
          plan_code: string
          plan_scope: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "subscription_plans"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_subscription_service_assignments: {
        Args: { p_subscription_id: string }
        Returns: {
          additional_unit_price: number
          base_price_monthly: number
          card_surcharge_pct: number
          created_at: string
          display_name: string
          id: string
          included_quantity: number
          is_enabled: boolean
          metadata: Json
          pricing_model: string
          quantity: number
          service_category: string
          service_code: string
          service_id: string
          subscription_id: string
          unit_label: string
          updated_at: string
        }[]
      }
      log_admin_payment_audit_event: {
        Args: {
          p_action: string
          p_error_message?: string
          p_fields_accessed?: string[]
          p_ip_address?: string
          p_location_id?: string
          p_merchant_id?: string
          p_request_path?: string
          p_resource_id?: string
          p_resource_type?: string
          p_success?: boolean
          p_user_agent?: string
        }
        Returns: undefined
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_action_category: string
          p_actor_name: string
          p_actor_role: string
          p_actor_user_id: string
          p_changes?: Json
          p_impersonation_session_id?: string
          p_impersonator_user_id?: string
          p_location_id: string
          p_merchant_id: string
          p_metadata?: Json
          p_pii_access_type?: string
          p_resource_id?: string
          p_resource_name?: string
          p_resource_type?: string
          p_severity?: string
        }
        Returns: string
      }
      log_outbound_message: {
        Args: {
          p_body: string
          p_campaign_id?: string
          p_channel?: string
          p_customer_id?: string
          p_error_code?: string
          p_from_number?: string
          p_merchant_id: string
          p_recipient_id?: string
          p_status?: string
          p_telnyx_message_id?: string
          p_to_number: string
        }
        Returns: string
      }
      log_payment_event: {
        Args: {
          p_amount?: number
          p_auth_code?: string
          p_event_type: string
          p_location_id: string
          p_new_status?: string
          p_order_id: string
          p_payment_id: string
          p_previous_status?: string
          p_psp_reference?: string
          p_raw_response?: Json
          p_reason?: string
          p_response_message?: string
          p_result_code?: string
          p_staff_id?: string
          p_terminal_id?: string
          p_tip_amount?: number
        }
        Returns: string
      }
      log_purchase_order_delivery: {
        Args: {
          p_delivered_by: string
          p_delivery_notes: string
          p_logged_by_name: string
          p_logged_by_user_id: string
          p_purchase_order_id: string
          p_received_items: Json
        }
        Returns: Json
      }
      log_purchase_order_payment:
        | {
            Args: {
              p_amount: number
              p_card_last_four: string
              p_notes: string
              p_paid_by_name: string
              p_paid_by_user_id: string
              p_paid_to: string
              p_payment_method: string
              p_purchase_order_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_amount: number
              p_card_last_four: string
              p_notes: string
              p_paid_by_name: string
              p_paid_by_user_id: string
              p_paid_to: string
              p_payment_method: string
              p_purchase_order_id: string
            }
            Returns: string
          }
      log_stock_update_with_audit: {
        Args: {
          p_inventory_item_id: string
          p_location_id: string
          p_new_stock: number
          p_update_reason: string
          p_update_source: string
          p_user_id: string
          p_user_name: string
        }
        Returns: Json
      }
      log_subscription_billing_event: {
        Args: {
          p_action: string
          p_changes?: Json
          p_error_message?: string
          p_location_id?: string
          p_merchant_id: string
          p_metadata?: Json
          p_resource_id?: string
          p_resource_name?: string
          p_resource_type?: string
          p_status?: string
        }
        Returns: undefined
      }
      log_waste: {
        Args: {
          p_inventory_item_id: string
          p_location_id: string
          p_logged_by_name: string
          p_logged_by_user_id: string
          p_merchant_id: string
          p_notes: string
          p_quantity: number
          p_reason: string
          p_waste_date?: string
        }
        Returns: Json
      }
      loyalty_earn_on_order: { Args: { p_order_id: string }; Returns: Json }
      loyalty_expire_rewards: { Args: never; Returns: undefined }
      loyalty_get_customer_status: {
        Args: { p_customer_id: string; p_merchant_id: string }
        Returns: Json
      }
      loyalty_manual_adjust: {
        Args: {
          p_adjustment_type: string
          p_amount: number
          p_enrollment_id: string
          p_reason: string
          p_staff_id: string
        }
        Returns: Json
      }
      loyalty_redeem_reward: {
        Args: { p_location_id: string; p_order_id: string; p_reward_id: string }
        Returns: Json
      }
      loyalty_void_order_earnings: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      manage_order_discount: {
        Args: {
          p_action: string
          p_applied_to_item_ids?: string[]
          p_approved_by_staff_id?: string
          p_discount_id?: string
          p_discount_name?: string
          p_discount_type?: string
          p_discount_value?: number
          p_order_discount_id?: string
          p_order_id: string
          p_reason?: string
          p_source?: string
          p_staff_id: string
          p_void_reason?: string
        }
        Returns: Json
      }
      manage_order_discount_v2: {
        Args: {
          p_action: string
          p_applied_to_item_ids?: string[]
          p_approved_by_staff_id?: string
          p_discount_id?: string
          p_discount_name?: string
          p_discount_type?: string
          p_discount_value?: number
          p_idempotency_key?: string
          p_order_discount_id?: string
          p_order_id: string
          p_reason?: string
          p_source?: string
          p_staff_id: string
          p_station_id?: string
          p_void_reason?: string
        }
        Returns: Json
      }
      manage_order_discount_v3: {
        Args: {
          p_action: string
          p_applied_to_item_ids?: string[]
          p_approved_by_staff_id?: string
          p_discount_id?: string
          p_discount_name?: string
          p_discount_type?: string
          p_discount_value?: number
          p_idempotency_key?: string
          p_order_discount_id?: string
          p_order_id: string
          p_reason?: string
          p_source?: string
          p_staff_id: string
          p_void_reason?: string
        }
        Returns: Json
      }
      manual_mark_batch_settled: {
        Args: {
          p_batch_uuid: string
          p_merchant_id: string
          p_reason: string
          p_staff_id?: string
        }
        Returns: Json
      }
      mark_course_served: {
        Args: {
          p_course_number: number
          p_order_id: string
          p_staff_id?: string
        }
        Returns: Json
      }
      mark_dlq_replay_success: { Args: { p_id: string }; Returns: undefined }
      mark_stale_stations_offline: { Args: never; Returns: number }
      merchant_open_drawer_sessions: {
        Args: { p_merchant_id: string }
        Returns: {
          cash_drawer_id: string
          id: string
          location_id: string
          opened_at: string
        }[]
      }
      merchant_open_orders: {
        Args: { p_merchant_id: string }
        Returns: {
          created_at: string
          id: string
          location_id: string
          order_number: string
          status: string
        }[]
      }
      merge_customers: {
        Args: { p_duplicate_ids: string[]; p_primary_id: string }
        Returns: Json
      }
      merge_orderout_connected_channels: {
        Args: { p_restaurant_id: string; p_updates: Json }
        Returns: undefined
      }
      merge_orderout_platform_statuses: {
        Args: { p_link_id: string; p_updates: Json }
        Returns: undefined
      }
      merge_table_to_session: {
        Args: { p_session_id: string; p_table_id: string }
        Returns: Json
      }
      migrate_menu_items_to_categories: { Args: never; Returns: Json }
      migrate_pending_to_preparing: {
        Args: { p_location_id: string }
        Returns: Json
      }
      notify_waitlist_party: {
        Args: { p_notification_type?: string; p_waitlist_id: string }
        Returns: Json
      }
      open_cash_drawer_session: {
        Args: {
          p_cash_drawer_id: string
          p_location_id: string
          p_merchant_id: string
          p_opened_by: string
          p_opening_amount: number
          p_opening_count_details?: Json
        }
        Returns: Json
      }
      override_service_charge_v1: {
        Args: {
          p_amount: number
          p_idempotency_key?: string
          p_manager_id: string
          p_order_id: string
          p_reason?: string
          p_station_id?: string
        }
        Returns: Json
      }
      override_service_charge_v3: {
        Args: {
          p_order_id: string
          p_manager_id: string
          p_mode?: string
          p_amount?: number
          p_rate?: number
          p_reason?: string
          p_idempotency_key?: string
          p_station_id?: string
        }
        Returns: Json
      }
      phone_last10: { Args: { p: string }; Returns: string }
      ping: { Args: never; Returns: number }
      pos_staff_login:
        | {
            Args: { p_location_id: string; p_pin_code: string }
            Returns: {
              error_message: string
              first_name: string
              last_name: string
              role_code: string
              staff_profile_id: string
              success: boolean
            }[]
          }
        | {
            Args: {
              p_auto_clock_in?: boolean
              p_device_id: string
              p_device_name?: string
              p_force_takeover?: boolean
              p_location_id: string
              p_pin_code: string
              p_station_id: string
            }
            Returns: Json
          }
      pos_staff_login_v2: {
        Args: {
          p_app_version?: string
          p_auto_clock_in?: boolean
          p_device_id: string
          p_device_name: string
          p_force_takeover?: boolean
          p_hardware_model?: string
          p_ip_address?: string
          p_location_id: string
          p_os_version?: string
          p_pin_code: string
          p_station_id: string
        }
        Returns: Json
      }
      pos_staff_logout: {
        Args: {
          p_clock_out?: boolean
          p_device_id: string
          p_location_id: string
          p_pin_code: string
          p_session_id: string
        }
        Returns: Json
      }
      prepare_castles_settlement: {
        Args: {
          p_initiated_by: string
          p_merchant_id: string
          p_terminal_id: string
        }
        Returns: Json
      }
      preview_payment: {
        Args: {
          p_custom_amount?: number
          p_is_cash?: boolean
          p_item_allocations?: Json
          p_order_id: string
          p_payment_type?: string
          p_split_count?: number
        }
        Returns: Json
      }
      preview_tip_distribution: {
        Args: {
          p_location_id: string
          p_merchant_id: string
          p_session_date: string
          p_shift_period?: string
        }
        Returns: Json
      }
      probe_payment_idempotency: {
        Args: { p_idempotency_key: string; p_order_id?: string }
        Returns: Json
      }
      process_cash_payment_full_order: {
        Args: {
          p_amount_tendered: number
          p_order_id: string
          p_staff_id?: string
        }
        Returns: Json
      }
      process_online_order: {
        Args: {
          p_auto_accept?: boolean
          p_customer_email?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_delivery_address?: Json
          p_delivery_charge?: number
          p_delivery_company?: string
          p_discount?: number
          p_estimated_delivery?: string
          p_external_reference?: string
          p_gratuity?: number
          p_items?: Json
          p_location_id: string
          p_order_notes?: string
          p_order_type_raw?: string
          p_placed_at?: string
          p_provider: string
          p_provider_metadata?: Json
          p_provider_order_id: string
          p_provider_restaurant_id?: string
          p_raw_payload?: Json
          p_ready_by?: string
          p_subtotal?: number
          p_surcharge?: number
          p_tax?: number
          p_total?: number
        }
        Returns: Json
      }
      process_order_inventory_deduction: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      process_order_payment: {
        Args: {
          p_amount: number
          p_amount_tendered?: number
          p_device_id?: string
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_reason?: string
          p_terminal_id?: string
          p_terminal_type?: string
          p_tip_amount?: number
          p_transaction_details?: Json
        }
        Returns: Json
      }
      process_payment_v10: {
        Args: {
          p_amount?: number
          p_amount_tendered?: number
          p_force_card_pricing?: boolean
          p_idempotency_key?: string
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_split_count?: number
          p_split_portion_index?: number
          p_staff_id?: string
          p_station_id?: string
          p_terminal_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      process_payment_v11: {
        Args: {
          p_amount?: number
          p_amount_tendered?: number
          p_force_card_pricing?: boolean
          p_idempotency_key?: string
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_split_count?: number
          p_split_portion_index?: number
          p_staff_id?: string
          p_station_id?: string
          p_terminal_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      process_payment_v12: {
        Args: {
          p_amount?: number
          p_amount_tendered?: number
          p_force_card_pricing?: boolean
          p_idempotency_key?: string
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_split_count?: number
          p_split_portion_index?: number
          p_staff_id?: string
          p_station_id?: string
          p_terminal_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      process_payment_v13: {
        Args: {
          p_amount?: number
          p_amount_tendered?: number
          p_force_card_pricing?: boolean
          p_idempotency_key?: string
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_split_count?: number
          p_split_portion_index?: number
          p_staff_id?: string
          p_station_id?: string
          p_terminal_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      process_payment_v14: {
        Args: {
          p_amount?: number
          p_amount_tendered?: number
          p_force_card_pricing?: boolean
          p_idempotency_key?: string
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_split_count?: number
          p_split_portion_index?: number
          p_staff_id?: string
          p_station_id?: string
          p_terminal_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      process_payment_v15: {
        Args: {
          p_amount?: number
          p_amount_tendered?: number
          p_force_card_pricing?: boolean
          p_idempotency_key?: string
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_split_count?: number
          p_split_portion_index?: number
          p_staff_id?: string
          p_station_id?: string
          p_terminal_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      process_payment_v6: {
        Args: {
          p_amount?: number
          p_amount_tendered?: number
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_split_count?: number
          p_split_portion_index?: number
          p_staff_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      process_payment_v7: {
        Args: {
          p_amount?: number
          p_amount_tendered?: number
          p_force_card_pricing?: boolean
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_split_count?: number
          p_split_portion_index?: number
          p_staff_id?: string
          p_terminal_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      process_payment_v8: {
        Args: {
          p_amount?: number
          p_amount_tendered?: number
          p_force_card_pricing?: boolean
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_split_count?: number
          p_split_portion_index?: number
          p_staff_id?: string
          p_terminal_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      process_payment_v9: {
        Args: {
          p_amount?: number
          p_amount_tendered?: number
          p_force_card_pricing?: boolean
          p_idempotency_key?: string
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_split_count?: number
          p_split_portion_index?: number
          p_staff_id?: string
          p_station_id?: string
          p_terminal_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
        }
        Returns: Json
      }
      process_preauth_v1: {
        Args: {
          p_amount: number
          p_order_id: string
          p_staff_id?: string
          p_terminal_response?: Json
          p_terminal_type?: string
        }
        Returns: Json
      }
      process_preauth_v3: {
        Args: {
          p_amount: number
          p_order_id: string
          p_staff_id?: string
          p_terminal_response?: Json
          p_terminal_type?: string
        }
        Returns: Json
      }
      process_split_payment: {
        Args: {
          p_amount: number
          p_amount_tendered?: number
          p_order_id: string
          p_payment_method: string
          p_staff_id?: string
          p_terminal_response?: Json
        }
        Returns: Json
      }
      publish_schedule: {
        Args: { p_merchant_id: string; p_schedule_id: string }
        Returns: boolean
      }
      qr_base64url_decode: { Args: { p_value: string }; Returns: string }
      qr_base64url_encode: { Args: { p_value: string }; Returns: string }
      qr_compute_table_signature: {
        Args: {
          p_floor_plan_object_id: string
          p_location_id: string
          p_secret: string
          p_token_version: number
        }
        Returns: string
      }
      qr_get_vault_secret: { Args: { p_secret_name: string }; Returns: string }
      qr_parse_table_token: { Args: { p_table_token: string }; Returns: Json }
      qr_request_ip_hash: { Args: never; Returns: string }
      qr_validate_operating_hours: {
        Args: { p_check_at?: string; p_operating_hours: Json }
        Returns: Json
      }
      raise_qr_guest_alert: {
        Args: {
          p_alert_type: string
          p_message?: string
          p_session_token: string
        }
        Returns: Json
      }
      rebuild_employee_daily_tips: {
        Args: { p_location_id: string; p_shift_date: string }
        Returns: number
      }
      recalculate_order_discount: {
        Args: { p_order_id: string }
        Returns: Json
      }
      recalculate_order_discount_v2: {
        Args: { p_order_id: string }
        Returns: Json
      }
      recall_kds_items: {
        Args: { p_order_item_ids: string[]; p_target_status?: string }
        Returns: undefined
      }
      recall_kds_items_dep: {
        Args: { p_order_item_ids: string[] }
        Returns: undefined
      }
      recall_kds_items_v2: {
        Args: {
          p_idempotency_key?: string
          p_order_item_ids: string[]
          p_target_status?: string
        }
        Returns: undefined
      }
      receive_transfer: {
        Args: {
          p_received_items: Json
          p_transfer_id: string
          p_user_id: string
          p_user_name: string
        }
        Returns: Json
      }
      reconcile_luqra_chargebacks: {
        Args: { p_merchant_id: string; p_since?: string }
        Returns: Json
      }
      reconcile_orders_summary: {
        Args: { p_order_ids: string[] }
        Returns: {
          check_status: string
          id: string
          payment_status: string
          status: string
          sync_version: number
          updated_at: string
        }[]
      }
      record_cash_operation: {
        Args: {
          p_amount: number
          p_approved_by?: string
          p_cash_drawer_id: string
          p_operation_type: string
          p_order_id?: string
          p_payment_id?: string
          p_performed_by: string
          p_reason?: string
          p_session_id: string
          p_vendor_id?: string
        }
        Returns: Json
      }
      record_manual_sync_resolution: {
        Args: {
          p_idempotency_key?: string
          p_metadata?: Json
          p_op_type: string
          p_order_id?: string
          p_payment_id?: string
          p_reason: string
          p_resolution: string
          p_staff_id: string
        }
        Returns: Json
      }
      record_marketing_result: {
        Args: {
          p_error?: string
          p_provider_message_id?: string
          p_recipient_id: string
          p_status: string
        }
        Returns: undefined
      }
      record_refund_items:
        | { Args: { p_items: Json; p_reversal_id: string }; Returns: undefined }
        | {
            Args: {
              p_items: Json
              p_reversal_id: string
              p_skip_quantity_update?: boolean
            }
            Returns: undefined
          }
      record_refund_items_v2: {
        Args: {
          p_idempotency_key?: string
          p_items: Json
          p_reversal_id: string
          p_skip_quantity_update?: boolean
        }
        Returns: undefined
      }
      record_session_event: {
        Args: {
          p_event_data?: Json
          p_event_type: Database["public"]["Enums"]["session_event_type"]
          p_notes?: string
          p_session_id: string
        }
        Returns: Json
      }
      record_telnyx_message: { Args: { p_payload: Json }; Returns: Json }
      record_waitlist_sms_result:
        | {
            Args: { p_success: boolean; p_waitlist_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_notification_type?: string
              p_success: boolean
              p_waitlist_id: string
            }
            Returns: undefined
          }
      redistribute_order_discount: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      refresh_user_location_access: { Args: never; Returns: undefined }
      remove_category_from_menu: {
        Args: { p_category_id: string; p_menu_id: string }
        Returns: Json
      }
      remove_course: {
        Args: { p_course_number: number; p_order_id: string }
        Returns: Json
      }
      remove_item_from_category: {
        Args: { p_category_id: string; p_menu_item_id: string }
        Returns: Json
      }
      remove_order_item: { Args: { p_order_item_id: string }; Returns: Json }
      remove_order_item_modifier: {
        Args: { p_modifier_id: string }
        Returns: Json
      }
      remove_order_item_modifier_v2: {
        Args: {
          p_idempotency_key?: string
          p_modifier_id: string
          p_station_id?: string
        }
        Returns: Json
      }
      remove_order_items_batch: {
        Args: { p_order_item_ids: string[] }
        Returns: Json
      }
      reopen_check: {
        Args: { p_order_id: string; p_reason?: string; p_staff_id: string }
        Returns: Json
      }
      reorder_category_items: {
        Args: {
          p_category_id: string
          p_item_orders: Json
          p_location_id: string
        }
        Returns: Json
      }
      reorder_item_modifier_groups: {
        Args: {
          p_group_orders: Json
          p_location_id?: string
          p_menu_item_id: string
        }
        Returns: Json
      }
      reorder_location_menus: {
        Args: { p_location_id: string; p_menu_orders: Json }
        Returns: Json
      }
      reorder_menu_categories: {
        Args: {
          p_category_orders: Json
          p_location_id: string
          p_menu_id: string
        }
        Returns: Json
      }
      reorder_menu_item_modifier_groups: {
        Args: { p_group_orders: Json; p_menu_item_id: string }
        Returns: Json
      }
      reorder_modifier_group_items: {
        Args: {
          p_item_orders: Json
          p_location_id?: string
          p_modifier_group_id: string
        }
        Returns: Json
      }
      reorder_modifier_groups: {
        Args: { p_group_orders: Json; p_merchant_id: string }
        Returns: Json
      }
      replace_merchant_subscription_services: {
        Args: { p_services?: Json; p_subscription_id: string }
        Returns: undefined
      }
      replace_order_item_modifiers: {
        Args: { p_modifiers: Json; p_order_item_id: string }
        Returns: Json
      }
      replace_order_item_modifiers_v2:
        | {
            Args: { p_modifiers: Json; p_order_item_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_idempotency_key?: string
              p_modifiers: Json
              p_order_item_id: string
            }
            Returns: Json
          }
      request_merchant_suspension: {
        Args: {
          p_force?: boolean
          p_initiated_by?: string
          p_merchant_id: string
          p_reason?: string
        }
        Returns: Json
      }
      resend_waitlist_notification: {
        Args: { p_notification_type?: string; p_waitlist_id: string }
        Returns: Json
      }
      reset_castles_txn_counter: {
        Args: { p_batch_number?: string; p_terminal_id: string }
        Returns: undefined
      }
      reset_category_item_to_level: {
        Args: {
          p_category_id?: string
          p_location_id?: string
          p_menu_id?: string
          p_menu_item_id: string
          p_target_level?: number
        }
        Returns: Json
      }
      reset_item_to_level: {
        Args: {
          p_location_id?: string
          p_menu_id?: string
          p_menu_item_id: string
          p_target_level?: number
        }
        Returns: Json
      }
      resolve_and_expand_campaign: {
        Args: { p_campaign_id: string; p_merchant_id: string }
        Returns: {
          channel: string
          customer_id: string
          destination: string
          recipient_id: string
        }[]
      }
      resolve_item_prep_station: {
        Args: {
          p_category_id?: string
          p_item_id: string
          p_location_id: string
        }
        Returns: string
      }
      resolve_qr_guest_alert: { Args: { p_alert_id: string }; Returns: Json }
      resolve_table_qr: {
        Args: { p_slug: string; p_table_token: string }
        Returns: Json
      }
      restore_location: { Args: { p_location_id: string }; Returns: Json }
      safe_jsonb_int: {
        Args: { p_default?: number; p_value: Json }
        Returns: number
      }
      seat_from_waitlist: {
        Args: { p_table_ids: string[]; p_waitlist_id: string }
        Returns: Json
      }
      seat_guests: {
        Args: {
          p_create_order?: boolean
          p_guest_name?: string
          p_guest_notes?: string
          p_guest_phone?: string
          p_party_size: number
          p_reservation_id?: string
          p_staff_id?: string
          p_table_ids: string[]
          p_waitlist_id?: string
        }
        Returns: Json
      }
      seat_guests_v2: {
        Args: {
          p_create_order?: boolean
          p_device_id?: string
          p_guest_name?: string
          p_guest_notes?: string
          p_guest_phone?: string
          p_party_size: number
          p_reservation_id?: string
          p_staff_id?: string
          p_station_id?: string
          p_table_ids: string[]
          p_waitlist_id?: string
        }
        Returns: Json
      }
      seat_guests_v3:
        | {
            Args: {
              p_create_order?: boolean
              p_device_id?: string
              p_guest_name?: string
              p_guest_phone?: string
              p_merchant_id: string
              p_party_size?: number
              p_reservation_id?: string
              p_server_staff_id?: string
              p_staff_id?: string
              p_station_id?: string
              p_table_id: string
              p_waitlist_id?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_create_order?: boolean
              p_device_id?: string
              p_guest_name?: string
              p_guest_notes?: string
              p_guest_phone?: string
              p_idempotency_key?: string
              p_party_size: number
              p_reservation_id?: string
              p_staff_id?: string
              p_station_id?: string
              p_table_ids: string[]
              p_waitlist_id?: string
            }
            Returns: Json
          }
      seat_reservation: {
        Args: { p_reservation_id: string; p_table_ids?: string[] }
        Returns: Json
      }
      set_item_course: {
        Args: { p_course_number: number; p_order_item_id: string }
        Returns: Json
      }
      set_item_seat: {
        Args: { p_order_item_id: string; p_seat_number: number }
        Returns: undefined
      }
      set_location_stock: {
        Args: {
          p_inventory_item_id: string
          p_location_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      set_nmi_merchant_provisioned: {
        Args: { p_device_id: string; p_provider_merchant_id: string }
        Returns: undefined
      }
      set_working_course: {
        Args: { p_course_number: number; p_order_id: string }
        Returns: Json
      }
      settle_castles_batch: {
        Args: {
          p_batch_id?: string
          p_business_date: string
          p_gross_amount?: number
          p_location_id: string
          p_net_deposit?: number
          p_raw_response?: Json
          p_refund_amount?: number
          p_refund_count?: number
          p_sales_count?: number
          p_terminal_id: string
          p_tip_amount?: number
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sign_qr_table_token: {
        Args: {
          p_floor_plan_object_id: string
          p_location_id: string
          p_qr_code_id: string
          p_token_version: number
        }
        Returns: string
      }
      start_impersonation_session: {
        Args: {
          p_ip_address?: unknown
          p_merchant_id: string
          p_reason?: string
          p_user_agent?: string
        }
        Returns: string
      }
      station_heartbeat: {
        Args: { p_ip_address?: unknown; p_station_id: string }
        Returns: Json
      }
      submit_inventory_count: {
        Args: {
          p_apply_adjustments?: boolean
          p_count_id: string
          p_counted_items: Json
          p_user_id: string
          p_user_name: string
        }
        Returns: Json
      }
      toggle_priority_order_items: {
        Args: { p_is_prioritized: boolean; p_order_item_ids: string[] }
        Returns: undefined
      }
      toggle_to_go_order_items: {
        Args: { p_is_to_go: boolean; p_order_item_ids: string[] }
        Returns: undefined
      }
      toggle_rush_order_items: {
        Args: { p_order_item_ids: string[]; p_rush: boolean }
        Returns: undefined
      }
      touch_dlq_replay_failure: {
        Args: { p_error_message: string; p_id: string }
        Returns: undefined
      }
      touch_impersonation_session: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      transfer_table_session:
        | {
            Args: { p_new_table_ids: string[]; p_session_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_new_table_ids: string[]
              p_reason?: string
              p_session_id: string
            }
            Returns: Json
          }
      unmerge_table_from_session: {
        Args: { p_session_id: string; p_table_id: string }
        Returns: Json
      }
      unsubscribe_customer: {
        Args: { p_customer_id: string; p_merchant_id: string }
        Returns: undefined
      }
      update_floor_plan_object_position: {
        Args: {
          p_object_id: string
          p_rotation?: number
          p_x: number
          p_y: number
        }
        Returns: Json
      }
      update_floor_plan_objects_batch: {
        Args: { p_updates: Json }
        Returns: Json
      }
      update_location_pos_config: {
        Args: { p_config: Json; p_location_id: string; p_namespace: string }
        Returns: Json
      }
      update_station_pos_config_overrides: {
        Args: { p_overrides: Json; p_station_id: string }
        Returns: Json
      }
      update_order_details_v1: {
        Args: {
          p_customer_email?: string
          p_customer_id?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_delivery_address?: string
          p_notes?: string
          p_order_id: string
          p_order_type?: string
          p_station_id?: string
          p_update_customer?: boolean
          p_update_delivery_address?: boolean
          p_update_notes?: boolean
          p_update_order_type?: boolean
        }
        Returns: Json
      }
      update_order_item: {
        Args: {
          p_course_number?: number
          p_order_item_id: string
          p_prep_station?: string
          p_price_override?: number
          p_quantity?: number
          p_special_instructions?: string
        }
        Returns: Json
      }
      update_order_item_quantity: {
        Args: { p_order_item_id: string; p_quantity: number }
        Returns: Json
      }
      update_order_item_quantity_v2: {
        Args: { p_order_item_id: string; p_quantity: number }
        Returns: Json
      }
      update_order_item_quantity_v3: {
        Args: {
          p_idempotency_key?: string
          p_order_item_id: string
          p_quantity: number
        }
        Returns: Json
      }
      update_order_item_v2: {
        Args: {
          p_order_item_id: string
          p_quantity?: number
          p_seat_number?: number
          p_special_instructions?: string
          p_unit_price?: number
        }
        Returns: Json
      }
      update_order_item_v2_dep: {
        Args: {
          p_order_item_id: string
          p_quantity?: number
          p_special_instructions?: string
          p_unit_price?: number
        }
        Returns: Json
      }
      update_order_item_v3: {
        Args: {
          p_idempotency_key?: string
          p_order_item_id: string
          p_quantity?: number
          p_seat_number?: number
          p_special_instructions?: string
          p_unit_price?: number
        }
        Returns: Json
      }
      update_order_payment_status_after_refund: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      update_order_payment_status_after_refund_v3: {
        Args: { p_idempotency_key?: string; p_order_id: string }
        Returns: undefined
      }
      update_order_status: {
        Args: { p_new_status: string; p_order_id: string; p_reason?: string }
        Returns: Json
      }
      update_order_status_dep: {
        Args: {
          p_new_status: Database["public"]["Enums"]["order_status"]
          p_notes?: string
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      update_preauth_amount_v1: {
        Args: {
          p_new_amount: number
          p_payment_id: string
          p_terminal_response?: Json
        }
        Returns: Json
      }
      update_preauth_amount_v3: {
        Args: {
          p_new_amount: number
          p_payment_id: string
          p_terminal_response?: Json
        }
        Returns: Json
      }
      update_reservation_status: {
        Args: {
          p_cancellation_reason?: string
          p_reservation_id: string
          p_status: Database["public"]["Enums"]["reservation_status"]
        }
        Returns: Json
      }
      update_reversal_status:
        | {
            Args: {
              p_emv_data?: Json
              p_reversal_id: string
              p_status: Database["public"]["Enums"]["reversal_status_type"]
              p_terminal_response?: Json
            }
            Returns: undefined
          }
        | {
            Args: {
              p_emv_data?: Json
              p_response_message?: string
              p_result_code?: string
              p_reversal_id: string
              p_reversal_psp_reference?: string
              p_status: Database["public"]["Enums"]["reversal_status_type"]
              p_terminal_response?: Json
            }
            Returns: undefined
          }
      update_reversal_status_v2: {
        Args: {
          p_emv_data?: Json
          p_idempotency_key?: string
          p_response_message?: string
          p_result_code?: string
          p_reversal_id: string
          p_reversal_psp_reference?: string
          p_status: Database["public"]["Enums"]["reversal_status_type"]
          p_terminal_response?: Json
        }
        Returns: undefined
      }
      update_session_staff: {
        Args: {
          p_session_id: string
          p_staff_name: string
          p_staff_profile_id: string
        }
        Returns: Json
      }
      update_table_session_status: {
        Args: {
          p_notes?: string
          p_session_id: string
          p_staff_id?: string
          p_status: Database["public"]["Enums"]["table_status"]
        }
        Returns: Json
      }
      update_terminal_health: {
        Args: {
          p_battery_level?: number
          p_consecutive_failures?: number
          p_firmware_version?: string
          p_is_connected: boolean
          p_last_error_message?: string
          p_status?: string
          p_terminal_id: string
        }
        Returns: Json
      }
      update_terminal_status: {
        Args: {
          p_is_connected: boolean
          p_status: string
          p_terminal_id: string
        }
        Returns: Json
      }
      update_ticket_status: {
        Args: {
          p_resolution_notes?: string
          p_resolved_by?: string
          p_status: string
          p_ticket_id: string
        }
        Returns: Json
      }
      update_waitlist_status: {
        Args: {
          p_notes?: string
          p_status: Database["public"]["Enums"]["waitlist_status"]
          p_waitlist_id: string
        }
        Returns: Json
      }
      upsert_category_item_override: {
        Args: {
          p_category_id?: string
          p_current_stock?: number
          p_custom_cash_price?: number
          p_custom_delivery_price?: number
          p_custom_price?: number
          p_display_order?: number
          p_is_available?: boolean
          p_is_featured?: boolean
          p_location_id?: string
          p_menu_id?: string
          p_menu_item_id: string
          p_price_modifier?: number
          p_price_modifier_type?: string
          p_stock_tracking_mode?: string
        }
        Returns: Json
      }
      upsert_employee_daily_tips_override: {
        Args: {
          p_cash_tips_declared?: number
          p_charged_tips?: number
          p_cover_count?: number
          p_gross_sales?: number
          p_hours_worked?: number
          p_location_id: string
          p_shift_date: string
          p_staff_profile_id: string
        }
        Returns: Json
      }
      upsert_item_override: {
        Args: {
          p_current_stock?: number
          p_custom_cash_price?: number
          p_custom_price?: number
          p_is_available?: boolean
          p_location_id?: string
          p_menu_id?: string
          p_menu_item_id: string
          p_price_modifier?: number
          p_price_modifier_type?: string
          p_stock_tracking_mode?: string
        }
        Returns: Json
      }
      upsert_location_inventory_override: {
        Args: {
          p_custom_cost?: number
          p_custom_reorder_threshold?: number
          p_inventory_item_id: string
          p_location_id: string
          p_notes?: string
        }
        Returns: Json
      }
      upsert_location_payment_device: {
        Args: {
          p_device_label?: string
          p_ftd_ecom_key?: string
          p_location_id: string
          p_tpn: string
          p_use_for_online_ordering?: boolean
        }
        Returns: string
      }
      upsert_menu_item_with_recipe: {
        Args: {
          p_ingredients?: Json
          p_location_id?: string
          p_menu_item_id: string
          p_recipe_items?: Json
        }
        Returns: undefined
      }
      upsert_merchant_payment_credentials: {
        Args: {
          p_is_active?: boolean
          p_merchant_id: string
          p_private_api_key?: string
          p_provider?: string
          p_tokenization_key?: string
        }
        Returns: string
      }
      upsert_merchant_subscription: {
        Args: {
          p_billing_profile_id?: string
          p_current_period_end?: string
          p_current_period_start?: string
          p_location_id?: string
          p_merchant_id?: string
          p_metadata?: Json
          p_next_billing_date?: string
          p_plan_id?: string
          p_status?: string
          p_subscription_id?: string
          p_trial_ends_at?: string
        }
        Returns: string
      }
      upsert_modifier_item_with_recipe: {
        Args: { p_modifier_item_id: string; p_recipe_items: Json }
        Returns: undefined
      }
      upsert_modifier_override: {
        Args: {
          p_current_stock?: number
          p_is_active?: boolean
          p_location_id: string
          p_modifier_item_id: string
          p_price_modifier?: number
          p_stock_tracking_mode?: string
        }
        Returns: Json
      }
      upsert_platform_billing_provider_config: {
        Args: {
          p_is_active?: boolean
          p_label?: string
          p_private_api_key?: string
          p_provider?: string
          p_tokenization_key?: string
        }
        Returns: string
      }
      upsert_subscription_plan: {
        Args: {
          p_base_price_monthly?: number
          p_card_surcharge_pct?: number
          p_display_name?: string
          p_included_stations?: number
          p_is_active?: boolean
          p_metadata?: Json
          p_per_extra_station_price?: number
          p_plan_code?: string
          p_plan_id?: string
        }
        Returns: string
      }
      upsert_terminal_vault_secret: {
        Args: { p_auth_key: string; p_terminal_id: string }
        Returns: string
      }
      user_belongs_to_merchant: {
        Args: { p_merchant_id: string }
        Returns: boolean
      }
      user_has_location_permission: {
        Args: { p_location_id: string; p_permission_code: string }
        Returns: boolean
      }
      user_location_ids: { Args: never; Returns: string[] }
      user_merchant_id: { Args: never; Returns: string }
      user_staff_profile_id: { Args: never; Returns: string }
      validate_payment_amount: {
        Args: {
          p_expected_amount: number
          p_is_cash?: boolean
          p_item_allocations?: Json
          p_order_id: string
        }
        Returns: Json
      }
      validate_tip_pool_config: { Args: { p_config_id: string }; Returns: Json }
      verify_employee_daily_tips: {
        Args: { p_id: string; p_verified_by: string }
        Returns: Json
      }
      verify_phone_verification_otp: {
        Args: { p_code: string; p_merchant_id: string; p_phone: string }
        Returns: Json
      }
      verify_qr_table_token: {
        Args: {
          p_floor_plan_object_id: string
          p_location_id: string
          p_table_token: string
          p_token_version: number
        }
        Returns: Json
      }
      void_order: {
        Args: { p_order_id: string; p_void_reason?: string }
        Returns: Json
      }
      void_order_and_cancel_reservation: {
        Args: { p_order_id: string; p_void_reason?: string }
        Returns: Json
      }
      void_order_item: {
        Args: { p_order_item_id: string; p_void_reason: string }
        Returns: Json
      }
      void_payment: {
        Args: { p_payment_id: string; p_void_reason?: string }
        Returns: undefined
      }
      void_preauth_v1: {
        Args: { p_payment_id: string; p_reason?: string; p_staff_id?: string }
        Returns: Json
      }
      void_tip_distribution: {
        Args: { p_reason: string; p_session_id: string; p_voided_by: string }
        Returns: Json
      }
    }
    Enums: {
      device_lifecycle_status:
        | "in_warehouse"
        | "allocated"
        | "shipped"
        | "provisioning"
        | "deployed"
        | "in_repair"
        | "decommissioned"
        | "lost"
        | "rma"
      discount_scope: "item" | "order" | "both"
      discount_source: "preset" | "open" | "promo_code" | "loyalty"
      discount_type: "percentage" | "fixed_amount"
      floor_object_category:
        | "table"
        | "booth"
        | "functional"
        | "structure"
        | "decor"
        | "zone"
      inventory_stock_mode: "in_stock" | "stock_tracking" | "out_of_stock"
      online_order_provider:
        | "orderout"
        | "doordash"
        | "ubereats"
        | "grubhub"
        | "website"
        | "app"
        | "other"
        | "kiosk"
      order_channel: "pickup" | "dine_in" | "delivery"
      order_status:
        | "draft"
        | "pending"
        | "sent_to_kitchen"
        | "preparing"
        | "ready"
        | "completed"
        | "cancelled"
        | "refunded"
        | "void"
        | "accepted"
        | "declined"
      order_type:
        | "dine_in"
        | "takeout"
        | "delivery"
        | "online"
        | "catering"
        | "qr_dine_in"
      organization_type: "hq" | "carrier" | "merchant"
      payment_method:
        | "cash"
        | "card_spinapi"
        | "card_dvpaylite"
        | "card_manual"
        | "gift_card"
        | "house_account"
        | "external"
        | "card"
        | "card_online"
      payment_status:
        | "pending"
        | "processing"
        | "authorized"
        | "captured"
        | "failed"
        | "declined"
        | "refunded"
        | "partially_refunded"
        | "void"
        | "paid"
        | "partial"
      pricing_mode: "card" | "cash" | "mixed"
      refund_reason_type:
        | "customer_request"
        | "item_quality"
        | "wrong_item"
        | "never_received"
        | "duplicate_charge"
        | "price_adjustment"
        | "order_cancelled"
        | "kitchen_error"
        | "manager_comp"
        | "other"
      reservation_status:
        | "pending"
        | "confirmed"
        | "reminded"
        | "arrived"
        | "seated"
        | "completed"
        | "no_show"
        | "cancelled"
      reversal_status_type: "pending" | "completed" | "failed"
      reversal_type: "void" | "refund" | "partial_refund" | "item_return"
      session_event_type:
        | "seated"
        | "order_placed"
        | "order_added"
        | "drinks_served"
        | "appetizers_fired"
        | "appetizers_served"
        | "mains_fired"
        | "mains_served"
        | "desserts_fired"
        | "desserts_served"
        | "check_requested"
        | "check_presented"
        | "payment_started"
        | "payment_complete"
        | "table_cleared"
        | "table_cleaned"
        | "server_visit"
        | "manager_visit"
        | "complaint"
        | "comped"
        | "custom"
      split_payment_path_enum:
        | "split-by-item"
        | "split-evenly"
        | "split-custom-amount"
        | "pay-for-items"
      table_status:
        | "available"
        | "reserved"
        | "seated"
        | "ordered"
        | "served"
        | "check_presented"
        | "paid"
        | "cleaning"
        | "blocked"
        | "not_in_service"
      terminal_type:
        | "dejavoo_spinapi"
        | "dejavoo_p18"
        | "manual"
        | "none"
        | "dejavoo"
        | "cash_drawer"
        | "castles"
      waitlist_status:
        | "waiting"
        | "notified"
        | "arrived"
        | "seated"
        | "no_show"
        | "cancelled"
        | "expired"
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
      device_lifecycle_status: [
        "in_warehouse",
        "allocated",
        "shipped",
        "provisioning",
        "deployed",
        "in_repair",
        "decommissioned",
        "lost",
        "rma",
      ],
      discount_scope: ["item", "order", "both"],
      discount_source: ["preset", "open", "promo_code", "loyalty"],
      discount_type: ["percentage", "fixed_amount"],
      floor_object_category: [
        "table",
        "booth",
        "functional",
        "structure",
        "decor",
        "zone",
      ],
      inventory_stock_mode: ["in_stock", "stock_tracking", "out_of_stock"],
      online_order_provider: [
        "orderout",
        "doordash",
        "ubereats",
        "grubhub",
        "website",
        "app",
        "other",
        "kiosk",
      ],
      order_channel: ["pickup", "dine_in", "delivery"],
      order_status: [
        "draft",
        "pending",
        "sent_to_kitchen",
        "preparing",
        "ready",
        "completed",
        "cancelled",
        "refunded",
        "void",
        "accepted",
        "declined",
      ],
      order_type: [
        "dine_in",
        "takeout",
        "delivery",
        "online",
        "catering",
        "qr_dine_in",
      ],
      organization_type: ["hq", "carrier", "merchant"],
      payment_method: [
        "cash",
        "card_spinapi",
        "card_dvpaylite",
        "card_manual",
        "gift_card",
        "house_account",
        "external",
        "card",
        "card_online",
      ],
      payment_status: [
        "pending",
        "processing",
        "authorized",
        "captured",
        "failed",
        "declined",
        "refunded",
        "partially_refunded",
        "void",
        "paid",
        "partial",
      ],
      pricing_mode: ["card", "cash", "mixed"],
      refund_reason_type: [
        "customer_request",
        "item_quality",
        "wrong_item",
        "never_received",
        "duplicate_charge",
        "price_adjustment",
        "order_cancelled",
        "kitchen_error",
        "manager_comp",
        "other",
      ],
      reservation_status: [
        "pending",
        "confirmed",
        "reminded",
        "arrived",
        "seated",
        "completed",
        "no_show",
        "cancelled",
      ],
      reversal_status_type: ["pending", "completed", "failed"],
      reversal_type: ["void", "refund", "partial_refund", "item_return"],
      session_event_type: [
        "seated",
        "order_placed",
        "order_added",
        "drinks_served",
        "appetizers_fired",
        "appetizers_served",
        "mains_fired",
        "mains_served",
        "desserts_fired",
        "desserts_served",
        "check_requested",
        "check_presented",
        "payment_started",
        "payment_complete",
        "table_cleared",
        "table_cleaned",
        "server_visit",
        "manager_visit",
        "complaint",
        "comped",
        "custom",
      ],
      split_payment_path_enum: [
        "split-by-item",
        "split-evenly",
        "split-custom-amount",
        "pay-for-items",
      ],
      table_status: [
        "available",
        "reserved",
        "seated",
        "ordered",
        "served",
        "check_presented",
        "paid",
        "cleaning",
        "blocked",
        "not_in_service",
      ],
      terminal_type: [
        "dejavoo_spinapi",
        "dejavoo_p18",
        "manual",
        "none",
        "dejavoo",
        "cash_drawer",
        "castles",
      ],
      waitlist_status: [
        "waiting",
        "notified",
        "arrived",
        "seated",
        "no_show",
        "cancelled",
        "expired",
      ],
    },
  },
} as const
