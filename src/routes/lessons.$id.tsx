import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { LessonFeedback } from "@/components/LessonFeedback";
import { StudentShareDialog } from "@/components/StudentShareDialog";
import { LessonPackageLoader as LessonPackageView } from "@/components/lesson/LessonPackageLoader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { deleteLesson, duplicateLesson, getLesson, updateLesson } from "@/lib/lesson.functions";
import { ACCOUNT_READ_STALE_MS, readRequest } from '@/lib/read-request';

import type { LessonPackage, LessonRequestInput } from "@/lib/lesson-schema";

export const Route = createFileRoute("/lessons/$id")({
  head: () => ({
    meta: [
      { title: "Saved lesson — TeacherFlow" },
      {
        name: "description",
        content: "Open, review and print a saved TeacherFlow lesson package.",
      },
      { property: "og:title", content: "Saved lesson — TeacherFlow" },
      { property: "og:description", content: "A complete, classroom-ready lesson package." },
    ],
  }),
  component: LessonDetail,
});

function LessonDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loading, user } = useAuth();
  const queryClient = useQueryClient();
  const fetchLesson = useServerFn(getLesson);
  const removeLesson = useServerFn(deleteLesson);
  const copyLesson = useServerFn(duplicateLesson);
  const saveLessonChanges = useServerFn(updateLesson);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate({ to: "/auth", search: { redirect: `/lessons/${id}` } });
    }
  }, [loading, isAuthenticated, navigate, id]);

  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ["lesson", user?.id, id],
    queryFn: ({ signal }) => readRequest(requestSignal => fetchLesson({ data: { id }, signal: requestSignal }), { signal }),
    enabled: isAuthenticated,
    staleTime: ACCOUNT_READ_STALE_MS,
    retry: false,
  });

  const del = useMutation({
    mutationFn: () => removeLesson({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lessons', user?.id] });
      void queryClient.invalidateQueries({ queryKey: ['class-library', user?.id] });
      queryClient.removeQueries({ queryKey: ['lesson', user?.id, id], exact: true });
      toast.success("Lesson deleted.");
      navigate({ to: "/lessons" });
    },
    onError: () => toast.error("We could not delete this lesson."),
  });

  const duplicate = useMutation({
    mutationFn: () => copyLesson({ data: { id } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['lessons', user?.id] });
      toast.success("Lesson duplicated. You can now adapt the copy.");
      navigate({ to: "/lessons/$id", params: { id: result.id } });
    },
    onError: () => toast.error("We could not duplicate this lesson. Please try again."),
  });

  if (isPending || !isAuthenticated) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl space-y-4 px-5 py-12">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-5 py-20 text-center">
          <h1 className="display-heading text-2xl">We couldn't open this lesson</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ? 'Check your connection and try opening it again.' : 'It may have been deleted, or it belongs to another account.'}
          </p>
          {error && <Button className="mr-3 mt-6" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? 'Opening…' : 'Retry opening lesson'}</Button>}
          <Button className="mt-6" variant="outline" onClick={() => navigate({ to: "/lessons" })}>
            Back to my lessons
          </Button>
        </div>
      </AppShell>
    );
  }

  const row = data as unknown as {
    content: LessonPackage;
    inputs: LessonRequestInput;
  };

  return (
    <AppShell>
      <LessonPackageView
        key={`${user?.id}:${id}`}
        recoveryHref={`/lessons/${id}`}
        lesson={row.content}
        request={row.inputs}
        onPersist={async (next) => {
          await saveLessonChanges({ data: { id, content: next } });
          queryClient.setQueryData(['lesson', user?.id, id], { ...data, content: next });
          void queryClient.invalidateQueries({ queryKey: ['lessons', user?.id] });
        }}
        actions={
          <>
            <LessonFeedback key={id} lessonId={id} />
            <StudentShareDialog lessonId={id} userId={user?.id} />
            <Button
              variant="outline"
              onClick={() => duplicate.mutate()}
              disabled={duplicate.isPending}
            >
              <Copy className="size-4" />
              Duplicate
            </Button>
            <Button variant="ghost" onClick={() => del.mutate()} disabled={del.isPending}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </>
        }
      />
    </AppShell>
  );
}
