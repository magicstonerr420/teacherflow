import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  preset: "node-server",
  // Keep the PC build self-contained instead of tracing parent directories.
  noExternals: true,
});
