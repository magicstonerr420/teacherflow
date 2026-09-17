# A1 ages 5–7: presentation and worksheet fixes

Scope: the first age-band repair only. Existing model providers and the paused Reading feature are unchanged.

## Changes

- `src/lib/young-learners.ts`: scoped age/level rules, reusable body/farm picture clues, checks for absent picture cues, circular worksheet tasks and missing flashcard materials.
- `src/config/teacherflow-prompt.ts`, `src/lib/lesson.functions.ts`: apply the rules to lesson generation and section regeneration. A worksheet that fails the checks gets one bounded repair attempt; invalid replacements do not overwrite the existing section.
- `src/components/lesson/WorksheetHub.tsx`, `src/lib/exports.ts`: picture clues in Teacher/Student worksheets, print preview and the student PDF. Student mode has no answer keys or teacher notes.
- `src/lib/young-slides.ts`, `src/lib/pptx.ts`: measure and paginate slide text, reserve separate footer space, preserve image aspect ratio, and append picture-front/word-back flashcards for referenced vocabulary.
- `src/components/lesson/PresentationPanel.tsx`: show both flashcard sides, retain successful pictures on failure, offer export with available pictures and reset stale downloads after edits.
- `src/lib/image-plan.ts`, `src/lib/beta-store.server.ts`: prioritize required card pictures within the existing six-image allowance and use the same selection on client and server. Retry uses cached successful pictures.

## Verification

- TypeScript: passed.
- Production build and actual production server startup: passed; home, builder and sign-in return HTTP 200.
- 39 automated tests passed: new A1 checks plus existing beta seats/quotas, owner access, auth environment mapping, OpenRouter error handling and illustration transport.
- Browser integration: passed student/teacher separation, Version B, print preview, PPTX and PDF generation, two concurrent image requests, successful-image reuse, partial failure export and stale-download reset.
- Handcrafted My body fixture: 17-slide PPTX with five front/back card pairs and a three-page student PDF. PDF pages rendered and visually inspected. PPTX XML/shape bounds and front/back separation checked.
- Export smoke tests for ages 8–9 and Adults still produce the previous seven-slide structure for the same fixture.

## Practical limits / next verification

- The fixture is authored test data, not a newly generated AI lesson. The live OpenRouter test returned HTTP 402 for the locally configured key, so live content quality and provider image generation could not be verified. The Render key's balance was not independently checked.
- The PPTX opens structurally and its measured text boxes do not intersect the footer. Native PowerPoint/WPS visual rendering was not available in this test environment.
- Existing saved worksheet text is preserved. Regenerate only Worksheet, inspect it and save to replace old ambiguous exercises. Regenerate only Presentation if an old lesson mentions flashcards but lacks vocabulary entries/picture prompts.
- Built-in picture cues cover the supported keyword list. Other flashcard concepts require successful original illustration generation; missing required pictures are reported rather than exporting empty flashcards.
- No claim that every generation or every application feature has undergone a new live end-to-end test. Stop after this age-band review; do not start the next phase.
