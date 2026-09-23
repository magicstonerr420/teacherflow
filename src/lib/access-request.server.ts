import { betaEnabled, betaStore } from './beta-store.server.ts';
import { AccessRequestStore, RequestLimitError } from './access-request-store.server.ts';
import { accessRequestSchema } from './access-request.ts';
import { betaAdministrator } from './beta-admin.server.ts';
import { betaIdentity } from './beta-auth.server.ts';

const headers = {'Cache-Control': 'no-store'};
export async function submitAccessRequest(request: Request) {
  if (!betaEnabled()) return Response.json({error: 'Beta requests are temporarily closed.'}, {status: 503, headers});
  const origin = request.headers.get('origin');
  if (!origin || (() => { try { return new URL(origin).host !== new URL(request.url).host; } catch { return true; } })()) {
    return Response.json({error: 'Open the request form on TeacherFlow and try again.'}, {status: 403, headers});
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error: 'Invalid request format.'}, {status: 415, headers});
  let input: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error('Empty body');
    let size = 0; const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 8192) { await reader.cancel(); return Response.json({error: 'Please shorten your request.'}, {status: 413, headers}); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    input = accessRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch { return Response.json({error: 'Check your name, email, teaching details and consent.'}, {status: 400, headers}); }
  try {
    const client = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
    new AccessRequestStore(betaStore()).submit(input, client);
    return Response.json({ok: true}, {headers});
  } catch (error) {
    if (error instanceof RequestLimitError) return Response.json({error: error.message}, {status: 429, headers: {...headers, 'Retry-After': '3600'}});
    return Response.json({error: 'Your request could not be saved. Please try again.'}, {status: 503, headers});
  }
}
export async function ownerAccessRequests(request: Request) {
  const {actor, store} = await betaAdministrator(request);
  return {actor, requests: new AccessRequestStore(store)};
}
export async function activateRequestedAccess(request: Request) {
  if (!betaEnabled()) throw Error('Teacher beta is temporarily closed.');
  const identity = await betaIdentity(request);
  return new AccessRequestStore(betaStore()).activate(identity);
}
