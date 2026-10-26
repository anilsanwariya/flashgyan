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
      bot_auto_replies: {
        Row: {
          buttons: Json
          created_at: string
          enabled: boolean
          hits: number
          id: string
          keywords: string[]
          match_type: string
          media_type: string | null
          media_url: string | null
          priority: number
          response_text: string
          updated_at: string
        }
        Insert: {
          buttons?: Json
          created_at?: string
          enabled?: boolean
          hits?: number
          id?: string
          keywords?: string[]
          match_type?: string
          media_type?: string | null
          media_url?: string | null
          priority?: number
          response_text?: string
          updated_at?: string
        }
        Update: {
          buttons?: Json
          created_at?: string
          enabled?: boolean
          hits?: number
          id?: string
          keywords?: string[]
          match_type?: string
          media_type?: string | null
          media_url?: string | null
          priority?: number
          response_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_broadcasts: {
        Row: {
          blocked: number
          buttons: Json
          created_at: string
          cursor: number | null
          failed: number
          finished_at: string | null
          id: string
          locked_until: string | null
          media_type: string | null
          media_url: string | null
          scheduled_at: string
          segment: Json
          sent: number
          started_at: string | null
          status: string
          text: string
          total: number
        }
        Insert: {
          blocked?: number
          buttons?: Json
          created_at?: string
          cursor?: number | null
          failed?: number
          finished_at?: string | null
          id?: string
          locked_until?: string | null
          media_type?: string | null
          media_url?: string | null
          scheduled_at?: string
          segment?: Json
          sent?: number
          started_at?: string | null
          status?: string
          text?: string
          total?: number
        }
        Update: {
          blocked?: number
          buttons?: Json
          created_at?: string
          cursor?: number | null
          failed?: number
          finished_at?: string | null
          id?: string
          locked_until?: string | null
          media_type?: string | null
          media_url?: string | null
          scheduled_at?: string
          segment?: Json
          sent?: number
          started_at?: string | null
          status?: string
          text?: string
          total?: number
        }
        Relationships: []
      }
      bot_check_sessions: {
        Row: {
          chat_id: number
          marks: number | null
          photos: Json
          question: string | null
          step: string
          updated_at: string
        }
        Insert: {
          chat_id: number
          marks?: number | null
          photos?: Json
          question?: string | null
          step: string
          updated_at?: string
        }
        Update: {
          chat_id?: number
          marks?: number | null
          photos?: Json
          question?: string | null
          step?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_commands: {
        Row: {
          action: string
          builtin: string | null
          buttons: Json
          command: string
          created_at: string
          description_en: string
          description_hi: string
          enabled: boolean
          id: string
          media_type: string | null
          media_url: string | null
          response_text: string
          scope: string
          show_in_menu: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          action?: string
          builtin?: string | null
          buttons?: Json
          command: string
          created_at?: string
          description_en?: string
          description_hi?: string
          enabled?: boolean
          id?: string
          media_type?: string | null
          media_url?: string | null
          response_text?: string
          scope?: string
          show_in_menu?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          action?: string
          builtin?: string | null
          buttons?: Json
          command?: string
          created_at?: string
          description_en?: string
          description_hi?: string
          enabled?: boolean
          id?: string
          media_type?: string | null
          media_url?: string | null
          response_text?: string
          scope?: string
          show_in_menu?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      bot_daily_quiz: {
        Row: {
          best_streak: number
          chat_id: number
          created_at: string
          enabled: boolean
          lang: string | null
          last_done_date: string | null
          last_sent_date: string | null
          quiz: Json | null
          revision: Json | null
          send_hour: number
          streak: number
          updated_at: string
        }
        Insert: {
          best_streak?: number
          chat_id: number
          created_at?: string
          enabled?: boolean
          lang?: string | null
          last_done_date?: string | null
          last_sent_date?: string | null
          quiz?: Json | null
          revision?: Json | null
          send_hour?: number
          streak?: number
          updated_at?: string
        }
        Update: {
          best_streak?: number
          chat_id?: number
          created_at?: string
          enabled?: boolean
          lang?: string | null
          last_done_date?: string | null
          last_sent_date?: string | null
          quiz?: Json | null
          revision?: Json | null
          send_hour?: number
          streak?: number
          updated_at?: string
        }
        Relationships: []
      }
      bot_events: {
        Row: {
          chat_id: number
          created_at: string
          id: number
          kind: string
          name: string | null
        }
        Insert: {
          chat_id: number
          created_at?: string
          id?: number
          kind: string
          name?: string | null
        }
        Update: {
          chat_id?: number
          created_at?: string
          id?: number
          kind?: string
          name?: string | null
        }
        Relationships: []
      }
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
      bot_revision: {
        Row: {
          box: number
          chat_id: number
          created_at: string
          due: string
          key: string
          mcq: Json
          misses: number
          updated_at: string
        }
        Insert: {
          box?: number
          chat_id: number
          created_at?: string
          due: string
          key: string
          mcq: Json
          misses?: number
          updated_at?: string
        }
        Update: {
          box?: number
          chat_id?: number
          created_at?: string
          due?: string
          key?: string
          mcq?: Json
          misses?: number
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
      bot_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      bot_users: {
        Row: {
          blocked: boolean
          chat_id: number
          created_at: string
          first_name: string | null
          language_code: string | null
          last_active: string
          username: string | null
        }
        Insert: {
          blocked?: boolean
          chat_id: number
          created_at?: string
          first_name?: string | null
          language_code?: string | null
          last_active?: string
          username?: string | null
        }
        Update: {
          blocked?: boolean
          chat_id?: number
          created_at?: string
          first_name?: string | null
          language_code?: string | null
          last_active?: string
          username?: string | null
        }
        Relationships: []
      }
      ca_articles: {
        Row: {
          created_at: string
          id: string
          issue_date: string
          parse_job: string | null
          published_at: string | null
          reason: string | null
          run_id: string | null
          site_id: string | null
          source_id: string | null
          status: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          issue_date: string
          parse_job?: string | null
          published_at?: string | null
          reason?: string | null
          run_id?: string | null
          site_id?: string | null
          source_id?: string | null
          status?: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          issue_date?: string
          parse_job?: string | null
          published_at?: string | null
          reason?: string | null
          run_id?: string | null
          site_id?: string | null
          source_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_articles_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ca_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_articles_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "ca_watch_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ca_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_backfills: {
        Row: {
          created_at: string
          date_from: string
          date_to: string
          error: string | null
          finished_at: string | null
          id: string
          next_date: string
          sites: string[]
          started_by: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_from: string
          date_to: string
          error?: string | null
          finished_at?: string | null
          id?: string
          next_date: string
          sites?: string[]
          started_by?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_from?: string
          date_to?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          next_date?: string
          sites?: string[]
          started_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ca_clips: {
        Row: {
          created_at: string
          error: string | null
          headline: string
          id: string
          newspaper_id: string
          parts: Json
          source_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          headline?: string
          id?: string
          newspaper_id: string
          parts?: Json
          source_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          headline?: string
          id?: string
          newspaper_id?: string
          parts?: Json
          source_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_clips_newspaper_id_fkey"
            columns: ["newspaper_id"]
            isOneToOne: false
            referencedRelation: "ca_newspapers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_clips_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ca_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_corrections: {
        Row: {
          changes: Json
          created_at: string
          decided_at: string | null
          from_item_id: string | null
          id: string
          item_id: string
          status: string
          summary_en: string
          summary_hi: string
        }
        Insert: {
          changes?: Json
          created_at?: string
          decided_at?: string | null
          from_item_id?: string | null
          id?: string
          item_id: string
          status?: string
          summary_en?: string
          summary_hi?: string
        }
        Update: {
          changes?: Json
          created_at?: string
          decided_at?: string | null
          from_item_id?: string | null
          id?: string
          item_id?: string
          status?: string
          summary_en?: string
          summary_hi?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_corrections_from_item_id_fkey"
            columns: ["from_item_id"]
            isOneToOne: false
            referencedRelation: "ca_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_corrections_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "ca_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_doc_additions: {
        Row: {
          also_daily: boolean
          changes: Json
          created_at: string
          decided_at: string | null
          error: string | null
          facts: Json
          id: string
          item_id: string
          kind: string
          magazine_id: string | null
          month: string | null
          source_id: string
          status: string
        }
        Insert: {
          also_daily?: boolean
          changes?: Json
          created_at?: string
          decided_at?: string | null
          error?: string | null
          facts?: Json
          id?: string
          item_id: string
          kind?: string
          magazine_id?: string | null
          month?: string | null
          source_id: string
          status?: string
        }
        Update: {
          also_daily?: boolean
          changes?: Json
          created_at?: string
          decided_at?: string | null
          error?: string | null
          facts?: Json
          id?: string
          item_id?: string
          kind?: string
          magazine_id?: string | null
          month?: string | null
          source_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_doc_additions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "ca_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_doc_additions_magazine_id_fkey"
            columns: ["magazine_id"]
            isOneToOne: false
            referencedRelation: "ca_mags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_doc_additions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ca_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_events: {
        Row: {
          created_at: string
          embedding: string | null
          ends_on: string | null
          id: string
          kind: string
          name: string
          name_hi: string
          place: string
          starts_on: string | null
          status: string
          summary: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          ends_on?: string | null
          id?: string
          kind?: string
          name: string
          name_hi?: string
          place?: string
          starts_on?: string | null
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          ends_on?: string | null
          id?: string
          kind?: string
          name?: string
          name_hi?: string
          place?: string
          starts_on?: string | null
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      ca_issues: {
        Row: {
          approved_at: string | null
          caption: string | null
          caption_hi: string | null
          created_at: string
          design: Json | null
          error: string | null
          id: string
          item_count: number
          kind: string
          pdf_path: string | null
          pdf_path_hi: string | null
          pdf_url: string | null
          pdf_url_hi: string | null
          period: string
          posted_at: string | null
          scheduled_for: string | null
          status: string
          telegram_message_id: number | null
          telegram_message_id_hi: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          caption?: string | null
          caption_hi?: string | null
          created_at?: string
          design?: Json | null
          error?: string | null
          id?: string
          item_count?: number
          kind: string
          pdf_path?: string | null
          pdf_path_hi?: string | null
          pdf_url?: string | null
          pdf_url_hi?: string | null
          period: string
          posted_at?: string | null
          scheduled_for?: string | null
          status?: string
          telegram_message_id?: number | null
          telegram_message_id_hi?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          caption?: string | null
          caption_hi?: string | null
          created_at?: string
          design?: Json | null
          error?: string | null
          id?: string
          item_count?: number
          kind?: string
          pdf_path?: string | null
          pdf_path_hi?: string | null
          pdf_url?: string | null
          pdf_url_hi?: string | null
          period?: string
          posted_at?: string | null
          scheduled_for?: string | null
          status?: string
          telegram_message_id?: number | null
          telegram_message_id_hi?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ca_item_versions: {
        Row: {
          created_at: string
          headline: string
          id: string
          item_id: string
          reason: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          headline?: string
          id?: string
          item_id: string
          reason?: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          headline?: string
          id?: string
          item_id?: string
          reason?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ca_item_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "ca_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_items: {
        Row: {
          ai_pick: Json | null
          asked: Json | null
          asked_checked: boolean
          asked_hidden: string[]
          category: string
          collected_later: boolean
          concept: string | null
          content: Json | null
          context_sources: Json
          created_at: string
          embedding: string | null
          enrich_error: string | null
          event_id: string | null
          facts: Json
          from_document: boolean
          geo: Json | null
          headline: string
          history: Json | null
          id: string
          importance: number
          issue_date: string | null
          key_embedding: string | null
          mag_combined: boolean
          mag_date: string | null
          mag_grouped: boolean
          mag_origin_sig: string | null
          mag_parent: string | null
          mag_pending: number
          mag_pinned: boolean
          mag_section: string | null
          mag_sub: string | null
          magazine_id: string | null
          needs_enrich: boolean
          origin_id: string | null
          position: number
          rajasthan: boolean
          related_item_id: string | null
          scheme_checked: boolean
          scheme_id: string | null
          source_ids: string[]
          status: string
          story_key: string | null
          story_type: string | null
          syllabus_topic_id: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          ai_pick?: Json | null
          asked?: Json | null
          asked_checked?: boolean
          asked_hidden?: string[]
          category?: string
          collected_later?: boolean
          concept?: string | null
          content?: Json | null
          context_sources?: Json
          created_at?: string
          embedding?: string | null
          enrich_error?: string | null
          event_id?: string | null
          facts?: Json
          from_document?: boolean
          geo?: Json | null
          headline: string
          history?: Json | null
          id?: string
          importance?: number
          issue_date?: string | null
          key_embedding?: string | null
          mag_combined?: boolean
          mag_date?: string | null
          mag_grouped?: boolean
          mag_origin_sig?: string | null
          mag_parent?: string | null
          mag_pending?: number
          mag_pinned?: boolean
          mag_section?: string | null
          mag_sub?: string | null
          magazine_id?: string | null
          needs_enrich?: boolean
          origin_id?: string | null
          position?: number
          rajasthan?: boolean
          related_item_id?: string | null
          scheme_checked?: boolean
          scheme_id?: string | null
          source_ids?: string[]
          status?: string
          story_key?: string | null
          story_type?: string | null
          syllabus_topic_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          ai_pick?: Json | null
          asked?: Json | null
          asked_checked?: boolean
          asked_hidden?: string[]
          category?: string
          collected_later?: boolean
          concept?: string | null
          content?: Json | null
          context_sources?: Json
          created_at?: string
          embedding?: string | null
          enrich_error?: string | null
          event_id?: string | null
          facts?: Json
          from_document?: boolean
          geo?: Json | null
          headline?: string
          history?: Json | null
          id?: string
          importance?: number
          issue_date?: string | null
          key_embedding?: string | null
          mag_combined?: boolean
          mag_date?: string | null
          mag_grouped?: boolean
          mag_origin_sig?: string | null
          mag_parent?: string | null
          mag_pending?: number
          mag_pinned?: boolean
          mag_section?: string | null
          mag_sub?: string | null
          magazine_id?: string | null
          needs_enrich?: boolean
          origin_id?: string | null
          position?: number
          rajasthan?: boolean
          related_item_id?: string | null
          scheme_checked?: boolean
          scheme_id?: string | null
          source_ids?: string[]
          status?: string
          story_key?: string | null
          story_type?: string | null
          syllabus_topic_id?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "ca_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_items_mag_parent_fkey"
            columns: ["mag_parent"]
            isOneToOne: false
            referencedRelation: "ca_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_items_magazine_id_fkey"
            columns: ["magazine_id"]
            isOneToOne: false
            referencedRelation: "ca_mags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_items_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "ca_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_items_related_item_id_fkey"
            columns: ["related_item_id"]
            isOneToOne: false
            referencedRelation: "ca_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_items_scheme_id_fkey"
            columns: ["scheme_id"]
            isOneToOne: false
            referencedRelation: "ca_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_mag_seen: {
        Row: {
          fits: boolean
          item_id: string
          mag_id: string
        }
        Insert: {
          fits?: boolean
          item_id: string
          mag_id: string
        }
        Update: {
          fits?: boolean
          item_id?: string
          mag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_mag_seen_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "ca_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ca_mag_seen_mag_id_fkey"
            columns: ["mag_id"]
            isOneToOne: false
            referencedRelation: "ca_mags"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_mags: {
        Row: {
          created_at: string
          date_from: string
          date_to: string
          design: Json | null
          error: string | null
          features: Json
          finalized_at: string | null
          id: string
          pdf_at: string | null
          pdf_url_en: string | null
          pdf_url_hi: string | null
          post_error: string | null
          posted_at: string | null
          reorg_at: string | null
          reorg_queue: string[]
          sections: Json
          site_ids: string[]
          status: string
          theme: string
          title_en: string
          title_hi: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_from: string
          date_to: string
          design?: Json | null
          error?: string | null
          features?: Json
          finalized_at?: string | null
          id?: string
          pdf_at?: string | null
          pdf_url_en?: string | null
          pdf_url_hi?: string | null
          post_error?: string | null
          posted_at?: string | null
          reorg_at?: string | null
          reorg_queue?: string[]
          sections?: Json
          site_ids?: string[]
          status?: string
          theme: string
          title_en: string
          title_hi?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_from?: string
          date_to?: string
          design?: Json | null
          error?: string | null
          features?: Json
          finalized_at?: string | null
          id?: string
          pdf_at?: string | null
          pdf_url_en?: string | null
          pdf_url_hi?: string | null
          post_error?: string | null
          posted_at?: string | null
          reorg_at?: string | null
          reorg_queue?: string[]
          sections?: Json
          site_ids?: string[]
          status?: string
          theme?: string
          title_en?: string
          title_hi?: string
          updated_at?: string
        }
        Relationships: []
      }
      ca_newspapers: {
        Row: {
          created_at: string
          file_deleted_at: string | null
          file_path: string
          file_size: number
          id: string
          issue_date: string
          locked_until: string | null
          official: boolean
          pages: number
          source_name: string
          work: Json | null
        }
        Insert: {
          created_at?: string
          file_deleted_at?: string | null
          file_path: string
          file_size?: number
          id?: string
          issue_date: string
          locked_until?: string | null
          official?: boolean
          pages?: number
          source_name: string
          work?: Json | null
        }
        Update: {
          created_at?: string
          file_deleted_at?: string | null
          file_path?: string
          file_size?: number
          id?: string
          issue_date?: string
          locked_until?: string | null
          official?: boolean
          pages?: number
          source_name?: string
          work?: Json | null
        }
        Relationships: []
      }
      ca_runs: {
        Row: {
          backfill_id: string | null
          discovered: string[]
          error: string | null
          finished_at: string | null
          id: string
          issue_date: string
          locked_until: string | null
          mode: string
          notified: boolean
          sites: string[] | null
          started_at: string
          started_by: string
          status: string
          updated_at: string
        }
        Insert: {
          backfill_id?: string | null
          discovered?: string[]
          error?: string | null
          finished_at?: string | null
          id?: string
          issue_date: string
          locked_until?: string | null
          mode?: string
          notified?: boolean
          sites?: string[] | null
          started_at?: string
          started_by?: string
          status?: string
          updated_at?: string
        }
        Update: {
          backfill_id?: string | null
          discovered?: string[]
          error?: string | null
          finished_at?: string | null
          id?: string
          issue_date?: string
          locked_until?: string | null
          mode?: string
          notified?: boolean
          sites?: string[] | null
          started_at?: string
          started_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ca_runs_backfill_id_fkey"
            columns: ["backfill_id"]
            isOneToOne: false
            referencedRelation: "ca_backfills"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_schemes: {
        Row: {
          aliases: string[]
          created_at: string
          embedding: string | null
          id: string
          level: string
          name: string
          name_hi: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          created_at?: string
          embedding?: string | null
          id?: string
          level?: string
          name: string
          name_hi?: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          created_at?: string
          embedding?: string | null
          id?: string
          level?: string
          name?: string
          name_hi?: string
          updated_at?: string
        }
        Relationships: []
      }
      ca_sources: {
        Row: {
          chunks: number
          chunks_done: number
          content: string
          created_at: string
          doc_date: string | null
          doc_focus: string | null
          doc_lock: string | null
          doc_month: string | null
          doc_notes: Json
          error: string | null
          id: string
          issue_date: string | null
          mag_date: string | null
          magazine_id: string | null
          official: boolean
          section: string
          source_name: string
          status: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          chunks?: number
          chunks_done?: number
          content: string
          created_at?: string
          doc_date?: string | null
          doc_focus?: string | null
          doc_lock?: string | null
          doc_month?: string | null
          doc_notes?: Json
          error?: string | null
          id?: string
          issue_date?: string | null
          mag_date?: string | null
          magazine_id?: string | null
          official?: boolean
          section: string
          source_name?: string
          status?: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          chunks?: number
          chunks_done?: number
          content?: string
          created_at?: string
          doc_date?: string | null
          doc_focus?: string | null
          doc_lock?: string | null
          doc_month?: string | null
          doc_notes?: Json
          error?: string | null
          id?: string
          issue_date?: string | null
          mag_date?: string | null
          magazine_id?: string | null
          official?: boolean
          section?: string
          source_name?: string
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ca_sources_magazine_id_fkey"
            columns: ["magazine_id"]
            isOneToOne: false
            referencedRelation: "ca_mags"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_watch_sites: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          language: string
          last_error: string | null
          last_found: number | null
          last_method: string | null
          last_run_at: string | null
          max_articles: number
          name: string
          official: boolean
          section: string
          url: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          language?: string
          last_error?: string | null
          last_found?: number | null
          last_method?: string | null
          last_run_at?: string | null
          max_articles?: number
          name: string
          official?: boolean
          section?: string
          url: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          language?: string
          last_error?: string | null
          last_found?: number | null
          last_method?: string | null
          last_run_at?: string | null
          max_articles?: number
          name?: string
          official?: boolean
          section?: string
          url?: string
        }
        Relationships: []
      }
      exam_papers: {
        Row: {
          checked_at: string | null
          conducted_by: string
          created_at: string
          error: string | null
          exam: string
          exam_date: string | null
          id: string
          key_added: boolean
          kind: string
          lessons: Json
          mcq_test_id: string | null
          pages: number
          pages_done: number
          paper_code: string
          published_at: string | null
          questions_total: number | null
          series: string
          source: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          checked_at?: string | null
          conducted_by?: string
          created_at?: string
          error?: string | null
          exam: string
          exam_date?: string | null
          id?: string
          key_added?: boolean
          kind?: string
          lessons?: Json
          mcq_test_id?: string | null
          pages?: number
          pages_done?: number
          paper_code?: string
          published_at?: string | null
          questions_total?: number | null
          series?: string
          source?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          checked_at?: string | null
          conducted_by?: string
          created_at?: string
          error?: string | null
          exam?: string
          exam_date?: string | null
          id?: string
          key_added?: boolean
          kind?: string
          lessons?: Json
          mcq_test_id?: string | null
          pages?: number
          pages_done?: number
          paper_code?: string
          published_at?: string | null
          questions_total?: number | null
          series?: string
          source?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_papers_mcq_test_id_fkey"
            columns: ["mcq_test_id"]
            isOneToOne: false
            referencedRelation: "mcq_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          ai_check: Json | null
          ca: boolean | null
          correct: number | null
          created_at: string
          deleted: boolean
          embedding: string | null
          explanation_en: string
          explanation_general: boolean
          explanation_hi: string
          explanation_source: string
          extra_en: string
          extra_hi: string
          id: string
          key_note: string
          marks: number | null
          master_topic_id: string | null
          match: string | null
          match_note: string | null
          matched_item: string | null
          model_answer: string
          model_source: string
          options: Json
          paper_id: string
          part: string
          q_no: number
          question_en: string
          question_hi: string
          section: string | null
          subject_section: string
          topic_en: string
          topic_hi: string
          unit: string
          updated_at: string
          verified: boolean
          word_limit: number | null
        }
        Insert: {
          ai_check?: Json | null
          ca?: boolean | null
          correct?: number | null
          created_at?: string
          deleted?: boolean
          embedding?: string | null
          explanation_en?: string
          explanation_general?: boolean
          explanation_hi?: string
          explanation_source?: string
          extra_en?: string
          extra_hi?: string
          id?: string
          key_note?: string
          marks?: number | null
          master_topic_id?: string | null
          match?: string | null
          match_note?: string | null
          matched_item?: string | null
          model_answer?: string
          model_source?: string
          options?: Json
          paper_id: string
          part?: string
          q_no: number
          question_en?: string
          question_hi?: string
          section?: string | null
          subject_section?: string
          topic_en?: string
          topic_hi?: string
          unit?: string
          updated_at?: string
          verified?: boolean
          word_limit?: number | null
        }
        Update: {
          ai_check?: Json | null
          ca?: boolean | null
          correct?: number | null
          created_at?: string
          deleted?: boolean
          embedding?: string | null
          explanation_en?: string
          explanation_general?: boolean
          explanation_hi?: string
          explanation_source?: string
          extra_en?: string
          extra_hi?: string
          id?: string
          key_note?: string
          marks?: number | null
          master_topic_id?: string | null
          match?: string | null
          match_note?: string | null
          matched_item?: string | null
          model_answer?: string
          model_source?: string
          options?: Json
          paper_id?: string
          part?: string
          q_no?: number
          question_en?: string
          question_hi?: string
          section?: string | null
          subject_section?: string
          topic_en?: string
          topic_hi?: string
          unit?: string
          updated_at?: string
          verified?: boolean
          word_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_master_topic_id_fkey"
            columns: ["master_topic_id"]
            isOneToOne: false
            referencedRelation: "master_topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_questions_matched_item_fkey"
            columns: ["matched_item"]
            isOneToOne: false
            referencedRelation: "ca_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_questions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "exam_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_cards: {
        Row: {
          app_id: string | null
          back: string
          back_hint: string
          card_order: number | null
          chunk: number | null
          created_at: string
          error: boolean
          error_type: string
          ex: Json
          front: string
          history: Json
          id: string
          is_revealed: boolean
          own: Json
          pos: number
          prompt: string | null
          removed: boolean
          sources: Json
          topic_id: string
          updated_at: string
          verified: boolean
          word_key: string | null
        }
        Insert: {
          app_id?: string | null
          back?: string
          back_hint?: string
          card_order?: number | null
          chunk?: number | null
          created_at?: string
          error?: boolean
          error_type?: string
          ex?: Json
          front?: string
          history?: Json
          id?: string
          is_revealed?: boolean
          own?: Json
          pos?: number
          prompt?: string | null
          removed?: boolean
          sources?: Json
          topic_id: string
          updated_at?: string
          verified?: boolean
          word_key?: string | null
        }
        Update: {
          app_id?: string | null
          back?: string
          back_hint?: string
          card_order?: number | null
          chunk?: number | null
          created_at?: string
          error?: boolean
          error_type?: string
          ex?: Json
          front?: string
          history?: Json
          id?: string
          is_revealed?: boolean
          own?: Json
          pos?: number
          prompt?: string | null
          removed?: boolean
          sources?: Json
          topic_id?: string
          updated_at?: string
          verified?: boolean
          word_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flash_cards_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "flash_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      flash_templates: {
        Row: {
          columns: Json
          created_at: string
          examples: Json
          id: string
          key: string
          name: string
          prompt: string
          sort: number
          updated_at: string
          word_key: string
        }
        Insert: {
          columns?: Json
          created_at?: string
          examples?: Json
          id?: string
          key: string
          name: string
          prompt?: string
          sort?: number
          updated_at?: string
          word_key?: string
        }
        Update: {
          columns?: Json
          created_at?: string
          examples?: Json
          id?: string
          key?: string
          name?: string
          prompt?: string
          sort?: number
          updated_at?: string
          word_key?: string
        }
        Relationships: []
      }
      flash_topics: {
        Row: {
          books: Json
          chunks: Json
          columns: Json
          created_at: string
          id: string
          locked_at: string | null
          name: string
          prompt: string
          template_id: string | null
          updated_at: string
          word_key: string
        }
        Insert: {
          books?: Json
          chunks?: Json
          columns?: Json
          created_at?: string
          id?: string
          locked_at?: string | null
          name: string
          prompt?: string
          template_id?: string | null
          updated_at?: string
          word_key?: string
        }
        Update: {
          books?: Json
          chunks?: Json
          columns?: Json
          created_at?: string
          id?: string
          locked_at?: string | null
          name?: string
          prompt?: string
          template_id?: string | null
          updated_at?: string
          word_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "flash_topics_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "flash_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_decks: {
        Row: {
          created_at: string
          description: string
          id: string
          is_public: boolean
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
          is_public?: boolean
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
          is_public?: boolean
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
          is_public: boolean
          order_index: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          order_index?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
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
          hide_flashcards: boolean
          hide_google_play: boolean
          hide_mcq: boolean
          hide_mcq_practice: boolean
          hide_saathi: boolean
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
          hide_flashcards?: boolean
          hide_google_play?: boolean
          hide_mcq?: boolean
          hide_mcq_practice?: boolean
          hide_saathi?: boolean
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
          hide_flashcards?: boolean
          hide_google_play?: boolean
          hide_mcq?: boolean
          hide_mcq_practice?: boolean
          hide_saathi?: boolean
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
      master_topics: {
        Row: {
          created_at: string
          id: string
          level: string
          name_en: string
          name_hi: string
          parent_id: string | null
          position: number
          section: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          name_en?: string
          name_hi?: string
          parent_id?: string | null
          position?: number
          section: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          name_en?: string
          name_hi?: string
          parent_id?: string | null
          position?: number
          section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_topics_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "master_topics"
            referencedColumns: ["id"]
          },
        ]
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
          from_papers: boolean
          id: string
          is_public: boolean
          name: string
          order_index: number
          subject: string
          topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          from_papers?: boolean
          id?: string
          is_public?: boolean
          name: string
          order_index?: number
          subject?: string
          topic?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          from_papers?: boolean
          id?: string
          is_public?: boolean
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
          is_public: boolean
          name: string
          order_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          duration_seconds?: number
          id?: string
          is_public?: boolean
          name: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          duration_seconds?: number
          id?: string
          is_public?: boolean
          name?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      notes_books: {
        Row: {
          cover: Json
          created_at: string
          front: Json
          id: string
          section: string
          stage: string
          updated_at: string
        }
        Insert: {
          cover?: Json
          created_at?: string
          front?: Json
          id?: string
          section: string
          stage: string
          updated_at?: string
        }
        Update: {
          cover?: Json
          created_at?: string
          front?: Json
          id?: string
          section?: string
          stage?: string
          updated_at?: string
        }
        Relationships: []
      }
      notes_drafts: {
        Row: {
          book_id: string
          content: Json
          passages: Json
          status: string
          topic_id: string
          updated_at: string
          versions: Json
          written_at: string
        }
        Insert: {
          book_id: string
          content?: Json
          passages?: Json
          status?: string
          topic_id: string
          updated_at?: string
          versions?: Json
          written_at?: string
        }
        Update: {
          book_id?: string
          content?: Json
          passages?: Json
          status?: string
          topic_id?: string
          updated_at?: string
          versions?: Json
          written_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_drafts_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "notes_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_drafts_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "master_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      notes_topic_plans: {
        Row: {
          book_id: string
          checked_at: string
          coverage: string
          map: Json | null
          missing: string
          sig: string
          sources: Json
          topic_id: string
          upload: Json
        }
        Insert: {
          book_id: string
          checked_at?: string
          coverage?: string
          map?: Json | null
          missing?: string
          sig?: string
          sources?: Json
          topic_id: string
          upload?: Json
        }
        Update: {
          book_id?: string
          checked_at?: string
          coverage?: string
          map?: Json | null
          missing?: string
          sig?: string
          sources?: Json
          topic_id?: string
          upload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "notes_topic_plans_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "notes_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_topic_plans_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "master_topics"
            referencedColumns: ["id"]
          },
        ]
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
      ras_syllabus_topics: {
        Row: {
          embedding: string | null
          id: string
          paper: string
          part: string
          topic: string
          unit_id: string
          unit_title: string
          updated_at: string
        }
        Insert: {
          embedding?: string | null
          id: string
          paper: string
          part: string
          topic: string
          unit_id: string
          unit_title: string
          updated_at?: string
        }
        Update: {
          embedding?: string | null
          id?: string
          paper?: string
          part?: string
          topic?: string
          unit_id?: string
          unit_title?: string
          updated_at?: string
        }
        Relationships: []
      }
      saathi_answer_cache: {
        Row: {
          answer: string
          channel: string
          created_at: string
          english_query: string | null
          followups: Json
          hits: number
          kb_version: number
          key: string
          last_hit_at: string | null
          meta: Json | null
          question: string
          sources: Json
        }
        Insert: {
          answer: string
          channel: string
          created_at?: string
          english_query?: string | null
          followups?: Json
          hits?: number
          kb_version: number
          key: string
          last_hit_at?: string | null
          meta?: Json | null
          question: string
          sources?: Json
        }
        Update: {
          answer?: string
          channel?: string
          created_at?: string
          english_query?: string | null
          followups?: Json
          hits?: number
          kb_version?: number
          key?: string
          last_hit_at?: string | null
          meta?: Json | null
          question?: string
          sources?: Json
        }
        Relationships: []
      }
      saathi_answer_formats: {
        Row: {
          enabled: boolean
          marks: number
          updated_at: string
          word_limit: number
        }
        Insert: {
          enabled?: boolean
          marks: number
          updated_at?: string
          word_limit: number
        }
        Update: {
          enabled?: boolean
          marks?: number
          updated_at?: string
          word_limit?: number
        }
        Relationships: []
      }
      saathi_blueprint_scores: {
        Row: {
          answer_id: string
          blueprint_id: string | null
          created_at: string
          generated: string
          id: string
          scores: Json
          total: number
          word_count: number
        }
        Insert: {
          answer_id: string
          blueprint_id?: string | null
          created_at?: string
          generated: string
          id?: string
          scores: Json
          total: number
          word_count?: number
        }
        Update: {
          answer_id?: string
          blueprint_id?: string | null
          created_at?: string
          generated?: string
          id?: string
          scores?: Json
          total?: number
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "saathi_blueprint_scores_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "saathi_model_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saathi_blueprint_scores_blueprint_id_fkey"
            columns: ["blueprint_id"]
            isOneToOne: false
            referencedRelation: "saathi_blueprints"
            referencedColumns: ["id"]
          },
        ]
      }
      saathi_blueprints: {
        Row: {
          answer_ids: string[]
          created_at: string
          directive: string
          guide: string
          id: string
          locked: boolean
          marks: number
          sample_count: number
          stats: Json | null
          status: string
          tips: Json
          unit: string
          version: number
        }
        Insert: {
          answer_ids?: string[]
          created_at?: string
          directive: string
          guide: string
          id?: string
          locked?: boolean
          marks: number
          sample_count?: number
          stats?: Json | null
          status?: string
          tips?: Json
          unit?: string
          version: number
        }
        Update: {
          answer_ids?: string[]
          created_at?: string
          directive?: string
          guide?: string
          id?: string
          locked?: boolean
          marks?: number
          sample_count?: number
          stats?: Json | null
          status?: string
          tips?: Json
          unit?: string
          version?: number
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
      saathi_eval_questions: {
        Row: {
          created_at: string
          expected_document: string
          id: string
          last_english_query: string | null
          last_passed: boolean | null
          last_rank: number | null
          last_run_at: string | null
          question: string
        }
        Insert: {
          created_at?: string
          expected_document: string
          id?: string
          last_english_query?: string | null
          last_passed?: boolean | null
          last_rank?: number | null
          last_run_at?: string | null
          question: string
        }
        Update: {
          created_at?: string
          expected_document?: string
          id?: string
          last_english_query?: string | null
          last_passed?: boolean | null
          last_rank?: number | null
          last_run_at?: string | null
          question?: string
        }
        Relationships: []
      }
      saathi_feedback: {
        Row: {
          answer: string
          created_at: string
          id: string
          question: string
          rating: number
          sources: string[]
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          question: string
          rating: number
          sources?: string[]
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          question?: string
          rating?: number
          sources?: string[]
        }
        Relationships: []
      }
      saathi_kb_version: {
        Row: {
          id: number
          updated_at: string
          version: number
        }
        Insert: {
          id?: number
          updated_at?: string
          version?: number
        }
        Update: {
          id?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      saathi_knowledge: {
        Row: {
          chunk_index: number | null
          content: string
          content_hash: string | null
          created_at: string
          embedding: string | null
          fts_vector: unknown
          id: string
          language: string | null
          medium: string
          parent_id: string | null
          source: string | null
          source_file: string | null
          source_markdown: string | null
          subject: string
          title: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          chunk_index?: number | null
          content: string
          content_hash?: string | null
          created_at?: string
          embedding?: string | null
          fts_vector?: unknown
          id?: string
          language?: string | null
          medium?: string
          parent_id?: string | null
          source?: string | null
          source_file?: string | null
          source_markdown?: string | null
          subject: string
          title: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          chunk_index?: number | null
          content?: string
          content_hash?: string | null
          created_at?: string
          embedding?: string | null
          fts_vector?: unknown
          id?: string
          language?: string | null
          medium?: string
          parent_id?: string | null
          source?: string | null
          source_file?: string | null
          source_markdown?: string | null
          subject?: string
          title?: string
          topic?: string | null
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
          question_key: string
        }
        Insert: {
          ask_count?: number
          created_at?: string
          id?: string
          last_asked_at?: string
          question: string
          question_key: string
        }
        Update: {
          ask_count?: number
          created_at?: string
          id?: string
          last_asked_at?: string
          question?: string
          question_key?: string
        }
        Relationships: []
      }
      saathi_model_answers: {
        Row: {
          analysis: Json | null
          analysis_error: string | null
          answer: string
          created_at: string
          directive: string
          embedding: string | null
          exam: string
          holdout: boolean
          id: string
          marks: number
          paper: string | null
          question: string
          source: string | null
          subject: string | null
          topic_id: string | null
          unit: string | null
          updated_at: string
          word_count: number
          year: number | null
        }
        Insert: {
          analysis?: Json | null
          analysis_error?: string | null
          answer: string
          created_at?: string
          directive?: string
          embedding?: string | null
          exam?: string
          holdout?: boolean
          id?: string
          marks: number
          paper?: string | null
          question: string
          source?: string | null
          subject?: string | null
          topic_id?: string | null
          unit?: string | null
          updated_at?: string
          word_count?: number
          year?: number | null
        }
        Update: {
          analysis?: Json | null
          analysis_error?: string | null
          answer?: string
          created_at?: string
          directive?: string
          embedding?: string | null
          exam?: string
          holdout?: boolean
          id?: string
          marks?: number
          paper?: string | null
          question?: string
          source?: string | null
          subject?: string | null
          topic_id?: string | null
          unit?: string | null
          updated_at?: string
          word_count?: number
          year?: number | null
        }
        Relationships: []
      }
      saathi_rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start?: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      syllabus_exams: {
        Row: {
          body: string
          created_at: string
          error: string | null
          id: string
          name: string
          notified_on: string | null
          pages: number
          pages_done: number
          scheme: Json | null
          stage: string
          status: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          name: string
          notified_on?: string | null
          pages?: number
          pages_done?: number
          scheme?: Json | null
          stage?: string
          status?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          name?: string
          notified_on?: string | null
          pages?: number
          pages_done?: number
          scheme?: Json | null
          stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      syllabus_links: {
        Row: {
          created_at: string
          node_id: string
          topic_id: string
        }
        Insert: {
          created_at?: string
          node_id: string
          topic_id: string
        }
        Update: {
          created_at?: string
          node_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_links_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "syllabus_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syllabus_links_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "master_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      syllabus_nodes: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          kind: string
          marks: number | null
          page: number | null
          position: number
          section: string
          text_en: string
          text_hi: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          kind?: string
          marks?: number | null
          page?: number | null
          position?: number
          section?: string
          text_en?: string
          text_hi?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          kind?: string
          marks?: number | null
          page?: number | null
          position?: number
          section?: string
          text_en?: string
          text_hi?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_nodes_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "syllabus_exams"
            referencedColumns: ["id"]
          },
        ]
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
      bot_auto_reply_hit: { Args: { reply_id: string }; Returns: undefined }
      bot_check_add_photo: {
        Args: { p_chat_id: number; p_max: number; p_photo: Json }
        Returns: number
      }
      bot_claim_broadcast: {
        Args: { lock_seconds?: number }
        Returns: {
          blocked: number
          buttons: Json
          created_at: string
          cursor: number | null
          failed: number
          finished_at: string | null
          id: string
          locked_until: string | null
          media_type: string | null
          media_url: string | null
          scheduled_at: string
          segment: Json
          sent: number
          started_at: string | null
          status: string
          text: string
          total: number
        }[]
        SetofOptions: {
          from: "*"
          to: "bot_broadcasts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      bot_daily_quiz_answer: {
        Args: { p_chat_id: number; p_option: number; p_poll_id: string }
        Returns: {
          best_streak: number
          chat_id: number
          created_at: string
          enabled: boolean
          lang: string | null
          last_done_date: string | null
          last_sent_date: string | null
          quiz: Json | null
          revision: Json | null
          send_hour: number
          streak: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "bot_daily_quiz"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      bot_daily_quiz_claim: {
        Args: { p_chat_id: number; p_today: string }
        Returns: boolean
      }
      bot_segment_count: { Args: { segment: Json }; Returns: number }
      bot_segment_users: {
        Args: { after_chat_id: number; max_rows: number; segment: Json }
        Returns: {
          chat_id: number
        }[]
      }
      bot_stats: { Args: { days?: number }; Returns: Json }
      ca_claim_due_issue: {
        Args: never
        Returns: {
          approved_at: string | null
          caption: string | null
          caption_hi: string | null
          created_at: string
          design: Json | null
          error: string | null
          id: string
          item_count: number
          kind: string
          pdf_path: string | null
          pdf_path_hi: string | null
          pdf_url: string | null
          pdf_url_hi: string | null
          period: string
          posted_at: string | null
          scheduled_for: string | null
          status: string
          telegram_message_id: number | null
          telegram_message_id_hi: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ca_issues"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ca_claim_run: {
        Args: { p_seconds?: number }
        Returns: {
          backfill_id: string | null
          discovered: string[]
          error: string | null
          finished_at: string | null
          id: string
          issue_date: string
          locked_until: string | null
          mode: string
          notified: boolean
          sites: string[] | null
          started_at: string
          started_by: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ca_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      ca_similar_items: {
        Args: {
          p_count?: number
          p_embedding: string
          p_exclude?: string
          p_from: string
          p_to: string
        }
        Returns: {
          headline: string
          id: string
          issue_date: string
          similarity: number
        }[]
      }
      exam_questions_near: {
        Args: { p_count?: number; p_embedding: string }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      exam_similar_items: {
        Args: {
          p_count?: number
          p_embedding: string
          p_from: string
          p_to: string
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
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
      match_saathi_chunks: {
        Args: {
          match_count?: number
          query_embedding: string
          query_text: string
          subject_filters?: string[]
        }
        Returns: {
          content: string
          id: string
          keyword_score: number
          language: string
          medium: string
          similarity: number
          source: string
          source_file: string
          subject: string
          title: string
          topic: string
          vector_score: number
        }[]
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
      saathi_cache_get: {
        Args: { p_channel: string; p_question: string; p_subjects: string[] }
        Returns: {
          answer: string
          channel: string
          created_at: string
          english_query: string | null
          followups: Json
          hits: number
          kb_version: number
          key: string
          last_hit_at: string | null
          meta: Json | null
          question: string
          sources: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "saathi_answer_cache"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      saathi_cache_key: {
        Args: { p_channel: string; p_question: string; p_subjects: string[] }
        Returns: string
      }
      saathi_cache_put: {
        Args: {
          p_answer: string
          p_channel: string
          p_english_query: string
          p_followups: Json
          p_meta?: Json
          p_question: string
          p_sources: Json
          p_subjects: string[]
        }
        Returns: undefined
      }
      saathi_consume_rate_limit: {
        Args: { max_hits: number; rl_key: string; window_seconds: number }
        Returns: boolean
      }
      saathi_detect_language: { Args: { t: string }; Returns: string }
      saathi_find_duplicate_chunks: {
        Args: { contents: string[]; exclude_parent?: string }
        Returns: {
          matches: number
          parent_id: string
          title: string
        }[]
      }
      saathi_health: {
        Args: never
        Returns: {
          avg_chars: number
          chunk_count: number
          created_at: string
          duplicate_chunks: number
          english_chunks: number
          has_source: boolean
          hindi_chunks: number
          id: string
          is_legacy: boolean
          max_chars: number
          medium: string
          missing_embeddings: number
          oversized_chunks: number
          subject: string
          tiny_chunks: number
          title: string
          topic: string
        }[]
      }
      saathi_mains_context: {
        Args: {
          p_count?: number
          p_directive: string
          p_embedding: string
          p_marks: number
          p_min_topic?: number
        }
        Returns: Json
      }
      saathi_nearest_syllabus_topic: {
        Args: { p_embedding: string }
        Returns: Json
      }
      saathi_normalize_question: { Args: { q: string }; Returns: string }
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
      app_role: ["admin"],
    },
  },
} as const
