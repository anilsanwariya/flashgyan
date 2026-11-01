-- Exam papers read in the background: PDFs uploaded to a private bucket are
-- queued, and the server reads them a few pages at a time (each page sent
-- to the AI as a one-page PDF), with the browser closed.
CREATE TABLE IF NOT EXISTS public.exam_paper_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid REFERENCES public.exam_papers (id) ON DELETE CASCADE,
  file_name text NOT NULL DEFAULT '',
  file_path text NOT NULL,
  -- uploading (the file is on its way), waiting, reading, done, failed.
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'waiting', 'reading', 'done', 'failed')),
  pages integer NOT NULL DEFAULT 0,
  pages_done integer NOT NULL DEFAULT 0,
  -- Tries on the current page (a page failing three times stops the paper).
  attempts integer NOT NULL DEFAULT 0,
  error text,
  -- Held by one reader at a time.
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_paper_queue_status_idx ON public.exam_paper_queue (status, created_at);
ALTER TABLE public.exam_paper_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exam_paper_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.exam_paper_queue TO service_role;

-- Private bucket for the queued PDFs: only the server reads it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('exam-papers', 'exam-papers', false)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
