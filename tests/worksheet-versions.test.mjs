import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null } });
try {
 const { removeRepeatedWorksheetSections, alternateWorksheetIssue, repeatedAlternateItems } = await server.ssrLoadModule('/src/lib/worksheet-versions.ts');
 const section = { label: 'A', title: 'Weather', format: 'multiple-choice', instructions: 'Circle the word.', passage: '', wordBank: [], items: [{ number: 1, prompt: 'Name the picture.', visual: 'sun', choices: ['sun', 'rain'], answerLines: 0 }] };
 const changed = { ...section, items: [{ ...section.items[0], visual: 'rain' }] };
 const original = { worksheet: { studentB: { title: 'B', instructions: '', sections: [section, changed, structuredClone(section)] } } };
 const result = removeRepeatedWorksheetSections(original);
 assert.deepEqual(result.worksheet.studentB.sections, [section, changed]);
 assert.equal(original.worksheet.studentB.sections.length, 3, 'Do not mutate prior content');
 assert.deepEqual(removeRepeatedWorksheetSections(result), result);
 const answered = { worksheet: { ...original.worksheet, teacherB: [] } };
 assert.equal(removeRepeatedWorksheetSections(answered), answered, 'Retain questions with an existing answer key');
 assert.deepEqual(removeRepeatedWorksheetSections({ overview: {} }), { overview: {} });
 assert.ok(alternateWorksheetIssue({ sections: [section] }, { sections: [section] }));
 assert.equal(alternateWorksheetIssue({ sections: [section] }, { sections: [changed] }), null);
 const manyCopies = { sections: [{ ...section, items: Array.from({length: 5}, (_, i) => ({ ...section.items[0], number: i + 1 })) }] };
 assert.equal(repeatedAlternateItems({ sections: [section] }, manyCopies).length, 5);
 assert.ok(alternateWorksheetIssue({ sections: [section] }, manyCopies), 'Repeating one A item many times must not evade the check');
 const shared = { ...manyCopies.sections[0], label: 'Reading • DeepSeek' };
 assert.equal(alternateWorksheetIssue({ sections: [section,shared] }, { sections: [changed,shared] }),null,'Shared dedicated comprehension does not make a distinct core worksheet duplicate');
 assert.ok(alternateWorksheetIssue({ sections: [section,shared] }, { sections: [section,shared] }), 'Shared comprehension must not hide duplicate core questions');
 console.log('PASS: repeated model sections removed, distinct picture clues retained, prior content preserved and alternate comparison intact.');
} finally { await server.close(); }
