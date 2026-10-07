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
      api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          monthly_limit: number
          name: string
          tier: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          monthly_limit?: number
          name?: string
          tier?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          monthly_limit?: number
          name?: string
          tier?: string
          user_id?: string
        }
        Relationships: []
      }
      api_usage: {
        Row: {
          api_key_id: string
          created_at: string
          endpoint: string
          id: string
          status_code: number | null
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          api_key_id: string
          created_at?: string
          endpoint?: string
          id?: string
          status_code?: number | null
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          api_key_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          status_code?: number | null
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      behavioral_insights: {
        Row: {
          acknowledged: boolean | null
          created_at: string
          description: string
          detected_from: string | null
          id: string
          pattern_type: string
          severity: string | null
          suggestion: string | null
          user_id: string
        }
        Insert: {
          acknowledged?: boolean | null
          created_at?: string
          description: string
          detected_from?: string | null
          id?: string
          pattern_type: string
          severity?: string | null
          suggestion?: string | null
          user_id: string
        }
        Update: {
          acknowledged?: boolean | null
          created_at?: string
          description?: string
          detected_from?: string | null
          id?: string
          pattern_type?: string
          severity?: string | null
          suggestion?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bot_channel_links: {
        Row: {
          conversation_id: string | null
          created_at: string
          display_name: string | null
          external_id: string
          id: string
          last_message_at: string | null
          metadata: Json
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          display_name?: string | null
          external_id: string
          id?: string
          last_message_at?: string | null
          metadata?: Json
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          display_name?: string | null
          external_id?: string
          id?: string
          last_message_at?: string | null
          metadata?: Json
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_channel_links_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_link_codes: {
        Row: {
          code: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          platform: string
          user_id: string
        }
        Insert: {
          code: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          platform: string
          user_id: string
        }
        Update: {
          code?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_summaries: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          decisions_made: string[] | null
          emotional_tone: string | null
          id: string
          key_topics: string[] | null
          milestones: string[] | null
          period_type: string | null
          summary: string
          unresolved_threads: string[] | null
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          decisions_made?: string[] | null
          emotional_tone?: string | null
          id?: string
          key_topics?: string[] | null
          milestones?: string[] | null
          period_type?: string | null
          summary: string
          unresolved_threads?: string[] | null
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          decisions_made?: string[] | null
          emotional_tone?: string | null
          id?: string
          key_topics?: string[] | null
          milestones?: string[] | null
          period_type?: string | null
          summary?: string
          unresolved_threads?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crisis_events: {
        Row: {
          created_at: string
          detected_in: string | null
          id: string
          region: string | null
          resources_shown: Json | null
          risk_level: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detected_in?: string | null
          id?: string
          region?: string | null
          resources_shown?: Json | null
          risk_level: string
          user_id: string
        }
        Update: {
          created_at?: string
          detected_in?: string | null
          id?: string
          region?: string | null
          resources_shown?: Json | null
          risk_level?: string
          user_id?: string
        }
        Relationships: []
      }
      emotional_patterns: {
        Row: {
          context: string | null
          conversation_id: string | null
          created_at: string | null
          emotion: string
          id: string
          intensity: number | null
          polarity: string | null
          trigger_pattern: string | null
          user_id: string
        }
        Insert: {
          context?: string | null
          conversation_id?: string | null
          created_at?: string | null
          emotion: string
          id?: string
          intensity?: number | null
          polarity?: string | null
          trigger_pattern?: string | null
          user_id: string
        }
        Update: {
          context?: string | null
          conversation_id?: string | null
          created_at?: string | null
          emotion?: string
          id?: string
          intensity?: number | null
          polarity?: string | null
          trigger_pattern?: string | null
          user_id?: string
        }
        Relationships: []
      }
      identity_evolution: {
        Row: {
          created_at: string | null
          delta: number | null
          dimension: string
          evidence: string | null
          id: string
          note: string | null
          score: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          delta?: number | null
          dimension: string
          evidence?: string | null
          id?: string
          note?: string | null
          score?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          delta?: number | null
          dimension?: string
          evidence?: string | null
          id?: string
          note?: string | null
          score?: number | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          emotion: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          emotion?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          emotion?: string | null
          id?: string
          role?: string
          user_id?: string
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
      payment_transactions: {
        Row: {
          amount_kobo: number
          created_at: string
          currency: string
          id: string
          paystack_payload: Json | null
          reference: string
          status: string
          tier: string | null
          user_id: string
        }
        Insert: {
          amount_kobo: number
          created_at?: string
          currency?: string
          id?: string
          paystack_payload?: Json | null
          reference: string
          status: string
          tier?: string | null
          user_id: string
        }
        Update: {
          amount_kobo?: number
          created_at?: string
          currency?: string
          id?: string
          paystack_payload?: Json | null
          reference?: string
          status?: string
          tier?: string | null
          user_id?: string
        }
        Relationships: []
      }
      proactive_checkins: {
        Row: {
          created_at: string
          id: string
          memory_id: string | null
          message: string
          platform: string
          responded: boolean
          topic_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          memory_id?: string | null
          message: string
          platform?: string
          responded?: boolean
          topic_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          memory_id?: string | null
          message?: string
          platform?: string
          responded?: boolean
          topic_key?: string
          user_id?: string
        }
        Relationships: []
      }
      proactive_insights: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          insight_type: string
          is_dismissed: boolean | null
          is_surfaced: boolean | null
          message: string
          priority: number | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          insight_type: string
          is_dismissed?: boolean | null
          is_surfaced?: boolean | null
          message: string
          priority?: number | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          insight_type?: string
          is_dismissed?: boolean | null
          is_surfaced?: boolean | null
          message?: string
          priority?: number | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string | null
          created_at: string
          display_name: string | null
          id: string
          onboarding_completed: boolean
          preferred_currency: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          preferred_currency?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          preferred_currency?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ritual_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          evening_enabled: boolean
          evening_time: string
          id: string
          midday_enabled: boolean
          midday_time: string
          morning_enabled: boolean
          morning_time: string
          push_enabled: boolean
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          evening_enabled?: boolean
          evening_time?: string
          id?: string
          midday_enabled?: boolean
          midday_time?: string
          morning_enabled?: boolean
          morning_time?: string
          push_enabled?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          evening_enabled?: boolean
          evening_time?: string
          id?: string
          midday_enabled?: boolean
          midday_time?: string
          morning_enabled?: boolean
          morning_time?: string
          push_enabled?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ritual_summaries: {
        Row: {
          accomplishments: string[] | null
          created_at: string
          goals_reviewed: string[] | null
          growth_highlights: string[] | null
          id: string
          intentions: string[] | null
          mood_trend: string | null
          period_end: string
          period_start: string
          ritual_type: string
          summary: string
          user_id: string
        }
        Insert: {
          accomplishments?: string[] | null
          created_at?: string
          goals_reviewed?: string[] | null
          growth_highlights?: string[] | null
          id?: string
          intentions?: string[] | null
          mood_trend?: string | null
          period_end: string
          period_start: string
          ritual_type: string
          summary: string
          user_id: string
        }
        Update: {
          accomplishments?: string[] | null
          created_at?: string
          goals_reviewed?: string[] | null
          growth_highlights?: string[] | null
          id?: string
          intentions?: string[] | null
          mood_trend?: string | null
          period_end?: string
          period_start?: string
          ritual_type?: string
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount_kobo: number | null
          cancel_at_period_end: boolean
          created_at: string
          currency: string
          current_period_end: string | null
          id: string
          paystack_customer_code: string | null
          paystack_email_token: string | null
          paystack_subscription_code: string | null
          plan_code: string | null
          status: string
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_kobo?: number | null
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          current_period_end?: string | null
          id?: string
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_subscription_code?: string | null
          plan_code?: string | null
          status?: string
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_kobo?: number | null
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string
          current_period_end?: string | null
          id?: string
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_subscription_code?: string | null
          plan_code?: string | null
          status?: string
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_updates: {
        Row: {
          created_at: string
          update_id: number
        }
        Insert: {
          created_at?: string
          update_id: number
        }
        Update: {
          created_at?: string
          update_id?: number
        }
        Relationships: []
      }
      user_memory: {
        Row: {
          category: string
          confidence: number | null
          created_at: string | null
          embedding: string | null
          id: string
          is_pinned: boolean
          is_sensitive: boolean
          key: string
          last_reinforced_at: string | null
          source: string | null
          source_message_id: string | null
          tags: string[]
          updated_at: string | null
          user_id: string
          value: string
        }
        Insert: {
          category: string
          confidence?: number | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_pinned?: boolean
          is_sensitive?: boolean
          key: string
          last_reinforced_at?: string | null
          source?: string | null
          source_message_id?: string | null
          tags?: string[]
          updated_at?: string | null
          user_id: string
          value: string
        }
        Update: {
          category?: string
          confidence?: number | null
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_pinned?: boolean
          is_sensitive?: boolean
          key?: string
          last_reinforced_at?: string | null
          source?: string | null
          source_message_id?: string | null
          tags?: string[]
          updated_at?: string | null
          user_id?: string
          value?: string
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
          role: Database["public"]["Enums"]["app_role"]
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
      user_settings: {
        Row: {
          active_persona: string | null
          companion_mode: string | null
          created_at: string
          id: string
          memory_depth: string | null
          preferred_model: string | null
          proactive_enabled: boolean | null
          telegram_checkin_max_per_day: number
          telegram_checkin_quiet_end: number
          telegram_checkin_quiet_start: number
          telegram_checkins_enabled: boolean
          telegram_enabled: boolean
          telegram_proactive: boolean
          updated_at: string
          user_id: string
          voice_enabled: boolean | null
          web_search_enabled: boolean | null
        }
        Insert: {
          active_persona?: string | null
          companion_mode?: string | null
          created_at?: string
          id?: string
          memory_depth?: string | null
          preferred_model?: string | null
          proactive_enabled?: boolean | null
          telegram_checkin_max_per_day?: number
          telegram_checkin_quiet_end?: number
          telegram_checkin_quiet_start?: number
          telegram_checkins_enabled?: boolean
          telegram_enabled?: boolean
          telegram_proactive?: boolean
          updated_at?: string
          user_id: string
          voice_enabled?: boolean | null
          web_search_enabled?: boolean | null
        }
        Update: {
          active_persona?: string | null
          companion_mode?: string | null
          created_at?: string
          id?: string
          memory_depth?: string | null
          preferred_model?: string | null
          proactive_enabled?: boolean | null
          telegram_checkin_max_per_day?: number
          telegram_checkin_quiet_end?: number
          telegram_checkin_quiet_start?: number
          telegram_checkins_enabled?: boolean
          telegram_enabled?: boolean
          telegram_proactive?: boolean
          updated_at?: string
          user_id?: string
          voice_enabled?: boolean | null
          web_search_enabled?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_metrics: { Args: never; Returns: Json }
      get_user_tier: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_user_memory: {
        Args: {
          _include_sensitive?: boolean
          _match_count?: number
          _query_embedding: string
          _user_id: string
        }
        Returns: {
          category: string
          confidence: number
          id: string
          is_pinned: boolean
          is_sensitive: boolean
          key: string
          last_reinforced_at: string
          similarity: number
          source: string
          tags: string[]
          value: string
        }[]
      }
      merge_user_data: {
        Args: { _from: string; _to: string }
        Returns: undefined
      }
      user_id_by_email: { Args: { _email: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "super_admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "moderator", "user", "super_admin"],
    },
  },
} as const
