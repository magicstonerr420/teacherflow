# TeacherFlow

TeacherFlow creates classroom-ready English lessons with worksheets, presentations,
reading, listening, and teacher guidance. It runs directly on TanStack Start,
React, Vite, and Nitro, with Supabase authentication and lesson storage.

## Development

Use Node.js 24 and pnpm 10.17.1, matching the Render build configuration.
Run pnpm install --frozen-lockfile, then pnpm dev.

Public Supabase settings use VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
AI credentials belong only in server environment variables. Never put secret
keys in variables beginning with VITE_.

Set TEACHERFLOW_AI_PROVIDER=openrouter and OPENROUTER_API_KEY for hosted AI.
Ollama remains available for local text generation. Missing or unsupported AI
provider configuration produces an error; it never falls back to another vendor.

## Hosting and beta access

render.yaml describes the Node service. Build with pnpm build and start with
node .output/server/index.mjs. The server maps the public Supabase settings to
the names used by server authentication; explicit server settings take precedence.

Keep TEACHERFLOW_BETA=true on the private beta, configure the verified owner ID,
and retain the persistent /var/data disk. Invitations, usage accounting, readings,
and recordings depend on that disk. Creating invitations does not reset the shared
beta budget. Disabling beta mode currently removes some generation access checks;
do not use that configuration for a public service.

## Ownership and migration

The application has no editor-specific build, preview authentication, telemetry,
or AI gateway dependency. Ownership of the existing Supabase service must still
be verified separately before retiring the original project or disconnecting its
backend. Preserve user IDs, saved lessons, policies, and persistent beta data
during any migration. Repository synchronization and domain ownership are separate
account settings; changing this source code does not revoke external account access.

## Checks

Run the TypeScript check with node node_modules/typescript/bin/tsc --noEmit.
The beta, beta-admin, beta-budget, profile, openrouter, illustration, and hosting-env
Node test files use mock AI transports and do not spend generation credits.
After building, run node --env-file=.env.local --test tests/production-smoke.test.mjs.
