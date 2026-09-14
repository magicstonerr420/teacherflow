import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/** Local model edits take effect without dropping the teacher's running dev session. Hosted builds use server environment settings. */
export function modelSetting(name: "OPENROUTER_MODEL" | "OPENROUTER_IMAGE_MODEL", fallback: string) {
  if (process.env["NODE_ENV"] === "development") {
    try {
      const value = parseEnv(readFileSync(".env.local", "utf8"))[name]?.trim();
      if (value) return value;
    } catch { /* No local settings file on a hosted installation. */ }
  }
  return process.env[name]?.trim() || fallback;
}
