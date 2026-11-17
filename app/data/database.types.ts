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
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
        }
        Update: {
          created_at?: string
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
      cms_can: { Args: { requested: string }; Returns: boolean }
      cms_is_focal: { Args: { value: Json }; Returns: boolean }
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
      cms_page_get_draft: {
        Args: { page_key: string; page_locale: string }
        Returns: {
          content: Json
          locale: string
          media: Json
          updated_at: string
        }[]
      }
      cms_page_get_published: {
        Args: { page_key: string; page_locale: string }
        Returns: {
          content: Json
          locale: string
          media: Json
          published_at: string
        }[]
      }
      cms_page_held_lock: {
        Args: { lock_token: string; page_key: string }
        Returns: string
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
      cms_page_publish: {
        Args: { lock_token: string; page_key: string; page_locale: string }
        Returns: string
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

