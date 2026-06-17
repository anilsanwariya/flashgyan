# MCQ Tests Feature

A new feature alongside Flashcards. Admins create tests, upload questions via Excel, edit questions, and attach images. Users take timed tests and review answers with explanations.

## 1. Database (single migration)

### `mcq_tests`
- `id` uuid PK
- `name` text (test name)
- `description` text (short description)
- `order_index` int (display order on homepage)
- `duration_seconds` int (countdown timer, set by admin)
- `created_at`, `updated_at` timestamps

### `mcq_questions`
- `id` uuid PK
- `test_id` uuid FK -> mcq_tests (on delete cascade)
- `order_index` int
- `question` text
- `hint` text nullable
- `image_url` text nullable (uploaded via admin)
- `option_1`, `option_2`, `option_3`, `option_4` text
- `answer` int (1–4, which option is correct)
- `explanation_sections` jsonb (array of `{title, body}`, parsed from `explanation_*` columns like flashcards)
- `created_at`, `updated_at`

### Storage
- New public bucket `mcq-images` for question images.
- RLS on `storage.objects`: public SELECT; INSERT/UPDATE/DELETE restricted to admins via `has_role`.

### RLS
- `mcq_tests`, `mcq_questions`: public SELECT (anon + authenticated); INSERT/UPDATE/DELETE only when `has_role(auth.uid(), 'admin')`.
- GRANTs in same migration per project rules.

## 2. Server functions (`src/lib/mcq.functions.ts`)

Public reads (publishable client):
- `listTests()` → tests ordered by `order_index`, with question count.
- `getTest({ id })` → test + ordered questions (no `answer` field exposed for taking? — we'll send `answer` since scoring happens client-side after submit; acceptable given this is a study app, mirrors flashcards which exposes answers too).

Admin-only (`requireSupabaseAuth` + admin check, mirrors `bulkImportCards`):
- `createTest({ name, description, order_index, duration_seconds })`
- `updateTest({ id, ... })`
- `deleteTest({ id })`
- `bulkImportMcq({ test_id, rows, mode: append|replace })`
- `updateQuestion({ id, ...fields })`
- `deleteQuestion({ id })`
- `setQuestionImage({ id, image_url })` (URL returned from storage upload)

## 3. Admin panel (`src/routes/_authenticated/admin.tsx`)

Add a top-level tab switcher: **Flashcards | MCQ Tests**. Flashcards tab keeps current UI unchanged.

MCQ Tests tab:
- "Add Test" button → form with: Name, Short Description, Order, Duration (mm:ss or seconds).
- List of existing tests, each row shows name/order/duration/question count, with:
  - Edit metadata (inline dialog)
  - Upload Excel (append/replace modes, same parser as flashcards but for MCQ schema)
  - View questions → drawer/page listing all questions
  - Delete test
- Question list view (per test):
  - For each question: order, question text, options with correct marked, hint, image thumbnail.
  - Edit button → dialog to manually edit any field.
  - Upload image button → uploads to `mcq-images` bucket, saves URL.
  - Delete question.

### Excel parser
Required columns: `order, question, option_1, option_2, option_3, option_4, answer`.
Optional: `hint`, any `explanation_*` columns (suffix → section title, same as flashcards).
`answer` accepts `1|2|3|4` or `option_1..option_4` or `A|B|C|D` → normalized to 1–4.

## 4. Homepage (`src/routes/index.tsx`)

Feature picker already has "MCQs" disabled. Enable it:
- `View = "home" | "flashcards" | "mcqs"`
- MCQs view: list `mcq_tests` as cards (name, description, question count, duration). Click → `/mcq/$testId`.

## 5. User-facing test routes

### `src/routes/mcq.$testId.tsx` — Take test
- Loads test + questions via server fn.
- Local state: `answers: Record<questionId, 1|2|3|4|null>` (null = "Not answered", default).
- Countdown timer based on `duration_seconds`; auto-submits on 0.
- One-question-per-screen with prev/next + question palette; shows question, image (if any) between question and hint, hint (collapsible), 4 options + "Not answered" radio.
- "End Test" button with confirm dialog (mirrors session-end pattern).
- On submit: compute score client-side using marking system (correct +1, wrong −1/3, unanswered 0), store full attempt (questions + user answers) in `sessionStorage`, navigate to result page.

### `src/routes/mcq-result.$testId.tsx` — Result + Review
- Reads attempt from `sessionStorage`.
- Top: total score (e.g. `12.33 / 20`), counts of correct/incorrect/unanswered, time taken.
- "Review answers" section: every question with user's choice vs correct answer (color coded), hint, image, and explanation sections (if any).

## 6. Marking
```
score = correct_count * 1 - incorrect_count * (1/3) + unanswered_count * 0
```
Displayed rounded to 2 decimals.

## 7. Out of scope (this step)
- Per-user attempt history persistence (results are session-only for now).
- Question shuffling, randomized option order, multi-answer questions.

## Technical notes
- All admin writes go through server fns with `requireSupabaseAuth` + admin check; never client-direct.
- Image upload: client → `supabase.storage.from('mcq-images').upload(...)` (admin-only via storage RLS) → pass public URL to `setQuestionImage`.
- Excel parsing reuses `xlsx` lib already in admin route; extract a shared `parseMcqWorkbook` helper.
- No changes to flashcards logic, session-store, summary, or practice routes.
