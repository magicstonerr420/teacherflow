import {alternateWorksheetIssue} from '@/lib/worksheet-versions';
import {PdfPreview} from './PdfPreview';
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Package, Pencil, Printer, RefreshCw, Save, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { ReportProblem } from '@/components/ReportProblem';
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PresentationActions } from "@/components/lesson/PresentationPanel";
import { SectionEditor } from "@/components/lesson/SectionEditor";
import { WorksheetHub } from "@/components/lesson/WorksheetHub";
import { buildLessonPackageZip, buildCompleteLessonPdf, safeSlug } from "@/lib/exports";
import { regenerateSection, repairDuplicateVersionB } from "@/lib/lesson.functions";
import { regenerateReading } from "@/lib/reading.functions";
import { applyReading, prepareLessonReading } from "@/lib/reading";
import { ReadingPanel } from './ReadingPanel';
import { ListeningPanel } from './ListeningPanel';
import { applyListening } from '@/lib/listening';
import { loadListeningAudio } from '@/lib/listening.functions';
import { downloadBlob } from "@/lib/pptx";
import { canExportPackage, runQualityControl, type QualityCheck } from "@/lib/quality";
import { cn } from "@/lib/utils";
import {
  normalizeWorksheet,
  type LessonPackage,
  type LessonRequestInput,
  type SectionKeyName,
} from "@/lib/lesson-schema";

const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "plan", label: "Lesson Plan" },
  { key: "presentation", label: "Presentation" },
  { key: "worksheet", label: "Worksheet" },
  { key: "reading", label: "Reading" },
  { key: "listening", label: "Listening" },
  { key: "activity", label: "Activities" },
  { key: "homework", label: "Homework" },
  { key: "exitTicket", label: "Exit Ticket" },
  { key: "assessment", label: "Assessment" },
  { key: "support", label: "Support Version" },
  { key: "challenge", label: "Challenge Version" },
  { key: "notes", label: "Teacher Notes" },
  { key: "quality", label: "Quality Check" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

/** Which lesson field each screen section edits. */
const SECTION_FIELD: Record<SectionKey, keyof LessonPackage | null> = {
  overview: "overview",
  plan: "lessonPlan",
  presentation: "presentation",
  worksheet: "worksheet",
  reading: null,
  listening: null,
  activity: "activity",
  homework: "homework",
  exitTicket: "exitTicket",
  assessment: "assessment",
  support: "supportVersion",
  challenge: "challengeVersion",
  notes: "teacherNotes",
  quality: null,
};

/** Which screen sections can be regenerated on their own. */
const SECTION_REGEN: Partial<Record<SectionKey, SectionKeyName>> = {
  presentation: "presentation",
  worksheet: "worksheet",
  activity: "activity",
  homework: "homework",
  exitTicket: "exitTicket",
  assessment: "assessment",
};

export function LessonPackageView({
  lesson: incoming,
  request,
  actions,
  onPersist,
}: {
  lesson: LessonPackage;
  request: LessonRequestInput;
  actions?: ReactNode;
  /** Saves changes for lessons that already live in the library. */
  onPersist?: ((lesson: LessonPackage) => Promise<void>) | undefined;
}) {
  const [active, setActive] = useState<SectionKey>("overview");
  const [lesson, setLesson] = useState<LessonPackage>(() => prepareLessonReading(incoming));
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [draft, setDraft] = useState<unknown>(null);
  const [busy, setBusy] = useState<SectionKey | null>(null);
  const [packaging, setPackaging] = useState(false);
  const [pdfFile,setPdfFile]=useState<{blob:Blob;name:string}|null>(null);
  const [preparingPdf,setPreparingPdf]=useState(false);
  async function previewPdf(){setPreparingPdf(true);try{setPdfFile({blob:await buildCompleteLessonPdf(lesson,request),name:`${safeSlug(request.topic)}_Complete_Lesson.pdf`});}catch(error){toast.error(error instanceof Error?error.message:'Could not prepare PDF.');}finally{setPreparingPdf(false);}}

  const [readingBusy, setReadingBusy] = useState(false);
  const [readingError, setReadingError] = useState<string | null>(null);
  const runReading = useServerFn(regenerateReading);
  const loadAudio = useServerFn(loadListeningAudio);

  useEffect(() => setLesson(prepareLessonReading(incoming)), [incoming]);

  const runRegenerate = useServerFn(regenerateSection);
  const repairAlternate=useServerFn(repairDuplicateVersionB);
  const [repairingAlternate,setRepairingAlternate]=useState(false);
  const duplicateVersion=alternateWorksheetIssue(lesson.worksheet?.student,lesson.worksheet?.studentB);
  async function fixAlternate(){setRepairingAlternate(true);try{const patch=await repairAlternate({data:{request,lesson}});await commit({...lesson,worksheet:{...lesson.worksheet,studentB:patch.worksheet.studentB,teacherB:patch.worksheet.teacherB}},'Version B and its answer key updated. Version A was kept.');}catch(error){toast.error(error instanceof Error?error.message:'Could not repair Version B.');}finally{setRepairingAlternate(false);}}

  async function rebuildReading() {
    if (readingBusy) return;
    setReadingBusy(true);
    setReadingError(null);
    try {
      const result = await runReading({ data: { request, lesson, operation: crypto.randomUUID() } });
      if (result.status === "failed") { setReadingError(result.error); return; }
      await commit(applyReading(lesson, result), "Reading updated. The rest of your lesson was kept.");
    } catch (error) {
      setReadingError(error instanceof Error ? error.message : "Reading generation failed. Your lesson has been kept.");
    } finally { setReadingBusy(false); }
  }
  const checks: QualityCheck[] = useMemo(
    () => runQualityControl(lesson, request),
    [lesson, request],
  );

  async function commit(next: LessonPackage, message: string) {
    setLesson(next);
    if (onPersist) {
      try {
        await onPersist(next);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "We could not save your changes. Your lesson is safe — please try again.",
        );
        return;
      }
    }
    toast.success(message);
  }

  function startEdit(key: SectionKey) {
    const field = SECTION_FIELD[key];
    if (!field) return;
    setDraft(structuredClone(lesson[field]));
    setEditing(key);
  }

  async function saveEdit(key: SectionKey) {
    const field = SECTION_FIELD[key];
    if (!field) return;
    setEditing(null);
    await commit({ ...lesson, [field]: draft } as LessonPackage, "Changes saved.");
    setDraft(null);
  }

  async function regenerate(key: SectionKey) {
    const section = SECTION_REGEN[key];
    if (!section) return;
    setBusy(key);
    try {
      const result = (await runRegenerate({
        data: { request, lesson, section },
      })) as Partial<LessonPackage>;
      await commit({ ...lesson, ...result }, "This part of the lesson was rebuilt.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong while rebuilding this part. Your lesson is safe — please try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function downloadPackage() {
    if (!canExportPackage(checks)) {
      toast.error("Some parts of this lesson are still missing, so the package cannot be built yet.");
      setActive("quality");
      return;
    }
    setPackaging(true);
    try {
      const recording = lesson.listening?.status === 'ready' && lesson.listening.audio
        ? await loadAudio({ data: { id: lesson.listening.audio.id } }) : undefined;
      const { blob, name } = await buildLessonPackageZip(lesson, request, {}, recording?.dataUrl);
      downloadBlob(blob, name);
      toast.success("Your complete lesson package is downloading.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong while building the package. Your lesson is safe — please try again.",
      );
    } finally {
      setPackaging(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <PdfPreview file={pdfFile} onClose={()=>setPdfFile(null)}/>
      <div className="no-print border-primary/20 bg-accent/40 mb-8 flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-6">
        <div>
          <h1 className="display-heading text-3xl">{request.topic}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge className="bg-primary/12 text-primary hover:bg-primary/12">{request.level}</Badge>
            <Badge className="bg-warning/20 text-warning-foreground hover:bg-warning/20">
              Ages {request.studentAge}
            </Badge>
            <Badge className="bg-success/15 text-success hover:bg-success/15">
              {request.durationMinutes} min
            </Badge>
            <Badge variant="secondary">{request.mainSkill}</Badge>
            {request.secondarySkill ? (
              <Badge variant="secondary">+ {request.secondarySkill}</Badge>
            ) : null}
            {request.groupWorkEnabled ? (
              <Badge variant="outline">Groups of {request.studentsPerGroup}</Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions}
          <Button variant="outline" onClick={downloadPackage} disabled={packaging}>
            {packaging ? <Loader2 className="size-4 animate-spin" /> : <Package className="size-4" />}
            {packaging ? "Preparing…" : "Download Complete Lesson"}
          </Button>
          <Button variant="outline" onClick={() => void previewPdf()} disabled={preparingPdf}>
            <Printer className="size-4" />
            {preparingPdf ? "Preparing PDF…" : "Print / Save as PDF"}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="no-print">
          <div className="lg:hidden">
            <Select value={active} onValueChange={(v) => setActive(v as SectionKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTIONS.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <nav className="bg-card sticky top-24 hidden flex-col gap-0.5 rounded-xl border p-2 lg:flex">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm transition-colors",
                  active === s.key
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-10">
          <div className="hidden print:block">
            <h1 className="display-heading text-2xl">
              {request.topic} — {request.level}, {request.durationMinutes} minutes
            </h1>
          </div>
          {SECTIONS.map((s) => (
            <section
              key={s.key}
              className={cn(s.key === 'reading' ? 'no-print' : 'print-block', active === s.key ? 'block' : s.key === 'reading' ? 'hidden' : 'hidden print:block')}
            >
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="display-heading border-primary border-l-4 pl-3 text-2xl">
                  {s.label}
                </h2>
                <div className="no-print flex flex-wrap gap-2">
                  {s.key !== 'worksheet' && <ReportProblem context={{topic: request.topic, studentAge: request.studentAge, level: request.level, section: s.label}} />}
                  {SECTION_REGEN[s.key] && editing !== s.key ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => regenerate(s.key)}
                      disabled={!!busy || readingBusy}
                    >
                      {busy === s.key ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      {busy === s.key ? "Rebuilding…" : `Regenerate ${s.label}`}
                    </Button>
                  ) : null}
                  {SECTION_FIELD[s.key] ? (
                    editing === s.key ? (
                      <>
                        <Button size="sm" onClick={() => saveEdit(s.key)}>
                          <Save className="size-4" />
                          Save Changes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(null);
                            setDraft(null);
                          }}
                        >
                          <X className="size-4" />
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => startEdit(s.key)}>
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                    )
                  ) : null}
                </div>
              </div>

              {s.key==='worksheet' && duplicateVersion ? <div role="alert" className="no-print mb-4 rounded-lg border p-4"><p>This saved Version B repeats Version A. Repair it to create different questions and matching answers while keeping Version A.</p><Button className="mt-3" onClick={()=>void fixAlternate()} disabled={repairingAlternate || !!busy}>{repairingAlternate?'Repairing Version B…':'Repair Version B'}</Button></div>:null}
              {s.key === 'reading' ? <ReadingPanel state={lesson.reading} request={request} busy={readingBusy} disabled={!!busy || !!editing}
                error={readingError} onGenerate={() => void rebuildReading()} onOpenWorksheet={() => setActive('worksheet')} />
              : s.key === 'listening' ? <ListeningPanel lesson={lesson} request={request} onChange={state => commit(applyListening(lesson, state), 'Listening activity saved.')} /> : editing === s.key ? (
                <div className="bg-card rounded-xl border p-5">
                  <SectionEditor value={draft} onChange={setDraft} />
                </div>
              ) : (
                <SectionBody
                  sectionKey={s.key}
                  lesson={lesson}
                  request={request}
                  checks={checks}
                />
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ------------------------------- building blocks -------------------------- */

function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="print-block rounded-xl border bg-card p-5">
      {title ? (
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-primary uppercase">{title}</h3>
      ) : null}

      {children}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed">{value}</dd>
    </div>
  );
}

function SectionBody({
  sectionKey,
  lesson,
  request,
  checks,
}: {
  sectionKey: SectionKey;
  lesson: LessonPackage;
  request: LessonRequestInput;
  checks: QualityCheck[];
}) {

  switch (sectionKey) {
    case "overview": {
      const o = lesson.overview;
      return (
        <div className="space-y-5">
          <Panel>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Field label="Topic" value={o.topic} />
              <Field label="Age" value={o.age} />
              <Field label="Level" value={o.level} />
              <Field label="Duration" value={o.duration} />
              <Field label="Main skill" value={o.mainSkill} />
              <Field label="Learning objective" value={o.learningObjective} />
            </dl>
          </Panel>
          <Panel title="Success criteria">
            <Bullets items={o.successCriteria} />
          </Panel>
          <Panel title="Materials needed">
            {Array.isArray(o.materialsNeeded) && o.materialsNeeded.length ? (
              <Bullets items={o.materialsNeeded} />
            ) : (
              <p className="text-sm">Materials: Student worksheet + presentation.</p>
            )}
          </Panel>
          <div className="grid gap-5 md:grid-cols-2">
            <Panel title="Prerequisite knowledge">
              <Bullets items={o.prerequisiteKnowledge} />
            </Panel>
            <Panel title="Key language / content">
              <Bullets items={o.keyLanguage} />
            </Panel>
          </div>

          <Panel title="Anticipated difficulties">
            <div className="space-y-3">
              {o.anticipatedDifficulties.map((d, i) => (
                <div key={i} className="rounded-lg bg-muted p-3 text-sm">
                  <p className="font-medium">{d.difficulty}</p>
                  <p className="mt-1 text-muted-foreground">{d.solution}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Teacher preparation">
            <Bullets items={o.teacherPreparation} />
          </Panel>
        </div>
      );
    }
    case "plan": {
      const p = lesson.lessonPlan;
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Total: {p.totalMinutes} minutes</p>
          {p.stages.map((stage, i) => (
            <Panel key={i}>
              <div className="mb-3 flex items-center gap-3">
                <Badge>{stage.time} min</Badge>
                <h3 className="text-base font-semibold">{stage.stage}</h3>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Teacher does" value={stage.teacherActions} />
                <Field label="Students do" value={stage.studentActions} />
                <Field label="Materials" value={stage.materials} />
                <Field label="Purpose" value={stage.purpose} />
              </dl>
            </Panel>
          ))}
        </div>
      );
    }
    case "presentation":
      return <PresentationActions lesson={lesson} request={request} />;

    case "worksheet":
      return (
        <WorksheetHub
          worksheet={normalizeWorksheet(lesson.worksheet, lesson.answerKey)}
          request={request}
          answerKey={lesson.answerKey}
        />
      );


    case "activity": {
      const a = lesson.activity;
      return (
        <div className="space-y-5">
          <Panel>
            <h3 className="text-base font-semibold">{a.title}</h3>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Objective" value={a.objective} />
              <Field label="Time" value={a.time} />
              <Field label="Grouping" value={a.grouping} />
              <Field label="Materials" value={a.materials} />
            </dl>
          </Panel>
          <Panel title="Teacher instructions">
            <Bullets items={a.teacherInstructions} />
          </Panel>
          <Panel title="Student instructions">
            <Bullets items={a.studentInstructions} />
          </Panel>
          <div className="grid gap-5 md:grid-cols-2">
            <Panel title="Example">
              <p className="text-sm whitespace-pre-line">{a.example}</p>
            </Panel>
            <Panel title="Variation">
              <p className="text-sm whitespace-pre-line">{a.variation}</p>
            </Panel>
          </div>
        </div>
      );
    }
    case "homework": {
      const h = lesson.homework;
      return (
        <Panel>
          <h3 className="text-base font-semibold">{h.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{h.instructions}</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            {h.tasks.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">Estimated time: {h.estimatedTime}</p>
        </Panel>
      );
    }
    case "exitTicket": {
      const e = lesson.exitTicket;
      return (
        <Panel>
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold">{e.title}</h3>
            <Badge>{e.timeMinutes} min</Badge>
          </div>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            {e.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">Success looks like: {e.successIndicator}</p>
        </Panel>
      );
    }
    case "assessment":
      return <QuestionSet set={lesson.assessment} />;
    case "support": {
      const s = lesson.supportVersion;
      return (
        <div className="space-y-5">
          <Panel>
            <p className="text-sm leading-relaxed">{s.summary}</p>
          </Panel>
          <Panel title="Sentence frames">
            <Bullets items={s.sentenceFrames} />
          </Panel>
          <Panel title="Word bank">
            <div className="flex flex-wrap gap-2">
              {s.wordBank.map((w, i) => (
                <Badge key={i} variant="secondary">
                  {w}
                </Badge>
              ))}
            </div>
          </Panel>
          <Panel title="Worked examples">
            <Bullets items={s.examples} />
          </Panel>
          <Panel title="Smaller steps">
            <Bullets items={s.steps} />
          </Panel>
          <Panel title="Guided practice">
            <Bullets items={s.guidedPractice} />
          </Panel>
        </div>
      );
    }
    case "challenge": {
      const c = lesson.challengeVersion;
      return (
        <div className="space-y-5">
          <Panel>
            <p className="text-sm leading-relaxed">{c.summary}</p>
          </Panel>
          <Panel title="Extension tasks">
            <Bullets items={c.tasks} />
          </Panel>
          <Panel title="Stretch questions">
            <Bullets items={c.extensionQuestions} />
          </Panel>
        </div>
      );
    }
    case "notes":
      return (
        <div className="space-y-5">
          <Panel title="Likely problems and quick fixes">
            <div className="space-y-3">
              {lesson.teacherNotes.problems.map((p, i) => (
                <div key={i} className="rounded-lg bg-muted p-3 text-sm">
                  <p className="font-medium">{p.problem}</p>
                  <p className="mt-1 text-muted-foreground">{p.solution}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Delivery tips">
            <Bullets items={lesson.teacherNotes.tips} />
          </Panel>
        </div>
      );
    case "quality":
      return (
        <div className="space-y-4">
          <Panel title="Pre-export checks">
            <p className="text-muted-foreground mb-4 text-sm">
              Run automatically on this lesson before anything is printed or exported.
            </p>
            <div className="space-y-3">
              {checks.map((c, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge status={c.status} />
                    <h3 className="text-sm font-semibold">{c.criterion}</h3>
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">{c.comment}</p>
                </div>
              ))}
            </div>
          </Panel>
          {lesson.qualityCheck.checks.map((c, i) => (
            <Panel key={i}>
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={c.status} />
                <h3 className="text-sm font-semibold">{c.criterion}</h3>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">{c.comment}</p>
            </Panel>
          ))}
          <Panel title="Overall">
            <p className="text-sm leading-relaxed">{lesson.qualityCheck.overallNotes}</p>
          </Panel>
        </div>
      );

    default:
      return null;
  }
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s.startsWith("pass")) return <Badge variant="secondary">Pass</Badge>;
  if (s.startsWith("fail")) return <Badge variant="destructive">Needs work</Badge>;
  return <Badge variant="outline">Check</Badge>;
}

function QuestionSet({
  set,
}: {
  set: { title: string; instructions: string; questions: { prompt: string; type: string; answer: string }[] };
}) {
  return (
    <Panel>
      <h3 className="text-base font-semibold">{set.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{set.instructions}</p>
      <ol className="mt-4 list-decimal space-y-4 pl-5 text-sm">
        {set.questions.map((q, i) => (
          <li key={i}>
            <p className="whitespace-pre-line">{q.prompt}</p>
            <p className="mt-1 text-xs text-muted-foreground">{q.type}</p>
            <p className="mt-1 rounded-md bg-muted px-2 py-1 text-sm">Answer: {q.answer}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
