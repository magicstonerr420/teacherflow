import React from 'react';
import { createRoot } from 'react-dom/client';
import { WorksheetHub } from '../src/components/lesson/WorksheetHub';
import type { Worksheet } from '../src/lib/lesson-schema';
export function mount() {
  const student = { title: 'Print verification', instructions: 'Complete each sentence.', sections: [{ label: 'A', title: 'Practice', format: 'fill-in-the-blank', instructions: 'Write have or has. Example: She has visited Rome.', passage: '', wordBank: [], items: [{ number: 1, prompt: 'I ______ visited Paris.', choices: [], answerLines: 1, visual: '' }] }] };
  const worksheet = { title: 'Print verification', student, studentB: { title: '', instructions: '', sections: [] }, teacher: { overview: 'Check auxiliary verbs.', groupWorkGuidance: '', sections: [{ label: 'A', title: 'Practice', answers: ['have'], explanation: 'Use have with I.', expectedResponses: [], commonErrors: [], corrections: [], teacherNotes: '' }] }, teacherB: [] } as Worksheet;
  const div = document.createElement('div');
  document.body.replaceChildren(div);
  createRoot(div).render(<WorksheetHub worksheet={worksheet} request={{ subject: 'English', topic: 'Present Perfect', studentAge: '14-16', level: 'B1', durationMinutes: 60, mainSkill: 'Grammar', secondarySkill: null, learningObjective: 'Use have and has correctly.', groupWorkEnabled: false, studentsPerGroup: null }} />);
}
