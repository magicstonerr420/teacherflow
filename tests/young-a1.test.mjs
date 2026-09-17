import test from "node:test";
import assert from "node:assert/strict";
import { isYoungA1, pictureSvg, youngWorksheetIssues } from "../src/lib/young-learners.ts";
import { youngSlidePages } from "../src/lib/young-slides.ts";
test("changes are restricted to ages 5-7 at A1", () => {
  assert.ok(isYoungA1({ studentAge: "5-7", level: "A1" }));
  for (const r of [
    { studentAge: "5-7", level: "A2" },
    { studentAge: "8-9", level: "A1" },
    { studentAge: "Adults", level: "A1" },
  ])
    assert.equal(isYoungA1(r), false);
});
test("body clues are printable illustrations without embedded answer labels", () => {
  for (const word of [
    "head",
    "eye",
    "hand",
    "arm",
    "leg",
    "foot",
    "cow",
    "pig",
    "duck",
    "sheep",
    "horse",
  ]) {
    const svg = pictureSvg(word);
    assert.match(svg, /<svg/);
    assert.doesNotMatch(svg, /<text|<script/);
  }
  assert.equal(pictureSvg("unavailable"), null);
});
test("reject the ambiguous and circular tasks reported by the teacher", () => {
  const doc = {
    sections: [
      { label: "B", items: [{ number: 1, prompt: "Touch your ______.", visual: "" }] },
      {
        label: "C",
        items: [{ number: 1, prompt: "This word is for your eye. Write it: ____", visual: "" }],
      },
    ],
  };
  assert.equal(youngWorksheetIssues(doc).length, 2);
  doc.sections[0].items[0].visual = "head";
  doc.sections[1].items[0] = { number: 1, prompt: "Look. Circle: see / clap.", visual: "eye" };
  assert.deepEqual(youngWorksheetIssues(doc), []);
});
test("long slide text is paginated without dropping content or overlapping the task", () => {
  const text = Array.from({ length: 80 }, (_, i) => "word" + i).join(" ");
  const pages = youngSlidePages({
    title: "One topic",
    studentText: text,
    bullets: [],
    layout: "content",
    vocabulary: [],
    interaction: "Say the words.",
  });
  assert.ok(pages.length > 1);
  assert.equal(
    pages
      .map((p) => p.studentText)
      .join(" ")
      .replace(/\s+/g, " "),
    text,
  );
  assert.ok(pages.every((p) => p.studentText.split("\n").length <= 7));
  assert.equal(pages[0].interaction, "");
  assert.equal(pages.at(-1).interaction, "Say the words.");
});

test("unavailable picture clues and incomplete flashcards are rejected", async () => {
  const { youngPresentationIssues } = await import("../src/lib/young-learners.ts");
  assert.match(
    youngWorksheetIssues({
      sections: [
        { label: "B", items: [{ number: 1, prompt: "Look. Write.", visual: "spaceship" }] },
      ],
    }).join(" "),
    /unsupported/,
  );
  assert.match(
    youngPresentationIssues({ slides: [] }, { overview: { materialsNeeded: ["flashcards"] } }).join(
      " ",
    ),
    /no vocabulary/,
  );
  assert.match(
    youngPresentationIssues(
      { slides: [{ vocabulary: [{ word: "bus", imagePrompt: "" }] }] },
      { activity: "flashcards" },
    ).join(" "),
    /imagePrompt/,
  );
  assert.deepEqual(
    youngPresentationIssues(
      { slides: [{ vocabulary: [{ word: "head", imagePrompt: "" }] }] },
      { activity: "flashcards" },
    ),
    [],
  );
});
test("A1 card images take priority within the existing six-picture allowance", async () => {
  const { lessonImagePrompts } = await import("../src/lib/image-plan.ts");
  const lesson = {
    presentation: {
      slides: [
        ...Array.from({ length: 6 }, (_, i) => ({ imagePrompt: "scene" + i })),
        { layout: "vocabulary", vocabulary: [{ imagePrompt: "card1" }, { imagePrompt: "card2" }] },
      ],
    },
  };
  assert.deepEqual(lessonImagePrompts(lesson, { studentAge: "5-7", level: "A1" }), [
    "card1",
    "card2",
    "scene0",
    "scene1",
    "scene2",
    "scene3",
  ]);
  assert.deepEqual(lessonImagePrompts(lesson, { studentAge: "Adults", level: "A1" }), [
    "scene0",
    "scene1",
    "scene2",
    "scene3",
    "scene4",
    "scene5",
  ]);
});
test("long interaction text is retained on continuation slides", () => {
  const task = Array.from({ length: 100 }, (_, i) => "instruction" + i).join(" ");
  const pages = youngSlidePages({
    title: "Topic",
    studentText: "Read.",
    bullets: [],
    layout: "content",
    vocabulary: [],
    interaction: task,
  });
  assert.ok(pages.length > 1);
  assert.equal(
    pages
      .slice(1)
      .map((p) => p.studentText)
      .join(" ")
      .replace(/\s+/g, " "),
    task,
  );
  assert.ok(pages.every((p) => p.studentText.split("\n").length <= 7));
});
