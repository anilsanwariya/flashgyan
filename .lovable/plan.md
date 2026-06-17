## Goal
Fix the conflict between horizontal swipe-to-navigate and vertical scrolling on the back of the card by replacing gestures with on-card arrow buttons, and make the back-card scrollbar visible.

## Changes (all in `src/routes/practice.$deckId.tsx`)

### 1. Remove swipe gestures
- Drop `drag`, `dragConstraints`, `dragElastic`, `onDragEnd`, `handleDragEnd`, and the `touch-pan-y` class from the `motion.div` wrapping the card.
- Card scrolling on the back will now work natively without competing with horizontal drag.

### 2. Add semi-transparent side navigation buttons
- Wrap the card in a `relative` container.
- Add two absolutely-positioned circular icon buttons (`ChevronLeft`, `ChevronRight` from lucide) vertically centered, one on each side, overlapping the card edges slightly.
- Styling: `bg-background/60 backdrop-blur-sm border border-border rounded-full h-10 w-10`, hover `bg-background/80`. Positioned `left-2` / `right-2` with `top-1/2 -translate-y-1/2`, `z-10`.
- Clicking does NOT flip the card (stopPropagation).

### 3. Visibility rules
- **Left (prev) button**: hidden when `index === 0`.
- **Right (next) button**: hidden when `currentRating === null` OR when `index === total - 1` (last card has no "next" — user finishes by rating). This matches the existing rule that you must rate before advancing.
- Keep the existing `goPrev` / `goNext` handlers; remove the toast-on-unrated path since the button is simply hidden instead.

### 4. Visible scrollbar on back face
- Replace the back face's plain `overflow-y-auto` div with shadcn `ScrollArea` (`@/components/ui/scroll-area`, already in project) so a thin always-styled scrollbar shows during scroll.
- Alternative if ScrollArea conflicts with the 3D flip transform: keep native scroll but add Tailwind utilities to force a visible thin scrollbar (`scrollbar-thin`-style via inline `style` using `scrollbar-width: thin` and `scrollbar-color`, plus webkit pseudo-element CSS in `src/styles.css`). Prefer ScrollArea first; fall back only if the backface-hidden + rotate breaks it.

### 5. Cleanup
- Remove now-unused `PanInfo` import and `toast` import if no other call site uses them (verify before removing `toast`).

## Out of scope
- Rating buttons, flip animation, progress bar, review mode logic — unchanged.
- No schema or server changes.