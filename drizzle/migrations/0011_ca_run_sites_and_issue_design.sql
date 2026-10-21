-- The websites a collection reads: chosen by the admin for "Collect now", or
-- those switched on in Settings for the evening collection. NULL (older
-- runs): every website switched on.
ALTER TABLE public.ca_runs ADD COLUMN IF NOT EXISTS sites uuid[];

-- A monthly issue's cover design (photos, colours, ribbon, cover story), the
-- ad pages after its sections and its back cover. Empty: the classic cover.
ALTER TABLE public.ca_issues
  ADD COLUMN IF NOT EXISTS design jsonb;