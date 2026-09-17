Historical note: the earlier reading-only phase was paused. The owner subsequently authorized adding and testing reading, listening scripts and voice generation on September 17, 2026. That authorization supersedes the pause and the old TEACHERFLOW_READING / VITE_TEACHERFLOW_READING switches; these switches are no longer used.

Dedicated DeepSeek reading runs for relevant newly generated lessons. Existing saved lessons are preserved until the teacher explicitly generates or regenerates an activity. Listening scripts are generated for listening lessons; the teacher generates a recording from the Listening tab. See LISTENING-SETUP.md for model, storage and validation details.

Work retained: reading schema, server cache, age/CEFR prompts, worksheet integration, teacher-only answers and reading retry controls. Automated and browser checks were added, but live samples exposed inconsistent evidence quotations and some awkward wording; not every age/CEFR case passed. The integrated lesson reached all nine stages; a no-technology check found a technology-related distractor in a reading. Do not describe Phase 1 as complete.

The main text model remains openai/gpt-5.4-mini; illustrations remain google/gemini-3.1-flash-image-preview at 1K. Their existing settings are unchanged by the listening integration.
