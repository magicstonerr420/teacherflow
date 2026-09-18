import React from 'react';
import '../src/styles.css';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {createRouter,createRootRoute,createRoute,createMemoryHistory,Outlet,RouterProvider} from '@tanstack/react-router';
import {Route as Builder} from '../src/routes/builder';
import {Route as Lessons} from '../src/routes/lessons.index';
import {Route as Detail} from '../src/routes/lessons.$id';
import {Route as About} from '../src/routes/about';
import {BetaManagementPage} from '../src/components/BetaManagementPage';
import {Toaster} from '../src/components/ui/sonner';

export function mount(path='/builder') {
  const div=document.createElement('div');document.body.replaceChildren(div);
  const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const root=createRootRoute({component:()=> <QueryClientProvider client={cache}><Outlet/><Toaster/></QueryClientProvider>});
  const tree=root.addChildren([
    createRoute({getParentRoute:()=>root,path:'/builder',component:Builder.options.component}),
    createRoute({getParentRoute:()=>root,path:'/lessons/',component:Lessons.options.component}),
    createRoute({getParentRoute:()=>root,path:'/lessons/$id',component:Detail.options.component}),
    createRoute({getParentRoute:()=>root,path:'/about',component:About.options.component}),
    createRoute({getParentRoute:()=>root,path:'/beta-management',component:BetaManagementPage}),
  ]);
  const router=createRouter({routeTree:tree,history:createMemoryHistory({initialEntries:[path]})});
  (window as any).testRouter=router;
  createRoot(div).render(<RouterProvider router={router}/>);
}
