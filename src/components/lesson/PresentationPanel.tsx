import { AlertCircle, CheckCircle2, Download, Loader2, Presentation, RefreshCw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  bandOfRequest,
  buildPresentationBlob,
  collectImagePrompts,
  downloadBlob,
  generateSlideImages,
  presentationFileName,
  splitHighlights,
  themeFor,
} from "@/lib/pptx";
import { normalizeSlides, type LessonPackage, type LessonRequestInput, type Slide } from "@/lib/lesson-schema";

/** Renders one slide roughly as it will look in PowerPoint. */
function SlidePreview({ slide, theme }: { slide: Slide; theme: ReturnType<typeof themeFor> }) {
  const lines = [slide.studentText, ...slide.bullets].map((l) => l.trim()).filter(Boolean);

  return (
    <div
      className="overflow-hidden rounded-xl border shadow-sm"
      style={{ backgroundColor: "#FFFFFF" }}
    >
      <div style={{ backgroundColor: `#${theme.accent}`, height: 6 }} />
      <div className="p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-bold" style={{ color: `#${theme.title}` }}>
            {slide.title}
          </h3>
          <span className="text-xs font-medium" style={{ color: `#${theme.muted}` }}>
            {slide.layout} · slide {slide.number}
          </span>
        </div>

        {slide.vocabulary.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {slide.vocabulary.map((v, i) => (
              <div key={i} className="rounded-lg p-3" style={{ backgroundColor: `#${theme.panel}` }}>
                <p className="text-base font-bold" style={{ color: `#${theme.highlight}` }}>
                  {v.word}
                </p>
                <p className="mt-1 text-sm" style={{ color: `#${theme.ink}` }}>
                  {v.definition}
                </p>
                {v.example ? (
                  <p className="mt-1 text-sm italic" style={{ color: `#${theme.muted}` }}>
                    “{v.example}”
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {lines.length ? (
          <div
            className="mt-3 space-y-1.5 rounded-lg p-4 text-sm leading-relaxed"
            style={{ backgroundColor: `#${theme.panel}`, color: `#${theme.ink}` }}
          >
            {lines.map((line, i) => (
              <p key={i}>
                {splitHighlights(line, slide.highlightWords).map((part, j) =>
                  part.highlight ? (
                    <strong key={j} style={{ color: `#${theme.highlight}` }}>
                      {part.text}
                    </strong>
                  ) : (
                    <span key={j}>{part.text}</span>
                  ),
                )}
              </p>
            ))}
          </div>
        ) : null}

        {slide.interaction ? (
          <div
            className="mt-3 rounded-lg border px-4 py-2.5 text-sm font-semibold"
            style={{
              backgroundColor: `#${theme.accentSoft}`,
              borderColor: `#${theme.accent}`,
              color: `#${theme.title}`,
            }}
          >
            {slide.interaction}
          </div>
        ) : null}

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Visual
            </dt>
            <dd className="text-muted-foreground">{slide.visualSuggestion || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Teacher note
            </dt>
            <dd className="text-muted-foreground">{slide.teacherNote || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Purpose
            </dt>
            <dd className="text-muted-foreground">{slide.purpose || "—"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function PresentationActions({
  lesson,
  request,
}: {
  lesson: LessonPackage;
  request: LessonRequestInput;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [failed, setFailed] = useState(false);
  const [withImages, setWithImages] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [failureMessage, setFailureMessage] = useState("");

  const filename = presentationFileName(request);
  const theme = useMemo(() => themeFor(bandOfRequest(request)), [request]);
  const slides = useMemo(() => normalizeSlides(lesson.presentation), [lesson]);
  const imagePrompts = useMemo(() => collectImagePrompts(lesson), [lesson]);

  async function generate() {
    setBusy(true);
    setFailed(false);
    try {
      let images = {};
      if (withImages && imagePrompts.length) {
        setStatus(`Creating ${imagePrompts.length} illustrations…`);
        images = await generateSlideImages(imagePrompts, request);
        setImagePreviews(images);
      }
      setStatus("Building slides…");
      const built = await buildPresentationBlob(lesson, request, images);
      setBlob(built);
    } catch (error) {
      console.error(error);
      setFailureMessage(error instanceof Error ? error.message : "PowerPoint generation failed. Please retry.");
      setFailed(true);
    } finally {
      setStatus("");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="no-print rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Presentation className="size-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">
                {slides.length} slide{slides.length === 1 ? "" : "s"} ready to preview below
              </p>
              <p className="text-sm text-muted-foreground">
                Teacher notes go into PowerPoint speaker notes, never onto student slides.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {blob ? (
              <>
                <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
                  <CheckCircle2 className="size-4" />
                  PowerPoint ready
                </span>
                <Button onClick={() => downloadBlob(blob, filename)}>
                  <Download className="size-4" />
                  Download .pptx
                </Button>
                <Button variant="ghost" onClick={() => void generate()} disabled={busy}>
                  <RefreshCw className="size-4" />
                  Regenerate PowerPoint
                </Button>
              </>
            ) : (
              <Button onClick={() => void generate()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Presentation className="size-4" />}
                {busy ? status || "Building…" : "Generate PowerPoint"}
              </Button>
            )}
          </div>
        </div>

        {imagePrompts.length && import.meta.env["VITE_LOCAL_AI"] !== "true" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-accent/40 p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 size-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">Add original illustrations</p>
                <p className="text-sm text-muted-foreground">
                  Draws {imagePrompts.length} pictures for the vocabulary and key slides. Takes a
                  minute longer and uses OpenRouter credits. Style is matched to age {request.studentAge} and level {request.level}.
                </p>
              </div>
            </div>
            <Switch checked={withImages} onCheckedChange={(value) => { setWithImages(value); setBlob(null); }} disabled={busy} aria-label="Add original illustrations" />
          </div>
        ) : null}

        {busy && status ? (
          <p className="mt-3 text-sm text-muted-foreground">{status}</p>
        ) : null}

        {failed ? (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="size-4" />
            <AlertTitle>PowerPoint generation failed</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{failureMessage}</p>
              <Button size="sm" variant="outline" onClick={() => void generate()} disabled={busy}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{request.mainSkill}</Badge>
        {request.secondarySkill ? (
          <Badge variant="outline">Supporting: {request.secondarySkill}</Badge>
        ) : null}
        <Badge variant="outline">{bandOfRequest(request)} design</Badge>
      </div>

      {Object.keys(imagePreviews).length > 0 && withImages ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Generated illustrations">{Object.entries(imagePreviews).map(([prompt, url]) => <img key={prompt} src={url} alt={prompt} className="aspect-square rounded-lg border object-contain" />)}</div> : null}
      {slides.map((slide) => (
        <SlidePreview key={slide.number} slide={slide} theme={theme} />
      ))}
    </div>
  );
}
