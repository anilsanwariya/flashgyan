-- Flashcard studio: deck types whose front is wrong on purpose (शब्द
-- शुद्धि, वाक्य शुद्धि: the student writes its correct form). Their fronts are
-- never spell-checked, "fixed" or counted as house spellings.
ALTER TABLE public.flash_templates
  ADD COLUMN IF NOT EXISTS wrong_front boolean NOT NULL DEFAULT false;
UPDATE public.flash_templates
SET wrong_front = true
WHERE key IN ('shabd-shuddhi', 'vakya-shuddhi');
