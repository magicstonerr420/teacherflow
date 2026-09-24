import { monitorEventLoopDelay } from 'node:perf_hooks';

const mb = (bytes: number) => Math.round(bytes / 1048576);
function memorySample() {
  const memory = process.memoryUsage();
  return { rssMB: mb(memory.rss), heapUsedMB: mb(memory.heapUsed), externalMB: mb(memory.external) };
}

let started = false;
/** Resource totals only: no credentials, URLs, account IDs or lesson content. */
export function startRuntimeDiagnostics() {
  if (started || process.env['NODE_ENV'] !== 'production') return;
  started = true;
  const loop = monitorEventLoopDelay({ resolution: 100 });
  loop.enable();
  setInterval(() => {
    console.info('TeacherFlow runtime', JSON.stringify({
      ...memorySample(), eventLoopMaxMs: Math.round(loop.max / 1e6),
    }));
    loop.reset();
  }, 60000).unref();
}

export function reportSlowServerRequest(request: Request, startedAt: number) {
  const ms = Math.round(performance.now() - startedAt);
  if (ms < 1000 || process.env['NODE_ENV'] !== 'production') return;
  const path = new URL(request.url).pathname;
  // Never log arbitrary paths: share/invitation links can contain private tokens.
  const route = path === '/' ? 'home'
    : path === '/examples' ? 'examples'
    : path === '/beta-management' ? 'management'
    : path.startsWith('/share/') ? 'shared-lesson'
    : path.startsWith('/_serverFn/') ? 'server-function'
    : path.startsWith('/api/') ? 'api' : 'other';
  console.warn('TeacherFlow slow request', JSON.stringify({ route, method: request.method, ms, ...memorySample() }));
}
