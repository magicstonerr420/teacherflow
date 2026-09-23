import { useMemo } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Download, BookOpen, Headphones, FileText } from 'lucide-react';
import { SectionBody } from './LessonPackageView';
import { SECTIONS, type SectionKey } from '@/lib/lesson-sections';
import { PreviewPager } from './PreviewNavigation';
import { WorksheetHub } from './WorksheetHub';
import { SlidePreview } from './PresentationPanel';
import { ListeningAudioPlayer } from './ListeningAudioPlayer';
import { LessonText } from './LessonText';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { LessonPackage, LessonRequestInput } from '@/lib/lesson-schema';
import { runQualityControl } from '@/lib/quality';
import { studentPresentationSlide } from '@/lib/presentation-audience';
import { bandOfRequest, themeFor } from '@/lib/pptx';
import { isYoungA1 } from '@/lib/young-learners';
import { PREVIEWS, previewBase, type Preview } from '@/lib/preview-catalog';
import { cn } from '@/lib/utils';

export type PreviewPayload = { request: LessonRequestInput; lesson: LessonPackage };

export default function PreviewLesson({ data, preview, section = 'overview' }: { data: PreviewPayload; preview: Preview; section?: SectionKey }) {
  const { lesson, request } = data;
  const active = section;
  const navigate = useNavigate();
  const setActive = (section: SectionKey) => void navigate({ to: '/examples', search: { lesson: preview.slug, section }, replace: true, resetScroll: false });
  const checks = useMemo(() => runQualityControl(lesson, request), [lesson, request]);
  const asset = (suffix: string) => `${previewBase}${preview.slug}${suffix}?v=${preview.hash}`;
  const reading = lesson.reading?.status === 'ready' ? lesson.reading.value : null;
  const listening = lesson.listening?.status === 'ready' ? lesson.listening.value : null;
  return <article data-preview={preview.slug} className="space-y-7">
    <header className="space-y-4 rounded-2xl border bg-card p-5 sm:p-7">
      <p className="text-sm font-semibold text-primary">Preview {preview.step} of {PREVIEWS.length} · Ready to explore</p>
      <h1 className="display-heading text-3xl sm:text-4xl">{preview.title}</h1>
      <div className="flex flex-wrap gap-2"><Badge>{preview.level}</Badge><Badge variant="secondary">{preview.age.startsWith('Adults') ? preview.age : `Ages ${preview.age}`}</Badge><Badge variant="outline">{preview.minutes} minutes</Badge><Badge variant="outline">{preview.skill}</Badge></div>
      <p className="max-w-3xl text-muted-foreground">{preview.summary}</p>
      <div className="flex flex-wrap gap-3">
        <Button asChild><a href={asset('.zip')} download><Download className="size-4"/>Download complete lesson</a></Button>
        <Button asChild variant="outline"><a href={asset('-guide.pdf')} download><FileText className="size-4"/>Complete teacher guide</a></Button>
      </div>
      <p className="text-sm text-muted-foreground">Includes worksheets A/B, answer keys, student PowerPoint, teacher guides and an MP3. These previews are free to explore and download.</p>
      <div className="flex flex-wrap items-center gap-3 border-t pt-4"><p className="text-sm">Want to create a lesson for your own class?</p><Button asChild variant="outline" size="sm"><Link to="/request-access">Request beta access</Link></Button></div>
    </header>
    <div className="grid items-start gap-6 lg:grid-cols-[205px_minmax(0,1fr)]">
      <aside>
        <label className="flex flex-col gap-2 text-sm font-semibold lg:hidden">Explore this lesson
          <select className="rounded-lg border bg-card p-3" value={active} onChange={event => setActive(event.target.value as SectionKey)}>{SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </label>
        <nav aria-label="Lesson sections" className="sticky top-24 hidden space-y-1 rounded-xl border bg-card p-2 lg:block">{SECTIONS.map(s => <button key={s.key} onClick={() => setActive(s.key)} aria-current={active === s.key ? 'page' : undefined} className={cn('block w-full rounded-md px-3 py-2 text-left text-sm', active === s.key ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-accent')}>{s.label}</button>)}</nav>
      </aside>
      <section className="min-w-0 space-y-5" aria-label={SECTIONS.find(s => s.key === active)?.label}>
        <h2 className="display-heading border-l-4 border-primary pl-3 text-2xl">{SECTIONS.find(s => s.key === active)?.label}</h2>
        {active === 'worksheet' ? <WorksheetHub worksheet={lesson.worksheet} request={request} answerKey={lesson.answerKey} readOnly />
        : active === 'presentation' ? <>
          <div className="flex flex-wrap gap-3"><Button asChild><a download href={asset('.pptx')}>Download student PowerPoint</a></Button><Button asChild variant="outline"><a download href={asset('-slides-guide.pdf')}>Presentation teacher guide</a></Button></div>
          <p className="text-sm text-muted-foreground">Student slides are shown below. Teaching notes are in the separate guide. For a class without technology, print the slides and use the supplied cards.</p>
          <div className="grid gap-5 xl:grid-cols-2">{lesson.presentation.slides.map(slide => <SlidePreview key={slide.number} slide={studentPresentationSlide(slide)} theme={themeFor(bandOfRequest(request))} young={isYoungA1(request)} />)}</div>
        </> : active === 'reading' && reading ? <>
          <div className="space-y-5 rounded-xl border bg-card p-5 sm:p-7"><BookOpen className="text-primary"/><h3 className="display-heading text-xl">{reading.title}</h3><p className="text-sm text-muted-foreground">{reading.instructions}</p><div className="text-base"><LessonText>{reading.text}</LessonText></div></div>
          <QuestionList questions={reading.questions.map(q=>({question:q.question,choices:q.choices}))} />
          <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer font-semibold">Teacher answers and evidence</summary><ol className="mt-4 list-decimal space-y-4 pl-5">{reading.answers.map((a,i)=><li key={i}><LessonText>{a}</LessonText><p className="mt-2 text-sm text-muted-foreground">Evidence: {reading.questions[i]?.evidence}</p></li>)}</ol></details>
        </> : active === 'listening' && listening ? <>
          <div className="space-y-3 rounded-xl border bg-card p-5"><Headphones className="text-primary"/><h3 className="display-heading text-xl">{listening.title}</h3><LessonText>{listening.instructions}</LessonText><p className="text-sm text-muted-foreground">{listening.teacherGuidance}</p></div>
          <ListeningAudioPlayer src={asset('.mp3')} downloadName={`${preview.slug}.mp3`} />
          <QuestionList questions={listening.questions} />
          <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer font-semibold">Teacher transcript and answers</summary><div className="mt-5"><LessonText>{listening.script}</LessonText></div><ol className="mt-5 list-decimal space-y-4 pl-5">{listening.questions.map((q,i)=><li key={i}><LessonText>{q.answer}</LessonText><p className="mt-1 text-sm text-muted-foreground">Evidence: {q.evidence}</p></li>)}</ol></details>
        </> : <SectionBody sectionKey={active} lesson={lesson} request={request} checks={checks} />}
      </section>
    </div>
    <PreviewPager preview={preview} section={active}/>
  </article>;
}

function QuestionList({questions}:{questions:{question:string;choices:readonly string[]}[]}){
  return <div className="rounded-xl border bg-card p-5"><h3 className="mb-4 font-semibold">Your questions</h3><ol className="list-decimal space-y-5 pl-5">{questions.map((q,i)=><li key={i}><LessonText>{q.question}</LessonText>{q.choices.length>0&&<ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{q.choices.map(c=><li key={c}>{c}</li>)}</ul>}</li>)}</ol></div>;
}
