## Root cause

The browser uploads directly to Storage with the user's session token. The Storage RLS policy then calls `public.has_role(auth.uid(), 'admin')`, which depends on (a) the JWT actually reaching Storage with the right `auth.uid()` and (b) the role lookup succeeding in that request context. In this project both buckets currently have **zero** objects — so MCQ image uploads have never actually succeeded either, the issue just hadn't been hit until now. Continuing to debug client-side storage RLS is fragile.

## Fix: route image uploads through an admin server function

Send the file to a `createServerFn` that:
1. Runs `requireSupabaseAuth` and verifies the caller has the `admin` role (already done by `assertAdmin`).
2. Uses `supabaseAdmin` (service role) to `storage.from('flashcard-images').upload(path, bytes)`. Service role bypasses RLS, so the upload always works once the user is confirmed admin.
3. Updates the flashcard's `image_url` to the stored path and returns a signed URL.

Apply the same pattern to the MCQ image upload so it actually works going forward.

### Changes

- `src/lib/flashcards.functions.ts`: add `uploadFlashcardImage` server fn (input: `{ id, filename, contentType, dataBase64 }`). Validates admin, uploads via `supabaseAdmin`, updates `flashcards.image_url` to the path, returns `{ path, url }`.
- `src/lib/mcq.functions.ts`: add the equivalent `uploadMcqImage` for parity.
- `src/routes/_authenticated/admin.tsx`: in both `onUpload` handlers, read the file as base64 and call the new server fn instead of `supabase.storage.from(...).upload(...)`. Keep the existing path/state wiring; just swap the transport.

No DB migration or policy change needed. Existing RLS policies stay as defense-in-depth.
