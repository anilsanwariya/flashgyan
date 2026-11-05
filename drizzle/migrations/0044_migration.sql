DO $mig$
DECLARE
  s text;
  j record;
BEGIN
  SELECT value #>> '{}' INTO s FROM public.bot_settings WHERE key = 'cron_secret';
  IF s IS NULL OR length(s) < 32 THEN
    s := md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text);
    INSERT INTO public.bot_settings (key, value) VALUES ('cron_secret', to_jsonb(s))
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  FOR j IN SELECT jobid, command FROM cron.job
    WHERE (command LIKE '%/api/ca/tick%' OR command LIKE '%task=broadcast%')
      AND command NOT LIKE '%x-cron-secret%'
      AND command LIKE '%net.http_post(url := %'
  LOOP
    PERFORM cron.alter_job(j.jobid, command := replace(j.command, 'net.http_post(url := ',
      'net.http_post(headers := jsonb_build_object(''x-cron-secret'', ' || quote_literal(s) || '), url := '));
  END LOOP;
END
$mig$;