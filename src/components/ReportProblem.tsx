import { useState } from 'react';
import { Bug, Copy, Mail } from 'lucide-react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { CONTACT_EMAIL } from '@/config/contact';
import { problemReport, PROBLEM_CATEGORIES } from '@/lib/problem-report';

export function ReportProblem() {
  const [category, setCategory] = useState<string>(PROBLEM_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [showCopy, setShowCopy] = useState(false);
  const report = problemReport({ category, description, steps, pageUrl });
  const ready = description.trim().length > 0;
  return <Dialog onOpenChange={open => { if (open) { setPageUrl(window.location.href); setNotice(''); setShowCopy(false); } }}>
    <DialogTrigger asChild><Button variant="ghost" size="sm"><Bug className="size-4" />Report a problem</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
      <DialogHeader><DialogTitle>Report a problem</DialogTitle>
        <DialogDescription>Tell us what went wrong. We’ll prepare an email to {CONTACT_EMAIL} for you to review and send.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2"><Label htmlFor="problem-category">What needs help?</Label>
        <select id="problem-category" value={category} onChange={e => setCategory(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
          {PROBLEM_CATEGORIES.map(value => <option key={value}>{value}</option>)}
        </select>
      </div>
      <div className="space-y-2"><Label htmlFor="problem-description">What happened?</Label>
        <Textarea id="problem-description" value={description} onChange={e => setDescription(e.target.value)} maxLength={1200} placeholder="What did you expect, and what happened instead? Include the error message if there was one." className="min-h-28" />
      </div>
      <div className="space-y-2"><Label htmlFor="problem-steps">How can we reproduce it? (optional)</Label>
        <Textarea id="problem-steps" value={steps} onChange={e => setSteps(e.target.value)} maxLength={600} placeholder="For example: open a saved lesson, choose Presentation, then click Generate PowerPoint." />
      </div>
      <p className="text-xs text-muted-foreground">The current page address is included. You can attach a screenshot in your email.</p>
      <div className="flex flex-wrap gap-2">
        {ready ? <Button asChild><a href={report.href} onClick={() => setNotice('Your email app should open with a draft. Send it there to submit your report. If it does not open, use Copy report.')}><Mail className="size-4" />Open email draft</a></Button>
          : <Button disabled><Mail className="size-4" />Open email draft</Button>}
        <Button variant="outline" disabled={!ready} onClick={async () => {
          try { await navigator.clipboard.writeText(report.text); setNotice(`Report copied. Paste it into an email to ${CONTACT_EMAIL}.`); }
          catch { setShowCopy(true); setNotice('Select and copy the report below, then paste it into your email.'); }
        }}><Copy className="size-4" />Copy report</Button>
      </div>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {showCopy && <div className="space-y-2"><Label htmlFor="problem-copy">Your report</Label><Textarea id="problem-copy" readOnly value={report.text} onFocus={e => e.currentTarget.select()} className="min-h-40" /></div>}
    </DialogContent>
  </Dialog>;
}
