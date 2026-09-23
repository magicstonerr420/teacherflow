import { lessonParagraphs } from '@/lib/lesson-text';

/** Spans allow the same paragraph rendering inside a paragraph, list or field. */
export function LessonText({ children, className = '' }: { children?: string | null; className?: string }) {
  return <span className={`lesson-copy ${className}`}>
    {lessonParagraphs(children ?? '').map((text, index) => <span className="lesson-paragraph" key={index}>{text}</span>)}
  </span>;
}
