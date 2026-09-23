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
import { ClassLessonLibrary } from "../src/components/ClassLessonLibrary";
import "../src/styles.css";

export function mount() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Library() {
    const [userId, setUserId] = React.useState<string | undefined>("teacher-a");
    (window as any).setLibraryUser = setUserId;
    return (
      <div className="mx-auto max-w-4xl px-5 py-12">
        <ClassLessonLibrary userId={userId} />
      </div>
    );
  }
  const root = createRootRoute({
    component: () => (
      <QueryClientProvider client={cache}>
        <Outlet />
      </QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "/lessons", component: Library }),
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
    ]),
    history: createMemoryHistory({ initialEntries: ["/lessons"] }),
  });
  createRoot(container).render(<RouterProvider router={router} />);
}
