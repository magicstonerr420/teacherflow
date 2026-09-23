import { generationHealth, type HealthOperation } from "@/lib/generation-health";
import { PART_NAMES } from "@/lib/management";

const causeNames: Record<string, string> = {
  rate_limit: "Rate limit",
  connection: "Connection or service response",
  content: "Content or format validation",
  model_unavailable: "Model unavailable",
  queue: "Capacity wait expired",
  uncertain_charge: "Unconfirmed provider charge",
  provider_credit: "Provider balance or spending limit",
  budget: "Budget or price check",
  access: "Access rejected",
  allowance: "Lesson allowance or retry limit",
  unknown: "Cause not confirmed",
};

export function GenerationHealth({ operations }: { operations: readonly HealthOperation[] }) {
  const health = generationHealth(operations);
  const metrics = [
    ["Rate-limit rejections", health.rateLimited, "provider requests"],
    ["Connection / server failures", health.connectionFailures, "provider requests"],
    ["Validation issues", health.validationIssues, "server operations"],
    ["Successful recoveries", health.recovered, "server operations"],
    ["Queued requests", health.queued, "capacity waits"],
    ["Backup model selections", health.backups, "recorded switches"],
  ] as const;
  return (
    <section
      aria-label="Generation reliability"
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Generation reliability</h2>
        <p className="text-sm text-muted-foreground">
          Based on {health.serverOperations} server operations in the latest {health.tracked}{" "}
          tracked records (up to 1,000). {health.browserReports} browser reports excluded
          {health.nestedWrappers
            ? `; ${health.nestedWrappers} duplicate nested records combined`
            : ""}
          .
        </p>
        {health.firstStarted !== null && health.lastStarted !== null && (
          <p className="text-xs text-muted-foreground">
            Recorded start dates: {new Date(health.firstStarted).toLocaleString()} –{" "}
            {new Date(health.lastStarted).toLocaleString()}.
          </p>
        )}
      </div>
      {!health.serverOperations ? (
        <p className="text-sm text-muted-foreground">
          No server generation history is available yet.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {metrics.map(([label, value, unit]) => (
              <div key={label} className="rounded-lg bg-muted/50 p-3">
                <dt className="text-sm font-medium">{label}</dt>
                <dd className="mt-2 text-2xl font-semibold tabular-nums">
                  {value}
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {unit}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            {health.requests} recorded provider requests · {health.failed} confirmed failed
            operations · {health.interrupted} operations with no recorded completion ·{" "}
            {health.retries} retry notices. HTTP success means the provider accepted a request; it
            does not confirm valid lesson content.
          </p>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Requests by model ({health.models.length})
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {health.models.map((model) => (
                <article
                  key={model.model}
                  className="min-w-0 space-y-2 rounded-lg bg-muted/40 p-3 text-sm"
                >
                  <h3 className="break-all font-medium">{model.model}</h3>
                  <p>
                    {model.requests} requests · {model.accepted} accepted responses
                  </p>
                  <p className="text-muted-foreground">
                    {model.rateLimited} rate limited · {model.connectionFailures} connection/server
                    failures · {model.otherRejections} other rejections · {model.unknown} outcomes
                    unknown
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {model.queued} waits · {model.retries} retries · {model.backups} backup
                    selections · {model.validationEvents} validation events
                  </p>
                </article>
              ))}
            </div>
            {!health.models.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                No provider request details were recorded.
              </p>
            )}
          </details>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Failures by lesson part</h3>
              <ul className="space-y-2 text-sm">
                {health.parts
                  .filter((part) => part.failed || part.validationIssues)
                  .map((part) => (
                    <li key={part.part} className="rounded-lg bg-muted/40 p-3">
                      <span className="font-medium">{PART_NAMES[part.part] ?? part.part}</span>
                      <p className="text-muted-foreground">
                        {part.failed} failed of {part.operations} operations ·{" "}
                        {part.validationIssues} with validation issues · {part.recovered} recovered
                      </p>
                    </li>
                  ))}
              </ul>
              {!health.parts.some((part) => part.failed || part.validationIssues) && (
                <p className="text-sm text-muted-foreground">
                  No confirmed failures or validation issues in this sample.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Most common recorded causes</h3>
              <ul className="space-y-2 text-sm">
                {health.causes.map((cause) => (
                  <li
                    key={cause.category}
                    className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 p-3"
                  >
                    <span>{causeNames[cause.category] ?? cause.category.replaceAll("_", " ")}</span>
                    <span className="font-semibold tabular-nums">{cause.count}</span>
                  </li>
                ))}
              </ul>
              {!health.causes.length && (
                <p className="text-sm text-muted-foreground">
                  No confirmed failed operations in this sample.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                One recorded cause per failed operation. A diagnostic category does not establish
                the underlying cause.
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            This is a sample of tracked activity, not a complete history. Each operation keeps up to
            40 recent provider events; earlier attempts may be missing. Queue, retry, backup, and
            validation notices do not add provider requests.
          </p>
        </>
      )}
    </section>
  );
}
