import React from 'react';
import {createRoot} from 'react-dom/client';
import {PresentationActions} from '../src/components/lesson/PresentationPanel';
import '../src/styles.css';
export function mount(data: any) {
  const div=document.createElement('div');document.body.replaceChildren(div);
  createRoot(div).render(<PresentationActions lesson={data.lesson} request={data.request}/>);
}
