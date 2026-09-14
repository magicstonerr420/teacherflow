# Run TeacherFlow with OpenRouter on this PC

1. Create a key in your OpenRouter account: https://openrouter.ai/settings/keys
2. In `.env.local`, put the key after `OPENROUTER_API_KEY=` and save. Never use a `VITE_` prefix for a secret, put it into frontend code, or commit this file.
3. Double-click **Start TeacherFlow.cmd**. Keep its window open and visit http://127.0.0.1:3000. If a server is already running there, stop it with Ctrl+C before restarting. Restart after changing the key or model.
4. Use the existing lesson builder. Its nine smaller parts, section regeneration, worksheets and document exports use the new server-side AI connection. No DNS or external hosting is needed for this local test. Internet and OpenRouter credits are required.

`TEACHERFLOW_AI_PROVIDER=openrouter` selects OpenRouter. `OPENROUTER_MODEL=google/gemini-2.5-flash` is the default server-controlled model. You can change that setting to another model that supports strict structured JSON output. There is no fallback to Lovable when OpenRouter fails. The previous Ollama code and configuration remain available by changing the provider setting back to `ollama`, but Ollama/model installation was not completed.

The browser calls TeacherFlow's existing TanStack server functions. Only the server sends the API key to https://openrouter.ai/api/v1/chat/completions. Responses are validated against TeacherFlow's lesson schemas. Requests have a four-minute timeout and a 12,000-output-token limit per stage; a full lesson makes multiple paid requests, and content repair or manual retries may make additional requests.

## Scope

- This is a personal local setup, bound to your PC's loopback address.
- Subscription billing and premium entitlements are not implemented. The browser cannot choose a premium tier. Before making this a public paid service, add authenticated generation, server-verified subscription records, and per-user usage limits. A hidden key alone does not make a publicly reachable endpoint private.
- Sign-in and saved lessons still use the original Supabase cloud project. Existing data has not been migrated.
- Optional AI illustrations use a separate OpenRouter image model. Enable Add original illustrations in the presentation panel. Every request includes student age and English level; image charges are separate.
- These are local source changes; they have not been pushed to GitHub or deployed.

## Checks

Transport tests: `node --test tests/openrouter.test.mjs` (Node 24).
Type check: `node node_modules/typescript/bin/tsc --noEmit`.
Build: `node node_modules/vite/bin/vite.js build`.

Official API reference: https://openrouter.ai/docs/quickstart
Structured output reference: https://openrouter.ai/docs/guides/features/structured-outputs

## Reliability updates
The text request supplies the JSON schema both as an API parameter and an explicit model instruction. OpenRouter response healing is enabled, complete Markdown-fenced JSON is accepted, and lesson-schema validation remains required. On a failed generation, retrying unchanged inputs in the same open page resumes after completed stages. Refreshing or closing the page loses this in-memory checkpoint.

Worksheet Preview / Print opens an in-app preview. Download PDF creates a real PDF without invoking the browser print dialog. Student and answer-key preview and download were verified in Edge browser tests.

Failures show the current part, the reason, and completed progress. Retry keeps completed parts while the page remains open. Answer keys are checked for one answer per question, with one automatic repair attempt. Safe provider metadata (no keys or lesson content) is saved in .local-runtime/generation-events.jsonl.


Budget configuration: lesson text uses Gemini 2.5 Flash; illustrations use OPENROUTER_IMAGE_MODEL=black-forest-labs/flux.2-klein-4b through the dedicated OpenRouter Images API. There is no automatic switch to a more expensive model. Restart the Node process after changing environment settings. Image output remains age- and level-specific.
