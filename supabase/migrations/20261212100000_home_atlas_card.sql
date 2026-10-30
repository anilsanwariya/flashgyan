-- The Rajasthan atlas card on the homepage: hidden or shown, independently
-- of any lock (hiding only removes the card; /atlas stays open).
ALTER TABLE public.home_settings ADD COLUMN IF NOT EXISTS hide_atlas boolean NOT NULL DEFAULT false;
