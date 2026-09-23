import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export type ProviderKind = "text" | "image" | "audio";
const capacity: Record<ProviderKind, number> = { text: 2, image: 1, audio: 1 };
export class ProviderQueueError extends Error {}

/** Shared across server processes; waiting consumes neither a provider call nor budget. */
export class ProviderQueue {
  db: DatabaseSync;
  private now: () => number;
  constructor(file: string, now: () => number = Date.now) {
    this.now = now;
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS provider_queue (sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,model TEXT NOT NULL,state TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS provider_cooldown (model TEXT PRIMARY KEY,until INTEGER NOT NULL);`);
  }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = work();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  enqueue(kind: ProviderKind, model: string) {
    return this.transaction(() => {
      this.db.prepare("DELETE FROM provider_queue WHERE expires<=?").run(this.now());
      if (
        (this.db.prepare("SELECT COUNT(*) AS n FROM provider_queue").get() as { n: number }).n >=
        100
      )
        throw new ProviderQueueError(
          "Generation is busy. Your saved work is retained; try this part again shortly. No new provider request was sent.",
        );
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO provider_queue(id,kind,model,state,expires) VALUES(?,?,?,'waiting',?)",
        )
        .run(id, kind, model, this.now() + 120_000);
      return id;
    });
  }
  claim(id: string) {
    return this.transaction(() => {
      const now = this.now();
      this.db.prepare("DELETE FROM provider_queue WHERE expires<=?").run(now);
      const row = this.db.prepare("SELECT * FROM provider_queue WHERE id=?").get(id) as
        { sequence: number; kind: ProviderKind; model: string; state: string } | undefined;
      if (!row)
        throw new ProviderQueueError(
          "The generation wait expired. Your saved work is retained; try this part again. No new provider request was sent.",
        );
      if (row.state === "running") return true;
      const cooled = this.db
        .prepare("SELECT 1 FROM provider_cooldown WHERE model=? AND until>?")
        .get(row.model, now);
      const running = this.db
        .prepare(
          "SELECT kind,COUNT(*) AS n FROM provider_queue WHERE state='running' GROUP BY kind",
        )
        .all() as { kind: ProviderKind; n: number }[];
      if (
        cooled ||
        running.reduce((n, r) => n + r.n, 0) >= 3 ||
        (running.find((r) => r.kind === row.kind)?.n ?? 0) >= capacity[row.kind]
      )
        return false;
      // Older eligible work in this lane gets priority. A cooling model cannot block another model.
      const earlier = this.db
        .prepare(
          "SELECT 1 FROM provider_queue q WHERE q.kind=? AND q.state='waiting' AND q.sequence<? AND NOT EXISTS(SELECT 1 FROM provider_cooldown c WHERE c.model=q.model AND c.until>?) LIMIT 1",
        )
        .get(row.kind, row.sequence, now);
      if (earlier) return false;
      this.db
        .prepare("UPDATE provider_queue SET state='running',expires=? WHERE id=?")
        .run(now + 360_000, id);
      return true;
    });
  }
  heartbeat(id: string) {
    this.db
      .prepare("UPDATE provider_queue SET expires=? WHERE id=? AND state='running'")
      .run(this.now() + 360_000, id);
  }
  release(id: string) {
    this.db.prepare("DELETE FROM provider_queue WHERE id=?").run(id);
  }
  cooldown(model: string, ms: number) {
    if (Number.isFinite(ms) && ms > 0)
      this.db
        .prepare(
          "INSERT INTO provider_cooldown VALUES(?,?) ON CONFLICT(model) DO UPDATE SET until=MAX(until,excluded.until)",
        )
        .run(model, this.now() + Math.min(ms, 86_400_000));
  }
  close() {
    this.db.close();
  }
}

export const providerQueueFile = () =>
  process.env["TEACHERFLOW_PROVIDER_QUEUE_DB"] ||
  process.env["TEACHERFLOW_BUDGET_DB"] ||
  join(
    dirname(process.env["TEACHERFLOW_BETA_DB"] || ".local-runtime/beta.sqlite"),
    "budget.sqlite",
  );
export async function inProviderQueue<T>(
  kind: ProviderKind,
  model: string,
  signal: AbortSignal | undefined,
  work: (queue: ProviderQueue) => Promise<T>,
  onWait?: (ms: number) => void,
): Promise<T> {
  const cancelled = () =>
    new ProviderQueueError(
      "The generation wait was cancelled. Your saved work is retained. No new provider request was sent.",
    );
  if (signal?.aborted) throw cancelled();
  const queue = new ProviderQueue(providerQueueFile());
  let id: string | undefined, timer: ReturnType<typeof setInterval> | undefined;
  let dispatched = false;
  const started = Date.now();
  try {
    id = queue.enqueue(kind, model);
    while (!queue.claim(id)) {
      signal?.throwIfAborted();
      if (Date.now() - started >= 90_000)
        throw new ProviderQueueError(
          "Generation is busy. Your saved work is retained; try this part again shortly. No new provider request was sent.",
        );
      await delay(200, undefined, { signal });
    }
    signal?.throwIfAborted();
    if (Date.now() - started >= 200) onWait?.(Date.now() - started);
    timer = setInterval(() => {
      try {
        queue.heartbeat(id!);
      } catch {
        /* The existing lease remains bounded. */
      }
    }, 30_000);
    timer.unref();
    dispatched = true;
    return await work(queue);
  } catch (error) {
    if (!dispatched && signal?.aborted) throw cancelled();
    throw error;
  } finally {
    if (timer) clearInterval(timer);
    // Cleanup must not discard a paid success. Abandoned leases expire on their own.
    try {
      if (id) queue.release(id);
    } catch {
      console.error("Provider queue cleanup was delayed.");
    }
    try {
      queue.close();
    } catch {
      console.error("Provider queue connection cleanup was delayed.");
    }
  }
}
