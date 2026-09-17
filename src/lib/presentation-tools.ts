import type PptxGenJS from "pptxgenjs";
import type JSZip from "jszip";

type PresentationTools = { PptxGenJS: typeof PptxGenJS; JSZip: typeof JSZip };
let pending: Promise<PresentationTools> | undefined;
let failedLoads = 0;

/** Versioned, self-contained files survive application chunk changes on deployment. */
export function loadPresentationTools(): Promise<PresentationTools> {
  if (!pending) {
    // Browsers remember failed module imports. A manual retry needs a fresh URL.
    const retry = failedLoads ? `?retry=${failedLoads}` : "";
    const pptxUrl = new URL(`/export-tools/pptxgenjs-4.0.1-jszip-3.10.2.mjs${retry}`, window.location.origin).href;
    const zipUrl = new URL(`/export-tools/jszip-3.10.2.mjs${retry}`, window.location.origin).href;
    pending = Promise.all([
      import(/* @vite-ignore */ pptxUrl),
      import(/* @vite-ignore */ zipUrl),
    ]).then(([pptx, zip]) => ({ PptxGenJS: pptx.default, JSZip: zip.default })).catch(() => {
      pending = undefined;
      failedLoads++;
      throw new Error("The PowerPoint export tools could not load. Keep this tab open to retain your pictures, check your connection, and retry the PowerPoint export.");
    });
  }
  return pending;
}
