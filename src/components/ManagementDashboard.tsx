import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Activity, AlertCircle, CheckCircle2, Clock3, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { loadManagement, manageGeneration, saveManagementNotifications, saveSupportNote } from '@/lib/management.functions';
import { PART_NAMES, safeDiagnostic } from '@/lib/management';
import { providerEventLabel } from '@/lib/generation-health';
import { CONTACT_EMAIL } from '@/config/contact';
import { BetaTeacherControls } from './BetaTeacherControls';
import { AccessRequestsPanel } from './AccessRequestsPanel';
import { UsagePanel } from './UsagePanel';
import { TeacherFeedbackPanel } from './TeacherFeedbackPanel';
import { GenerationHealth } from './GenerationHealth';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';

type ManagementData = Awaited<ReturnType<typeof loadManagement>>;
type Operation = ManagementData['operations'][number];
type Lesson = ManagementData['lessons'][number];
type RecoveryAction = 'resolve' | 'allow_retry' | 'restore_slot';
type Confirmation = { operation: Operation; action: RecoveryAction };
const tabs = [ ['overview', 'Overview'], ['teachers', 'Teachers'], ['generation', 'Generation'], ['budget', 'Budget'], ['usage', 'Usage'] ] as const;
const sections = ['overview', 'teachers', 'requests', 'activity', 'issues', 'budget', 'feedback', 'usage'] as const;
const disclosureStyle = 'cursor-pointer rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const panel = 'space-y-4 rounded-xl border bg-card p-4 sm:p-5';
const selectStyle = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const money = (value: number) => `$${value.toFixed(4)}`;
const when = (value: number | string | null | undefined) => value ? new Date(value).toLocaleString() : 'Not recorded';
const partName = (part: string) => PART_NAMES[part] ?? part;
const topic = (request: Record<string, unknown> | undefined) => String(request?.['topic'] ?? 'Topic not recorded');
const titleCase = (value: string) => value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/^./, first => first.toUpperCase());
const person = (data: ManagementData, user: string) => {
  const teacher = data.teachers.find(t => t.user === user);
  return teacher?.name || teacher?.email || user || 'Owner';
};
const valueText = (value: unknown): string => value === null || value === undefined || value === '' ? 'Not supplied' : typeof value === 'boolean' ? value ? 'Yes' : 'No' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
const settingNames: Record<string, string> = {
  subject: 'Subject', topic: 'Topic', studentAge: 'Student age', level: 'English level', durationMinutes: 'Duration (minutes)',
  mainSkill: 'Main skill', secondarySkill: 'Secondary skill', learningObjective: 'Learning objective', numberOfStudents: 'Number of students',
  previousKnowledge: 'Previous knowledge', textbookUnit: 'Textbook unit', requiredVocabulary: 'Required vocabulary', curriculumStandard: 'Curriculum standard',
  technologyAvailable: 'Technology available', classroomLimitations: 'Classroom limitations', homeworkRequirement: 'Homework requirement',
  teachingStyle: 'Teaching style', teacherNotes: 'Teacher notes', groupWorkEnabled: 'Group work enabled', studentsPerGroup: 'Students per group',
};
function SubmittedSettings({ request }: { request: Record<string, unknown> | undefined }) {
  return <details className="rounded-lg border p-3 text-sm">
    <summary className="cursor-pointer font-medium">Full submitted lesson settings</summary>
    {request && Object.keys(request).length ? <dl className="mt-4 grid gap-4 sm:grid-cols-2">{Object.entries(request).map(([key, value]) => <div key={key} className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{settingNames[key] ?? titleCase(key.replace(/([a-z])([A-Z])/g, '$1 $2'))}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words">{valueText(value)}</dd>
    </div>)}</dl> : <p className="mt-3 text-muted-foreground">Submitted settings were not recorded for this lesson.</p>}
  </details>;
}
function Status({ value }: { value: string }) {
  const style = ['failed', 'open', 'review'].includes(value) ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
    : ['completed', 'recovered', 'accepted', 'resolved'].includes(value) ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
    : ['generating', 'interrupted', 'queued'].includes(value) ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-muted text-muted-foreground';
  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}>{titleCase(value)}</span>;
}
function Metric({ label, value, icon }: { label: string; value: number | string; icon: ReactNode }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between gap-2 text-muted-foreground"><p className="text-sm">{label}</p>{icon}</div><p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p></div>;
}
function LessonProgress({ lesson, operations }: { lesson: Lesson; operations: Operation[] }) {
  const saved = lesson.steps.filter(step => step.complete);
  const last = saved.at(-1);
  const tracked = operations.filter(row => row.user === lesson.user && row.lesson === lesson.key);
  return <article className="space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="break-words font-semibold">{topic(lesson.request)}</h4><Status value={lesson.complete ? 'completed' : lesson.steps.some(step => step.running) ? 'generating' : 'unfinished'} /></div>
    <p className="text-sm">Last completed step: <strong>{last ? partName(last.part) : 'No completed step recorded'}</strong> · {saved.length}/{lesson.steps.length} lesson steps saved</p>
    <ul className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3" aria-label="Lesson step progress">{lesson.steps.map(step => <li key={step.part} className="flex items-start gap-2 rounded-md bg-muted/60 p-2">
      {step.complete ? <CheckCircle2 aria-label="Complete" className="mt-0.5 size-3.5 shrink-0 text-emerald-700" /> : <Clock3 aria-label={step.running ? 'Generating' : 'Unfinished'} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
      <span>{partName(step.part)}<span className="block text-muted-foreground">{step.complete ? 'Saved' : step.running ? 'Generating' : step.attempts ? 'Not completed' : 'Not started'} · {step.attempts} attempt{step.attempts === 1 ? '' : 's'}</span></span>
    </li>)}</ul>
    {lesson.credited && <p className="text-sm">This lesson no longer uses a slot in the current allowance.</p>}
    {!tracked.length && <p className="text-sm text-muted-foreground">Detailed generation history is unavailable for this earlier lesson. Saved step progress is shown above; an unfinished step does not prove a generation failure.</p>}
    <SubmittedSettings request={lesson.request} />
  </article>;
}

function TeacherDetails({ data, selected, onSelect, refresh }: { data: ManagementData; selected: string; onSelect: (user: string) => void; refresh: () => Promise<unknown> }) {
  const teacher = data.teachers.find(t => t.user === selected);
  const lessons = data.lessons.filter(row => row.user === selected);
  const history = [
    ...data.audit.filter(entry => entry.user === selected).map(entry => ({ id: entry.id, at: entry.created, text: `${titleCase(entry.action)} — ${entry.detail}` })),
    ...data.history.filter(entry => entry.user === selected && !['allow_retry', 'restore_slot'].includes(entry.action)).map((entry, i) => ({ id: `access-${i}`, at: new Date(entry.at).getTime(), text: `${titleCase(entry.action)} · Invitation ${entry.seat}` })),
  ].sort((a, b) => b.at - a.at);
  return <section className={panel} aria-label="Teacher progress and support">
    <h2 className="text-lg font-semibold">Teacher progress and support</h2>
    <label className="block space-y-2 text-sm"><span className="font-medium">Choose a teacher</span><select className={selectStyle} value={selected} onChange={event => onSelect(event.target.value)}><option value="">Select a teacher…</option>{data.teachers.map(row => <option key={row.user} value={row.user}>{person(data, row.user)}{row.revoked ? ' (access removed)' : ''}</option>)}</select></label>
    {!data.teachers.length && <p className="text-sm text-muted-foreground">Teacher progress will appear after an invitation is claimed.</p>}
    {teacher && <>
      <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold">{person(data, teacher.user)}</h3><p className="break-all text-sm text-muted-foreground">{teacher.email || 'Email not recorded'}</p><p className="break-all text-xs text-muted-foreground">Account: {teacher.user}</p></div><Status value={teacher.revoked ? 'access removed' : 'active'} /></div>
      <p className="text-sm">{lessons.filter(row => row.complete).length} lessons completed · {lessons.filter(row => !row.complete).length} unfinished · {data.operations.filter(row => row.user === selected && row.issue === 'open').length} issues to review</p>
      <SupportNote key={teacher.user} user={teacher.user} note={data.notes.find(row => row.user === teacher.user)?.note ?? ''} refresh={refresh} />
      <div className="space-y-3"><h3 className="font-semibold">Lesson progress</h3>{lessons.length ? lessons.map(lesson => <LessonProgress key={lesson.key} lesson={lesson} operations={data.operations} />) : <p className="text-sm text-muted-foreground">No lesson records yet.</p>}</div>
      <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Support and access history ({history.length})</summary><ul className="mt-3 space-y-3">{history.map(entry => <li key={entry.id} className="break-words"><p>{entry.text}</p><p className="text-xs text-muted-foreground">{when(entry.at)}</p></li>)}</ul>{!history.length && <p className="mt-3 text-muted-foreground">No support actions recorded yet.</p>}</details>
    </>}
  </section>;
}
function SupportNote({ user, note, refresh }: { user: string; note: string; refresh: () => Promise<unknown> }) {
  const save = useServerFn(saveSupportNote);
  const [draft, setDraft] = useState(note), [saved, setSaved] = useState(note), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await save({ data: { user, note: draft } }); setSaved(draft); setMessage('Private support note saved.'); await refresh(); }
    catch (error) { setError(safeDiagnostic(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="space-y-2 rounded-lg bg-muted/40 p-3"><label htmlFor="support-note" className="text-sm font-medium">Private support note</label><Textarea id="support-note" value={draft} maxLength={3000} rows={3} onChange={event => { setDraft(event.target.value); setMessage(''); }} placeholder="What happened, what you checked, and what the teacher should try next." /><p className="text-xs text-muted-foreground">Visible only to the owner. {draft.length}/3,000 characters.</p><Button size="sm" variant="outline" disabled={busy || draft === saved} onClick={() => void submit()}>{busy ? 'Saving…' : 'Save support note'}</Button>{message && <p role="status" className="text-sm">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}

function OperationDetails({ row, data, onAction }: { row: Operation; data: ManagementData; onAction: (action: Confirmation) => void }) {
  const lesson = data.lessons.find(item => item.key === row.lesson && item.user === row.user);
  const last = lesson?.steps.filter(step => step.complete).at(-1);
  const blockedCategory = ['uncertain_charge', 'budget', 'provider_credit', 'access'].includes(row.failure?.category ?? '');
  const newer = data.operations.some(item => item.user === row.user && item.lesson === row.lesson && item.started > row.started && (item.status === 'generating' || item.part === row.part && ['completed', 'recovered'].includes(item.status)));
  const already = (action: RecoveryAction) => data.audit.some(entry => entry.id === `${action}:${row.id}`);
  const recoverable = row.source === 'server' && row.status === 'failed' && row.issue === 'open' && !blockedCategory && !newer && !data.budget.paused && !lesson?.steps.some(step => step.running);
  const supportsRetry = ['reading', 'listening'].includes(row.part) ? !!row.target : ['recording', 'illustration', 'alternate'].includes(row.part) ? !!lesson : !!lesson?.steps.some(step => step.part === row.part && !step.complete && step.attempts > 0);
  const canRetry = recoverable && supportsRetry && !already('allow_retry');
  const canRestore = recoverable && !!lesson && !lesson.complete && !lesson.credited && !already('restore_slot');
  return <details className="group rounded-xl border bg-card" aria-label={`${topic(row.request)} — ${partName(row.part)}`}>
    <summary className="cursor-pointer space-y-2 p-4 marker:text-muted-foreground">
      <span className="ml-1 break-words font-semibold">{topic(row.request)}</span>
      <span className="flex flex-wrap items-center gap-2"><span className="text-sm">{partName(row.part)}</span><Status value={row.status} />{row.issue !== 'none' && <span className="text-xs text-muted-foreground">Issue: {titleCase(row.issue)}</span>}</span>
      <span className="block break-words text-xs text-muted-foreground">{person(data, row.user)} · {when(row.started)} · {row.source === 'server' ? 'Server record' : 'Browser report'}</span>
    </summary>
    <div className="space-y-4 border-t p-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2"><p><span className="block text-xs text-muted-foreground">Started</span>{when(row.started)}</p><p><span className="block text-xs text-muted-foreground">Finished</span>{row.finished ? when(row.finished) : 'No completion recorded'}</p><p><span className="block text-xs text-muted-foreground">Last completed lesson step</span>{last ? partName(last.part) : lesson ? 'No completed step recorded' : 'Saved lesson progress unavailable'}</p><p className="break-all"><span className="block text-xs text-muted-foreground">Teacher account</span>{row.user}</p></div>
      {row.detail && <div><h4 className="font-medium">Part details</h4><p className="whitespace-pre-wrap break-words text-muted-foreground">{row.detail}</p></div>}
      {row.failure ? <div className="space-y-2 rounded-lg bg-muted/60 p-3"><h4 className="font-medium">What happened</h4><p>{row.failure.explanation}</p><p><strong>Next action:</strong> {row.failure.nextAction}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{row.failure.detail}</p>{['unknown', 'connection'].includes(row.failure.category) && <p className="font-medium">The exact underlying cause is unknown from the available evidence.</p>}</div> : <p className="text-muted-foreground">{row.status === 'generating' ? 'This request is still reporting progress.' : row.status === 'recovered' ? 'This part completed after a retry or an earlier issue.' : 'No failure diagnostic was recorded.'}</p>}
      {(row.status === 'interrupted' || row.source === 'browser') && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">{row.status === 'interrupted' ? 'A completion was not recorded. Interruption does not prove that the provider failed or that no charge occurred.' : 'This browser report does not establish the server outcome or provider charge.'} Check saved progress and the corresponding server record before taking action.</p>}
      <SubmittedSettings request={row.request} />
      <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Provider attempts and events ({row.providers.length})</summary>{row.providers.length ? <ol className="mt-3 space-y-3">{row.providers.map((attempt, i) => <li key={`${attempt.at}-${i}`} className="space-y-1 rounded-md bg-muted/50 p-3"><p className="break-words font-medium">{i + 1}. {attempt.model} · {attempt.kind}</p><p className="text-xs text-muted-foreground">{when(attempt.at)} · {(attempt.ms / 1000).toFixed(1)} seconds · {providerEventLabel(attempt)}</p>{attempt.detail && <p className="whitespace-pre-wrap break-words">{attempt.detail}</p>}</li>)}</ol> : <p className="mt-3 text-muted-foreground">No provider attempt details were recorded. This is not evidence that no request or charge occurred.</p>}</details>
      {row.issue === 'open' && <div className="space-y-3 border-t pt-4"><h4 className="font-medium">Owner actions</h4><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onAction({ operation: row, action: 'resolve' })}>Mark resolved</Button>{canRetry && <Button size="sm" variant="outline" onClick={() => onAction({ operation: row, action: 'allow_retry' })}>Allow one extra attempt</Button>}{canRestore && <Button size="sm" variant="outline" onClick={() => onAction({ operation: row, action: 'restore_slot' })}>Return unfinished lesson slot</Button>}</div>
        {already('allow_retry') && <p className="text-muted-foreground">One extra attempt has already been allowed. Ask the teacher to reopen the lesson and retry {partName(row.part)}.</p>}
        {lesson?.credited && <p className="text-muted-foreground">This lesson no longer uses a slot in the current allowance.</p>}
        {blockedCategory || data.budget.paused ? <p className="text-muted-foreground">Review the billing, budget, or access restriction first. An extra attempt cannot bypass it.</p> : !recoverable && <p className="text-muted-foreground">Allowance recovery is available only for an unresolved, confirmed server failure with no newer work in progress or recovered result.</p>}
        <p className="text-xs text-muted-foreground">These actions preserve completed materials and spending history. A teacher must start any new generation.</p>
      </div>}
      <p className="break-all text-xs text-muted-foreground">Operation: {row.id}</p>
    </div>
  </details>;
}

function OperationsList({ data, issues = false, onAction }: { data: ManagementData; issues?: boolean; onAction: (action: Confirmation) => void }) {
  const [search, setSearch] = useState(''), [teacher, setTeacher] = useState('all'), [status, setStatus] = useState('all'), [issue, setIssue] = useState('open'), [visible, setVisible] = useState(30);
  const term = search.trim().toLocaleLowerCase();
  const filtered = data.operations.filter(row => (!issues || row.issue !== 'none') && (!issues || issue === 'all' || row.issue === issue) && (teacher === 'all' || row.user === teacher) && (status === 'all' || row.status === status) && (!term || `${topic(row.request)} ${person(data, row.user)} ${data.teachers.find(t => t.user === row.user)?.email ?? ''} ${row.user} ${partName(row.part)} ${row.detail}`.toLocaleLowerCase().includes(term)));
  useEffect(() => { setVisible(30); }, [search, teacher, status, issue]);
  return <div className="space-y-4">
    <div className={panel}><div><h2 className="text-lg font-semibold">{issues ? 'Generation issues' : 'Generation activity'}</h2><p className="mt-1 text-sm text-muted-foreground">{issues ? 'Review unresolved issues, recovered attempts, and your completed support actions.' : 'The latest 1,000 tracked operations. Open a record to see its settings, saved progress, and provider attempts.'}</p></div>
      <div className={`grid items-end gap-3 sm:grid-cols-2 ${issues ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        <label className="space-y-1 text-sm"><span>Search teacher, topic, or part</span><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="e.g. Weather, Ana, recording" /></label>
        <label className="space-y-1 text-sm"><span>Filter by teacher</span><select className={selectStyle} value={teacher} onChange={event => setTeacher(event.target.value)}><option value="all">All teachers</option>{[...new Set(data.operations.map(row => row.user))].map(user => <option key={user} value={user}>{person(data, user)}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>Generation status</span><select className={selectStyle} value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{['generating', 'completed', 'recovered', 'failed', 'interrupted'].map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
        {issues && <label className="space-y-1 text-sm"><span>Issue status</span><select className={selectStyle} value={issue} onChange={event => setIssue(event.target.value)}><option value="open">Needs review</option><option value="recovered">Recovered</option><option value="resolved">Resolved by owner</option><option value="all">All issues</option></select></label>}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} matching record{filtered.length === 1 ? '' : 's'}. Browser reports and interrupted operations may need investigation; they are not confirmed server failures.</p>
    </div>
    {filtered.length ? filtered.slice(0, visible).map(row => <OperationDetails key={row.id} row={row} data={data} onAction={onAction} />) : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{data.operations.length ? 'No records match these filters.' : 'No generation operations have been recorded yet. Earlier saved lesson progress is available in Teachers.'}</p>}
    {filtered.length > visible && <Button variant="outline" onClick={() => setVisible(count => count + 30)}>Show 30 more records</Button>}
  </div>;
}

function Notifications({ data, refresh }: { data: ManagementData; refresh: () => Promise<unknown> }) {
  const save = useServerFn(saveManagementNotifications);
  const [settings, setSettings] = useState(data.settings), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage(''); setError('');
    try { await save({ data: settings }); setMessage('Email preferences saved.'); await refresh(); }
    catch (error) { setError(safeDiagnostic(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={panel} aria-label="Owner email notifications"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Owner email notifications</h2><Status value={data.email.configured ? 'configured' : 'setup needed'} /></div>
    <p className="text-sm text-muted-foreground">Unresolved issues are grouped after a recovery window. Issues that recover before delivery are skipped.</p>
    <div className="flex items-center justify-between gap-4"><label htmlFor="management-email" className="text-sm font-medium">Email me about unresolved issues</label><Switch id="management-email" checked={settings.emailEnabled} disabled={busy} onCheckedChange={emailEnabled => { setSettings(value => ({ ...value, emailEnabled })); setMessage(''); }} /></div>
    <div className="flex items-center justify-between gap-4"><label htmlFor="management-summary" className="text-sm font-medium">Include a daily issue summary</label><Switch id="management-summary" checked={settings.dailySummary} disabled={busy} onCheckedChange={dailySummary => { setSettings(value => ({ ...value, dailySummary })); setMessage(''); }} /></div>
    <p className="break-all text-xs text-muted-foreground">Recipient: {data.email.to || CONTACT_EMAIL}{!settings.emailEnabled ? ' · Email is turned off.' : ''}</p>
    <Button size="sm" variant="outline" disabled={busy || settings.emailEnabled === data.settings.emailEnabled && settings.dailySummary === data.settings.dailySummary} onClick={() => void submit()}>{busy ? 'Saving…' : 'Save email preferences'}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!data.email.configured && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"><p className="font-medium">Email cannot send until server setup is complete.</p><p>Missing or invalid: {data.email.missing.join(', ')}.</p></div>}
    <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Email setup instructions</summary><div className="mt-3 space-y-2"><p>In the hosting service’s server environment settings, add <code>RESEND_API_KEY</code> and <code>TEACHERFLOW_ALERT_FROM</code>. Use a sender address from a domain verified with Resend.</p><p>Optionally set <code>TEACHERFLOW_ALERT_TO</code>; otherwise alerts go to {CONTACT_EMAIL}. Save the server settings, restart or redeploy the service, then refresh this dashboard.</p><p>Keep these values in server settings. Sending credentials are never displayed here.</p></div></details>
    <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Recent email delivery status ({data.alerts.length})</summary><p className="mt-3 text-xs text-muted-foreground">Accepted means the email service accepted the message. Inbox delivery is not verified.</p>{!data.alerts.length ? <p className="mt-3 text-muted-foreground">No email deliveries have been queued.</p> : <ul className="mt-3 space-y-3">{data.alerts.slice(0, 20).map(alert => <li key={alert.id} className="space-y-1 border-t pt-3"><div className="flex flex-wrap items-center gap-2"><Status value={alert.status} /><span className="text-xs">{when(alert.created)} · {alert.attempts} sending attempt{alert.attempts === 1 ? '' : 's'}</span></div>{alert.error && <p className="break-words text-destructive">{alert.error}</p>}</li>)}</ul>}</details>
  </section>;
}

function Budget({ data }: { data: ManagementData }) {
  return <div className="space-y-4"><section className={panel} aria-label="Beta budget"><h2 className="text-lg font-semibold">Teacher beta budget</h2><div className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Available</p><p className="mt-1 text-3xl font-semibold">${data.budget.remainingUsd.toFixed(2)}</p></div><div><p className="text-xs text-muted-foreground">Accounted charges</p><p className="mt-1 text-2xl font-semibold">{money(data.budget.accountedUsd)}</p></div><div><p className="text-xs text-muted-foreground">Reserved or awaiting confirmation</p><p className="mt-1 text-2xl font-semibold">{money(data.budget.reservedUsd)}</p></div></div><p className="text-sm text-muted-foreground">${data.budget.limitUsd.toFixed(2)} total for this teacher beta round. Your owner testing is separate. Refreshing, redeploying, granting an attempt, or returning a lesson slot does not reset this budget.</p>{data.budget.paused && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm">Teacher generation is paused because a provider charge needs review. Check the provider billing records before attempting more generation.</p>}</section>
    <section className={panel}><h2 className="font-semibold">Recorded spending by teacher and service</h2>{!data.spending.length ? <p className="text-sm text-muted-foreground">No teacher spending has been recorded.</p> : <div className="space-y-3">{data.spending.map((entry, i) => <article key={`${entry.user}-${entry.kind}-${entry.model}-${i}`} className="space-y-2 rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><h3 className="break-words font-medium">{person(data, entry.user)}</h3><span>{entry.requests} requests</span></div><p className="break-words text-xs text-muted-foreground">{titleCase(entry.kind)} · {entry.model}</p><p>{money(entry.confirmedUsd)} accounted · {money(entry.reservedUsd)} reserved</p>{entry.uncertain > 0 && <p className="text-amber-800 dark:text-amber-200">{entry.uncertain} request{entry.uncertain === 1 ? '' : 's'} with an unconfirmed charge. The reservation is protected.</p>}</article>)}</div>}</section>
  </div>;
}

export function ManagementDashboard() {
  const { user } = useAuth();
  const load = useServerFn(loadManagement), manage = useServerFn(manageGeneration);
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['owner-management', user?.id], queryFn: () => load(), enabled: !!user, retry: false, staleTime: 15_000, refetchInterval: 60_000 });
  const hash = useLocation({ select: location => location.hash });
  const navigate = useNavigate();
  const section = hash === 'lesson-allowances' ? 'teachers' : hash === 'generation' ? 'issues' : sections.some(value => value === hash) ? hash : 'overview';
  const tab = ['teachers', 'requests', 'feedback'].includes(section) ? 'teachers' : ['issues', 'activity'].includes(section) ? 'generation' : section;
  const [teacher, setTeacher] = useState(''), [confirmation, setConfirmation] = useState<Confirmation | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [actionError, setActionError] = useState('');
  const lock = useRef(false);
  const tabClick = useRef(false);
  const data = query.data;
  const refresh = () => query.refetch();
  function selectSection(value: string) {
    tabClick.current = true;
    void navigate({ to: '/beta-management', hash: value === 'generation' ? 'issues' : value, replace: true, resetScroll: false, hashScrollIntoView: false });
  }
  useEffect(() => {
    if (tabClick.current) { tabClick.current = false; return; }
    if (!hash) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(hash);
      if (target) { target.scrollIntoView({ block: 'start' }); target.focus({ preventScroll: true }); }
    });
    return () => cancelAnimationFrame(frame);
  }, [hash, query.isPending]);
  function confirm(action: Confirmation) { setConfirmation(action); setActionError(''); setMessage(''); }
  async function act() {
    if (!confirmation || lock.current) return;
    const { operation, action } = confirmation;
    lock.current = true; setBusy(true); setActionError(''); setMessage('');
    try {
      await manage({ data: { id: operation.id, action } });
      setConfirmation(null);
      setMessage(action === 'resolve' ? 'Issue marked resolved. Saved materials and allowances are unchanged.' : action === 'allow_retry' ? `One extra attempt allowed for ${partName(operation.part)} in “${topic(operation.request)}”. Ask the teacher to reopen the lesson and retry that part. No generation was started. The shared budget still applies.` : `The unfinished lesson slot for “${topic(operation.request)}” was returned. Ask the teacher to refresh their lesson allowance. Saved progress and spending history are retained; the shared budget still applies.`);
      await query.refetch();
      await cache.invalidateQueries({ queryKey: ['beta-access-status'] });
    } catch (error) { setActionError(safeDiagnostic(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  const pending = <p role="status" className="rounded-xl border p-5 text-sm">{query.isPending ? 'Loading Management…' : 'Management data is unavailable. Use Refresh dashboard to try again.'}</p>;
  const openIssues = data?.operations.filter(row => row.issue === 'open') ?? [];
  const generatingCount = new Set(data?.operations.filter(row => row.status === 'generating').map(row => JSON.stringify([row.user, row.lesson, row.part, row.detail])) ?? []).size;
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Owner only · {query.dataUpdatedAt ? `Updated ${when(query.dataUpdatedAt)}` : 'Loading current records'} · Refreshes every minute</p><Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void refresh()}><RefreshCw className={`size-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />{query.isFetching ? 'Refreshing…' : 'Refresh dashboard'}</Button></div>
    {query.isError && <div role="alert" className="space-y-2 rounded-lg border border-destructive p-3 text-sm"><p>Could not refresh Management. {data ? 'The last loaded records are still shown. ' : ''}Please try Refresh dashboard.</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{safeDiagnostic(query.error)}</p></div>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{message}</p>}
    <Tabs value={tab} onValueChange={selectSection} className="min-w-0 space-y-5">
      <TabsList aria-label="Management sections" className="grid h-auto w-full grid-cols-2 gap-1 p-1.5 sm:grid-cols-5">{tabs.map(([value, label]) => <TabsTrigger key={value} value={value} className="min-h-10 whitespace-normal px-2 text-center text-sm">{label}</TabsTrigger>)}</TabsList>
      <TabsContent value="usage"><div id="usage" tabIndex={-1} className="scroll-mt-24 outline-none"><UsagePanel /></div></TabsContent>
      <TabsContent value="overview"><div id="overview" tabIndex={-1} className="scroll-mt-24 space-y-5 outline-none">{data ? <>
        <p className="text-sm text-muted-foreground">Your beta at a glance. Start with anything that needs your attention.</p>
        <section className={panel}><h2 className="font-semibold">New beta applications</h2><p className="text-sm text-muted-foreground">Review requests from visitors who want to create lessons with TeacherFlow.</p><Button variant="outline" onClick={() => void navigate({to: '/beta-management', hash: 'requests'})}>Review access requests</Button></section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Issues to review" value={openIssues.length} icon={<AlertCircle className="size-4" />} /><Metric label="Generating now" value={generatingCount} icon={<Activity className="size-4" />} /><Metric label="Completed lessons" value={data.lessons.filter(row => row.complete).length} icon={<CheckCircle2 className="size-4" />} /><Metric label="Active teachers" value={data.teachers.filter(row => !row.revoked).length} icon={<Users className="size-4" />} /></div>
        <section className={panel}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Needs your attention</h2><Button size="sm" variant="outline" onClick={() => void navigate({ to: '/beta-management', hash: 'issues' })}>Review issues</Button></div>{openIssues.length ? <><p className="text-sm text-muted-foreground">{openIssues.filter(row => row.source === 'server' && row.status === 'failed').length} confirmed server failures · {openIssues.filter(row => row.source !== 'server' || row.status !== 'failed').length} reports needing investigation</p><ul className="space-y-3">{openIssues.slice(0, 5).map(row => <li key={row.id} className="border-t pt-3 text-sm"><p className="break-words font-medium">{topic(row.request)} · {partName(row.part)}</p><p className="mt-1 break-words text-muted-foreground">{person(data, row.user)} · {row.failure?.explanation ?? 'Review the operation details.'}</p></li>)}</ul></> : <p className="text-sm text-muted-foreground">No unresolved generation issues in the available records.</p>}</section>
        <section className={panel}><h2 className="font-semibold">Round at a glance</h2><p className="text-3xl font-semibold">${data.budget.remainingUsd.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">available of ${data.budget.limitUsd.toFixed(2)}</span></p><p className="text-sm">{data.lessons.filter(row => !row.complete).length} unfinished lessons · {data.operations.filter(row => row.status === 'recovered').length} recovered operations</p><p className="text-sm text-muted-foreground">Earlier lessons may have saved progress without detailed operation history. Check Teachers for the last completed step.</p>{data.budget.paused && <p role="alert" className="text-sm text-destructive">New teacher generation is paused for a provider charge review.</p>}<Button size="sm" variant="outline" onClick={() => void navigate({ to: '/beta-management', hash: 'budget' })}>Review budget</Button></section>
        <details className={panel}><summary className={disclosureStyle}>Generation reliability<span className="mt-1 block text-sm font-normal text-muted-foreground">Failure patterns, retries, and recoveries.</span></summary><div className="mt-4"><GenerationHealth operations={data.operations} /></div></details>
        <details className={panel}><summary className={disclosureStyle}>Email preferences<span className="mt-1 block text-sm font-normal text-muted-foreground">Choose alerts and check delivery status.</span></summary><div className="mt-4"><Notifications data={data} refresh={refresh} /></div></details>
      </> : pending}</div></TabsContent>
      <TabsContent value="teachers" className="space-y-4">
        <p className="text-sm text-muted-foreground">Manage invitations, lesson allowances, and teacher support.</p>
        <Tabs value={section === 'feedback' ? 'feedback' : section === 'requests' ? 'requests' : 'teachers'} onValueChange={selectSection} className="min-w-0 space-y-4">
          <TabsList aria-label="Teacher sections" className="grid h-auto w-full grid-cols-3 gap-1 sm:w-fit"><TabsTrigger value="teachers" className="min-h-10 whitespace-normal text-center">Teachers &amp; invitations</TabsTrigger><TabsTrigger value="requests" className="min-h-10">Requests</TabsTrigger><TabsTrigger value="feedback" className="min-h-10">Feedback</TabsTrigger></TabsList>
          <TabsContent value="requests"><div id="requests" tabIndex={-1} className="scroll-mt-24 outline-none"><AccessRequestsPanel /></div></TabsContent>
          <TabsContent value="teachers"><div id="teachers" tabIndex={-1} className="scroll-mt-24 space-y-5 outline-none">{data ? <TeacherDetails data={data} selected={teacher} onSelect={setTeacher} refresh={refresh} /> : pending}<section className={panel} aria-label="Sharing invitations"><h2 className="font-semibold">Invite a teacher with a link</h2><ol className="list-decimal space-y-2 pl-5 text-sm"><li>Use <strong>Create invitation</strong> below to add an invitation card.</li><li>Use <strong>Copy invitation link</strong> on that card, then share it in WhatsApp or an email.</li><li>The teacher opens the link and signs in or creates an account. The link claims the invitation automatically.</li></ol></section><div className={panel}><BetaTeacherControls /></div></div></TabsContent>
          <TabsContent value="feedback"><div id="feedback" tabIndex={-1} className="scroll-mt-24 outline-none"><TeacherFeedbackPanel /></div></TabsContent>
        </Tabs>
      </TabsContent>
      <TabsContent value="generation" className="space-y-4">
        <p className="text-sm text-muted-foreground">Review problems or follow the progress of generated materials.</p>
        <Tabs value={section === 'activity' ? 'activity' : 'issues'} onValueChange={selectSection} className="min-w-0 space-y-4">
          <TabsList aria-label="Generation sections" className="grid h-auto w-full grid-cols-2 gap-1 sm:w-fit"><TabsTrigger value="issues" className="min-h-10">Issues{openIssues.length > 0 && <span className="ml-1.5 rounded-full bg-background/80 px-1.5 text-xs" aria-label={`${openIssues.length} need review`}>{openIssues.length}</span>}</TabsTrigger><TabsTrigger value="activity" className="min-h-10">All activity</TabsTrigger></TabsList>
          <TabsContent value="issues"><div id="issues" tabIndex={-1} className="scroll-mt-24 outline-none">{data ? <OperationsList data={data} issues onAction={confirm} /> : pending}</div></TabsContent>
          <TabsContent value="activity"><div id="activity" tabIndex={-1} className="scroll-mt-24 outline-none">{data ? <OperationsList data={data} onAction={confirm} /> : pending}</div></TabsContent>
        </Tabs>
      </TabsContent>
      <TabsContent value="budget"><div id="budget" tabIndex={-1} className="scroll-mt-24 outline-none">{data ? <Budget data={data} /> : pending}</div></TabsContent>
    </Tabs>
    <AlertDialog open={!!confirmation} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><AlertDialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl"><AlertDialogHeader><AlertDialogTitle>{confirmation?.action === 'allow_retry' ? 'Allow one extra attempt?' : confirmation?.action === 'restore_slot' ? 'Return this unfinished lesson slot?' : 'Mark this issue resolved?'}</AlertDialogTitle><AlertDialogDescription asChild><div className="space-y-3"><p className="break-words">{confirmation && data ? person(data, confirmation.operation.user) : ''} · {confirmation ? topic(confirmation.operation.request) : ''} · {confirmation ? partName(confirmation.operation.part) : ''}</p><p>{confirmation?.action === 'allow_retry' ? 'This permits one extra attempt for this failed part. It does not start generation. Ask the teacher to reopen the lesson and retry only this part.' : confirmation?.action === 'restore_slot' ? 'This returns the slot consumed by this unfinished lesson. Its saved progress remains available. Ask the teacher to refresh their lesson allowance afterward.' : 'This closes the issue in Management. It does not retry generation, return a slot, or confirm an uncertain provider charge.'}</p><p>Completed materials and spending history are kept. The shared budget and billing protections still apply.</p></div></AlertDialogDescription></AlertDialogHeader>{actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><Button disabled={busy} onClick={() => void act()}>{busy ? 'Saving…' : confirmation?.action === 'allow_retry' ? 'Confirm extra attempt' : confirmation?.action === 'restore_slot' ? 'Confirm slot return' : 'Confirm resolved'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
