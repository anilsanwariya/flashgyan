<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the homepage flashcard demo read-only and source its randomized cards through a public server function, because demo ratings must never alter study history.
- Public catalog reads require the parent's is_public flag, and question reads require a matching public parent; keep separate admin reads so unpublished content stays manageable.
- Keep study image buckets private with admin-only direct reads; students and the homepage demo receive signed image URLs through existing server flows.
- Restrict direct SAATHI source reads to admins through the protected role check; preserve student questions and citations through the existing server-side search flow.
- Store homepage feature visibility independently from feature locks in home_settings; hiding changes homepage discovery only and preserves existing access behavior.
- Reuse AppDownloadPopup with optional copy and continuation props for the homepage demo; preserve existing feature defaults so their completion flows stay unchanged.
- Keep Telegram repaint workarounds free of transforms on html/body; transformed portal ancestors break viewport positioning for fixed dialogs.
- Route every Play Store link through src/lib/app-promo.ts (playStoreUrl/openPlayStore) so installs keep their referrer tags and open correctly inside Telegram; gate download popups with shouldShowAppPrompt so they appear at most once a day.
- Run Telegram Mains answers as bounded EdgeRuntime.waitUntil jobs after an immediate acknowledgment; suppress aborted-job delivery so slow AI calls cannot hold the webhook open or send late duplicate replies.
