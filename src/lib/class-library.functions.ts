import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classLessonSchema, updateClassLessonSchema, moveClassLessonSchema } from "./class-library";
import { classLibraryStore } from "./class-library-store.server";

function store() {
  setResponseHeader("Cache-Control", "no-store");
  return classLibraryStore();
}

export const getClassLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => store().library(context.userId));

export const assignLessonToClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => classLessonSchema.parse(data))
  .handler(async ({ data, context }) => store().assign(context.supabase, context.userId, data));

export const removeLessonFromClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => classLessonSchema.parse(data))
  .handler(async ({ data, context }) => store().remove(context.supabase, context.userId, data));

export const updateClassLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateClassLessonSchema.parse(data))
  .handler(async ({ data, context }) => store().update(context.supabase, context.userId, data));

export const moveClassLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => moveClassLessonSchema.parse(data))
  .handler(async ({ data, context }) => store().move(context.supabase, context.userId, data));
