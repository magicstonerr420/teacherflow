// Practical browser coverage with intercepted fixtures: never calls AI or a real account.
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
    page.on("dialog", (dialog) => dialog.accept());
    await page.routeWebSocket(/.*/, (socket) => socket.close());
    await page.route("**/_serverFn/**", (route) => {
      unexpected.push(route.request().url());
      return route.abort();
    });
    await page.route("**/class-library-test", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module">window.process={env:{NODE_ENV:"development",TSS_SERVER_FN_BASE:"/_serverFn/"}};import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>',
      }),
    );
    await page.route("**/src/lib/lesson.functions.ts*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export async function listLessons() { const user=window.testUser; if(window.failLessons)throw Error('Offline'); return structuredClone(window.lessons[user]||[]); }`,
      }),
    );
    await page.route("**/src/lib/teacher-tools.functions.ts*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export async function saveClassSettings({data}) { if(window.failCreate)throw Error('Offline'); const id='class-'+ ++window.revision; window.libraries[window.testUser].classes.push({...structuredClone(data),id}); return {id}; }`,
      }),
    );
    await page.route("**/src/lib/class-library.functions.ts*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
      export async function getClassLibrary() {
        const result=structuredClone(window.libraries[window.testUser]||{classes:[],links:[]});
        if(window.delayLibrary)await new Promise(resolve=>window.releaseLibrary=resolve);
        if(window.failLibrary)throw Error('Offline');
        return result;
      }
      async function begin() { const library=window.libraries[window.testUser]; if(window.delayMutation)await new Promise(resolve=>window.releaseMutation=resolve); if(window.failMutation)throw Error('Offline'); return library; }
      function touch() { return new Date(1750000000000 + ++window.revision*1000).toISOString(); }
      export async function assignLessonToClass({data}) { const library=await begin(); let link=library.links.find(row=>row.lessonId===data.lessonId&&row.classId===data.classId); if(!link){link={...data,taughtOn:null,notes:'',addedAt:touch(),updatedAt:touch()};library.links.push(link);} return structuredClone(link); }
      export async function updateClassLesson({data}) { const library=await begin(); const link=library.links.find(row=>row.lessonId===data.lessonId&&row.classId===data.classId); Object.assign(link,data,{updatedAt:touch()}); return structuredClone(link); }
      export async function removeLessonFromClass({data}) { const library=await begin(); library.links=library.links.filter(row=>row.lessonId!==data.lessonId||row.classId!==data.classId); return {ok:true}; }
      export async function moveClassLesson({data}) { const library=await begin(); const source=library.links.find(row=>row.lessonId===data.lessonId&&row.classId===data.classId); let target=library.links.find(row=>row.lessonId===data.lessonId&&row.classId===data.targetClassId); if(!target){target={...source,classId:data.targetClassId,updatedAt:touch()};library.links.push(target);} library.links=library.links.filter(row=>row!==source); return structuredClone(target); }
    `,
      }),
    );
    await page.goto(origin + "/class-library-test");
    await page.evaluate(async () => {
      window.revision = 0;
      window.testUser = "teacher-a";
      const settings = {
        studentAge: "Adults",
        level: "A1",
        durationMinutes: 60,
        technologyAvailable: "",
      };
      window.libraries = {
        "teacher-a": {
          classes: [
            { id: "monday", name: "Monday beginners", settings },
            { id: "tuesday", name: "Tuesday group", settings },
          ],
          links: [],
        },
        "teacher-b": {
          classes: [{ id: "private", name: "Private second account", settings }],
          links: [],
        },
        "new-teacher": { classes: [], links: [] },
      };
      const lesson = (id, topic, level, main_skill) => ({
        id,
        topic,
        level,
        main_skill,
        student_age: "Adults",
        duration_minutes: 60,
        created_at: "2026-09-01T00:00:00Z",
      });
      window.lessons = {
        "teacher-a": [
          lesson("ocean", "Ocean conservation", "A1", "Reading"),
          lesson("zoo", "A day at the zoo", "A2", "Speaking"),
        ],
        "teacher-b": [lesson("private-lesson", "Private account lesson", "B2", "Writing")],
        "new-teacher": [],
      };
      await (await import("/tests/class-library-fixture.tsx")).mount();
    });
    const card = (name) => page.getByRole("article", { name, exact: true });
    const openClass = async (name) => {
      await page.getByRole("button", { name: `Open class ${name}`, exact: true }).click();
    };
    const back = async () => page.getByRole("button", { name: "All classes", exact: true }).click();
    const add = async (lessonId) => {
      if (!(await page.getByRole("combobox", { name: "Saved lesson", exact: true }).count()))
        await page.getByRole("button", { name: "Add saved lesson", exact: true }).click();
      await page
        .getByRole("combobox", { name: "Saved lesson", exact: true })
        .selectOption(lessonId);
      await page.getByRole("button", { name: "Add to class", exact: true }).click();
      await page.waitForFunction(
        (lessonId) =>
          window.libraries[window.testUser].links.some((row) => row.lessonId === lessonId),
        lessonId,
      );
    };
    const save = async (name, date, notes) => {
      const article = card(name);
      await article.getByLabel("Taught date", { exact: true }).fill(date);
      await article.getByLabel("Class notes", { exact: true }).fill(notes);
      await article.getByRole("button", { name: "Save teaching details", exact: true }).click();
      await page.waitForFunction(
        ({ date, notes }) =>
          window.libraries[window.testUser].links.some(
            (row) => row.taughtOn === (date || null) && row.notes === notes,
          ),
        { date, notes },
      );
      await page.getByText("Unsaved changes", { exact: true }).waitFor({ state: "hidden" });
    };
    await openClass("Monday beginners");
    await page.getByText("No lessons in this class yet", { exact: true }).waitFor();
    await add("ocean");
    await card("Ocean conservation").waitFor();
    assert.equal(
      await card("Ocean conservation")
        .getByRole("link", { name: "Open lesson" })
        .getAttribute("href"),
      "/lessons/ocean",
    );
    assert.equal(
      await page
        .getByRole("option", { name: "Ocean conservation · A1 · Reading", exact: true })
        .count(),
      0,
      "Already attached lessons cannot be added twice",
    );
    await add("zoo");
    await card("A day at the zoo").waitFor();
    await save("Ocean conservation", "2026-09-12", "Review ocean vocabulary next week.");
    await save("A day at the zoo", "2026-09-20", "Students enjoyed the role play.");
    await page.getByRole("button", { name: "Teaching history", exact: true }).click();
    assert.deepEqual(
      await page
        .getByRole("article")
        .evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label"))),
      ["A day at the zoo", "Ocean conservation"],
      "History is newest taught date first",
    );
    await save("A day at the zoo", "", "Revisit before teaching.");
    assert.equal(
      await card("A day at the zoo").count(),
      0,
      "Clearing taught date removes a lesson from history",
    );
    await page.getByRole("button", { name: "All class lessons", exact: true }).click();
    await card("A day at the zoo").waitFor();
    await page.getByRole("searchbox", { name: "Search class lessons" }).fill("ocean");
    assert.equal(await page.getByRole("article").count(), 1);
    await page.getByRole("combobox", { name: "English level", exact: true }).selectOption("A2");
    await page.getByText("No class lessons match these filters", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Clear class filters", exact: true }).click();
    await page.getByRole("combobox", { name: "Main skill", exact: true }).selectOption("Speaking");
    assert.equal(await card("A day at the zoo").count(), 1);
    await page.getByRole("button", { name: "Clear class filters", exact: true }).click();

    // Failed saves retain teacher entries and permit retry.
    await page.evaluate(() => (window.failMutation = true));
    await card("A day at the zoo")
      .getByLabel("Class notes", { exact: true })
      .fill("Keep these unsaved notes.");
    await card("A day at the zoo")
      .getByRole("button", { name: "Save teaching details", exact: true })
      .click();
    await card("A day at the zoo").getByRole("alert").waitFor();
    assert.equal(
      await card("A day at the zoo").getByLabel("Class notes", { exact: true }).inputValue(),
      "Keep these unsaved notes.",
    );
    await page.evaluate(() => (window.failMutation = false));
    await card("A day at the zoo")
      .getByRole("button", { name: "Save teaching details", exact: true })
      .click();
    await page.getByText("Unsaved changes", { exact: true }).waitFor({ state: "hidden" });

    await card("Ocean conservation").getByText("Move to another class", { exact: true }).click();
    await card("Ocean conservation").getByLabel("Destination class").selectOption("tuesday");
    await card("Ocean conservation")
      .getByRole("button", { name: "Move lesson", exact: true })
      .click();
    await card("Ocean conservation").waitFor({ state: "hidden" });
    await back();
    await openClass("Tuesday group");
    assert.equal(
      await card("Ocean conservation").getByLabel("Taught date", { exact: true }).inputValue(),
      "2026-09-12",
    );
    assert.equal(
      await card("Ocean conservation").getByLabel("Class notes", { exact: true }).inputValue(),
      "Review ocean vocabulary next week.",
    );
    await add("zoo");
    await card("A day at the zoo").waitFor();
    assert.equal(
      await card("A day at the zoo").getByLabel("Class notes", { exact: true }).inputValue(),
      "",
      "A lesson in another class has independent teaching details",
    );
    await page.evaluate(() => (window.failMutation = true));
    await card("A day at the zoo")
      .getByRole("button", { name: "Remove from class", exact: true })
      .click();
    await card("A day at the zoo").getByRole("alert").waitFor();
    await page.evaluate(() => (window.failMutation = false));
    await card("A day at the zoo")
      .getByRole("button", { name: "Remove from class", exact: true })
      .click();
    await card("A day at the zoo").waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() => window.lessons["teacher-a"].length),
      2,
      "Remove keeps the saved lesson",
    );
    await back();
    await openClass("Monday beginners");
    await card("A day at the zoo").waitFor();
    await add("ocean");
    await card("Ocean conservation").waitFor();
    await save("Ocean conservation", "2026-09-21", "Monday keeps its own history.");
    await back();
    await openClass("Tuesday group");
    await card("Ocean conservation").getByText("Move to another class", { exact: true }).click();
    await card("Ocean conservation").getByLabel("Destination class").selectOption("monday");
    await card("Ocean conservation")
      .getByRole("button", { name: "Move lesson", exact: true })
      .click();
    await card("Ocean conservation").waitFor({ state: "hidden" });
    await back();
    await openClass("Monday beginners");
    assert.equal(
      await card("Ocean conservation").getByLabel("Class notes", { exact: true }).inputValue(),
      "Monday keeps its own history.",
      "Move to an existing assignment preserves destination details",
    );

    await fs.mkdir(".local-runtime/class-library", { recursive: true });
    await page.screenshot({ path: ".local-runtime/class-library/desktop.png", fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      "No narrow-screen horizontal overflow",
    );
    await page.screenshot({ path: ".local-runtime/class-library/mobile.png", fullPage: true });

    // Read and mutation responses from the previous account cannot alter the new account UI.
    await page.evaluate(() => (window.delayLibrary = true));
    await page.getByRole("button", { name: "Refresh classes", exact: true }).click();
    await page.waitForFunction(() => !!window.releaseLibrary);
    await page.evaluate(() => {
      window.delayLibrary = false;
      window.testUser = "teacher-b";
      window.setLibraryUser("teacher-b");
    });
    await page
      .getByRole("button", { name: "Open class Private second account", exact: true })
      .waitFor();
    await page.evaluate(() => window.releaseLibrary());
    assert.equal(await page.getByText("Monday beginners", { exact: true }).count(), 0);
    await openClass("Private second account");
    await add("private-lesson");
    await card("Private account lesson").waitFor();
    await page.evaluate(() => (window.delayMutation = true));
    await card("Private account lesson")
      .getByLabel("Class notes", { exact: true })
      .fill("Private pending notes");
    await card("Private account lesson")
      .getByRole("button", { name: "Save teaching details", exact: true })
      .click();
    await page.waitForFunction(() => !!window.releaseMutation);
    await page.evaluate(() => {
      window.delayMutation = false;
      window.testUser = "new-teacher";
      window.setLibraryUser("new-teacher");
      window.releaseMutation();
    });
    await page.getByText("Your classes start here", { exact: true }).waitFor();
    assert.equal(
      await page.getByText("Teaching details saved.", { exact: true }).count(),
      0,
      "Late mutation messages stay with the originating account",
    );
    assert.equal(await page.getByRole("article").count(), 0);

    await page.getByRole("button", { name: "Create your first class", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Class name", exact: true })
      .fill("Wednesday young learners");
    await page.getByRole("combobox", { name: "Student age", exact: true }).selectOption("8-9");
    await page.getByRole("combobox", { name: "English level", exact: true }).selectOption("A2");
    await page.getByRole("combobox", { name: "Class duration", exact: true }).selectOption("45");
    await page
      .getByRole("combobox", { name: "Technology available", exact: true })
      .selectOption("Board only");
    await page.evaluate(() => (window.failCreate = true));
    await page.getByRole("button", { name: "Save class", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(
      await page.getByRole("textbox", { name: "Class name", exact: true }).inputValue(),
      "Wednesday young learners",
    );
    await page.evaluate(() => (window.failCreate = false));
    await page.getByRole("button", { name: "Save class", exact: true }).click();
    await page.getByRole("heading", { name: "Wednesday young learners", exact: true }).waitFor();
    assert.deepEqual(
      await page.evaluate(() => window.libraries["new-teacher"].classes[0].settings),
      { studentAge: "8-9", level: "A2", durationMinutes: 45, technologyAvailable: "Board only" },
    );
    await page.getByRole("link", { name: "Build your first lesson", exact: true }).waitFor();
    await page.getByRole("button", { name: "Add saved lesson", exact: true }).click();
    await page
      .getByText("No saved lessons yet. Build a lesson first, then add it here.", { exact: false })
      .waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );

    await page.evaluate(() => {
      window.failLibrary = true;
      window.testUser = "offline-teacher";
      window.setLibraryUser("offline-teacher");
    });
    await page.getByRole("button", { name: "Retry classes", exact: true }).waitFor();
    assert.equal(await page.getByRole("article").count(), 0);
    assert.equal(await page.getByText("Wednesday young learners", { exact: true }).count(), 0);
    await page.evaluate(() => (window.failLibrary = false));
    await page.getByRole("button", { name: "Retry classes", exact: true }).click();
    await page.getByText("Your classes start here", { exact: true }).waitFor();
    await page.evaluate(() => {
      window.failLessons = true;
      window.testUser = "teacher-a";
      window.setLibraryUser("teacher-a");
    });
    await openClass("Monday beginners");
    await page.getByRole("button", { name: "Retry class lessons", exact: true }).waitFor();
    await page.evaluate(() => (window.failLessons = false));
    await page.getByRole("button", { name: "Retry class lessons", exact: true }).click();
    await card("Ocean conservation").waitFor();
    await page.evaluate(() => window.setLibraryUser(undefined));
    await page.waitForFunction(() => !document.querySelector("section"));
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(
      "Class library UI passed: existing classes, create/retry, empty, assign, multi-class reuse, teaching dates/notes, chronological history, clear date, filters, open links, safe move, remove/retry, preserved lessons, desktop/mobile, read + mutation account isolation, error recovery, sign-out.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
