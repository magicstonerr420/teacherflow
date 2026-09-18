import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { SiteNavigation } from './SiteNavigation';
import { ReportProblem } from "./ReportProblem";
import { CONTACT_EMAIL, INQUIRY_LINK } from "@/config/contact";

export function AppShell({ children }: { children: ReactNode }) {

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
      <main>{children}</main>
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
