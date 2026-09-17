const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const JSZip = require('jszip');

(async () => {
  const browser = await chromium.launch({headless:true,channel:'msedge'});
  try {
    const data = JSON.parse(await fs.readFile('tests/young-data.json','utf8'));
    data.lesson.presentation.slides[0].imagePrompt = 'A classroom body vocabulary scene';
    for (const slide of data.lesson.presentation.slides) {
      for (const item of slide.vocabulary) item.imagePrompt = `A clear picture of ${item.word}`;
    }
    async function fixture() {
      const page = await browser.newPage();
      page.on('pageerror', error => console.error('Fixture error:',error.message));
      await page.route('**/export-test', route => route.fulfill({contentType:'text/html',body:'<html><body><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
      await page.goto('http://127.0.0.1:3000/export-test');
      await page.evaluate(async data => (await import('/tests/young-fixture.tsx')).mount(data), data);
      await page.getByRole('button',{name:'Generate PowerPoint',exact:true}).waitFor();
      const picture = await page.evaluate(async () => (await import('/src/lib/young-learners.ts')).picturePng('head'));
      const calls = [];
      await page.route('**/api/generate-image', route => {
        calls.push(route.request().postDataJSON().prompt);
        return route.fulfill({contentType:'application/json',body:JSON.stringify({dataUrl:picture})});
      });
      await page.getByRole('switch',{name:'Add original illustrations'}).click();
      return {page,calls};
    }

    const first = await fixture();
    let reject = true;
    const loads = [];
    await first.page.route('**/export-tools/pptxgenjs-*.mjs*', route => {
      loads.push(route.request().url());
      return reject ? route.fulfill({status:404,contentType:'text/javascript',body:''}) : route.continue();
    });
    await first.page.getByRole('button',{name:'Generate PowerPoint',exact:true}).click();
    await first.page.getByText(/The PowerPoint export tools could not load/).waitFor();
    assert.equal(first.calls.length,0,'No credits spent before export tools load');
    assert.equal(await first.page.getByRole('button',{name:'Retry missing pictures'}).count(),0);
    reject = false;
    await first.page.getByRole('button',{name:'Retry PowerPoint export',exact:true}).click();
    await first.page.getByRole('button',{name:'Download .pptx',exact:true}).waitFor();
    assert.equal(first.calls.length,6);
    assert.equal(loads.length,2);
    assert.notEqual(loads[0],loads[1],'A failed module URL must not be reused');

    // Reproduce six successful paid images followed by an old export-chunk failure.
    const second = await browser.newPage();
    await second.route('**/src/lib/pptx.ts*', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const needle = 'const { PptxGenJS } = await loadPresentationTools();';
      assert.ok(source.includes(needle));
      await route.fulfill({response,body:source.replace(needle,'throw new Error("Failed to fetch dynamically imported module: /assets/pptxgen.es-old.js"); '+needle)});
    });
    await second.route('**/export-test', route => route.fulfill({contentType:'text/html',body:'<html><body><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
    await second.goto('http://127.0.0.1:3000/export-test');
    await second.evaluate(async data => (await import('/tests/young-fixture.tsx')).mount(data),data);
    const picture = await second.evaluate(async () => (await import('/src/lib/young-learners.ts')).picturePng('head'));
    let imageCalls = 0;
    await second.route('**/api/generate-image',route=>{imageCalls++;return route.fulfill({contentType:'application/json',body:JSON.stringify({dataUrl:picture})});});
    await second.getByRole('switch',{name:'Add original illustrations'}).click();
    await second.getByRole('button',{name:'Generate PowerPoint',exact:true}).click();
    await second.getByText(/Failed to fetch dynamically imported module/).waitFor();
    assert.equal(await second.locator('[aria-label="Generated illustrations"] img').count(),6);
    assert.equal(imageCalls,6);
    await second.route('**/api/**', () => assert.fail('Recovery must not call an API'));
    const downloadPromise = second.waitForEvent('download');
    const result = await second.evaluate(async () => (await import('/export-tools/recover-presentation-v1.mjs')).recoverPresentation());
    const download = await downloadPromise;
    await fs.mkdir('.local-runtime/export-loading-review',{recursive:true});
    const file = '.local-runtime/export-loading-review/recovered.pptx';
    await download.saveAs(file);
    const zip = await JSZip.loadAsync(await fs.readFile(file));
    assert.ok(zip.file('ppt/presentation.xml'));
    assert.ok(Object.keys(zip.files).filter(name=>/^ppt\/media\/.*\.png$/.test(name)).length>=6);
    assert.equal(imageCalls,6,'Recovery reused existing pictures');
    assert.match(result,/6 existing illustrations/);
    assert.equal(await second.locator('[aria-label="Generated illustrations"] img').count(),6,'Recovery leaves the old tab intact');
    console.log(JSON.stringify({preflightBeforeAI:true,failedImportRetry:true,imagesGenerated:6,recoveredWithoutAI:true,oldTabRetained:true,download:download.suggestedFilename()}));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
