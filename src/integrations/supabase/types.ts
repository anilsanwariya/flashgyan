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
      bot_flashcards: {
        Row: {
          answer: string
          created_at: string
          id: string
          image_url: string | null
          order_index: number
          prompt: string
          question: string
          sections: Json
          subject: string
          topic: string
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          image_url?: string | null
          order_index?: number
          prompt: string
          question: string
          sections?: Json
          subject: string
          topic: string
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          image_url?: string | null
          order_index?: number
          prompt?: string
          question?: string
          sections?: Json
          subject?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_mcq_questions: {
        Row: {
          answer: number
          created_at: string
          explanation_sections: Json
          id: string
          image_url: string | null
          option_1: string
          option_2: string
          option_3: string
          option_4: string
          order_index: number
          question: string
          question_ext: string
          test_id: string
          updated_at: string
        }
        Insert: {
          answer: number
          created_at?: string
          explanation_sections?: Json
          id?: string
          image_url?: string | null
          option_1: string
          option_2: string
          option_3: string
          option_4: string
          order_index?: number
          question: string
          question_ext?: string
          test_id: string
          updated_at?: string
        }
        Update: {
          answer?: number
          created_at?: string
          explanation_sections?: Json
          id?: string
          image_url?: string | null
          option_1?: string
          option_2?: string
          option_3?: string
          option_4?: string
          order_index?: number
          question?: string
          question_ext?: string
          test_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_mcq_questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "bot_mcq_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_mcq_tests: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          order_index: number
          subject: string
          topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          order_index?: number
          subject?: string
          topic?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          order_index?: number
          subject?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_sessions: {
        Row: {
          active_poll_id: string | null
          chat_id: number
          correct_count: number
          correct_option_id: number | null
          current_count: number
          incorrect_count: number
          subject: string
          updated_at: string
        }
        Insert: {
          active_poll_id?: string | null
          chat_id: number
          correct_count?: number
          correct_option_id?: number | null
          current_count?: number
          incorrect_count?: number
          subject: string
          updated_at?: string
        }
        Update: {
          active_poll_id?: string | null
          chat_id?: number
          correct_count?: number
          correct_option_id?: number | null
          current_count?: number
          incorrect_count?: number
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_users: {
        Row: {
          chat_id: number
          created_at: string
          first_name: string | null
          last_active: string
          username: string | null
        }
        Insert: {
          chat_id: number
          created_at?: string
          first_name?: string | null
          last_active?: string
          username?: string | null
        }
        Update: {
          chat_id?: number
          created_at?: string
          first_name?: string | null
          last_active?: string
          username?: string | null
        }
        Relationships: []
      }
      flashcard_decks: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          order_index: number
          subject: string
          topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          order_index?: number
          subject: string
          topic: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          order_index?: number
          subject?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      flashcards: {
        Row: {
          answer: string
          created_at: string
          deck_id: string
          id: string
          image_url: string | null
          order_index: number
          prompt: string
          question: string
          sections: Json
          subject: string
          topic: string
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          deck_id: string
          id?: string
          image_url?: string | null
          order_index?: number
          prompt: string
          question: string
          sections?: Json
          subject: string
          topic: string
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          deck_id?: string
          id?: string
          image_url?: string | null
          order_index?: number
          prompt?: string
          question?: string
          sections?: Json
          subject?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      home_banners: {
        Row: {
          created_at: string
          id: string
          order_index: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_index?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          storage_path?: string
        }
        Relationships: []
      }
      home_settings: {
        Row: {
          cta_caption: string
          cta_label: string
          cta_subtitle: string
          cta_url: string
          hide_app_store: boolean
          hide_google_play: boolean
          id: number
          lock_cta: boolean
          lock_flashcards: boolean
          lock_mcq: boolean
          lock_mcq_practice: boolean
          lock_saathi: boolean
          updated_at: string
        }
        Insert: {
          cta_caption?: string
          cta_label?: string
          cta_subtitle?: string
          cta_url?: string
          hide_app_store?: boolean
          hide_google_play?: boolean
          id?: number
          lock_cta?: boolean
          lock_flashcards?: boolean
          lock_mcq?: boolean
          lock_mcq_practice?: boolean
          lock_saathi?: boolean
          updated_at?: string
        }
        Update: {
          cta_caption?: string
          cta_label?: string
          cta_subtitle?: string
          cta_url?: string
          hide_app_store?: boolean
          hide_google_play?: boolean
          id?: number
          lock_cta?: boolean
          lock_flashcards?: boolean
          lock_mcq?: boolean
          lock_mcq_practice?: boolean
          lock_saathi?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      mcq_practice_questions: {
        Row: {
          answer: number
          created_at: string
          explanation_sections: Json
          id: string
          image_url: string | null
          option_1: string
          option_2: string
          option_3: string
          option_4: string
          order_index: number
          question: string
          question_ext: string
          test_id: string
          updated_at: string
        }
        Insert: {
          answer: number
          created_at?: string
          explanation_sections?: Json
          id?: string
          image_url?: string | null
          option_1: string
          option_2: string
          option_3: string
          option_4: string
          order_index?: number
          question: string
          question_ext?: string
          test_id: string
          updated_at?: string
        }
        Update: {
          answer?: number
          created_at?: string
          explanation_sections?: Json
          id?: string
          image_url?: string | null
          option_1?: string
          option_2?: string
          option_3?: string
          option_4?: string
          order_index?: number
          question?: string
          question_ext?: string
          test_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcq_practice_questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "mcq_practice_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      mcq_practice_tests: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          order_index: number
          subject: string
          topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          order_index?: number
          subject?: string
          topic?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          order_index?: number
          subject?: string
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcq_questions: {
        Row: {
          answer: number
          created_at: string
          explanation_sections: Json
          id: string
          image_url: string | null
          option_1: string
          option_2: string
          option_3: string
          option_4: string
          order_index: number
          question: string
          question_ext: string
          test_id: string
          updated_at: string
        }
        Insert: {
          answer: number
          created_at?: string
          explanation_sections?: Json
          id?: string
          image_url?: string | null
          option_1: string
          option_2: string
          option_3: string
          option_4: string
          order_index?: number
          question: string
          question_ext?: string
          test_id: string
          updated_at?: string
        }
        Update: {
          answer?: number
          created_at?: string
          explanation_sections?: Json
          id?: string
          image_url?: string | null
          option_1?: string
          option_2?: string
          option_3?: string
          option_4?: string
          order_index?: number
          question?: string
          question_ext?: string
          test_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcq_questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "mcq_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      mcq_tests: {
        Row: {
          created_at: string
          description: string
          duration_seconds: number
          id: string
          name: string
          order_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          duration_seconds?: number
          id?: string
          name: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          duration_seconds?: number
          id?: string
          name?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          language_code: string | null
          last_name: string | null
          photo_url: string | null
          telegram_id: number
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id?: string
          language_code?: string | null
          last_name?: string | null
          photo_url?: string | null
          telegram_id: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          language_code?: string | null
          last_name?: string | null
          photo_url?: string | null
          telegram_id?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      saathi_chat_history: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      saathi_knowledge: {
        Row: {
          chunk_index: number | null
          content: string
          created_at: string
          embedding: string | null
          fts_vector: unknown
          id: string
          medium: string
          parent_id: string | null
          source_file: string | null
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          chunk_index?: number | null
          content: string
          created_at?: string
          embedding?: string | null
          fts_vector?: unknown
          id?: string
          medium?: string
          parent_id?: string | null
          source_file?: string | null
          subject: string
          title: string
          updated_at?: string
        }
        Update: {
          chunk_index?: number | null
          content?: string
          created_at?: string
          embedding?: string | null
          fts_vector?: unknown
          id?: string
          medium?: string
          parent_id?: string | null
          source_file?: string | null
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saathi_knowledge_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "saathi_knowledge"
            referencedColumns: ["id"]
          },
        ]
      }
      saathi_knowledge_gaps: {
        Row: {
          ask_count: number
          created_at: string
          id: string
          last_asked_at: string
          question: string
        }
        Insert: {
          ask_count?: number
          created_at?: string
          id?: string
          last_asked_at?: string
          question: string
        }
        Update: {
          ask_count?: number
          created_at?: string
          id?: string
          last_asked_at?: string
          question?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_knowledge_gap: {
        Args: { gap_question: string }
        Returns: undefined
      }
      match_saathi_hybrid: {
        Args: {
          match_count?: number
          query_embedding: string
          query_text: string
          subject_filter?: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
          source_file: string
          subject: string
          title: string
        }[]
      }
      match_saathi_knowledge: {
        Args: {
          match_count?: number
          query_embedding: string
          subject_filter?: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
          subject: string
          title: string
        }[]
      }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const
