// Interface regression using mocked generation and an existing MP3: no provider spend.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3003';
const dir = '.local-runtime/reading-audio-ui';
(async () => {
  await fs.mkdir(dir, { recursive: true });
  const bytes = await fs.readFile(process.env.TEST_AUDIO || '.local-runtime/listening-review/browser-recording.mp3');
  const audioUrl = 'data:audio/mpeg;base64,' + bytes.toString('base64');
  const data = JSON.parse(await fs.readFile('comparison/budget-lesson.json', 'utf8'));
  data.request = { ...data.request, topic: 'All About Me', studentAge: '5-7', level: 'A1', mainSkill: 'Vocabulary', secondarySkill: null, learningObjective: 'State a name, age and feeling.', technologyAvailable: 'No technology' };
  delete data.lesson.reading; delete data.lesson.listening;
  const reading = { status: 'ready', fingerprint: 'reading-test', value: {
    cefr: 'A1', title: 'Meet Mia', purpose: 'Find a name, age and feeling.', word_count: 37,
    text: 'My name is Mia. I am six years old. I feel happy today. My mom and dad say hello. My brother and sister wave to me. Our baby smiles. I say hello to my family.',
    instructions: 'Read. Choose the words.', activity: 'Say your name, age and how you feel.', assessment: 'Listen for a name, age and feeling in each introduction.',
    questions: [
      { type: 'scanning', question: 'What is her name?', choices: ['Mia', 'Ana'], evidence: 'My name is Mia.', answerExplanation: 'Teacher-only clue: the narrator names herself.' },
      { type: 'scanning', question: 'How old is Mia?', choices: ['Six', 'Eight'], evidence: 'I am six years old.', answerExplanation: 'The age is six.' },
      { type: 'scanning', question: 'How does she feel?', choices: ['Happy', 'Sad'], evidence: 'I feel happy today.', answerExplanation: 'She feels happy.' },
    ], answers: ['Mia', 'Six', 'Happy'],
  } };
  const listening = { status: 'ready', fingerprint: 'f'.repeat(64), value: { ...reading.value, script: reading.value.text, teacherGuidance: 'Read the story aloud.', questions: reading.value.questions.map((q, i) => ({ question: q.question, choices: q.choices, answer: reading.value.answers[i], evidence: q.evidence, explanation: q.answerExplanation })) } };
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const errors = [], unexpected = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.route('**/_serverFn/**', route => { unexpected.push(route.request().url()); return route.abort(); });
    await page.route('**/reading-audio-test', route => route.fulfill({ contentType: 'text/html', body: '<html><body><script type="module">window.process={env:{NODE_ENV:"development",TSS_SERVER_FN_BASE:"/_serverFn/"}};import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>' }));
    await page.route('**/src/lib/beta.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `export async function betaStatus(){ return { enabled:true, owner:!window.betaLimited, claimed:true }; }` }));
    await page.route('**/src/lib/reading.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `export async function regenerateReading({data}) { window.calls.reading++; window.readingRequest=data; return window.nextReading; }` }));
    await page.route('**/src/lib/listening.functions.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
      export async function createListening({data}) { window.calls.script++; window.listeningRequest=data; return window.nextListening; }
      export async function createListeningAudio({data}) { window.calls.audio++; window.audioRequest=data; if(window.failAudio) { window.failAudio=false; throw Error('Recording test failure. Your script is saved.'); } return {audio:{id:'a'.repeat(64),choice:data.choice,model:'test-existing-recording',voice:'test',mime:'audio/mpeg',accent:'en-US'},dataUrl:window.audioUrl}; }
      export async function loadListeningAudio({data}) { window.calls.load++; return {dataUrl:window.audioUrl}; }
    ` }));
    async function mount(value, limited = false) {
      await page.goto(origin + '/reading-audio-test');
      await page.evaluate(async ({ data, reading, listening, audioUrl, limited }) => {
        window.betaLimited = limited;
        window.calls = { reading: 0, script: 0, audio: 0, load: 0 };
        window.nextReading = reading; window.nextListening = listening; window.audioUrl = audioUrl;
        await (await import('/tests/reading-fixture.tsx')).mount(data);
      }, { data: value, reading, listening, audioUrl, limited });
    }
    await mount(data);
    const nav = page.locator('nav');
    const active = page.locator('section.block');
    await nav.getByRole('button', { name: 'Reading', exact: true }).click();
    assert.equal(await active.getByRole('button', { name: 'Generate reading activity', exact: true }).count(), 1);
    assert.deepEqual(await page.evaluate(() => window.calls), { reading: 0, script: 0, audio: 0, load: 0 }, 'Opening a tab never generates content');
    await active.getByRole('button', { name: 'Generate reading activity', exact: true }).click();
    await active.getByRole('article', { name: 'Reading passage' }).waitFor();
    assert.ok((await active.innerText()).includes('How old is Mia?'));
    assert.ok(!(await active.innerText()).includes('Teacher-only clue'));
    const readingSaved = await page.evaluate(() => window.readingSaved);
    assert.ok(readingSaved.worksheet.student.sections.some(s => s.passage === reading.value.text));
    assert.ok(readingSaved.worksheet.studentB.sections.some(s => s.passage === reading.value.text));
    assert.deepEqual(readingSaved.presentation, data.lesson.presentation);
    assert.equal(await page.evaluate(() => window.readingRequest.request.level), 'A1');
    assert.equal(await page.evaluate(() => window.readingRequest.request.studentAge), '5-7');
    await page.screenshot({ path: dir + '/reading-desktop.png', fullPage: true });
    await page.emulateMedia({ media: 'print' });
    assert.equal(await active.evaluate(e => getComputedStyle(e).display), 'none', 'Reading tab does not duplicate its worksheet pages in print');
    await page.emulateMedia({ media: 'screen' });
    await active.getByRole('button', { name: 'Open worksheet', exact: true }).click();
    await active.getByRole('button', { name: 'Student', exact: true }).click();
    assert.ok((await active.innerText()).includes(reading.value.text));
    assert.ok(!(await active.innerText()).includes('Teacher-only clue'));
    await nav.getByRole('button', { name: 'Reading', exact: true }).click();
    await page.evaluate(() => { window.nextReading = { status: 'failed', error: 'Reading test failure.' }; });
    await active.getByRole('button', { name: 'Regenerate reading only', exact: true }).click();
    await active.getByRole('alert').waitFor();
    assert.ok((await active.innerText()).includes(reading.value.text), 'Failed regeneration retains the passage');

    await nav.getByRole('button', { name: 'Listening', exact: true }).click();
    await active.getByRole('button', { name: 'Generate listening activity', exact: true }).click();
    await active.getByRole('button', { name: 'Generate optional recording', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.audio), 0, 'No-tech script generation does not automatically buy audio');
    await page.evaluate(() => { window.failAudio = true; });
    await active.getByRole('button', { name: 'Generate optional recording', exact: true }).click();
    await active.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => window.readingSaved.listening.status), 'ready');
    await active.getByRole('button', { name: 'Generate optional recording', exact: true }).click();
    const player = active.locator('audio');
    await player.waitFor();
    await page.waitForFunction(() => Number.isFinite(document.querySelector('audio')?.duration));
    assert.equal(await page.evaluate(() => window.calls.script), 1, 'Audio retries keep the script');
    assert.equal(await page.evaluate(() => window.audioRequest.request.technologyAvailable), 'No technology');
    const duration = await player.evaluate(a => a.duration);
    assert.ok(duration > 60);
    const before = await page.evaluate(() => ({ ...window.calls }));
    await active.getByLabel('Playback speed').selectOption('0.75');
    assert.equal(await player.evaluate(a => a.playbackRate), 0.75);
    assert.equal(await player.evaluate(a => a.preservesPitch), true);
    await player.evaluate(a => { a.currentTime = 25; });
    await active.getByRole('button', { name: 'Rewind 10 seconds', exact: true }).click();
    assert.ok(Math.abs(await player.evaluate(a => a.currentTime) - 15) < 0.1);
    await player.evaluate(a => { a.currentTime = 3; });
    await active.getByRole('button', { name: 'Rewind 10 seconds', exact: true }).click();
    assert.equal(await player.evaluate(a => a.currentTime), 0);
    await player.evaluate(a => { a.currentTime = 30; return a.play(); });
    await page.waitForTimeout(250);
    await active.getByRole('button', { name: 'Rewind 10 seconds', exact: true }).click();
    assert.equal(await player.evaluate(a => a.paused), false);
    await player.evaluate(a => a.pause());
    await active.getByRole('button', { name: 'Back to start', exact: true }).click();
    assert.equal(await player.evaluate(a => a.currentTime), 0);
    await active.getByLabel('Playback speed').selectOption('0.5');
    assert.equal(await player.evaluate(a => a.playbackRate), 0.5);
    await active.getByLabel('Playback speed').selectOption('1');
    assert.equal(await player.evaluate(a => a.playbackRate), 1);
    assert.deepEqual(await page.evaluate(() => window.calls), before, 'Playback controls never call generation or reload audio');
    const download = page.waitForEvent('download');
    await active.getByRole('link', { name: 'Download MP3', exact: true }).click();
    await (await download).saveAs(dir + '/download.mp3');
    assert.deepEqual(await fs.readFile(dir + '/download.mp3'), bytes);
    assert.equal(await active.getByRole('button', { name: 'Recording ready', exact: true }).isDisabled(), true);
    await page.screenshot({ path: dir + '/listening-desktop.png', fullPage: true });
    const saved = await page.evaluate(() => window.readingSaved);
    await mount({ request: data.request, lesson: saved });
    await nav.getByRole('button', { name: 'Listening', exact: true }).click();
    await active.locator('audio').waitFor();
    assert.equal(await page.evaluate(() => window.calls.audio), 0, 'Reopening a saved lesson only loads its recording');
    assert.equal(await page.evaluate(() => window.calls.script), 0);
    const older = structuredClone(saved); delete older.listening.audio.accent; older.listening.audio.id = 'b'.repeat(64);
    await mount({ request: data.request, lesson: older });
    await nav.getByRole('button', { name: 'Listening', exact: true }).click();
    await active.locator('audio').waitFor();
    assert.equal(await page.evaluate(() => window.calls.audio), 0, 'Old audio is retained without automatic charges');
    await active.getByRole('button', { name: 'Create American English recording', exact: true }).click();
    await page.waitForFunction(() => window.readingSaved?.listening?.audio?.accent === 'en-US');
    assert.equal(await page.evaluate(() => window.calls.script), 0, 'Accent replacement reuses the saved script');
    assert.equal(await page.evaluate(() => window.calls.audio), 1);
    assert.equal(await active.getByRole('button', { name: 'Create American English recording', exact: true }).count(), 0);
    await mount({ request: data.request, lesson: older }, true);
    await nav.getByRole('button', { name: 'Listening', exact: true }).click();
    await active.getByText('Your beta includes one recording per lesson.', { exact: false }).waitFor();
    await active.locator('audio').waitFor();
    assert.equal(await active.getByLabel('Recording voice').isDisabled(), true, 'Invited teachers cannot buy a second voice');
    assert.equal(await active.getByRole('button', { name: 'Create American English recording', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.calls.audio), 0, 'Opening an old teacher recording does not buy a replacement');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No mobile horizontal overflow');
    await page.screenshot({ path: dir + '/listening-mobile.png', fullPage: true });
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Reading', exact: true }).click();
    await active.getByRole('article', { name: 'Reading passage' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    const result = { duration, providerCalls: 0, checked: ['visible Reading tab and optional creation', 'passage/questions/activity', 'teacher answer isolation', 'worksheet integration and print isolation', 'retained reading on failure', 'no-tech script and optional audio', 'recording failure preserves script', 'rewind including start boundary', 'rewind during playback', 'restart', '0.5/0.75/1 playback and preserved pitch', 'no generation on playback controls or saved reopen', 'MP3 download', 'one recording allowance and locked teacher voice', 'owner replacement retained', 'mobile navigation and layout'] };
    await fs.writeFile(dir + '/browser-checks.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
