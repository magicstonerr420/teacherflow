import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { createListening, createListeningAudio, loadListeningAudio } from '@/lib/listening.functions';
import { isNoTechRequest } from '@/lib/no-tech';
import { safeSlug } from '@/lib/exports';
import type { LessonPackage, LessonRequestInput } from '@/lib/lesson-schema';
import type { ListeningState, VoiceChoice } from '@/lib/listening';

export function ListeningPanel({ lesson, request, onChange }: {
  lesson: LessonPackage; request: LessonRequestInput; onChange: (state: ListeningState) => Promise<void>;
}) {
  const state = lesson.listening;
  const ready = state?.status === 'ready' ? state : undefined;
  const noTech = isNoTechRequest(request.technologyAvailable);
  const [choice, setChoice] = useState<VoiceChoice>(ready?.audio?.choice ?? 'standard');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [audio, setAudio] = useState<{ id: string; url: string } | null>(null);
  const runScript = useServerFn(createListening), runAudio = useServerFn(createListeningAudio), loadAudio = useServerFn(loadListeningAudio);
  const change = useRef(onChange); change.current = onChange;
  const loader = useRef(loadAudio); loader.current = loadAudio;
  const id = ready?.audio?.id;
  useEffect(() => {
    if (!id) { setAudio(null); return; }
    let canceled = false;
    loader.current({ data: { id } }).then(result => { if (!canceled) setAudio({ id, url: result.dataUrl }); })
      .catch(() => { if (!canceled) setError('The saved recording could not be loaded. Click Generate recording to retrieve it again.'); });
    return () => { canceled = true; };
  }, [id]);

  async function generate() {
    if (busy) return;
    setError('');
    let current = ready;
    try {
      if (!current) {
        setBusy('Writing the listening activity…');
        const result = await runScript({ data: { request, lesson } });
        if (result.status !== 'ready') throw new Error(result.error);
        current = result;
        await change.current(current);
      }
      if (noTech) return;
      setBusy('Preparing your recording…');
      const result = await runAudio({ data: { request, fingerprint: current.fingerprint, choice } });
      setAudio({ id: result.audio.id, url: result.dataUrl });
      await change.current({ ...current, audio: result.audio });
    } catch (err) { setError(err instanceof Error ? err.message : 'Listening generation failed. Your existing materials are saved.'); }
    finally { setBusy(''); }
  }

  return <div className="space-y-6">
    <div className="no-print space-y-4 rounded-xl border bg-card p-5">
      <p>{noTech ? 'Generate a listening activity with a script you can read aloud. No devices are needed.'
        : 'Create an approximately two-minute listening activity for this class. Replay or download the saved recording without generating it again.'}</p>
      {!noTech && <label className="flex max-w-sm flex-col gap-2 text-sm font-medium">Recording voice
        <select className="rounded-md border bg-background p-2" value={choice} disabled={!!busy} onChange={e => setChoice(e.target.value as VoiceChoice)}>
          <option value="standard">Standard voice</option><option value="economy">Economy voice</option>
          {import.meta.env.DEV && <option value="test">Free test voice</option>}
        </select>
      </label>}
      <Button onClick={() => void generate()} disabled={!!busy || (noTech && !!ready)}>
        {busy || (noTech ? ready ? 'Script ready' : 'Generate listening activity' : ready ? 'Generate recording' : 'Generate listening activity and audio')}
      </Button>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {state?.status === 'failed' && !error && <p role="alert" className="text-destructive">{state.error}</p>}
      {!noTech && audio && audio.id === id && <div className="space-y-3">
        <audio aria-label="Lesson listening recording" controls preload="metadata" src={audio.url} className="w-full" />
        <a className="inline-block font-medium text-primary underline" href={audio.url} download={`${safeSlug(request.topic)}_Listening.mp3`}>Download MP3</a>
        <p className="text-sm text-muted-foreground">AI-generated voice. The questions are in Worksheet A; the transcript and answers are in the teacher copy.</p>
      </div>}
    </div>
    {ready && <>
      <div className="space-y-4 rounded-xl border p-5">
        <h3 className="text-xl font-semibold">{ready.value.title}</h3>
        <p>{ready.value.instructions}</p>
        <ol className="list-decimal space-y-4 pl-6">{ready.value.questions.map((q, i) => <li key={i}>{q.question}{q.choices.length > 0 && <p className="mt-2 text-sm">{q.choices.join(' / ')}</p>}</li>)}</ol>
      </div>
      <details className="rounded-xl border p-5">
        <summary className="cursor-pointer font-semibold">Teacher transcript and answers</summary>
        <p className="mt-4 whitespace-pre-wrap leading-relaxed">{ready.value.script}</p>
        <p className="my-4">{ready.value.teacherGuidance}</p>
        <ol className="list-decimal space-y-3 pl-6">{ready.value.questions.map((q, i) => <li key={i}><strong>{q.answer}</strong> — {q.explanation}</li>)}</ol>
      </details>
    </>}
  </div>;
}
