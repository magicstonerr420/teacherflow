import { modelSetting } from "./model-settings.server.ts";

export class IllustrationBillingError extends Error {
  readonly code = 'image_billing';
  constructor() {
    super('OpenRouter blocked illustrations because the account balance or API-key spending allowance is insufficient. Check the OpenRouter account and key used by TeacherFlow, then retry.');
  }
}

export function illustrationBrief(prompt: string, age: string, level: string) {
  const years = Number.parseInt(age, 10);
  const style = Number.isFinite(years) && years <= 9
    ? "Young children: friendly simple shapes, clear silhouettes, a few concrete objects, cheerful colours, uncluttered composition. No abstract symbolism or frightening imagery."
    : Number.isFinite(years) && years <= 12
      ? "Older children: engaging illustrated scenes, clear visual storytelling, age-appropriate detail, no preschool styling."
      : Number.isFinite(years) && years < 18
        ? "Teenagers: contemporary editorial illustration, believable teen-relevant contexts, sophisticated colour palette. No preschool cartoons, babyish characters or childish clip art."
        : "Adults: polished editorial illustration, mature real-world contexts and professional visual design. No childish clip art.";
  const complexity = /^A[12]$/.test(level)
    ? "Beginner language level: make the target meaning immediately visible through concrete objects and actions, with few distracting details. Simplicity must not infantilize older students."
    : /^B[12]$/.test(level)
      ? "Intermediate language level: use clear contextual scenes that support description and discussion."
      : "Advanced language level: nuanced contextual scenes may support inference and discussion, while staying appropriate to the student's age. Advanced language does not imply adult content.";
  return `Create one original classroom illustration.\nStudents: age ${age}; English level ${level}.\n${style}\n${complexity}\nLesson visual: ${prompt}\nNo written words, letters, watermarks, logos or brands. The visual must teach the specified concept rather than decorate the slide.`;
}

export async function generateIllustration(prompt: string, age: string, level: string) {
  const key = process.env["OPENROUTER_API_KEY"]?.trim();
  if (!key) throw new Error("The OpenRouter image key is not configured.");
  const model = modelSetting("OPENROUTER_IMAGE_MODEL", "google/gemini-3.1-flash-image-preview");
  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    signal: AbortSignal.timeout(180_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: illustrationBrief(prompt, age, level),
      aspect_ratio: "4:3",
      ...(model === "google/gemini-3.1-flash-image-preview" ? { resolution: "1K" } : {}),
      n: 1,
    }),
  });
  if (response.status === 402) throw new IllustrationBillingError();
  if (!response.ok) throw new Error("OpenRouter could not generate an illustration. Please retry.");
  const result = await response.json();
  const item = result?.data?.[0];
  const url = typeof item?.b64_json === "string" && /^image\/(png|jpeg|webp)$/.test(item.media_type)
    ? `data:${item.media_type};base64,${item.b64_json}` : null;
  if (typeof url !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(url)) {
    throw new Error("The image provider did not return a usable illustration.");
  }
  return url;
}
