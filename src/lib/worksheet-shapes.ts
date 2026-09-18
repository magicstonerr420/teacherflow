import { colorShapeResources } from './color-shape-resources';
import type { LessonRequestInput, Worksheet } from './lesson-schema';

/** A and B, every age: preserve the tested attribute while replacing generic swatches. */
export function prepareShapeWorksheet(doc: Worksheet['student'], request: Pick<LessonRequestInput, 'requiredVocabulary'>) {
  const resources = colorShapeResources(request);
  if (!resources) return doc;
  return { ...doc, sections: doc.sections.map(section => {
    let colorIndex = 0, shapeIndex = 0;
    return { ...section, items: section.items.map(item => {
      const key = item.visual?.trim().toLowerCase();
      if (!key) return item;
      // Keep intended color-in tasks blank. Exact color+shape clues remain exact.
      if (/\b(?:color|colour|paint|shade)\s+(?:in\s+)?(?:the|each|this|a|all)\b/i.test(`${section.instructions} ${item.prompt}`)) return item;
      if (resources.colors.includes(key)) return { ...item, visual: `${key} ${resources.shapes[colorIndex++ % resources.shapes.length]}` };
      if (resources.shapes.includes(key)) return { ...item, visual: `${resources.colors[shapeIndex++ % resources.colors.length]} ${key}` };
      return item;
    }) };
  }) };
}
