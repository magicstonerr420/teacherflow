const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
(async () => {
  const dir = '.local-runtime/shape-reading-review', origin = 'http://127.0.0.1:3003';
  assert.equal(await fetch(origin).then(() => true).catch(() => false), false);
  const server = spawn(process.execPath, ['--env-file=.env.local', 'node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3003','--strictPort'], { windowsHide: true, env: { ...process.env, TEACHERFLOW_BETA: 'false', OPENROUTER_API_KEY: '', LOVABLE_API_KEY: '' }, stdio: ['ignore','pipe','pipe'] });
  let log = '', browser; server.stdout.on('data', b => log += b); server.stderr.on('data', b => log += b);
  try {
    for (let n = 0; n < 90; n++) { if (await fetch(origin).then(r => r.ok).catch(() => false)) break; assert.equal(server.exitCode, null); await new Promise(r => setTimeout(r,1000)); }
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.route('**/shape-review', r => r.fulfill({ contentType: 'text/html', body: '<html><body><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>' }));
    await page.goto(origin + '/shape-review');
    const data = JSON.parse(await fs.readFile(`${dir}/existing.json`, 'utf8'));
    data.audio = 'data:audio/mpeg;base64,' + (await fs.readFile(`${dir}/standard-american.mp3`)).toString('base64');
    await page.evaluate(async data => { window.fixture = data; (await import('/tests/shape-reading-fixture.tsx')).mount(data); }, data);
    const reading = page.getByRole('region', { name: 'Reading test', exact: true });
    await reading.getByAltText('Reference picture showing the shapes described in the passage').waitFor();
    await reading.screenshot({ path: `${dir}/reading-reference.png` });
    await reading.getByText('Which shapes are green?', { exact: true }).waitFor();
    assert.equal(await reading.getByText('What color is the circle?', { exact: true }).count(), 0);
    const worksheet = page.getByRole('region', { name: 'Worksheet test', exact: true });
    await worksheet.getByRole('button', { name: 'Student', exact: true }).click();
    for (const version of ['A','B']) {
      await worksheet.getByRole('button', { name: `Version ${version}`, exact: true }).click();
      await worksheet.getByAltText('Reference picture showing the shapes described in the passage').waitFor();
      const images = await worksheet.locator('.worksheet-section').first().locator('img').evaluateAll(imgs => imgs.map(i => decodeURIComponent(i.src)));
      assert.equal(images.length,5); assert.ok(images.every(i => !i.includes('#edf1f5') && !i.includes('M18 25q29')));
      await worksheet.screenshot({ path: `${dir}/worksheet-${version}.png` });
    }
    const files = await page.evaluate(async () => {
      const { buildStudentWorksheetPdf } = await import('/src/lib/exports.ts');
      const result = {};
      for (const version of ['A','B']) {
        const b = await buildStudentWorksheetPdf(window.fixture.lesson,window.fixture.request,version);
        result[version] = await new Promise(r => { const f = new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b); });
      }
      return result;
    });
    for (const [v,b64] of Object.entries(files)) await fs.writeFile(`${dir}/Worksheet_${v}.pdf`, Buffer.from(b64,'base64'));
    const audio = page.locator('audio'); await page.waitForFunction(() => document.querySelector('audio')?.readyState >= 2);
    const audioDuration = await audio.evaluate(a => a.duration); assert.ok(audioDuration > 5);
    await page.getByLabel('Playback speed').selectOption('0.5'); assert.equal(await audio.evaluate(a => a.playbackRate),0.5);
    await audio.evaluate(a => { a.currentTime = 12; }); await page.getByRole('button',{name:'Rewind 10 seconds',exact:true}).click();
    assert.ok(Math.abs(await audio.evaluate(a => a.currentTime)-2)<0.2);
    await page.getByRole('button',{name:'Back to start',exact:true}).click(); assert.equal(await audio.evaluate(a=>a.currentTime),0);
    const future = JSON.parse(await fs.readFile(`${dir}/future.json`, 'utf8'));
    await page.evaluate(async data => { window.fixture=data;(await import('/tests/shape-reading-fixture.tsx')).mount(data); },future);
    const presentation = page.getByRole('region',{name:'Presentation test',exact:true});
    await presentation.getByRole('button',{name:'Generate PowerPoint',exact:true}).click();
    const button = presentation.getByRole('button',{name:'Download .pptx',exact:true}); await button.waitFor({timeout:60000});
    const download = page.waitForEvent('download'); await button.click(); await(await download).saveAs(`${dir}/Future_Colors_and_Shapes.pptx`);
    const result = await page.evaluate(async () => {
      const { buildPresentationBlob, flashcardsFor } = await import('/src/lib/pptx.ts');
      const { colorShapeResources } = await import('/src/lib/color-shape-resources.ts');
      const { picturePng } = await import('/src/lib/young-learners.ts');
      const { loadPresentationTools } = await import('/src/lib/presentation-tools.ts');
      const { lesson,request } = window.fixture, resources = colorShapeResources(request,lesson.presentation);
      const { JSZip } = await loadPresentationTools(), blob=await buildPresentationBlob(lesson,request), zip=await JSZip.loadAsync(await blob.arrayBuffer());
      const names=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
      const parse=t=>new DOMParser().parseFromString(t,'application/xml');
      const cards=flashcardsFor(lesson,request);
      for(let i=0;i<cards.length;i++){
        const name=names[names.length-cards.length*2+i*2], doc=parse(await zip.file(name).async('string'));
        const rels=parse(await zip.file(name.replace('slides/','slides/_rels/')+'.rels').async('string'));
        const ref=doc.getElementsByTagName('a:blip')[0].getAttribute('r:embed');
        const rel=[...rels.getElementsByTagName('Relationship')].find(r=>r.getAttribute('Id')===ref);
        const target=new URL(rel.getAttribute('Target'),'https://ppt.test/ppt/slides/').pathname.slice(1);
        if(await zip.file(target).async('base64') !== (await picturePng(cards[i].word)).split(',')[1])throw Error('Wrong card '+cards[i].word);
      }
      return { slides:names.length, cards:cards.length, colors:resources.colors, shapes:resources.shapes, boards:resources.boards.length };
    });
    await presentation.getByText(`${result.slides} slides in the PowerPoint, including flashcard fronts and backs`,{exact:true}).waitFor();
    assert.equal(result.cards,14); assert.equal(result.boards,3);
    await presentation.locator('[aria-label="Color and shape matching board"]').screenshot({path:`${dir}/future-board.png`});
    await page.setViewportSize({width:375,height:820});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    await reading.screenshot({path:`${dir}/reading-mobile.png`});
    assert.deepEqual(errors,[]);
    await fs.writeFile(`${dir}/browser-checks.json`,JSON.stringify({...result,audioDuration,versions:['A','B'],errors},null,2));
    console.log(JSON.stringify({...result,audioDuration,versions:['A','B'],errors}));
  } finally { if(browser)await browser.close(); server.kill(); await fs.writeFile(`${dir}/browser-server.log`,log); }
})().catch(e=>{console.error(e);process.exitCode=1});
