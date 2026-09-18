import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, FileText, Trash2, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { listFavorites, setLessonFavorite } from '@/lib/teacher-tools.functions';
import { filterLibrary } from '@/lib/teacher-tools';
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
  const { isAuthenticated, loading, user } = useAuth();
  const [filters,setFilters] = useState({search:'',level:'',skill:'',favoritesOnly:false});
  const navigate = useNavigate();
  const fetchLessons = useServerFn(listLessons);

  useEffect(() => {
    if (!loading && !isAuthenticated) navigate({ to: "/auth", search: { redirect: "/lessons" } });
  }, [loading, isAuthenticated, navigate]);

  const { data, isPending, error } = useQuery({
    queryKey: ["lessons",user?.id],
    queryFn: () => fetchLessons(),
    enabled: isAuthenticated,
  });

  const queryClient = useQueryClient();
  const copyLesson = useServerFn(duplicateLesson);
  const removeLesson = useServerFn(deleteLesson);
  const fetchFavorites = useServerFn(listFavorites);
  const toggleFavorite = useServerFn(setLessonFavorite);
  const favorites = useQuery({queryKey:['favorites',user?.id],queryFn:()=>fetchFavorites(),enabled:isAuthenticated});
  const favorite = useMutation({
    mutationFn:(lessonId:string)=>toggleFavorite({data:{lessonId,active:!favorites.data?.includes(lessonId)}}),
    onSuccess:()=>queryClient.invalidateQueries({queryKey:['favorites',user?.id]}),
    onError:()=>toast.error('Could not update this favorite. Please try again.'),
  });
  const visible = filterLibrary(data??[],filters,favorites.data??[]);
  const hasFilters = !!(filters.search.trim()||filters.level||filters.skill);

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

        <Tabs className="mt-6" value={filters.favoritesOnly?'favorites':'all'} onValueChange={value=>setFilters(f=>({...f,favoritesOnly:value==='favorites'}))}>
          <TabsList aria-label="Lesson library views">
            <TabsTrigger value="all">All lessons</TabsTrigger>
            <TabsTrigger value="favorites" disabled={favorites.isPending||favorites.isError}><Star className="mr-2 size-4"/>Favorites</TabsTrigger>
          </TabsList>
          <TabsContent value={filters.favoritesOnly?'favorites':'all'}>
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

        {!!data?.length && <section aria-label="Find saved lessons" className="mt-6 space-y-4 rounded-xl border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="lesson-search">Search by topic</Label><Input id="lesson-search" type="search" placeholder="e.g. conservation" value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))} /></div>
            <div className="space-y-2"><Label htmlFor="lesson-level">English level</Label><select id="lesson-level" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.level} onChange={e=>setFilters(f=>({...f,level:e.target.value}))}><option value="">All levels</option>{[...new Set(data.map(l=>l.level))].sort().map(l=><option key={l}>{l}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="lesson-skill">Main skill</Label><select id="lesson-skill" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={filters.skill} onChange={e=>setFilters(f=>({...f,skill:e.target.value}))}><option value="">All skills</option>{[...new Set(data.map(l=>l.main_skill))].sort().map(s=><option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {hasFilters && <Button variant="ghost" size="sm" onClick={()=>setFilters(f=>({...f,search:'',level:'',skill:''}))}>Clear filters</Button>}
            <p role="status" className="text-sm text-muted-foreground">{visible.length} of {data.length} lessons</p>
          </div>
          {favorites.isError && <p role="alert" className="text-sm">Favorites could not load. <Button variant="outline" size="sm" onClick={()=>void favorites.refetch()}>Retry favorites</Button></p>}
        </section>}
        {!!data?.length && !visible.length && <p className="mt-8 text-sm">{filters.favoritesOnly?'No favorites match these filters. Star a lesson to find it here.':'No lessons match these filters. Try another topic or clear the filters.'}</p>}

        <div className="mt-8 space-y-3">
          {visible.map((lesson) => (
            <div
              key={lesson.id}
              className="bg-card flex flex-col items-start gap-3 rounded-xl border p-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            >
              <Link
                to="/lessons/$id"
                params={{ id: lesson.id }}
                className="w-full min-w-0 break-words hover:underline sm:w-auto sm:flex-1 sm:basis-48"
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
                <Button variant="ghost" size="sm" aria-label={`${favorites.data?.includes(lesson.id)?'Unfavorite':'Favorite'} ${lesson.topic}`} aria-pressed={favorites.data?.includes(lesson.id)??false}
                  disabled={favorite.isPending||favorites.isPending||favorites.isError} onClick={()=>favorite.mutate(lesson.id)}>
                  <Star className={`size-4 ${favorites.data?.includes(lesson.id)?'fill-current text-primary':''}`} />
                </Button>
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
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
