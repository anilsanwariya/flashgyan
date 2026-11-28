-- News in brief: a day's story is a full story or a one-line brief
-- (संक्षेप में). Safe to run again. Until it runs, every story is a full
-- story and switching one to a brief asks for this migration.
ALTER TABLE public.ca_items
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'story';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ca_items_format_check'
  ) THEN
    ALTER TABLE public.ca_items
      ADD CONSTRAINT ca_items_format_check CHECK (format IN ('story', 'brief'));
  END IF;
END $$;
