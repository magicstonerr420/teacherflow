import { buildPresentationBlob, downloadBlob, presentationFileName } from "./pptx";
import type { LessonPackage, LessonRequestInput } from "./lesson-schema";

/** One-time rescue for tabs opened before the export-loading fix. No AI calls. */
export async function recoverPresentation() {
  const gallery = document.querySelector('[aria-label="Generated illustrations"]');
  if (!gallery) throw new Error("Open the presentation with your generated pictures first. Do not refresh it.");
  const fiberKey = Object.keys(gallery).find(key => key.startsWith('__reactFiber$'));
  let fiber = fiberKey ? (gallery as any)[fiberKey] : null;
  let data: {lesson: LessonPackage; request: LessonRequestInput} | undefined;
  // Read only this component's existing lesson props; never read auth/session data.
  for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (props?.lesson?.presentation && props?.request?.topic) {
      data = {lesson: props.lesson, request: props.request};
      break;
    }
  }
  if (!data) throw new Error("Could not locate the open lesson. Keep this tab open for assistance.");
  const images: Record<string, string> = {};
  for (const img of gallery.querySelectorAll('img')) {
    if (img.alt && /^data:image\/(png|jpeg|webp);base64,/.test(img.src)) images[img.alt] = img.src;
  }
  if (!Object.keys(images).length) throw new Error("No completed illustrations are available in this tab.");
  const blob = await buildPresentationBlob(data.lesson, data.request, images);
  downloadBlob(blob, presentationFileName(data.request));
  return `PowerPoint downloaded using ${Object.keys(images).length} existing illustrations. No AI generation was requested.`;
}
