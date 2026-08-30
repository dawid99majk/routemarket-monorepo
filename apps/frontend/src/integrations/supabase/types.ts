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
      ai_usage_log: {
        Row: {
          charged_tokens: number | null
          completion_tokens: number | null
          cost_micro_usd: number | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: number
          model: string | null
          operation: string
          project_id: string | null
          prompt_tokens: number | null
          success: boolean
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          charged_tokens?: number | null
          completion_tokens?: number | null
          cost_micro_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: number
          model?: string | null
          operation: string
          project_id?: string | null
          prompt_tokens?: number | null
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          charged_tokens?: number | null
          completion_tokens?: number | null
          cost_micro_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: number
          model?: string | null
          operation?: string
          project_id?: string | null
          prompt_tokens?: number | null
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      atlas_artifacts: {
        Row: {
          data: Json
          project_slug: string
          type: string
          updated_at: string | null
        }
        Insert: {
          data: Json
          project_slug: string
          type: string
          updated_at?: string | null
        }
        Update: {
          data?: Json
          project_slug?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_artifacts_project_slug_fkey"
            columns: ["project_slug"]
            isOneToOne: false
            referencedRelation: "atlas_projects"
            referencedColumns: ["slug"]
          },
        ]
      }
      atlas_projects: {
        Row: {
          data: Json
          slug: string
          updated_at: string | null
        }
        Insert: {
          data: Json
          slug: string
          updated_at?: string | null
        }
        Update: {
          data?: Json
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      board_likes: {
        Row: {
          created_at: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_likes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "trip_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_places: {
        Row: {
          collection_id: string
          created_at: string
          place_id: string
          sort_order: number
        }
        Insert: {
          collection_id: string
          created_at?: string
          place_id: string
          sort_order?: number
        }
        Update: {
          collection_id?: string
          created_at?: string
          place_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_places_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_places_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          name: string
          slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          slug?: string
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
      katalog_wykluczenia: {
        Row: {
          created_at: string
          nazwa: string
          osm_id: string
          powod: string
          scalono_z: string | null
        }
        Insert: {
          created_at?: string
          nazwa: string
          osm_id: string
          powod: string
          scalono_z?: string | null
        }
        Update: {
          created_at?: string
          nazwa?: string
          osm_id?: string
          powod?: string
          scalono_z?: string | null
        }
        Relationships: []
      }
      kolejka_zatwierdzen: {
        Row: {
          agent: string
          dowod: Json
          id: number
          obszar: string
          odcisk: string
          opis: string
          ostatnio_widziane: string
          polecenie: string | null
          powtorzen: number
          proponowane_dzialanie: string
          rozstrzygnieto: string | null
          stan: string
          tytul: string
          utworzono: string
          uwaga: string | null
          waga: string
          wynik: string | null
        }
        Insert: {
          agent: string
          dowod?: Json
          id?: number
          obszar: string
          odcisk: string
          opis?: string
          ostatnio_widziane?: string
          polecenie?: string | null
          powtorzen?: number
          proponowane_dzialanie?: string
          rozstrzygnieto?: string | null
          stan?: string
          tytul: string
          utworzono?: string
          uwaga?: string | null
          waga?: string
          wynik?: string | null
        }
        Update: {
          agent?: string
          dowod?: Json
          id?: number
          obszar?: string
          odcisk?: string
          opis?: string
          ostatnio_widziane?: string
          polecenie?: string | null
          powtorzen?: number
          proponowane_dzialanie?: string
          rozstrzygnieto?: string | null
          stan?: string
          tytul?: string
          utworzono?: string
          uwaga?: string | null
          waga?: string
          wynik?: string | null
        }
        Relationships: []
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
      place_catalog: {
        Row: {
          category: string
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          description: string
          description_i18n: Json
          id: string
          kind: string | null
          lat: number
          lng: number
          name: string
          opening_hours: string | null
          osm_id: string | null
          photos: Json
          pin_count: number
          report_count: number
          slug: string
          source: string
          status: string
          updated_at: string
          vibe_tags: string[]
          visit_minutes: number | null
          waznosc: number | null
          waznosc_zrodlo: string | null
          website: string | null
          wiki_extract: string | null
        }
        Insert: {
          category?: string
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          description_i18n?: Json
          id?: string
          kind?: string | null
          lat: number
          lng: number
          name: string
          opening_hours?: string | null
          osm_id?: string | null
          photos?: Json
          pin_count?: number
          report_count?: number
          slug: string
          source?: string
          status?: string
          updated_at?: string
          vibe_tags?: string[]
          visit_minutes?: number | null
          waznosc?: number | null
          waznosc_zrodlo?: string | null
          website?: string | null
          wiki_extract?: string | null
        }
        Update: {
          category?: string
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          description_i18n?: Json
          id?: string
          kind?: string | null
          lat?: number
          lng?: number
          name?: string
          opening_hours?: string | null
          osm_id?: string | null
          photos?: Json
          pin_count?: number
          report_count?: number
          slug?: string
          source?: string
          status?: string
          updated_at?: string
          vibe_tags?: string[]
          visit_minutes?: number | null
          waznosc?: number | null
          waznosc_zrodlo?: string | null
          website?: string | null
          wiki_extract?: string | null
        }
        Relationships: []
      }
      place_events: {
        Row: {
          city: string
          created_at: string
          description: string
          ends_on: string | null
          id: string
          name: string
          place_id: string | null
          source: string
          starts_on: string
          url: string | null
        }
        Insert: {
          city: string
          created_at?: string
          description?: string
          ends_on?: string | null
          id?: string
          name: string
          place_id?: string | null
          source?: string
          starts_on: string
          url?: string | null
        }
        Update: {
          city?: string
          created_at?: string
          description?: string
          ends_on?: string | null
          id?: string
          name?: string
          place_id?: string | null
          source?: string
          starts_on?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_events_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      place_favorites: {
        Row: {
          created_at: string
          place_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          place_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_favorites_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      place_reports: {
        Row: {
          created_at: string
          place_id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          place_id: string
          reason?: string
          user_id: string
        }
        Update: {
          created_at?: string
          place_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_reports_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      place_sponsorships: {
        Row: {
          advertiser: string
          category: string | null
          city: string | null
          created_at: string
          ends_on: string
          id: string
          note: string | null
          place_id: string
          starts_on: string
        }
        Insert: {
          advertiser: string
          category?: string | null
          city?: string | null
          created_at?: string
          ends_on: string
          id?: string
          note?: string | null
          place_id: string
          starts_on: string
        }
        Update: {
          advertiser?: string
          category?: string | null
          city?: string | null
          created_at?: string
          ends_on?: string
          id?: string
          note?: string | null
          place_id?: string
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_sponsorships_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "place_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      poi_cache: {
        Row: {
          data: Json
          key: string
          updated_at: string
        }
        Insert: {
          data: Json
          key: string
          updated_at?: string
        }
        Update: {
          data?: Json
          key?: string
          updated_at?: string
        }
        Relationships: []
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
      route_builder_artifacts: {
        Row: {
          artifact_type: string
          content: Json | null
          created_at: string
          file_path: string | null
          id: string
          project_id: string
          raw_data: string | null
        }
        Insert: {
          artifact_type: string
          content?: Json | null
          created_at?: string
          file_path?: string | null
          id?: string
          project_id: string
          raw_data?: string | null
        }
        Update: {
          artifact_type?: string
          content?: Json | null
          created_at?: string
          file_path?: string | null
          id?: string
          project_id?: string
          raw_data?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_builder_artifacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "route_builder_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      route_builder_jobs: {
        Row: {
          attempt_count: number
          created_at: string
          current_step: string
          error_code: string | null
          error_message: string | null
          human_message: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          missing_inputs: Json | null
          progress: number
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          current_step: string
          error_code?: string | null
          error_message?: string | null
          human_message?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          missing_inputs?: Json | null
          progress?: number
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          current_step?: string
          error_code?: string | null
          error_message?: string | null
          human_message?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          missing_inputs?: Json | null
          progress?: number
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_builder_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "route_builder_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      route_builder_projects: {
        Row: {
          created_at: string
          id: string
          requirements: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          requirements: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          requirements?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      route_preferences: {
        Row: {
          crowds: number
          dining: number
          effort: number
          pace: number
          popularity: number
          updated_at: string
          user_id: string
          wandering: number
        }
        Insert: {
          crowds?: number
          dining?: number
          effort?: number
          pace?: number
          popularity?: number
          updated_at?: string
          user_id: string
          wandering?: number
        }
        Update: {
          crowds?: number
          dining?: number
          effort?: number
          pace?: number
          popularity?: number
          updated_at?: string
          user_id?: string
          wandering?: number
        }
        Relationships: []
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
      token_ledger: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          ref: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          ref?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trip_plans: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: Json
          project_id: string
          start_date: string | null
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          plan: Json
          project_id: string
          start_date?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: Json
          project_id?: string
          start_date?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "trip_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_project_places: {
        Row: {
          board_x: number | null
          board_y: number | null
          catalog_id: string | null
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          lat: number | null
          lng: number | null
          name: string
          opening_hours: string | null
          priority: string
          project_id: string
          sort_order: number
          source: string | null
          visit_minutes: number | null
          website: string | null
          wiki_extract: string | null
        }
        Insert: {
          board_x?: number | null
          board_y?: number | null
          catalog_id?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          opening_hours?: string | null
          priority?: string
          project_id: string
          sort_order?: number
          source?: string | null
          visit_minutes?: number | null
          website?: string | null
          wiki_extract?: string | null
        }
        Update: {
          board_x?: number | null
          board_y?: number | null
          catalog_id?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          opening_hours?: string | null
          priority?: string
          project_id?: string
          sort_order?: number
          source?: string | null
          visit_minutes?: number | null
          website?: string | null
          wiki_extract?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_project_places_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "place_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_project_places_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "trip_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_project_shares: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: string
          shared_with_email: string
          shared_with_user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string
          shared_with_email: string
          shared_with_user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          shared_with_email?: string
          shared_with_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_project_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "trip_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_projects: {
        Row: {
          author_display: string | null
          copied_at: string | null
          copied_from: string | null
          copy_count: number
          created_at: string
          crowds: number | null
          days: number | null
          destination: string
          destination_lat: number | null
          destination_lng: number | null
          dining: number | null
          effort: number | null
          end_date: string | null
          fill_percent: number
          hours_per_day: number | null
          id: string
          is_example: boolean
          is_public: boolean
          like_count: number
          name: string
          notes: string
          pace: number | null
          popularity: number | null
          published_at: string | null
          start_date: string | null
          start_lat: number | null
          start_lng: number | null
          start_name: string | null
          trip_type: string | null
          updated_at: string
          user_id: string
          wandering: number | null
        }
        Insert: {
          author_display?: string | null
          copied_at?: string | null
          copied_from?: string | null
          copy_count?: number
          created_at?: string
          crowds?: number | null
          days?: number | null
          destination: string
          destination_lat?: number | null
          destination_lng?: number | null
          dining?: number | null
          effort?: number | null
          end_date?: string | null
          fill_percent?: number
          hours_per_day?: number | null
          id?: string
          is_example?: boolean
          is_public?: boolean
          like_count?: number
          name: string
          notes?: string
          pace?: number | null
          popularity?: number | null
          published_at?: string | null
          start_date?: string | null
          start_lat?: number | null
          start_lng?: number | null
          start_name?: string | null
          trip_type?: string | null
          updated_at?: string
          user_id: string
          wandering?: number | null
        }
        Update: {
          author_display?: string | null
          copied_at?: string | null
          copied_from?: string | null
          copy_count?: number
          created_at?: string
          crowds?: number | null
          days?: number | null
          destination?: string
          destination_lat?: number | null
          destination_lng?: number | null
          dining?: number | null
          effort?: number | null
          end_date?: string | null
          fill_percent?: number
          hours_per_day?: number | null
          id?: string
          is_example?: boolean
          is_public?: boolean
          like_count?: number
          name?: string
          notes?: string
          pace?: number | null
          popularity?: number | null
          published_at?: string | null
          start_date?: string | null
          start_lat?: number | null
          start_lng?: number | null
          start_name?: string | null
          trip_type?: string | null
          updated_at?: string
          user_id?: string
          wandering?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_projects_copied_from_fkey"
            columns: ["copied_from"]
            isOneToOne: false
            referencedRelation: "trip_projects"
            referencedColumns: ["id"]
          },
        ]
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
      ai_usage_summary: {
        Row: {
          avg_cost_micro_usd: number | null
          avg_ms: number | null
          avg_tokens: number | null
          calls: number | null
          failures: number | null
          operation: string | null
          total_cost_usd: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      catalog_cities: {
        Args: never
        Returns: {
          city: string
        }[]
      }
      claim_pending_trip_shares: { Args: never; Returns: number }
      copy_public_board: { Args: { p_source: string }; Returns: string }
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
      has_project_access: { Args: { pid: string }; Returns: boolean }
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
      rm_podbij_kopie: { Args: { p_project: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
