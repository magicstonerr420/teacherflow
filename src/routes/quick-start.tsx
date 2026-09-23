import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ReportProblem } from "@/components/ReportProblem";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/quick-start")({
  head: () => ({
    meta: [
      { title: "Quick-start guide — TeacherFlow" },
      {
        name: "description",
        content:
          "Create, save, and download your first TeacherFlow lesson. Learn about worksheets, reading, audio, and your beta allowance.",
      },
    ],
  }),
  component: QuickStartPage,
});

function QuickStartPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-8 px-5 py-10 sm:py-14">
        <header className="space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <BookOpen className="size-4" />
            START HERE
          </span>
          <h1 className="display-heading text-4xl">Your first lesson, step by step</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            From one topic to materials you can take into class. Return to this guide whenever you
            need it.
          </p>
          <Button asChild>
            <Link to="/builder">
              Open Lesson builder
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </header>

        <section
          aria-label="Teacher beta allowance"
          className="rounded-2xl border border-primary/20 bg-accent/40 p-5 sm:p-6"
        >
          <h2 className="font-semibold">Your invited teacher allowance</h2>
          <dl className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">Lessons</dt>
              <dd className="text-xl font-semibold">3 per account</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Illustrations</dt>
              <dd className="text-xl font-semibold">Up to 6 per lesson</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Audio recordings</dt>
              <dd className="text-xl font-semibold">1 per lesson</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">
            Reopening saved work, replaying audio, and downloading it again do not use another
            lesson allowance. The owner's testing allowance is separate.
          </p>
        </section>

        <ol className="space-y-4">
          <Step number={1} title="Sign in and claim your invitation">
            Open the invitation link your organizer sent, then sign in with Google or your email.
            Use that same account each time. The link claims your invitation after sign-in; if you
            were given a code, paste it into <strong>Invitation code</strong> in the builder and
            click <strong>Claim invitation</strong>. Signing in alone does not give generation
            access.
          </Step>
          <Step number={2} title="Tell us about your class">
            In <strong>Lesson builder</strong>, choose a topic, student age, English level,
            duration, main skill, and learning objective. Set the technology you have, including{" "}
            <strong>No technology</strong> when appropriate. Click <strong>Build My Class</strong>{" "}
            and let the lesson parts finish. Starting a new lesson reserves one of your three slots.
          </Step>
          <Step number={3} title="Review and save your lesson">
            Browse <strong>Lesson Plan</strong>, <strong>Worksheet</strong>, and the other sections.
            Check the content before teaching. The worksheet has <strong>Teacher</strong>,{" "}
            <strong>Student</strong>, and <strong>Answer Key</strong> views; choose{" "}
            <strong>Version A</strong> or <strong>Version B</strong> when available. When you are
            signed in, completed lessons save automatically to <strong>My lessons</strong>. If
            saving is interrupted, use <strong>Retry saving lesson</strong>; the completed draft
            stays available under <strong>Unfinished</strong>. Save edits with{" "}
            <strong>Save Changes</strong>.
          </Step>
          <Step number={4} title="Find Reading and Listening">
            Open <strong>Reading</strong> for the passage and comprehension work when your lesson
            includes a reading activity. Open <strong>Listening</strong> for the script and audio
            controls. Choose a voice before generating your one recording. You can replay, rewind,
            slow down, and download the saved recording. A no-technology lesson can use the teacher
            reading aloud. On a small screen, use the section dropdown above the lesson content.
          </Step>
          <Step number={5} title="Download your classroom materials">
            Use <strong>Download Complete Lesson</strong> for the package, or{" "}
            <strong>Print / Save as PDF</strong>. In <strong>Worksheet</strong>, choose the version
            and Student, Teacher, or Answer Key view before downloading its PDF. In{" "}
            <strong>Presentation</strong>, use <strong>Generate PowerPoint</strong>. Reuse completed
            illustrations when exporting again. Use the Student worksheet for your class and keep
            the Teacher worksheet and Answer Key for yourself.
          </Step>
          <Step number={6} title="Resume when something is interrupted">
            If generation stops, click <strong>Retry failed part</strong>. You can also reopen{" "}
            <strong>My lessons → Unfinished</strong> and choose{" "}
            <strong>Continue unfinished lesson</strong>, even after closing the browser. The
            original settings and completed parts are restored, using the same lesson slot. If a
            part is still running, wait for its progress to update before continuing. Changing the
            inputs starts a different lesson. If retries are exhausted, report the problem so your
            organizer can help. Reopen completed lessons from <strong>My lessons</strong>.
          </Step>
          <Step number={7} title="Organize lessons by class">
            In <strong>My lessons → Classes</strong>, open a saved class or create one. Choose{" "}
            <strong>Add saved lesson</strong> to keep its materials together. Enter a{" "}
            <strong>Taught date</strong> and optional <strong>Class notes</strong>, then save the
            teaching details. <strong>Teaching history</strong> shows what you have taught. The same
            lesson can belong to more than one class; removing it from a class keeps the original in
            your lesson library.
          </Step>
          <Step number={8} title="Share materials with students">
            Open a saved lesson from <strong>My lessons</strong> and choose{" "}
            <strong>Share with students</strong>. Select the student worksheet, reading, saved
            listening recording, or homework, then create a link that expires in 7 or 30 days.{" "}
            <strong>Preview student view</strong> before copying the link into your class message.
            Students do not need an account. Answer keys, teacher notes, and your account details
            are excluded. Save edits first, then use <strong>Refresh shared materials</strong> to
            update the same link, or <strong>Revoke link</strong> to stop access.
          </Step>
        </ol>

        <section className="space-y-3 rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="display-heading text-2xl">Something not working?</h2>
          <p className="text-sm text-muted-foreground">
            Use <strong>Report a problem</strong> in the lesson section where it happened. The
            report includes the topic, age, level, and section; worksheet reports also include the
            selected version and view. Add what happened and the steps you took.
          </p>
          <p className="text-sm text-muted-foreground">
            Choose <strong>Open email draft</strong>, review it, then send it from your email app.
            If your email app does not open, choose <strong>Copy report</strong> and paste it into
            an email. You can attach a screenshot there.
          </p>
          <div className="flex flex-wrap gap-2">
            <ReportProblem />
            <Button asChild variant="outline">
              <Link to="/builder">
                Go to Lesson builder
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-2xl border bg-card p-5 sm:p-6">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
      >
        {number}
      </span>
      <div className="min-w-0 space-y-2">
        <h2 className="display-heading text-xl">{title}</h2>
        <p className="text-sm leading-7 text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}
