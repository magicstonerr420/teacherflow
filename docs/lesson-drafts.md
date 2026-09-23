# Automatic lesson drafts

Signed-in teachers' class inputs are saved on the current device while they fill in the builder. Starting generation first creates an authenticated server draft. If draft creation fails, no paid generation starts.

Draft requests are immutable. Each completed generation step is retained before its response is sent. My lessons → Unfinished restores the original settings and server-owned completed parts. Changing the settings starts a different lesson; continuing the same draft keeps its original beta request fingerprint and allowance slot.

Closing a tab stops the browser from starting later steps. The current server request may still finish and retain its result. Reopening polls existing work, without starting another paid request. After interruption or server restart, an outstanding lease can require waiting before an explicit retry is available. Provider charge uncertainty and existing beta retry/budget limits still apply.

Completed lessons are saved automatically to the existing lesson library. A failed library save leaves the full completed draft recoverable. Each draft has a stable destination ID; retries and simultaneous save requests cannot create duplicate copies or overwrite later teacher edits. Reopening a saved draft routes to its current library lesson.

## Storage and access

- Server checkpoints use `tf_lesson_drafts` in the existing `TEACHERFLOW_BETA_DB` SQLite file, so existing persistent-disk backups include them.
- Every read/write is scoped to the authenticated teacher. Read access to one's own drafts remains available when generation allowance is exhausted or beta access is removed; generation continues to enforce access and spending limits.
- Unfinished older beta runs can be imported from their existing server checkpoints without changing their exact request fingerprints or consuming a new slot.
- No credentials or generated lesson content are placed in the browser's settings cache.

## Verification

Run the draft and settings unit tests with `node --experimental-transform-types --test tests/lesson-drafts.test.mjs tests/builder-settings.test.mjs`.

After a production build, run `node tests/drafts-runtime-browser.cjs`. The harness uses real compiled routes, auth middleware, RPC serialization, and isolated persistent SQLite databases. Only upstream Supabase and AI responses are simulated; external network access is denied. It checks tab closure, server restart, fresh-browser recovery, allowance preservation, save outages, duplicate-save prevention, and account isolation without paid AI requests.
