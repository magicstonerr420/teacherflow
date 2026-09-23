/** Display-only paragraph boundaries, shared by teacher/student views and PDFs. */
export function lessonParagraphs(value: string): string[] {
  const blocks = (value ?? '').replace(/\r\n?/g, '\n').trim().split(/\n+/).map(text => text.trim()).filter(Boolean);
  // Respect authored paragraphs, dialogue turns and list lines. For older saved
  // prose with no breaks, add breathing room without changing any words.
  if (blocks.length !== 1 || blocks[0]!.length < 600) return blocks;
  const sentences = [...new Intl.Segmenter('en-US', { granularity: 'sentence' }).segment(blocks[0]!)].map(part => part.segment.trim()).filter(Boolean);
  const paragraphs: string[] = [];
  let group: string[] = [];
  for (const sentence of sentences) {
    group.push(sentence);
    if (group.length >= 3 && group.join(' ').length >= 300) {
      paragraphs.push(group.join(' '));
      group = [];
    }
  }
  if (group.length) paragraphs.push(group.join(' '));
  return paragraphs;
}
