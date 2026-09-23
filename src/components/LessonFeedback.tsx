import { useState, useEffect, useId } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getLessonFeedback, submitLessonFeedback } from '@/lib/teacher-tools.functions';
import { editingLabels, timeSavedLabels, wouldPayLabels, type LessonFeedback as Feedback } from '@/lib/teacher-tools';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from './ui/dialog';

export function LessonFeedback({lessonId}:{lessonId:string}) {
  const {user} = useAuth();
  const uid = useId();
  const [open,setOpen] = useState(false);
  const [used,setUsed] = useState<Feedback['usedInClass']|''>('');
  const [editing,setEditing] = useState<Feedback['editing']|''>('');
  const [comment,setComment] = useState('');
  const [timeSaved,setTimeSaved] = useState<NonNullable<Feedback['timeSaved']>|''>('');
  const [wouldPay,setWouldPay] = useState<NonNullable<Feedback['wouldPay']>|''>('');
  const load = useServerFn(getLessonFeedback), submit = useServerFn(submitLessonFeedback);
  const cache = useQueryClient();
  const queryKey = ['lesson-feedback',user?.id,lessonId];
  const feedback = useQuery({queryKey,queryFn:()=>load({data:{lessonId}}),enabled:open&&!!user,refetchOnWindowFocus:false});
  useEffect(()=>{if(feedback.isSuccess){setUsed(feedback.data?.usedInClass??'');setEditing(feedback.data?.editing??'');setComment(feedback.data?.comment??'');setTimeSaved(feedback.data?.timeSaved??'');setWouldPay(feedback.data?.wouldPay??'');}},[feedback.data,feedback.isSuccess]);
  const save = useMutation({
    mutationFn:async()=>{if(!used||!editing||!timeSaved||!wouldPay)throw new Error('Please answer all four questions.');return submit({data:{lessonId,usedInClass:used,editing,timeSaved,wouldPay,comment}});},
    onSuccess:async()=>{await cache.invalidateQueries({queryKey});await cache.invalidateQueries({queryKey:['teacher-feedback']});setOpen(false);toast.success('Thank you. Your lesson feedback was saved.');},
    onError:(error)=>toast.error(error.message),
  });
  return <Dialog open={open} onOpenChange={next=>{if(!save.isPending)setOpen(next);}}>
    <DialogTrigger asChild><Button variant="outline" type="button">Give lesson feedback</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>How was this lesson?</DialogTitle><DialogDescription>Your answers, lesson topic, and account email are shared privately with the TeacherFlow owner to help improve the product.</DialogDescription></DialogHeader>
      {feedback.isPending ? <p role="status">Loading feedback…</p> : feedback.isError ? <p role="alert">Could not load your feedback. <Button variant="outline" onClick={()=>void feedback.refetch()}>Retry feedback</Button></p> :
        <form className="space-y-5" onSubmit={e=>{e.preventDefault();save.mutate();}}>
          <fieldset disabled={save.isPending} className="space-y-2"><legend className="mb-2 text-sm font-medium">Did you use it in class?</legend>
            {([['yes','Yes'],['not_yet','Not yet']] as const).map(([value,label])=><label key={value} className="mr-5 inline-flex items-center gap-2 text-sm"><input type="radio" name={uid+'-used'} value={value} checked={used===value} onChange={()=>setUsed(value)} required />{label}</label>)}
          </fieldset>
          <fieldset disabled={save.isPending} className="space-y-2"><legend className="mb-2 text-sm font-medium">How much editing did it need?</legend>
            {(Object.entries(editingLabels) as [Feedback['editing'],string][]).map(([value,label])=><label key={value} className="mr-5 inline-flex items-center gap-2 text-sm"><input type="radio" name={uid+'-editing'} value={value} checked={editing===value} onChange={()=>setEditing(value)} required />{label}</label>)}
          </fieldset>
          <div className="space-y-2"><Label htmlFor={uid+'-time'}>How much preparation time did TeacherFlow save for this lesson?</Label><select id={uid+'-time'} value={timeSaved} required disabled={save.isPending} onChange={e=>setTimeSaved(e.target.value as NonNullable<Feedback['timeSaved']>)} className="h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm"><option value="" disabled>Choose an estimate</option>{Object.entries(timeSavedLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor={uid+'-pay'}>Would you pay to keep using TeacherFlow?</Label><select id={uid+'-pay'} value={wouldPay} required disabled={save.isPending} onChange={e=>setWouldPay(e.target.value as NonNullable<Feedback['wouldPay']>)} className="h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm"><option value="" disabled>Choose an answer</option>{Object.entries(wouldPayLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><p className="text-xs text-muted-foreground">This is feedback, not a payment commitment.</p></div>
          <div className="space-y-2"><Label htmlFor={uid+'-comment'}>What should we improve? (optional)</Label><Textarea id={uid+'-comment'} value={comment} maxLength={2000} rows={4} disabled={save.isPending} onChange={e=>setComment(e.target.value)} /><p className="text-xs text-muted-foreground">Please leave out student names and personal details. You can update your answers later.</p></div>
          <Button type="submit" disabled={save.isPending||!used||!editing||!timeSaved||!wouldPay}>{save.isPending?'Saving…':feedback.data?'Update feedback':'Send feedback'}</Button>
        </form>}
    </DialogContent>
  </Dialog>;
}
