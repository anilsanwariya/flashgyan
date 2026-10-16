-- Current affairs: the static textbook concept behind each story ("ballistic
-- missile", "Article 14 equality before law"). The background is searched in
-- the books by this concept, and stories whose concept the books don't cover
-- are listed for the admin. Safe to run more than once.
ALTER TABLE public.ca_items ADD COLUMN IF NOT EXISTS concept text;
