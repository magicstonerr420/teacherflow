// Uses the same browser PDF/PowerPoint exporter as the product, then checks in ready downloads.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');const path=require('node:path');
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:4201';
(async()=>{
 const {previews}=await import('./preview-content.mjs');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('**/*',r=>r.request().url().startsWith(origin)&&!r.request().url().includes('/_serverFn/')&&!r.request().url().includes('/api/')?r.continue():r.abort());
  await page.goto(origin+'/examples');
  for(const p of previews){
   const files=await page.evaluate(async slug=>{
    const {lesson,request}=await(await fetch('/previews/v1/'+slug+'.json')).json();
    const ex=await import('/src/lib/exports.ts');
    const {loadPresentationTools}=await import('/src/lib/presentation-tools.ts');
    const {pictureSvg}=await import('/src/lib/young-learners.ts');
    const toBase64=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});
    const audio=await(await fetch('/previews/v1/'+slug+'.mp3')).blob();
    const result=await ex.buildLessonPackageZip(lesson,request,{},'data:audio/mpeg;base64,'+await toBase64(audio));
    const {JSZip}=await loadPresentationTools();const zip=await JSZip.loadAsync(result.blob);
    const guide=await ex.buildCompleteLessonPdf(lesson,request);
    zip.file('Complete_Teacher_Guide.pdf',new Uint8Array(await guide.arrayBuffer()));
    for(const version of ['A','B']){
     const key=await ex.buildAnswerKeyPdf(version==='B'?{...lesson,assessment:lesson.versionB}:lesson,request,version);
     zip.file(`Teacher_Answer_Key_${version}.pdf`,new Uint8Array(await key.arrayBuffer()));
    }
    // Keep assessment questions student-facing, with the rubric and both keys separate.
    for(const [version,set] of [['A',lesson.assessment],['B',lesson.versionB]]){
     const doc={title:set.title,instructions:'Complete the tasks your teacher assigns.',sections:[{label:'Assessment',title:set.title,format:'short-answer',instructions:'Give your own response.',passage:'',wordBank:[],items:set.questions.map((q,i)=>({number:i+1,prompt:q.prompt,choices:[],answerLines:3,visual:''}))}]};
     const student=await ex.studentPdf(doc,request);zip.file(`Student_Assessment_${version}.pdf`,new Uint8Array(await student.arrayBuffer()));
     zip.file(`Teacher_Assessment_Key_${version}.txt`,[set.title,set.instructions,...set.questions.map((q,i)=>`${i+1}. ${q.prompt}\nModel answer: ${q.answer}`)].join('\n\n'));
    }
    if(/^5|^8/.test(request.studentAge))for(const word of request.requiredVocabulary.split(/,\s*/)){const svg=pictureSvg(word);if(!svg)throw Error('Missing card: '+word);zip.file('Picture_Cards/'+word+'.svg',svg);}
    zip.file('START_HERE.txt',`TeacherFlow — ${request.topic}\n\nOpen Complete_Teacher_Guide.pdf for the plan, activities, homework, support and challenge.\nStudent_Worksheet files contain the reading and listening questions. Use the matching Teacher_Answer_Key_A or B.\nStudent_Assessment_A and B are optional independent checks; teacher rubric and model responses are separate.\nThe PowerPoint contains student material only. Teaching notes are in Presentation_Teacher_Guide.pdf. Picture cards, where required, are also included in the PowerPoint.\nThe MP3 uses an AI-generated American English voice. For no-technology classes, read the exact script from Listening_Teacher_Copy.pdf.\nCases and named organizations in these previews are fictional. No external reading, subscription or image search is required.\nDo not give teacher documents or the full ZIP to students. Select student files only.\n`);
    const bundle=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
    const ppt=result.files.find(f=>f.name.endsWith('.pptx')).blob;
    const slideGuide=result.files.find(f=>f.name.endsWith('_Presentation_Teacher_Guide.pdf')).blob;
    return [{name:slug+'.zip',b64:await toBase64(bundle)},{name:slug+'.pptx',b64:await toBase64(ppt)},{name:slug+'-guide.pdf',b64:await toBase64(guide)},{name:slug+'-slides-guide.pdf',b64:await toBase64(slideGuide)}];
   },p.slug);
   for(const file of files)await fs.writeFile(path.resolve('public/previews/v1',file.name),Buffer.from(file.b64,'base64'));
   console.log('Exported '+p.slug+' ('+files.length+' ready downloads)');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
