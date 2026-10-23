-- A report's or an appointment's history line, printed under the story:
-- "Over the years: India 85th (2025) → 80th (2026)", "On this post before:
-- …". {"kind", "en", "hi", "from": [earlier story ids]}; null: not made.
ALTER TABLE public.ca_items ADD COLUMN IF NOT EXISTS history jsonb;
