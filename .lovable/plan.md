# Reorganize homepage into feature sections

Goal: keep all existing flashcard logic untouched, but visually group it under a "Flashcards" card/section on the homepage so a second "Multiple Choice Questions" feature can sit beside it later.

## Approach

Refactor only `src/routes/index.tsx`. No route changes, no changes to `practice.$deckId.tsx`, `summary.tsx`, `session-store.ts`, or any data/server functions.

Two-level homepage:

1. **Feature picker (default view)** — shows feature cards:
   - `Flashcards` card (active) — clicking it opens the flashcards view.
   - `Multiple Choice Questions` card (placeholder, marked "Coming soon", disabled).
2. **Flashcards view** — the current homepage content (subject/topic filters + deck list) rendered inside the Flashcards section, with a small "← Back" control to return to the feature picker.

State handled with a single local `useState<"home" | "flashcards">("home")` in the `Home` component. No URL changes (keeps existing links and SEO intact). Header title/subtitle swap based on view; admin footer stays.

## Technical details

- Extract current filter + deck list JSX into a `FlashcardsSection` subcomponent inside `index.tsx`, receiving the existing `decks` data and `onBack` callback. All hooks (`useMemo` for subjects/topics/filtered, `useState` for subject/topic) move into it unchanged.
- Top-level `Home` renders either the feature grid or `<FlashcardsSection />`.
- Feature grid: 1-column on mobile, 2-column on `sm+`, using existing `rounded-2xl bg-card border` styling for visual consistency with `DeckCard`.
- MCQ card: same shape, dimmed (`opacity-60 cursor-not-allowed`), badge "Coming soon", no onClick.
- No new files, no new deps, no logic changes anywhere else.
