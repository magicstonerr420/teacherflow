import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useAuth } from '@/hooks/useAuth';
import { loadUsage } from '@/lib/usage.functions';
import { PREVIEWS } from '@/lib/preview-catalog';
import { Button } from './ui/button';

export function UsagePanel() {
  const {user} = useAuth(), load = useServerFn(loadUsage);
  const [days, setDays] = useState<7 | 30>(30);
  const query = useQuery({queryKey: ['owner-usage', user?.id, days], queryFn: ({signal}) => load({data: {days}, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])}), enabled: !!user, retry: false});
  const data = query.data;
  return <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-5" aria-label="Beta usage">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Beta usage</h2><div className="flex items-center gap-3"><label className="text-sm">Period <select aria-label="Usage period" className="h-10 rounded-md border bg-background px-2" value={days} onChange={event => setDays(Number(event.target.value) as 7 | 30)}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select></label><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh usage</Button></div></div>
    {query.isPending ? <p role="status">Loading usage…</p> : query.isError ? <p role="alert">Could not load usage. Use Refresh usage to try again.</p> : data && <>
      <p className="text-sm text-muted-foreground">Tracking started {new Date(data.started).toLocaleDateString()}. Earlier visits and downloads are unavailable. Request and approval totals come from saved applications.</p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ['Visitor sessions', data.counts['visit'] || 0], ['Sessions viewing previews', data.counts['preview'] || 0],
        ['Access requests', data.applications.requested], ['Requests approved', data.applications.approved],
        ['Active teachers', data.milestones.active], ['First saved lessons observed', data.milestones.saved],
        ['First teacher downloads observed', data.milestones.download], ['Sessions downloading previews', data.counts['preview_download'] || 0],
      ].map(([label, value]) => <div key={label} className="rounded-lg border p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-3xl font-semibold">{value}</dd></div>)}</dl>
      <div className="space-y-2 rounded-lg bg-muted/50 p-4"><h3 className="font-semibold">Returned within seven days</h3><p className="text-2xl font-semibold">{data.retention.eligible ? Math.round(100 * data.retention.returned / data.retention.eligible) + '%' : 'Waiting for a full week'}</p><p className="text-sm">{data.retention.returned} of {data.retention.eligible} eligible teachers returned on a later UTC day within seven days of their first observed active visit. The cohort covers first visits in the selected period ending seven days ago, so every included teacher has a full seven-day observation window.</p></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-3 text-left font-semibold">Preview interest</caption><thead><tr className="border-b"><th className="p-2">Lesson</th><th className="p-2">Viewing sessions</th><th className="p-2">Download sessions</th></tr></thead><tbody>{PREVIEWS.map(preview => {const row = data.previews.find(item => item.target === preview.slug); return <tr key={preview.slug} className="border-b"><td className="p-2">{preview.level} · {preview.title}</td><td className="p-2">{row?.views || 0}</td><td className="p-2">{row?.downloads || 0}</td></tr>;})}</tbody></table></div>
      <p className="text-sm leading-relaxed text-muted-foreground">These stages use different units and are not a matched conversion rate. Visitor sessions use a temporary browser-session identifier and may include bots; they are not unique people. Signed-in teacher activity excludes the owner. Downloads count clicks, not confirmed file saves or classroom use. Browser tracking respects Do Not Track. No lesson text, email addresses or browsing URLs are stored in usage records; daily records are kept for 90 days.</p>
    </>}
  </section>;
}
