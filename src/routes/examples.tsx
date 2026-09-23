import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRight, BookOpen, Check, Headphones } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PREVIEWS, previewBase } from '@/lib/preview-catalog';
import type { PreviewPayload } from '@/components/lesson/PreviewLesson';

const PreviewLesson=lazy(()=>import('@/components/lesson/PreviewLesson'));
export const Route=createFileRoute('/examples')({
  validateSearch:(search:Record<string,unknown>):{lesson?:string}=>({...(typeof search['lesson']==='string'?{lesson:search['lesson']}:{})}),
  head:()=>({meta:[{title:'Free lesson previews | TeacherFlow'},{name:'description',content:'Explore eight complete English lesson examples, from A1 to C2. Worksheets, student slides, reading, audio and teacher guides. No account required.'}]}),
  component:Examples,
});
function Examples(){
  const {lesson:slug}=Route.useSearch();
  const preview=PREVIEWS.find(p=>p.slug===slug);
  const [loaded,setLoaded]=useState<{slug:string;data:PreviewPayload}|null>(null);
  const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!preview)return;
    const controller=new AbortController();let active=true;
    const timeout=setTimeout(()=>controller.abort(),20000);
    setError('');setLoaded(null);window.scrollTo({top:0});
    fetch(`${previewBase}${preview.slug}.json?v=${preview.hash}`,{signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error('Preview unavailable');return response.json() as Promise<PreviewPayload>;})
      .then(data=>{if(active)setLoaded({slug:preview.slug,data});})
      .catch(()=>{if(active)setError('This lesson could not be loaded. Please try again.');})
      .finally(()=>clearTimeout(timeout));
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[preview,retry]);
  return <AppShell><div className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
    {slug ? <><Link to="/examples" search={{}} className="mb-6 inline-block font-medium text-primary underline">← Browse all previews</Link>
      {!preview?<div role="alert" className="rounded-xl border p-6">That preview does not exist. Choose one of the eight lessons from the gallery.</div>
       :error?<div role="alert" className="space-y-4 rounded-xl border p-6"><p>{error}</p><Button onClick={()=>setRetry(v=>v+1)}>Retry preview</Button></div>
       :loaded?.slug===preview.slug?<Suspense fallback={<p role="status">Opening lesson materials…</p>}><PreviewLesson key={preview.slug} data={loaded.data} preview={preview}/></Suspense>:<p role="status">Loading {preview.title}…</p>}
    </>:<>
      <header className="mb-10 max-w-3xl space-y-5"><p className="text-sm font-semibold uppercase tracking-wider text-primary">See a complete class before you create one</p><h1 className="display-heading text-4xl sm:text-5xl">Start simple.<br/>See how far a lesson can go.</h1><p className="text-lg leading-relaxed text-muted-foreground">Eight complete English lessons, arranged from beginner to advanced. Explore different ages, skills and classroom setups—with every part ready to open.</p><div className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><span className="inline-flex items-center gap-2"><Check className="size-4 text-primary"/>No sign-in</span><span className="inline-flex items-center gap-2"><BookOpen className="size-4 text-primary"/>Readings & worksheets</span><span className="inline-flex items-center gap-2"><Headphones className="size-4 text-primary"/>Audio included</span></div></header>
      <div className="grid gap-5 md:grid-cols-2">{PREVIEWS.map(p=><article key={p.slug} className={`flex flex-col rounded-2xl border bg-card p-6 ${p.step===1?'border-primary/50 ring-1 ring-primary/20':''}`}><div className="mb-4 flex items-center justify-between"><span className="text-sm font-semibold text-muted-foreground">{String(p.step).padStart(2,'0')} / 08</span><Badge variant={p.step===1?'default':'secondary'}>{p.step===1?'Start here · ':''}{p.level}</Badge></div><h2 className="display-heading text-2xl">{p.title}</h2><p className="mt-2 text-sm text-muted-foreground">{p.age.startsWith('Adults')?p.age:`Ages ${p.age}`} · {p.minutes} minutes · {p.skill}</p><p className="mb-6 mt-4 flex-1 leading-relaxed">{p.summary}</p><Button variant={p.step===1?'default':'outline'} asChild><Link to="/examples" search={{lesson:p.slug}}>Explore lesson<ArrowRight className="size-4"/></Link></Button></article>)}</div>
      <p className="mt-7 max-w-3xl text-sm leading-relaxed text-muted-foreground">Difficulty follows language and task demands, not age alone. The adult restaurant lesson is still A2; later lessons ask for increasingly independent comparisons, arguments and evaluation. Choose the fit for your class.</p>
    </>}
  </div></AppShell>;
}
