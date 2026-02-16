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
      drivers: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          availability_hours: Json | null
          avatar_url: string | null
          city: string | null
          company_name: string | null
          company_phone: string | null
          created_at: string
          current_vehicle_id: string | null
          date_of_birth: string | null
          document_urls: Json | null
          driving_license_expiry_date: string | null
          driving_license_number: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string | null
          id: string
          insurance_expiry_date: string | null
          insurance_number: string | null
          languages_spoken: string[] | null
          last_name: string | null
          phone: string | null
          postal_code: string | null
          preferred_zones: string[] | null
          rating: number | null
          status: Database["public"]["Enums"]["driver_status"]
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
          created_at?: string
          current_vehicle_id?: string | null
          date_of_birth?: string | null
          document_urls?: Json | null
          driving_license_expiry_date?: string | null
          driving_license_number?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string | null
          id?: string
          insurance_expiry_date?: string | null
          insurance_number?: string | null
          languages_spoken?: string[] | null
          last_name?: string | null
          phone?: string | null
          postal_code?: string | null
          preferred_zones?: string[] | null
          rating?: number | null
          status?: Database["public"]["Enums"]["driver_status"]
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
          created_at?: string
          current_vehicle_id?: string | null
          date_of_birth?: string | null
          document_urls?: Json | null
          driving_license_expiry_date?: string | null
          driving_license_number?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string | null
          id?: string
          insurance_expiry_date?: string | null
          insurance_number?: string | null
          languages_spoken?: string[] | null
          last_name?: string | null
          phone?: string | null
          postal_code?: string | null
          preferred_zones?: string[] | null
          rating?: number | null
          status?: Database["public"]["Enums"]["driver_status"]
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
    Views: {}
    Functions: {
      accept_ride: {
        Args: { p_driver_id: string; p_ride_id: string }
        Returns: Json
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
      can_driver_accept_rides: {
        Args: { driver_user_id: string }
        Returns: {
          can_accept: boolean
          profile_status: string
          reason: string
          validation_status: string
        }[]
      }
      check_driver_profile_completeness: {
        Args: { driver_user_id: string }
        Returns: {
          completion_percentage: number
          is_complete: boolean
          missing_fields: string[]
        }[]
      }
    }
    Enums: {
      driver_status:
        | "pending_validation"
        | "active"
        | "inactive"
        | "on_vacation"
        | "suspended"
        | "incomplete"
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

export type Driver = Database["public"]["Tables"]["drivers"]["Row"]
export type Ride = Database["public"]["Tables"]["rides"]["Row"]
export type DriverLocation = Database["public"]["Tables"]["driver_locations"]["Row"]
export type DriverDocument = Database["public"]["Tables"]["driver_documents"]["Row"]
export type Vehicle = Database["public"]["Tables"]["vehicles"]["Row"]

export type DriverStatus = Database["public"]["Enums"]["driver_status"]
export type RideStatus = Database["public"]["Enums"]["ride_status"]
export type VehicleType = Database["public"]["Enums"]["vehicle_type_enum"]
