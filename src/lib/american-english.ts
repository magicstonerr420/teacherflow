export const AMERICAN_ENGLISH_RULES = `Use American English consistently for every age group and every lesson component, including slides, instructions, worksheets, answer keys, examples, and teacher notes. Use practice/practices/practiced/practicing for the verb as well as practice for the noun; use color, favorite, center, organize, recognize, traveled, and canceled. Use American vocabulary and grammar in original examples. Do not alternate between British and American forms. Preserve proper names, URLs, and exact source quotations.`;

// A bounded spelling guard for common classroom words, not a broad suffix rewrite
// (which would damage words such as "exercise" or "surprise").
const SPELLINGS: Record<string, string> = {
  practise: 'practice', practises: 'practices', practised: 'practiced', practising: 'practicing',
  colour: 'color', colours: 'colors', coloured: 'colored', colouring: 'coloring', colourful: 'colorful',
  favourite: 'favorite', favourites: 'favorites',
  organise: 'organize', organises: 'organizes', organised: 'organized', organising: 'organizing',
  recognise: 'recognize', recognises: 'recognizes', recognised: 'recognized', recognising: 'recognizing',
  behaviour: 'behavior', behaviours: 'behaviors', behavioural: 'behavioral',
  travelled: 'traveled', travelling: 'traveling', traveller: 'traveler', travellers: 'travelers',
  cancelled: 'canceled', cancelling: 'canceling',
  modelling: 'modeling', modelled: 'modeled',
  artefact: 'artifact', artefacts: 'artifacts', humour: 'humor',
};

export function americanEnglish(text: string): string {
  // Keep addresses and identifiers intact even when they contain a matched word.
  return text.replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]+|\b[a-z]+\b/gi, word => {
    const replacement = SPELLINGS[word.toLowerCase()];
    if (!replacement) return word;
    if (word === word.toUpperCase()) return replacement.toUpperCase();
    if (word === word.toLowerCase()) return replacement;
    if (word === word[0]!.toUpperCase() + word.slice(1).toLowerCase())
      return replacement[0]!.toUpperCase() + replacement.slice(1);
    return word;
  });
}

const PRESERVE_FIELDS = new Set(['imagePrompt', 'id', 'url', 'href', 'src', 'sourceUrl', 'quote', 'evidenceQuote']);

/** Only new generated content/display copies pass here; saved originals are not mutated. */
export function americanEnglishContent<T>(value: T): T {
  if (typeof value === 'string') return americanEnglish(value) as T;
  if (Array.isArray(value)) return value.map(americanEnglishContent) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, child]) =>
      [key, PRESERVE_FIELDS.has(key) ? child : americanEnglishContent(child)],
    )) as T;
  return value;
}
