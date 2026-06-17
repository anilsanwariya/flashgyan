## Changes to `src/routes/mcq.$testId.tsx`

Only the test-taking page changes — no schema, parser, results, or admin changes.

### 1. Question card — fixed size, scrollable
- Wrap the question card content (question text, optional image, optional hint, options, "Not answered") in a fixed-height container that scrolls internally when content overflows.
- Use `max-h-[calc(100dvh-<header+footer+palette>)]` with `overflow-y-auto` so the card itself stays the same size regardless of question length; long questions/images scroll inside it.
- The card outer wrapper keeps its rounded border + padding; the inner scroll region holds the content.

### 2. Palette heading — show count inline
- Replace the standalone "Questions" label with `Questions (10/20)` where the number reflects `answeredCount / total`.
- Remove the separate footer "10/20 answered" text (moved into this heading).

### 3. Submit button — centered in footer
- Footer layout becomes: `Prev` (left) · `Submit` (center) · `Next` (right).
- Submit is visible on every question (not only the last one). Confirmation dialog stays the same.
- Remove the now-redundant answered-count text from the footer.

### 4. Question palette — fixed 2 rows × 10, horizontal scroll with arrows
- Render the palette as a horizontal strip: `grid-rows-2 grid-flow-col auto-cols-[2rem]` so it always shows 2 rows; 20 tiles fit per viewport-width chunk.
- Wrap the strip in a container with `overflow-x-auto` and `scroll-smooth`.
- Add left/right chevron buttons (lucide `ChevronLeft`/`ChevronRight`) flanking the strip; clicking scrolls the strip by ~one page (≈ 20 tiles worth, i.e. container `clientWidth`).
- Arrows are always rendered but disabled when at the respective scroll edge (track via `onScroll` + `scrollLeft` / `scrollWidth`).
- Tile styling (current / answered / unanswered) is unchanged.

### Technical notes
- Use a `useRef<HTMLDivElement>` on the palette scroll container; `scrollBy({ left: ±el.clientWidth, behavior: 'smooth' })` for the arrow handlers.
- Compute card max-height with CSS only (no JS measuring): `max-h-[calc(100dvh-16rem)]` tuned so header (~56px), footer (~56px), palette block (~88px), and page padding fit; minor tweaks during implementation if needed.
- Keep all existing behavior: timer, auto-submit on 0, EndTestDialog, SubmitDialog, sessionStorage hand-off to results.
