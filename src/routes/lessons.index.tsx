import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, FileText, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { deleteLesson, duplicateLesson, listLessons } from "@/lib/lesson.functions";


export const Route = createFileRoute("/lessons/")({
  head: () => ({
    meta: [
      { title: "My lessons — TeacherFlow" },
      { name: "description", content: "Every lesson package you have saved, ready to open and print." },
      { property: "og:title", content: "My lessons — TeacherFlow" },
      { property: "og:description", content: "Your saved TeacherFlow lesson packages." },
    ],
  }),
  component: LessonsPage,
});

function LessonsPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const fetchLessons = useServerFn(listLessons);

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate({ to: "/auth", search: { redirect: "/lessons" } });
  }, [loading, isAuthenticated, navigate]);

  const { data, isPending, error } = useQuery({
    queryKey: ["lessons"],
    queryFn: () => fetchLessons(),
    enabled: isAuthenticated,
  });

  const queryClient = useQueryClient();
  const copyLesson = useServerFn(duplicateLesson);
  const removeLesson = useServerFn(deleteLesson);

  const duplicate = useMutation({
    mutationFn: (id: string) => copyLesson({ data: { id } }),
    onSuccess: () => {
      toast.success("Lesson duplicated.");
      void queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
    onError: () => toast.error("We could not duplicate this lesson. Please try again."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeLesson({ data: { id } }),
    onSuccess: () => {
      toast.success("Lesson deleted.");
      void queryClient.invalidateQueries({ queryKey: ["lessons"] });
    },
    onError: () => toast.error("We could not delete this lesson. Please try again."),
  });


  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-5 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="display-heading text-3xl">My lessons</h1>
          <Button asChild>
            <Link to="/builder">Build a new class</Link>
          </Button>
        </div>

        {error ? (
          <p className="mt-8 text-sm text-destructive">We could not load your lessons. Please refresh.</p>
        ) : null}

        {isPending && isAuthenticated ? (
          <div className="mt-8 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : null}

        {data && data.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed p-12 text-center">
            <FileText className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-4 font-medium">No saved lessons yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Build a class and save it — it will appear here.
            </p>
          </div>
        ) : null}

        <div className="mt-8 space-y-3">
          {data?.map((lesson) => (
            <div
              key={lesson.id}
              className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-5"
            >
              <Link
                to="/lessons/$id"
                params={{ id: lesson.id }}
                className="min-w-0 flex-1 hover:underline"
              >
                <p className="font-semibold">{lesson.topic}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {new Date(lesson.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </Link>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{lesson.level}</Badge>
                <Badge variant="secondary">Ages {lesson.student_age}</Badge>
                <Badge variant="secondary">{lesson.duration_minutes} min</Badge>
                <Badge variant="secondary">{lesson.main_skill}</Badge>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/lessons/$id" params={{ id: lesson.id }}>
                    Open
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => duplicate.mutate(lesson.id)}
                  disabled={duplicate.isPending}
                >
                  <Copy className="size-4" />
                  Duplicate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Delete "${lesson.topic}"? This cannot be undone.`)) {
                      remove.mutate(lesson.id);
                    }
                  }}
                  disabled={remove.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}
