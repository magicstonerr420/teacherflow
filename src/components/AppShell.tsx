import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useBetaStatus";
import { supabase } from "@/integrations/supabase/client";
import { ReportProblem } from "./ReportProblem";
import { CONTACT_EMAIL, INQUIRY_LINK } from "@/config/contact";

export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { status: beta } = useBetaStatus();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="no-print sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/teacherflow-icon.svg" alt="" width={36} height={36} className="size-9" />
            <span className="display-heading text-lg">TeacherFlow</span>
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/builder">Lesson builder</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/quick-start" activeProps={{className:'bg-accent', 'aria-current':'page'}}>Quick-start guide</Link>
            </Button>
            {isAuthenticated ? (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/lessons">My lessons</Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/profile" activeProps={{className:'bg-accent','aria-current':'page'}}>My profile</Link>
                </Button>
                {beta?.owner && <Button variant="ghost" size="sm" asChild>
                  <Link to="/beta-management" activeProps={{className:'bg-accent', 'aria-current':'page'}}>Beta management</Link>
                </Button>}
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/auth" search={{password:true}}>Set password</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut className="size-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
          </nav>
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
