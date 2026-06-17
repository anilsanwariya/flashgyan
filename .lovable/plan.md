## Review mode opens on card front

In `src/routes/practice.$deckId.tsx`, change the auto-flip effect so review-mode cards no longer auto-flip to the answer on navigate. Only flip when the user has rated the card in THIS session.

Change line ~128:
```ts
setFlipped(cardRatings[index] !== null || priorRatings[index] !== null);
```
to:
```ts
setFlipped(cardRatings[index] !== null);
```

Nothing else changes: prior-rating border colors, the rating buttons, and the next-arrow guard all stay as-is.
