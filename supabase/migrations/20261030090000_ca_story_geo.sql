-- Where a "Places in News" story's place is (latitude, longitude, and whether
-- it is in Rajasthan, elsewhere in India or abroad), found once and kept, for
-- the monthly magazine's maps.
ALTER TABLE public.ca_items ADD COLUMN IF NOT EXISTS geo jsonb;
