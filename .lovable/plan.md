## Changes to `src/routes/mcq.$testId.tsx`

Layout-only tweaks to the test page. No logic, schema, or other files change.

### 1. Restructure main layout
- Make `<main>` a flex column that fills available height between header and footer (`flex-1 flex flex-col`).
- The question card becomes the flex-grow child so it expands to use all remaining space.
- The palette becomes a fixed-height block at the bottom of `<main>`, directly above the sticky footer (no `sticky` needed — it's already at the bottom because the card above flex-grows).

### 2. Question card — larger, still scrollable
- Remove the hard `max-h-[calc(100dvh-22rem)]` cap.
- Card wrapper: `flex-1 min-h-0 flex flex-col` so it stretches.
- Inner scroll region: `flex-1 overflow-y-auto` (fills the card; scrolls when content overflows).
- Outer rounded border + padding unchanged.

### 3. Question palette — shorter, anchored just above footer
- Reduce vertical footprint:
  - Tiles: `h-7` (down from `h-8`); arrow buttons: `h-7 w-7`.
  - Heading: `mb-1` (down from `mb-2`), `text-[11px]`.
  - Grid gap: `gap-1` (down from `gap-1.5`); recompute `gridAutoColumns` accordingly: `calc((100% - (9 * 0.25rem)) / 10)`.
- Wrapper gets `shrink-0` + small top margin (`mt-3`) so it sits tight above the footer while the card above takes the rest.

### Technical notes
- Page root stays `min-h-dvh flex flex-col`; `<main>` adds `flex-1 min-h-0` so its children can flex without overflowing the viewport.
- All existing behavior preserved: timer, auto-submit, EndTestDialog, SubmitDialog, palette horizontal scroll with chevrons + edge-disable, sessionStorage hand-off.
