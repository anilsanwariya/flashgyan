-- A monthly issue's cover design (photos, colours, ribbon, cover story), the
-- ad pages after its sections and its back cover. Empty: the classic cover.
ALTER TABLE public.ca_issues
  ADD COLUMN IF NOT EXISTS design jsonb;
