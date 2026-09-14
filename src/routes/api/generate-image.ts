import { createFileRoute } from "@tanstack/react-router";
import { generateIllustration } from "@/lib/illustration.server";
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
          } catch (error) { return Response.json({error: error instanceof Error ? error.message : 'Beta illustration failed.'}, {status:403}); }
        }
        if (process.env["TEACHERFLOW_AI_PROVIDER"] === "openrouter") {
          let input;
          try { input = await request.json(); } catch { return Response.json({ error: "Invalid image request." }, { status: 400 }); }
          if (typeof input?.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 4000 || typeof input.studentAge !== "string" || input.studentAge.length > 30 || !input.studentAge.trim() || !/^[ABC][12]$/.test(input.level)) {
            return Response.json({ error: "An illustration needs a prompt, student age and English level." }, { status: 400 });
          }
          try { return Response.json({ dataUrl: await generateIllustration(input.prompt, input.studentAge, input.level) }); }
          catch { return Response.json({ error: "Illustration generation failed. Check OpenRouter credits and retry; your lesson is still available." }, { status: 502 }); }
        }
        if (process.env["TEACHERFLOW_AI_PROVIDER"] === "ollama") {
          return Response.json({ error: "AI illustrations are not configured for this provider. Export slides without AI illustrations." }, { status: 503 });
        }
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt || !prompt.trim()) {
          return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400 });
        }
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          return new Response(JSON.stringify({ error: "Image generation is not configured." }), {
            status: 500,
          });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3.1-flash-image",
            messages: [
              {
                role: "user",
                content: `${prompt}\n\nStyle: clean original educational illustration for a classroom slide, flat vector style, bright friendly colours, plain light background, single clear subject, no text or letters anywhere in the image, no logos, no brands, no real people.`,
              },
            ],
            modalities: ["image", "text"],
          }),
        });

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          return new Response(JSON.stringify({ error: text || "Image generation failed" }), {
            status: upstream.status,
          });
        }

        const json = (await upstream.json()) as any;
        const b64 =
          json?.data?.[0]?.b64_json ??
          json?.choices?.[0]?.message?.images?.[0]?.image_url?.url ??
          null;
        if (!b64) {
          return new Response(JSON.stringify({ error: "No image returned" }), { status: 502 });
        }
        const dataUrl = String(b64).startsWith("data:") ? String(b64) : `data:image/png;base64,${b64}`;
        return new Response(JSON.stringify({ dataUrl }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
