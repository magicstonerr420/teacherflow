# Management and automatic alerts

The owner account opens **Management** from the main navigation. Teachers cannot read the dashboard or use its recovery controls.

The dashboard records new lesson steps, reading, listening, recordings, illustrations and PowerPoint exports. It includes the submitted lesson settings, teacher, times, provider attempts and available failure details. Earlier unfinished lessons show saved step progress; they do not gain a guessed historical failure reason.

**Teachers** retains invitations and allowance resets, and adds private support notes and saved step progress. **Issues** offers one additional attempt or a returned lesson slot when a confirmed failure qualifies. These actions retain completed work and spending records. A teacher still starts any retry. In-progress work, uncertain charges and completed parts remain protected.

Monitoring uses `management.sqlite` alongside `TEACHERFLOW_BETA_DB` by default. On Render with `/var/data/beta.sqlite`, the monitoring database is `/var/data/management.sqlite`. Keep it on the persistent disk. `TEACHERFLOW_MANAGEMENT_DB` can override this path.

## Enable email alerts

Dashboard reports work without an email service. Email alerts require these server environment variables in **Render → Environment**:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | A private sending key from your Resend account |
| `TEACHERFLOW_ALERT_FROM` | A permitted sender address on your verified domain |
| `TEACHERFLOW_ALERT_TO` | Your owner inbox; defaults to the app's configured contact email |

Set these privately in Render, then save and deploy. Do not use a `VITE_` prefix or put the key in source code. See [Resend's setup guide](https://resend.com/docs/send-with-nodejs) for its key and domain requirements.

In **Management → Overview**, check the email setup status and turn automatic email alerts on. A configured status checks that the required settings exist; it does not prove that Resend has verified the sender. The delivery history displays service failures, pending retries, and acceptance by the sending service. Acceptance does not prove delivery to your inbox.

Unresolved reports wait at least five minutes for recovery and are grouped by cause, with at most one digest per cause per half-hour. A queued issue alert is canceled if all its issues recover before sending. Three tracked server failures for the same lesson part that subsequently recover can trigger a grouped repeated-failure notice. An optional daily summary covers the previous UTC day. The production server checks the queue every minute while it runs; local development does not send automatic alerts.

Temporary delivery failures use bounded backoff and the same idempotency key. Unconfirmed deliveries stop automatic retry before the sending service's idempotency window expires, and appear as **Review**. Resolve the sending configuration and inspect the email service history before manually resending anything.

## Start locally

Double-click **Start TeacherFlow.cmd**. Codex does not need to be open. The launcher finds Node, prepares export tools and opens the site. Keep its terminal window open while using the local app.

If an older instance of this project is unhealthy on port 3000, the launcher chooses an available nearby port and prints its address. It reuses a healthy instance on later launches. Close the older launcher window when convenient; the launcher does not terminate existing processes.
