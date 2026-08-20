export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          calculated_price: number | null
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          ride_id: string | null
          service: string
          updated_at: string | null
        }
        Insert: {
          calculated_price?: number | null
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          ride_id?: string | null
          service: string
          updated_at?: string | null
        }
        Update: {
          calculated_price?: number | null
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          ride_id?: string | null
          service?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_discounts: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          discount_type: Database["public"]["Enums"]["discount_type_enum"]
          end_date: string | null
          id: string
          min_monthly_rides: number | null
          name: string
          percentage: number
          remaining_budget: number | null
          start_date: string
          total_budget: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          discount_type: Database["public"]["Enums"]["discount_type_enum"]
          end_date?: string | null
          id?: string
          min_monthly_rides?: number | null
          name: string
          percentage: number
          remaining_budget?: number | null
          start_date: string
          total_budget?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          discount_type?: Database["public"]["Enums"]["discount_type_enum"]
          end_date?: string | null
          id?: string
          min_monthly_rides?: number | null
          name?: string
          percentage?: number
          remaining_budget?: number | null
          start_date?: string
          total_budget?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_discounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_documents: {
        Row: {
          created_at: string | null
          document_type: string
          driver_id: string | null
          expiry_date: string | null
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          rejection_reason: string | null
          upload_date: string | null
          validated_at: string | null
          validated_by: string | null
          validation_status: string | null
        }
        Insert: {
          created_at?: string | null
          document_type: string
          driver_id?: string | null
          expiry_date?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          rejection_reason?: string | null
          upload_date?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string | null
        }
        Update: {
          created_at?: string | null
          document_type?: string
          driver_id?: string | null
          expiry_date?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          rejection_reason?: string | null
          upload_date?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_documents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          altitude: number | null
          battery_level: number | null
          driver_id: string
          heading: number | null
          id: string
          is_on_ride: boolean
          is_online: boolean
          last_updated: string | null
          lat: number
          lng: number | null
          lon: number
          recorded_at: string
          ride_id: string | null
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          altitude?: number | null
          battery_level?: number | null
          driver_id: string
          heading?: number | null
          id?: string
          is_on_ride?: boolean
          is_online?: boolean
          last_updated?: string | null
          lat: number
          lng?: number | null
          lon: number
          recorded_at?: string
          ride_id?: string | null
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          altitude?: number | null
          battery_level?: number | null
          driver_id?: string
          heading?: number | null
          id?: string
          is_on_ride?: boolean
          is_online?: boolean
          last_updated?: string | null
          lat?: number
          lng?: number | null
          lon?: number
          recorded_at?: string
          ride_id?: string | null
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_rewards: {
        Row: {
          claimed_at: string | null
          created_at: string
          driver_id: string | null
          id: string
          is_claimed: boolean
          reward_type: Database["public"]["Enums"]["reward_type_enum"]
          rides_threshold: number | null
          updated_at: string
          valid_from: string
          valid_until: string
          value: number
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          is_claimed?: boolean
          reward_type: Database["public"]["Enums"]["reward_type_enum"]
          rides_threshold?: number | null
          updated_at?: string
          valid_from: string
          valid_until: string
          value: number
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          is_claimed?: boolean
          reward_type?: Database["public"]["Enums"]["reward_type_enum"]
          rides_threshold?: number | null
          updated_at?: string
          valid_from?: string
          valid_until?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_rewards_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_submission_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          driver_id: string
          error_message: string | null
          id: string
          ip_address: unknown
          new_status: string | null
          previous_status: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          driver_id: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          new_status?: string | null
          previous_status?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          driver_id?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          new_status?: string | null
          previous_status?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_submission_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          availability_hours: Json | null
          avatar_url: string | null
          city: string | null
          company_name: string | null
          company_phone: string | null
          company_siret: string | null
          created_at: string
          current_vehicle_id: string | null
          date_of_birth: string | null
          document_urls: Json | null
          driving_license_categories: string[] | null
          driving_license_expiry_date: string | null
          driving_license_issue_date: string | null
          driving_license_number: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_name: string | null
          employee_phone: string | null
          first_name: string | null
          id: string
          insurance_expiry_date: string | null
          insurance_number: string | null
          languages_spoken: string[] | null
          last_name: string | null
          nationality: string | null
          payment_provider_account_id: string | null
          phone: string | null
          postal_code: string | null
          preferred_zones: string[] | null
          rating: number | null
          status: Database["public"]["Enums"]["driver_status"]
          terms_accepted_at: string | null
          total_rides: number | null
          updated_at: string
          user_id: string
          vtc_card_expiry_date: string | null
          vtc_card_number: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          availability_hours?: Json | null
          avatar_url?: string | null
          city?: string | null
          company_name?: string | null
          company_phone?: string | null
          company_siret?: string | null
          created_at?: string
          current_vehicle_id?: string | null
          date_of_birth?: string | null
          document_urls?: Json | null
          driving_license_categories?: string[] | null
          driving_license_expiry_date?: string | null
          driving_license_issue_date?: string | null
          driving_license_number?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_name?: string | null
          employee_phone?: string | null
          first_name?: string | null
          id?: string
          insurance_expiry_date?: string | null
          insurance_number?: string | null
          languages_spoken?: string[] | null
          last_name?: string | null
          nationality?: string | null
          payment_provider_account_id?: string | null
          phone?: string | null
          postal_code?: string | null
          preferred_zones?: string[] | null
          rating?: number | null
          status?: Database["public"]["Enums"]["driver_status"]
          terms_accepted_at?: string | null
          total_rides?: number | null
          updated_at?: string
          user_id: string
          vtc_card_expiry_date?: string | null
          vtc_card_number?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          availability_hours?: Json | null
          avatar_url?: string | null
          city?: string | null
          company_name?: string | null
          company_phone?: string | null
          company_siret?: string | null
          created_at?: string
          current_vehicle_id?: string | null
          date_of_birth?: string | null
          document_urls?: Json | null
          driving_license_categories?: string[] | null
          driving_license_expiry_date?: string | null
          driving_license_issue_date?: string | null
          driving_license_number?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_name?: string | null
          employee_phone?: string | null
          first_name?: string | null
          id?: string
          insurance_expiry_date?: string | null
          insurance_number?: string | null
          languages_spoken?: string[] | null
          last_name?: string | null
          nationality?: string | null
          payment_provider_account_id?: string | null
          phone?: string | null
          postal_code?: string | null
          preferred_zones?: string[] | null
          rating?: number | null
          status?: Database["public"]["Enums"]["driver_status"]
          terms_accepted_at?: string | null
          total_rides?: number | null
          updated_at?: string
          user_id?: string
          vtc_card_expiry_date?: string | null
          vtc_card_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_addresses: {
        Row: {
          address: string
          created_at: string
          id: string
          is_default: boolean
          lat: number | null
          lon: number | null
          name: string
          place_id: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_default?: boolean
          lat?: number | null
          lon?: number | null
          name: string
          place_id?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_default?: boolean
          lat?: number | null
          lon?: number | null
          name?: string
          place_id?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          data: Json | null
          delivered_at: string | null
          id: string
          is_read: boolean
          message: string
          priority: string
          read_at: string | null
          ride_id: string | null
          sent_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          data?: Json | null
          delivered_at?: string | null
          id?: string
          is_read?: boolean
          message: string
          priority?: string
          read_at?: string | null
          ride_id?: string | null
          sent_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          data?: Json | null
          delivered_at?: string | null
          id?: string
          is_read?: boolean
          message?: string
          priority?: string
          read_at?: string | null
          ride_id?: string | null
          sent_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          available: boolean
          created_at: string
          description: string
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          description: string
          id?: string
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          available?: boolean
          created_at?: string
          description?: string
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          metadata: Json | null
          method: string
          paid_at: string | null
          receipt_url: string | null
          refund_amount: number | null
          refunded_at: string | null
          ride_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json | null
          method: string
          paid_at?: string | null
          receipt_url?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          ride_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json | null
          method?: string
          paid_at?: string | null
          receipt_url?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          ride_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string
          end_date: string
          id: string
          max_discount: number | null
          max_uses: number | null
          min_ride_value: number | null
          promo_type: Database["public"]["Enums"]["promo_type_enum"]
          start_date: string
          updated_at: string
          uses_per_user: number | null
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description: string
          end_date: string
          id?: string
          max_discount?: number | null
          max_uses?: number | null
          min_ride_value?: number | null
          promo_type: Database["public"]["Enums"]["promo_type_enum"]
          start_date: string
          updated_at?: string
          uses_per_user?: number | null
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string
          end_date?: string
          id?: string
          max_discount?: number | null
          max_uses?: number | null
          min_ride_value?: number | null
          promo_type?: Database["public"]["Enums"]["promo_type_enum"]
          start_date?: string
          updated_at?: string
          uses_per_user?: number | null
          value?: number
        }
        Relationships: []
      }
      promo_usages: {
        Row: {
          created_at: string
          discount_amount: number
          id: string
          promo_code_id: string | null
          ride_id: string | null
          updated_at: string
          used_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          discount_amount: number
          id?: string
          promo_code_id?: string | null
          ride_id?: string | null
          updated_at?: string
          used_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          discount_amount?: number
          id?: string
          promo_code_id?: string | null
          ride_id?: string | null
          updated_at?: string
          used_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_usages_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_usages_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_usages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rates: {
        Row: {
          base_price: number
          created_at: string
          id: number
          min_price: number
          price_per_km: number
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type_enum"]
        }
        Insert: {
          base_price: number
          created_at?: string
          id?: number
          min_price?: number
          price_per_km: number
          updated_at?: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type_enum"]
        }
        Update: {
          base_price?: number
          created_at?: string
          id?: number
          min_price?: number
          price_per_km?: number
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type_enum"]
        }
        Relationships: []
      }
      reviews: {
        Row: {
          categories: Json | null
          comment: string | null
          created_at: string
          id: string
          is_reported: boolean
          is_visible: boolean
          moderated_at: string | null
          moderated_by: string | null
          rating: number
          report_reason: string | null
          reviewee_id: string
          reviewer_id: string
          ride_id: string
          updated_at: string
        }
        Insert: {
          categories?: Json | null
          comment?: string | null
          created_at?: string
          id?: string
          is_reported?: boolean
          is_visible?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          rating: number
          report_reason?: string | null
          reviewee_id: string
          reviewer_id: string
          ride_id: string
          updated_at?: string
        }
        Update: {
          categories?: Json | null
          comment?: string | null
          created_at?: string
          id?: string
          is_reported?: boolean
          is_visible?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          rating?: number
          report_reason?: string | null
          reviewee_id?: string
          reviewer_id?: string
          ride_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_offers: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          offered_at: string
          responded_at: string | null
          ride_id: string
          snapshot: Json
          status: Database["public"]["Enums"]["ride_offer_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          offered_at?: string
          responded_at?: string | null
          ride_id: string
          snapshot?: Json
          status?: Database["public"]["Enums"]["ride_offer_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          offered_at?: string
          responded_at?: string | null
          ride_id?: string
          snapshot?: Json
          status?: Database["public"]["Enums"]["ride_offer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_offers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ride_offers_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          confirmed_by_client: boolean | null
          confirmed_by_driver: boolean | null
          delay_minutes: number | null
          delay_reason: string | null
          external_intervention: boolean | null
          financial_impact: number | null
          id: string
          location_lat: number | null
          location_lon: number | null
          notes: string | null
          previous_status: string | null
          reason_category: string | null
          requires_followup: boolean | null
          ride_id: string
          status: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          confirmed_by_client?: boolean | null
          confirmed_by_driver?: boolean | null
          delay_minutes?: number | null
          delay_reason?: string | null
          external_intervention?: boolean | null
          financial_impact?: number | null
          id?: string
          location_lat?: number | null
          location_lon?: number | null
          notes?: string | null
          previous_status?: string | null
          reason_category?: string | null
          requires_followup?: boolean | null
          ride_id: string
          status: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          confirmed_by_client?: boolean | null
          confirmed_by_driver?: boolean | null
          delay_minutes?: number | null
          delay_reason?: string | null
          external_intervention?: boolean | null
          financial_impact?: number | null
          id?: string
          location_lat?: number | null
          location_lon?: number | null
          notes?: string | null
          previous_status?: string | null
          reason_category?: string | null
          requires_followup?: boolean | null
          ride_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_status_history_reason_category_fkey"
            columns: ["reason_category"]
            isOneToOne: false
            referencedRelation: "status_reason_categories"
            referencedColumns: ["category_code"]
          },
          {
            foreignKeyName: "ride_status_history_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      ride_stops: {
        Row: {
          address: string
          created_at: string
          estimated_arrival: string | null
          estimated_wait_time: number | null
          id: string
          lat: number | null
          lon: number | null
          notes: string | null
          ride_id: string
          stop_order: number
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          estimated_arrival?: string | null
          estimated_wait_time?: number | null
          id?: string
          lat?: number | null
          lon?: number | null
          notes?: string | null
          ride_id: string
          stop_order: number
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          estimated_arrival?: string | null
          estimated_wait_time?: number | null
          id?: string
          lat?: number | null
          lon?: number | null
          notes?: string | null
          ride_id?: string
          stop_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ride_stops_ride_id_fkey"
            columns: ["ride_id"]
            isOneToOne: false
            referencedRelation: "rides"
            referencedColumns: ["id"]
          },
        ]
      }
      rides: {
        Row: {
          accepted_at: string | null
          created_at: string
          distance: number | null
          driver_id: string | null
          dropoff_address: string
          dropoff_lat: number | null
          dropoff_lon: number | null
          duration: number | null
          estimated_price: number | null
          final_price: number | null
          id: string
          options: string[] | null
          override_vehicle_id: string | null
          pickup_address: string
          pickup_lat: number | null
          pickup_lon: number | null
          pickup_notes: string | null
          pickup_time: string
          price: number | null
          status: Database["public"]["Enums"]["ride_status"]
          updated_at: string
          user_id: string | null
          vehicle_type: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          distance?: number | null
          driver_id?: string | null
          dropoff_address: string
          dropoff_lat?: number | null
          dropoff_lon?: number | null
          duration?: number | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          options?: string[] | null
          override_vehicle_id?: string | null
          pickup_address: string
          pickup_lat?: number | null
          pickup_lon?: number | null
          pickup_notes?: string | null
          pickup_time: string
          price?: number | null
          status?: Database["public"]["Enums"]["ride_status"]
          updated_at?: string
          user_id?: string | null
          vehicle_type: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          distance?: number | null
          driver_id?: string | null
          dropoff_address?: string
          dropoff_lat?: number | null
          dropoff_lon?: number | null
          duration?: number | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          options?: string[] | null
          override_vehicle_id?: string | null
          pickup_address?: string
          pickup_lat?: number | null
          pickup_lon?: number | null
          pickup_notes?: string | null
          pickup_time?: string
          price?: number | null
          status?: Database["public"]["Enums"]["ride_status"]
          updated_at?: string
          user_id?: string | null
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "rides_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_promotions: {
        Row: {
          active: boolean
          created_at: string
          description: string
          discount_percentage: number
          end_date: string
          id: string
          name: string
          start_date: string
          time_slots: Json | null
          updated_at: string
          vehicle_types:
            | Database["public"]["Enums"]["vehicle_type_enum"][]
            | null
          zones: string[] | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          discount_percentage: number
          end_date: string
          id?: string
          name: string
          start_date: string
          time_slots?: Json | null
          updated_at?: string
          vehicle_types?:
            | Database["public"]["Enums"]["vehicle_type_enum"][]
            | null
          zones?: string[] | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          discount_percentage?: number
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          time_slots?: Json | null
          updated_at?: string
          vehicle_types?:
            | Database["public"]["Enums"]["vehicle_type_enum"][]
            | null
          zones?: string[] | null
        }
        Relationships: []
      }
      status_reason_categories: {
        Row: {
          category_code: string
          description: string
          id: number
          requires_approval: boolean | null
          requires_notes: boolean | null
        }
        Insert: {
          category_code: string
          description: string
          id?: number
          requires_approval?: boolean | null
          requires_notes?: boolean | null
        }
        Update: {
          category_code?: string
          description?: string
          id?: number
          requires_approval?: boolean | null
          requires_notes?: boolean | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          app_metadata: Json | null
          created_at: string | null
          id: number
          role: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          app_metadata?: Json | null
          created_at?: string | null
          id?: never
          role?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          app_metadata?: Json | null
          created_at?: string | null
          id?: never
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vehicle_documents: {
        Row: {
          document_type: string
          file_name: string | null
          file_size: number | null
          file_url: string
          id: string
          rejection_reason: string | null
          upload_date: string | null
          uploaded_by: string | null
          validation_status: string | null
          vehicle_id: string | null
        }
        Insert: {
          document_type: string
          file_name?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          rejection_reason?: string | null
          upload_date?: string | null
          uploaded_by?: string | null
          validation_status?: string | null
          vehicle_id?: string | null
        }
        Update: {
          document_type?: string
          file_name?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          rejection_reason?: string | null
          upload_date?: string | null
          uploaded_by?: string | null
          validation_status?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_documents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string | null
          documents: Json | null
          driver_id: string | null
          first_registration_date: string | null
          fuel_type: string | null
          id: string
          insurance_number: string | null
          is_primary: boolean | null
          license_plate: string
          make: string
          model: string
          owner_name: string | null
          owner_user_id: string | null
          photos: Json | null
          registration_number: string | null
          seats: number | null
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string | null
          validation_status: string | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type_enum"] | null
          vin: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          documents?: Json | null
          driver_id?: string | null
          first_registration_date?: string | null
          fuel_type?: string | null
          id?: string
          insurance_number?: string | null
          is_primary?: boolean | null
          license_plate: string
          make: string
          model: string
          owner_name?: string | null
          owner_user_id?: string | null
          photos?: Json | null
          registration_number?: string | null
          seats?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          validation_status?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type_enum"] | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          documents?: Json | null
          driver_id?: string | null
          first_registration_date?: string | null
          fuel_type?: string | null
          id?: string
          insurance_number?: string | null
          is_primary?: boolean | null
          license_plate?: string
          make?: string
          model?: string
          owner_name?: string | null
          owner_user_id?: string | null
          photos?: Json | null
          registration_number?: string | null
          seats?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          validation_status?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type_enum"] | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      driver_offer_stats: {
        Row: {
          accept_rate_pct: number | null
          accepted_count: number | null
          declined_count: number | null
          driver_id: string | null
          expired_taken_count: number | null
          open_offered_count: number | null
          responded_count: number | null
          timeout_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ride_offers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles_public: {
        Row: {
          color: string | null
          created_at: string | null
          driver_id: string | null
          first_registration_date: string | null
          fuel_type: string | null
          id: string | null
          is_primary: boolean | null
          license_plate: string | null
          make: string | null
          model: string | null
          owner_name: string | null
          owner_user_id: string | null
          photos: Json | null
          registration_number: string | null
          seats: number | null
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string | null
          validation_status: string | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type_enum"] | null
          vin: string | null
          year: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          driver_id?: string | null
          first_registration_date?: string | null
          fuel_type?: string | null
          id?: string | null
          is_primary?: boolean | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          photos?: Json | null
          registration_number?: string | null
          seats?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          validation_status?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type_enum"] | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          driver_id?: string | null
          first_registration_date?: string | null
          fuel_type?: string | null
          id?: string | null
          is_primary?: boolean | null
          license_plate?: string | null
          make?: string | null
          model?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          photos?: Json | null
          registration_number?: string | null
          seats?: number | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          validation_status?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type_enum"] | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_vehicles_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _current_driver_id: { Args: never; Returns: string }
      _ride_offer_snapshot: {
        Args: { p_ride: Database["public"]["Tables"]["rides"]["Row"] }
        Returns: Json
      }
      accept_ride: {
        Args: { p_driver_id?: string; p_ride_id: string }
        Returns: Json
      }
      admin_cancel_ride: {
        Args: { p_reason?: string; p_ride_id: string }
        Returns: Json
      }
      admin_reassign_ride: {
        Args: { p_driver_id: string; p_ride_id: string }
        Returns: Json
      }
      associate_temp_documents: {
        Args: { p_driver_id: string; p_user_id: string }
        Returns: Json
      }
      calculate_driver_rating: {
        Args: { driver_uuid: string }
        Returns: {
          avg_rating: number
          total_reviews: number
        }[]
      }
      can_driver_accept_rides: {
        Args: { driver_ref: string }
        Returns: {
          can_accept: boolean
          profile_status: string
          reason: string
          validation_status: string
        }[]
      }
      can_edit_driver_dossier: {
        Args: { p_driver_id: string; p_user_id: string }
        Returns: boolean
      }
      check_driver_profile_completeness: {
        Args: { driver_user_id: string }
        Returns: {
          completion_percentage: number
          is_complete: boolean
          missing_fields: string[]
        }[]
      }
      check_driver_upload_permission: {
        Args: { p_path: string; p_user_id: string }
        Returns: boolean
      }
      check_user_role_update: { Args: never; Returns: boolean }
      cleanup_old_driver_locations: { Args: never; Returns: undefined }
      cleanup_orphaned_documents: { Args: never; Returns: number }
      create_pending_driver: {
        Args: {
          p_company_name?: string
          p_company_phone?: string
          p_driving_license_expiry_date: string
          p_driving_license_number: string
          p_first_name: string
          p_insurance_expiry_date?: string
          p_insurance_number?: string
          p_languages_spoken?: string[]
          p_last_name: string
          p_phone: string
          p_preferred_zones?: string[]
          p_vtc_card_expiry_date: string
          p_vtc_card_number: string
        }
        Returns: Json
      }
      create_user_profile: {
        Args: { user_id: string; user_role: string }
        Returns: boolean
      }
      debug_check_driver_profile_completeness: {
        Args: { driver_user_id: string }
        Returns: {
          completion_percentage: number
          debug_info: Json
          is_complete: boolean
          missing_fields: string[]
        }[]
      }
      debug_driver_completeness: {
        Args: { driver_user_id: string }
        Returns: {
          check_name: string
          field_category: string
          field_value: string
          is_valid: boolean
        }[]
      }
      delete_driver_file: {
        Args: {
          document_type_param?: string
          driver_id_param: string
          file_bucket: string
          file_path: string
        }
        Returns: boolean
      }
      delete_user_and_associated_data: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      delete_user_by_id: { Args: { p_user_id: string }; Returns: undefined }
      ensure_driver_profile: {
        Args: { driver_user_id: string }
        Returns: string
      }
      find_nearby_drivers: {
        Args: { p_lat: number; p_lng: number; p_radius_km?: number }
        Returns: {
          distance_meters: number
          driver_id: string
          heading: number
          last_updated: string
        }[]
      }
      fix_all_driver_statuses: {
        Args: never
        Returns: {
          active_count: number
          inactive_count: number
          incomplete_count: number
          pending_validation_count: number
          rejected_count: number
          suspended_count: number
          updated_count: number
        }[]
      }
      force_update_driver_status: {
        Args: { driver_user_id: string }
        Returns: {
          completion_percentage: number
          driver_id: string
          is_complete: boolean
          new_status: Database["public"]["Enums"]["driver_status"]
          old_status: Database["public"]["Enums"]["driver_status"]
        }[]
      }
      get_auth_role: { Args: never; Returns: string }
      get_driver_completeness_details: {
        Args: { target_user_id?: string }
        Returns: {
          details: Json
          info: string
          section: string
        }[]
      }
      get_driver_dossier_status: {
        Args: { p_driver_id: string }
        Returns: {
          can_edit_documents: boolean
          can_submit: boolean
          completion_percentage: number
          is_editable: boolean
          rejected_at: string
          rejection_reason: string
          status: string
          submitted_at: string
          validated_at: string
        }[]
      }
      get_driver_id_from_auth: { Args: never; Returns: string }
      get_driver_submission_history: {
        Args: { p_driver_id: string }
        Returns: {
          action: string
          created_at: string
          details: Json
          error_message: string
          formatted_date: string
          id: string
          new_status: string
          previous_status: string
        }[]
      }
      get_drivers_completeness_stats: {
        Args: never
        Returns: {
          average_completion_percentage: number
          complete_drivers: number
          incomplete_drivers: number
          pending_validation: number
          total_drivers: number
        }[]
      }
      get_incomplete_drivers_report: {
        Args: never
        Returns: {
          completion_percentage: number
          first_name: string
          is_complete: boolean
          last_name: string
          missing_fields: string[]
          status: Database["public"]["Enums"]["driver_status"]
          user_id: string
        }[]
      }
      get_safe_email: { Args: never; Returns: string }
      get_user_profile: { Args: { user_id: string }; Returns: Json }
      get_user_role: { Args: never; Returns: string }
      has_any_role: { Args: { allowed_roles: string[] }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_customer: { Args: never; Returns: boolean }
      is_driver: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      log_driver_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_driver_id: string
          p_error_message?: string
          p_new_status?: string
          p_previous_status?: string
          p_user_id: string
        }
        Returns: string
      }
      mark_notification_read: {
        Args: { notification_uuid: string }
        Returns: undefined
      }
      record_ride_offer: { Args: { p_ride_id: string }; Returns: Json }
      respond_ride_offer: {
        Args: { p_response: string; p_ride_id: string }
        Returns: Json
      }
      set_driver_offline: { Args: never; Returns: undefined }
      setup_admin_policies: { Args: { admin_id: string }; Returns: undefined }
      submit_driver_dossier: {
        Args: { p_driver_id: string; p_user_id: string }
        Returns: {
          message: string
          new_status: string
          success: boolean
        }[]
      }
      test_driver_completeness_full: {
        Args: { target_user_id?: string }
        Returns: {
          details: Json
          info: string
          section: string
        }[]
      }
      update_driver_document_url: {
        Args: {
          p_document_type: string
          p_driver_id: string
          p_file_url: string
        }
        Returns: boolean
      }
      update_driver_location: {
        Args: {
          p_accuracy?: number
          p_heading?: number
          p_lat: number
          p_lng: number
          p_speed?: number
        }
        Returns: undefined
      }
      update_driver_status_auto: {
        Args: { driver_user_id: string }
        Returns: string
      }
      update_driver_status_by_id: {
        Args: { driver_id: string }
        Returns: string
      }
      update_ride_progress: {
        Args: {
          p_ride_id: string
          p_status: Database["public"]["Enums"]["ride_status"]
        }
        Returns: Json
      }
      validate_driver: {
        Args: {
          approved: boolean
          driver_id: string
          rejection_reason?: string
        }
        Returns: Json
      }
      validate_driver_document: {
        Args: { p_approve: boolean; p_document_id: string; p_reason?: string }
        Returns: Json
      }
      validate_driver_dossier: {
        Args: {
          p_admin_user_id: string
          p_approved: boolean
          p_driver_id: string
          p_rejection_reason?: string
        }
        Returns: {
          message: string
          new_status: string
          success: boolean
        }[]
      }
    }
    Enums: {
      discount_type_enum: "percentage" | "fixed"
      driver_status:
        | "pending_validation"
        | "active"
        | "inactive"
        | "on_vacation"
        | "suspended"
        | "incomplete"
        | "draft"
        | "rejected"
        | "pending_review"
      promo_type_enum: "percentage" | "fixed_amount"
      reward_type_enum: "bonus" | "commission_increase"
      ride_offer_status:
        | "offered"
        | "accepted"
        | "declined"
        | "timeout"
        | "expired_taken"
      ride_status:
        | "pending"
        | "scheduled"
        | "in-progress"
        | "completed"
        | "client-canceled"
        | "driver-canceled"
        | "admin-canceled"
        | "no-show"
        | "delayed"
      vehicle_type_enum: "STANDARD" | "PREMIUM" | "VAN" | "ELECTRIC"
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
      discount_type_enum: ["percentage", "fixed"],
      driver_status: [
        "pending_validation",
        "active",
        "inactive",
        "on_vacation",
        "suspended",
        "incomplete",
        "draft",
        "rejected",
        "pending_review",
      ],
      promo_type_enum: ["percentage", "fixed_amount"],
      reward_type_enum: ["bonus", "commission_increase"],
      ride_offer_status: [
        "offered",
        "accepted",
        "declined",
        "timeout",
        "expired_taken",
      ],
      ride_status: [
        "pending",
        "scheduled",
        "in-progress",
        "completed",
        "client-canceled",
        "driver-canceled",
        "admin-canceled",
        "no-show",
        "delayed",
      ],
      vehicle_type_enum: ["STANDARD", "PREMIUM", "VAN", "ELECTRIC"],
    },
  },
} as const

// Convenience aliases for app consumers (Next.js / Expo). Do not edit manually —
// regenerate via scripts/gen-types.sh
export type Driver = Database["public"]["Tables"]["drivers"]["Row"]
export type Ride = Database["public"]["Tables"]["rides"]["Row"]
export type DriverLocation = Database["public"]["Tables"]["driver_locations"]["Row"]
export type DriverDocument = Database["public"]["Tables"]["driver_documents"]["Row"]
export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"]
export type DriverStatus = Database["public"]["Enums"]["driver_status"]
export type RideStatus = Database["public"]["Enums"]["ride_status"]
export type VehicleType = Database["public"]["Enums"]["vehicle_type_enum"]
