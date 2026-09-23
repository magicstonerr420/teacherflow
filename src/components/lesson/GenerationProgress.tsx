import { Check, Loader2 } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { GENERATION_PHASES } from "@/lib/generation-plan";

export const PHASES = GENERATION_PHASES;

export type PhaseKey = (typeof PHASES)[number]["key"];

/** Progress reflects real application state: how many generation passes finished. */
export function GenerationProgress({ completed, current, durable = false }: { completed: number; current: PhaseKey | null; durable?: boolean }) {
  const total = PHASES.length;
  const value = Math.round(((completed + (current ? 0.5 : 0)) / total) * 100);

  return (
    <div className="mx-auto max-w-xl px-5 py-24">
      <h1 className="display-heading text-2xl">Building your class…</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Each part is generated and checked separately. This can take several minutes. {durable ? 'Completed parts are saved automatically. Keep this page open to continue through all parts.' : 'Please keep this page open.'}
      </p>
      <Progress value={value} className="mt-8" />
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
