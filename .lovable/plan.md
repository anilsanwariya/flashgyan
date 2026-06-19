## Goal

Restyle Flashgyan to match the reference: soft lavender/cream background, large serif display headlines, and pastel gradient feature cards with circular icon badges and a right arrow.

## Theme tokens (`src/styles.css`)

- Background: soft lavender-tinted off-white (`oklch(0.97 0.012 290)`).
- Foreground: deep navy near-black for high-contrast headings.
- Card: pure white with very soft shadow + larger radius (`--radius: 1.25rem`).
- Add serif display font for headings via `<link>` in `__root.tsx` (Fraunces or Instrument Serif) and keep Inter for body. Add `--font-serif` token; apply to `h1`/`.display`.
- Add 4 pastel gradient tokens:
  - `--grad-pink`: pink → rose
  - `--grad-lavender`: lilac → periwinkle
  - `--grad-peach`: peach → blush
  - `--grad-mint`: mint → sky
- Add `--shadow-soft` (low, diffuse) for cards.

## Home page (`src/routes/index.tsx`)

- Header: big serif H1 ("Pick a feature.") with a short body subtitle, matching reference scale (text-5xl serif, tight tracking).
- Feature cards (Flashcards / MCQ Tests) and deck/test list items restyled to:
  - rounded-3xl, full-width pastel gradient background (rotating through the 4 gradients), soft shadow, no border.
  - Left: white circular icon badge (h-12 w-12) with the existing lucide icon in dark navy.
  - Middle: bold title + small muted subtitle.
  - Right: simple arrow-right icon.
- Cycle gradients deterministically by index so lists look like the reference.

## Other surfaces

- Practice and MCQ routes: pick up new tokens automatically (background, serif H1, rounded cards). Replace any hard `border` look on the flashcard container with the new soft-shadow white card + larger radius. No logic changes.
- Admin page: inherits tokens; no structural change.

## Out of scope

- No changes to data, auth, server functions, or the tap-to-reveal fix (still pending separately).
- No new routes or copy changes beyond what's needed for the visual match.

## Files touched

- `src/styles.css` — tokens, gradients, serif font, radius, shadow.
- `src/routes/__root.tsx` — `<link>` for serif font.
- `src/routes/index.tsx` — header typography + card styling + gradient cycling.
- `src/routes/practice.$deckId.tsx` and `src/routes/mcq.$testId.tsx` — small className tweaks so headings use serif and cards use new radius/shadow.
