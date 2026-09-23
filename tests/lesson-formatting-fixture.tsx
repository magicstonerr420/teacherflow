import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles.css';
import { ReadingPanel } from '../src/components/lesson/ReadingPanel';
import { WorksheetHub } from '../src/components/lesson/WorksheetHub';
import { StudentLessonView } from '../src/components/StudentLessonView';
import { LessonText } from '../src/components/lesson/LessonText';
import { ListeningPanel } from '../src/components/lesson/ListeningPanel';
export function mount(data: any) {
 const container=document.createElement('div');document.body.replaceChildren(container);
 createRoot(container).render(<div className="mx-auto max-w-4xl space-y-10 p-5">
  <section data-testid="reading"><ReadingPanel state={data.reading} request={data.request} busy={false} disabled={true} error={null} onGenerate={()=>{}} onOpenWorksheet={()=>{}} /></section>
  <section data-testid="worksheet"><WorksheetHub worksheet={data.worksheet} request={data.request} /></section>
  <section data-testid="dense"><LessonText>{data.dense}</LessonText></section>
  <section data-testid="listening"><ListeningPanel lesson={data.listeningLesson} request={data.request} onChange={async()=>{}} /></section>
  <section data-testid="shared"><StudentLessonView share={data.share} /></section>
 </div>);
}
