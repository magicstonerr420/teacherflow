import { createFileRoute } from "@tanstack/react-router";
import { generateIllustration, IllustrationBillingError } from "@/lib/illustration.server";
import { betaEnabled, betaStore } from "@/lib/beta-store.server";
import { betaUser, isOwner } from "@/lib/beta-auth.server";
import { lessonRequestSchema } from "@/lib/lesson-schema";

/**
 * Generates one original classroom illustration for a slide.
 * Returns base64 PNG data so the client can embed it straight into the .pptx.
 */
export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (betaEnabled()) {
          try {
            const user = await betaUser(request);
            const input = await request.json();
            const lessonRequest = lessonRequestSchema.parse(input.request);
            if (typeof input.prompt !== 'string' || input.prompt.length > 4000) throw new Error('Invalid illustration prompt.');
            const generate = () => generateIllustration(input.prompt, lessonRequest.studentAge, lessonRequest.level);
            const dataUrl = isOwner(user) ? await generate() : await betaStore().image(user, lessonRequest, input.prompt, generate);
            return Response.json({dataUrl});
          } catch (error) {
            if (error instanceof IllustrationBillingError) return Response.json({error:error.message,code:error.code}, {status:402});
            return Response.json({error: error instanceof Error ? error.message : 'Beta illustration failed.'}, {status:403});
          }
        }
        if (process.env["TEACHERFLOW_AI_PROVIDER"] === "openrouter") {
          let input;
          try { input = await request.json(); } catch { return Response.json({ error: "Invalid image request." }, { status: 400 }); }
          if (typeof input?.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 4000 || typeof input.studentAge !== "string" || input.studentAge.length > 30 || !input.studentAge.trim() || !/^[ABC][12]$/.test(input.level)) {
            return Response.json({ error: "An illustration needs a prompt, student age and English level." }, { status: 400 });
          }
          try { return Response.json({ dataUrl: await generateIllustration(input.prompt, input.studentAge, input.level) }); }
          catch (error) {
            if (error instanceof IllustrationBillingError) return Response.json({error:error.message,code:error.code}, {status:402});
            return Response.json({ error: "Illustration generation failed. Check OpenRouter credits and retry; your lesson is still available." }, { status: 502 });
          }
        }
        if (process.env["TEACHERFLOW_AI_PROVIDER"] === "ollama") {
          return Response.json({ error: "AI illustrations are not configured for this provider. Export slides without AI illustrations." }, { status: 503 });
        }
        return Response.json({ error: "Configure OpenRouter to generate illustrations." }, { status: 503 });
      },
    },
  },
});
