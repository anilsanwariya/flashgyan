## Goal

1. Pin the question palette just above the footer; only the question card scrolls.
2. Lay palette numbers left-to-right (1,2,3…10 across top row; 11,12…20 across bottom row), not top-to-bottom.

## Changes (single file: `src/routes/mcq.$testId.tsx`)

### 1. Lock the layout so only the card scrolls
- Root wrapper: `min-h-dvh` → `h-dvh overflow-hidden`.
- Add `shrink-0` to `<header>` and `<footer>`.
- `<main>` stays `flex-1 min-h-0 flex flex-col`.
- Question card stays `flex-1 min-h-0 flex flex-col` with inner `overflow-y-auto` (absorbs leftover space, scrolls internally).
- Palette wrapper stays `shrink-0 mt-3` (always visible just above footer).

### 2. Palette: left-to-right numbering, paginated by 20
Replace the current single `grid-rows-2 grid-flow-col` grid with a horizontally-scrolling **flex row of pages**, where each page is a 2×10 row-flow grid:

- Outer scroll container: `flex-1 overflow-x-auto scroll-smooth snap-x snap-mandatory no-scrollbar`.
- Inside it: `flex` with one child per page of 20 questions.
- Each page child: `w-full shrink-0 snap-start grid grid-cols-10 grid-rows-2 gap-1` so numbers fill **row 1 left-to-right (1–10), then row 2 left-to-right (11–20)**. Next page continues 21–30 / 31–40, etc.
- Tile classes (`h-7`, colors for current/answered/unanswered) unchanged.
- Chevron buttons: `scrollBy({ left: ±el.clientWidth })` already pages by one full 20-tile screen — keep as-is; edge-disable logic unchanged.

### Result
- Header fixed top, footer fixed bottom, palette fixed just above footer, question card fills the middle and scrolls internally.
- Palette reads naturally left-to-right across two rows, with horizontal paging in groups of 20.

No logic, data, or other files change.
