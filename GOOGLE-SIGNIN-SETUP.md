# Google sign-in setup for TeacherFlow

Status: pending Google Cloud and Supabase administrator access. Google reports `Unsupported provider: missing OAuth secret` despite its enabled flag. Do not enable the frontend Google button until the provider credentials are configured and checked.

## Google Cloud

Use a Google Cloud project you control. Configure the Google Auth Platform branding for TeacherFlow with an owner-controlled support/contact email. Use an external audience for teachers outside a Google Workspace organization. While the app is in testing, add the owner and invited teachers as test users when required by the configured consent setup.

Create an OAuth client of type **Web application**, named **TeacherFlow web sign-in**. Use this exact authorized redirect URI:

```
https://yfmmysdoqmokxhshsuud.supabase.co/auth/v1/callback
```

Use only the identity scopes needed for sign-in: openid, email and profile. No Gmail, Drive or Calendar access is needed.

## Supabase

In project `yfmmysdoqmokxhshsuud`, open Authentication → Sign In / Providers → Google. Enter the Google client ID and client secret and save. The secret belongs in Supabase's provider settings, never in a `VITE_` variable, browser code or chat.

Authentication → URL Configuration must allow the local return URLs used by the app, including:

```
http://127.0.0.1:3000/auth
http://127.0.0.1:3000/auth?redirect=%2Fbuilder
http://127.0.0.1:3000/builder
http://127.0.0.1:3000/lessons
```

Preserve existing production/Lovable URLs if still used. Add the eventual hosted beta origin and its return paths before deployment.

## Verification and enablement

Run `node --env-file=.env --env-file=.env.local tests/check-google-oauth.mjs`. A passing result confirms that Supabase starts a Google authorization redirect; it does not prove a completed sign-in.

Once that passes, set `VITE_GOOGLE_AUTH_ENABLED=true` and restart/rebuild the app. Test in a normal browser: Google consent → TeacherFlow → verified session. Check that the owner returns to Owner workspace and a teacher still needs an invitation. Google consent may require the user to interact directly.

Use the same owner email as the existing account, and verify the resulting Supabase user ID retains owner access. Never grant owner privileges from client-supplied profile metadata.

References: https://supabase.com/docs/guides/auth/social-login/auth-google and https://supabase.com/docs/guides/auth/redirect-urls
