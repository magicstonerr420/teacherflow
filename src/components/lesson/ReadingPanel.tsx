import { Button } from '@/components/ui/button';
import { ReadingReference } from './ReadingReference';
import { prepareReadingVisuals } from '@/lib/reading-visuals';
import type { LessonRequestInput } from '@/lib/lesson-schema';
import type { ReadingState } from '@/lib/reading';
import { generationErrorMessage } from '@/lib/generation-errors';

export function ReadingPanel({ state, request, busy, disabled, error, onGenerate, onOpenWorksheet }: {
  state: ReadingState | undefined;
  request: LessonRequestInput;
  busy: boolean;
  disabled: boolean;
  error: string | null;
  onGenerate: () => void;
  onOpenWorksheet: () => void;
}) {
  const reading = state?.status === 'ready' ? prepareReadingVisuals(state.value) : undefined;
  const message = error || (state?.status === 'failed' ? state.error : null);
  return <div className="space-y-6">
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <p>{reading
        ? `A reading passage and questions for ${request.topic}, ages ${request.studentAge}, level ${request.level}.`
        : `Add a reading passage and questions about ${request.topic}, matched to ages ${request.studentAge} and level ${request.level}.`}</p>
      {!reading && <p className="text-sm text-muted-foreground">You can add reading even when it is not the main or secondary skill. It is generated only when you click below.</p>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onGenerate} disabled={disabled || busy} variant={reading ? 'outline' : 'default'}>
          {busy ? 'Generating reading…' : reading ? 'Regenerate reading only' : 'Generate reading activity'}
        </Button>
        {reading && <Button variant="outline" onClick={onOpenWorksheet}>Open worksheet</Button>}
      </div>
      {message && <p role="alert" className="text-destructive break-words">{generationErrorMessage(message, 'reading')}</p>}
      {reading && <p className="text-sm text-muted-foreground">The passage and questions are also in the worksheets. Answers are in the teacher copy.</p>}
    </div>
    {reading && <>
      <article aria-label="Reading passage" className="space-y-4 rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">{reading.title}</h3>
          <span className="text-sm text-muted-foreground">{reading.cefr} · {reading.word_count} words</span>
        </div>
        <p className="text-sm text-muted-foreground">{reading.purpose}</p>
        <div className="whitespace-pre-wrap text-lg leading-loose">{reading.text}</div>
        <ReadingReference text={reading.text} />
      </article>
      <div className="space-y-5 rounded-xl border p-5">
        <h3 className="text-lg font-semibold">Reading questions</h3>
        <p>{reading.instructions}</p>
        <ol className="list-decimal space-y-6 pl-6">{reading.questions.map((question, index) => <li key={index}>
          <p className="leading-relaxed">{question.question}</p>
          {question.choices.length > 0 && <ol className="mt-2 list-[lower-alpha] space-y-2 pl-6">{question.choices.map((choice, i) => <li key={i}>{choice}</li>)}</ol>}
        </li>)}</ol>
      </div>
      <div className="space-y-3 rounded-xl border p-5">
        <h3 className="text-lg font-semibold">Reading activity</h3>
        <p className="whitespace-pre-wrap leading-relaxed">{reading.activity}</p>
      </div>
      <details className="rounded-xl border p-5">
        <summary className="cursor-pointer font-semibold">Teacher answers and assessment</summary>
        <ol className="mt-4 list-decimal space-y-4 pl-6">{reading.questions.map((question, index) => <li key={index}>
          <p><strong>{reading.answers[index]}</strong> — {question.answerExplanation}</p>
          <p className="mt-1 text-sm text-muted-foreground">From the passage: {question.evidence}</p>
        </li>)}</ol>
        <p className="mt-5 whitespace-pre-wrap leading-relaxed">{reading.assessment}</p>
      </details>
    </>}
  </div>;
}
