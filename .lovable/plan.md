## Goal

In `src/routes/practice.$deckId.tsx`, make the rating flow behave identically in fresh practice and review mode, with one visual difference: review mode shows prior-session border colors on unrated cards.

## Behavior

1. **Rating flow (both modes)**: User must rate a card to advance. The next-arrow guard already enforces this — keep as-is.

2. **Lock already-rated cards in this session**: When navigating back to a card the user rated earlier in the current session, the rating buttons become non-interactive (locked). User can still flip the card and use the next arrow. This applies in both fresh and review modes.
   - A card is "locked" when `cardRatings[index] !== null` AND the user navigated to it (i.e. it's not the freshly-revealed current card needing input).
   - Simplest rule: lock whenever `cardRatings[index] !== null`. Since rating auto-advances, you only see a non-null rating when you went back.

3. **Review mode borders**: Keep `priorRatings` border tint on cards not yet rated this session. Once rated this session, `currentRating` takes over (already the case via `displayRating = currentRating ?? priorRatings[index]`).

4. **Auto-flip on revisit**: Keep current behavior — `setFlipped(cardRatings[index] !== null)` flips to the answer side when revisiting a session-rated card (so the locked buttons make sense in context). Review-mode prior-only cards still open on the front.

## Changes

Replace the footer block (lines ~298-312):

```tsx
{flipped ? (
  <div className="grid grid-cols-3 gap-2">
    {currentRating !== null ? (
      <>
        <RatingButton label="Hard" tone="destructive" disabled active={currentRating === "hard"} />
        <RatingButton label="Medium" tone="warning" disabled active={currentRating === "medium"} />
        <RatingButton label="Easy" tone="success" disabled active={currentRating === "easy"} />
      </>
    ) : (
      <>
        <RatingButton label="Hard" tone="destructive" onClick={() => rate("hard")} />
        <RatingButton label="Medium" tone="warning" onClick={() => rate("medium")} />
        <RatingButton label="Easy" tone="success" onClick={() => rate("easy")} />
      </>
    )}
  </div>
) : ( /* Reveal answer button unchanged */ )}
```

Update `RatingButton` to accept optional `disabled` and `active` props: when `disabled`, render as a non-clickable button with `opacity-50 cursor-not-allowed`, and when `active` keep full opacity so the user sees which rating they previously gave.

No other files change. No logic changes to `rate()`, `priorRatings`, `displayRating`, or the next-arrow guard.
