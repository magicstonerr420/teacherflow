import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { BetaStore } from './beta-store.server.ts';
import { accessRequestSchema, type AccessRequestRow, type RequestStatus } from './access-request.ts';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const columns = 'id,name,email,teaching,status,created,reviewed,revision';
export class RequestLimitError extends Error {}

/** Requests share the existing persistent beta database and its transaction boundary. */
export class AccessRequestStore {
  constructor(readonly beta: BetaStore) {
    beta.db.exec(`
      CREATE TABLE IF NOT EXISTS access_requests (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, teaching TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, reviewed INTEGER,
        revision TEXT NOT NULL, actor TEXT, invite_digest TEXT
      );
      CREATE INDEX IF NOT EXISTS access_request_queue ON access_requests(status,created);
      CREATE TABLE IF NOT EXISTS access_request_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    `);
  }
  submit(input: unknown, client: string, now = Date.now()) {
    const data = accessRequestSchema.parse(input);
    if (data.website) return;
    const db = this.beta.db;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM access_request_limits WHERE expires<=?').run(now);
      // The global limit is authoritative even when client forwarding headers are spoofed.
      for (const [key, maximum] of [[`client:${hash(client.slice(0, 300))}`, 5], ['global', 100]] as const) {
        const row = db.prepare('SELECT count FROM access_request_limits WHERE key=?').get(key) as {count: number} | undefined;
        if ((row?.count ?? 0) >= maximum) throw new RequestLimitError('Too many requests. Please try again in an hour.');
      }
      for (const key of [`client:${hash(client.slice(0, 300))}`, 'global']) {
        db.prepare('INSERT INTO access_request_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + 3600000);
      }
      const existing = db.prepare('SELECT id FROM access_requests WHERE email=?').get(data.email);
      if (!existing) {
        const count = db.prepare('SELECT COUNT(*) AS n FROM access_requests').get() as {n: number};
        if (count.n >= 1000) throw new RequestLimitError('Requests are temporarily full. Please contact the organizer.');
        db.prepare('INSERT INTO access_requests(id,name,email,teaching,created,revision) VALUES(?,?,?,?,?,?)')
          .run(randomUUID(), data.name, data.email, data.teaching, now, randomUUID());
      }
      // A duplicate never overwrites the original application or reveals its decision.
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  list(status: RequestStatus, offset = 0) {
    const db = this.beta.db;
    return {
      requests: db.prepare(`SELECT ${columns} FROM access_requests WHERE status=? ORDER BY created,id LIMIT 50 OFFSET ?`).all(status, offset) as AccessRequestRow[],
      total: (db.prepare('SELECT COUNT(*) AS n FROM access_requests WHERE status=?').get(status) as {n: number}).n,
      pending: (db.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE status='pending'").get() as {n: number}).n,
    };
  }
  review(actor: string, id: string, expectedRevision: string, decision: 'approved' | 'declined') {
    if (!actor) throw Error('Owner sign-in is required.');
    return this.beta.transact(state => {
      const row = this.beta.db.prepare(`SELECT ${columns} FROM access_requests WHERE id=?`).get(id) as AccessRequestRow | undefined;
      if (!row) throw Error('This request is unavailable. Refresh the list.');
      if (row.status === decision) return; // Retrying a lost response never creates a second invitation.
      if (row.status !== 'pending' || row.revision !== expectedRevision) throw Error('This request changed. Refresh the list before reviewing it.');
      const now = Date.now();
      let digest: string | null = null;
      if (decision === 'approved') {
        if (Object.values(state.teachers).some(teacher => teacher.email?.trim().toLowerCase() === row.email) || state.usedEmails?.[hash(row.email)]) {
          throw Error('This email has already used the beta. Manage the existing teacher instead of granting another trial.');
        }
        const code = randomBytes(24).toString('base64url');
        digest = hash(code);
        state.invites.push({ digest, code, email: row.email, label: row.name });
        (state.accessHistory ??= []).push({action: 'approve-request', actor, seat: state.invites.length, at: new Date(now).toISOString()});
      }
      this.beta.db.prepare('UPDATE access_requests SET status=?,reviewed=?,revision=?,actor=?,invite_digest=? WHERE id=?')
        .run(decision, now, randomUUID(), actor, digest, id);
    });
  }
  /** Called only with identity verified by Supabase, never with a submitted email. */
  activate(identity: {id: string; email?: string; name?: string}) {
    const access = this.beta.status(identity.id, identity.email, identity.name);
    if (access.claimed) return {status: 'active' as const};
    if (access.revoked) return {status: 'inactive' as const};
    if (!identity.email) return {status: 'missing-email' as const};
    const row = this.beta.db.prepare('SELECT status,invite_digest FROM access_requests WHERE email=?').get(identity.email.trim().toLowerCase()) as {status: RequestStatus; invite_digest: string | null} | undefined;
    if (!row) return {status: 'none' as const};
    if (row.status !== 'approved') return {status: row.status};
    const code = this.beta.transact(state => state.invites.find(invite => invite.digest === row.invite_digest && !invite.user && !invite.deactivatedAt)?.code);
    if (!code) return {status: 'inactive' as const};
    this.beta.claim(identity.id, code, identity.email, identity.name);
    return {status: 'active' as const};
  }
}
