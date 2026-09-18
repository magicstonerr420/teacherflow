import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import path from 'node:path';

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { '@': path.resolve('src') } }, server: { middlewareMode: true, watch: null, hmr: false } });
try {
  const { answerAlignmentIssue } = await server.ssrLoadModule('/src/lib/generation-plan.ts');
  const fixture = JSON.parse(await readFile('tests/fixtures/present-perfect-answers.json', 'utf8'));
  for (const stage of ['teacher', 'teacherB']) {
    const check = (student, teacher) => answerAlignmentIssue(stage,
      { worksheet: { [stage === 'teacher' ? 'student' : 'studentB']: student } },
      { worksheet: { [stage]: stage === 'teacher' ? teacher : teacher.sections } });
    assert.equal(check(fixture.student, fixture.teacher), null, 'The live Fill example worksheet and correct key must pass unchanged');
    const item = fixture.student.sections[1].items[0];
    const run = (key, choices = item.choices, bank = false) => check({ sections: [{ ...fixture.student.sections[1], instructions: bank ? 'Write one word from the word bank.' : 'Circle one answer.', wordBank: bank ? choices : [], items: [{ ...item, choices: bank ? [] : choices }] }] }, { sections: [{ answers: [key] }] });
    for (const key of ['A. ever', 'a) ever', '(A) ever', 'ever', 'EVER.', 'A', 'A.', '(a)', '1. A. ever', 'A. ever (at any time)', 'ever — at any time']) {
      assert.equal(run(key), null, `${stage}: accept supported answer ${key}`);
    }
    for (const choices of [['ever', 'already', 'yet'], ['a) ever', 'b) already', 'c) yet'], ['(A) ever', '(B) already', '(C) yet']]) {
      assert.equal(run('A. ever', choices), null);
      assert.equal(run('already', choices), null);
    }
    assert.equal(run('A. ever', item.choices, true), null, 'Labeled word-bank entries use the same comparison');
    assert.equal(run('F. abroad', ['A. ever', 'B. never', 'C. already', 'D. yet', 'E. experience', 'F. abroad']), null);
    assert.equal(run('F', ['ever', 'never', 'already', 'yet', 'experience', 'abroad']), null);
    assert.equal(run('I', ['I', 'You', 'They']), null, 'A one-letter word is not necessarily an option label');
    assert.equal(run('we haven’t finished', ['We haven\'t finished', 'We finished']), null);
    for (const key of ['B. ever', 'D', 'Z', 'A. never', 'never']) assert.match(run(key), /actual printed choice/, `${stage}: reject unsupported answer ${key}`);
    assert.match(run(''), /nonempty answer/, `${stage}: reject blank answers`);
    assert.match(run('A. ever', ['B. ever', 'C. already', 'D. yet']), /actual printed choice/, 'Respect explicit printed labels');
    const incomplete = structuredClone(fixture.teacher);
    incomplete.sections[3].answers.pop();
    assert.match(check(fixture.student, incomplete), /exactly 5 separate answers/, 'Open tasks still require individual answers');
  }
  console.log('PASS: real Present Perfect fixture, option labels, word banks, annotations, letter-only keys, invalid choices and incomplete keys in both versions. No paid calls.');
} finally { await server.close(); }
