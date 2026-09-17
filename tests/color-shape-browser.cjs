// Reuse a completed lesson; this test never requests new lesson text, images or audio.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
(async () => {
  const dir = '.local-runtime/color-shape-review', origin = 'http://127.0.0.1:3003';
  await fs.mkdir(dir, { recursive: true });
  assert.equal(await fetch(origin).then(() => true).catch(() => false), false, 'Test port must be free');
  const server = spawn(process.execPath, ['--env-file=.env.local', 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '3003', '--strictPort'], { env: { ...process.env, TEACHERFLOW_BETA: 'false', OPENROUTER_API_KEY: '', LOVABLE_API_KEY: '' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; server.stdout.on('data', c => { log += c; }); server.stderr.on('data', c => { log += c; });
  let browser;
  try {
    for (let i = 0; i < 90; i++) {
      if (await fetch(origin).then(r => r.ok).catch(() => false)) break;
      assert.equal(server.exitCode, null);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    let imageRequests = 0;
    await page.route('**/api/generate-image', route => { imageRequests++; return route.abort(); });
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.route('**/shape-test', route => route.fulfill({ contentType: 'text/html', body: '<html><body><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>' }));
    await page.goto(origin + '/shape-test');
    const fixture = JSON.parse(await fs.readFile(process.argv[2] || '.local-runtime/beginner-audit/colors-and-shapes/lesson.json', 'utf8'));
    await page.evaluate(async data => { window.shapeFixture = data; (await import('/tests/young-fixture.tsx')).mount(data); }, fixture);
    const words = ['red circle', 'blue circle', 'green circle', 'red square', 'blue square', 'green square'];
    const cards = page.getByRole('region', { name: 'Flashcards', exact: true });
    await cards.waitFor();
    const board = cards.getByRole('region', { name: 'Color and shape matching board' });
    assert.deepEqual(await cards.locator('img[alt="Flashcard picture front"]').evaluateAll(imgs => imgs.map(i => i.dataset.picture)), words);
    assert.deepEqual(await board.locator('img').evaluateAll(imgs => imgs.map(i => i.dataset.picture)), words);
    await cards.locator('img').evaluateAll(imgs => Promise.all(imgs.map(i => i.decode())));
    await board.screenshot({ path: `${dir}/matching-board.png` });
    await cards.screenshot({ path: `${dir}/flashcards.png` });
    await page.getByRole('button', { name: 'Generate PowerPoint', exact: true }).click();
    const downloadButton = page.getByRole('button', { name: 'Download .pptx', exact: true });
    await downloadButton.waitFor({ timeout: 60000 });
    const download = page.waitForEvent('download');
    await downloadButton.click();
    await (await download).saveAs(`${dir}/Colors_and_Shapes.pptx`);
    const result = await page.evaluate(async words => {
      const { lesson, request } = window.shapeFixture;
      const { buildPresentationBlob } = await import('/src/lib/pptx.ts');
      const { buildLessonPackageZip } = await import('/src/lib/exports.ts');
      const { loadPresentationTools } = await import('/src/lib/presentation-tools.ts');
      const { picturePng } = await import('/src/lib/young-learners.ts');
      const { JSZip } = await loadPresentationTools();
      const before = JSON.stringify(lesson);
      const parse = text => new DOMParser().parseFromString(text, 'application/xml');
      const inspect = async blob => {
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        const names = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
        const pictures = async name => {
          const doc = parse(await zip.file(name).async('string'));
          if (doc.getElementsByTagName('parsererror').length) throw Error('Invalid slide XML');
          const relName = name.replace('slides/', 'slides/_rels/') + '.rels';
          const rels = parse(await zip.file(relName).async('string'));
          return Promise.all([...doc.getElementsByTagName('a:blip')].map(async pic => {
            const id = pic.getAttribute('r:embed');
            const rel = [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === id);
            const target = new URL(rel.getAttribute('Target'), 'https://ppt.test/ppt/slides/').pathname.slice(1);
            return zip.file(target).async('base64');
          }));
        };
        const expected = await Promise.all(words.map(async word => (await picturePng(word)).split(',')[1]));
        const board = await pictures(names[1]);
        if (JSON.stringify(board) !== JSON.stringify(expected)) throw Error('Matching board does not contain every exact colored shape');
        const backs = [];
        for (let i = 0; i < words.length; i++) {
          const front = names[names.length - 12 + i * 2];
          const images = await pictures(front);
          if (images.length !== 1 || images[0] !== expected[i]) throw Error('Incorrect picture on flashcard ' + words[i]);
          const back = parse(await zip.file(names[names.length - 11 + i * 2]).async('string'));
          const label = [...back.getElementsByTagName('a:t')].map(n => n.textContent).join('');
          if (label.toLowerCase() !== words[i]) throw Error('Incorrect back label');
          backs.push(label);
        }
        return { slides: names.length, boardPictures: board.length, backs };
      };
      const standalone = await inspect(await buildPresentationBlob(lesson, request));
      const pack = await buildLessonPackageZip(lesson, request);
      const packaged = await inspect(pack.files.find(f => f.name.endsWith('.pptx')).blob);
      return { standalone, packaged, lessonUnchanged: before === JSON.stringify(lesson) };
    }, words);
    assert.equal(result.lessonUnchanged, true);
    assert.deepEqual(result.standalone, result.packaged);
    await page.getByText(`${result.standalone.slides} slides in the PowerPoint, including flashcard fronts and backs`, { exact: true }).waitFor();
    await page.setViewportSize({ width: 375, height: 820 });
    await board.scrollIntoViewIfNeeded();
    assert.ok(await board.evaluate(e => e.scrollWidth <= e.clientWidth), 'Matching board fits on a narrow screen');
    await board.screenshot({ path: `${dir}/matching-board-mobile.png` });
    assert.equal(imageRequests, 0);
    await fs.writeFile(`${dir}/browser-checks.json`, JSON.stringify({ ...result, paidImageRequests: imageRequests, mobileFits: true }, null, 2));
    console.log(JSON.stringify({ ...result, paidImageRequests: imageRequests, mobileFits: true }));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await fs.writeFile(`${dir}/server.log`, log);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
