## Show prior ratings in review mode without breaking the "must rate to advance" guard

In review mode (opened from the summary "Review" button) the user wants to see the colored border from their previous session's rating on each card AND still be able to change the rating. The previously-added rule that the right arrow only appears once the user has rated the current card in THIS session must still hold.

### Changes — `src/routes/practice.$deckId.tsx`

1. **Add a parallel `priorRatings` array** (review mode only):
   - `const [priorRatings] = useState<(Rating | null)[]>(() => review ? cards.map(c => loadReview(deckId)[c.id] ?? null) : cards.map(() => null));`
   - This holds the saved rating from the previous session, purely for display.

2. **Keep `cardRatings` initialized to all nulls** (current behavior). This continues to drive the advance guard, so in review mode the right arrow stays hidden until the user picks a rating again.

3. **Update `borderClass`** to fall back to the prior rating:
   - `const displayRating = currentRating ?? priorRatings[index];`
   - Compute `borderClass` from `displayRating` instead of `currentRating`. Result: cards show their previous color from the moment review starts; once the user picks a new rating in this session it overrides the color.

4. **Auto-flip on revisit**: change the existing `useEffect` to flip when `cardRatings[index]` is set in this session OR when `priorRatings[index]` exists (review mode). So review cards open on the answer face, matching the colored-border experience.

5. **Footer / rating buttons**: unchanged. Buttons still appear on the back face whenever `currentRating` is null OR set — wait, current code shows them only when `flipped && currentRating === null`. Change to show them whenever `flipped` (drop the `currentRating !== null` "Already rated" branch entirely). This lets the user change a rating they just set in this session too, which is consistent with the review goal.

6. **Progress bar at top**: it reads from `cardRatings` only. Leave as-is — it should reflect this session's progress, not the prior one.

### Out of scope
- No change to `saveReview`/`loadReview` storage shape.
- No change to summary page, schema, or non-review fresh-practice flow (fresh practice has no `priorRatings`, so nothing visible changes there).
- Right-arrow visibility logic still keys off `currentRating !== null` — guard preserved.
