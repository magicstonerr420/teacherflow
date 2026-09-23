// Actual sharing components with fake account services. No real accounts, messages, or AI calls.
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:3001";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const errors = [],
    unexpected = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.routeWebSocket(/.*/, (socket) => socket.close());
    await page.route("**/_serverFn/**", (route) => {
      unexpected.push(route.request().url());
      return route.abort();
    });
    await page.route("**/student-share-test", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module">window.process={env:{NODE_ENV:"development",TSS_SERVER_FN_BASE:"/_serverFn/"}};import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>',
      }),
    );
    await page.route("**/src/lib/student-share.functions.ts*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
      export async function getStudentShares() { const data=structuredClone(window.sharing[window.testUser]); if(window.delayLoad)await new Promise(resolve=>window.releaseLoad=resolve); if(window.failLoad)throw Error('Offline'); return data; }
      async function begin() { const data=window.sharing[window.testUser]; if(window.delayMutation)await new Promise(resolve=>window.releaseMutation=resolve); if(window.failMutation)throw Error('Offline'); return data; }
      export async function createStudentShare({data}) { const owner=await begin(); window.lastCreate=structuredClone(data); const share={id:'share-'+ ++window.revision,token:'private-token-'+window.testUser+'-'+window.revision,sections:data.sections,createdAt:'2026-09-22T12:00:00Z',updatedAt:'2026-09-22T12:00:00Z',expiresAt:'2026-10-22T12:00:00Z',status:'active'};owner.shares.push(share);return structuredClone(share); }
      export async function refreshStudentShare({data}) { const owner=await begin(); const share=owner.shares.find(s=>s.id===data.id); share.updatedAt='2026-09-23T12:00:00Z'; window.refreshCount++;return structuredClone(share); }
      export async function revokeStudentShare({data}) { const owner=await begin();owner.shares.find(s=>s.id===data.id).status='revoked';return {ok:true}; }
    `,
      }),
    );
    await page.goto(origin + "/student-share-test");
    await page.evaluate(async () => {
      window.testUser = "teacher-a";
      window.revision = 0;
      window.refreshCount = 0;
      window.sharing = {
        "teacher-a": { shares: [], availableSections: ["worksheet", "reading", "homework"] },
        "teacher-b": { shares: [], availableSections: ["homework"] },
      };
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value) => {
            if (window.failClipboard) throw Error("Blocked");
            window.copied = value;
          },
        },
      });
      const doc = {
        title: "Our future",
        instructions: "Work independently.",
        sections: [
          {
            label: "A",
            title: "Compare predictions",
            format: "short-answer",
            instructions: "Explain your view.",
            passage: "Change has many possible paths.",
            wordBank: ["uncertainty", "forecast"],
            items: [
              {
                number: 1,
                prompt: "Which change matters most?",
                choices: ["Community", "Technology"],
                answerLines: 2,
                visual: "",
              },
            ],
          },
        ],
      };
      window.publicShare = {
        title: "The future of society",
        updatedAt: "2026-09-22T12:00:00Z",
        expiresAt: "2026-10-22T12:00:00Z",
        worksheet: { student: doc, studentB: { ...doc, title: "Alternative worksheet" } },
        reading: {
          title: "A changing society",
          instructions: "Read and compare.",
          text: "Communities debate how to prepare for an uncertain future.",
          questions: [{ question: "What is uncertain?", choices: [] }],
        },
        listening: {
          title: "Two perspectives",
          instructions: "Listen and compare the speakers.",
          questions: [
            { question: "Where do the speakers disagree?", choices: ["Timing", "Funding"] },
          ],
          audio: { mime: "audio/mpeg", dataUrl: "data:audio/mpeg;base64,//uQZA==" },
        },
        homework: {
          title: "Your prediction",
          instructions: "Support your claim.",
          tasks: ["Write a prediction with two reasons."],
          estimatedTime: "10 minutes",
        },
        answerKey: "SECRET ANSWER KEY",
        teacherNotes: "SECRET TEACHER NOTES",
        ownerEmail: "PRIVATE EMAIL",
        transcript: "SECRET TRANSCRIPT",
      };
      await (await import("/tests/student-share-fixture.tsx")).mount();
    });
    const open = () =>
      page.getByRole("button", { name: "Share with students", exact: true }).click();
    await open();
    await page.getByRole("button", { name: "Create student link", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("checkbox", { name: /Listening recording/ }).isDisabled(),
      true,
    );
    await page.getByRole("checkbox", { name: "Homework", exact: true }).uncheck();
    await page.getByLabel("Link expires after").selectOption("30");
    await page.getByRole("button", { name: "Create student link", exact: true }).click();
    await page.getByRole("button", { name: "Copy student link", exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.lastCreate), {
      lessonId: "lesson-a",
      sections: ["worksheet", "reading"],
      expiresInDays: 30,
    });
    await page.getByRole("button", { name: "Copy student link", exact: true }).click();
    assert.match(await page.evaluate(() => window.copied), /\/share\/private-token-teacher-a-1$/);
    const preview = page.getByRole("link", { name: "Preview student view" });
    assert.equal(await preview.getAttribute("rel"), "noopener noreferrer");
    await page.evaluate(() => (window.failClipboard = true));
    await page.getByRole("button", { name: "Copy student link", exact: true }).click();
    await page.getByText("Select the student link above and copy it manually.").waitFor();
    await page.evaluate(() => (window.failMutation = true));
    await page.getByRole("button", { name: "Refresh shared materials" }).click();
    await page.getByRole("alert").waitFor();
    assert.match(
      await page.getByLabel("Student link", { exact: true }).inputValue(),
      /private-token-teacher-a-1$/,
    );
    await page.evaluate(() => (window.failMutation = false));
    await page.getByRole("button", { name: "Refresh shared materials" }).click();
    await page.getByText("Shared materials updated from your saved lesson.").waitFor();
    assert.equal(await page.evaluate(() => window.refreshCount), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await fs.mkdir(".local-runtime/student-share", { recursive: true });
    await page.screenshot({
      path: ".local-runtime/student-share/dialog-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await page.getByRole("button", { name: "Revoke link", exact: true }).click();
    await page.getByRole("button", { name: "Keep link", exact: true }).click();
    assert.equal(await page.evaluate(() => window.sharing["teacher-a"].shares[0].status), "active");
    await page.getByRole("button", { name: "Revoke link", exact: true }).click();
    await page.getByRole("button", { name: "Confirm revoke", exact: true }).click();
    await page.getByText("Link revoked. It no longer opens the materials.").waitFor();
    assert.equal(await page.getByLabel("Link expires after").inputValue(), "7");
    await page.getByRole("button", { name: "Close", exact: true }).click();

    // A late create from the first account must not display its link in a second account.
    await page.evaluate(() => (window.delayMutation = true));
    await open();
    await page.getByRole("button", { name: "Create student link", exact: true }).click();
    await page.waitForFunction(() => !!window.releaseMutation);
    await page.evaluate(() => window.setShareUser("teacher-b"));
    await open();
    await page.getByRole("button", { name: "Create student link", exact: true }).waitFor();
    await page.evaluate(() => {
      window.delayMutation = false;
      window.releaseMutation();
    });
    await page.waitForFunction(() => window.sharing["teacher-a"].shares.length === 2);
    assert.equal(await page.getByLabel("Student link", { exact: true }).count(), 0);
    assert.equal(
      await page.getByRole("checkbox", { name: /^Student worksheet/ }).isDisabled(),
      true,
    );
    await page.evaluate(() => window.setShareUser(undefined));
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "Share with students", exact: true }).count(),
      0,
    );

    // Public renderer never accesses or reveals extra teacher-only fields.
    await page.evaluate(() => window.setShareView("public"));
    await page.getByRole("heading", { name: "The future of society", exact: true }).waitFor();
    const text = await page.locator("body").innerText();
    assert.doesNotMatch(
      text,
      /SECRET|PRIVATE EMAIL|Answer key|Teacher notes|My lessons|Account|Beta management/,
    );
    assert.equal(await page.getByRole("navigation", { name: "Student materials" }).count(), 1);
    assert.equal(await page.locator("audio").count(), 1);
    await page.getByLabel("Worksheet version", { exact: true }).selectOption("B");
    await page
      .getByRole("heading", { name: "Alternative worksheet · Version B", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    await page.screenshot({
      path: ".local-runtime/student-share/public-mobile.png",
      fullPage: true,
    });
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.getByRole("button", { name: "Print materials" }).isVisible(), false);
    assert.equal(await page.locator("audio").isVisible(), false);
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => window.setShareView("unavailable"));
    await page
      .getByRole("heading", { name: "This student link is unavailable", exact: true })
      .waitFor();
    await page.evaluate(() => {
      const item = window.publicShare.worksheet.student.sections[0].items[0];
      item.prompt = "Look at the picture. Name the shape.";
      item.visual = "red circle";
      item.choices = ["Circle", "Square"];
      window.publicShare.worksheet.studentB = undefined;
      window.publicShare.reading.text = "The red circle is next to the blue square.";
      window.setShareView("public");
    });
    await page.getByRole("img", { name: "Picture clue", exact: true }).waitFor();
    await page
      .getByRole("img", {
        name: "Reference picture showing the shapes described in the passage",
        exact: true,
      })
      .waitFor();
    const pictures = await page.locator("main img").evaluateAll(async (images) => {
      await Promise.all(images.map((image) => image.decode()));
      return images.map((image) => ({
        src: image.src,
        width: image.naturalWidth,
        height: image.naturalHeight,
      }));
    });
    assert.equal(pictures.length, 2);
    assert.ok(
      pictures.every(
        (image) =>
          image.src.startsWith("data:image/svg+xml;") && image.width > 0 && image.height > 0,
      ),
    );
    assert.equal(await page.getByRole("img", { name: "red circle", exact: true }).count(), 0);
    await page.evaluate(() => window.setShareView("unavailable"));
    await page
      .getByRole("heading", { name: "This student link is unavailable", exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "The future of society", exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(
      "PASS: student sharing sections/expiry, copy/manual copy, preview, refresh/revoke, account isolation, public privacy, mobile layout and print. No paid calls or real messages.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
