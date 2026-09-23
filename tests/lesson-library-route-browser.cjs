const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE ||
    "C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);
const assert = require("node:assert/strict");
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:3001";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const errors = [],
    unexpected = [];
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.routeWebSocket(/.*/, (socket) => socket.close());
    await page.route("**/_serverFn/**", (route) => {
      unexpected.push(route.request().url());
      return route.abort();
    });
    await page.route("**/lesson-route-test", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module">window.process={env:{NODE_ENV:"development",TSS_SERVER_FN_BASE:"/_serverFn/"}};import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>',
      }),
    );
    await page.route("**/src/components/AppShell.tsx*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: "export function AppShell({children}) { return children; }",
      }),
    );
    await page.route("**/src/hooks/useAuth.tsx*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export function useAuth(){const [user,setUser]=window.fixtureReact.useState({id:'teacher-a'});window.switchAuth=setUser;return {user,loading:false,isAuthenticated:!!user};}`,
      }),
    );
    await page.route("**/src/lib/lesson.functions.ts*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export async function listLessons(){window.lessonReads=(window.lessonReads||0)+1;if(window.failLessons)throw Error('Temporary library failure');return window.testUser==='teacher-a'?window.lessons:[];}export async function duplicateLesson(){return {id:'duplicate'};}export async function deleteLesson(){return {ok:true};}`,
      }),
    );
    await page.route("**/src/lib/teacher-tools.functions.ts*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export async function listFavorites(){return window.favorites;}export async function setLessonFavorite({data}){window.favorites=data.active?[data.lessonId]:[];return {ok:true};}export async function saveClassSettings(){throw Error('unused');}`,
      }),
    );
    await page.route("**/src/lib/lesson-drafts.functions.ts*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export async function listLessonDrafts(){return [];}`,
      }),
    );
    await page.route("**/src/lib/class-library.functions.ts*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export async function getClassLibrary(){return {classes:[{id:'monday',name:'Monday beginners',settings:{studentAge:'Adults',level:'A1',durationMinutes:60,technologyAvailable:''}}],links:[]};}export async function assignLessonToClass(){}export async function updateClassLesson(){}export async function removeLessonFromClass(){}export async function moveClassLesson(){}`,
      }),
    );
    await page.goto(origin + "/lesson-route-test");
    await page.evaluate(async () => {
      window.testUser = "teacher-a";
      window.favorites = ["ocean"];
      const lesson = (id, topic, level, main_skill) => ({
        id,
        topic,
        level,
        main_skill,
        student_age: "Adults",
        duration_minutes: 60,
        created_at: "2026-09-01T00:00:00Z",
      });
      window.lessons = [
        lesson("ocean", "Ocean conservation", "A1", "Reading"),
        lesson("zoo", "A day at the zoo", "A2", "Speaking"),
      ];
      await (await import("/tests/lesson-library-route-fixture.tsx")).mount();
    });
    await page.getByRole("heading", { name: "My lessons", exact: true }).waitFor();
    const tabs = page.getByRole("tablist", { name: "Lesson library views" });
    assert.equal(await tabs.getByRole("tab").count(), 4);
    await page.getByRole("link", { name: "Ocean conservation", exact: false }).waitFor();
    await page.getByRole("tab", { name: "Favorites", exact: true }).click();
    assert.equal(
      await page.getByRole("link", { name: "Ocean conservation", exact: false }).count(),
      1,
    );
    assert.equal(
      await page.getByRole("link", { name: "A day at the zoo", exact: false }).count(),
      0,
    );
    await page.getByRole("tab", { name: "Classes", exact: true }).click();
    await page.getByRole("button", { name: "Open class Monday beginners", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.lessonReads), 1, 'Class view reuses the recent saved-lesson list');
    assert.equal(
      await page.getByRole("searchbox", { name: "Search by topic", exact: true }).count(),
      0,
      "Saved-lesson panel is not duplicated in Classes",
    );
    await page.getByRole("tab", { name: "Unfinished", exact: true }).click();
    await page.getByText("No unfinished lessons", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Open class Monday beginners", exact: true }).count(),
      0,
    );
    await page.getByRole("tab", { name: "All lessons", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search by topic", exact: true }).fill("ocean");
    assert.equal(
      await page.getByRole("link", { name: "A day at the zoo", exact: false }).count(),
      0,
    );
    await page.getByRole("combobox", { name: "English level", exact: true }).selectOption("A2");
    await page
      .getByText("No lessons match these filters. Try another topic or clear the filters.", {
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: "Clear filters", exact: true }).click();
    await page.getByRole("link", { name: "A day at the zoo", exact: false }).waitFor();
    await page.evaluate(async () => {
      window.failLessons = true;
      await window.fixtureCache.invalidateQueries({queryKey:['lessons','teacher-a']});
    });
    await page.getByRole('button', {name:'Retry lessons',exact:true}).waitFor();
    assert.equal(await page.evaluate(() => window.lessonReads), 2, 'Failed reads do not silently retry');
    assert.equal(await page.getByRole('link',{name:'Ocean conservation',exact:false}).count(),1,'A failed refresh keeps previously loaded lessons visible');
    await page.evaluate(() => {window.failLessons=false;});
    await page.getByRole('button', {name:'Retry lessons',exact:true}).click();
    await page.getByRole('button', {name:'Retry lessons',exact:true}).waitFor({state:'hidden'});
    assert.equal(await page.evaluate(() => window.lessonReads), 3, 'Retry performs one new read');
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      "All lesson actions and four tabs fit a mobile viewport",
    );
    await page.getByRole("tab", { name: "Classes", exact: true }).click();
    await page.getByRole("button", { name: "Open class Monday beginners", exact: true }).click();
    await page.evaluate(() => {
      window.testUser = "teacher-b";
      window.switchAuth({ id: "teacher-b" });
    });
    await page.getByText("No saved lessons yet", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("tab", { name: "All lessons", exact: true })
        .getAttribute("aria-selected"),
      "true",
      "Account change resets library view and local filters",
    );
    assert.equal(await page.getByText("Monday beginners", { exact: true }).count(), 0);
    await page.evaluate(() => window.switchAuth(null));
    await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(
      "My lessons route passed: All/Favorites/Unfinished/Classes integration, search/level filters, mobile layout, account reset and sign-out redirect.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
