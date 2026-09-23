import type { ManagedOperation, ProviderEvent } from "./management-store.server.ts";

export type HealthOperation = Pick<
  ManagedOperation,
  | "id"
  | "user"
  | "lesson"
  | "part"
  | "target"
  | "source"
  | "status"
  | "started"
  | "finished"
  | "failure"
  | "providers"
>;
export type ModelHealth = {
  model: string;
  requests: number;
  accepted: number;
  rateLimited: number;
  connectionFailures: number;
  otherRejections: number;
  unknown: number;
  queued: number;
  retries: number;
  backups: number;
  validationEvents: number;
};

export function providerEventLabel(event: ProviderEvent): string {
  if (event.event === "queued") return "Queued for capacity";
  if (event.event === "retry") return "Retry scheduled";
  if (event.event === "fallback") return "Backup model selected";
  if (event.event === "validation") return "Content validation failed";
  if (event.status && event.status >= 200 && event.status < 300)
    return `HTTP ${event.status} · Provider accepted request`;
  return event.status ? `HTTP ${event.status}` : "Request outcome not recorded";
}

function requestOutcome(event: ProviderEvent) {
  if (event.status === 429) return "rateLimited";
  if (
    event.status === 408 ||
    (event.status !== undefined && event.status >= 500 && event.status < 600)
  )
    return "connectionFailures";
  if (event.status !== undefined && event.status >= 200 && event.status < 300) return "accepted";
  if (event.status !== undefined && event.status >= 400) return "otherRejections";
  if (
    !event.status &&
    /fetch|network|connection|timed?\s*out|timeout|gateway/i.test(event.detail ?? "")
  )
    return "connectionFailures";
  return "unknown";
}

/** Summarizes recorded evidence, without treating browser reports or queue notices as provider failures. */
export function generationHealth(input: readonly HealthOperation[]) {
  const unique = [...new Map(input.map((row) => [row.id, row])).values()];
  const server = unique.filter((row) => row.source === "server");
  // A nested monitor can repeat the same outcome without owning a provider call.
  // Only collapse a strict enclosing interval for the same identified work and outcome.
  const operations = server.filter(
    (outer) =>
      outer.providers.length ||
      !server.some(
        (inner) =>
          inner.id !== outer.id &&
          inner.providers.length > 0 &&
          inner.user === outer.user &&
          inner.lesson === outer.lesson &&
          inner.part === outer.part &&
          inner.target === outer.target &&
          inner.status === outer.status &&
          outer.finished !== null &&
          inner.finished !== null &&
          outer.started <= inner.started &&
          outer.finished >= inner.finished &&
          (outer.started < inner.started || outer.finished > inner.finished),
      ),
  );
  const models = new Map<string, ModelHealth>();
  const parts = new Map<
    string,
    {
      part: string;
      operations: number;
      failed: number;
      recovered: number;
      validationIssues: number;
    }
  >();
  const causes = new Map<string, number>();
  let validationIssues = 0;
  for (const operation of operations) {
    const part = parts.get(operation.part) ?? {
      part: operation.part,
      operations: 0,
      failed: 0,
      recovered: 0,
      validationIssues: 0,
    };
    part.operations++;
    if (operation.status === "failed") {
      part.failed++;
      const category = operation.failure?.category ?? "unknown";
      causes.set(category, (causes.get(category) ?? 0) + 1);
    }
    if (operation.status === "recovered") part.recovered++;
    if (
      operation.providers.some((event) => event.event === "validation") ||
      (operation.status === "failed" && operation.failure?.category === "content")
    ) {
      validationIssues++;
      part.validationIssues++;
    }
    parts.set(operation.part, part);
    for (const event of operation.providers) {
      const modelName = event.model || "Model not recorded";
      const model = models.get(modelName) ?? {
        model: modelName,
        requests: 0,
        accepted: 0,
        rateLimited: 0,
        connectionFailures: 0,
        otherRejections: 0,
        unknown: 0,
        queued: 0,
        retries: 0,
        backups: 0,
        validationEvents: 0,
      };
      switch (event.event) {
        case "queued":
          model.queued++;
          break;
        case "retry":
          model.retries++;
          break;
        case "fallback":
          model.backups++;
          break;
        case "validation":
          model.validationEvents++;
          break;
        default:
          model.requests++;
          model[requestOutcome(event)]++;
      }
      models.set(modelName, model);
    }
  }
  const modelRows = [...models.values()].sort(
    (a, b) => b.requests - a.requests || a.model.localeCompare(b.model),
  );
  const sum = (key: Exclude<keyof ModelHealth, "model">) =>
    modelRows.reduce((total, model) => total + model[key], 0);
  return {
    tracked: unique.length,
    serverOperations: operations.length,
    browserReports: unique.filter((row) => row.source === "browser").length,
    nestedWrappers: server.length - operations.length,
    firstStarted: operations.length ? Math.min(...operations.map((row) => row.started)) : null,
    lastStarted: operations.length ? Math.max(...operations.map((row) => row.started)) : null,
    failed: operations.filter((row) => row.status === "failed").length,
    recovered: operations.filter((row) => row.status === "recovered").length,
    interrupted: operations.filter((row) => row.status === "interrupted").length,
    requests: sum("requests"),
    accepted: sum("accepted"),
    rateLimited: sum("rateLimited"),
    connectionFailures: sum("connectionFailures"),
    queued: sum("queued"),
    retries: sum("retries"),
    backups: sum("backups"),
    validationIssues,
    models: modelRows,
    parts: [...parts.values()].sort(
      (a, b) =>
        b.failed - a.failed ||
        b.validationIssues - a.validationIssues ||
        a.part.localeCompare(b.part),
    ),
    causes: [...causes.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
  };
}
