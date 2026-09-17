import {alternateWorksheetIssue, removeRepeatedWorksheetSections} from './worksheet-versions';
import { generateAlternateWorksheet } from './alternate-worksheet.server';
import { americanEnglishContent } from './american-english';
import { isYoungA1, youngWorksheetIssues, youngPresentationIssues } from './young-learners';
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { betaEnabled, betaStore } from "./beta-store.server";
import { betaUser, isOwner } from "./beta-auth.server";
import { generateReading } from "./reading.server";
import { needsReading, integrateReadingPatch, withoutReadingSections, READING_HANDOFF } from "./reading";
import { generateListening } from './listening.server';
import { needsListening, integrateListeningPatch, withoutListeningSections, LISTENING_HANDOFF } from './listening';
import { STAGE_SCHEMAS, readingCoreStageSchema, readingCoreWorksheetSchema, answerAlignmentIssue, type GenerationStage } from "./generation-plan";

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
  if (error instanceof LessonGenerationError) throw new Error(error.message);
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
    return { request: parsed, stage, prior };
  })
  .handler(async ({ data }) => {
    const { request, stage } = data;
    const user = betaEnabled() ? await betaUser(getRequest()) : "local";
    const generate = async (prior: Partial<LessonPackage>) => {
    const schemas = STAGE_SCHEMAS;
    if (ageBand(request.studentAge) !== "Kids" && stage === "studentB") return { worksheet: { studentB: { title: "", instructions: "", sections: [] } } };
    if (ageBand(request.studentAge) !== "Kids" && stage === "teacherB") return { worksheet: { teacherB: [] } };
    let reading = prior.reading;
    let listening = prior.listening;
    if (stage === "student" && needsReading(request, prior)) {
      try { reading = await generateReading(request, prior, user, "initial", betaEnabled() && !isOwner(user)); }
      catch { reading = { status: "failed", error: "Reading generation could not start. Your lesson is retained; retry only the reading." }; }
      prior = { ...prior, reading };
    }
    if (stage === 'student' && needsListening(request)) {
      try { listening = await generateListening(request, prior, user, betaEnabled() && !isOwner(user)); }
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
      let result = await generateNoTechSafe<Partial<LessonPackage>>({
        schema,
        schemaName: `teacherflow_${stage}`,
        system,
        input: `${contextBlock(request, modelPrior, stage === 'teacherB' ? 'studentB' : undefined)}\n\n${STAGE_PROMPTS[promptStage]}\n\nCURRENT PART: ${stage}. Generate ONLY the fields required by the response schema for this part. Other parts are handled in separate requests. Preserve completed student items exactly when writing teacher answers. Solve each supplied question independently from its printed clue and picture; do not reuse an earlier key. Generate keys only for the worksheet sections shown; DeepSeek's reading key is added separately. Keep prose concise and avoid repeating prior lesson content outside the required fields.`,
        noTech: isNoTechRequest(request.technologyAvailable),
      });
      if (isYoungA1(request) && stage === 'student') {
        const docKey = 'student';
        const issues = youngWorksheetIssues(result.worksheet?.[docKey]);
        if (issues.length) {
          result = await generateNoTechSafe<Partial<LessonPackage>>({
            schema, schemaName: `teacherflow_${stage}_clarity_repair`, system,
            input: `${contextBlock(request, modelPrior)}\n${STAGE_PROMPTS.materials}\nCURRENT PART: ${stage}. Revise this worksheet: ${JSON.stringify(result)}\nFix these issues: ${issues.join('; ')}`,
            noTech: isNoTechRequest(request.technologyAvailable),
          });
          const remaining = youngWorksheetIssues(result.worksheet?.[docKey]);
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
      const alignmentIssue = answerAlignmentIssue(stage, modelPrior, result);
      if (alignmentIssue) {
        result = await generateNoTechSafe<Partial<LessonPackage>>({
          schema, schemaName: `teacherflow_${stage}_repair`, system,
          input: `${contextBlock(request, modelPrior, stage === 'teacherB' ? 'studentB' : undefined)}\n\nCURRENT PART: ${stage}. Generate only the required answer-key fields. ${alignmentIssue} Answer the existing worksheet questions exactly. The separate DeepSeek reading is excluded from these keys. Do not invent or change questions.`,
          noTech: isNoTechRequest(request.technologyAvailable),
        });
        if (answerAlignmentIssue(stage, modelPrior, result)) throw new LessonGenerationError("answer_alignment", "The answer key did not match the number of student questions, even after a repair attempt. Your worksheet is retained. Retry this part.");
      }
      const patch = reading ? integrateReadingPatch(prior, { ...result, reading }) : result;
      return listening ? integrateListeningPatch(prior, { ...patch, listening }) : patch;

    } catch (error) {
      friendly(error);
    }
    };
    if (betaEnabled()) {
      if (!isOwner(user)) return betaStore().stage(user, request, stage, generate);
    }
    return generate(data.prior);
  });

export const saveLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = input as { request: unknown; content: LessonPackage };
    return { request: lessonRequestSchema.parse(i.request), content: i.content };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
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
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lessons").delete().eq("id", data.id);
    if (error) {
      console.error(error);
      throw new Error("We could not delete this lesson.");
    }
    return { ok: true };
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
    if (betaEnabled() && !isOwner(await betaUser(getRequest()))) throw new Error("AI section regeneration is disabled during the beta to protect your allowance. You can edit and export your existing lesson.");
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
      if (section === 'worksheet' && isYoungA1(request)) {
        const issues=[...youngWorksheetIssues(result.worksheet?.student),...youngWorksheetIssues(result.worksheet?.studentB)];
        if(issues.length){
          result=await generateNoTechSafe<Partial<LessonPackage>>({schema,schemaName:'teacherflow_worksheet_clarity_repair',system:MASTER_SYSTEM_PROMPT,input:`${regenerationContext(request, lesson, section)}\n${SECTION_PROMPTS.worksheet}\nFix these worksheet issues: ${issues.join('; ')}. Return both student versions and the matching corrected teacher answers.`,noTech:isNoTechRequest(request.technologyAvailable)});
          if([...youngWorksheetIssues(result.worksheet?.student),...youngWorksheetIssues(result.worksheet?.studentB)].length)throw new LessonGenerationError('worksheet_clarity','The revised worksheet still has unclear picture tasks. Your original worksheet is retained.');
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
  const common={system:MASTER_SYSTEM_PROMPT,noTech:isNoTechRequest(request.technologyAvailable)};
  const student=await generateAlternateWorksheet(request,lesson,generateNoTechSafe<Partial<LessonPackage>>);
  const prior={...lesson,worksheet:{...lesson.worksheet,...student.worksheet}};
  const teacher=await generateNoTechSafe<Partial<LessonPackage>>({...common,schema:STAGE_SCHEMAS.teacherB,schemaName:'repair_alternate_answers',input:`${contextBlock(request,prior,'studentB')}\n${STAGE_PROMPTS.materials}\nCURRENT PART: teacherB. Answer only the replacement studentB questions exactly, in order.`});
  if(answerAlignmentIssue('teacherB',prior,teacher))throw new LessonGenerationError('answer_alignment','The replacement answer key did not match. Your worksheet is retained.');
  return {worksheet:{...prior.worksheet,teacherB:teacher.worksheet!.teacherB}};
}

export const repairDuplicateVersionB=createServerFn({method:'POST'})
 .inputValidator((input:unknown)=>{const i=input as {request:unknown;lesson:LessonPackage};return {request:lessonRequestSchema.parse(i.request),lesson:i.lesson};})
 .handler(async({data})=>{
  const user=await betaUser(getRequest());
  const generate=async(lesson:LessonPackage)=>{
    if(!alternateWorksheetIssue(lesson.worksheet?.student,lesson.worksheet?.studentB))return {worksheet:lesson.worksheet};
    try{return await createDistinctVersionB(data.request,lesson);}catch(error){friendly(error);}
  };
  if(betaEnabled()&&!isOwner(user))return betaStore().repairAlternate(user,data.request,generate);
  return generate(data.lesson);
 });
