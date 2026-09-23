import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { recordProvider, recordProviderEvent } from './management-store.server.ts';
import { inProviderQueue, ProviderQueueError, type ProviderQueue, type ProviderKind } from './provider-queue.server.ts';
import { retryAfter } from './provider-retry.server.ts';

// Invoked only after server-side invitation/ownership checks. Owner calls have no scope.
const context = new AsyncLocalStorage<string>();
const operationContext = new AsyncLocalStorage<string>();
export const withBetaBudget = <T>(user: string, work: () => T): T => context.run(user, work);
/** A retry or alternate model must honor uncertainty from the same logical action. */
export const withProviderOperation = <T>(identity:string,work:()=>T):T => operationContext.run(hash(identity),work);
export class BetaBudgetError extends Error {}
const micros = (usd: number) => Math.ceil(usd * 1_000_000);
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export function betaBudgetFile() {
  return process.env['TEACHERFLOW_BUDGET_DB'] || join(dirname(process.env['TEACHERFLOW_BETA_DB'] || '.local-runtime/beta.sqlite'), 'budget.sqlite');
}

/** One persistent round, not a daily/monthly allowance. Unknown charges retain their reservation. */
export class BetaBudget {
  db: DatabaseSync;
  constructor(file = betaBudgetFile()) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS budget_round (id INTEGER PRIMARY KEY, ceiling INTEGER NOT NULL, paused INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS budget_calls (id TEXT PRIMARY KEY, scope TEXT NOT NULL, request_key TEXT NOT NULL, kind TEXT NOT NULL, model TEXT NOT NULL, reserved INTEGER NOT NULL, charged INTEGER, state TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS budget_requests ON budget_calls(request_key, state);`);
    // This round's US$10 ceiling was approved by the owner. Redeploys never reset it.
    this.db.prepare('INSERT OR IGNORE INTO budget_round(id,ceiling) VALUES(1,?)').run(10_000_000);
  }
  status() {
    const round = this.db.prepare('SELECT * FROM budget_round WHERE id=1').get() as { ceiling: number; paused: number };
    const sums = this.db.prepare("SELECT COALESCE(SUM(CASE WHEN charged IS NOT NULL THEN charged ELSE 0 END),0) AS charged, COALESCE(SUM(CASE WHEN charged IS NULL THEN reserved ELSE 0 END),0) AS held FROM budget_calls").get() as { charged: number; held: number };
    return { limitUsd: round.ceiling / 1e6, accountedUsd: sums.charged / 1e6, reservedUsd: sums.held / 1e6,
      remainingUsd: Math.max(0, (round.ceiling - sums.charged - sums.held) / 1e6), paused: !!round.paused };
  }
  breakdown() {
    return this.db.prepare(`SELECT scope AS user,kind,model,COUNT(*) AS requests,
      SUM(CASE WHEN charged IS NOT NULL THEN charged ELSE 0 END)/1000000.0 AS confirmedUsd,
      SUM(CASE WHEN charged IS NULL THEN reserved ELSE 0 END)/1000000.0 AS reservedUsd,
      SUM(CASE WHEN state='uncertain' THEN 1 ELSE 0 END) AS uncertain
      FROM budget_calls GROUP BY scope,kind,model ORDER BY confirmedUsd DESC`).all() as {user:string;kind:string;model:string;requests:number;confirmedUsd:number;reservedUsd:number;uncertain:number}[];
  }
  reserve(scope: string, requestKey: string, kind: string, model: string, usd: number) {
    const amount = micros(usd);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BetaBudgetError('The cost of this request could not be checked. Contact the organizer.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.db.prepare("SELECT id FROM budget_calls WHERE request_key=? AND state IN ('held','uncertain')").get(requestKey))
        throw new BetaBudgetError('This request is running or its previous charge is still uncertain. Your work is saved. Contact the organizer before retrying it.');
      const status = this.status();
      if (status.paused || amount > Math.round(status.remainingUsd * 1e6))
        throw new BetaBudgetError('The shared private-beta budget has no room for this request. Your saved lessons, pictures, and recordings remain available. Contact the organizer.');
      const id = randomUUID();
      this.db.prepare("INSERT INTO budget_calls VALUES(?,?,?,?,?,?,NULL,'held',?)").run(id, scope, requestKey, kind, model, amount, Date.now());
      this.db.exec('COMMIT');
      return id;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  settle(id: string, cost?: number) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT reserved,charged FROM budget_calls WHERE id=?').get(id) as { reserved: number; charged: number | null } | undefined;
      if (!row || row.charged !== null) { this.db.exec('COMMIT'); return; }
      if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
        this.db.prepare("UPDATE budget_calls SET state='uncertain' WHERE id=?").run(id);
      } else {
        const amount = micros(cost);
        this.db.prepare("UPDATE budget_calls SET charged=?,state='settled' WHERE id=?").run(amount, id);
        // A changed/unexpected provider charge freezes new work for organizer review.
        if (amount > row.reserved) this.db.exec('UPDATE budget_round SET paused=1 WHERE id=1');
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}

export function betaBudgetStatus() {
  const budget = new BetaBudget();
  try { return budget.status(); } finally { budget.close(); }
}

const prices = new Map<string, { until: number; data: any }>();
async function catalog(url: string) {
  const cached = prices.get(url);
  if (cached && cached.until > Date.now()) return cached.data;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw Error();
    const data = await response.json();
    prices.set(url, { until: Date.now() + 60_000, data });
    return data;
  } catch { throw new BetaBudgetError('Pricing could not be checked. No paid request was sent. Try again shortly.'); }
}

async function quote(path: string, body: any): Promise<{ kind: string; reserve: number; audioCost?: number }> {
  const model = body.model;
  if (path.endsWith('/chat/completions')) {
    const limits: Record<string, { prompt: number; completion: number }> = {
      'openai/gpt-5.4-mini': { prompt: 1.5, completion: 9 },
      'deepseek/deepseek-v4-flash-0731': { prompt: .44, completion: 1.32 },
    };
    const rate = limits[model];
    if (!rate || !Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 12000 || body.tools || body.stream)
      throw new BetaBudgetError('This model or request has not been approved for the private-beta budget. Contact the organizer.');
    // Backup endpoints must still serve the SAME approved model under these caps.
    body.provider = { ...body.provider, allow_fallbacks: true, max_price: { ...rate, request: 0 } };
    // UTF-8 bytes bound ordinary text tokens; include schema serialization and framing headroom.
    const input = Buffer.byteLength(JSON.stringify(body), 'utf8') + 4096;
    return { kind: 'text', reserve: (input * rate.prompt + body.max_tokens * rate.completion) / 1e6 * 1.1 };
  }
  if (path.endsWith('/images')) {
    if (model !== 'google/gemini-3.1-flash-image-preview' || body.n !== 1 || body.resolution !== '1K' || body.input_references)
      throw new BetaBudgetError('This image configuration has not been approved for the beta budget. Contact the organizer.');
    const data = await catalog(`https://openrouter.ai/api/v1/images/models/${model}/endpoints`);
    const endpoint = data.endpoints?.find((e: any) => e.provider_tag === 'google-ai-studio');
    const lines = endpoint?.pricing;
    if (!Array.isArray(lines) || lines.length !== 1 || lines[0].billable !== 'output_image' || lines[0].unit !== 'token' || !(Number(lines[0].cost_usd) > 0 && Number(lines[0].cost_usd) <= .00006))
      throw new BetaBudgetError('Image pricing changed. Contact the organizer before generating more pictures.');
    body.provider = { only: ['google-ai-studio'], allow_fallbacks: false };
    // Reserve the model's full documented 32,768 output-token limit, even for one 1K image.
    return { kind: 'image', reserve: (32768 * .00006 + Buffer.byteLength(body.prompt, 'utf8') * .000001) * 1.1 };
  }
  if (path.endsWith('/audio/speech')) {
    const allowed: Record<string, { tag: string; rate: number }> = {
      'microsoft/mai-voice-2': { tag: 'azure', rate: .000022 },
      'hexgrad/kokoro-82m': { tag: 'deepinfra', rate: .00000062 },
    };
    const config = allowed[model];
    if (!config || typeof body.input !== 'string' || body.input.length > 3500 || body.provider?.only?.length !== 1 || body.provider.only[0] !== config.tag)
      throw new BetaBudgetError('This voice has not been approved for the private-beta budget.');
    const data = await catalog(`https://openrouter.ai/api/v1/models/${model}/endpoints`);
    const rate = data.data?.endpoints?.find((e: any) => e.tag === config.tag)?.pricing;
    if (!rate || !(Number(rate.prompt) > 0 && Number(rate.prompt) <= config.rate) || Number(rate.completion) !== 0 || Number(rate.request || 0) !== 0)
      throw new BetaBudgetError('Voice pricing changed. Contact the organizer before recording.');
    // UTF-16 length conservatively counts surrogate pairs as two billed characters.
    const audioCost = body.input.length * Number(rate.prompt);
    return { kind: 'audio', reserve: audioCost * 1.1, audioCost };
  }
  throw new BetaBudgetError('This paid operation is not included in the beta budget.');
}

/** All three paid transports use this gate. Reservations precede requests across processes. */
export async function budgetFetch(url: string, options: RequestInit): Promise<Response> {
  const body=JSON.parse(String(options.body));
  const kind:ProviderKind=url.endsWith('/images')?'image':url.endsWith('/audio/speech')?'audio':'text';
  return inProviderQueue(kind,String(body.model),options.signal??undefined,queue=>budgetFetchUnlocked(url,options,queue),
    ms=>recordProviderEvent({model:String(body.model),kind,event:'queued',ms}));
}
async function budgetFetchUnlocked(url:string,options:RequestInit,queue:ProviderQueue):Promise<Response>{
  const scope = context.getStore();
  const body = JSON.parse(String(options.body));
  const rememberCooldown=(response:Response)=>{if(response.status===429)queue.cooldown(String(body.model),retryAfter(response,Date.now())??2000);};
  if (!scope) {
    const kind=url.endsWith('/images')?'image':url.endsWith('/audio/speech')?'audio':'text',started=Date.now();
    try{const response=await fetch(url,options);rememberCooldown(response);await response.clone().arrayBuffer();recordProvider(body.model,kind,response.status,Date.now()-started);return response;}
    catch(error){recordProvider(body.model,kind,undefined,Date.now()-started,error);throw error;}
  }
  const estimate = await quote(url, body);
  if(options.signal?.aborted)throw new ProviderQueueError('The generation wait was cancelled before the provider request. Your saved work is retained. No new provider request was sent.');
  const payload = JSON.stringify(body);
  const budget = new BetaBudget();
  let id: string | undefined;
  try {
    id = budget.reserve(scope, hash(`${scope}:${url}:${operationContext.getStore()??payload}`), estimate.kind, body.model, estimate.reserve);
    let response: Response;
    const started=Date.now();
    try { response = await fetch(url, { ...options, body: payload }); rememberCooldown(response); recordProvider(body.model,estimate.kind,response.status,Date.now()-started); }
    catch (error) {
      recordProvider(body.model,estimate.kind,undefined,Date.now()-started,error);
      budget.settle(id);
      throw new BetaBudgetError('The provider connection was interrupted and the charge is uncertain. Your progress is saved. Contact the organizer before retrying this request.');
    }
    if (!response.ok) {
      // Explicit rejections precede generation. Server/timeouts may already have incurred charges.
      budget.settle(id, [400, 401, 402, 403, 404, 422, 429].includes(response.status) ? 0 : undefined);
      return response;
    }
    try {
      if (estimate.kind === 'audio') {
        await response.clone().arrayBuffer();
        budget.settle(id, estimate.audioCost);
      } else {
        const result = await response.clone().json();
        budget.settle(id, typeof result?.usage?.cost === 'number' ? result.usage.cost : undefined);
      }
    } catch {
      budget.settle(id);
      throw new BetaBudgetError('The provider response was interrupted and its charge is uncertain. Your progress is saved. Contact the organizer before retrying.');
    }
    return response;
  } finally { budget.close(); }
}
