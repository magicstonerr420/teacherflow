# TeacherFlow approval-email setup

The approval flow is implemented and tested. Actual sending is not configured yet.

1. Add a domain or subdomain you own in Resend, add the DNS records Resend supplies, and wait for its verified status. A personal Gmail address or TeacherFlow's shared onrender.com hostname cannot be used as your owned sending domain. See [Resend's verified-domain instructions](https://resend.com/docs/dashboard/domains/introduction).
2. Create a Resend API key with permission to send from that domain.
3. Open the TeacherFlow service in Render, choose **Environment**, and add:
   - **RESEND_API_KEY**: your private Resend key.
   - **TEACHERFLOW_ALERT_FROM**: a plain email address at the verified domain, such as beta@updates.your-owned-domain.com. Use your actual domain; this is only an example.
4. Choose **Save and deploy** so the running service receives the variables. See [Render's environment-variable instructions](https://render.com/docs/configure-environment-variables).
5. Open **Management → Teachers → Requests**. It should show that approval emails are enabled. New approvals are checked for sending approximately once per minute while the service runs.
6. After a real authorized approval, inspect the Approved list and Resend's delivery log. TeacherFlow's **Accepted by provider** status means Resend accepted the email; it does not prove inbox delivery.

Do not put the API key in chat, source code, or a public environment variable starting with VITE_.

Emails queued by approvals after this feature was installed wait for setup and will be sent once configuration is present. Approvals made before this feature was installed are not emailed retroactively. The owner can already approve requests and teachers can sign in with the approved email at https://teacherflow-beta.onrender.com/request-access to activate access without waiting for an email.

The message tells the teacher that access is approved, explains same-email sign-in and Check request status, and states the three-lesson allowance. It contains no invitation secret or application details.

The queue persists in the existing beta database. A repeated approval does not create a duplicate message. A removed invitation cancels queued sending. Transient failures retry with a frozen payload and the same [Resend idempotency key](https://resend.com/docs/dashboard/emails/idempotency-keys); uncertain messages stop automatic retries after 22 hours from the first attempt. Entries marked **Needs review** require checking Resend before any manual contact or retry.

Approval emails are separate from the existing owner generation-alert preferences. Approval sending needs the two variables above; owner alert emails additionally use the existing alert settings and recipient configuration.
