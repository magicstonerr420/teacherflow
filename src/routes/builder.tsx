import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, ListPlus, Save, Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trackClientGeneration } from '@/lib/generation-monitor';

import { AppShell } from "@/components/AppShell";
import { QuickStartTip } from '@/components/QuickStartTip';
import { SavedClasses } from '@/components/SavedClasses';
import { LessonFeedback } from '@/components/LessonFeedback';
import { ReportProblem } from '@/components/ReportProblem';
import { BetaAccess } from "@/components/BetaAccess";
import { GenerationProgress, PHASES, type PhaseKey } from "@/components/lesson/GenerationProgress";
import { LessonPackageView } from "@/components/lesson/LessonPackageView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { generateLessonStage, saveLesson, updateLesson } from "@/lib/lesson.functions";
import {
  AGE_OPTIONS,
  DURATION_OPTIONS,
  HOMEWORK_OPTIONS,
  LEVEL_OPTIONS,
  SKILL_OPTIONS,
  SECONDARY_SKILL_OPTIONS,

  TEACHING_STYLE_OPTIONS,
  TECHNOLOGY_OPTIONS,
  lessonRequestSchema,
  type LessonPackage,
  type LessonRequestInput,
} from "@/lib/lesson-schema";

import { cn } from "@/lib/utils";
import { mergeLessonPatch } from "@/lib/generation-plan";

export const Route = createFileRoute("/builder")({
  validateSearch: (search: Record<string, unknown>) =>
    search["example"] === true || search["example"] === "true" ? { example: true } : {},

  head: () => ({
    meta: [
      { title: "Lesson builder — TeacherFlow" },
      {
        name: "description",
        content: "Enter your topic, student age, level, duration and objective to build a complete class.",
      },
      { property: "og:title", content: "Lesson builder — TeacherFlow" },
      { property: "og:description", content: "Build a complete English lesson package." },
    ],
  }),
  component: Builder,
});

const EMPTY: LessonRequestInput = {
  subject: "English",
  topic: "",
  studentAge: "",
  level: "",
  durationMinutes: 60,
  mainSkill: "",
  secondarySkill: null,

  learningObjective: "",
  numberOfStudents: "",
  previousKnowledge: "",
  requiredVocabulary: "",
  curriculumStandard: "",
  technologyAvailable: "",
  classroomLimitations: "",
  homeworkRequirement: "",
  teachingStyle: "",
  teacherNotes: "",
  groupWorkEnabled: false,
  studentsPerGroup: null,
};

const EXAMPLE: LessonRequestInput = {
  subject: "English",
  topic: "Present Perfect",
  studentAge: "14-16",
  level: "B1",
  durationMinutes: 60,
  mainSkill: "Speaking",
  secondarySkill: "Vocabulary",

  learningObjective:
    "Students will be able to ask and answer questions about life experiences using the present perfect.",
  numberOfStudents: "24",
  previousKnowledge: "Past simple, regular and irregular past participles",
  requiredVocabulary: "ever, never, already, yet, experience, abroad",
  curriculumStandard: "",
  technologyAvailable: "Projector / screen",
  classroomLimitations: "",
  homeworkRequirement: "Short (10 minutes)",
  teachingStyle: "Communicative",
  teacherNotes: "Mixed-ability class, plenty of pair work please.",
  groupWorkEnabled: false,
  studentsPerGroup: null,
};



function Builder() {
  const [betaAllowed,setBetaAllowed]=useState(false);
  const { example } = Route.useSearch();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [form, setForm] = useState<LessonRequestInput>(example ? EXAMPLE : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<PhaseKey | null>(null);
  const [completed, setCompleted] = useState(0);
  const [lesson, setLesson] = useState<LessonPackage | null>(null);
  const [generatedFor, setGeneratedFor] = useState<LessonRequestInput | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [failedPart, setFailedPart] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const checkpoint = useRef<{ request: string; completed: number; lesson: Partial<LessonPackage> } | null>(null);

  const runStage = useServerFn(generateLessonStage);
  const persist = useServerFn(saveLesson);
  const persistUpdate = useServerFn(updateLesson);

  useEffect(() => {
    if (example) setForm(EXAMPLE);
  }, [example]);

  const set = <K extends keyof LessonRequestInput>(key: K, value: LessonRequestInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  };

  async function build(request: LessonRequestInput) {
    setFailure(null);
    setFailedPart("");
    setLesson(null);
    setSavedId(null);
    const requestKey = JSON.stringify(request);
    const previous = checkpoint.current?.request === requestKey ? checkpoint.current : null;
    const start = previous?.completed ?? 0;
    setCompleted(start);
    let assembled: Partial<LessonPackage> = previous?.lesson ?? {};
    let activePart = "Lesson setup";
    try {
      for (let i = start; i < PHASES.length; i++) {
        const stage = PHASES[i]!.key;
        activePart = PHASES[i]!.labels[0];
        setPhase(stage);
        const result = (await trackClientGeneration(request,stage,()=>runStage({
          data: { request, stage, prior: assembled },
        }))) as Partial<LessonPackage>;
        assembled = mergeLessonPatch(assembled, result);
        checkpoint.current = { request: requestKey, completed: i + 1, lesson: assembled };
        setCompleted(i + 1);
      }
      setLesson(assembled as LessonPackage);
      setGeneratedFor(request);
      checkpoint.current = null;
    } catch (error) {
      setFailedPart(activePart);
      setFailure(
        error instanceof Error
          ? error.message
          : "Something went wrong while building the class. Please try again.",
      );
    } finally {
      setPhase(null);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = lessonRequestSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error("Please complete the highlighted fields.");
      return;
    }
    setErrors({});
    void build(parsed.data);
  }

  async function onSave() {
    if (!lesson || !generatedFor) return;
    if (!isAuthenticated) {
      toast.info("Sign in to save this lesson.");
      navigate({ to: "/auth", search: { redirect: "/builder" } });
      return;
    }
    setSaving(true);
    try {
      const { id } = await persist({ data: { request: generatedFor, content: lesson } });
      setSavedId(id);
      toast.success("Lesson saved to My lessons.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We could not save this lesson.");
    } finally {
      setSaving(false);
    }
  }

  if (phase) {
    return (
      <AppShell>
        <GenerationProgress completed={completed} current={phase} />
      </AppShell>
    );
  }

  if (lesson && generatedFor) {
    return (
      <AppShell>
        <LessonPackageView
          lesson={lesson}
          request={generatedFor}
          onPersist={async (next) => {
            setLesson(next);
            if (savedId) await persistUpdate({ data: { id: savedId, content: next } });
          }}
          actions={
            <>
              <Button onClick={onSave} disabled={saving || !!savedId}>
                <Save className="size-4" />
                {savedId ? "Saved" : saving ? "Saving…" : "Save lesson"}
              </Button>
              <Button variant="ghost" onClick={() => setLesson(null)}>
                Edit inputs
              </Button>
              {savedId && <LessonFeedback lessonId={savedId} />}
            </>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-5 py-12">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase">
          <Sparkles className="size-3.5" />
          Lesson builder
        </span>
        <h1 className="display-heading mt-4 text-3xl">Build my class</h1>
        <QuickStartTip />
        <BetaAccess onAccess={setBetaAllowed} onOpen={request => { setForm(request); void build(request); }} />
        <p className="mt-2 text-muted-foreground">
          Tell us the essentials. We will make sensible choices for anything you leave blank.
        </p>

        {failure ? (
          <Alert variant="destructive" className="mt-6">
            <AlertCircle className="size-4" />
            <AlertTitle>Could not complete: {failedPart}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{failure}</p>
              <p>{completed} of {PHASES.length} parts completed. With unchanged inputs, retry continues from the failed part. Keep this page open to retain progress.</p>
              <Button size="sm" variant="outline" onClick={() => void build(form)}>
                Retry failed part
              </Button>
              <ReportProblem context={{topic: form.topic, studentAge: form.studentAge, level: form.level, section: failedPart || 'Lesson generation'}} />
            </AlertDescription>
          </Alert>
        ) : null}

        <SavedClasses form={form} onApply={settings=>{setForm(previous=>({...previous,...settings}));setErrors({});}} />
        <form onSubmit={submit} className="mt-8 space-y-8">
          <fieldset disabled={!betaAllowed} className="space-y-8 disabled:opacity-60">
          <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <Sparkles className="size-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Class essentials</h2>
                <p className="text-sm text-muted-foreground">
                  Fields marked <span className="text-destructive">*</span> are required.
                </p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">

              <Field label="Subject" error={errors["subject"]}>
                <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} />
              </Field>
              <Field label="Topic" required error={errors["topic"]}>
                <Input
                  placeholder="Present Perfect"
                  value={form.topic}
                  onChange={(e) => set("topic", e.target.value)}
                />
              </Field>
              <Field label="Student age" required error={errors["studentAge"]}>
                <Select value={form.studentAge} onValueChange={(v) => set("studentAge", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an age range" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGE_OPTIONS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="English level" required error={errors["level"]}>
                <Select value={form.level} onValueChange={(v) => set("level", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a CEFR level" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Class duration" required error={errors["durationMinutes"]}>
                <Select
                  value={String(form.durationMinutes)}
                  onValueChange={(v) => set("durationMinutes", Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`${form.durationMinutes} minutes`} />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Learning objective" required error={errors["learningObjective"]}>
              <Textarea
                rows={3}
                placeholder="Students will be able to ask and answer questions about life experiences using the present perfect."
                value={form.learningObjective}
                onChange={(e) => set("learningObjective", e.target.value)}
              />
            </Field>

            <Field label="Main skill" required error={errors["mainSkill"]}>
              <div className="flex flex-wrap gap-2">
                {SKILL_OPTIONS.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => set("mainSkill", skill)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm transition-colors",
                      form.mainSkill === skill
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted",
                    )}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Secondary skill">
              <div className="flex flex-wrap gap-2">
                {(["None", ...SECONDARY_SKILL_OPTIONS] as const).map((skill) => {
                  const value = skill === "None" ? null : skill;
                  const active = (form.secondarySkill ?? null) === value;
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => set("secondarySkill", value)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm transition-colors",
                        active
                          ? "border-secondary-foreground/20 bg-secondary text-secondary-foreground"
                          : "bg-background hover:bg-muted",
                      )}
                    >
                      {skill}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                A supporting skill that helps students reach the main skill. It gets less time
                than the main skill.
              </p>
            </Field>



            <div className="rounded-lg border border-primary/25 bg-accent/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <Users className="size-4" />
                  </span>
                  <div>
                    <Label htmlFor="group-work" className="text-sm font-semibold">
                      Group work
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Design the whole class around collaborative groups.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {form.groupWorkEnabled ? "On" : "Off"}
                  </span>
                  <Switch
                    id="group-work"
                    checked={form.groupWorkEnabled}
                    onCheckedChange={(checked) => {
                      set("groupWorkEnabled", checked);
                      set("studentsPerGroup", checked ? 4 : null);
                    }}
                  />
                </div>
              </div>
              {form.groupWorkEnabled ? (
                <div className="mt-4 max-w-[220px]">
                  <Field label="Students per group" error={errors["studentsPerGroup"]}>
                    <Input
                      type="number"
                      min={2}
                      max={20}
                      value={form.studentsPerGroup ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        set("studentsPerGroup", raw === "" ? null : Number(raw));
                      }}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </div>


          <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-warning/15 text-warning-foreground">
                <ListPlus className="size-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold">Optional information</h2>
                <p className="text-sm text-muted-foreground">
                  Skip anything you don't need — we'll assume sensible defaults.
                </p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Number of students">
                <Input
                  placeholder="24"
                  value={form.numberOfStudents ?? ""}
                  onChange={(e) => set("numberOfStudents", e.target.value)}
                />
              </Field>
              <Field label="Previous knowledge">
                <Input
                  placeholder="Past simple"
                  value={form.previousKnowledge ?? ""}
                  onChange={(e) => set("previousKnowledge", e.target.value)}
                />
              </Field>
              <Field label="Curriculum standard">
                <Input
                  placeholder="CEFR B1.2 / national standard"
                  value={form.curriculumStandard ?? ""}
                  onChange={(e) => set("curriculumStandard", e.target.value)}
                />
              </Field>
              <Field label="Technology available">
                <Select
                  value={form.technologyAvailable ?? ""}
                  onValueChange={(v) => set("technologyAvailable", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="What can you use in class?" />
                  </SelectTrigger>
                  <SelectContent>
                    {TECHNOLOGY_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Preferred teaching style">
                <Select value={form.teachingStyle ?? ""} onValueChange={(v) => set("teachingStyle", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a style" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEACHING_STYLE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Homework requirement">
                <Select
                  value={form.homeworkRequirement ?? ""}
                  onValueChange={(v) => set("homeworkRequirement", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Do you need homework?" />
                  </SelectTrigger>
                  <SelectContent>
                    {HOMEWORK_OPTIONS.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Classroom limitations">
                <Input
                  placeholder="No printing, fixed desks, short attention span…"
                  value={form.classroomLimitations ?? ""}
                  onChange={(e) => set("classroomLimitations", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Required vocabulary">
              <Input
                placeholder="ever, never, already, yet"
                value={form.requiredVocabulary ?? ""}
                onChange={(e) => set("requiredVocabulary", e.target.value)}
              />
            </Field>
            <Field label="Teacher notes">
              <Textarea
                rows={3}
                placeholder="Anything else we should know about this class?"
                value={form.teacherNotes ?? ""}
                onChange={(e) => set("teacherNotes", e.target.value)}
              />
            </Field>
          </div>


          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg">
              <Sparkles className="size-4" />
              Build My Class
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={() => setForm(EXAMPLE)}>
              Fill the example
            </Button>
          </div>
          </fieldset>
        </form>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
