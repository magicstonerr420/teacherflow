import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { ArrowRight, FileClock, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { GENERATION_PHASES } from '@/lib/generation-plan';
import { listLessonDrafts } from '@/lib/lesson-drafts.functions';

/** This query is account-specific, and never displays a previous account's data. */
export function UnfinishedLessons({ userId }: { userId: string | undefined }) {
  const fetchDrafts = useServerFn(listLessonDrafts);
  const drafts = useQuery({
    queryKey: ['lesson-drafts', userId],
    queryFn: () => fetchDrafts(),
    enabled: !!userId,
    retry: 1,
    refetchInterval: 15_000,
  });

  if (!userId) return null;

  return <section aria-labelledby="unfinished-lessons-heading" className="mt-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <h2 id="unfinished-lessons-heading" className="text-xl font-semibold">Unfinished lessons</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Your class settings and completed parts are saved as you build. Continue a lesson here to keep its progress and use its existing lesson allowance.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => void drafts.refetch()} disabled={drafts.isFetching}>
        <RefreshCw className="size-4" />Refresh unfinished lessons
      </Button>
    </div>

    {drafts.isPending && <div role="status" aria-label="Loading unfinished lessons" className="space-y-3">
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-36 w-full" />
    </div>}

    {drafts.isError && <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-5">
      <p className="text-sm">We could not load your unfinished lessons. Your saved lessons are still available in All lessons.</p>
      <Button variant="outline" size="sm" onClick={() => void drafts.refetch()} disabled={drafts.isFetching}>Retry unfinished lessons</Button>
    </div>}

    {!drafts.isPending && !drafts.isError && drafts.data?.length === 0 && <div className="rounded-xl border border-dashed px-5 py-10 text-center">
      <FileClock className="mx-auto size-6 text-muted-foreground" />
      <p className="mt-4 font-medium">No unfinished lessons</p>
      <p className="mt-1 text-sm text-muted-foreground">Lessons still being built or waiting to finish saving will appear here. Completed lessons are saved to your library automatically.</p>
    </div>}

    <div className="space-y-4">
      {drafts.data?.map(draft => {
        const complete = draft.status === 'complete';
        const active = draft.status === 'generating' && !!draft.activeUntil && draft.activeUntil > Date.now();
        const completed = GENERATION_PHASES.filter(phase => draft.completedStages.includes(phase.key)).length;
        const status = complete ? 'Ready to save' : active ? 'Generating' : draft.status === 'failed' ? 'Needs retry' : 'Ready to continue';
        const nextLabel = GENERATION_PHASES.find(phase => phase.key === draft.nextStage)?.labels[0];
        return <article key={draft.id} aria-label={draft.request.topic} className="space-y-4 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 basis-48">
              <h3 className="break-words font-semibold">{draft.request.topic}</h3>
              <p className="mt-1 text-sm text-muted-foreground">Last saved {new Date(draft.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
            <Badge variant="secondary">{status}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{draft.request.level}</Badge>
            <Badge variant="outline">Ages {draft.request.studentAge}</Badge>
            <Badge variant="outline">{draft.request.durationMinutes} min</Badge>
            <Badge variant="outline">{draft.request.mainSkill}</Badge>
          </div>
          <div className="space-y-2">
            <p className="text-sm">{completed} of {GENERATION_PHASES.length} parts completed</p>
            <Progress value={completed / GENERATION_PHASES.length * 100} aria-label={`${draft.request.topic}: ${completed} of ${GENERATION_PHASES.length} parts completed`} />
            <p className="text-sm text-muted-foreground">
              {complete ? 'Generation is complete. Reopen this lesson to finish saving it to My lessons.' : active ? 'A part is being generated. Open the lesson to check its progress.' : nextLabel ? `Continue with: ${nextLabel}.` : 'Open this lesson to continue from its saved progress.'}
            </p>
          </div>
          <Button variant={complete ? 'default' : 'outline'} asChild className="max-w-full whitespace-normal">
            <Link to="/builder" search={{ draft: draft.id }}>
              {complete ? 'Finish saving lesson' : active ? 'Open unfinished lesson' : 'Continue unfinished lesson'}<ArrowRight className="size-4 shrink-0" />
            </Link>
          </Button>
        </article>;
      })}
    </div>
  </section>;
}
