# TeacherFlow Google sign-in

Google identifies the account; TeacherFlow's server independently verifies the
owner ID or an active claimed beta invitation before any paid generation. No
Google profile field, email address, or test-user list grants an owner role.

## Migration status (2026-09-18)

The owner created a separately owned Supabase project, xeacpahdrluspotialye.
Google provider settings are saved there. A read-only authorization probe returned
HTTP 302 to accounts.google.com with the expected Google client ID and callback:
https://xeacpahdrluspotialye.supabase.co/auth/v1/callback.
The owner's screenshot also shows the Site URL set to
https://teacherflow-beta.onrender.com and /auth added as a redirect URL.
This verifies the authorization redirect, not a completed Google login.

The live app has not been switched to this new project. Its original
Lovable-managed service previously reported "Unsupported provider: missing OAuth
secret". Configuring the new project does not change that original service.

The owner downloaded teachflow-ai-lessons_260918.backup. Offline inspection with
pg_restore found 4 auth users, 4 identities, 4 profiles, and 5 saved lessons.
All profile, identity, and lesson ownership references resolve to exported users;
there are no duplicate normalized email addresses. Original user IDs and password
hashes are present. Password login still needs verification after restoration.
There are no stored application objects or MFA factors in this snapshot.

Private inspection files are under the git-ignored
.local-runtime/supabase-migration directory. Never commit account data, hashes,
session tokens, or database credentials. The owner reset the new database password
and successfully connected through the Session pooler. Read-only inspection
confirmed PostgreSQL 17.6, zero users/identities, no public tables or custom auth
user triggers, and compatible account columns. No restore or live environment
change had been performed at that inspection.

The workspace-root Import-TeacherFlow.ps1 helper is prepared. It uses the owner's
Windows-encrypted credential, first rehearses a targeted import with rollback,
then repeats it with commit only after all checks pass. It preserves user IDs,
hashes, confirmation states, profiles and lessons; clears old recovery/change
tokens; checks full row equality, all four teachers' row isolation, anonymous
read denial, cross-user write denial and new-account profile creation. SQL input
hashes and helper syntax were checked locally. The first remote rehearsal stopped
at profiles_pkey: the first repository migration installed the signup trigger
before account restoration, causing duplicate profiles. That transaction did not
commit. The generator now defers only that app trigger until after restoring
profiles. A local PostgreSQL 17 fixture using the inspected auth column definitions
and actual backup reproduced the original error, then passed corrected rehearsal
rollback, full import/data comparisons, all access checks, profile creation, and
refusal to overwrite an already populated target. The local server was stopped.
The corrected remote rehearsal and final import both passed on September 18,
2026. The saved final log ends in COMMIT (08:49:18 local time): 4 users, 4
identities, 4 profiles, 5 lessons, full staged-data comparison passed, teacher
isolation passed, profile creation passed, and no active sessions copied.
See private import-commit.out.txt for the database confirmation and
local-test-result.json for local test metadata. Do not rerun the importer against
this populated target.

The helper must run as the owner's Windows account because the Codex
sandbox account cannot decrypt that account's DPAPI credential. After execution,
inspect private import-rehearsal/import-commit logs when diagnosing any failure.

The live website has NOT been switched. The owner supplied the new publishable
key, staged in git-ignored .env.migration (both VITE_ and server settings).
Read-only API checks passed: key accepted, Google enabled, correct Google client
and callback, anonymous profiles/lessons rejected with permission errors. Full
Google login/token exchange is still pending. TypeScript, 26 targeted app tests,
production build using the new public settings, and production route/export-tool
smoke test passed. GitHub hosted-beta remains at
ff48ec6bb73c6dfbe2c35e2c04c85b3d38d6a63a. Pending Google/support/access changes
are recorded in private repo-diff.json; none were published during this step.

The owner ran check-source-freshness.sql in the OLD Lovable project's SQL editor.
Screenshots confirmed all four counts/checksums match the imported backup:
4 accounts, 4 identities, 4 profiles and 5 lessons. The query excludes transient
login tokens and login timestamps, but covers account identity/confirmation/
password/metadata, identities, all profile fields and complete lesson content.
No second export is required for the compared state. Avoid source writes during
the final switch window; if records change afterward, reconcile them before
retiring the old backend. Never rerun the empty-target importer on this populated
target.

Pending: run node scripts/backup-before-auth-migration.mjs in Render's Shell to
backup its persistent beta data and record the owner UUID; retain the existing
disk and owner configuration. Update all four Supabase environment variables
(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL,
SUPABASE_PUBLISHABLE_KEY) and choose Save, rebuild, and deploy. Then complete
browser sign-in/access checks. The backup script was tested against SQLite WAL
data and refuses a missing beta database. It never resets invitation/budget data.

Preserve original user IDs because
Render's owner configuration, beta invitations, usage, readings, and recordings
depend on them. Retain Render's persistent disk and verify its backup separately.
Restore application/account data without replacing the new project's managed
auth schema or Google settings. Do not migrate active sessions or one-time tokens.

## Create your own Google connection

1. Open https://console.cloud.google.com/auth/overview and create/select a project
   called TeacherFlow in the owner's Google account.
2. Complete Google Auth Platform's initial setup: app name TeacherFlow, support
   and developer contact email, and External audience.
3. Configure basic identity scopes only: openid, email, and profile.
4. Open Clients, create a Web application client, and add this JavaScript origin:
   https://teacherflow-beta.onrender.com
5. For direct Supabase OAuth, copy the callback URI from the owned project's
   Google provider settings. The current app's configured service would use
   https://yfmmysdoqmokxhshsuud.supabase.co/auth/v1/callback, but the owner does
   not currently have direct provider settings for this Lovable-managed service.
   A new owned Supabase project will have a different callback URI.
6. Create the client and copy its Client ID and Client secret directly into the
   Google provider configuration of the service that manages TeacherFlow users.
   Do not commit the secret or put it in a VITE_ environment variable.
7. While Google's audience is Testing, add the intended Google accounts to its
   Test users list. This permits Google login only, not TeacherFlow generation.

## Where to configure the provider

For a personally owned Supabase project, open Authentication, Sign In / Providers,
Google. The owner's September 18 screenshot confirms the existing project uses
Lovable Cloud. Its current "Your own credentials" form lists
https://oauth.lovable.app/callback and
https://teachflow-ai-lessons.lovable.app/~oauth/callback. This form configures
Lovable's OAuth flow, not necessarily the direct Supabase provider used by the
Render app. Do not assume saving credentials there fixes direct Supabase OAuth.
Using that flow would also retain a Lovable authentication dependency. Complete
the move to an owned backend to meet the user's independence requirement, with
existing users, lessons, owner identity, and beta permissions preserved. Do not
change the live backend URLs until that migration has been prepared and verified.

In the authentication service's URL configuration, use this Site URL:
https://teacherflow-beta.onrender.com
Allow the app's /auth callbacks (including the redirect query), /builder, and
/lessons destinations used by sign-in and email links on that same origin.
Do not replace existing password-recovery redirects without reviewing them.

The public app probes Google readiness with a one-minute cache. After saving the
provider settings, refresh the sign-in page after a minute. No code rebuild is
needed to show the enabled Google button.

## Acceptance check

- Sign in with a Google account that has never claimed a beta invitation: browsing
  and profile access work, generation stays blocked, and no invitation is created.
- Claim a valid invitation with that account: the existing three-lesson, six-image,
  one-recording limits and shared beta budget apply.
- Deactivate access in Beta management: new paid requests are denied regardless of
  the sign-in method; existing saved materials remain accessible.
- Check a teacher cannot see or call owner management operations.
- Confirm account selection returns to this TeacherFlow site and Google consent
  uses the expected TeacherFlow configuration.

Official setup: https://supabase.com/docs/guides/auth/social-login/auth-google
Redirect configuration: https://supabase.com/docs/guides/auth/redirect-urls
