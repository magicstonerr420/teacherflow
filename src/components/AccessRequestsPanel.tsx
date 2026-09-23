import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useAuth } from '@/hooks/useAuth';
import { listAccessRequests, reviewAccessRequest } from '@/lib/access-request.functions';
import type { AccessRequestRow, RequestStatus } from '@/lib/access-request';
import { Button } from './ui/button';

export function AccessRequestsPanel() {
  const {user} = useAuth(), cache = useQueryClient();
  const list = useServerFn(listAccessRequests), review = useServerFn(reviewAccessRequest);
  const [status, setStatus] = useState<RequestStatus>('pending'), [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const lock = useRef(false);
  const query = useQuery({queryKey: ['access-requests', user?.id, status, offset], queryFn: ({signal}) => list({data: {status, offset}, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])}), enabled: !!user, retry: false, refetchInterval: 60000});
  async function decide(row: AccessRequestRow, decision: 'approved' | 'declined') {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      await review({data: {id: row.id, revision: row.revision, decision}, signal: AbortSignal.timeout(15000)});
      setMessage(decision === 'approved' ? `${row.name} is approved. They can sign in as ${row.email} and use Check request status to activate their three-lesson invitation. No email was sent.` : `${row.name}'s request was declined. No invitation was created.`);
      await cache.invalidateQueries({queryKey: ['access-requests', user?.id]});
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save the decision. Refresh the list before retrying.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-5" aria-label="Beta access requests">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Beta access requests{query.data ? ` · ${query.data.pending} pending` : ''}</h2><p className="mt-1 text-sm text-muted-foreground">Review applications before granting generation access.</p></div><Button size="sm" variant="outline" disabled={busy || query.isFetching} onClick={() => void query.refetch()}>Refresh requests</Button></div>
    <p className="text-sm text-muted-foreground">Approval reserves an invitation for the applicant's email. They activate it after signing in. No automatic email is sent. Each teacher still has three lesson slots, and your shared beta budget stays in place.</p>
    <label className="flex max-w-xs flex-col gap-2 text-sm font-medium">Request status<select value={status} disabled={busy} onChange={event => {setStatus(event.target.value as RequestStatus); setOffset(0); setError('');}} className="h-10 rounded-md border bg-background px-3"><option value="pending">Pending</option><option value="approved">Approved</option><option value="declined">Declined</option></select></label>
    {message && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {query.isPending ? <p role="status">Loading requests…</p> : query.isError ? <p role="alert">Could not load requests. Use Refresh requests to try again.</p> : <>
      {!query.data.requests.length && <p className="text-sm text-muted-foreground">No {status} requests on this page.</p>}
      <div className="space-y-4">{query.data.requests.map(row => <article key={row.id} aria-label={`Request from ${row.name}`} className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="break-words font-semibold">{row.name}</h3><span className="rounded-full bg-muted px-2 py-1 text-xs capitalize">{row.status}</span></div><p className="break-all text-sm">{row.email}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{row.teaching}</p><p className="text-xs text-muted-foreground">Requested {new Date(row.created).toLocaleString()}{row.reviewed ? ` · Reviewed ${new Date(row.reviewed).toLocaleString()}` : ''}</p>{row.status === 'pending' && <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void decide(row, 'approved')}>Approve — 3 lessons</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void decide(row, 'declined')}>Decline request</Button></div>}</article>)}</div>
      {query.data.total > 50 && <div className="flex flex-wrap items-center gap-3"><Button variant="outline" size="sm" disabled={!offset || busy} onClick={() => setOffset(value => Math.max(0, value - 50))}>Previous page</Button><p className="text-sm">{offset + 1}–{Math.min(offset + 50, query.data.total)} of {query.data.total}</p><Button variant="outline" size="sm" disabled={offset + 50 >= query.data.total || busy} onClick={() => setOffset(value => value + 50)}>Next page</Button></div>}
    </>}
  </section>;
}
