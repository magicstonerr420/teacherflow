import { LessonText } from '@/components/lesson/LessonText';
import { BookOpen, Printer } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ReadingReference } from "@/components/lesson/ReadingReference";
import type { PublicStudentShare } from "@/lib/student-share";
import { pictureUrl, worksheetItemPrompt, worksheetPictureKey } from "@/lib/young-learners";

/** Accept only the public allowlisted DTO. Never pass a full saved lesson here. */
export function StudentLessonView({ share }: { share: PublicStudentShare | null }) {
  const [version, setVersion] = useState<"A" | "B">("A");
  if (!share)
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-5 py-12 text-center">
        <BookOpen className="mx-auto mb-5 size-8 text-primary" />
        <h1 className="display-heading text-3xl">This student link is unavailable</h1>
        <p className="mt-4 text-muted-foreground">
          Ask your teacher for a current link to the lesson materials.
        </p>
      </main>
    );
  const worksheet =
    version === "B" && share.worksheet?.studentB
      ? share.worksheet.studentB
      : share.worksheet?.student;
  const sections = [
    share.worksheet && ["worksheet", "Worksheet"],
    share.reading && ["reading", "Reading"],
    share.listening && ["listening", "Listening"],
    share.homework && ["homework", "Homework"],
  ].filter(Boolean) as string[][];
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-8 text-foreground [overflow-wrap:anywhere] print:max-w-none print:px-0 print:py-0">
      <header className="space-y-4 border-b pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 font-semibold text-primary">
            <BookOpen className="size-5" />
            TeacherFlow{" "}
            <span className="font-normal text-muted-foreground">· Student materials</span>
          </span>
          <Button variant="outline" className="print:hidden" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print materials
          </Button>
        </div>
        <h1 className="display-heading text-3xl sm:text-4xl">{share.title}</h1>
        <p className="text-sm text-muted-foreground">
          Complete the activities as your teacher directs. Write your answers in your notebook or on
          a printed copy.
        </p>
        <nav aria-label="Student materials" className="flex flex-wrap gap-2 print:hidden">
          {sections.map(([id, label]) => (
            <a
              key={id}
              href={`#student-${id}`}
              className="rounded-full border px-3 py-1.5 text-sm hover:bg-accent"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      {share.worksheet && (
        <section
          id="student-worksheet"
          aria-labelledby="student-worksheet-heading"
          className="scroll-mt-4 space-y-5"
        >
          <h2 id="student-worksheet-heading" className="display-heading text-2xl">
            Worksheet
          </h2>
          {share.worksheet.studentB && (
            <div className="space-y-2 print:hidden">
              <label htmlFor="student-version" className="text-sm font-medium">
                Worksheet version
              </label>
              <select
                id="student-version"
                className="ml-3 rounded-md border bg-background px-3 py-2 text-sm"
                value={version}
                onChange={(event) => setVersion(event.target.value as "A" | "B")}
              >
                <option value="A">Version A</option>
                <option value="B">Version B</option>
              </select>
            </div>
          )}
          {worksheet && (
            <>
              <h3 className="font-semibold">
                {worksheet.title}
                {share.worksheet.studentB ? ` · Version ${version}` : ""}
              </h3>
              <Text>{worksheet.instructions}</Text>
              {worksheet.sections.map((section, index) => (
                <article
                  key={index}
                  className="space-y-4 rounded-xl border bg-card p-5 print:rounded-none print:border-0 print:p-0"
                >
                  <h4 className="text-lg font-semibold">
                    {section.label}
                    {section.label && section.title ? " · " : ""}
                    {section.title}
                  </h4>
                  <Text>{section.instructions}</Text>
                  {section.passage && (
                    <div className="rounded-lg bg-accent/40 p-4 print:border print:bg-transparent">
                      <Text>{section.passage}</Text>
                      <ReadingReference text={section.passage} />
                    </div>
                  )}
                  {!!section.wordBank.length && (
                    <p className="text-sm">
                      <strong>Word bank: </strong>
                      {section.wordBank.join(" · ")}
                    </p>
                  )}
                  <ol className="space-y-5">
                    {section.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="break-inside-avoid space-y-2">
                        <p className="flex gap-2 text-sm leading-7">
                          <span className="shrink-0 font-semibold">{item.number}.</span>
                          <LessonText className="flex-1">{worksheetItemPrompt(item)}</LessonText>
                        </p>
                        {pictureUrl(worksheetPictureKey(item)) && (
                          <img
                            src={pictureUrl(worksheetPictureKey(item))!}
                            alt="Picture clue"
                            className="h-28 w-28 object-contain"
                          />
                        )}
                        <Choices values={item.choices} />
                        {item.answerLines > 0 && (
                          <div aria-label="Space for your answer" className="space-y-6 py-2">
                            {Array.from({ length: Math.min(item.answerLines, 6) }, (_, line) => (
                              <div key={line} className="h-px border-b border-dotted" />
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </article>
              ))}
            </>
          )}
        </section>
      )}

      {share.reading && (
        <section
          id="student-reading"
          aria-labelledby="student-reading-heading"
          className="scroll-mt-4 space-y-4 border-t pt-6"
        >
          <h2 id="student-reading-heading" className="display-heading text-2xl">
            Reading
          </h2>
          <h3 className="font-semibold">{share.reading.title}</h3>
          <Text>{share.reading.instructions}</Text>
          <div className="rounded-xl border bg-card p-5">
            <Text>{share.reading.text}</Text>
            <ReadingReference text={share.reading.text} />
          </div>
          <Questions questions={share.reading.questions} />
        </section>
      )}

      {share.listening && (
        <section
          id="student-listening"
          aria-labelledby="student-listening-heading"
          className="scroll-mt-4 space-y-4 border-t pt-6"
        >
          <h2 id="student-listening-heading" className="display-heading text-2xl">
            Listening
          </h2>
          <h3 className="font-semibold">{share.listening.title}</h3>
          <Text>{share.listening.instructions}</Text>
          {share.listening.audio &&
            /^data:audio\/mpeg;base64,/.test(share.listening.audio.dataUrl) && (
              <div className="space-y-2 print:hidden">
                <audio
                  aria-label="Lesson recording"
                  controls
                  preload="metadata"
                  className="w-full"
                  src={share.listening.audio.dataUrl}
                >
                  Your browser cannot play this recording.
                </audio>
                <p className="text-xs text-muted-foreground">
                  Use the player to listen and replay the recording.
                </p>
              </div>
            )}
          <p className="hidden text-sm print:block">
            Listen to the recording using your teacher's student link.
          </p>
          <Questions questions={share.listening.questions} />
        </section>
      )}

      {share.homework && (
        <section
          id="student-homework"
          aria-labelledby="student-homework-heading"
          className="scroll-mt-4 space-y-4 border-t pt-6"
        >
          <h2 id="student-homework-heading" className="display-heading text-2xl">
            Homework
          </h2>
          <h3 className="font-semibold">{share.homework.title}</h3>
          <Text>{share.homework.instructions}</Text>
          {share.homework.estimatedTime && (
            <p className="text-sm text-muted-foreground">
              Suggested time: {share.homework.estimatedTime}
            </p>
          )}
          <ol className="list-outside list-decimal space-y-3 pl-5 text-sm leading-7">
            {share.homework.tasks.map((task, index) => (
              <li key={index} className="whitespace-pre-wrap">
                <LessonText>{task}</LessonText>
              </li>
            ))}
          </ol>
        </section>
      )}
      <footer className="border-t pt-5 text-xs text-muted-foreground print:hidden">
        Materials updated {new Date(share.updatedAt).toLocaleDateString()}. This link expires{" "}
        {new Date(share.expiresAt).toLocaleString()}. Ask your teacher if you need help with an
        activity.
      </footer>
    </main>
  );
}

function Text({ children }: { children: string }) {
  return children ? <LessonText className="text-sm">{children}</LessonText> : null;
}

function Choices({ values }: { values: string[] }) {
  return values.length ? (
    <ul className="ml-5 list-disc space-y-1 text-sm leading-6">
      {values.map((choice, index) => (
        <li key={index}><LessonText>{choice}</LessonText></li>
      ))}
    </ul>
  ) : null;
}

function Questions({ questions }: { questions: { question: string; choices: string[] }[] }) {
  return questions.length ? (
    <div className="space-y-3">
      <h3 className="font-semibold">Questions</h3>
      <ol className="space-y-5">
        {questions.map((question, index) => (
          <li key={index} className="break-inside-avoid space-y-2">
            <p className="flex gap-2 text-sm leading-7">
              <strong className="shrink-0">{index + 1}.</strong>
              <LessonText className="flex-1">{question.question}</LessonText>
            </p>
            <Choices values={question.choices} />
            <div aria-label="Space for your answer" className="h-8 border-b border-dotted" />
          </li>
        ))}
      </ol>
    </div>
  ) : null;
}
