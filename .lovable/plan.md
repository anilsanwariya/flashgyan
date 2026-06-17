## Change

Treat the `hint` field as a continuation of the question body (for long/multi-part questions), not a collapsible hint.

### Test-taking page (`src/routes/mcq.$testId.tsx`)
- Remove the `<details>/<summary>` "Hint" block.
- If `q.hint` exists, render it directly below `q.question` as a `<p>` with the **same classes** as the question (`text-base font-medium leading-relaxed`). No "Hint:" label.

### Result review page (`src/routes/mcq-result.$testId.tsx`)
- Remove the muted "Hint: ..." line.
- If `q.hint` exists, render it directly below the question text using the same classes as the question (`text-sm font-medium leading-relaxed`), with no label. Keep the `Q#` number only against the first line (question).

No schema, parser, or admin changes — the field already stores free text.