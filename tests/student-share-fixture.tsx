import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudentShareDialog } from "../src/components/StudentShareDialog";
import { StudentLessonView } from "../src/components/StudentLessonView";
import "../src/styles.css";

export function mount() {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Fixture() {
    const [userId, setUserId] = React.useState<string | undefined>("teacher-a");
    const [view, setView] = React.useState("teacher");
    const fixture = window as any;
    fixture.setShareUser = (next: string | undefined) => {
      fixture.testUser = next;
      setUserId(next);
    };
    fixture.setShareView = setView;
    if (view === "public") return <StudentLessonView share={fixture.publicShare} />;
    if (view === "unavailable") return <StudentLessonView share={null} />;
    return (
      <div className="mx-auto max-w-4xl px-5 py-12">
        <StudentShareDialog lessonId="lesson-a" userId={userId} />
      </div>
    );
  }
  createRoot(container).render(
    <QueryClientProvider client={cache}>
      <Fixture />
    </QueryClientProvider>,
  );
}
