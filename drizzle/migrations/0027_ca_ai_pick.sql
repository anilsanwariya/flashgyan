-- The AI's first decision for a story, kept to learn from the editor's
-- changes: {"status": "included" | "dropped", "importance": 1-3,
-- "category": section, "capped": true when it came in dropped only because
-- the day was full}. Null for stories made before this.
ALTER TABLE public.ca_items ADD COLUMN IF NOT EXISTS ai_pick jsonb;