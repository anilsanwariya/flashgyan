-- Custom magazines, step 3: stories on one topic across dates joined into
-- one combined article, subsections re-sorted as the magazine grows, and a
-- note when a daily story changes after it was copied.
ALTER TABLE public.ca_items
  -- A copy joined into a combined article (not printed on its own).
  ADD COLUMN IF NOT EXISTS mag_parent uuid REFERENCES public.ca_items (id) ON DELETE SET NULL,
  -- A combined article, written from the stories joined into it.
  ADD COLUMN IF NOT EXISTS mag_combined boolean NOT NULL DEFAULT false,
  -- Already checked for stories on the same topic.
  ADD COLUMN IF NOT EXISTS mag_grouped boolean NOT NULL DEFAULT false,
  -- Stories joined since the combined article was written by hand-edited
  -- text (waiting for the editor to add them).
  ADD COLUMN IF NOT EXISTS mag_pending integer NOT NULL DEFAULT 0,
  -- The daily story's text when it was copied, to notice later changes.
  ADD COLUMN IF NOT EXISTS mag_origin_sig text;
CREATE INDEX IF NOT EXISTS ca_items_mag_parent_idx ON public.ca_items (mag_parent);

-- Re-sorting a magazine's subsections: when last done, and the sections
-- still to do in the current round.
ALTER TABLE public.ca_mags
  ADD COLUMN IF NOT EXISTS reorg_at timestamptz,
  ADD COLUMN IF NOT EXISTS reorg_queue text[] NOT NULL DEFAULT '{}';
