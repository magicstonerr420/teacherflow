Phase 1 is paused at the user's request. It is not accepted as complete.

Dedicated DeepSeek generation requires TEACHERFLOW_READING=true; its controls also require VITE_TEACHERFLOW_READING=true. Both are disabled. The regeneration endpoint refuses requests while paused. Existing saved lesson content is preserved.

Work retained: reading schema, server cache, age/CEFR prompts, worksheet integration, teacher-only answers and reading retry controls. Automated and browser checks were added, but live samples exposed inconsistent evidence quotations and some awkward wording; not every age/CEFR case passed. The integrated lesson reached all nine stages; a no-technology check found a technology-related distractor in a reading. Do not describe Phase 1 as complete.

The subsequent, separately authorized model upgrade replaces the active main text model with openai/gpt-5.4-mini and illustration model with google/gemini-3.1-flash-image-preview at 1K. This supersedes Phase 1's earlier instruction to keep Gemini/FLUX fixed. No listening or TTS work was added.
