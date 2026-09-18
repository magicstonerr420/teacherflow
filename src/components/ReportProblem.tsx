import { useId, useState } from 'react';
import { Bug, Copy, Mail } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { CONTACT_EMAIL } from '@/config/contact';
import { problemReport, problemCategory, problemContextLines, PROBLEM_CATEGORIES, type ProblemContext } from '@/lib/problem-report';

export function ReportProblem({ context }: { context?: ProblemContext }) {
  const id = useId();
  const [category, setCategory] = useState<string>(problemCategory(context));
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [showCopy, setShowCopy] = useState(false);
  const report = problemReport({ category, description, steps, pageUrl, ...(context ? { context } : {}) });
  const contextLines = problemContextLines(context);
  const ready = description.trim().length > 0;
  return <Dialog onOpenChange={open => { if (open) { setPageUrl(window.location.href); setCategory(problemCategory(context)); setNotice(''); setShowCopy(false); } }}>
    <DialogTrigger asChild><Button variant="ghost" size="sm"><Bug className="size-4" />Report a problem</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
      <DialogHeader><DialogTitle>Report a problem</DialogTitle>
        <DialogDescription>Tell us what went wrong. We’ll prepare an email to {CONTACT_EMAIL} for you to review and send.</DialogDescription>
      </DialogHeader>
      {contextLines.length > 0 && <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm" aria-label="Details included in your report">
        <p className="font-semibold">Lesson details included</p>
        {contextLines.map(line => <p key={line} className="break-words text-muted-foreground">{line}</p>)}
      </div>}
      <div className="space-y-2"><Label htmlFor={`${id}-category`}>What needs help?</Label>
        <select id={`${id}-category`} value={category} onChange={e => setCategory(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
          {PROBLEM_CATEGORIES.map(value => <option key={value}>{value}</option>)}
        </select>
      </div>
      <div className="space-y-2"><Label htmlFor={`${id}-description`}>What happened?</Label>
        <Textarea id={`${id}-description`} value={description} onChange={e => setDescription(e.target.value)} maxLength={1200} placeholder="What did you expect, and what happened instead? Include the error message if there was one." className="min-h-28" />
      </div>
      <div className="space-y-2"><Label htmlFor={`${id}-steps`}>How can we reproduce it? (optional)</Label>
        <Textarea id={`${id}-steps`} value={steps} onChange={e => setSteps(e.target.value)} maxLength={600} placeholder="For example: open a saved lesson, choose Presentation, then click Generate PowerPoint." />
      </div>
      <p className="text-xs text-muted-foreground">The current page address is included. You can attach a screenshot in your email.</p>
      <p className="text-sm font-medium">Choose how to open your draft</p>
      <div className="flex flex-wrap gap-2">
        {[
          {label:'Gmail',href:report.gmailHref,web:true},
          {label:'Outlook.com',href:report.outlookHref,web:true},
          {label:'Email app',href:report.href,web:false},
        ].map(({label,href,web})=>ready
          ? <Button key={label} variant={label==='Gmail'?'default':'outline'} size="sm" asChild><a href={href} aria-label={`Open ${label} draft`} {...(web?{target:'_blank',rel:'noopener noreferrer'}:{})} onClick={()=>setNotice(web?`${label} opens in a new tab. Review and send your draft there. If it does not open, use Copy report.`:'Your default email app should open. Review and send your draft there, or choose Gmail, Outlook.com, or Copy report.')}><Mail className="size-4" />{label}</a></Button>
          : <Button key={label} variant={label==='Gmail'?'default':'outline'} size="sm" disabled aria-label={`Open ${label} draft`}><Mail className="size-4" />{label}</Button>)}
        <Button variant="outline" size="sm" disabled={!ready} onClick={async () => {
          try { await navigator.clipboard.writeText(report.text); setNotice(`Report copied. Paste it into an email to ${CONTACT_EMAIL}.`); }
          catch { setShowCopy(true); setNotice('Select and copy the report below, then paste it into your email.'); }
        }}><Copy className="size-4" />Copy report</Button>
      </div>
      <p className="text-xs text-muted-foreground">Using Yahoo, iCloud, Proton Mail, or another provider? Copy the report and paste it into a new email to {CONTACT_EMAIL}.</p>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {showCopy && <div className="space-y-2"><Label htmlFor={`${id}-copy`}>Your report</Label><Textarea id={`${id}-copy`} readOnly value={report.text} onFocus={e => e.currentTarget.select()} className="min-h-40" /></div>}
    </DialogContent>
  </Dialog>;
}
