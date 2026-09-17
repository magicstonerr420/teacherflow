# Beta export and password recovery repairs

## Changes

- Password recovery validates both fields, shows progress and provider errors beside Save password, bounds the wait, and opens `/builder` after a successful update. Owner access still uses the verified server-configured Supabase user ID; teacher quotas are unchanged.
- Worksheet and full-lesson print buttons open the generated PDF. The document contains no browser date, title, URL or app navigation. Student worksheets and teacher answers have separate page boundaries. Worksheet-only previews remain available.
- PowerPoint XML repair removes repeated paragraph properties introduced by highlighted text. Individual downloads and ZIP packages use the same repair. Export without AI illustrations is available after image failures for every age band; required young-learner picture safeguards remain.
- Version B generation checks for copied questions, including reordered items/choices. Existing duplicate worksheets have a Repair Version B action that updates B and its answers, preserves the displayed A, and uses no extra lesson slot. Beta repair is bounded to two attempts and reuses successful repairs.
- Version B and Answer Key no longer appear as duplicate sidebar entries. Both remain inside Worksheet.

## Verification

- 42 automated assertions/tests passed across beta quota/persistence, owner identity, hosting auth configuration, image transport, OpenRouter errors, young-learner rules, duplicate worksheet detection and PowerPoint XML repair.
- Browser checks passed: password validation, visible server rejection, timeout recovery, successful redirect and owner workspace (mocked authentication); signup/email-link flow and retained invitation across tabs (mocked email delivery).
- Browser export checks passed: actual PDF preview, A/B answer-key tabs, duplicate sidebar removal, isolated B repair with A preserved, export after image retry-limit errors, and identical PPTX bytes inside the ZIP.
- Young-learner regression passed: ten picture cues, hidden student answers/teacher notes, 17-slide presentation with front/back cards, other age exports, successful-image caching, partial failure export, and reset of stale downloads after edits.
- Three corrected decks, including illustrated and ZIP-contained decks, passed Microsoft Open XML SDK 3.3.0 Office2016 validation with zero errors. Before repair, the highlighted-text fixture produced seven schema errors.
- Full PDF rendered and visually inspected. The authored 50-question sample contains 12 pages including both student versions, both keys and teacher material; no blank pages or browser headers. This is a test fixture, not the teacher's original 34-page document.
- TypeScript, production build and production HTTP home/builder/auth smoke test passed.

## Limits

- Actual owner password-save/login completion still requires the owner's private browser session. No password was requested or inspected. The owner confirmed both real sign-in and recovery emails arrived; the initial intermittent email-delivery cause is unconfirmed.
- AI responses/images were mocked for regression tests. The earlier local OpenRouter live request returned 402. The hosted key's balance and the original cause of the teacher's failed images were not independently verified. Exhausted image retries are not automatically reset; export without AI images works without further provider calls.
- Native Microsoft PowerPoint/WPS visual opening was unavailable. Microsoft SDK schema validation and generated slide geometry were checked instead.
- Existing saved content is not silently replaced. Teachers use Repair Version B on affected worksheets and download new files. Previously downloaded damaged PPTX files must be replaced.
- Model providers, pricing configuration and paused Reading/listening scope are unchanged.

## Run checks

Run the `tests/*.test.mjs` files listed above with Node 24; run browser checks against the local Vite app. `tests/validate-powerpoint.ps1` expects the official `DocumentFormat.OpenXml` and `DocumentFormat.OpenXml.Framework` NuGet 3.3.0 packages extracted under `.local-runtime/openxml-sdk/<lowercase-package-name>/`, with their `lib/net8.0` assemblies. SDK binaries and private configuration are not committed.
