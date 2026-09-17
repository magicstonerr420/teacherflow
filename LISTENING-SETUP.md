# Reading and listening

The owner authorized resuming reading and adding listening on September 17, 2026.

- Reading and listening scripts: `deepseek/deepseek-v4-flash-0731`, with reasoning disabled and structured output validation. A1 ages 5–7 listening drafts also receive one content review from the existing main lesson model to correct contradictions and unsupported questions, with at most one validation repair; the reviewed activity is cached. New listening lessons receive a script automatically. Other lessons can add an activity from Listening. Reading remains integrated with printable worksheets; a teacher reading aloud alone does not trigger a separate reading exercise.
- Standard recording: `x-ai/grok-voice-tts-1.0`, voice `eve`, with xAI provider options `speed: 0.7` and `language: en` for a measured classroom pace. The generic top-level speed option is ignored by this adapter; the provider option was verified with real audio.
- Economy recording and one transient-error fallback: `canopylabs/orpheus-3b-0.1-ft`, voice `tara`, pinned to DeepInfra. Billing and authentication errors never trigger paid fallback attempts.
- Local test voice: `deepgram/flux-tts:free`, voice `flux-alexis-en`. Hidden in production and refused by the production server.

All use the existing server-only `OPENROUTER_API_KEY`. No browser keys or separate audio subscription are needed. Old reading pause switches are retired. Main lesson and image models are unchanged.

`TEACHERFLOW_LISTENING_DB` optionally sets the SQLite path. If omitted, it uses `listening.sqlite` beside `TEACHERFLOW_BETA_DB` (therefore `/var/data/listening.sqlite` on the existing Render service), or `.local-runtime/listening.sqlite` locally. Keep the database on persistent storage. Do not publish it or the generated recordings to GitHub.

Scripts and MP3 results are cached per authenticated account. Repeated and concurrent requests reuse completed work. Beta teachers must use their own completed lesson; each item has at most three generation attempts. The owner is exempt from beta retry quotas. Approximate two-minute duration depends on word count and speech pace; the audio player shows actual duration. No-technology lessons get a teacher-read script without making a speech request.

Student worksheets include questions, not transcripts or answers. Teacher worksheets include the script and key. Complete lesson downloads include the saved MP3 and a teacher transcript PDF. Reopening/downloading an existing recording does not call the speech provider.

Local checks:

```powershell
node tests/listening.test.mjs
node tests/reading.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Opt-in paid integration check (requires `.env.local`):

```powershell
node --env-file=.env.local tests/listening-live.mjs
```

The live check caches samples in `.local-runtime/listening-review`, generates reading/listening for four age/level combinations, synthesizes one full recording and verifies cache reuse. Browser tests additionally validate decoding, playback, downloads, worksheet answer separation and ZIP contents.
