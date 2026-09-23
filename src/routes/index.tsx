import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ClipboardList, FileText, GraduationCap, Layers } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TeacherFlow — One topic. One complete class." },
      {
        name: "description",
        content:
          "Enter your topic, level and class length. TeacherFlow builds the lesson plan, slides, worksheet, answer key, assessment and differentiated versions.",
      },
      { property: "og:title", content: "TeacherFlow — One topic. One complete class." },
      {
        property: "og:description",
        content: "Turn your lesson idea into a classroom-ready lesson package in minutes.",
      },
    ],
  }),
  component: Home,
});

const INCLUDED = [
  {
    icon: ClipboardList,
    title: "Timed lesson plan",
    text: "Stage by stage, adding up to your exact class length.",
    tint: "bg-primary/12 text-primary",
  },
  {
    icon: Layers,
    title: "Slides & worksheet",
    text: "Student-facing materials you can display and print.",
    tint: "bg-warning/20 text-warning-foreground",
  },
  {
    icon: FileText,
    title: "Answer key & assessment",
    text: "Plus homework, exit ticket and a second version.",
    tint: "bg-success/15 text-success",
  },
  {
    icon: GraduationCap,
    title: "Support & challenge",
    text: "Real scaffolding and real extension, not filler.",
    tint: "bg-accent text-accent-foreground",
  },
];

function Home() {
  return (
    <AppShell>
      <section className="bg-accent/40">
        <div className="mx-auto max-w-3xl px-5 pt-24 pb-20 text-center">
          <p className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold tracking-widest text-primary uppercase">
            For English teachers
          </p>
          <h1 className="display-heading mt-5 text-5xl leading-[1.05] sm:text-6xl">
            One topic. One complete class.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Turn your lesson idea into a classroom-ready lesson package in minutes.
          </p>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">Explore TeacherFlow freely. Creating lessons requires an active private-beta invitation.</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/builder">
                Build My Class
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/examples" search={{}}>
                View Example
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INCLUDED.map((item) => (
            <div key={item.title} className="rounded-xl border bg-card p-5 shadow-sm">
              <span
                className={`flex size-9 items-center justify-center rounded-lg ${item.tint}`}
              >
                <item.icon className="size-5" />
              </span>
              <h2 className="mt-4 text-base font-semibold">{item.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

    </AppShell>
  );
}
