import React from 'react';
import '../src/styles.css';
import {createRoot} from 'react-dom/client';
import {LessonPackageView} from '../src/components/lesson/LessonPackageView';
import {createRouter, createRootRoute, RouterProvider} from '@tanstack/react-router';
export function mount(data: any) {
  const div=document.createElement('div'); document.body.replaceChildren(div);
  const routeTree=createRootRoute({component:()=> <LessonPackageView lesson={data.lesson} request={data.request} onPersist={async next=>{(window as any).readingSaved=next}} />});
  const router=createRouter({routeTree});
  createRoot(div).render(<RouterProvider router={router} />);
}
