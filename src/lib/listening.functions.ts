import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { betaEnabled, betaStore } from './beta-store.server';
import { betaUser, isOwner } from './beta-auth.server';
import { foundationSchema, lessonRequestSchema } from './lesson-schema';
import { applyListening } from './listening';
import { generateListening, generateListeningAudio, getListeningAudio } from './listening.server';

const identity = async () => {
  // Hosted services must authenticate even if beta quotas are disabled.
  const user = betaEnabled() || process.env['NODE_ENV'] === 'production' ? await betaUser(getRequest()) : 'local';
  return { user, limited: betaEnabled() && !isOwner(user) };
};
export const createListening = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ request: lessonRequestSchema, lesson: foundationSchema }).parse(input))
  .handler(async ({ data }) => {
    const { user, limited } = await identity();
    const lesson = limited ? betaStore().readingLesson(user, data.request) : data.lesson;
    const result = await generateListening(data.request, lesson, user, limited);
    if (limited && result.status === 'ready') betaStore().retainReading(user, data.request, value => applyListening(value, result));
    return result;
  });
export const createListeningAudio = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ request: lessonRequestSchema, fingerprint: z.string().regex(/^[a-f0-9]{64}$/), choice: z.enum(['standard', 'economy', 'test']).default('standard') }).parse(input))
  .handler(async ({ data }) => {
    const { user, limited } = await identity();
    // Recording is an explicit optional action, including for lessons whose core
    // classroom activities use only the teacher's voice. Account checks still apply.
    if (data.choice === 'test' && process.env['NODE_ENV'] === 'production') throw new Error('The test voice is available only during local development.');
    if (limited) {
      const lesson = betaStore().readingLesson(user, data.request);
      if (lesson.listening?.fingerprint !== data.fingerprint) throw new Error('Generate the listening activity for this lesson first.');
      if (data.choice === 'test') throw new Error('The test voice is reserved for local development.');
    }
    const result = await generateListeningAudio(data.fingerprint, user, data.choice, limited);
    if (limited) betaStore().retainReading(user, data.request, lesson => ({ ...lesson, listening: { ...lesson.listening, audio: result.audio } }));
    return result;
  });
export const loadListeningAudio = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }).parse(input))
  .handler(async ({ data }) => getListeningAudio(data.id, (await identity()).user));
