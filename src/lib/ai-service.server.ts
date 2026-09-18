import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { requestOpenRouter } from "./openrouter.server";


export class LessonGenerationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Makes a JSON schema strict-compatible for the Responses API. */
function makeStrict(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(makeStrict);
  if (!node || typeof node !== "object") return node;
  const obj = { ...(node as Record<string, unknown>) };
  delete obj["default"];
  delete obj["$schema"];
  if (obj["type"] === "object" && obj["properties"] && typeof obj["properties"] === "object") {
    const props = obj["properties"] as Record<string, unknown>;
    for (const key of Object.keys(props)) props[key] = makeStrict(props[key]);
    obj["required"] = Object.keys(props);
    obj["additionalProperties"] = false;
    return obj;
  }
  for (const key of Object.keys(obj)) {
    if (key === "properties") continue;
    obj[key] = makeStrict(obj[key]);
  }
  return obj;
}

/**
 * Uses the configured independent AI provider and validates the returned data.
 */
export async function generateStructured<T extends z.ZodTypeAny>(args: {
  schema: T;
  schemaName: string;
  system: string;
  input: string;
}): Promise<z.infer<T>> {
  if (process.env["TEACHERFLOW_AI_PROVIDER"] === "openrouter") {
    try {
      const data = await requestOpenRouter({
        ...args,
        schema: makeStrict(zodToJsonSchema(args.schema, { $refStrategy: "none" })),
      });
      const result = args.schema.safeParse(data);
      if (!result.success) {
        console.warn("TeacherFlow schema validation failed", { section: args.schemaName, fields: result.error.issues.map(issue => issue.path.join(".")) });
        throw new Error("The AI response was readable, but required fields were missing or had the wrong type. Retry this part; completed parts are retained.");
      }
      return result.data;
    } catch (error) {
      throw new LessonGenerationError("openrouter", error instanceof Error ? error.message : "OpenRouter generation failed.");
    }
  }
  if (process.env["TEACHERFLOW_AI_PROVIDER"] === "ollama") {
    return generateLocal(args);
  }
  throw new LessonGenerationError("config", "Configure TEACHERFLOW_AI_PROVIDER as openrouter or ollama in the server settings.");
}

/** Local inference: schema-constrained output, validated before it reaches the UI. */
async function generateLocal<T extends z.ZodTypeAny>(args: {
  schema: T;
  schemaName: string;
  system: string;
  input: string;
}): Promise<z.infer<T>> {
  const base = process.env["OLLAMA_BASE_URL"] || "http://127.0.0.1:11434";
  const model = process.env["OLLAMA_MODEL"] || "qwen3:8b";
  const schema = zodToJsonSchema(args.schema, { $refStrategy: "none" });
  let repair = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15 * 60 * 1000),
        body: JSON.stringify({
          model,
          think: false,
          stream: true,
          format: schema,
          messages: [
            { role: "system", content: args.system },
            { role: "user", content: `${args.input}\n\nReturn only JSON matching this schema. Honor every minimum array length and required field:\n${JSON.stringify(schema)}${repair}` },
          ],
          options: { temperature: 0.3, num_ctx: 32768, num_predict: 12000 },
          keep_alive: "15m",
        }),
      });
    } catch {
      throw new LessonGenerationError("network", "The local model is not responding. Open Start TeacherFlow and try again.");
    }
    if (!response.ok || !response.body) {
      throw new LessonGenerationError("config", `The local model could not start (status ${response.status}). Check that ${model} has finished downloading.`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let output = "";
    let complete = false;
    const consume = (line: string) => {
      if (!line.trim()) return;
      const chunk = JSON.parse(line);
      if (chunk.error) throw new LessonGenerationError("upstream", "The local model stopped unexpectedly. Check the local model log and retry.");
      output += chunk.message?.content ?? "";
      if (chunk.done) complete = true;
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) consume(line);
      }
      consume(pending + decoder.decode());
    } finally {
      reader.releaseLock();
    }
    let parsed: unknown;
    try { parsed = JSON.parse(output); } catch { parsed = null; }
    const result = args.schema.safeParse(parsed);
    if (complete && result.success) return result.data;
    repair = `\n\nThe previous attempt did not validate. Generate the entire corrected JSON again. Issues: ${result.success ? "Output was interrupted" : result.error.message.slice(0, 4000)}`;
  }
  throw new LessonGenerationError("malformed", "The local model returned an incomplete lesson section. Please retry this section.");
}

