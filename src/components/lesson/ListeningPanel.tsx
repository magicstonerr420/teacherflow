import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Button } from '@/components/ui/button';
import { createListening, createListeningAudio, loadListeningAudio } from '@/lib/listening.functions';
import { isNoTechRequest } from '@/lib/no-tech';
import { safeSlug } from '@/lib/exports';
import type { LessonPackage, LessonRequestInput } from '@/lib/lesson-schema';
import type { ListeningState, VoiceChoice } from '@/lib/listening';
import { ListeningAudioPlayer } from './ListeningAudioPlayer';

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
  const recordedChoice = ready?.audio?.choice;
  const selectedRecording = recordedChoice === choice;
  const recordingLoaded = selectedRecording && !!audio && audio.id === id;
  const generating = useRef(false);
  useEffect(() => { setChoice(recordedChoice ?? 'standard'); }, [id, recordedChoice]);
  useEffect(() => {
    if (!id) { setAudio(null); return; }
    let canceled = false;
    loader.current({ data: { id } }).then(result => { if (!canceled) setAudio({ id, url: result.dataUrl }); })
      .catch(() => { if (!canceled) setError('The saved recording could not be loaded. Click Load saved recording to try again.'); });
    return () => { canceled = true; };
  }, [id]);

  async function generate(withRecording: boolean, replaceAccent = false) {
    if (generating.current) return;
    generating.current = true;
    setError('');
    let current = ready;
    try {
      if (selectedRecording && id && !replaceAccent) {
        setBusy('Loading saved recording…');
        const result = await loadAudio({ data: { id } });
        setAudio({ id, url: result.dataUrl });
        return;
      }
      if (!current) {
        setBusy('Writing the listening activity…');
        const result = await runScript({ data: { request, lesson } });
        if (result.status !== 'ready') throw new Error(result.error);
        current = result;
        await change.current(current);
      }
      if (!withRecording) return;
      setBusy('Preparing your recording…');
      const result = await runAudio({ data: { request, fingerprint: current.fingerprint, choice } });
      setAudio({ id: result.audio.id, url: result.dataUrl });
      await change.current({ ...current, audio: result.audio });
    } catch (err) { setError(err instanceof Error ? err.message : 'Listening generation failed. Your existing materials are saved.'); }
    finally { generating.current = false; setBusy(''); }
  }

  return <div className="space-y-6">
    <div className="no-print space-y-4 rounded-xl border bg-card p-5">
      <p>Create an approximately two-minute listening activity about {request.topic}, matched to ages {request.studentAge} and level {request.level}.</p>
      {noTech && <p className="text-sm text-muted-foreground">This lesson works with the teacher reading aloud. You can also create an optional recording to play or download.</p>}
      <label className="flex max-w-sm flex-col gap-2 text-sm font-medium">Recording voice
        <select className="rounded-md border bg-background p-2" value={choice} disabled={!!busy} onChange={e => setChoice(e.target.value as VoiceChoice)}>
          <option value="standard">Standard voice — American English</option><option value="economy">Economy voice — American English</option>
          {import.meta.env.DEV && <option value="test">Free test voice</option>}
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void generate(!noTech || !!ready)} disabled={!!busy || recordingLoaded}>
          {busy || (recordingLoaded ? 'Recording ready' : selectedRecording ? 'Load saved recording' : ready ? noTech ? 'Generate optional recording' : 'Generate recording' : noTech ? 'Generate listening activity' : 'Generate listening activity and audio')}
        </Button>
        {noTech && !ready && <Button variant="outline" onClick={() => void generate(true)} disabled={!!busy}>Generate activity with optional audio</Button>}
      </div>
      {ready?.audio && ready.audio.accent !== 'en-US' && <div className="space-y-2">
        <p className="text-sm text-muted-foreground">This recording used an older voice. You can create an American English recording from the saved script.</p>
        <Button variant="outline" onClick={() => void generate(true, true)} disabled={!!busy}>Create American English recording</Button>
      </div>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {state?.status === 'failed' && !error && <p role="alert" className="text-destructive">{state.error}</p>}
      {audio && audio.id === id && <div className="space-y-3">
        <ListeningAudioPlayer src={audio.url} downloadName={`${safeSlug(request.topic)}_Listening.mp3`} />
        <p className="text-sm text-muted-foreground">The questions are in Worksheet A; the transcript and answers are in the teacher copy.</p>
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
