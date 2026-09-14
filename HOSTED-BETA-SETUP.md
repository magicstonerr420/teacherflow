# Hosted teacher beta — deployment pending

No public beta address has been created yet. Localhost invitation URLs are not shareable with other computers.

## Deployment

1. Publish this updated checkout to the TeacherFlow GitHub repository. The repository's older Lovable code is not a substitute for these local changes. Do not upload `.env*`, `.local-runtime`, databases, invitation files, or dependencies to GitHub.
2. In Render, connect that repository and create a Blueprint using `render.yaml`. This specifies one paid Starter Node 24 service and a 1 GB persistent disk. Review the current checkout price before submitting.
3. Set the requested environment values from the local app's settings. Keep the OpenRouter key server-only; never put it in a `VITE_` variable. The owner ID must be the existing verified owner user ID. Do not change the Supabase project.
4. Deploy. Copy the actual HTTPS address Render assigns; do not assume a particular hostname is available.
5. Transfer the existing `.local-runtime/beta.sqlite` to `/var/data/beta.sqlite` securely before distributing invitations. Alternatively, initialize three new hosted invitations only if the existing invitations are deliberately retired. Do not accidentally issue six active invitations.
6. In Lovable Cloud authentication settings, allow the new hosted URL for sign-in redirects. Keep local URLs if local development continues. Google is hidden until configured and verified.
7. Replace only the origin in the three existing private invitation links with the actual hosted origin. Keep each token private and give one distinct link to each teacher.
8. Verify one real email sign-in, invitation claim, lesson generation, PDF/PPTX export and restart persistence before sending all invitations.

## Instructions to send each teacher once deployment is verified

1. Open your personal TeacherFlow invitation link in Chrome or Edge.
2. Click **Sign in** and enter your email address.
3. Click **Email me a sign-in link**. Open the email and click its link in the same browser. Check spam if needed. No Google login or previously created password is needed for this method.
4. Your invitation should activate automatically. If a **Claim invitation** button appears, click it. Check that it shows **3 new lesson slots remaining**.
5. Fill in the class details and click **Build My Class**. You can test up to three distinct lessons. Reopen or resume an existing lesson instead of starting over after a failure.
6. Review the Teacher and Student worksheets, then preview/print or download the presentation. Keep your invitation private.

Teachers need a TeacherFlow sign-in, not a Supabase administrator account. Hosting and AI usage are billed separately to the organizer.
