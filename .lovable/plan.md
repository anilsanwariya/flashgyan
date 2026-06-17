## Goal

Make the flashcard admin work like the MCQ admin: explicit decks (with name/description/subject/topic/order), then per-card management inside a deck including optional images that render under the question on both sides of the practice card (2:1 ratio).

## 1. Database

New migration:

- `flashcard_decks` table — `id`, `name`, `description` (default ''), `subject`, `topic`, `order_index`, `created_at`, `updated_at`.
- Add to `flashcards`: `deck_id uuid NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE`, `image_url text NULL`.
- Data migration: for every distinct `(subject, topic)` in existing `flashcards`, insert one deck (name = topic, order_index = 0), then backfill `flashcards.deck_id`. Drop nothing else — keep `subject`/`topic` columns for compatibility.
- RLS + GRANTs: public SELECT for both tables; admin-only INSERT/UPDATE/DELETE via `has_role(auth.uid(),'admin')` (mirrors `mcq_tests` / `mcq_questions`).
- `updated_at` triggers using existing `set_updated_at()`.
- Reuse existing storage bucket pattern: create new private bucket `flashcard-images` with admin-only write policy and a signed-URL read flow (same as `mcq-images`).

## 2. Server functions (`src/lib/flashcards.functions.ts`)

Replace deck-by-grouping logic with deck CRUD, mirroring `mcq.functions.ts`:

- Public: `listDecks()` → returns `{id, name, description, subject, topic, order_index, card_count}[]`. `getDeck({id})` → `{deck, cards}` with cards ordered by `order_index`. `getDeckCards({deckId})` (kept for practice page).
- Subjects/topics helper: `listSubjects()` and `listTopics({subject})` for cascading filters (distinct values from `flashcard_decks`).
- Admin-only (`requireSupabaseAuth` + `has_role` check, `supabaseAdmin` loaded inside handler):
  - `createDeck`, `updateDeck`, `deleteDeck({id})`.
  - `createCard({deck_id, ...})`, `updateCard`, `deleteCard`.
  - `bulkImportCards({deck_id, rows, mode})` — Excel rows now scoped to a single deck (drop subject/topic columns from the sheet; derive from the deck).
  - `setCardImage({id, image_url})`, `signFlashcardImage({path})` — same shape as MCQ.

## 3. Admin UI (`src/routes/_authenticated/admin.tsx`)

Rewrite `FlashcardsPanel` to mirror `McqPanel`:

- Decks list at top:
  - "Add deck" button → dialog with Name, Short description, Subject, Topic, Order (same shape as `TestFormDialog`).
  - **Filters above the list**: two `Select` dropdowns — Subject (all distinct subjects), then Topic (distinct topics for the chosen subject; "All" option). Cascading: changing subject resets topic.
  - Each deck row shows name, `subject · topic`, order, card count; actions: open, edit, delete.
- Deck detail view (analogue of `McqQuestionsView`):
  - Header with deck name/description, back to decks.
  - Excel bulk upload section (mode append/replace, scoped to this deck; sheet columns: `order, prompt, question, answer, explanation_<title>…`).
  - "Add card" button → manual create dialog.
  - Cards list — each row shows order, question, image thumbnail (if any), answer preview; edit + delete buttons.
  - Edit dialog (analogue of `QuestionEditDialog`): order, prompt, question, image upload/replace/remove (uses `flashcard-images` bucket + `signFlashcardImage`), answer, explanation sections add/remove.

## 4. Practice page (`src/routes/practice.$deckId.tsx`) + index

- Switch routing from base64 `subject|||topic` deck id to the real `deck_id`. Update `src/routes/index.tsx` deck list links to use `deck.id`. Drop `decodeDeckId`.
- `cardsQO` keyed by `deck_id`; loader calls `getDeckCards({deckId})`.
- Render image on **both front and back**, under the question, at fixed 2:1 aspect ratio (Tailwind `aspect-[2/1] w-full rounded-xl object-cover` inside an `AspectRatio` wrapper). When `card.image_url` is present, place it between the question text and the "Tap to reveal" hint on the front, and between question and Answer divider on the back. Layout uses existing flex column — image is a non-shrinking block, so the question text simply sits above it.
- Image src: signed URL is produced server-side once when fetching cards (extend `getDeckCards` to sign image_urls before returning, mirroring how MCQ result/admin already handles signing).

## 5. Types

After migration runs, regenerated `src/integrations/supabase/types.ts` will include `flashcard_decks` and the new columns; update imports in server fns and admin/practice components to match.

## Out of scope

- No change to session-store, summary, or review state shape beyond swapping `deckId` semantics (existing localStorage entries keyed by the old base64 id will be orphaned — acceptable trade-off, will not crash).
