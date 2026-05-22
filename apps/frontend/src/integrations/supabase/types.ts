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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          metadata: Json | null
          route_id: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          metadata?: Json | null
          route_id?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          metadata?: Json | null
          route_id?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      buyer_risk_acknowledgements: {
        Row: {
          acknowledged_at: string
          acknowledgement_version: string
          declarations: Json
          id: string
          ip_hash: string | null
          risk_level: string | null
          route_id: number
          user_agent: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          acknowledgement_version?: string
          declarations: Json
          id?: string
          ip_hash?: string | null
          risk_level?: string | null
          route_id: number
          user_agent?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          acknowledgement_version?: string
          declarations?: Json
          id?: string
          ip_hash?: string | null
          risk_level?: string | null
          route_id?: number
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buyer_risk_acknowledgements_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_creatives: {
        Row: {
          bg_color: string | null
          campaign_id: string
          created_at: string
          cta_text: string | null
          headline: string
          id: string
          image_key: string | null
          language_code: string
          subheadline: string | null
          text_color: string | null
        }
        Insert: {
          bg_color?: string | null
          campaign_id: string
          created_at?: string
          cta_text?: string | null
          headline: string
          id?: string
          image_key?: string | null
          language_code?: string
          subheadline?: string | null
          text_color?: string | null
        }
        Update: {
          bg_color?: string | null
          campaign_id?: string
          created_at?: string
          cta_text?: string | null
          headline?: string
          id?: string
          image_key?: string | null
          language_code?: string
          subheadline?: string | null
          text_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "public_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_events: {
        Row: {
          campaign_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "public_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          budget_cents: number | null
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          id: string
          is_internal: boolean
          name: string
          placement: Database["public"]["Enums"]["campaign_placement"]
          priority: number
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          target_category_id: number | null
          target_route_id: number | null
          target_url: string | null
          updated_at: string
        }
        Insert: {
          budget_cents?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_internal?: boolean
          name: string
          placement?: Database["public"]["Enums"]["campaign_placement"]
          priority?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_category_id?: number | null
          target_route_id?: number | null
          target_url?: string | null
          updated_at?: string
        }
        Update: {
          budget_cents?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_internal?: boolean
          name?: string
          placement?: Database["public"]["Enums"]["campaign_placement"]
          priority?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_category_id?: number | null
          target_route_id?: number | null
          target_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_target_category_id_fkey"
            columns: ["target_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_target_route_id_fkey"
            columns: ["target_route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          icon: string
          id: number
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: number
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string
          id?: number
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: number
          route_id: number
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: number
          route_id: number
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: number
          route_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          guest_email: string | null
          guest_name: string | null
          id: string
          status: string
          subject: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      creator_declarations: {
        Row: {
          accepted_at: string
          declarations: Json
          id: string
          route_id: number
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          declarations: Json
          id?: string
          route_id: number
          terms_version?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          declarations?: Json
          id?: string
          route_id?: number
          terms_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_declarations_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profiles: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string
          id: number
          stripe_connect_account_id: string | null
          stripe_onboarding_complete: boolean | null
          total_earnings: number | null
          total_sales: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name: string
          id?: number
          stripe_connect_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          total_earnings?: number | null
          total_sales?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: number
          stripe_connect_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          total_earnings?: number | null
          total_sales?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      favorites: {
        Row: {
          created_at: string
          id: number
          route_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          route_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: never
          route_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_content: {
        Row: {
          category: string
          content_type: string
          created_at: string
          created_by: string
          file_key: string | null
          id: string
          language_code: string | null
          metadata: Json | null
          prompt: string
          result_text: string | null
          route_id: number | null
          updated_at: string
        }
        Insert: {
          category: string
          content_type: string
          created_at?: string
          created_by: string
          file_key?: string | null
          id?: string
          language_code?: string | null
          metadata?: Json | null
          prompt: string
          result_text?: string | null
          route_id?: number | null
          updated_at?: string
        }
        Update: {
          category?: string
          content_type?: string
          created_at?: string
          created_by?: string
          file_key?: string | null
          id?: string
          language_code?: string | null
          metadata?: Json | null
          prompt?: string
          result_text?: string | null
          route_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_content_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_documents: {
        Row: {
          content_hash: string
          created_at: string
          doc_type: string
          id: string
          published_at: string
          title: string | null
          version: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          doc_type: string
          id?: string
          published_at?: string
          title?: string | null
          version: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          doc_type?: string
          id?: string
          published_at?: string
          title?: string | null
          version?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id?: string | null
          sender_type?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          primary_language: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          primary_language?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          primary_language?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchase_consents: {
        Row: {
          accepted_at: string
          consent_version: string
          declarations: Json
          id: string
          ip_hash: string | null
          route_id: number
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          consent_version?: string
          declarations: Json
          id?: string
          ip_hash?: string | null
          route_id: number
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          consent_version?: string
          declarations?: Json
          id?: string
          ip_hash?: string | null
          route_id?: number
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_consents_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount_paid: number
          id: number
          purchased_at: string
          route_id: number
          stripe_payment_intent_id: string | null
          user_id: string
        }
        Insert: {
          amount_paid: number
          id?: number
          purchased_at?: string
          route_id: number
          stripe_payment_intent_id?: string | null
          user_id: string
        }
        Update: {
          amount_paid?: number
          id?: number
          purchased_at?: string
          route_id?: number
          stripe_payment_intent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          created_at: string
          id: number
          route_id: number
          score: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          route_id: number
          score: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          route_id?: number
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_images: {
        Row: {
          created_at: string
          id: number
          image_key: string
          route_id: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: never
          image_key: string
          route_id: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: never
          image_key?: string
          route_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_images_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_pdfs: {
        Row: {
          created_at: string
          file_key: string
          id: number
          language_code: string
          route_id: number
        }
        Insert: {
          created_at?: string
          file_key: string
          id?: never
          language_code: string
          route_id: number
        }
        Update: {
          created_at?: string
          file_key?: string
          id?: never
          language_code?: string
          route_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_pdfs_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_pois: {
        Row: {
          created_at: string
          description: string
          fun_fact: string | null
          id: string
          lat: number
          lng: number
          name: string
          photo_keys: Json | null
          route_id: number
          sort_order: number
          type: string
        }
        Insert: {
          created_at?: string
          description?: string
          fun_fact?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          photo_keys?: Json | null
          route_id: number
          sort_order?: number
          type?: string
        }
        Update: {
          created_at?: string
          description?: string
          fun_fact?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          photo_keys?: Json | null
          route_id?: number
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_pois_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_private_details: {
        Row: {
          created_at: string
          full_description: string
          route_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_description?: string
          route_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_description?: string
          route_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      route_recommendations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          photo_key: string | null
          price_range: string | null
          route_id: number
          sort_order: number
          what_to_order: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          photo_key?: string | null
          price_range?: string | null
          route_id: number
          sort_order?: number
          what_to_order?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          photo_key?: string | null
          price_range?: string | null
          route_id?: number
          sort_order?: number
          what_to_order?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_recommendations_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_tips: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          route_id: number
          sort_order: number
        }
        Insert: {
          category: string
          content?: string
          created_at?: string
          id?: string
          route_id: number
          sort_order?: number
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          route_id?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_tips_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_translations: {
        Row: {
          created_at: string
          description: string
          id: number
          is_auto_translated: boolean
          language_code: string
          route_id: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: never
          is_auto_translated?: boolean
          language_code: string
          route_id: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: never
          is_auto_translated?: boolean
          language_code?: string
          route_id?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_translations_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          ai_assisted: boolean
          ai_assisted_note: string | null
          ai_assisted_scope: string | null
          audience: Json | null
          budget: string | null
          category_id: number | null
          cover_image_key: string | null
          created_at: string
          currency: string
          data_confidence: string | null
          description: string
          difficulty: string | null
          distance_km: number | null
          duration: string | null
          elevation_gain_m: number | null
          end_point: string | null
          estimated_time_h: number | null
          gpx_file_key: string | null
          id: number
          instagram_url: string | null
          known_hazards: Json | null
          last_verified_at: string | null
          latitude: number
          location_string: string
          longitude: number
          loop_type: string | null
          pdf_file_key: string | null
          pets_friendly: boolean
          preview_track: Json | null
          price: number
          required_equipment: Json | null
          risk_level: string | null
          route_type: string | null
          season: string | null
          start_point: string | null
          status: string
          subcategory: string | null
          surface_type: string | null
          tags: Json | null
          title: string
          updated_at: string
          user_id: string
          youtube_url: string | null
        }
        Insert: {
          ai_assisted?: boolean
          ai_assisted_note?: string | null
          ai_assisted_scope?: string | null
          audience?: Json | null
          budget?: string | null
          category_id?: number | null
          cover_image_key?: string | null
          created_at?: string
          currency?: string
          data_confidence?: string | null
          description?: string
          difficulty?: string | null
          distance_km?: number | null
          duration?: string | null
          elevation_gain_m?: number | null
          end_point?: string | null
          estimated_time_h?: number | null
          gpx_file_key?: string | null
          id?: number
          instagram_url?: string | null
          known_hazards?: Json | null
          last_verified_at?: string | null
          latitude?: number
          location_string?: string
          longitude?: number
          loop_type?: string | null
          pdf_file_key?: string | null
          pets_friendly?: boolean
          preview_track?: Json | null
          price?: number
          required_equipment?: Json | null
          risk_level?: string | null
          route_type?: string | null
          season?: string | null
          start_point?: string | null
          status?: string
          subcategory?: string | null
          surface_type?: string | null
          tags?: Json | null
          title: string
          updated_at?: string
          user_id: string
          youtube_url?: string | null
        }
        Update: {
          ai_assisted?: boolean
          ai_assisted_note?: string | null
          ai_assisted_scope?: string | null
          audience?: Json | null
          budget?: string | null
          category_id?: number | null
          cover_image_key?: string | null
          created_at?: string
          currency?: string
          data_confidence?: string | null
          description?: string
          difficulty?: string | null
          distance_km?: number | null
          duration?: string | null
          elevation_gain_m?: number | null
          end_point?: string | null
          estimated_time_h?: number | null
          gpx_file_key?: string | null
          id?: number
          instagram_url?: string | null
          known_hazards?: Json | null
          last_verified_at?: string | null
          latitude?: number
          location_string?: string
          longitude?: number
          loop_type?: string | null
          pdf_file_key?: string | null
          pets_friendly?: boolean
          preview_track?: Json | null
          price?: number
          required_equipment?: Json | null
          risk_level?: string | null
          route_type?: string | null
          season?: string | null
          start_point?: string | null
          status?: string
          subcategory?: string | null
          surface_type?: string | null
          tags?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_campaigns: {
        Row: {
          end_date: string | null
          id: string | null
          name: string | null
          placement: Database["public"]["Enums"]["campaign_placement"] | null
          priority: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"] | null
          target_category_id: number | null
          target_route_id: number | null
          target_url: string | null
        }
        Insert: {
          end_date?: string | null
          id?: string | null
          name?: string | null
          placement?: Database["public"]["Enums"]["campaign_placement"] | null
          priority?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          target_category_id?: number | null
          target_route_id?: number | null
          target_url?: string | null
        }
        Update: {
          end_date?: string | null
          id?: string | null
          name?: string | null
          placement?: Database["public"]["Enums"]["campaign_placement"] | null
          priority?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"] | null
          target_category_id?: number | null
          target_route_id?: number | null
          target_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_target_category_id_fkey"
            columns: ["target_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_target_route_id_fkey"
            columns: ["target_route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      public_creator_profiles: {
        Row: {
          bio: string | null
          created_at: string | null
          display_name: string | null
          id: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_favorites_count: {
        Args: { route_ids: number[] }
        Returns: {
          fav_count: number
          route_id: number
        }[]
      }
      get_route_pdf_languages: {
        Args: { route_ids: number[] }
        Returns: {
          language_code: string
          route_id: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "creator"
      campaign_placement:
        | "hero_banner"
        | "card_highlight"
        | "sidebar"
        | "category_bar"
        | "checkout"
      campaign_status: "draft" | "scheduled" | "active" | "paused" | "ended"
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
      app_role: ["admin", "moderator", "user", "creator"],
      campaign_placement: [
        "hero_banner",
        "card_highlight",
        "sidebar",
        "category_bar",
        "checkout",
      ],
      campaign_status: ["draft", "scheduled", "active", "paused", "ended"],
    },
  },
} as const
