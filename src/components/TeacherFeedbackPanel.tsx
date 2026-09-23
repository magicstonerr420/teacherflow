import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { listTeacherFeedback } from '@/lib/teacher-tools.functions';
import { editingLabels, timeSavedLabels, wouldPayLabels } from '@/lib/teacher-tools';
import { useAuth } from '@/hooks/useAuth';
import { Button } from './ui/button';

export function TeacherFeedbackPanel() {
  const {user} = useAuth();
  const [offset,setOffset] = useState(0);
  const load = useServerFn(listTeacherFeedback);
  const feedback = useQuery({queryKey:['teacher-feedback',user?.id,offset],queryFn:()=>load({data:{offset}}),enabled:!!user});
  return <section className="space-y-4 rounded-xl border bg-card p-5" aria-label="Teacher lesson feedback">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Teacher lesson feedback</h2><Button size="sm" variant="outline" disabled={feedback.isFetching} onClick={()=>void feedback.refetch()}>Refresh feedback</Button></div>
    <p className="text-sm text-muted-foreground">Latest responses first. Each teacher can update their response for a lesson.</p>
    {feedback.isPending ? <p role="status">Loading teacher feedback…</p> : feedback.isError ? <p role="alert">Could not load teacher feedback. Try Refresh feedback.</p> : <>
      {!feedback.data.entries.length && <p className="text-sm">No feedback on this page yet. Teachers can give feedback from a saved lesson.</p>}
      {feedback.data.entries.map((entry,i)=><article key={entry.lessonId+':'+i} className="space-y-2 rounded-lg border p-4 text-sm">
        <h3 className="break-words font-semibold">{entry.topic} · {entry.level}</h3>
        <p className="break-all text-muted-foreground">{entry.teacher} · {new Date(entry.updatedAt).toLocaleString()}</p>
        <p>Used in class: <strong>{entry.usedInClass==='yes'?'Yes':'Not yet'}</strong> · Editing needed: <strong>{editingLabels[entry.editing]}</strong></p>
        <p>Preparation time saved: <strong>{entry.timeSaved ? timeSavedLabels[entry.timeSaved] : 'Not answered'}</strong></p>
        <p>Would pay to keep using TeacherFlow: <strong>{entry.wouldPay ? wouldPayLabels[entry.wouldPay] : 'Not answered'}</strong></p>
        <p className="whitespace-pre-wrap break-words">{entry.comment||'No additional comment.'}</p>
      </article>)}
      {(offset>0||feedback.data.more) && <div className="flex items-center gap-3"><Button variant="outline" disabled={offset===0} onClick={()=>setOffset(v=>Math.max(0,v-50))}>Previous feedback</Button><span className="text-sm">Page {offset/50+1}</span><Button variant="outline" disabled={!feedback.data.more} onClick={()=>setOffset(v=>v+50)}>More feedback</Button></div>}
    </>}
  </section>;
}
