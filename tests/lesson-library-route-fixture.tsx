import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Route } from "../src/routes/lessons.index";
import "../src/styles.css";

export function mount() {
  (window as any).fixtureReact = React;
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  (window as any).fixtureCache = cache;
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={cache}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: "/lessons",
        component: Route.options.component,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/lessons/$id",
        component: () => <h1>Saved lesson</h1>,
      }),
      createRoute({
        getParentRoute: () => root,
        path: "/builder",
        component: () => <h1>Build a lesson</h1>,
      }),
      createRoute({ getParentRoute: () => root, path: "/auth", component: () => <h1>Sign in</h1> }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/lessons"] }),
  });
  createRoot(container).render(<RouterProvider router={router} />);
}
