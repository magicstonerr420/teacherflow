import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import '../src/styles.css';
import { WorksheetHub } from '../src/components/lesson/WorksheetHub';
import { PresentationActions } from '../src/components/lesson/PresentationPanel';
import { ReadingPanel } from '../src/components/lesson/ReadingPanel';
import { ListeningAudioPlayer } from '../src/components/lesson/ListeningAudioPlayer';
let root: Root;
export function mount(data: any) {
  if (!root) { const div = document.createElement('div'); document.body.replaceChildren(div); root = createRoot(div); }
  root.render(<main className="mx-auto max-w-5xl space-y-12 p-5">
    <section aria-label="Reading test"><ReadingPanel state={data.lesson.reading} request={data.request} busy={false} disabled={false} error={null} onGenerate={() => {}} onOpenWorksheet={() => {}} /></section>
    <section aria-label="Worksheet test"><WorksheetHub worksheet={data.lesson.worksheet} request={data.request} /></section>
    <section aria-label="Presentation test"><PresentationActions lesson={data.lesson} request={data.request} /></section>
    {data.audio && <ListeningAudioPlayer src={data.audio} downloadName="American-English.mp3" />}
  </main>);
}
