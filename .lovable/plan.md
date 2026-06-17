## Goal

Split the front into separate `prompt` (small) and `question` (large) fields, rename `back` → `answer`, and update Excel import + card UI accordingly.

## New Excel format

Headers (first row):
```
subject | topic | order | prompt | question | answer | explanation_<title1> | explanation_<title2> | ...
```

- All six fixed columns required.
- `explanation_*` columns: any number, order preserved, title from suffix (snake_case → Title Case), empty cells skipped.

## Database (single migration)

Wipe and recreate `flashcards`:
- `id uuid pk`
- `subject text not null`
- `topic text not null`
- `order_index int not null default 0`
- `prompt text not null`
- `question text not null`
- `answer text not null`
- `sections jsonb not null default '[]'::jsonb`
- `created_at timestamptz default now()`

Re-apply existing RLS (public SELECT to anon/authenticated; writes via service role only) and GRANTs. Index `(subject, topic, order_index)`.

## Card UI (`src/routes/practice.$deckId.tsx`)

- **Front**: small `prompt` label on top, large `question` below (restores the old split layout).
- **Back** (scrollable inside fixed card frame):
  1. Small recap: `prompt` label + `question`
  2. "Answer" label + `answer` text
  3. Each `sections[i]`: title heading + body
- Border-color rating behavior, swipe gestures, and rate-before-next popup unchanged. Inner scroll area does not trigger horizontal swipe.

## Admin importer (`src/routes/_authenticated/admin.tsx`)

- REQUIRED = `subject, topic, order, prompt, question, answer`.
- Detect `explanation_*` columns in column order; build `sections: [{title, body}]` from non-empty cells.
- Coerce `order` to positive int; reject otherwise.
- Preview columns: Subject, Topic, Order, Prompt, Question, #Sections.
- Help text updated.

## Types & call sites

- `Flashcard` type in `flashcards.functions.ts`: add `question`, rename `back` → `answer`.
- `importRowSchema`: add `question`, rename `back` → `answer`.
- `getDeckCards` select: include `question`, `answer`.
- `SessionCardResult` in `session-store.ts`: add `question`, rename `back` → `answer`.
- `summary.tsx`: show `question` and `answer` where it currently shows `prompt`/`back`.
- `practice.$deckId.tsx`: results mapping uses `card.question` + `card.answer`.

## Out of scope

Rating UI, progress bar, swipe-to-rate, summary grouping logic — unchanged beyond field renames.
