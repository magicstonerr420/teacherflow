import React from 'react';
import '../src/styles.css';
import {createRoot} from 'react-dom/client';
import {BetaAccess} from '../src/components/BetaAccess';
import {createRouter,createRootRoute,RouterProvider} from '@tanstack/react-router';
export function mount(){
  const div=document.createElement('div');document.body.replaceChildren(div);
  const routeTree=createRootRoute({component:()=> <main className="mx-auto max-w-6xl p-4"><BetaAccess onOpen={()=>{}} onAccess={allowed=>{(window as any).access=allowed}}/></main>});
  createRoot(div).render(<RouterProvider router={createRouter({routeTree})}/>);
}
