import { betaStore, type BetaStore } from './beta-store.server.ts';
import { AccessRequestStore } from './access-request-store.server.ts';
import { SITE_ORIGIN } from '../config/contact.ts';

export function approvalEmailConfiguration() {
  const from = process.env['TEACHERFLOW_ALERT_FROM']?.trim() || '';
  const missing = [
    ...(!process.env['RESEND_API_KEY']?.trim() ? ['RESEND_API_KEY'] : []),
    ...(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from) ? ['TEACHERFLOW_ALERT_FROM'] : []),
  ];
  return {configured: !missing.length, from, missing};
}
type Mail = {id: string; status: string; attempts: number; first_attempt: number | null; payload: string | null};
/** Frozen payload + provider idempotency make a lost response safe to retry. No invitation secret leaves the server. */
export async function deliverApprovalEmails(beta: BetaStore, send: typeof fetch = fetch, now = Date.now()) {
  new AccessRequestStore(beta);
  const config = approvalEmailConfiguration();
  if (!config.configured) return;
  const rows = beta.db.prepare("SELECT * FROM approval_email_outbox WHERE status='queued' AND next<=? AND lease<=? ORDER BY created LIMIT 10").all(now, now) as Mail[];
  for (const mail of rows) {
    const claimed = beta.db.prepare("UPDATE approval_email_outbox SET lease=? WHERE id=? AND status='queued' AND lease<=?").run(now + 60000, mail.id, now);
    if (!claimed.changes) continue;
    const request = beta.db.prepare('SELECT name,email,status,invite_digest FROM access_requests WHERE id=?').get(mail.id) as {name: string; email: string; status: string; invite_digest: string} | undefined;
    const active = request?.status === 'approved' && beta.transact(state => state.invites.some(invite => invite.digest === request.invite_digest && !invite.deactivatedAt));
    if (!active || !request) {
      beta.db.prepare("UPDATE approval_email_outbox SET status='canceled',lease=0,error='Invitation no longer active.' WHERE id=?").run(mail.id);
      continue;
    }
    if (mail.first_attempt !== null && now - mail.first_attempt >= 22 * 3600000) {
      beta.db.prepare("UPDATE approval_email_outbox SET status='review',lease=0,error='Delivery uncertain. Check Resend before contacting the teacher; automatic retries have stopped.' WHERE id=?").run(mail.id);
      continue;
    }
    const payload = mail.payload || JSON.stringify({
      from: config.from, to: [request.email], subject: 'Your TeacherFlow beta access is approved',
      text: `Hi ${request.name},\n\nYour TeacherFlow beta access is approved.\n\nSign in with ${request.email} at ${SITE_ORIGIN}/request-access, then select "Check request status" to activate your invitation. Your beta includes three lesson slots.\n\nYou can explore the example lessons before creating your own.\n\nTeacherFlow`,
    });
    beta.db.prepare('UPDATE approval_email_outbox SET payload=?,first_attempt=COALESCE(first_attempt,?),attempts=attempts+1 WHERE id=?').run(payload, now, mail.id);
    try {
      const response = await send('https://api.resend.com/emails', {
        method: 'POST', headers: {'Authorization': `Bearer ${process.env['RESEND_API_KEY']}`, 'Content-Type': 'application/json', 'Idempotency-Key': `teacherflow-approval/${mail.id}`},
        body: payload, signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const retry = response.status === 429 || response.status >= 500;
        beta.db.prepare('UPDATE approval_email_outbox SET status=?,lease=0,next=?,error=? WHERE id=?').run(retry ? 'queued' : 'review', now + Math.min(3600000, 60000 * 2 ** Math.min(mail.attempts, 6)), `Email provider returned HTTP ${response.status}. ${retry ? 'Retry scheduled.' : 'Check the verified sender and Resend configuration.'}`, mail.id);
        continue;
      }
      const data = await response.json() as {id?: string};
      if (typeof data.id !== 'string' || !data.id) throw Error('Missing provider receipt');
      beta.db.prepare("UPDATE approval_email_outbox SET status='accepted',lease=0,error=NULL,provider_id=? WHERE id=?").run(data.id, mail.id);
    } catch {
      beta.db.prepare("UPDATE approval_email_outbox SET lease=0,next=?,error='Provider response uncertain; retry uses the same email idempotency key.' WHERE id=?").run(now + Math.min(3600000, 60000 * 2 ** Math.min(mail.attempts, 6)), mail.id);
    }
  }
}
let worker: ReturnType<typeof setInterval> | undefined;
let running = false;
export function startApprovalEmailWorker() {
  if (worker || process.env['NODE_ENV'] === 'test' || !process.env['TEACHERFLOW_BETA_DB']) return;
  const tick = async () => {
    if (running || !approvalEmailConfiguration().configured) return;
    running = true;
    try { await deliverApprovalEmails(betaStore()); } catch { console.error('Approval email queue could not be processed.'); } finally { running = false; }
  };
  worker = setInterval(() => void tick(), 60000);
  worker.unref();
  void tick();
}
