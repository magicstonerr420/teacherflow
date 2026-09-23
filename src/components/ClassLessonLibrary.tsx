import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FolderOpen, Plus, RefreshCw } from "lucide-react";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { ClassLessonLink } from "@/lib/class-library";
import {
  assignLessonToClass,
  getClassLibrary,
  moveClassLesson,
  removeLessonFromClass,
  updateClassLesson,
} from "@/lib/class-library.functions";
import { listLessons } from "@/lib/lesson.functions";
import {
  AGE_OPTIONS,
  DURATION_OPTIONS,
  LEVEL_OPTIONS,
  TECHNOLOGY_OPTIONS,
} from "@/lib/lesson-schema";
import {
  filterLibrary,
  savedClassSchema,
  type ClassSettings,
  type SavedClass,
} from "@/lib/teacher-tools";
import { saveClassSettings } from "@/lib/teacher-tools.functions";
import { ACCOUNT_READ_STALE_MS, readRequest } from '@/lib/read-request';

const selectStyle = "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm";
type LibraryLesson = Awaited<ReturnType<typeof listLessons>>[number];

/** Remount forms on account change; late responses remain in the originating account's cache. */
export function ClassLessonLibrary({ userId }: { userId: string | undefined }) {
  return userId ? <AccountClassLibrary key={userId} userId={userId} /> : null;
}

function AccountClassLibrary({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const load = useServerFn(getClassLibrary);
  const loadLessons = useServerFn(listLessons);
  const create = useServerFn(saveClassSettings);
  const libraryKey = ["class-library", userId];
  const library = useQuery({ queryKey: libraryKey, queryFn: ({signal}) => readRequest(requestSignal=>load({signal:requestSignal}),{signal}), retry: false });
  const lessons = useQuery({
    queryKey: ["lessons", userId],
    queryFn: ({signal}) => readRequest(requestSignal=>loadLessons({signal:requestSignal}),{signal}),
    staleTime: ACCOUNT_READ_STALE_MS,
    retry: false,
  });
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");
  const selected = library.data?.classes.find((item) => item.id === selectedId);
  const createClass = useMutation({
    mutationFn: (data: { name: string; settings: ClassSettings }) => create({ data }),
    onSuccess: async ({ id }) => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: libraryKey }),
        cache.invalidateQueries({ queryKey: ["saved-classes", userId] }),
      ]);
      setCreating(false);
      setSelectedId(id);
      setMessage("Class created. Add a saved lesson to start its history.");
    },
  });

  return (
    <section aria-labelledby="class-library-heading" className="mt-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64 space-y-2">
          <h2 id="class-library-heading" className="text-xl font-semibold">
            Classes
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Keep lessons together for each class and remember what you taught. These are the same
            saved classes you use in the lesson builder.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={library.isFetching || lessons.isFetching}
            onClick={() => {
              void library.refetch();
              void lessons.refetch();
            }}
          >
            <RefreshCw className="size-4" />
            Refresh classes
          </Button>
          <Button
            size="sm"
            disabled={library.isPending || library.isError}
            onClick={() => {
              setCreating(true);
              createClass.reset();
              setMessage("");
            }}
          >
            <Plus className="size-4" />
            Create class
          </Button>
        </div>
      </div>

      {library.isPending && (
        <div role="status" aria-label="Loading classes" className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}
      {library.isError && (
        <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-5">
          <p className="text-sm">
            We could not load your classes. Your lessons are still available in All lessons.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void library.refetch()}
            disabled={library.isFetching}
          >
            Retry classes
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}

      {creating && (
        <CreateClassForm
          pending={createClass.isPending}
          failed={createClass.isError}
          onCancel={() => setCreating(false)}
          onSave={(data) => createClass.mutate(data)}
        />
      )}

      {library.data && !library.isError && (
        <>
          {!selected && (
            <>
              {library.data.classes.length === 0 ? (
                <div className="rounded-xl border border-dashed px-5 py-10 text-center">
                  <FolderOpen className="mx-auto size-7 text-muted-foreground" />
                  <h3 className="mt-4 font-medium">Your classes start here</h3>
                  <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                    Create a class, then add lessons you have already saved. A lesson can belong to
                    more than one class.
                  </p>
                  {!creating && (
                    <Button
                      className="mt-5"
                      onClick={() => {
                        setCreating(true);
                        createClass.reset();
                      }}
                    >
                      Create your first class
                    </Button>
                  )}
                </div>
              ) : (
                <div aria-label="Class folders" className="grid gap-3 sm:grid-cols-2">
                  {library.data.classes.map((item) => {
                    const links = library.data.links.filter(
                      (link) =>
                        link.classId === item.id &&
                        (!lessons.data ||
                          lessons.data.some((lesson) => lesson.id === link.lessonId)),
                    );
                    return (
                      <button
                        type="button"
                        key={item.id}
                        aria-label={`Open class ${item.name}`}
                        onClick={() => {
                          setSelectedId(item.id);
                          setMessage("");
                        }}
                        className="min-w-0 space-y-3 rounded-xl border bg-card p-5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start gap-3">
                          <FolderOpen className="mt-0.5 size-5 shrink-0 text-primary" />
                          <h3 className="min-w-0 break-words font-semibold">{item.name}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {item.settings.level} · Ages {item.settings.studentAge} ·{" "}
                          {item.settings.durationMinutes} min
                        </p>
                        <p className="text-sm">
                          {links.length} {links.length === 1 ? "lesson" : "lessons"} ·{" "}
                          {links.filter((link) => link.taughtOn).length} taught
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {selected && (
            <ClassFolder
              key={selected.id}
              userId={userId}
              savedClass={selected}
              classes={library.data.classes}
              links={library.data.links.filter((link) => link.classId === selected.id)}
              lessons={lessons.data ?? []}
              lessonsPending={lessons.isPending}
              lessonsError={lessons.isError}
              onRetryLessons={() => void lessons.refetch()}
              onBack={() => {
                setSelectedId("");
                setMessage("");
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

function CreateClassForm({
  pending,
  failed,
  onCancel,
  onSave,
}: {
  pending: boolean;
  failed: boolean;
  onCancel: () => void;
  onSave: (data: { name: string; settings: ClassSettings }) => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [settings, setSettings] = useState<ClassSettings>({
    studentAge: "Adults",
    level: "A1",
    durationMinutes: 60,
    technologyAvailable: "",
  });
  const [validation, setValidation] = useState("");
  return (
    <form
      aria-label="Create a class"
      className="space-y-4 rounded-xl border bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = savedClassSchema.safeParse({ name, settings });
        if (!parsed.success) {
          setValidation("Add a class name and choose its settings.");
          return;
        }
        setValidation("");
        onSave(parsed.data);
      }}
    >
      <div>
        <h3 className="font-semibold">Create a class</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Save its usual settings here to reuse in the lesson builder.
        </p>
      </div>
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        <div className="space-y-2">
          <Label htmlFor={id + "-name"}>Class name</Label>
          <Input
            id={id + "-name"}
            required
            maxLength={60}
            placeholder="e.g. Monday beginners"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={id + "-age"}>Student age</Label>
            <select
              id={id + "-age"}
              className={selectStyle}
              value={settings.studentAge}
              onChange={(event) =>
                setSettings((value) => ({
                  ...value,
                  studentAge: event.target.value as ClassSettings["studentAge"],
                }))
              }
            >
              {AGE_OPTIONS.map((age) => (
                <option key={age}>{age}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id + "-level"}>English level</Label>
            <select
              id={id + "-level"}
              className={selectStyle}
              value={settings.level}
              onChange={(event) =>
                setSettings((value) => ({
                  ...value,
                  level: event.target.value as ClassSettings["level"],
                }))
              }
            >
              {LEVEL_OPTIONS.map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id + "-duration"}>Class duration</Label>
            <select
              id={id + "-duration"}
              className={selectStyle}
              value={settings.durationMinutes}
              onChange={(event) =>
                setSettings((value) => ({ ...value, durationMinutes: Number(event.target.value) }))
              }
            >
              {DURATION_OPTIONS.map((duration) => (
                <option key={duration} value={duration}>
                  {duration} minutes
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id + "-technology"}>Technology available</Label>
          <select
            id={id + "-technology"}
            className={selectStyle}
            value={settings.technologyAvailable}
            onChange={(event) =>
              setSettings((value) => ({
                ...value,
                technologyAvailable: event.target.value as ClassSettings["technologyAvailable"],
              }))
            }
          >
            <option value="">Not specified</option>
            {TECHNOLOGY_OPTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        {(validation || failed) && (
          <p role="alert" className="text-sm text-destructive">
            {validation ||
              "We could not create this class. Your entries are kept; please try saving again."}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">{pending ? "Creating class…" : "Save class"}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function ClassFolder({
  userId,
  savedClass,
  classes,
  links,
  lessons,
  lessonsPending,
  lessonsError,
  onRetryLessons,
  onBack,
}: {
  userId: string;
  savedClass: SavedClass;
  classes: SavedClass[];
  links: ClassLessonLink[];
  lessons: LibraryLesson[];
  lessonsPending: boolean;
  lessonsError: boolean;
  onRetryLessons: () => void;
  onBack: () => void;
}) {
  const id = useId();
  const cache = useQueryClient();
  const assign = useServerFn(assignLessonToClass);
  const [lessonId, setLessonId] = useState("");
  const [adding, setAdding] = useState(false);
  const [historyOnly, setHistoryOnly] = useState(false);
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    level: "",
    skill: "",
    favoritesOnly: false,
  });
  const linkedIds = new Set(links.map((link) => link.lessonId));
  const available = lessons.filter((lesson) => !linkedIds.has(lesson.id));
  const attached = lessons.filter((lesson) => linkedIds.has(lesson.id));
  const visibleIds = new Set(filterLibrary(attached, filters, []).map((lesson) => lesson.id));
  const visible = links
    .filter((link) => visibleIds.has(link.lessonId) && (!historyOnly || link.taughtOn))
    .sort((a, b) =>
      historyOnly
        ? (b.taughtOn ?? "").localeCompare(a.taughtOn ?? "") || b.addedAt.localeCompare(a.addedAt)
        : b.addedAt.localeCompare(a.addedAt),
    );
  const hasFilters = !!(filters.search.trim() || filters.level || filters.skill);
  const add = useMutation({
    mutationFn: (selectedLessonId: string) =>
      assign({ data: { classId: savedClass.id, lessonId: selectedLessonId } }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["class-library", userId] });
      setLessonId("");
      setMessage("Lesson added to this class.");
    },
  });

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4" />
        All classes
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-5">
        <div className="min-w-0 flex-1 basis-52">
          <h3 className="break-words text-xl font-semibold">{savedClass.name}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {savedClass.settings.level} · Ages {savedClass.settings.studentAge} ·{" "}
            {savedClass.settings.durationMinutes} min
          </p>
        </div>
        <Button
          size="sm"
          disabled={lessonsPending || lessonsError}
          onClick={() => {
            setAdding((value) => !value);
            add.reset();
            setMessage("");
          }}
        >
          <Plus className="size-4" />
          Add saved lesson
        </Button>
      </div>

      {lessonsPending && (
        <div role="status" aria-label="Loading class lessons">
          <Skeleton className="h-28 w-full" />
        </div>
      )}
      {lessonsError && (
        <div role="alert" className="space-y-3 rounded-xl border p-5">
          <p className="text-sm">We could not load the lessons for this class.</p>
          <Button variant="outline" size="sm" onClick={onRetryLessons}>
            Retry class lessons
          </Button>
        </div>
      )}

      {adding && !lessonsError && !lessonsPending && (
        <form
          aria-label="Add a saved lesson"
          className="space-y-4 rounded-xl border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (lessonId) add.mutate(lessonId);
          }}
        >
          <p className="text-sm text-muted-foreground">
            Choose from My lessons. You can add the same lesson to other classes too.
          </p>
          {available.length ? (
            <>
              <div className="space-y-2">
                <Label htmlFor={id + "-add"}>Saved lesson</Label>
                <select
                  id={id + "-add"}
                  className={selectStyle}
                  value={lessonId}
                  disabled={add.isPending}
                  onChange={(event) => setLessonId(event.target.value)}
                  required
                >
                  <option value="">Choose a lesson</option>
                  {available.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.topic} · {lesson.level} · {lesson.main_skill}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" size="sm" disabled={!lessonId || add.isPending}>
                {add.isPending ? "Adding lesson…" : "Add to class"}
              </Button>
            </>
          ) : (
            <p className="text-sm">
              {lessons.length
                ? "All your saved lessons are already in this class."
                : "No saved lessons yet. Build a lesson first, then add it here."}{" "}
              <Link className="text-primary underline" to="/builder">
                Build a lesson
              </Link>
            </p>
          )}
          {add.isError && (
            <p role="alert" className="text-sm text-destructive">
              We could not add that lesson. Please try again.
            </p>
          )}
        </form>
      )}
      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}

      {!lessonsPending && !lessonsError && (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Class lesson views">
            <Button
              variant={historyOnly ? "outline" : "default"}
              size="sm"
              aria-pressed={!historyOnly}
              onClick={() => setHistoryOnly(false)}
            >
              All class lessons
            </Button>
            <Button
              variant={historyOnly ? "default" : "outline"}
              size="sm"
              aria-pressed={historyOnly}
              onClick={() => setHistoryOnly(true)}
            >
              Teaching history
            </Button>
          </div>
          {historyOnly && (
            <p className="text-sm text-muted-foreground">
              Lessons with a taught date, newest first. Each lesson has one taught date and its own
              notes for this class.
            </p>
          )}
          {attached.length > 0 && (
            <section aria-label="Find class lessons" className="space-y-4 rounded-xl border p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor={id + "-search"}>Search class lessons</Label>
                  <Input
                    id={id + "-search"}
                    type="search"
                    placeholder="Search by topic"
                    value={filters.search}
                    onChange={(event) =>
                      setFilters((value) => ({ ...value, search: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={id + "-filter-level"}>English level</Label>
                  <select
                    id={id + "-filter-level"}
                    className={selectStyle}
                    value={filters.level}
                    onChange={(event) =>
                      setFilters((value) => ({ ...value, level: event.target.value }))
                    }
                  >
                    <option value="">All levels</option>
                    {[...new Set(attached.map((lesson) => lesson.level))].sort().map((level) => (
                      <option key={level}>{level}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={id + "-filter-skill"}>Main skill</Label>
                  <select
                    id={id + "-filter-skill"}
                    className={selectStyle}
                    value={filters.skill}
                    onChange={(event) =>
                      setFilters((value) => ({ ...value, skill: event.target.value }))
                    }
                  >
                    <option value="">All skills</option>
                    {[...new Set(attached.map((lesson) => lesson.main_skill))]
                      .sort()
                      .map((skill) => (
                        <option key={skill}>{skill}</option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p role="status" className="text-sm text-muted-foreground">
                  {visible.length} {visible.length === 1 ? "lesson" : "lessons"}
                  {historyOnly ? " in teaching history" : " in this class"}
                </p>
                {hasFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setFilters({ search: "", level: "", skill: "", favoritesOnly: false })
                    }
                  >
                    Clear class filters
                  </Button>
                )}
              </div>
            </section>
          )}

          {visible.length === 0 && (
            <div className="rounded-xl border border-dashed px-5 py-9 text-center">
              <p className="font-medium">
                {hasFilters
                  ? "No class lessons match these filters"
                  : historyOnly
                    ? "No teaching history yet"
                    : "No lessons in this class yet"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {hasFilters
                  ? "Try another topic or clear the filters."
                  : historyOnly
                    ? "Add a taught date to a class lesson to see it here."
                    : "Use Add saved lesson to start organizing this class."}
              </p>
              {!lessons.length && (
                <Button asChild variant="outline" className="mt-4">
                  <Link to="/builder">Build your first lesson</Link>
                </Button>
              )}
            </div>
          )}
          <div className="space-y-4">
            {visible.map((link) => {
              const lesson = lessons.find((item) => item.id === link.lessonId)!;
              return (
                <ClassLessonCard
                  key={`${link.lessonId}:${link.updatedAt}`}
                  userId={userId}
                  lesson={lesson}
                  link={link}
                  classes={classes}
                  onMessage={setMessage}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ClassLessonCard({
  userId,
  lesson,
  link,
  classes,
  onMessage,
}: {
  userId: string;
  lesson: LibraryLesson;
  link: ClassLessonLink;
  classes: SavedClass[];
  onMessage: (message: string) => void;
}) {
  const id = useId();
  const cache = useQueryClient();
  const save = useServerFn(updateClassLesson);
  const remove = useServerFn(removeLessonFromClass);
  const move = useServerFn(moveClassLesson);
  const [taughtOn, setTaughtOn] = useState(link.taughtOn ?? "");
  const [notes, setNotes] = useState(link.notes);
  const [targetClassId, setTargetClassId] = useState("");
  const changed = taughtOn !== (link.taughtOn ?? "") || notes !== link.notes;
  const mutation = useMutation({
    mutationFn: async (action: "save" | "remove" | "move") => {
      const data = { classId: link.classId, lessonId: link.lessonId };
      if (action === "save") return save({ data: { ...data, taughtOn: taughtOn || null, notes } });
      if (action === "move") return move({ data: { ...data, targetClassId } });
      return remove({ data });
    },
    onSuccess: async (_result, action) => {
      onMessage(
        action === "save"
          ? "Teaching details saved."
          : action === "move"
            ? "Lesson moved. It is still saved in My lessons."
            : "Lesson removed from this class. It is still saved in My lessons.",
      );
      await cache.invalidateQueries({ queryKey: ["class-library", userId] });
    },
  });
  return (
    <article aria-label={lesson.topic} className="min-w-0 space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <h4 className="break-words font-semibold">
            <Link to="/lessons/$id" params={{ id: lesson.id }} className="hover:underline">
              {lesson.topic}
            </Link>
          </h4>
          <p className="mt-2 text-sm text-muted-foreground">
            {link.taughtOn
              ? `Taught ${new Date(link.taughtOn + "T12:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
              : "Not marked as taught"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/lessons/$id" params={{ id: lesson.id }}>
            Open lesson
          </Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{lesson.level}</Badge>
        <Badge variant="secondary">{lesson.main_skill}</Badge>
        <Badge variant="secondary">{lesson.duration_minutes} min</Badge>
      </div>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate("save");
        }}
      >
        <fieldset disabled={mutation.isPending} className="min-w-0 space-y-4">
          <div className="max-w-xs space-y-2">
            <Label htmlFor={id + "-date"}>Taught date</Label>
            <Input
              className="block min-w-0 max-w-full"
              id={id + "-date"}
              type="date"
              value={taughtOn}
              onChange={(event) => setTaughtOn(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank if you have not taught it yet.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id + "-notes"}>Class notes</Label>
            <Textarea
              id={id + "-notes"}
              rows={2}
              maxLength={2000}
              placeholder="What worked? What should this class revisit?"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="outline" size="sm" disabled={!changed}>
              {mutation.isPending && mutation.variables === "save"
                ? "Saving details…"
                : "Save teaching details"}
            </Button>
            {changed && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          </div>
        </fieldset>
      </form>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          We could not{" "}
          {mutation.variables === "save"
            ? "save these teaching details"
            : mutation.variables === "move"
              ? "move this lesson"
              : "remove this lesson from the class"}
          . Your entries are kept; please try again.
        </p>
      )}
      <div className="space-y-3 border-t pt-3">
        {classes.length > 1 && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Move to another class
            </summary>
            <div className="mt-3 space-y-3">
              <Label htmlFor={id + "-move"}>Destination class</Label>
              <select
                id={id + "-move"}
                className={selectStyle}
                value={targetClassId}
                disabled={mutation.isPending}
                onChange={(event) => setTargetClassId(event.target.value)}
              >
                <option value="">Choose a class</option>
                {classes
                  .filter((item) => item.id !== link.classId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Moves this lesson and its saved teaching details. If it is already in the
                destination class, that class keeps its own details.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!targetClassId || mutation.isPending || changed}
                onClick={() => mutation.mutate("move")}
              >
                Move lesson
              </Button>
              {changed && (
                <p className="text-xs text-muted-foreground">
                  Save your teaching details before moving this lesson.
                </p>
              )}
            </div>
          </details>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => {
            if (
              window.confirm(
                `Remove "${lesson.topic}" from this class? Its taught date and class notes will be removed. The lesson stays in My lessons.${changed ? " Your unsaved changes will be discarded." : ""}`,
              )
            )
              mutation.mutate("remove");
          }}
        >
          Remove from class
        </Button>
      </div>
    </article>
  );
}
