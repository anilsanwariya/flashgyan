ALTER TABLE public.ca_items
  ADD COLUMN IF NOT EXISTS mag_parent uuid REFERENCES public.ca_items (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mag_combined boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mag_grouped boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mag_pending integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mag_origin_sig text;
CREATE INDEX IF NOT EXISTS ca_items_mag_parent_idx ON public.ca_items (mag_parent);
ALTER TABLE public.ca_mags
  ADD COLUMN IF NOT EXISTS reorg_at timestamptz,
  ADD COLUMN IF NOT EXISTS reorg_queue text[] NOT NULL DEFAULT '{}';