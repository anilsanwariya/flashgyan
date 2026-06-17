## Changes to `src/routes/practice.$deckId.tsx`

### 1. Locked view for already-rated cards
When navigating back (or forward) to a card that already has a rating in `cardRatings[index]`:
- Force `flipped = true` so the back face (answer + explanations) is shown immediately.
- Hide the footer rating buttons AND the "Reveal answer" button. Replace footer with a small muted hint like "Already rated — Hard/Medium/Easy" (colored dot matching the rating) so the user knows why controls are gone.
- Update the `useEffect` that resets `flipped` on index change: if `cardRatings[index] !== null`, set `flipped = true`; otherwise `false` (current behavior).
- Result: ratings cannot be changed within the session once set.

### 2. Apply the "must rate to advance" guard in review mode
Currently review mode pre-populates `cardRatings` from `loadReview(deckId)`, which makes `currentRating !== null` for every card on entry, so the right-arrow appears immediately and the user can skip without re-rating.

Fix: in review mode, initialize `cardRatings` as all `null` (same as fresh practice). The prior ratings still drive card ordering via `applyReviewOrder` (already done before `useState`), but the in-session rating state starts empty. The existing guard in `goNext()` and the right-arrow visibility condition (`currentRating !== null && index < total - 1`) then naturally enforce "must rate before advancing" in review mode too.

This also means rule #1 (locked already-rated view) only triggers for cards the user has rated in THIS session — review sessions start fully unlocked, as expected.

### 3. Rename summary CTA
In `src/routes/summary.tsx` (line 209), change the button label from `"Review hard & medium"` to `"Review"`. Keep the conditional (still only shown when `hard + medium > 0`).

### Out of scope
- Right-arrow visibility logic, prev-arrow, flip animation, progress bar, schema, server functions — unchanged.
- No changes to how `saveReview` persists ratings across sessions.
