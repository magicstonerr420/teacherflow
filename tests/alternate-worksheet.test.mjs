import assert from 'node:assert/strict';
import { createServer } from 'vite';
import path from 'node:path';
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, resolve: { alias: { '@': path.resolve('src') } } });
try {
 const { generateAlternateWorksheet } = await server.ssrLoadModule('/src/lib/alternate-worksheet.server.ts');
 const request = { subject: 'English', topic: 'Weather and Clothes', studentAge: '5-7', level: 'A1', mainSkill: 'Listening', secondarySkill: 'Vocabulary', durationMinutes: 60, technologyAvailable: 'Board only', learningObjective: 'Identify weather and clothes.', requiredVocabulary: 'Sun, Rain, Shirt, Shoes, Hat' };
 const words = ['sun', 'rain', 'shirt', 'shoes', 'hat'];
 const doc = { title: 'A', instructions: 'Circle the word.', sections: words.map((word, index) => ({ label: `Section ${index+1}`, title: word, instructions: 'Look at the picture. Circle one word.', format: 'multiple-choice', passage: '', wordBank: [], items: words.map((visual,i) => ({ number: i+1, prompt: `Name the picture ${index+1}.`, visual, choices: words, answerLines: 0 })) })) };
 const prior = { worksheet: { student: doc }, listening: { status: 'failed', error: 'Not needed for core worksheet' } };
 const before = JSON.stringify(prior);
 const valid = structuredClone(doc);
 valid.title = 'B';
 valid.sections.forEach((s, index) => { s.format = ['matching','short-answer','matching','multiple-choice','multiple-choice'][index]; s.instructions = 'Look at the picture. Is the sentence right? Circle Yes or No.'; s.items.forEach((item,i) => { item.prompt = `This is ${words[(i+index)%5]}.`; item.choices=['Yes','No']; }); });
 const missing = structuredClone(valid); missing.sections[0].items[0].visual='';
 const responses=[doc,missing,valid], calls=[];
 const result = await generateAlternateWorksheet(request, prior, async args => {
  calls.push(args);
  const patch = { worksheet: { studentB: structuredClone(responses[calls.length-1]) } };
  args.schema.parse(patch); return patch;
 });
 assert.equal(calls.length,3);
 assert.match(calls[1].input,/REJECTED VERSION B DRAFT/);
 assert.match(calls[1].input,/Repeated items to replace: section 1, item 1/);
 assert.match(calls[2].input,/missing picture/);
 assert.ok(calls.every(c=>c.noTech && c.system.includes('dedicated listening script')));
 assert.ok(!calls[0].input.includes('Stay perfectly consistent with everything already designed'));
 assert.deepEqual(result.worksheet.studentB, valid);
 assert.equal(JSON.stringify(prior),before);
 let failedCalls=0;
 await assert.rejects(generateAlternateWorksheet(request, prior, async()=>{ failedCalls++; return { worksheet: { studentB: structuredClone(doc) } }; }), /alternate worksheet still needs revised questions/);
 assert.equal(failedCalls,3,'Bound paid repair requests');
 assert.equal(JSON.stringify(prior),before);
 let providerCalls=0;
 await assert.rejects(generateAlternateWorksheet(request, prior, async()=>{ providerCalls++; throw Error('credits'); }), /credits/);
 assert.equal(providerCalls,1,'Do not retry a provider billing failure');
 console.log('PASS: duplicate draft receives exact item feedback; picture errors are repaired; Version A is unchanged; invalid worksheets are never accepted; repair and billing retries are bounded.');
} finally { await server.close(); }
