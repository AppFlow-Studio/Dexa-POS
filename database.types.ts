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
          location_id: string | null
          merchant_id: string | null
          metadata: Json | null
          organization_id: string | null
          organization_name: string | null
          organization_type: string | null
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
          location_id?: string | null
          merchant_id?: string | null
          metadata?: Json | null
          organization_id?: string | null
          organization_name?: string | null
          organization_type?: string | null
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
          location_id?: string | null
          merchant_id?: string | null
          metadata?: Json | null
          organization_id?: string | null
          organization_name?: string | null
          organization_type?: string | null
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
          session_id: string
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
          session_id: string
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
          session_id?: string
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
          menu_item_id?: string
          merchant_id?: string
          updated_at?: string | null
        }
        Relationships: [
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
            referencedRelation: "vw_platform_transactions"
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
          monthly_fee_cents: number | null
          notes: string | null
          specs: Json
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
          monthly_fee_cents?: number | null
          notes?: string | null
          specs?: Json
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
          monthly_fee_cents?: number | null
          notes?: string | null
          specs?: Json
          unit_cost_cents?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      device_heartbeats: {
        Row: {
          app_version: string | null
          battery_level: number | null
          cfd_connected: boolean | null
          cpu_usage: number | null
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
        }
        Insert: {
          app_version?: string | null
          battery_level?: number | null
          cfd_connected?: boolean | null
          cpu_usage?: number | null
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
        }
        Update: {
          app_version?: string | null
          battery_level?: number | null
          cfd_connected?: boolean | null
          cpu_usage?: number | null
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
            isOneToOne: false
            referencedRelation: "stations"
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
          cash_tips_declared: number | null
          charged_tips: number | null
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
          cash_tips_declared?: number | null
          charged_tips?: number | null
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
          cash_tips_declared?: number | null
          charged_tips?: number | null
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
          reorder_point: number | null
          sku: string | null
          stock_mode: string | null
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
          reorder_point?: number | null
          sku?: string | null
          stock_mode?: string | null
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
          reorder_point?: number | null
          sku?: string | null
          stock_mode?: string | null
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
          bumped_at: string | null
          bumped_by: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          kds_display_id: string
          order_id: string
          order_item_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          bumped_at?: string | null
          bumped_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          kds_display_id: string
          order_id: string
          order_item_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          bumped_at?: string | null
          bumped_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          kds_display_id?: string
          order_id?: string
          order_item_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
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
          created_at: string | null
          custom_cost: number | null
          custom_reorder_threshold: number | null
          id: string
          inventory_item_id: string
          location_id: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_cost?: number | null
          custom_reorder_threshold?: number | null
          id?: string
          inventory_item_id: string
          location_id: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_cost?: number | null
          custom_reorder_threshold?: number | null
          id?: string
          inventory_item_id?: string
          location_id?: string
          notes?: string | null
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
          id: string
          is_active: boolean | null
          location_id: string
          merchant_id: string
          modifier_group_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_id: string
          merchant_id: string
          modifier_group_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
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
          business_hours: Json | null
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
          latitude: number | null
          longitude: number | null
          merchant_id: string
          name: string
          onboarding_completed: boolean | null
          onboarding_step: number | null
          phone: string | null
          postal_code: string
          pricing_strategy: string
          public_metadata: Json | null
          sales_tax_rate: number | null
          state: string
          tax_id: string | null
          tax_registration_status: string | null
          timezone: string
          updated_at: string
          use_merchant_pricing_defaults: boolean
          uses_global_menu: boolean
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          business_hours?: Json | null
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
          latitude?: number | null
          longitude?: number | null
          merchant_id: string
          name: string
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          phone?: string | null
          postal_code?: string
          pricing_strategy?: string
          public_metadata?: Json | null
          sales_tax_rate?: number | null
          state?: string
          tax_id?: string | null
          tax_registration_status?: string | null
          timezone?: string
          updated_at?: string
          use_merchant_pricing_defaults?: boolean
          uses_global_menu?: boolean
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          business_hours?: Json | null
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
          latitude?: number | null
          longitude?: number | null
          merchant_id?: string
          name?: string
          onboarding_completed?: boolean | null
          onboarding_step?: number | null
          phone?: string | null
          postal_code?: string
          pricing_strategy?: string
          public_metadata?: Json | null
          sales_tax_rate?: number | null
          state?: string
          tax_id?: string | null
          tax_registration_status?: string | null
          timezone?: string
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
          id: string
          image: string | null
          is_tax_exempt: boolean | null
          location_id: string | null
          meal_types: string[] | null
          merchant_id: string
          name: string
          price: number
          stock_tracking_mode: string | null
          tax_category: string
          updated_at: string
          use_delivery_price: boolean | null
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
          id?: string
          image?: string | null
          is_tax_exempt?: boolean | null
          location_id?: string | null
          meal_types?: string[] | null
          merchant_id: string
          name: string
          price: number
          stock_tracking_mode?: string | null
          tax_category?: string
          updated_at?: string
          use_delivery_price?: boolean | null
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
          id?: string
          image?: string | null
          is_tax_exempt?: boolean | null
          location_id?: string | null
          meal_types?: string[] | null
          merchant_id?: string
          name?: string
          price?: number
          stock_tracking_mode?: string | null
          tax_category?: string
          updated_at?: string
          use_delivery_price?: boolean | null
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
          is_active: boolean
          location_id: string | null
          merchant_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          merchant_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          merchant_id?: string
          name?: string
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
          billing_method: string
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last_four: string | null
          card_token: string | null
          created_at: string
          id: string
          is_active: boolean
          is_primary: boolean
          is_verified: boolean
          merchant_id: string
          routing_number_last_four: string | null
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          account_holder_name?: string | null
          account_number_last_four?: string | null
          account_type?: string | null
          bank_name?: string | null
          billing_method?: string
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last_four?: string | null
          card_token?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          is_verified?: boolean
          merchant_id: string
          routing_number_last_four?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          account_holder_name?: string | null
          account_number_last_four?: string | null
          account_type?: string | null
          bank_name?: string | null
          billing_method?: string
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last_four?: string | null
          card_token?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          is_verified?: boolean
          merchant_id?: string
          routing_number_last_four?: string | null
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
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
          carrier_id: string
          clerk_org_id: string
          created_at: string | null
          dba_name: string | null
          dual_pricing_percentage: number
          ein_last_four: string | null
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
          carrier_id: string
          clerk_org_id: string
          created_at?: string | null
          dba_name?: string | null
          dual_pricing_percentage?: number
          ein_last_four?: string | null
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
          carrier_id?: string
          clerk_org_id?: string
          created_at?: string | null
          dba_name?: string | null
          dual_pricing_percentage?: number
          ein_last_four?: string | null
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
          is_tax_exempt: boolean | null
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
          is_tax_exempt?: boolean | null
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
          is_tax_exempt?: boolean | null
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
            referencedRelation: "vw_platform_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount: number
          amount_tendered: number | null
          approved_at: string | null
          auth_code: string | null
          authorization_code: string | null
          authorized_at: string | null
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
          dejavoo_batch_number: string | null
          dejavoo_invoice_number: string | null
          dejavoo_response_code: string | null
          dejavoo_response_message: string | null
          dejavoo_transaction_type: string | null
          device_id: string | null
          discount_portion: number | null
          dvpaylite_application_type: string | null
          dvpaylite_request_id: string | null
          emv_data: Json | null
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          gateway_fee: number | null
          id: string
          initiated_at: string
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
          parent_payment_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          processed_by_staff_id: string | null
          processed_by_user_id: string | null
          processor_name: string | null
          processor_response: Json | null
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
          total_amount: number
          transaction_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          amount_tendered?: number | null
          approved_at?: string | null
          auth_code?: string | null
          authorization_code?: string | null
          authorized_at?: string | null
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
          dejavoo_batch_number?: string | null
          dejavoo_invoice_number?: string | null
          dejavoo_response_code?: string | null
          dejavoo_response_message?: string | null
          dejavoo_transaction_type?: string | null
          device_id?: string | null
          discount_portion?: number | null
          dvpaylite_application_type?: string | null
          dvpaylite_request_id?: string | null
          emv_data?: Json | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          gateway_fee?: number | null
          id?: string
          initiated_at?: string
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
          parent_payment_id?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          processed_by_staff_id?: string | null
          processed_by_user_id?: string | null
          processor_name?: string | null
          processor_response?: Json | null
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
          total_amount: number
          transaction_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          amount_tendered?: number | null
          approved_at?: string | null
          auth_code?: string | null
          authorization_code?: string | null
          authorized_at?: string | null
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
          dejavoo_batch_number?: string | null
          dejavoo_invoice_number?: string | null
          dejavoo_response_code?: string | null
          dejavoo_response_message?: string | null
          dejavoo_transaction_type?: string | null
          device_id?: string | null
          discount_portion?: number | null
          dvpaylite_application_type?: string | null
          dvpaylite_request_id?: string | null
          emv_data?: Json | null
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          gateway_fee?: number | null
          id?: string
          initiated_at?: string
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
          parent_payment_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          processed_by_staff_id?: string | null
          processed_by_user_id?: string | null
          processor_name?: string | null
          processor_response?: Json | null
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
          total_amount?: number
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
          amount_due: number
          amount_paid: number
          assigned_server_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
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
          seat_number: string | null
          sent_to_kitchen_at: string | null
          service_charge: number
          session_id: string | null
          special_instructions: string | null
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
          amount_due?: number
          amount_paid?: number
          assigned_server_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
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
          seat_number?: string | null
          sent_to_kitchen_at?: string | null
          service_charge?: number
          session_id?: string | null
          special_instructions?: string | null
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
          amount_due?: number
          amount_paid?: number
          assigned_server_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
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
          seat_number?: string | null
          sent_to_kitchen_at?: string | null
          service_charge?: number
          session_id?: string | null
          special_instructions?: string | null
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
          auto_settle: boolean | null
          battery_level: number | null
          castles_batch_number: string | null
          castles_counter_updated_at: string | null
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
          auto_settle?: boolean | null
          battery_level?: number | null
          castles_batch_number?: string | null
          castles_counter_updated_at?: string | null
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
          auto_settle?: boolean | null
          battery_level?: number | null
          castles_batch_number?: string | null
          castles_counter_updated_at?: string | null
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
      printers: {
        Row: {
          auto_print_receipt: boolean | null
          bluetooth_address: string | null
          connection_type: string
          copies: number | null
          created_at: string | null
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
          print_order_tickets: boolean | null
          printer_model: string | null
          printer_name: string
          printer_role: string
          printer_type: string
          receipt_footer: string | null
          receipt_header: string | null
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
          print_order_tickets?: boolean | null
          printer_model?: string | null
          printer_name: string
          printer_role?: string
          printer_type: string
          receipt_footer?: string | null
          receipt_header?: string | null
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
          print_order_tickets?: boolean | null
          printer_model?: string | null
          printer_name?: string
          printer_role?: string
          printer_type?: string
          receipt_footer?: string | null
          receipt_header?: string | null
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
      receipt_templates: {
        Row: {
          created_at: string | null
          footer_text: string | null
          group_by_station: boolean | null
          header_text: string | null
          id: string
          is_active: boolean | null
          large_item_text: boolean | null
          location_id: string | null
          logo_url: string | null
          merchant_id: string
          show_allergy_alert: boolean | null
          show_barcode: boolean | null
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
          template_name: string
          template_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          footer_text?: string | null
          group_by_station?: boolean | null
          header_text?: string | null
          id?: string
          is_active?: boolean | null
          large_item_text?: boolean | null
          location_id?: string | null
          logo_url?: string | null
          merchant_id: string
          show_allergy_alert?: boolean | null
          show_barcode?: boolean | null
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
          template_name: string
          template_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          footer_text?: string | null
          group_by_station?: boolean | null
          header_text?: string | null
          id?: string
          is_active?: boolean | null
          large_item_text?: boolean | null
          location_id?: string | null
          logo_url?: string | null
          merchant_id?: string
          show_allergy_alert?: boolean | null
          show_barcode?: boolean | null
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
          merchant_id?: string
          quantity?: number
          recipe_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
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
          assessment_fees: number | null
          batch_id: string
          business_date: string
          closed_at: string | null
          created_at: string
          funded_date: string | null
          gross_amount: number | null
          id: string
          interchange_fees: number | null
          location_id: string
          merchant_id: string
          net_deposit: number | null
          opened_at: string
          processor_fees: number | null
          raw_response: Json | null
          refund_amount: number | null
          refund_count: number | null
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
          assessment_fees?: number | null
          batch_id: string
          business_date: string
          closed_at?: string | null
          created_at?: string
          funded_date?: string | null
          gross_amount?: number | null
          id?: string
          interchange_fees?: number | null
          location_id: string
          merchant_id: string
          net_deposit?: number | null
          opened_at?: string
          processor_fees?: number | null
          raw_response?: Json | null
          refund_amount?: number | null
          refund_count?: number | null
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
          assessment_fees?: number | null
          batch_id?: string
          business_date?: string
          closed_at?: string | null
          created_at?: string
          funded_date?: string | null
          gross_amount?: number | null
          id?: string
          interchange_fees?: number | null
          location_id?: string
          merchant_id?: string
          net_deposit?: number | null
          opened_at?: string
          processor_fees?: number | null
          raw_response?: Json | null
          refund_amount?: number | null
          refund_count?: number | null
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
          updated_at: string | null
        }
        Insert: {
          break_logs?: Json | null
          clock_in_time?: string
          clock_out_time?: string | null
          created_at?: string | null
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
          updated_at?: string | null
        }
        Update: {
          break_logs?: Json | null
          clock_in_time?: string
          clock_out_time?: string | null
          created_at?: string | null
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
          last_heartbeat_at: string | null
          last_sync_at: string | null
          local_ip_address: unknown
          location_id: string
          mac_address: string | null
          merchant_id: string
          network_ssid: string | null
          network_type: string | null
          os_version: string | null
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
          last_heartbeat_at?: string | null
          last_sync_at?: string | null
          local_ip_address?: unknown
          location_id: string
          mac_address?: string | null
          merchant_id: string
          network_ssid?: string | null
          network_type?: string | null
          os_version?: string | null
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
          last_heartbeat_at?: string | null
          last_sync_at?: string | null
          local_ip_address?: unknown
          location_id?: string
          mac_address?: string | null
          merchant_id?: string
          network_ssid?: string | null
          network_type?: string | null
          os_version?: string | null
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
            foreignKeyName: "stations_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
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
          staff_profile_id: string
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
          staff_profile_id: string
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
          staff_profile_id?: string
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
          id: string
          location_id: string
          merchant_id: string
          rounding_adjustment: number | null
          session_date: string
          shift_period: string | null
          status: string | null
          total_distributed: number | null
          total_tip_outs: number | null
          total_tips_collected: number | null
          total_tips_pooled: number | null
          updated_at: string | null
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          calculated_at?: string | null
          calculated_by?: string | null
          config_snapshot?: Json | null
          created_at?: string | null
          id?: string
          location_id: string
          merchant_id: string
          rounding_adjustment?: number | null
          session_date: string
          shift_period?: string | null
          status?: string | null
          total_distributed?: number | null
          total_tip_outs?: number | null
          total_tips_collected?: number | null
          total_tips_pooled?: number | null
          updated_at?: string | null
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          calculated_at?: string | null
          calculated_by?: string | null
          config_snapshot?: Json | null
          created_at?: string | null
          id?: string
          location_id?: string
          merchant_id?: string
          rounding_adjustment?: number | null
          session_date?: string
          shift_period?: string | null
          status?: string | null
          total_distributed?: number | null
          total_tip_outs?: number | null
          total_tips_collected?: number | null
          total_tips_pooled?: number | null
          updated_at?: string | null
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
      v_location_menu_items: {
        Row: {
          allergens: string[] | null
          base_cash_price: number | null
          base_price: number | null
          card_bg_color: string | null
          description: string | null
          display_order: number | null
          effective_available: boolean | null
          effective_cash_price: number | null
          effective_price: number | null
          effective_stock_mode: string | null
          has_location_override: boolean | null
          image: string | null
          item_name: string | null
          location_available: boolean | null
          location_cash_price: number | null
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
          p_special_instructions?: string
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
      add_order_item_v3: {
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
          staff_name: string
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
      apply_refund_to_payment: {
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
      approve_shift_swap: {
        Args: { p_manager_id: string; p_request_id: string }
        Returns: boolean
      }
      approve_tip_distribution: {
        Args: { p_approved_by: string; p_session_id: string }
        Returns: Json
      }
      assign_reservation_tables: {
        Args: { p_reservation_id: string; p_table_ids: string[] }
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
      can_modify_item: { Args: { p_order_item_id: string }; Returns: boolean }
      cancel_order: {
        Args: { p_cancel_reason?: string; p_order_id: string }
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
      clear_order_item_instructions: {
        Args: { p_order_item_id: string }
        Returns: Json
      }
      clear_order_items: { Args: { p_order_id: string }; Returns: Json }
      close_check: {
        Args: { p_order_id: string; p_staff_id?: string }
        Returns: Json
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
      create_next_course: { Args: { p_order_id: string }; Returns: Json }
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
      current_user_id: { Args: never; Returns: string }
      debug_pin_test: {
        Args: { p_location_id: string; p_pin_code: string }
        Returns: {
          generated_hash: string
          is_match: boolean
          staff_name: string
          stored_hash: string
        }[]
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
      end_station_session: { Args: { p_session_id: string }; Returns: Json }
      ensure_course_exists: {
        Args: { p_course_number: number; p_order_id: string }
        Returns: string
      }
      estimate_wait_time: {
        Args: { p_location_id: string; p_party_size: number }
        Returns: number
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
      generate_order_number: {
        Args: { p_location_id: string }
        Returns: string
      }
      generate_order_number_internal: {
        Args: { p_location_id: string; p_merchant_id: string }
        Returns: string
      }
      generate_po_number: { Args: never; Returns: string }
      get_active_cfd_images: {
        Args: { target_location_id: string }
        Returns: {
          image_url: string
        }[]
      }
      get_active_organization_count: {
        Args: { p_days: number }
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
          batch_id: string
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
      get_busiest_locations: {
        Args: { p_from: string; p_to: string }
        Returns: {
          location_id: string
          location_name: string
          merchant_name: string
          order_count: number
        }[]
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
      get_merchant_retention: {
        Args: { p_from: string; p_to: string }
        Returns: {
          churned: number
          new_merchants: number
          retained: number
          retention_rate: number
        }[]
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
      get_onboarding_funnel: {
        Args: { p_from: string; p_to: string }
        Returns: {
          merchant_count: number
          stage: string
        }[]
      }
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
      get_peak_hours_heatmap: {
        Args: { p_from: string; p_to: string }
        Returns: {
          day_of_week: number
          hour: number
          order_count: number
        }[]
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
      hq_has_permission: {
        Args: { p_permission_code: string }
        Returns: boolean
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
      is_dexapos_admin: { Args: never; Returns: boolean }
      is_location_member: { Args: { p_location_id: string }; Returns: boolean }
      is_merchant_admin: { Args: { p_merchant_id: string }; Returns: boolean }
      is_merchant_owner: { Args: { p_merchant_id: string }; Returns: boolean }
      link_order_to_session: {
        Args: { p_order_id: string; p_session_id: string; p_staff_id?: string }
        Returns: Json
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
          p_location_id: string
          p_merchant_id: string
          p_metadata?: Json
          p_resource_id?: string
          p_resource_name?: string
          p_resource_type?: string
          p_severity?: string
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
      log_purchase_order_payment: {
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
      mark_course_served: {
        Args: {
          p_course_number: number
          p_order_id: string
          p_staff_id?: string
        }
        Returns: Json
      }
      mark_stale_stations_offline: { Args: never; Returns: number }
      merge_customers: {
        Args: { p_duplicate_ids: string[]; p_primary_id: string }
        Returns: Json
      }
      merge_table_to_session: {
        Args: { p_session_id: string; p_table_id: string }
        Returns: Json
      }
      migrate_menu_items_to_categories: { Args: never; Returns: Json }
      notify_waitlist_party: {
        Args: { p_notification_type?: string; p_waitlist_id: string }
        Returns: Json
      }
      pos_staff_login: {
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
      process_payment_v5: {
        Args: {
          p_amount: number
          p_amount_tendered?: number
          p_device_id?: string
          p_item_allocations?: Json
          p_order_id: string
          p_payment_method: string
          p_split_count?: number
          p_split_portion_index?: number
          p_staff_id?: string
          p_terminal_id?: string
          p_terminal_response?: Json
          p_tip_amount?: number
          p_transaction_details?: Json
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
      recalculate_order_discount: {
        Args: { p_order_id: string }
        Returns: Json
      }
      record_refund_items: {
        Args: { p_items: Json; p_reversal_id: string }
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
      redistribute_order_discount: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      refresh_user_location_access: { Args: never; Returns: undefined }
      remove_category_from_menu: {
        Args: { p_category_id: string; p_menu_id: string }
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
      reorder_menu_categories: {
        Args: {
          p_category_orders: Json
          p_location_id: string
          p_menu_id: string
        }
        Returns: Json
      }
      replace_order_item_modifiers: {
        Args: { p_modifiers: Json; p_order_item_id: string }
        Returns: Json
      }
      replace_order_item_modifiers_v2: {
        Args: { p_modifiers: Json; p_order_item_id: string }
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
      resolve_item_prep_station: {
        Args: {
          p_category_id?: string
          p_item_id: string
          p_location_id: string
        }
        Returns: string
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
      seat_guests_v3: {
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
      seat_reservation: {
        Args: { p_reservation_id: string; p_table_ids?: string[] }
        Returns: Json
      }
      set_item_course: {
        Args: { p_course_number: number; p_order_item_id: string }
        Returns: Json
      }
      set_location_stock: {
        Args: {
          p_inventory_item_id: string
          p_location_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      set_working_course: {
        Args: { p_course_number: number; p_order_id: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      station_heartbeat: {
        Args: { p_ip_address?: unknown; p_station_id: string }
        Returns: Json
      }
      transfer_table_session: {
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
      update_order_item_v2: {
        Args: {
          p_order_item_id: string
          p_quantity?: number
          p_special_instructions?: string
          p_unit_price?: number
        }
        Returns: Json
      }
      update_order_payment_status_after_refund: {
        Args: { p_order_id: string }
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
      update_waitlist_status: {
        Args: {
          p_notes?: string
          p_status: Database["public"]["Enums"]["waitlist_status"]
          p_waitlist_id: string
        }
        Returns: Json
      }
      upsert_category_item_override:
        | {
            Args: {
              p_category_id?: string
              p_current_stock?: number
              p_custom_cash_price?: number
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
        | {
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
      upsert_menu_item_with_recipe:
        | {
            Args: { p_ingredients: Json; p_menu_item_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_ingredients?: Json
              p_location_id?: string
              p_menu_item_id: string
              p_recipe_items?: Json
            }
            Returns: undefined
          }
        | {
            Args: {
              p_location_id: string
              p_menu_item_id: string
              p_recipe_items: Json
            }
            Returns: undefined
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
      void_order: {
        Args: { p_order_id: string; p_void_reason?: string }
        Returns: Json
      }
      void_order_item: {
        Args: { p_order_item_id: string; p_void_reason: string }
        Returns: Json
      }
    }
    Enums: {
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
      online_order_provider:
        | "orderout"
        | "doordash"
        | "ubereats"
        | "grubhub"
        | "website"
        | "app"
        | "other"
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
      order_type: "dine_in" | "takeout" | "delivery" | "online" | "catering"
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
      online_order_provider: [
        "orderout",
        "doordash",
        "ubereats",
        "grubhub",
        "website",
        "app",
        "other",
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
      ],
      order_type: ["dine_in", "takeout", "delivery", "online", "catering"],
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
