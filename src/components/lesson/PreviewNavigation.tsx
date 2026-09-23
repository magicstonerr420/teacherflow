import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PREVIEWS, type Preview } from '@/lib/preview-catalog';
import type { SectionKey } from '@/lib/lesson-sections';

type Props = { preview: Preview; section: SectionKey };

export function PreviewNavigation({ preview, section }: Props) {
  const navigate = useNavigate();
  const previous = PREVIEWS.find(p => p.step === preview.step - 1);
  const next = PREVIEWS.find(p => p.step === preview.step + 1);

  return <nav aria-label="Preview lesson navigation" className="mb-7 grid grid-cols-2 items-end gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
    <label className="col-span-2 flex min-w-0 flex-col gap-2 text-sm font-semibold sm:col-span-1 sm:col-start-2 sm:row-start-1">
      Choose a preview lesson
      <select
        className="h-10 w-full min-w-0 rounded-md border bg-background px-3 font-normal"
        value={preview.slug}
        onChange={event => void navigate({ to: '/examples', search: { lesson: event.target.value, section } })}
      >
        {PREVIEWS.map(p => <option key={p.slug} value={p.slug}>{p.step}. {p.title} · {p.level} · {p.age.startsWith('Adults') ? p.age : `Ages ${p.age}`}</option>)}
      </select>
    </label>
    {previous ? <Button asChild variant="outline" className="sm:col-start-1 sm:row-start-1">
      <Link to="/examples" search={{ lesson: previous.slug, section }} aria-label={`Previous lesson: ${previous.title}`}><ArrowLeft className="size-4"/>Previous</Link>
    </Button> : <Button variant="outline" disabled className="sm:col-start-1 sm:row-start-1"><ArrowLeft className="size-4"/>First lesson</Button>}
    {next ? <Button asChild variant="outline" className="sm:col-start-3 sm:row-start-1">
      <Link to="/examples" search={{ lesson: next.slug, section }} aria-label={`Next lesson: ${next.title}`}>Next<ArrowRight className="size-4"/></Link>
    </Button> : <Button variant="outline" disabled className="sm:col-start-3 sm:row-start-1">Last lesson<ArrowRight className="size-4"/></Button>}
  </nav>;
}

export function PreviewPager({ preview, section }: Props) {
  const previous = PREVIEWS.find(p => p.step === preview.step - 1);
  const next = PREVIEWS.find(p => p.step === preview.step + 1);
  const card = 'flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent';
  return <footer className="space-y-4 border-t py-7">
    <nav aria-label="Continue preview lessons" className="grid gap-3 sm:grid-cols-2">
      {previous && <Link to="/examples" search={{ lesson: previous.slug, section }} className={card}>
        <ArrowLeft className="size-5 shrink-0"/><span className="min-w-0"><span className="block text-sm text-muted-foreground">Previous · {previous.level}</span><span className="font-semibold">{previous.title}</span></span>
      </Link>}
      {next ? <Link to="/examples" search={{ lesson: next.slug, section }} className={`${card} ${!previous ? 'sm:col-start-2' : ''}`}>
        <span className="min-w-0 flex-1"><span className="block text-sm text-muted-foreground">Next · {next.level}</span><span className="font-semibold">{next.title}</span></span><ArrowRight className="size-5 shrink-0"/>
      </Link> : <p className="self-center text-sm text-muted-foreground">You’ve reached the final preview. Revisit any lesson using the selector above or browse the full collection.</p>}
    </nav>
    <Link className="inline-block font-semibold text-primary underline" to="/examples" search={{}}>All eight previews</Link>
  </footer>;
}
