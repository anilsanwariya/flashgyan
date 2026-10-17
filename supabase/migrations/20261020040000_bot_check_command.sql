-- The /check command for SAATHI answer checking. The table, photo function and
-- builtin constraint are already applied (drizzle 0008); this adds the command.
INSERT INTO public.bot_commands
  (command, description_en, description_hi, action, builtin, scope, sort_order)
VALUES
  ('check', 'Check your Mains answer (text or photo)',
   'मुख्य परीक्षा उत्तर जाँचें (टेक्स्ट या फ़ोटो)', 'builtin', 'check', 'private', 47)
ON CONFLICT (command) DO NOTHING;
