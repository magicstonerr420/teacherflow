# TeacherFlow Gmail approval-email setup

Sender: **teacherfloww@gmail.com**. No domain purchase, Gmail password, app password, or paid email subscription is needed for this route.

The app connection and Google script are prepared. Email delivery is **not active or verified yet**. Google account authorization, Render configuration, deployment, and a real delivery check remain.

## 1. Create the Google script

1. Open [Google Apps Script](https://script.google.com/) while signed in as **teacherfloww@gmail.com**. Choose **New project** and name it **TeacherFlow Approval Emails**.
2. Open the supplied **TeacherFlow-Gmail-Code.txt**, copy its full contents, and replace the contents of **Code.gs** with it. Save.
3. Open **Project Settings** (gear icon). Enable **Show appsscript.json manifest file in editor**.
4. Return to the editor, open **appsscript.json**, and replace it with the supplied **TeacherFlow-Gmail-appsscript.json**. Save. This limits the script's Google permission to sending email; it does not request inbox-reading permission.
5. At the top of the editor, select **initializeTeacherFlow**, then **Run**. Authorize the script with **teacherfloww@gmail.com**. If Google shows an unverified-app notice, confirm this is the project you just created and that the requested permission is to send mail; do not authorize an unrelated app or broader access.
6. Return to **Project Settings → Script properties**. The initializer creates **TEACHERFLOW_GMAIL_SCRIPT_SECRET**. Keep this value private; copy it directly into Render in step 3 below. Running the initializer again preserves the existing secret.
7. Add another script property: **TEACHERFLOW_ALERT_FROM** = **teacherfloww@gmail.com**. Save.
8. In the editor, select **sendTeacherFlowTest** and **Run**. This sends a setup-test email only to **teacherfloww@gmail.com**. Check its inbox and spam folder. This verifies Google's sender; the full TeacherFlow connection is tested later.

## 2. Deploy the Google script

1. Choose **Deploy → New deployment**, click the deployment-type gear, then **Web app**.
2. Set **Execute as** to **Me (teacherfloww@gmail.com)**.
3. Set **Who has access** to **Anyone**. TeacherFlow must reach the endpoint without an interactive Google login. Every email request is separately authenticated with the private signing secret; an unsigned visitor cannot send mail.
4. Click **Deploy**. Copy the web-app URL ending in **/exec**. Do not use the editor URL or a **/dev** test URL.
5. Opening the URL should display a small JSON response identifying the TeacherFlow approval sender. This checks availability, not email delivery.

## 3. Connect Render after the app update is deployed

Before redeploying, confirm the TeacherFlow service's **Compute** and **Disk** settings. The repository specifies Starter and a persistent disk at `/var/data`. A Free workspace plan does not necessarily mean a Free service instance. If the service itself is Free and holds SQLite data on its local filesystem, that data is not retained across redeploys; resolve storage or back up the current data before changing its deployment.

In the TeacherFlow service, open **Environment** and add these server-only variables:

| Variable | Value |
| --- | --- |
| TEACHERFLOW_APPROVAL_EMAIL_PROVIDER | gmail-script |
| TEACHERFLOW_ALERT_FROM | teacherfloww@gmail.com |
| TEACHERFLOW_GMAIL_SCRIPT_URL | Your deployed Google web-app URL ending in /exec |
| TEACHERFLOW_GMAIL_SCRIPT_SECRET | The private value from the Google script's properties |

Do not put the secret in chat, source code, screenshots, or any variable starting with `VITE_`. No `RESEND_API_KEY` is required for Gmail approval emails. This configures approval emails only; the separate owner issue-alert sender is unchanged.

After the reviewed app update is published and storage is confirmed, choose **Save and deploy**. In TeacherFlow, **Management → Teachers → Requests** should identify **Gmail** as the configured approval sender. This confirms configuration presence, not successful delivery.

## 4. Verify one real approval

Use an application from an address you control that has not already used the beta. Approve it in Management, keep the service awake, and check its email status after about a minute. Confirm the recipient receives the correct TeacherFlow message, can reply to **teacherfloww@gmail.com**, and can sign in with the approved email to activate the existing three-lesson invitation.

**Accepted by provider** means Google accepted the sending operation. It does not guarantee inbox delivery. No invitation secret or teaching/application details appear in the email. Approvals queued since the email feature was installed become eligible once setup is enabled; older approvals without an outbox row are not emailed retroactively.

## Limits and recovery

- Personal Google accounts currently allow **100 email recipients per day** through Apps Script, shared with other scripts under that account. Limits can change and other Google anti-abuse restrictions can apply. A quota rejection waits and retries without another approval.
- Render Free may sleep. The worker checks approximately every minute **while the service is running**; email is not guaranteed to send while it sleeps. This sender route works over HTTPS and does not depend on blocked SMTP ports.
- Every request is signed, time-limited, restricted to one recipient, and linked to one approval. Retries retain the same message and delivery key. The script stores only hashed identifiers, payload fingerprints, timestamps, and status; it does not store application content or recipient addresses in script properties.
- A lost HTTP receipt is retried safely against the same stored delivery record. If Google's send outcome or saving its receipt is uncertain, the email stops at **Needs review** instead of being sent twice. An uncertain result cannot be safely solved by approving again or clearing delivery records. Check the recipient and the sender before any manual resend.
- Do not delete `delivery_...` script properties or recreate the Google project while messages are pending. They prevent duplicate sending. Changing providers or the deployment URL after an attempt puts that message into review.
- Teachers can still sign in and use **Check request status** at [TeacherFlow](https://teacherflow-beta.onrender.com/request-access) without waiting for email.

Official references: [Google web-app deployment](https://developers.google.com/apps-script/guides/web), [MailApp permissions](https://developers.google.com/apps-script/reference/mail/mail-app), [Google quotas](https://developers.google.com/apps-script/guides/services/quotas), [Render Free limits](https://render.com/docs/free), [Render environment variables](https://render.com/docs/configure-environment-variables).
