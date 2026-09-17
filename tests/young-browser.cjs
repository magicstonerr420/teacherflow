const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const p = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/young-test", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: '<html><body><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>',
      }),
    );
    await p.goto("http://127.0.0.1:3000/young-test");
    const data = JSON.parse(await fs.readFile("tests/young-data.json", "utf8"));
    await fs.mkdir(".local-runtime/young-review", { recursive: true });
    await p.evaluate(async (d) => {
      window.youngData = d;
      const { mount } = await import("/tests/young-fixture.tsx");
      mount(d);
    }, data);
    await p.getByRole("button", { name: "Student", exact: true }).click();
    await p.getByAltText("Picture clue").first().waitFor();
    assert.equal(await p.getByAltText("Picture clue").count(), 10);
    assert.ok(!(await p.locator("body").innerText()).includes("TEACHER-ONLY-NOTE"));
    await p.getByRole("button", { name: "Preview / Print Student Worksheet" }).click();
    await p.getByRole("dialog").locator('iframe[title="PDF preview"]').waitFor();
    assert.ok(!(await p.getByRole("dialog").innerText()).includes("TEACHER-ONLY-NOTE"));
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Version B", exact: true }).click();
    assert.equal(await p.getByAltText("Picture clue").count(), 10);
    await p.getByRole("button", { name: "Teacher", exact: true }).click();
    assert.ok((await p.locator("body").innerText()).includes("TEACHER-ONLY-NOTE"));
    await p.getByRole("button", { name: "Version A", exact: true }).click();
    await p.getByRole("button", { name: "Student", exact: true }).click();
    await p.screenshot({ path: ".local-runtime/young-review/worksheet.png", fullPage: true });
    const result = await p.evaluate(async () => {
      const { buildPresentationBlob } = await import("/src/lib/pptx.ts");
      const { studentPdf } = await import("/src/lib/exports.ts");
      const { JSZip } = await import("/tests/young-fixture.tsx");
      const { lesson, request } = window.youngData;
      const ppt = await buildPresentationBlob(lesson, request, {});
      const zip = await JSZip.loadAsync(await ppt.arrayBuffer());
      const slides = Object.keys(zip.files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
      const pictures = Object.keys(zip.files).filter(
        (k) => /^ppt\/media\//.test(k) && !zip.files[k].dir,
      );
      const pdf = await studentPdf(lesson.worksheet.student, request, "");
      const encode = async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = "";
        for (const n of bytes) s += String.fromCharCode(n);
        return btoa(s);
      };
      const legacy = [];
      for (const studentAge of ["8-9", "Adults"]) {
        const deck = await buildPresentationBlob(lesson, { ...request, studentAge }, {});
        const z = await JSZip.loadAsync(await deck.arrayBuffer());
        legacy.push(
          Object.keys(z.files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).length,
        );
      }
      return {
        slides: slides.length,
        images: pictures.length,
        ppt: await encode(ppt),
        pdf: await encode(pdf),
        legacy,
      };
    });
    assert.ok(result.slides >= 17);
    assert.ok(result.images >= 5);
    assert.deepEqual(result.legacy, [7, 7]);
    await fs.writeFile(
      ".local-runtime/young-review/My_body_A1.pptx",
      Buffer.from(result.ppt, "base64"),
    );
    await fs.writeFile(
      ".local-runtime/young-review/My_body_A1.pdf",
      Buffer.from(result.pdf, "base64"),
    );
    // Mock only the paid image endpoint: verify retry/cost behavior without spending credits.
    const picture = await p.evaluate(async () =>
      (await import("/src/lib/young-learners.ts")).picturePng("head"),
    );
    const calls = {};
    let active = 0,
      maxActive = 0,
      fail = true;
    await p.route("**/api/generate-image", async (route) => {
      const { prompt } = route.request().postDataJSON();
      calls[prompt] = (calls[prompt] || 0) + 1;
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 120));
      active--;
      await route.fulfill({
        status: fail && (prompt === "failed" || prompt.startsWith('billing-')) ? 402 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          fail && (prompt === "failed" || prompt.startsWith('billing-'))
            ? { error: "OpenRouter needs credits." }
            : { dataUrl: picture },
        ),
      });
    });
    const first = await p.evaluate(async () => {
      try {
        await (
          await import("/src/lib/pptx.ts")
        ).generateSlideImages(["a", "b", "c", "d", "e", "failed"], window.youngData.request);
        return null;
      } catch (e) {
        return { message: e.message, images: Object.keys(e.images).length };
      }
    });
    assert.match(first.message, /needs credits/);
    assert.equal(first.images, 5);
    assert.equal(maxActive, 2);
    fail = false;
    await p.evaluate(async () =>
      (await import("/src/lib/pptx.ts")).generateSlideImages(
        ["a", "b", "c", "d", "e", "failed"],
        window.youngData.request,
      ),
    );
    assert.deepEqual(calls, { a: 1, b: 1, c: 1, d: 1, e: 1, failed: 2 });
    fail = true;
    const stopped = await p.evaluate(async () => {
      try {
        await (await import('/src/lib/pptx.ts')).generateSlideImages(['billing-1','billing-2','billing-3','billing-4','a'],window.youngData.request);
        throw Error('Expected billing rejection');
      } catch(error) { return {message:error.message,images:Object.keys(error.images ?? {})}; }
    });
    assert.match(stopped.message,/Illustrations paused/);
    assert.deepEqual(stopped.images,['a']);
    assert.equal(calls['billing-1'],1);assert.equal(calls['billing-2'],1);
    assert.equal(calls['billing-3'],undefined);assert.equal(calls['billing-4'],undefined);
    await p.evaluate(async () => {
      const d = structuredClone(window.youngData);
      d.lesson.presentation.slides[0].imagePrompt = "failed";
      d.request.topic = "UI failure test";
      (await import("/tests/young-fixture.tsx")).mount(d);
    });
    await p.getByRole("switch", { name: "Add original illustrations" }).click();
    await p.getByRole("button", { name: "Generate PowerPoint", exact: true }).click();
    await p.getByText(/Illustrations paused/).waitFor();
    await p.getByRole("button", { name: "Export without AI illustrations", exact: true }).click();
    await p.getByRole("button", { name: "Download .pptx", exact: true }).waitFor();
    await p.evaluate(async () => {
      const d = structuredClone(window.youngData);
      d.lesson.presentation.slides[0].title = "Edited lesson";
      (await import("/tests/young-fixture.tsx")).mount(d);
    });
    await p.getByRole("button", { name: "Generate PowerPoint", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        studentPictureClues: 10,
        studentHidesTeacherNotes: true,
        printPreview: true,
        versionB: true,
        pptSlides: result.slides,
        pptImages: result.images,
        otherAgeExports: result.legacy,
        retryCalls: calls,
        maxConcurrentImages: maxActive,
        partialFailureExport: true,
        editedLessonResetsDownload: true,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
