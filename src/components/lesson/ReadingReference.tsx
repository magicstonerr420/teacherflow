import { readingSceneUrl } from '@/lib/reading-visuals';
export function ReadingReference({ text }: { text: string }) {
  const src = readingSceneUrl(text);
  return src ? <figure className="my-4 break-inside-avoid"><figcaption className="mb-2 text-sm font-medium">Reference picture</figcaption><img src={src} alt="Reference picture showing the shapes described in the passage" className="w-full max-w-md rounded-lg border bg-white" /></figure> : null;
}
