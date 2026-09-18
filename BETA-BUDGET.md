# Private beta budget and recordings

The owner approved a **US$10 total round allowance** on September 17, 2026. It covers new invited-teacher OpenRouter requests after this update: lesson text and repair calls, optional reading/listening scripts, illustrations, and recordings. Owner requests remain outside this allowance. This does not change the OpenRouter API key's account-wide limit or purchase credits.

## Enforcement

- A transaction in `budget.sqlite` reserves a conservative maximum before each paid request. Competing server processes share the same ledger. Successful text/image responses reconcile against `usage.cost`; TTS uses the verified per-character price of the pinned provider. Unknown charges keep their reservation, including after restart. Unknown models/configurations fail closed.
- Text requests have explicit token limits, provider price ceilings, and no automatic provider fallback. Image requests pin Google AI Studio, one 1K image, and verify current endpoint pricing; the reservation covers the model's documented 32,768-token maximum plus headroom. Speech requests verify the selected US voice provider's current character price. Conservative reservations can stop generation before exactly $10 is billed, especially for images or uncertain requests.
- Explicit rejected requests (400/401/402/403/404/422/429) release the reservation. Network interruptions, unconfirmed costs, and uncertain server errors retain it. An identical uncertain request cannot be sent again until an organizer reviews it. Unexpected charges above the reserved amount pause all new teacher generation.
- The existing lesson/image retry limits and cached results are retained. Speech never automatically falls back after a network interruption, incomplete download, or invalid recording. An explicit unavailable/rate-limit response can still use the economy fallback, with a separate reservation.
- One successful recording belongs to each beta lesson across every voice choice. Concurrent clicks, voice switches, cache version changes, and reopening cannot purchase another recording. Existing recordings are adopted. Attempts share one three-attempt ceiling, and the first selected voice stays fixed during recovery. Owners can still replace their recordings.
- Saved lessons, images, MP3 downloads, and playback controls do not call generation and remain usable when the budget is unavailable.

## Storage and operation

`TEACHERFLOW_BUDGET_DB` optionally overrides the file location. The default is `budget.sqlite` beside `TEACHERFLOW_BETA_DB`, which places it on Render's persistent `/var/data` disk. The US$10 ceiling is inserted only for a new ledger. Redeploys and allowance resets do not reset the spending round. Back up this database along with the beta, reading, and listening databases.

The authenticated owner sees the total, accounted costs, reservations, and available amount in the builder. Teachers see their one-recording allowance. Refresh to update the displayed budget. There is no public budget-reset or reservation-release endpoint. Investigate uncertain charges in OpenRouter before manually reconciling any held reservation; do not delete the ledger to recover a failed generation.

## Validation

`node --test tests/beta-budget.test.mjs tests/beta.test.mjs` covers real separate-process reservation races, restart persistence, owner separation, text/image/audio accounting, rejections and uncertain costs, unsupported models, one recording across voices, migration of existing recordings, retries, and the existing invitation/lesson/image controls. Provider requests are mocked.

`node tests/listening.test.mjs` checks audio caching, failures, and no fallback after uncertain delivery. `tests/reading-audio-browser.cjs` checks the teacher voice lock, preserved owner replacement, saved recordings, rewind, speed, download, and mobile layout. These checks use an existing MP3 and no paid AI generation.

Pricing/transport references:
- https://openrouter.ai/docs/guides/routing/provider-selection#max-price
- https://openrouter.ai/docs/guides/overview/multimodal/image-generation
- https://openrouter.ai/docs/guides/overview/multimodal/tts
- https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image
