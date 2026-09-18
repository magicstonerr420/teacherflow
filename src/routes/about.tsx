import { createFileRoute, Link } from '@tanstack/react-router';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { INQUIRY_LINK } from '@/config/contact';

export const Route = createFileRoute('/about')({
  head:()=>({meta:[
    {title:'About TeacherFlow — Practical lesson preparation'},
    {name:'description',content:'Learn how TeacherFlow helps English teachers prepare, review, and adapt lesson plans and classroom materials.'},
  ]}),
  component:AboutPage,
});

function AboutPage() {
  return <AppShell>
    <div className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
      <header className="max-w-3xl space-y-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">About TeacherFlow</p>
        <h1 className="display-heading text-4xl sm:text-5xl">Practical lesson preparation for English teachers.</h1>
        <p className="text-lg leading-relaxed text-muted-foreground">TeacherFlow helps English teachers bring lesson planning and classroom materials into one place. Our purpose is to make preparation more manageable while keeping teachers in control of what they teach.</p>
      </header>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <section className="space-y-3 rounded-xl border bg-card p-6">
          <h2 className="display-heading text-2xl">What we do</h2>
          <p className="leading-relaxed text-muted-foreground">We help turn a learning objective into a connected lesson package: a lesson plan, activities, worksheets, answer keys, presentation materials, and assessment tasks. Lessons are shaped around your students’ age, English level, class length, and available resources.</p>
        </section>
        <section className="space-y-3 rounded-xl border bg-card p-6">
          <h2 className="display-heading text-2xl">How it works</h2>
          <p className="leading-relaxed text-muted-foreground">Share your topic, learning objective, and classroom details. TeacherFlow uses AI-assisted tools to prepare and organize the materials. You can then review, edit, save, and export them for your class.</p>
        </section>
      </div>
      <section className="mt-6 space-y-3 rounded-xl border border-primary/20 bg-accent/40 p-6 sm:p-8">
        <h2 className="display-heading text-2xl">Your classroom. Your decisions.</h2>
        <p className="leading-relaxed text-muted-foreground">You know your students best. TeacherFlow supports your preparation; your judgment guides the final lesson. Review the content and adjust it to suit your learners before using it.</p>
      </section>
      <section className="mt-10 max-w-3xl space-y-3">
        <h2 className="display-heading text-2xl">Growing with teacher feedback</h2>
        <p className="leading-relaxed text-muted-foreground">TeacherFlow is currently in beta. Feedback from teachers helps us identify what works, improve the materials, and decide what to build next.</p>
      </section>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg"><Link to="/builder">Build a lesson</Link></Button>
        <Button asChild size="lg" variant="outline"><a href={INQUIRY_LINK}>Contact us</a></Button>
      </div>
    </div>
  </AppShell>;
}
