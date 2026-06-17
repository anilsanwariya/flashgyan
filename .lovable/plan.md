## Goal

In `src/routes/practice.$deckId.tsx`, replace the top-left "Exit" link with an "End Session" button that opens a confirmation dialog. Ending early preserves unrated cards as unrated so the next Review run shows them after hard and medium.

## Behavior

- Top-left control: text changes from "Exit" to "End Session" (icon kept).
- Clicking it opens an AlertDialog:
  - **Continue** (green) — closes dialog, session continues untouched.
  - **End session** (red) — ends now, goes to Summary.
- Ending early:
  - Cards rated in this session are saved with their rating (hard/medium/easy).
  - Cards NOT rated this session stay unrated: they are not added to the deck's review state, and existing entries (e.g. prior-session ratings) are left untouched.
  - Summary counts (`hard`/`medium`/`easy`/`total`) reflect only cards rated this session, so percentages are meaningful.
- Next Review run from Summary already does the right thing via the existing `applyReviewOrder`: easy → filtered out, hard (priority 0) → medium (1) → unrated (1.5). No changes needed in `summary.tsx` or `session-store.ts`.

## Changes (single file: `src/routes/practice.$deckId.tsx`)

1. Add imports from `@/components/ui/alert-dialog`: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogCancel`, `AlertDialogAction`.
2. Generalize `submit()` to handle partial completion:
   - Accept the current `cardRatings` as-is (some entries may be `null`).
   - Build `results` from cards whose entry is non-null only.
   - Compute `counts` and `total` from those rated cards.
   - When writing the review state, only `state[id] = rating` for rated cards — never overwrite or insert nulls.
   - Navigate to `/summary` with `total = rated.length`, plus the per-rating counts.
   - The existing natural completion path (last card rated) still goes through this same function and behaves identically because all entries are non-null at that point.
3. Replace the header `<Link to="/">… Exit</Link>` with an `AlertDialog`:
   - `AlertDialogTrigger asChild` wrapping a `<button>` with `ArrowLeft` icon + "End Session", same classes as the previous link.
   - Title: "End this session?"
   - Description: "You can keep going, or end now and see your summary. Unrated cards stay unrated."
   - `AlertDialogCancel` labeled "Continue" with `className="bg-success text-success-foreground hover:bg-success/90 border-0"`.
   - `AlertDialogAction` labeled "End session" with `className="bg-destructive text-destructive-foreground hover:bg-destructive/90"` and `onClick={() => submit(cardRatings)}`.
4. No other files change.
