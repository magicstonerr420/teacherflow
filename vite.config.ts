import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => ({
  cacheDir: ".local-runtime/vite-app",
  // Only explicitly public variables may enter the browser bundle.
  define: Object.fromEntries(Object.entries(loadEnv(mode, process.cwd(), "VITE_"))
    .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])),
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      importProtection: { behavior: "error", client: { files: ["**/server/**"], specifiers: ["server-only"] } },
    }),
    ...(command === "build" ? [nitro({ preset: "node-server" })] : []),
    react(),
  ],
}));
