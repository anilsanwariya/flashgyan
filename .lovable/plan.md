## Overview

A mobile-first flashcard study web app with four pages: Home, Practice, Summary, Admin. No user sign-up for studying. Admin panel is gated by Lovable Cloud email/password auth and lets an admin upload decks via Excel.

## Pages & flows

**Home (`/`)**
- Page title + short tagline.
- Two cascading filters: Subject → Topic (Topic options depend on selected Subject).
- Below filters: list of decks matching the filter, each showing deck name, subject/topic, and card count.
- Tap a deck → navigate to `/practice/$deckId`.
- Small "Admin" link in footer.

**Practice (`/practice/$deckId`)**
- Loads all cards in the deck, shuffled, served in one session (all cards, once each).
- Card UI:
  - Front side shows **Prompt** (smaller, muted, top) + **Question** (large, centered).
  - Tap card → 3D flip animation → Back shows **Answer** (large) + **Explanation** (smaller, below).
  - Below the card after flip: three rating buttons **Hard / Medium / Easy**.
- Tapping a rating records the result and advances to the next card.
- Progress indicator (e.g. "7 / 20") + thin progress bar at top.
- When all cards are done → navigate to `/summary` with session results in router state/search.

**Summary (`/summary`)**
- Shows: total cards, counts and % for Hard / Medium / Easy, time spent, deck name.
- Buttons: "Practice again" (same deck), "Back to decks" (home).
- If visited without a completed session → redirect to home.

**Admin (`/admin`, under `_authenticated`)**
- Email/password sign-in via Lovable Cloud (managed `/auth` page).
- Once signed in:
  - Upload Excel file (`.xlsx`).
  - Parse client-side with SheetJS, validate columns, show preview (first 10 rows + count + any row errors).
  - "Replace all" vs "Append" toggle.
  - Confirm → server function inserts cards.
  - Below: table of existing decks (subject/topic/card count) with a delete button per deck.

## Excel format

Required columns (header row, case-insensitive, trimmed):
- `Subject`
- `Topic`
- `Card front - prompt`
- `Card front - question`
- `Card back - answer`
- `Card back - explanation`

A "deck" is the unique pair (Subject, Topic). Rows with missing Subject/Topic/Question/Answer are flagged as invalid and skipped; Prompt and Explanation are optional.

## Data model (Lovable Cloud / Supabase)

Single table `flashcards`:
- `id uuid pk default gen_random_uuid()`
- `subject text not null`
- `topic text not null`
- `front_prompt text`
- `front_question text not null`
- `back_answer text not null`
- `back_explanation text`
- `created_at timestamptz default now()`
- index on `(subject, topic)`

RLS:
- `SELECT` policy `TO anon, authenticated` (public read — no PII).
- No public insert/update/delete. Writes happen via authenticated server functions; admin role checked via `user_roles` table + `has_role()`.

`user_roles` table + `app_role` enum (`admin`) per the standard pattern. First admin is seeded manually (instructed to user after signup).

Session results live only in client memory / router search state — no DB persistence (matches "no sign-up" + simple).

## Server functions (`createServerFn`)

Client-safe `.functions.ts` files under `src/lib/`:
- `listSubjects()` — public, distinct subjects.
- `listTopics({ subject })` — public, distinct topics for a subject.
- `listDecks({ subject?, topic? })` — public, grouped (subject, topic, count).
- `getDeckCards({ subject, topic })` — public, all cards for practice.
- `bulkImportCards({ rows, mode: 'append' | 'replace' })` — `requireSupabaseAuth` + admin role check.
- `deleteDeck({ subject, topic })` — `requireSupabaseAuth` + admin role check.

Public reads use the server publishable client (anon, RLS). Admin writes verify role via `has_role` RPC before mutating.

## Routes

```
src/routes/
  __root.tsx                       (shared shell, QueryClient, auth listener)
  index.tsx                        Home
  practice.$deckId.tsx             Practice (deckId = base64 of `subject|topic`)
  summary.tsx                      Summary (reads from search params)
  auth.tsx                         Lovable Cloud sign-in
  _authenticated/route.tsx         (integration-managed gate)
  _authenticated/admin.tsx         Admin panel
```

`deckId` encodes subject+topic so practice URLs are shareable.

## Design direction

Clean, distraction-free, mobile-first:
- Off-white background, soft neutral surfaces, single accent color for primary actions and progress.
- Generous type scale, plenty of whitespace, no decorative chrome during practice.
- Large tap targets (min 48px) for flip + rating buttons; bottom-anchored rating row for thumb reach.
- Smooth 3D flip animation (CSS `transform-style: preserve-3d` + `rotateY`).
- Subtle haptic-feel transitions between cards (fade + slight slide).
- Tailwind v4 tokens in `src/styles.css`; shadcn components for inputs/buttons/select/dialog/sonner.

## Dependencies to add

- `xlsx` (SheetJS) — parse Excel client-side in admin.
- `motion` (Motion for React) — card transitions.

## Build order

1. Enable Lovable Cloud.
2. Migration: `flashcards`, `app_role` enum, `user_roles`, `has_role` function, RLS + grants.
3. Add `xlsx` and `motion`.
4. Server functions in `src/lib/flashcards.functions.ts`.
5. Design tokens + base layout shell.
6. Home page (filters + deck list).
7. Practice page (flip card, ratings, progress).
8. Summary page.
9. Auth page + admin route under `_authenticated/`.
10. Admin: Excel upload, parse, preview, import, deck management.
11. Verify with preview on a mobile viewport.

## Open items handled with sensible defaults

- **First admin**: after the user signs up via `/auth`, I'll show them the SQL snippet (or run it on request) to grant the `admin` role to their `user_id`. No public self-serve admin promotion.
- **Session state across pages**: passed via TanStack Router search params (counts + deck id), not persisted.
- **No spaced repetition / scheduling** — ratings are recorded only for the session summary.
