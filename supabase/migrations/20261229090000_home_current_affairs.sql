-- The homepage's Current Affairs card can be hidden, like the other
-- features (visibility only; it never locks the reader). Safe to run again.
ALTER TABLE public.home_settings
  ADD COLUMN IF NOT EXISTS hide_current_affairs boolean NOT NULL DEFAULT false;
