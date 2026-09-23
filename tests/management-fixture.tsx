import React from 'react';
import '../src/styles.css';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, createRootRoute, createRoute, createMemoryHistory, Outlet, RouterProvider } from '@tanstack/react-router';
import { BetaManagementPage } from '../src/components/BetaManagementPage';

export function mount(path = '/beta-management') {
  const div = document.createElement('div'); document.body.replaceChildren(div);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: () => <QueryClientProvider client={client}><Outlet /></QueryClientProvider> });
  const routeTree = root.addChildren([createRoute({ getParentRoute: () => root, path: '/beta-management', component: BetaManagementPage })]);
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
  (window as any).testRouter = router;
  createRoot(div).render(<RouterProvider router={router} />);
}
