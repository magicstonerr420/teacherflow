import React from 'react';
import '../src/styles.css';
import {createRoot} from 'react-dom/client';
import {BetaAccess} from '../src/components/BetaAccess';
import {AppShell} from '../src/components/AppShell';
import {BetaManagementPage} from '../src/components/BetaManagementPage';
import {MyProfilePage} from '../src/components/MyProfilePage';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {createRouter,createRootRoute,createRoute,createMemoryHistory,Outlet,RouterProvider} from '@tanstack/react-router';
export function mount(path='/beta-management'){
  const div=document.createElement('div');document.body.replaceChildren(div);
  const queryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const root=createRootRoute({component:()=> <QueryClientProvider client={queryClient}><Outlet/></QueryClientProvider>});
  const routeTree=root.addChildren([
    createRoute({getParentRoute:()=>root,path:'/beta-management',component:BetaManagementPage}),
    createRoute({getParentRoute:()=>root,path:'/profile',component:MyProfilePage}),
    createRoute({getParentRoute:()=>root,path:'/builder',component:()=> <AppShell><div className="mx-auto max-w-6xl p-4"><BetaAccess onOpen={()=>{}} onAccess={allowed=>{(window as any).access=allowed}}/></div></AppShell>}),
  ]);
  const router=createRouter({routeTree,history:createMemoryHistory({initialEntries:[path]})});
  (window as any).testRouter=router;
  createRoot(div).render(<RouterProvider router={router}/>);
}
