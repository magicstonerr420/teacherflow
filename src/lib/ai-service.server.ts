import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { TEACHERFLOW_MODEL } from "@/config/teacherflow-prompt";
import { requestOpenRouter } from "./openrouter.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";

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
 * Calls the Lovable AI Gateway and returns data validated against `schema`.
 * Always streamed: reasoning-class models routinely run for minutes.
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
  if (process.env["TEACHERFLOW_AI_PROVIDER"] && process.env["TEACHERFLOW_AI_PROVIDER"] !== "lovable") {
    throw new LessonGenerationError("config", "Unknown AI provider. Check TEACHERFLOW_AI_PROVIDER in the server settings.");
  }
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new LessonGenerationError("config", "The lesson generator is not configured yet.");
  }

  const jsonSchema = makeStrict(
    zodToJsonSchema(args.schema, { target: "openApi3", $refStrategy: "none" }),
  );

  let res: Response;
  try {
    res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: TEACHERFLOW_MODEL,
        instructions: args.system,
        input: args.input,
        stream: true,
        text: {
          format: {
            type: "json_schema",
            name: args.schemaName,
            strict: true,
            schema: jsonSchema,
          },
        },
      }),
    });
  } catch {
    throw new LessonGenerationError("network", "We could not reach the lesson generator.");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("AI gateway error", res.status, detail);
    if (res.status === 429) {
      throw new LessonGenerationError(
        "rate_limit",
        "The lesson generator is busy right now. Please wait a moment and try again.",
      );
    }
    if (res.status === 402 || res.status === 403) {
      throw new LessonGenerationError(
        "credits",
        "Lesson generation is temporarily unavailable on this account. Please add AI credits and try again.",
      );
    }
    throw new LessonGenerationError("upstream", "The lesson generator could not complete this request.");
  }

  const text = await readOutputText(res);
  if (!text.trim()) {
    throw new LessonGenerationError("empty", "The lesson generator returned an empty result. Please retry.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("Malformed AI payload", text.slice(0, 2000));
    throw new LessonGenerationError("malformed", "The lesson came back incomplete. Please try again.");
  }

  const result = args.schema.safeParse(parsed);
  if (!result.success) {
    console.error("Schema mismatch", result.error.message.slice(0, 2000));
    throw new LessonGenerationError("malformed", "The lesson came back incomplete. Please try again.");
  }
  return result.data;
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

async function readOutputText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  let completed = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string; output?: Array<Record<string, unknown>> };
        };
        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
          out += evt.delta;
        } else if (evt.type === "response.completed" && evt.response) {
          completed = evt.response.output_text ?? extractText(evt.response.output) ?? "";
        }
      } catch {
        // ignore keep-alive / non-JSON frames
      }
    }
  }
  return out || completed;
}

function extractText(output?: Array<Record<string, unknown>>): string | undefined {
  if (!output) return undefined;
  for (const item of output) {
    const content = item["content"];
    if (Array.isArray(content)) {
      for (const part of content) {
        const p = part as { type?: string; text?: string };
        if (p.type === "output_text" && typeof p.text === "string") return p.text;
      }
    }
  }
  return undefined;
}
