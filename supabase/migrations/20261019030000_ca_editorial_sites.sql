-- Current affairs: newspaper editorial pages to watch. Their headlines are
-- picked separately from news (issues RPSC asks in RAS Mains, a few a day) and
-- each editorial becomes a story in the Editorials section. Safe to run more
-- than once; an admin can edit, switch off or delete them later.
INSERT INTO public.ca_watch_sites (url, name, section, language, max_articles) VALUES
  ('https://www.thehindu.com/opinion/editorial/feeder/default.rss', 'The Hindu (editorials)', 'editorial', 'English', 2),
  ('https://indianexpress.com/section/opinion/editorials/feed/', 'The Indian Express (editorials)', 'editorial', 'English', 2)
ON CONFLICT (url) DO NOTHING;
