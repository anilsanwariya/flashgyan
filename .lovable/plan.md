## Rebrand to "Flashgyan web" with uploaded logo

### 1. Upload the icon as a Lovable Asset
- Run `lovable-assets create --file /mnt/user-uploads/icon.png --filename flashgyan-logo.png > src/assets/flashgyan-logo.png.asset.json`.
- Use the resulting `.asset.json` pointer everywhere a logo or favicon is needed.

### 2. Replace text "Flashly" → "Flashgyan web" everywhere
Files and exact replacements:
- `src/routes/__root.tsx` line 81/83: titles & og:title → `"Flashgyan web — Focused Flashcard Practice"`.
- `src/routes/index.tsx` line 23: `"Flashgyan web — Pick a deck"`.
- `src/routes/index.tsx` line 67: header text → `"Flashgyan web"`.
- `src/routes/summary.tsx` line 24: `"Session summary — Flashgyan web"`.
- `src/routes/auth.tsx` line 12: `"Admin sign in — Flashgyan web"`.
- `src/routes/_authenticated/admin.tsx` line 19: `"Admin — Flashgyan web"`.
- `src/lib/session-store.ts` — leave the `flashly:` sessionStorage key prefixes unchanged (internal keys; renaming would silently lose in-flight session data).

### 3. Use the logo
- `src/routes/__root.tsx`: import the asset pointer and add a favicon link entry `{ rel: "icon", type: "image/png", href: logo.url }` in the root `links` array.
- `src/routes/index.tsx` header: replace the `<Layers />` icon next to the brand text with an `<img src={logo.url} alt="Flashgyan web logo" className="h-5 w-5 rounded-sm" />`. Keep the same flex layout; drop the now-unused `Layers` import if no other usage remains in the file.

### Out of scope
- No DB, route, or auth changes. No other UI restyling. Storage key prefix stays as `flashly:` to preserve existing session/review state.
