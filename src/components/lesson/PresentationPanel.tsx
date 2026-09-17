import { isYoungA1, pictureUrl } from "@/lib/young-learners";
import { americanEnglishContent } from "@/lib/american-english";
import { youngSlidePages } from "@/lib/young-slides";
import { loadPresentationTools } from "@/lib/presentation-tools";
import { capitalizeHeading, presentationParagraphs } from "@/lib/presentation-text";
import { colorShapeResources } from '@/lib/color-shape-resources';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Presentation,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  IllustrationGenerationError,
  flashcardsFor,
  bandOfRequest,
  buildPresentationBlob,
  collectImagePrompts,
  downloadBlob,
  generateSlideImages,
  presentationFileName,
  splitHighlights,
  themeFor,
} from "@/lib/pptx";
import {
  normalizeSlides,
  type LessonPackage,
  type LessonRequestInput,
  type Slide,
} from "@/lib/lesson-schema";

/** Renders one slide roughly as it will look in PowerPoint. */
function SlidePreview({ slide, theme, young }: { slide: Slide; theme: ReturnType<typeof themeFor>; young: boolean }) {
  const lines = young
    ? [slide.studentText, ...slide.bullets].flatMap(text => text.split(/\n\s*\n/)).filter(Boolean)
    : [slide.studentText, ...slide.bullets].flatMap(presentationParagraphs);

  return (
    <div
      className="overflow-hidden rounded-xl border shadow-sm"
      style={{ backgroundColor: "#FFFFFF" }}
    >
      <div style={{ backgroundColor: `#${theme.accent}`, height: 6 }} />
      <div className="p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-bold" style={{ color: `#${theme.title}` }}>
            {capitalizeHeading(slide.title)}
          </h3>
          <span className="text-xs font-medium" style={{ color: `#${theme.muted}` }}>
            {slide.layout} · slide {slide.number}
          </span>
        </div>

        {slide.vocabulary.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {slide.vocabulary.map((v, i) => (
              <div
                key={i}
                className="rounded-lg p-3"
                style={{ backgroundColor: `#${theme.panel}` }}
              >
                <p className="text-base font-bold" style={{ color: `#${theme.highlight}` }}>
                  {capitalizeHeading(v.word)}
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
            className="mt-3 space-y-5 rounded-lg p-4 text-sm leading-relaxed"
            style={{ backgroundColor: `#${theme.panel}`, color: `#${theme.ink}` }}
          >
            {lines.map((line, i) => (
              <p key={i} className="whitespace-pre-line">
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
  const [imageFailure, setImageFailure] = useState(false);

  useEffect(() => {
    setBlob(null);
    setImagePreviews({});
    setFailed(false);
  }, [lesson, request]);

  const filename = presentationFileName(request);
  const theme = useMemo(() => themeFor(bandOfRequest(request)), [request]);
  const slides = useMemo(
    () =>
      normalizeSlides(americanEnglishContent(lesson.presentation)).flatMap((s) =>
        isYoungA1(request) ? youngSlidePages(s) : [s],
      ),
    [lesson, request],
  );
  const cards = useMemo(() => flashcardsFor(lesson, request), [lesson, request]);
  const shapeResources = useMemo(() => colorShapeResources(request), [request]);
  const exportCount = isYoungA1(request)
    ? 1 +
      slides.reduce(
        (n, s) => n + (s.layout === "vocabulary" && s.vocabulary.length ? s.vocabulary.reduce((count, v) => count + youngSlidePages({ ...s, title: v.word, layout: "content", studentText: v.definition, bullets: v.example ? [v.example] : [], vocabulary: [] }).length, 0) : 1),
        0,
      ) +
      cards.length * 2 + (shapeResources ? 1 : 0)
    : 1 + slides.reduce((n, s) => n + (s.layout === 'vocabulary' && s.vocabulary.length ? s.vocabulary.length : 1), 0) + cards.length * 2 + (shapeResources ? 1 : 0);
  const imagePrompts = useMemo(() => collectImagePrompts(lesson, 6, request), [lesson, request]);

  async function generate() {
    setBusy(true);
    setFailed(false);
    try {
      setStatus("Loading PowerPoint export tools…");
      await loadPresentationTools();
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
      setImageFailure(error instanceof IllustrationGenerationError);
      if (error instanceof IllustrationGenerationError) setImagePreviews(error.images);
      console.error(error);
      setFailureMessage(
        error instanceof Error ? error.message : "PowerPoint generation failed. Please retry.",
      );
      setFailed(true);
    } finally {
      setStatus("");
      setBusy(false);
    }
  }

  async function exportAvailable(withAvailable = true) {
    setBusy(true);
    try {
      setBlob(await buildPresentationBlob(lesson, request, withAvailable ? imagePreviews : {}));
      setFailed(false);
    } catch (error) {
      setImageFailure(false);
      setFailed(true);
      setFailureMessage(error instanceof Error ? error.message : "Could not export the slides.");
    } finally {
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
                {exportCount} slide{exportCount === 1 ? "" : "s"} in the PowerPoint
                {cards.length ? ", including flashcard fronts and backs" : ""}
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
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Presentation className="size-4" />
                )}
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
                  minute longer and uses OpenRouter credits. Style is matched to age{" "}
                  {request.studentAge} and level {request.level}.
                </p>
              </div>
            </div>
            <Switch
              checked={withImages}
              onCheckedChange={(value) => {
                setWithImages(value);
                setBlob(null);
                setFailed(false);
              }}
              disabled={busy}
              aria-label="Add original illustrations"
            />
          </div>
        ) : null}

        {busy && status ? <p className="mt-3 text-sm text-muted-foreground">{status}</p> : null}

        {failed ? (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="size-4" />
            <AlertTitle>PowerPoint generation failed</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{failureMessage}</p>
              {imageFailure && isYoungA1(request) ? (
                <p>
                  Export with available pictures keeps completed illustrations and built-in picture
                  cards. Optional slide illustrations may be absent. A flashcard that still needs a
                  picture will be reported.
                </p>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => void (imageFailure || !Object.keys(imagePreviews).length ? generate() : exportAvailable())} disabled={busy}>
                {imageFailure ? "Retry missing pictures" : "Retry PowerPoint export"}
              </Button>
              {imageFailure ? <Button size="sm" variant="outline" onClick={() => void exportAvailable(false)} disabled={busy}>Export without AI illustrations</Button> : null}
              {imageFailure && Object.keys(imagePreviews).length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void exportAvailable()}
                  disabled={busy}
                >
                  Export with available pictures
                </Button>
              ) : null}
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

      {Object.keys(imagePreviews).length > 0 && withImages ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Generated illustrations">
          {Object.entries(imagePreviews).map(([prompt, url]) => (
            <img
              key={prompt}
              src={url}
              alt={prompt}
              className="aspect-square rounded-lg border object-contain"
            />
          ))}
        </div>
      ) : null}
      {cards.length > 0 ? (
        <section aria-label="Flashcards" className="space-y-3">
          {shapeResources && (
            <section aria-label="Color and shape matching board" className="rounded-xl border bg-white p-5 text-slate-900">
              <h3 className="text-xl font-bold">Listen and point</h3>
              <div className="my-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${shapeResources.colors.length}, minmax(0, 1fr))` }}>
                {shapeResources.words.map((word, i) => <img key={word} src={pictureUrl(word) ?? undefined} alt={`Matching picture ${i + 1}`} data-picture={word} className="mx-auto aspect-square w-full max-w-40 object-contain" />)}
              </div>
              <p className="text-sm">Use these {shapeResources.words.length} pictures together. Say a color and a shape for students to find. Compare the same shape in different colors, then the same color on different shapes.</p>
            </section>
          )}
          <h3 className="font-semibold">Flashcards — picture front and word back</h3>
          <p className="text-sm text-muted-foreground">
            Each card is appended as two consecutive PowerPoint slides. Print each pair and glue
            back-to-back; check orientation before duplex printing.
          </p>
          {cards.map((card, i) => (
            <div key={card.word} className="grid grid-cols-2 gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm">Card {i + 1} · Front</p>
                {(card.visual ? pictureUrl(card.visual) : (withImages ? imagePreviews[card.imagePrompt] : null) || pictureUrl(card.word)) ? (
                  <img
                    src={
                      (card.visual ? pictureUrl(card.visual) : (withImages ? imagePreviews[card.imagePrompt] : null) || pictureUrl(card.word)) ||
                      undefined
                    }
                    alt="Flashcard picture front"
                    data-picture={card.visual ?? card.word}
                    className="h-40 w-full object-contain"
                  />
                ) : (
                  <p className="text-sm">
                    Turn on original illustrations and generate PowerPoint to create this picture.
                  </p>
                )}
              </div>
              <div className="flex flex-col items-center justify-center">
                <p className="text-sm">Card {i + 1} · Back</p>
                <p className="text-3xl font-bold">{capitalizeHeading(card.word)}</p>
              </div>
            </div>
          ))}
        </section>
      ) : null}
      {slides.map((slide, index) => (
        <SlidePreview key={index} slide={slide} theme={theme} young={isYoungA1(request)} />
      ))}
    </div>
  );
}
