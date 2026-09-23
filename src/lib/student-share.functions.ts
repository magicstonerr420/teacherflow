import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { studentShareStore } from "./student-share-store.server";
import { getListeningAudio } from "./listening.server";
import {
  createStudentShareSchema,
  studentShareIdSchema,
  studentShareLessonSchema,
} from "./student-share";

function store() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  setResponseHeader("Referrer-Policy", "no-referrer");
  return studentShareStore(getListeningAudio);
}
export const getStudentShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => studentShareLessonSchema.parse(data))
  .handler(async ({ context, data }) => store().list(context.supabase, context.userId, data));
export const createStudentShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createStudentShareSchema.parse(data))
  .handler(async ({ context, data }) => store().create(context.supabase, context.userId, data));
export const refreshStudentShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => studentShareIdSchema.parse(data))
  .handler(async ({ context, data }) => store().refresh(context.supabase, context.userId, data));
export const revokeStudentShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => studentShareIdSchema.parse(data))
  .handler(async ({ context, data }) => store().revoke(context.supabase, context.userId, data));
// This endpoint needs only the opaque bearer token, never a privileged Supabase client.
export const getPublicStudentShare = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }) => store().public(data));
