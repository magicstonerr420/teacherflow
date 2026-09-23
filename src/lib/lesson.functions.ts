import { BetaBudgetError } from './beta-budget.server';
import {alternateWorksheetIssue, removeRepeatedWorksheetSections} from './worksheet-versions';
import { generateAlternateWorksheet } from './alternate-worksheet.server';
import { generateWorksheetAnswers } from './worksheet-answers.server';
import { americanEnglishContent } from './american-english';
import { extendNewShapePresentation } from './color-shape-resources';
import { isYoungA1, youngWorksheetIssues, youngPresentationIssues, worksheetPictureIssues } from './young-learners';
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { betaStore } from "./beta-store.server";
import { generationAccess } from "./generation-access.server";
import { betaEnabled } from './beta-store.server';
import { betaUser } from './beta-auth.server';
import { lessonDraftStore } from './lesson-drafts-store.server';
import { saveCompletedDraft } from './lesson-drafts-save.server';
import { studentShareStore } from './student-share-store.server';
import { z } from 'zod';
import { generateReading } from "./reading.server";
import { needsReading, integrateReadingPatch, withoutReadingSections, READING_HANDOFF } from "./reading";
import { generateListening } from './listening.server';
import { needsListening, integrateListeningPatch, withoutListeningSections, LISTENING_HANDOFF } from './listening';
import { STAGE_SCHEMAS, readingCoreStageSchema, readingCoreWorksheetSchema, type GenerationStage } from "./generation-plan";

import {
  MASTER_SYSTEM_PROMPT,
  SECTION_PROMPTS,
  STAGE_PROMPTS,
  renderLessonContext,
  type LessonRequest,
} from "@/config/teacherflow-prompt";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateStructured, LessonGenerationError } from "@/lib/ai-service.server";
import { findTechTerms, isNoTechRequest, noTechRepairInstruction } from "@/lib/no-tech";
import {
  SECTION_SCHEMAS,
  assessmentSchema,
  differentiationSchema,
  foundationSchema,
  lessonRequestSchema,
  materialsSchema,
  ageBand,
  type LessonPackage,
  type SectionKeyName,
} from "@/lib/lesson-schema";

/**
 * Generates content and, when the class has no technology, automatically
 * rewrites any output that still depends on electronic equipment.
 */
async function generateNoTechSafe<T>(args: {
  schema: Parameters<typeof generateStructured>[0]["schema"];
  schemaName: string;
  system: string;
  input: string;
  noTech: boolean;
}): Promise<T> {
  const first = await generateStructured({
    schema: args.schema,
    schemaName: args.schemaName,
    system: args.system,
    input: args.input,
  });
  if (!args.noTech) return removeRepeatedWorksheetSections(americanEnglishContent(first) as Partial<LessonPackage>) as T;

  let current = first;
  for (let attempt = 0; attempt < 1; attempt++) {
    const found = findTechTerms(current);
    if (!found.length) break;
    console.warn(`[no-tech] repairing ${args.schemaName}: ${found.join(", ")}`);
    current = await generateStructured({
      schema: args.schema,
      schemaName: args.schemaName,
      system: args.system,
      input: `${args.input}\n\nPREVIOUS OUTPUT (must be revised)\n${JSON.stringify(
        current,
      )}\n\n${noTechRepairInstruction(found)}`,
    });
  }
  return removeRepeatedWorksheetSections(americanEnglishContent(current) as Partial<LessonPackage>) as T;
}



type StageName = GenerationStage;

function friendly(error: unknown): never {
  if (error instanceof LessonGenerationError || error instanceof BetaBudgetError) throw new Error(error.message);
  console.error(error);
  throw new Error("Something went wrong while building the class. Your inputs are safe — please retry.");
}

function contextBlock(request: LessonRequest, prior: Partial<LessonPackage>, worksheetScope?: 'studentB'): string {
  const parts = [renderLessonContext(request)];
  if (prior.reading) parts.push(`DEDICATED READING\n${JSON.stringify(prior.reading)}`);
  if (prior.listening) parts.push(`DEDICATED LISTENING\n${JSON.stringify(prior.listening)}`);
  if (prior.overview) {
    parts.push(`ALREADY DESIGNED — LESSON OVERVIEW\n${JSON.stringify(prior.overview)}`);
  }
  if (prior.lessonPlan) {
    parts.push(`ALREADY DESIGNED — LESSON PLAN\n${JSON.stringify(prior.lessonPlan)}`);
  }
  if (prior.worksheet) {
    const worksheet = worksheetScope === 'studentB' ? { studentB: prior.worksheet.studentB } : prior.worksheet;
    parts.push(`ALREADY DESIGNED — WORKSHEET\n${JSON.stringify(worksheet)}`);
  }
  if (prior.assessment) {
    parts.push(`ALREADY DESIGNED — ASSESSMENT\n${JSON.stringify(prior.assessment)}`);
  }
  parts.push("Stay perfectly consistent with everything already designed above.");
  return parts.join("\n\n");
}

/**
 * One generation pass. The client calls this once per stage so the progress the
 * teacher sees reflects real application state, not a timer.
 */
export const generateLessonStage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const parsed = lessonRequestSchema.parse((input as { request: unknown }).request);
    const stage = (input as { stage: StageName }).stage;
    if (!Object.prototype.hasOwnProperty.call(STAGE_SCHEMAS, stage)) throw new Error("Unknown lesson step. Refresh the builder to load the current version.");
    const prior = ((input as { prior?: Partial<LessonPackage> }).prior ?? {}) as Partial<LessonPackage>;
    const draftId=z.string().uuid().optional().parse((input as {draftId?:unknown}).draftId);
    return { request: parsed, stage, prior, draftId };
  })
  .handler(async ({ data }) => {
    const { stage } = data;
    const { user, limited } = await generationAccess(getRequest());
    const draftUser=data.draftId?(betaEnabled()?user:await betaUser(getRequest())):user;
    // A resumed draft is immutable. Neither the supplied request nor prior can replace its checkpoints.
    const request=data.draftId?lessonDraftStore().get(draftUser,data.draftId).request:data.request;
    const generate = async (prior: Partial<LessonPackage>) => {
    const schemas = STAGE_SCHEMAS;
    if (ageBand(request.studentAge) !== "Kids" && stage === "studentB") return { worksheet: { studentB: { title: "", instructions: "", sections: [] } } };
    if (ageBand(request.studentAge) !== "Kids" && stage === "teacherB") return { worksheet: { teacherB: [] } };
    let reading = prior.reading;
    let listening = prior.listening;
    if (stage === "student" && needsReading(request, prior)) {
      try { reading = await generateReading(request, prior, user, "initial", limited); }
      catch { reading = { status: "failed", error: "Reading generation could not start. Your lesson is retained; retry only the reading." }; }
      prior = { ...prior, reading };
    }
    if (stage === 'student' && needsListening(request)) {
      try { listening = await generateListening(request, prior, user, limited); }
      catch { listening = { status: 'failed', error: 'The listening script could not be generated. Your lesson is retained; retry in Listening.' }; }
      prior = { ...prior, listening };
    }
    const promptStage = stage === "foundation" || stage === "assessment" || stage === "differentiation" ? stage : "materials";
    const modelPrior = stage === "teacher" || stage === "teacherB" ? withoutListeningSections(withoutReadingSections(prior)) : prior;
    const schema = reading ? readingCoreStageSchema(stage, modelPrior) : schemas[stage];
    const system = `${MASTER_SYSTEM_PROMPT}${reading ? `\n${READING_HANDOFF}` : ''}${listening ? `\n${LISTENING_HANDOFF}` : ''}`;

    try {
      if (stage === 'studentB') {
        const result = await generateAlternateWorksheet(request, prior, generateNoTechSafe<Partial<LessonPackage>>);
        return integrateListeningPatch(prior, integrateReadingPatch(prior, result));
      }
      if (stage === 'teacher' || stage === 'teacherB') {
        const result=await generateWorksheetAnswers(request,{...modelPrior,...(reading?{reading}:{}),...(listening?{listening}:{})},stage,generateNoTechSafe);
        return integrateListeningPatch(prior,integrateReadingPatch(prior,result));
      }
      let result = await generateNoTechSafe<Partial<LessonPackage>>({
        schema,
        schemaName: `teacherflow_${stage}`,
        system,
        input: `${contextBlock(request, modelPrior)}\n\n${STAGE_PROMPTS[promptStage]}\n\nCURRENT PART: ${stage}. Generate ONLY the fields required by the response schema for this part. Other parts are handled in separate requests. Keep prose concise and avoid repeating prior lesson content outside the required fields.`,
        noTech: isNoTechRequest(request.technologyAvailable),
      });
      if (stage === 'student') {
        const validate = isYoungA1(request) ? youngWorksheetIssues : worksheetPictureIssues;
        const docKey = 'student';
        const issues = validate(result.worksheet?.[docKey]);
        if (issues.length) {
          result = await generateNoTechSafe<Partial<LessonPackage>>({
            schema, schemaName: `teacherflow_${stage}_clarity_repair`, system,
            input: `${contextBlock(request, modelPrior)}\n${STAGE_PROMPTS.materials}\nCURRENT PART: ${stage}. Revise this worksheet: ${JSON.stringify(result)}\nFix these issues: ${issues.join('; ')}`,
            noTech: isNoTechRequest(request.technologyAvailable),
          });
          const remaining = validate(result.worksheet?.[docKey]);
          if (remaining.length) {
            console.warn('TeacherFlow worksheet clarity', { stage, issues: remaining });
            throw new LessonGenerationError('worksheet_clarity', 'The worksheet still has missing picture clues or unclear tasks. Your earlier lesson sections are saved. Retry this worksheet section.');
          }
        }
      }
      if (isYoungA1(request) && stage === 'presentation') {
        const issues=youngPresentationIssues(result.presentation, prior);
        if(issues.length){
          result=await generateNoTechSafe<Partial<LessonPackage>>({schema,schemaName:'teacherflow_presentation_cards_repair',system:MASTER_SYSTEM_PROMPT,input:`${contextBlock(request, modelPrior)}\n${STAGE_PROMPTS.materials}\nCURRENT PART: presentation. Fix: ${issues.join('; ')}`,noTech:isNoTechRequest(request.technologyAvailable)});
          if(youngPresentationIssues(result.presentation,prior).length)throw new LessonGenerationError('flashcard_materials','The presentation did not include the required flashcard pictures. Your earlier sections are retained. Retry this presentation section.');
        }
      }
      if (stage === 'presentation' && result.presentation) result = { ...result, presentation: extendNewShapePresentation(result.presentation, request) };
      const patch = reading ? integrateReadingPatch(prior, { ...result, reading }) : result;
      return listening ? integrateListeningPatch(prior, { ...patch, listening }) : patch;

    } catch (error) {
      friendly(error);
    }
    };
    if(data.draftId)return lessonDraftStore().stage(draftUser,data.draftId,stage,async(savedRequest,prior)=>
      limited?betaStore().stage(user,savedRequest,stage,generate):generate(prior));
    if (limited) return betaStore().stage(user, request, stage, generate);
    return generate(data.prior);
  });

export const saveLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { request: unknown; content: LessonPackage; draftId?:unknown };
    return { request: lessonRequestSchema.parse(i.request), content: i.content, draftId:z.string().uuid().optional().parse(i.draftId) };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if(data.draftId)return saveCompletedDraft(lessonDraftStore(),supabase,userId,data.draftId);
    const r = data.request;
    const { data: row, error } = await supabase
      .from("lessons")
      .insert({
        user_id: userId,
        topic: r.topic,
        subject: r.subject,
        student_age: r.studentAge,
        level: r.level,
        duration_minutes: r.durationMinutes,
        main_skill: r.mainSkill,
        learning_objective: r.learningObjective,
        inputs: r,
        content: data.content,
      })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      throw new Error("We could not save this lesson. Please try again.");
    }
    return { id: row.id as string };
  });

export const listLessons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("lessons")
      .select("id, topic, level, student_age, duration_minutes, main_skill, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      throw new Error("We could not load your lessons.");
    }
    return data ?? [];
  });

export const getLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("lessons")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) {
      console.error(error);
      throw new Error("We could not open this lesson.");
    }
    if (!row) throw new Error("This lesson could not be found.");
    return row;
  });

export const deleteLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    return studentShareStore().deleteLesson(context.supabase, context.userId, data.id);
  });

/* ------------------ Phase 4: edit, regenerate, duplicate ------------------ */

/** Everything the model needs to keep a regenerated section consistent. */
function regenerationContext(request: LessonRequest, lesson: LessonPackage, skip: SectionKeyName): string {
  const parts = [renderLessonContext(request)];
  parts.push(`ALREADY DESIGNED — LESSON OVERVIEW\n${JSON.stringify(lesson.overview)}`);
  parts.push(`ALREADY DESIGNED — LESSON PLAN\n${JSON.stringify(lesson.lessonPlan)}`);
  if (lesson.listening) parts.push(`DEDICATED LISTENING\n${JSON.stringify(lesson.listening)}`);
  if (skip !== "worksheet" && lesson.worksheet) {
    parts.push(`ALREADY DESIGNED — WORKSHEET (student side)\n${JSON.stringify(lesson.worksheet)}`);
  }
  if (skip !== "activity" && lesson.activity) {
    parts.push(`ALREADY DESIGNED — CLASSROOM ACTIVITY\n${JSON.stringify(lesson.activity)}`);
  }
  if (skip !== "assessment" && lesson.assessment) {
    parts.push(`ALREADY DESIGNED — ASSESSMENT\n${JSON.stringify(lesson.assessment)}`);
  }
  parts.push(
    "Regenerate ONLY the requested component. Everything else above is fixed and must stay valid.",
  );
  return parts.join("\n\n");
}

export const regenerateSection = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const i = input as { request: unknown; lesson: LessonPackage; section: SectionKeyName };
    return {
      request: lessonRequestSchema.parse(i.request),
      lesson: i.lesson,
      section: i.section,
    };
  })
  .handler(async ({ data }) => {
    if ((await generationAccess(getRequest())).limited) throw new Error("AI section regeneration is disabled during the beta to protect your allowance. You can edit and export your existing lesson.");
    const { request, lesson, section } = data;
    const readingEnabled = true;
    const schema = section === "worksheet" && readingEnabled && lesson.reading
      ? SECTION_SCHEMAS.worksheet.extend({ worksheet: readingCoreWorksheetSchema }) : SECTION_SCHEMAS[section];
    if (!schema) throw new Error("That part of the lesson cannot be regenerated.");
    try {
      let result = await generateNoTechSafe<Partial<LessonPackage>>({
        schema,
        schemaName: `teacherflow_section_${section}`,
        system: `${MASTER_SYSTEM_PROMPT}${lesson.reading ? `\n${READING_HANDOFF}` : ''}${lesson.listening ? `\n${LISTENING_HANDOFF}` : ''}`,
        input: `${regenerationContext(request, lesson, section)}\n\n${SECTION_PROMPTS[section]}`,
        noTech: isNoTechRequest(request.technologyAvailable),
      });
      if (section === 'worksheet') {
        const validate = isYoungA1(request) ? youngWorksheetIssues : worksheetPictureIssues;
        const issues=[...validate(result.worksheet?.student),...validate(result.worksheet?.studentB)];
        if(issues.length){
          result=await generateNoTechSafe<Partial<LessonPackage>>({schema,schemaName:'teacherflow_worksheet_clarity_repair',system:MASTER_SYSTEM_PROMPT,input:`${regenerationContext(request, lesson, section)}\n${SECTION_PROMPTS.worksheet}\nFix these worksheet issues: ${issues.join('; ')}. Return both student versions and the matching corrected teacher answers.`,noTech:isNoTechRequest(request.technologyAvailable)});
          if([...validate(result.worksheet?.student),...validate(result.worksheet?.studentB)].length)throw new LessonGenerationError('worksheet_clarity','The revised worksheet still has unclear picture tasks. Your original worksheet is retained.');
        }
      }
      if(section==='worksheet' && alternateWorksheetIssue(result.worksheet?.student,result.worksheet?.studentB)) {
        const repaired=await createDistinctVersionB(request,{...lesson,...result} as LessonPackage);
        result={...result,worksheet:repaired.worksheet};
      }
      if (section === 'presentation' && isYoungA1(request)) {
        const issues=youngPresentationIssues(result.presentation,lesson);
        if(issues.length)throw new LessonGenerationError('flashcard_materials','The revised presentation is missing required flashcard pictures. Your original presentation is retained; retry this section.');
      }
      return integrateListeningPatch(lesson, integrateReadingPatch(lesson, result));

    } catch (error) {
      friendly(error);
    }
  });

/** Saves teacher edits (or a regenerated section) back onto a stored lesson. */
export const updateLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { id: string; content: LessonPackage };
    return { id: i.id, content: i.content };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lessons")
      .update({ content: data.content, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) {
      console.error(error);
      throw new Error("We could not save your changes. Your lesson is safe — please try again.");
    }
    return { ok: true };
  });

/** Copies a saved lesson so a teacher can adapt it for another class. */
export const duplicateLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("lessons")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) {
      console.error(error);
      throw new Error("We could not duplicate this lesson.");
    }
    const { data: copy, error: insertError } = await supabase
      .from("lessons")
      .insert({
        user_id: userId,
        topic: `${row.topic} (copy)`,
        subject: row.subject,
        student_age: row.student_age,
        level: row.level,
        duration_minutes: row.duration_minutes,
        main_skill: row.main_skill,
        learning_objective: row.learning_objective,
        inputs: row.inputs,
        content: row.content,
      })
      .select("id")
      .single();
    if (insertError) {
      console.error(insertError);
      throw new Error("We could not duplicate this lesson.");
    }
    return { id: copy.id as string };
  });

async function createDistinctVersionB(request: LessonRequest, lesson: LessonPackage): Promise<Pick<LessonPackage,"worksheet">> {
  const student=await generateAlternateWorksheet(request,lesson,generateNoTechSafe<Partial<LessonPackage>>);
  const prior={...lesson,worksheet:{...lesson.worksheet,...student.worksheet}};
  const core=withoutListeningSections(withoutReadingSections(prior));
  const teacher=await generateWorksheetAnswers(request,{...core,...(prior.reading?{reading:prior.reading}:{}),...(prior.listening?{listening:prior.listening}:{})},'teacherB',generateNoTechSafe);
  const integrated=integrateListeningPatch(prior,integrateReadingPatch(prior,teacher));
  return {worksheet:{...prior.worksheet,...integrated.worksheet}};
}

export const repairDuplicateVersionB=createServerFn({method:'POST'})
 .inputValidator((input:unknown)=>{const i=input as {request:unknown;lesson:LessonPackage};return {request:lessonRequestSchema.parse(i.request),lesson:i.lesson};})
 .handler(async({data})=>{
  const {user,limited}=await generationAccess(getRequest());
  const generate=async(lesson:LessonPackage)=>{
    if(!alternateWorksheetIssue(lesson.worksheet?.student,lesson.worksheet?.studentB))return {worksheet:lesson.worksheet};
    try{return await createDistinctVersionB(data.request,lesson);}catch(error){friendly(error);}
  };
  if(limited)return betaStore().repairAlternate(user,data.request,generate);
  return generate(data.lesson);
 });
