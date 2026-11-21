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
      cms_activity: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          locale: string | null
          revision_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          locale?: string | null
          revision_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          locale?: string | null
          revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_activity_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "cms_page_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_form_rate_limits: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      cms_form_submissions: {
        Row: {
          client_token: string
          created_at: string
          form_key: string
          id: string
          locale: string | null
          location: string
          page_path: string | null
          payload: Json
          payload_fingerprint: string
          read_at: string | null
          search_text: string
        }
        Insert: {
          client_token: string
          created_at?: string
          form_key: string
          id?: string
          locale?: string | null
          location?: string
          page_path?: string | null
          payload: Json
          payload_fingerprint: string
          read_at?: string | null
          search_text?: string
        }
        Update: {
          client_token?: string
          created_at?: string
          form_key?: string
          id?: string
          locale?: string | null
          location?: string
          page_path?: string | null
          payload?: Json
          payload_fingerprint?: string
          read_at?: string | null
          search_text?: string
        }
        Relationships: []
      }
      cms_forms: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cms_languages: {
        Row: {
          active: boolean
          code: string
          created_at: string
          is_default: boolean
          name: string
          native_name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          is_default?: boolean
          name: string
          native_name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          is_default?: boolean
          name?: string
          native_name?: string
          sort_order?: number
        }
        Relationships: []
      }
      cms_media: {
        Row: {
          created_at: string
          created_by: string | null
          default_alt: string
          default_focal: Json | null
          deleted_at: string | null
          display_name: string
          height: number | null
          id: string
          mime: string
          size: number
          storage_path: string
          updated_at: string
          width: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_alt?: string
          default_focal?: Json | null
          deleted_at?: string | null
          display_name: string
          height?: number | null
          id?: string
          mime: string
          size: number
          storage_path: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_alt?: string
          default_focal?: Json | null
          deleted_at?: string | null
          display_name?: string
          height?: number | null
          id?: string
          mime?: string
          size?: number
          storage_path?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      cms_page_draft: {
        Row: {
          content: Json
          locale: string
          page_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: Json
          locale: string
          page_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          locale?: string
          page_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_page_draft_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_page_fields: {
        Row: {
          address: string
          default_text: string | null
          item: number | null
          kind: string
          label: string | null
          page_id: string
          position: number | null
          section: string | null
          seen_at: string
          tag: string | null
        }
        Insert: {
          address: string
          default_text?: string | null
          item?: number | null
          kind: string
          label?: string | null
          page_id: string
          position?: number | null
          section?: string | null
          seen_at?: string
          tag?: string | null
        }
        Update: {
          address?: string
          default_text?: string | null
          item?: number | null
          kind?: string
          label?: string | null
          page_id?: string
          position?: number | null
          section?: string | null
          seen_at?: string
          tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_page_fields_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_page_locks: {
        Row: {
          acquired_at: string
          heartbeat_at: string
          page_id: string
          token: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          heartbeat_at?: string
          page_id: string
          token?: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          heartbeat_at?: string
          page_id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_page_locks_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: true
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_page_published: {
        Row: {
          content: Json
          locale: string
          page_id: string
          published_at: string
        }
        Insert: {
          content?: Json
          locale: string
          page_id: string
          published_at?: string
        }
        Update: {
          content?: Json
          locale?: string
          page_id?: string
          published_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_page_published_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_page_revisions: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          locale: string
          page_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          locale: string
          page_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          locale?: string
          page_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_page_revisions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "cms_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_pages: {
        Row: {
          created_at: string
          edit_path: string | null
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          edit_path?: string | null
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          edit_path?: string | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      cms_site_settings: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          favicon_media_id: string | null
          id: number
          logo_media_id: string | null
          maintenance_mode: boolean
          site_name: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          favicon_media_id?: string | null
          id?: number
          logo_media_id?: string | null
          maintenance_mode?: boolean
          site_name?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          favicon_media_id?: string | null
          id?: number
          logo_media_id?: string | null
          maintenance_mode?: boolean
          site_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_site_settings_favicon_media_fkey"
            columns: ["favicon_media_id"]
            isOneToOne: false
            referencedRelation: "cms_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_site_settings_logo_media_fkey"
            columns: ["logo_media_id"]
            isOneToOne: false
            referencedRelation: "cms_media"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_site_settings_translations: {
        Row: {
          locale: string
          site_name: string
          updated_at: string
        }
        Insert: {
          locale: string
          site_name?: string
          updated_at?: string
        }
        Update: {
          locale?: string
          site_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_site_settings_translations_locale_fkey"
            columns: ["locale"]
            isOneToOne: true
            referencedRelation: "cms_languages"
            referencedColumns: ["code"]
          },
        ]
      }
      cms_site_texts: {
        Row: {
          key: string
          locale: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          locale: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          locale?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_site_texts_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "cms_languages"
            referencedColumns: ["code"]
          },
        ]
      }
      cms_users: {
        Row: {
          created_at: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cms_activity_log: {
        Args: {
          event_action: string
          event_details?: Json
          event_entity_id: string
          event_entity_label: string
          event_entity_type: string
          event_locale?: string
          event_revision_id?: string
        }
        Returns: undefined
      }
      cms_can: { Args: { requested: string }; Returns: boolean }
      cms_content_get: { Args: { address: string; doc: Json }; Returns: Json }
      cms_content_remove: {
        Args: { doc: Json; segments: string[] }
        Returns: Json
      }
      cms_content_set: {
        Args: { doc: Json; segments: string[]; value: Json }
        Returns: Json
      }
      cms_default_locale: {
        Args: { bootstrap_locale: string }
        Returns: string
      }
      cms_form_set_enabled: {
        Args: { form_enabled: boolean; form_key: string }
        Returns: undefined
      }
      cms_form_stats: {
        Args: never
        Returns: {
          form_key: string
          last_at: string
          sources: string[]
          total: number
          unread: number
        }[]
      }
      cms_form_submit: {
        Args: {
          client_hash: string
          client_limit?: number
          client_token: string
          form_key: string
          form_limit?: number
          page_locale: string
          page_path: string
          payload: Json
          search_text: string
          total_limit?: number
          window_seconds?: number
        }
        Returns: {
          status: string
          submission_id: string
        }[]
      }
      cms_is_focal: { Args: { value: Json }; Returns: boolean }
      cms_language_add: {
        Args: {
          code: string
          make_default?: boolean
          name: string
          native_name: string
        }
        Returns: undefined
      }
      cms_language_delete: { Args: { code: string }; Returns: undefined }
      cms_language_publish: {
        Args: { page_locale: string; pages: Json }
        Returns: {
          published: number
          skipped: number
          skipped_keys: string[]
        }[]
      }
      cms_language_reorder: { Args: { codes: string[] }; Returns: undefined }
      cms_language_set_active: {
        Args: { active: boolean; code: string }
        Returns: undefined
      }
      cms_language_update: {
        Args: { code: string; name: string; native_name: string }
        Returns: undefined
      }
      cms_locale_is_active: {
        Args: { bootstrap_locale: string; target_locale: string }
        Returns: boolean
      }
      cms_media_create: {
        Args: {
          display_name: string
          height?: number
          storage_path: string
          width?: number
        }
        Returns: string
      }
      cms_media_delete: { Args: { media_id: string }; Returns: undefined }
      cms_media_object: {
        Args: { path: string }
        Returns: {
          mime: string
          size: number
        }[]
      }
      cms_media_of: { Args: { content: Json }; Returns: Json }
      cms_media_path_in_use: { Args: { path: string }; Returns: boolean }
      cms_media_replace: {
        Args: {
          height?: number
          media_id: string
          storage_path: string
          width?: number
        }
        Returns: string
      }
      cms_media_update: {
        Args: {
          default_alt: string
          default_focal?: Json
          display_name: string
          media_id: string
        }
        Returns: undefined
      }
      cms_media_usage: {
        Args: { media_ids?: string[] }
        Returns: {
          is_draft: boolean
          locale: string
          media_id: string
          page_key: string
          source: string
        }[]
      }
      cms_page_check_draft_shape: {
        Args: { next_content: Json; target_locale: string }
        Returns: undefined
      }
      cms_page_get_editable: {
        Args: {
          bootstrap_locale: string
          page_key: string
          page_locale: string
        }
        Returns: {
          base: Json
          default_locale: string
          draft: Json
          draft_updated_at: string
          media: Json
          published: Json
          published_at: string
        }[]
      }
      cms_page_get_localized: {
        Args: {
          bootstrap_locale: string
          page_key: string
          page_locale: string
        }
        Returns: {
          base: Json
          base_published_at: string
          default_locale: string
          locales: string[]
          media: Json
          translation: Json
          translation_published_at: string
        }[]
      }
      cms_page_held_lock: {
        Args: { lock_token: string; page_key: string }
        Returns: string
      }
      cms_page_locale_states: {
        Args: { page_key: string }
        Returns: {
          has_draft: boolean
          locale: string
          published_at: string
        }[]
      }
      cms_page_lock_acquire: { Args: { page_key: string }; Returns: string }
      cms_page_lock_force_unlock: {
        Args: { page_key: string }
        Returns: undefined
      }
      cms_page_lock_heartbeat: {
        Args: { lock_token: string; page_key: string }
        Returns: undefined
      }
      cms_page_lock_release: {
        Args: { lock_token: string; page_key: string }
        Returns: undefined
      }
      cms_page_lock_status: {
        Args: { page_key: string }
        Returns: {
          acquired_at: string
          heartbeat_at: string
          holder_email: string
          is_mine: boolean
          is_stale: boolean
        }[]
      }
      cms_page_lock_ttl: { Args: never; Returns: string }
      cms_page_open_in_editor: {
        Args: { target_page: string }
        Returns: boolean
      }
      cms_page_promote_draft: {
        Args: { target_locale: string; target_page: string }
        Returns: string
      }
      cms_page_publish: {
        Args: { lock_token: string; page_key: string; page_locale: string }
        Returns: string
      }
      cms_page_register_fields: {
        Args: {
          edit_path: string
          fields: Json
          hidden_prefixes?: string[]
          page_key: string
        }
        Returns: undefined
      }
      cms_page_restore: {
        Args: {
          lock_token: string
          page_key: string
          page_locale: string
          replace_draft?: boolean
          revision_id: string
        }
        Returns: string
      }
      cms_page_save_draft: {
        Args: {
          content: Json
          lock_token: string
          page_key: string
          page_locale: string
        }
        Returns: string
      }
      cms_page_set_texts: {
        Args: { entries: Json; page_key: string; page_locale: string }
        Returns: string
      }
      cms_page_text_target: {
        Args: { address: string; doc: Json }
        Returns: boolean
      }
      cms_page_write_draft: {
        Args: {
          next_content: Json
          target_locale: string
          target_page_id: string
        }
        Returns: string
      }
      cms_require_permission: {
        Args: { requested: string }
        Returns: undefined
      }
      cms_site_texts_for: {
        Args: { bootstrap_locale: string; page_locale: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

