import React from 'react';
import {createRoot} from 'react-dom/client';
import {createRootRoute,createRouter,createMemoryHistory,RouterProvider} from '@tanstack/react-router';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {LessonPackageView} from '../src/components/lesson/LessonPackageView';
import '../src/styles.css';
export function mount(data:any){
 const div=document.createElement('div');document.body.replaceChildren(div);
 const route=createRootRoute({component:()=> <QueryClientProvider client={new QueryClient()}><LessonPackageView lesson={data.lesson} request={data.request} onPersist={async next=>{(window as any).persistedLesson=next;}}/></QueryClientProvider>});
 const router=createRouter({routeTree:route,history:createMemoryHistory({initialEntries:['/']})});
 createRoot(div).render(<RouterProvider router={router}/>);
}
