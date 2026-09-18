import { withBetaBudget } from './beta-budget.server';
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { foundationSchema, lessonRequestSchema, materialsSchema, assessmentSchema } from "./lesson-schema";
import { betaEnabled, betaStore } from "./beta-store.server";
import { betaUser, isOwner } from "./beta-auth.server";
import { generateReading } from "./reading.server";
import { applyReading, readingSchema } from "./reading";

export const regenerateReading = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({
    request: lessonRequestSchema, lesson: foundationSchema.extend({
      activity: materialsSchema.shape.activity.optional(), assessment: assessmentSchema.shape.assessment.optional(),
      versionB: assessmentSchema.shape.versionB.optional(), reading: z.union([
        z.object({status:z.literal("ready"),value:readingSchema,fingerprint:z.string()}),
        z.object({status:z.literal("failed"),error:z.string()}),
      ]).optional(),
    }), operation: z.string().uuid(),
  }).parse(input))
  .handler(async ({ data }) => {
    const user = betaEnabled() || process.env['NODE_ENV'] === 'production' ? await betaUser(getRequest()) : "local";
    const limited = betaEnabled() && !isOwner(user);
    // A beta teacher may regenerate only a completed lesson belonging to their account.
    const lesson = limited ? betaStore().readingLesson(user, data.request) : data.lesson;
    try {
      const generate = () => generateReading(data.request, lesson, user, data.operation, limited);
      const result = await (limited ? withBetaBudget(user, generate) : generate());
      if (limited && result.status === "ready") betaStore().retainReading(user, data.request, lesson => applyReading(lesson, result));
      return result;
    }
    catch { return { status: "failed" as const, error: "Reading generation could not start. Your existing lesson has been kept." }; }
  });
