-- Separate Hindi and English issues. Each issue keeps one row: the English
-- issue's PDF, caption and channel post in the existing columns, and the
-- Hindi issue's in the new *_hi columns (empty on older bilingual issues).
ALTER TABLE public.ca_issues
  ADD COLUMN IF NOT EXISTS pdf_path_hi text,
  ADD COLUMN IF NOT EXISTS pdf_url_hi text,
  ADD COLUMN IF NOT EXISTS caption_hi text,
  ADD COLUMN IF NOT EXISTS telegram_message_id_hi bigint;

-- The language each student picked for the bot's daily quiz ('hi' or 'en';
-- empty until they pick).
ALTER TABLE public.bot_daily_quiz
  ADD COLUMN IF NOT EXISTS lang text CHECK (lang IN ('en', 'hi'));
