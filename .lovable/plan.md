## Goal

Switch flashcards to support multiple explanation sections (with custom titles), reorder the back of the card as a scrollable stack, and update the Excel import to a new, extensible column layout.

## New Excel format

First-row headers (order matters only for the fixed columns; explanation pairs can repeat):

```
subject | topic | order | prompt | back | explanation_<title1> | explanation_<title2> | ...
```

- `subject`, `topic` — unchanged, still required.
- `order` — integer; controls card display order within a (subject, topic) deck.
- `prompt` — single front text (replaces both old `front_prompt` and `front_question`).
- `back` — main answer shown first on the back of the card.
- `explanation_<X>` — any number of columns. The text after `_` becomes the section title (snake_case → Title Case, e.g. `explanation_definition` → "Definition", `explanation_example_usage` → "Example Usage"). Empty cells are skipped. Sections appear in the column order they were in the sheet.

Importer behavior:
- Detect every header starting with `explanation_`; preserve their left-to-right order.
- Validate required cells: subject, topic, order, prompt, back.
- Build a `sections` JSON array `[{ title, body }]` per card from the non-empty explanation columns.
- "Replace all" remains supported; "append" still appends.

## Database changes (single migration)

Wipe and recreate the `flashcards` table with the new schema:

- `id uuid pk`
- `subject text not null`
- `topic text not null`
- `order_index int not null default 0`
- `prompt text not null`
- `back text not null`
- `sections jsonb not null default '[]'::jsonb` — array of `{ title: string, body: string }`
- `created_at timestamptz default now()`

Keep current RLS: public SELECT to anon/authenticated; writes only via service role (admin import). Re-apply existing GRANTs.

Index: `(subject, topic, order_index)` for ordered deck fetch.

## Card UI (back face)

`src/routes/practice.$deckId.tsx`:

- Front face shows `prompt` (replaces the prompt-label + question split).
- Back face becomes a vertical scrollable column inside the fixed-height card:
  1. Small `prompt` recap at top (unchanged behavior from last turn).
  2. "Answer" label + `back` text.
  3. For each section in `sections`: a heading with the section title and the body below it.
- The card container keeps its fixed size and rounded border; only the inner content area scrolls (`overflow-y-auto`, momentum scroll on touch). Border-color rating behavior is unchanged.
- Swipe gestures: scrolling inside the back must not trigger horizontal swipe-to-next. Constrain drag to the card frame (not the inner scroll area) so vertical scrolling stays smooth.

Deck fetch and practice order:
- `getDeckCards` orders by `order_index asc, created_at asc`.
- Practice walks cards in that order on first run; spaced-repetition re-runs from Summary still group by rating (hard → medium) and within each rating preserve `order_index`.

## Admin importer

`src/routes/_authenticated/admin.tsx` + `src/lib/flashcards.functions.ts`:

- Update REQUIRED columns list to: subject, topic, order, prompt, back. Plus at least one `explanation_*` column is allowed but not required.
- Parsing:
  - Collect all keys starting with `explanation_` (case-insensitive, in column order).
  - For each row, build `sections` from non-empty explanation cells, deriving titles from the suffix.
  - Coerce `order` to int; reject rows where it isn't a positive integer.
- Preview table shows: Subject, Topic, Order, Prompt, #Sections.
- Zod validator updated for new shape; `sections` validated as array of `{ title, body }`.

## Types & call sites

- Update `Flashcard` type in `flashcards.functions.ts` to the new shape.
- Update `session-store.ts` and `summary.tsx` only where they reference `front_question` / `back_answer` / `back_explanation` — switch to `prompt` / `back` / `sections`.
- Regenerate Supabase types after migration approval.

## Out of scope

- No change to rating UI, progress bar coloring, swipe-to-rate behavior, or summary grouping logic beyond field renames.
- No data migration of existing cards — table is wiped per your choice; admin re-uploads with the new sheet.
