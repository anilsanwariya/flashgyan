
CREATE TABLE public.home_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.home_banners TO anon, authenticated;
GRANT ALL ON public.home_banners TO service_role;
ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "home_banners public read" ON public.home_banners FOR SELECT USING (true);
CREATE POLICY "home_banners admin all" ON public.home_banners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.home_settings (
  id int PRIMARY KEY DEFAULT 1,
  cta_label text NOT NULL DEFAULT '',
  cta_url text NOT NULL DEFAULT '',
  lock_flashcards boolean NOT NULL DEFAULT false,
  lock_mcq boolean NOT NULL DEFAULT false,
  lock_saathi boolean NOT NULL DEFAULT false,
  lock_cta boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT home_settings_singleton CHECK (id = 1)
);
GRANT SELECT ON public.home_settings TO anon, authenticated;
GRANT ALL ON public.home_settings TO service_role;
ALTER TABLE public.home_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "home_settings public read" ON public.home_settings FOR SELECT USING (true);
CREATE POLICY "home_settings admin all" ON public.home_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.home_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE POLICY "home-banners public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'home-banners');
CREATE POLICY "home-banners admin write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'home-banners' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'home-banners' AND public.has_role(auth.uid(), 'admin'));
