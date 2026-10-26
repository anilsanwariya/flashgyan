-- The AI check's last look at each card: when, a fingerprint of the text
-- it read, and the fixes it suggests (applied or dismissed in the studio).
ALTER TABLE public.flash_cards ADD COLUMN IF NOT EXISTS ai jsonb;
