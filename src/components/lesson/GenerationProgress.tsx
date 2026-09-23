import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { GENERATION_PHASES } from "@/lib/generation-plan";

export const PHASES = GENERATION_PHASES;

export type PhaseKey = (typeof PHASES)[number]["key"];

function StageWait({ durable }: { durable: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  return (
    <>
      <p aria-live="off" className="mt-2 text-xs text-muted-foreground tabular-nums">
        Time waiting for this part: {time}
      </p>
      {elapsed >= 60 && (
        <div role="status" className="mt-4 rounded-lg border bg-muted/40 p-4 text-sm">
          <p className="font-medium">This part is taking a while.</p>
          <p className="mt-1 text-muted-foreground">Keep this page open while we wait for the result.</p>
          <p className="mt-2 text-muted-foreground">
            {durable
              ? 'Completed parts are saved. If your connection drops, reopen this draft from My lessons → Unfinished to check the latest progress.'
              : 'Completed parts remain on this page. If the request fails, the builder will show the available recovery action.'}
          </p>
        </div>
      )}
    </>
  );
}

/** Progress reflects real application state: how many generation passes finished. */
export function GenerationProgress({ completed, current, durable = false }: { completed: number; current: PhaseKey | null; durable?: boolean }) {
  const total = PHASES.length;
  const value = Math.round((completed / total) * 100);

  return (
    <div className="mx-auto max-w-xl px-5 py-24">
      <h1 className="display-heading text-2xl">Building your class…</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Each part is generated and checked separately. This can take several minutes. {durable ? 'Completed parts are saved automatically. Keep this page open to continue through all parts.' : 'Please keep this page open.'}
      </p>
      <Progress value={value} className="mt-8" />
      <p className="mt-2 text-sm text-muted-foreground">{completed} of {total} parts completed.</p>
      {current && <StageWait key={current} durable={durable} />}
      <ul className="mt-8 space-y-3">
        {PHASES.map((phase, index) => {
          const done = index < completed;
          const active = phase.key === current;
          return (
            <li key={phase.key} className="flex gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                {done ? (
                  <Check className="size-4 text-primary" />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : (
                  <span className="size-2 rounded-full bg-border" />
                )}
              </span>
              <div className={cn("text-sm", done || active ? "text-foreground" : "text-muted-foreground")}>
                {phase.labels.map((label) => (
                  <p key={label}>{label}…</p>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
