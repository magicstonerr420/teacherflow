import {PdfPreview} from './PdfPreview';
import { pictureUrl, worksheetPictureKey, worksheetItemPrompt, worksheetPictureIssues } from '@/lib/young-learners';
import { prepareShapeWorksheet } from '@/lib/worksheet-shapes';
import { ReadingReference } from './ReadingReference';
import { Download, Printer } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { studentPdf, buildAnswerKeyPdf, buildTeacherWorksheetPdf, safeSlug } from "@/lib/exports";
import { downloadBlob } from "@/lib/pptx";
import { cn } from "@/lib/utils";
import { ageBand } from "@/lib/lesson-schema";
import type { LessonRequestInput, Worksheet } from "@/lib/lesson-schema";

type Tab = "teacher" | "student" | "answers";
type Version = "A" | "B";

type StudentDoc = Worksheet["student"];
type TeacherSection = Worksheet["teacher"]["sections"][number];

/* --------------------------- age-aware presentation ----------------------- */

type Band = "Kids" | "Teens" | "Adults";

const BAND_STYLES: Record<Band, { paper: string; heading: string; section: string; item: string }> = {
  Kids: {
    paper: "text-[18px] leading-[1.9]",
    heading: "text-3xl",
    section: "text-lg",
    item: "text-[18px]",
  },
  Teens: {
    paper: "text-[15px] leading-relaxed",
    heading: "text-2xl",
    section: "text-base",
    item: "text-[15px]",
  },
  Adults: {
    paper: "text-[15px] leading-relaxed",
    heading: "text-2xl",
    section: "text-base",
    item: "text-[15px]",
  },
};

function PictureClue({ item }: { item: StudentDoc['sections'][number]['items'][number] }) {
  const src = pictureUrl(worksheetPictureKey(item));
  return src ? <img src={src} alt="Picture clue" className="mb-3 block h-28 w-28 object-contain" /> : null;
}

/* --------------------------------- hub ------------------------------------ */

export function WorksheetHub({
  worksheet,
  request,
  answerKey,
}: {
  worksheet: Worksheet;
  request: LessonRequestInput;
  answerKey?: { sections: { title: string; answers: string[]; notes: string }[] };
}) {
  worksheet = { ...worksheet, student: prepareShapeWorksheet(worksheet.student, request), studentB: prepareShapeWorksheet(worksheet.studentB, request) };
  const [tab, setTab] = useState<Tab>("teacher");
  const [version, setVersion] = useState<Version>("A");
  const [pdfFile,setPdfFile]=useState<{blob:Blob;name:string}|null>(null);
  const [exporting, setExporting] = useState(false);

  const studentRef = useRef<HTMLDivElement>(null);
  const teacherRef = useRef<HTMLDivElement>(null);
  const answersRef = useRef<HTMLDivElement>(null);

  const band = ageBand(request.studentAge);
  const hasVersionB = (worksheet.studentB?.sections?.length ?? 0) > 0;

  const studentDoc: StudentDoc =
    version === "B" && hasVersionB ? worksheet.studentB : worksheet.student;
  const teacherSections: TeacherSection[] =
    version === "B" && hasVersionB && worksheet.teacherB?.length
      ? worksheet.teacherB
      : worksheet.teacher.sections;

  const label = tab === "student" ? "Student Worksheet" : tab === "answers" ? "Answer Key" : "Teacher Worksheet";
  const pictureIssues = worksheetPictureIssues(studentDoc);

  async function onPdf(preview = false) {
    setExporting(true);
    try {
      const payload={worksheet,answerKey:answerKey??{sections:[]}};
      const blob = tab === "student"
        ? await studentPdf(studentDoc, request, version === "B" ? " (Version B)" : "")
        : tab === "teacher" ? await buildTeacherWorksheetPdf(payload,request,version) : await buildAnswerKeyPdf(payload,request,version);
      const name=`${safeSlug(request.topic)}_${tab}_${version}.pdf`;
      if(preview)setPdfFile({blob,name});else downloadBlob(blob,name);
    } catch (error) { toast.error(error instanceof Error ? error.message : "The PDF could not be created. Your worksheet is still available."); }
    finally {setExporting(false);}
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "teacher", label: "Teacher" },
    { key: "student", label: "Student" },
    { key: "answers", label: "Answer Key" },
  ];

  return (
    <div>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-md px-5 py-2 text-sm font-medium transition-colors",
                tab === t.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasVersionB ? (
            <div className="inline-flex rounded-lg border bg-muted p-1">
              {(["A", "B"] as Version[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVersion(v)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    version === v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Version {v}
                </button>
              ))}
            </div>
          ) : null}

          <Button variant="outline" size="sm" onClick={()=>void onPdf(true)} disabled={exporting}>
            <Printer className="size-4" />
            Preview / Print {label}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void onPdf()} disabled={exporting}>
            <Download className="size-4" />
            Download {tab === "answers" ? "Answer Key " : ""}PDF
          </Button>
        </div>
      </div>

      <PdfPreview file={pdfFile} onClose={()=>setPdfFile(null)}/>

      {pictureIssues.length > 0 && <div role="alert" className="no-print mt-4 rounded-lg border border-destructive p-4 text-destructive">
        <p className="font-semibold">This worksheet is missing required picture clues.</p>
        <p className="mt-1 text-sm">Add the missing clues before printing the student worksheet.</p>
        <ul className="mt-2 list-disc pl-5 text-sm">{pictureIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
      </div>}

      {tab === "student" && <div className="mt-6">
        <div ref={studentRef} className="worksheet-sheet rounded-xl border bg-card p-8">
          <StudentWorksheet doc={studentDoc} request={request} band={band} version={version} />
        </div>
      </div>}

      {tab === "teacher" && <div className="mt-6">
        <div ref={teacherRef} className="worksheet-sheet rounded-xl border bg-card p-8">
          <TeacherWorksheet
            worksheet={worksheet}
            studentDoc={studentDoc}
            teacherSections={teacherSections}
            request={request}
            band={band}
            version={version}
          />
        </div>
      </div>}

      {tab === "answers" && <div className="mt-6">
        <div ref={answersRef} className="worksheet-sheet rounded-xl border bg-card p-8">
          <AnswerKeySheet
            worksheet={worksheet}
            studentDoc={studentDoc}
            teacherSections={teacherSections}
            request={request}
            version={version}
            answerKey={answerKey}
          />
        </div>
      </div>}
    </div>
  );
}

/* ------------------------------- student --------------------------------- */

function StudentWorksheet({
  doc,
  request,
  band,
  version,
}: {
  doc: StudentDoc;
  request: LessonRequestInput;
  band: Band;
  version: Version;
}) {
  const style = BAND_STYLES[band];

  return (
    <div className={cn("worksheet-paper", style.paper)}>
      <header className="border-b-2 border-foreground pb-4">
        <h1 className={cn("display-heading", style.heading)}>
          {doc.title || "Worksheet"}
          {version === "B" ? " (Version B)" : ""}
        </h1>
        <div className="mt-3 flex flex-wrap gap-8 text-sm">
          <span className="flex-1">Name: ______________________________</span>
          <span>Class: ______________</span>
          <span>Date: ______________</span>
        </div>
        {request.groupWorkEnabled ? (
          <p className="mt-3 text-sm">
            Group: ______________ &nbsp; My role: ______________ &nbsp; (groups of{" "}
            {request.studentsPerGroup})
          </p>
        ) : null}
      </header>

      {doc.instructions ? <p className="mt-5 text-sm italic">{doc.instructions}</p> : null}

      <div className="mt-6 space-y-8">
        {doc.sections.map((section, i) => (
          <section key={i} className="worksheet-section print-block">
            <h2 className={cn("font-bold tracking-wide uppercase", style.section)}>
              {section.label} — {section.title}
            </h2>
            <p className="mt-1 text-sm italic">{section.instructions}</p>

            {section.passage ? (
              <div className="mt-3 rounded-md border border-foreground/25 p-4 whitespace-pre-line">
                {section.passage}
                <ReadingReference text={section.passage} />
              </div>
            ) : null}

            {section.wordBank.length ? (
              <div className="mt-3 rounded-md border border-dashed border-foreground/40 p-3">
                <p className="text-xs font-bold tracking-wide uppercase">Word bank</p>
                <p className="mt-1">{section.wordBank.join("  •  ")}</p>
              </div>
            ) : null}

            <ol className="mt-4 space-y-4">
              {section.items.map((item, j) => (
                <li key={j} className={cn("print-block flex gap-3", style.item)}>
                  <span className="w-6 shrink-0 font-semibold">{item.number || j + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-line">
                      <PictureClue item={item} />
                      {worksheetItemPrompt(item)}
                    </p>
                    {item.choices.length ? (
                      <ul className="mt-2 space-y-1 pl-1">
                        {item.choices.map((choice, k) => (
                          <li key={k} className="flex gap-2">
                            <span className="font-medium">{String.fromCharCode(97 + k)})</span>
                            <span>{choice}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {Array.from({ length: Math.max(0, Math.min(8, item.answerLines)) }).map((_, k) => (
                      <div
                        key={k}
                        className={cn(
                          "border-b border-foreground/35",
                          band === "Kids" ? "mt-6" : "mt-4",
                        )}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- teacher --------------------------------- */

function TeacherWorksheet({
  worksheet,
  studentDoc,
  teacherSections,
  request,
  band,
  version,
}: {
  worksheet: Worksheet;
  studentDoc: StudentDoc;
  teacherSections: TeacherSection[];
  request: LessonRequestInput;
  band: Band;
  version: Version;
}) {
  const t = worksheet.teacher;
  const style = BAND_STYLES[band];

  return (
    <div className={cn("worksheet-paper", style.paper)}>
      <header className="border-b-2 border-foreground pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className={cn("display-heading", style.heading)}>
            {worksheet.title} — Teacher master copy{version === "B" ? " (Version B)" : ""}
          </h1>
          <Badge variant="secondary">{request.level}</Badge>
          {request.secondarySkill ? (
            <Badge variant="outline">
              {request.mainSkill} + {request.secondarySkill}
            </Badge>
          ) : null}
        </div>
        {t.overview ? <p className="mt-3 text-sm">{t.overview}</p> : null}
        {request.groupWorkEnabled && t.groupWorkGuidance ? (
          <p className="mt-2 text-sm">
            <strong>Group work ({request.studentsPerGroup} per group):</strong> {t.groupWorkGuidance}
          </p>
        ) : null}
      </header>

      <div className="mt-6 space-y-8">
        {teacherSections.map((section, i) => {
          const studentSection = studentDoc.sections[i];
          return (
            <section key={i} className="print-block">
              <h2 className={cn("font-bold tracking-wide uppercase", style.section)}>
                {section.label} — {section.title}
              </h2>

              {studentSection ? (
                <div className="mt-3">
                  <p className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                    Questions
                  </p>
                  {studentSection.instructions ? (
                    <p className="mt-1 text-sm italic">{studentSection.instructions}</p>
                  ) : null}
                  {studentSection.passage ? <div className="mt-3 whitespace-pre-line rounded-md border p-3">{studentSection.passage}<ReadingReference text={studentSection.passage} /></div> : null}
                  {studentSection.wordBank.length ? (
                    <p className="mt-1 text-sm">Word bank: {studentSection.wordBank.join(", ")}</p>
                  ) : null}
                  <ol className="mt-2 space-y-1">
                    {studentSection.items.map((item, j) => (
                      <li key={j} className="flex gap-2">
                        <span className="w-6 shrink-0 font-medium">{item.number || j + 1}.</span>
                        <span className="min-w-0 flex-1">
                          <PictureClue item={item} />
                          {worksheetItemPrompt(item)}
                          {item.choices.length ? ` (${item.choices.join(" / ")})` : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              <TeacherBlock title="Answers" items={section.answers} ordered />
              {section.explanation ? (
                <div className="mt-3">
                  <p className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
                    Knowledge and explanation
                  </p>
                  <p className="mt-1 whitespace-pre-line">{section.explanation}</p>
                </div>
              ) : null}
              <TeacherBlock title="Expected answers (open items)" items={section.expectedResponses} />
              <TeacherBlock title="Common mistakes" items={section.commonErrors} />
              <TeacherBlock title="Suggested corrections" items={section.corrections} />
              {section.teacherNotes ? (
                <div className="mt-3 rounded-md bg-muted p-3">
                  <p className="text-xs font-bold tracking-wide uppercase">Teaching notes</p>
                  <p className="mt-1 whitespace-pre-line">{section.teacherNotes}</p>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ answer key -------------------------------- */

function AnswerKeySheet({
  worksheet,
  studentDoc,
  teacherSections,
  request,
  version,
  answerKey,
}: {
  worksheet: Worksheet;
  studentDoc: StudentDoc;
  teacherSections: TeacherSection[];
  request: LessonRequestInput;
  version: Version;
  answerKey?: { sections: { title: string; answers: string[]; notes: string }[] } | undefined;
}) {
  const sections = teacherSections.length
    ? teacherSections
    : (answerKey?.sections ?? []).map((s, i) => ({
        label: `Section ${String.fromCharCode(65 + i)}`,
        title: s.title,
        answers: s.answers,
        explanation: "",
        expectedResponses: [],
        commonErrors: [],
        corrections: [],
        teacherNotes: s.notes,
      }));

  return (
    <div className="worksheet-paper text-[15px] leading-relaxed">
      <header className="border-b-2 border-foreground pb-4">
        <h1 className="display-heading text-2xl">
          {worksheet.title} — Answer key{version === "B" ? " (Version B)" : ""}
        </h1>
        <p className="mt-2 text-sm">
          {request.level} · Ages {request.studentAge} · {request.mainSkill}
          {request.secondarySkill ? ` + ${request.secondarySkill}` : ""}
        </p>
      </header>

      <div className="mt-6 space-y-6">
        {sections.map((section, i) => {
          const studentSection = studentDoc.sections[i];
          return (
            <section key={i} className="print-block">
              <h2 className="text-base font-bold tracking-wide uppercase">
                {section.label} — {section.title}
              </h2>
              <ol className="mt-2 space-y-1.5">
                {section.answers.map((answer, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="w-6 shrink-0 font-medium">
                      {studentSection?.items[j]?.number ?? j + 1}.
                    </span>
                    <span className="min-w-0 flex-1">{answer}</span>
                  </li>
                ))}
              </ol>
              {section.expectedResponses.length ? (
                <p className="mt-2 text-sm">
                  <strong>Open items:</strong> {section.expectedResponses.join(" | ")}
                </p>
              ) : null}
              {section.teacherNotes ? (
                <p className="mt-1 text-sm text-muted-foreground">{section.teacherNotes}</p>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TeacherBlock({
  title,
  items,
  ordered,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
}) {
  if (!items?.length) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <div className="mt-3">
      <p className="text-xs font-bold tracking-wide uppercase text-muted-foreground">{title}</p>
      <List className={cn("mt-1 space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </List>
    </div>
  );
}
