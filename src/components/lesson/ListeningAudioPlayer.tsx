import { useEffect, useRef, useState } from 'react';
import { RotateCcw, SkipBack } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ListeningAudioPlayer({ src, downloadName }: { src: string; downloadName: string }) {
  const player = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState(1);
  const [canSeek, setCanSeek] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!player.current) return;
    player.current.playbackRate = speed;
    player.current.preservesPitch = true;
  }, [speed, src]);
  useEffect(() => { setCanSeek(false); setError(false); }, [src]);

  function seek(backToStart = false) {
    const audio = player.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = backToStart ? 0 : Math.max(0, audio.currentTime - 10);
  }

  return <div className="space-y-4 rounded-lg border bg-background p-4">
    <p className="font-semibold">Listening recording</p>
    <audio ref={player} aria-label="Lesson listening recording" controls preload="metadata" src={src} className="w-full"
      onLoadedMetadata={() => {
        if (!player.current) return;
        player.current.playbackRate = speed;
        player.current.preservesPitch = true;
        setCanSeek(Number.isFinite(player.current.duration) && player.current.duration > 0);
      }}
      onRateChange={() => { if (player.current) setSpeed(player.current.playbackRate); }}
      onError={() => { setError(true); setCanSeek(false); }} />
    <div className="flex flex-wrap items-end gap-3">
      <Button type="button" variant="outline" onClick={() => seek()} disabled={!canSeek}><RotateCcw />Rewind 10 seconds</Button>
      <Button type="button" variant="outline" onClick={() => seek(true)} disabled={!canSeek}><SkipBack />Back to start</Button>
      <label className="flex flex-col gap-1 text-sm font-medium">Playback speed
        <select className="h-9 rounded-md border bg-background px-3" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
          <option value={0.5}>0.5× — Slowest</option>
          <option value={0.75}>0.75× — Slower</option>
          <option value={1}>1× — Normal</option>
          <option value={1.25}>1.25× — Faster</option>
          {![0.5, 0.75, 1, 1.25].includes(speed) && <option value={speed}>{speed}×</option>}
        </select>
      </label>
    </div>
    {error && <p role="alert" className="text-destructive">This browser could not play the recording. Download the MP3 to open it in your audio player.</p>}
    <p className="text-sm text-muted-foreground">Replay, rewind, and change speed without using more generation credits. Speed changes apply to playback here.</p>
    <a className="inline-block font-medium text-primary underline" href={src} download={downloadName}>Download MP3</a>
    <p className="text-sm text-muted-foreground">The download keeps the original speed. AI-generated voice.</p>
  </div>;
}
