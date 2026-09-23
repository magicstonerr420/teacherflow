import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { SiteNavigation } from './SiteNavigation';
import { ReportProblem } from "./ReportProblem";
import { CONTACT_EMAIL, INQUIRY_LINK } from "@/config/contact";
import { useAuth } from '@/hooks/useAuth';
import { Button } from './ui/button';

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="no-print sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/teacherflow-icon.svg" alt="" width={36} height={36} className="size-9" />
            <span className="display-heading text-lg">TeacherFlow</span>
          </Link>
          <SiteNavigation />
        </div>
      </header>
      <main>
        {auth.error && <div role="alert" className="mx-auto mt-5 flex max-w-6xl flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-card px-5 py-4">
          <p className="flex-1 text-sm">{auth.error}</p>
          <Button variant="outline" size="sm" onClick={auth.retry}>Retry account connection</Button>
        </div>}
        {children}
      </main>
      <footer className="no-print border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8">
          <div className="text-sm"><p className="font-semibold">Questions about TeacherFlow?</p>
            <a href={INQUIRY_LINK} className="mt-1 inline-block break-all text-primary underline underline-offset-4">{CONTACT_EMAIL}</a>
          </div>
          <ReportProblem />
        </div>
      </footer>
    </div>
  );
}
