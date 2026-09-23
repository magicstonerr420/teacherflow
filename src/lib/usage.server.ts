import { z } from 'zod';
import { PREVIEWS } from './preview-catalog.ts';
import { betaIdentity, isOwner } from './beta-auth.server.ts';
import { betaEnabled, betaStore } from './beta-store.server.ts';
import { usageStore } from './usage-store.server.ts';

const schema = z.object({
  session: z.string().uuid(), event: z.enum(['visit', 'preview', 'preview_download', 'download']),
  target: z.string().max(80).default(''),
}).strict();
export function recordTeacherUsage(user: string, kind: 'active' | 'saved' | 'download') {
  try {
    if (betaEnabled() && !isOwner(user) && betaStore().status(user).claimed) usageStore().teacher(user, kind);
  } catch { /* Metrics must never prevent opening or saving a lesson. */ }
}
export async function submitUsage(request: Request) {
  const empty = () => new Response(null, {status: 204, headers: {'Cache-Control': 'no-store'}});
  try {
    if (request.headers.get('dnt') === '1') return empty();
    const origin = request.headers.get('origin');
    if (!origin || new URL(origin).host !== new URL(request.url).host || !request.headers.get('content-type')?.startsWith('application/json')) return new Response(null, {status: 403});
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, {status: 400});
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 1024) { await reader.cancel(); return new Response(null, {status: 413}); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data = schema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (data.event === 'download') {
      if (!['pptx', 'pdf', 'zip', 'mp3'].includes(data.target)) return new Response(null, {status: 400});
      const user = await betaIdentity(request);
      recordTeacherUsage(user.id, 'download');
    } else {
      if (data.event === 'visit' ? data.target !== '' : !PREVIEWS.some(p => p.slug === data.target)) return new Response(null, {status: 400});
      usageStore().event(data.session, data.event, data.target);
    }
    return empty();
  } catch { return new Response(null, {status: 400, headers: {'Cache-Control': 'no-store'}}); }
}
