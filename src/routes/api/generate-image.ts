import { createFileRoute } from "@tanstack/react-router";
import { generateIllustration, IllustrationBillingError } from "@/lib/illustration.server";
import { betaEnabled, betaStore } from "@/lib/beta-store.server";
import { generationAccess } from "@/lib/generation-access.server";
import { lessonRequestSchema } from "@/lib/lesson-schema";
import { validateImageDataUrl } from '@/lib/media-validation.server';

/**
 * Generates one original classroom illustration for a slide.
 * Returns base64 PNG data so the client can embed it straight into the .pptx.
 */
export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let access;
        try { access = await generationAccess(request); }
        catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Sign in and claim a beta invitation." }, { status: 403 }); }
        if (betaEnabled()) {
          try {
            const { user, limited } = access;
            const input = await request.json();
            const lessonRequest = lessonRequestSchema.parse(input.request);
            if (typeof input.prompt !== 'string' || input.prompt.length > 4000) throw new Error('Invalid illustration prompt.');
            if (input.recoverOnly === true) {
              const progress = limited ? betaStore().imageProgress(user, lessonRequest, input.prompt) : { pending: false };
              if ('dataUrl' in progress && progress.dataUrl !== undefined) validateImageDataUrl(progress.dataUrl);
              return Response.json(progress);
            }
            const generate = () => generateIllustration(input.prompt, lessonRequest.studentAge, lessonRequest.level);
            const dataUrl = limited ? await betaStore().image(user, lessonRequest, input.prompt, generate) : await generate();
            return Response.json({dataUrl: validateImageDataUrl(dataUrl)});
          } catch (error) {
            if (error instanceof IllustrationBillingError) return Response.json({error:error.message,code:error.code}, {status:402});
            return Response.json({error: error instanceof Error ? error.message : 'Beta illustration failed.'}, {status:403});
          }
        }
        if (process.env["TEACHERFLOW_AI_PROVIDER"] === "openrouter") {
          let input;
          try { input = await request.json(); } catch { return Response.json({ error: "Invalid image request." }, { status: 400 }); }
          if (input?.recoverOnly === true) return Response.json({ pending: false });
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
