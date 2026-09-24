import "./lib/error-capture";
import { startManagementWorker } from './lib/management-alerts.server';
import { startApprovalEmailWorker } from './lib/approval-email.server';
import { configureHostedAuth } from "./lib/hosting-env.server";
import { startRuntimeDiagnostics, reportSlowServerRequest } from './lib/runtime-diagnostics.server';

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const startedAt = performance.now();
    try {
      startRuntimeDiagnostics();
      configureHostedAuth();
      startManagementWorker();
      startApprovalEmailWorker();
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      if (new URL(request.url).pathname.startsWith("/share/")) {
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        response.headers.set("Referrer-Policy", "no-referrer");
      } else if (response.headers.get("content-type")?.includes("text/html")) {
        response.headers.set("Cache-Control", "no-cache");
      }
      // Nitro strips HEAD bodies without canceling the TanStack SSR stream.
      // Release its renderer, router state and lifetime timer before that happens.
      if (request.method === "HEAD" && response.body) {
        await response.body.cancel();
        return new Response(null, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } finally {
      reportSlowServerRequest(request, startedAt);
    }
  },
};
