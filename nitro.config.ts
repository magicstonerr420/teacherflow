import { defineNitroConfig } from "nitro/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nitroRequire = createRequire(require.resolve("nitro/package.json"));

export default defineNitroConfig({
  preset: "node-server",
  noExternals: true,
  // Use tslib's native ESM helpers to avoid its CommonJS default-export wrapper.
  alias: { tslib: nitroRequire.resolve("tslib/tslib.es6.mjs") },
});
