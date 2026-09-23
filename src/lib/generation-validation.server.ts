import { recordProviderEvent } from "./management-store.server.ts";

/** Repair only a fully returned result. Transport, billing and uncertainty errors propagate untouched. */
export async function generateValidated<T>(
  run: (issue?: string, previous?: unknown) => Promise<unknown>,
  validate: (value: unknown) => T,
  model: string,
): Promise<T> {
  let value = await run();
  try {
    return validate(value);
  } catch (error) {
    recordProviderEvent({
      model,
      kind: "text",
      event: "validation",
      ms: 0,
      detail: "Generated material needed a content or format repair.",
    });
    const issue =
      error instanceof Error
        ? error.message.slice(0, 1200)
        : "The result did not match the requested format.";
    value = await run(issue, value);
  }
  try {
    return validate(value);
  } catch (error) {
    recordProviderEvent({
      model,
      kind: "text",
      event: "validation",
      ms: 0,
      detail: "The repaired material still did not pass validation.",
    });
    throw error;
  }
}
