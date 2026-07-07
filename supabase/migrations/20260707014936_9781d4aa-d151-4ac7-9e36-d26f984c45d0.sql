ALTER TABLE public.flashcard_decks DROP CONSTRAINT IF EXISTS flashcard_decks_subject_topic_key;
ALTER TABLE public.home_settings ADD COLUMN IF NOT EXISTS hide_app_store boolean NOT NULL DEFAULT false;
ALTER TABLE public.home_settings ADD COLUMN IF NOT EXISTS hide_google_play boolean NOT NULL DEFAULT false;