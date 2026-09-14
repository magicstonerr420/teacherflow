# TeacherFlow private beta

The local app now runs with `TEACHERFLOW_BETA=true`. No invitations have been sent and no website has been deployed.

## Teacher experience

1. Open an invitation link, sign in to TeacherFlow using your email, then claim the invitation in the builder. The invitation is retained in this browser for 24 hours across tabs and sign-in, then removed after it is claimed.
2. Each of the three invitations can belong to only one account. An account cannot collect additional invitations.
3. Each account has three lesson slots. Starting a new set of inputs reserves one slot; completing all nine parts marks that lesson successful. A failed part resumes in its existing slot. Changing inputs creates a different lesson, so use Resume to retain the existing allowance.
4. The builder lists existing lessons for Resume or Reopen. Completed parts and images come from server storage after refresh or restart. Repeating identical inputs reopens the same lesson.
5. Up to six predetermined illustration prompts per completed lesson are allowed. Repeated PowerPoint exports reuse images. AI section regeneration is disabled in beta; local editing and downloads remain available.
6. Each lesson part allows three attempts, each image two attempts. Exhaustion requires organizer assistance; it does not automatically buy more generations or use a premium model. One stage may also make the existing bounded content-repair call.

## Local invitations and storage

The three unclaimed links are in `.local-runtime/beta-invitations.txt`. These links currently use localhost and will not work on another teacher's computer. Do not commit or publish this file.

Allowances, invitation hashes, generated lesson parts and cached images are stored in `.local-runtime/beta.sqlite`. Keep this file private and backed up. Do not delete or recreate it to restart the app: that would lose teacher progress and invitation claims. `tests/create-beta-invites.mjs` refuses to issue extra seats after the first three.

The beta uses the existing Supabase sign-in service. No teacher emails or test accounts have been created. Invitation claiming checks identity with Supabase on the server; there is no test authentication bypass. Cloud lesson saving remains separate from the beta's automatic local checkpoint storage.

## Verification performed

- `node --test tests/beta.test.mjs`: isolated temporary database and fake AI callbacks; three teachers/three lessons each, fourth lesson blocked, single-use invitations, duplicate requests, retained failed progress, server restart, image limits, cached exports and bounded image retries. No paid AI calls.
- `node tests/beta-browser.cjs`: actual local browser/server; signed-out form disabled, direct generation/invitation/image requests blocked, forged bearer token rejected, section regeneration blocked. No paid AI calls.
- TypeScript and production build passed.

These checks do not replace a real email sign-up, invitation claim and complete lesson/export walkthrough. That check is still required before distribution. The earlier budget test verified real Gemini lesson generation and FLUX image generation, before beta access controls were added.

## Before sharing externally

Deploy the Node application on a Node 24 host with a persistent disk. Set `TEACHERFLOW_BETA=true`, `TEACHERFLOW_BETA_DB` to an absolute path on that disk, and the existing server-only AI/auth environment variables. This SQLite design is for a single hosted app instance, not ephemeral/serverless or horizontally distributed instances.

Use the same invitation database when changing the invitation links' origin to the hosted HTTPS address. Configure Supabase authentication redirect URLs for that address. Verify real account sign-in, invitation claim, lesson generation, image/export, and saved-lesson isolation before sending links. Existing source migrations specify per-user Supabase row-level security, but the live cloud policy has not been independently audited in these local tests.

## Real sign-in walkthrough in progress
The current development server temporarily uses .local-runtime/walkthrough.sqlite, a separate database from the three teacher invitations. Supabase email/password and Google providers are enabled, and email confirmation is required. The sign-in page supports passwordless email links and optional email codes. Confirmation-required signup no longer falsely reports an active session; Google returns to the requested page. Browser tests cover confirmation notices and invitation persistence across tabs. Real invitation claiming must still be confirmed before this walkthrough is marked complete.

## Owner workspace
TEACHERFLOW_OWNER_USER_ID identifies the owner using the server-verified Supabase user ID. That signed-in account can generate lesson text, regenerate sections and generate illustrations without beta quotas. No client-supplied role or email grants owner access. OpenRouter charges still apply. Other users must claim one of the three invitations and retain the original limits.
The development server now uses .local-runtime/beta.sqlite again. All three teacher invitations are unclaimed. The separate walkthrough account allowance was reset to three using credits on its existing completed run, preserving that content in .local-runtime/walkthrough.sqlite. A before-reset snapshot is saved privately in .local-runtime/before-owner-reset.json.
