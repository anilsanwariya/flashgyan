## Fix

Run a migration that grants execute on `public.has_role` to the roles used by storage RLS:

```sql
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;
```

That's all — no app code change needed. The flashcard-images storage policy (`bucket_id = 'flashcard-images' AND public.has_role(auth.uid(), 'admin')`) will then evaluate correctly, and the upload from the admin panel will succeed.

### Why this happened

The MCQ bucket worked because its policy was created at the same time as `has_role` and inherited execute access in that session. The newer flashcard policy is evaluated under the `authenticated` role at upload time, which has no execute privilege on the function, so PostgREST/Storage returns `permission denied for function has_role`.