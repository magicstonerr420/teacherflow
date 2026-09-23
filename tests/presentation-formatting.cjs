const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const origin=process.env.TEST_ORIGIN || 'http://127.0.0.1:3000';
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const page=await browser.newPage({viewport:{width:1400,height:1100}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    let aiRequests=0;
    await page.route('**/api/generate-image',r=>{aiRequests++;return r.abort();});
    await page.route('**/formatting-test',r=>r.fulfill({contentType:'text/html',body:'<html><body><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></body></html>'}));
    await page.goto(origin+'/formatting-test');
    const fixture=JSON.parse(await fs.readFile('tests/young-data.json','utf8'));
    const result=await page.evaluate(async fixture=>{
      const {buildPresentationBlob}=await import('/src/lib/pptx.ts');
      const {JSZip,mount}=await import('/tests/young-fixture.tsx');
      const {picturePng}=await import('/src/lib/young-learners.ts');
      const base={number:1,title:'toys and Play',layout:'content',studentText:'Today we ask for a toy. Look. Listen. Say the toy.',bullets:[],vocabulary:[],highlightWords:['ask','toy'],interaction:'Practise with your partner.',teacherNote:'Pupils practised yesterday.',purpose:'Recognise toys.',visualSuggestion:'',imagePrompt:'colourful toys'};
      const ball={...base,number:2,title:'toy words',layout:'vocabulary',studentText:'',vocabulary:[{word:'ball',definition:'A round toy you can throw or kick.',example:'I want a ball.',imagePrompt:'colourful ball'}]};
      const lesson={...fixture.lesson,presentation:{slides:[base,ball]}};
      // Keep this fixture free of unrelated material references that would add flashcards.
      lesson.overview.materialsNeeded=[];
      lesson.activity={}; lesson.lessonPlan={}; lesson.teacherNotes={};
      const request={...fixture.request,topic:'toys and Play'};
      const before=JSON.stringify(lesson);
      const picture=await picturePng('ball');
      const images={'colourful toys':picture,'colourful ball':picture};
      const decks=[];
      for(const studentAge of ['5-7','14-16']){
        const teenSlide={...base,number:3,title:'useful Speaking Expressions',studentText:'',imagePrompt:'',bullets:['Have you ever...?', 'Yes, I have. / No, I haven’t.', 'I have never... / I have already...', 'When did you do it?', 'Who were you with?'],highlightWords:['Have you ever','never','already'],interaction:'Practise one short exchange with your partner. Include one follow-up question.'};
        const deckLesson=studentAge==='14-16'?{...lesson,presentation:{slides:[base,ball,teenSlide]}}:lesson;
        const blob=await buildPresentationBlob(deckLesson,{...request,studentAge},images);
        const zip=await JSZip.loadAsync(await blob.arrayBuffer());
        const names=Object.keys(zip.files).filter(k=>/^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
        const slides=[];
        for(const name of names){
          const xml=await zip.file(name).async('string');
          const doc=new DOMParser().parseFromString(xml,'application/xml');
          const shapes=[...doc.getElementsByTagName('p:sp')].map(sp=>{
            const off=sp.getElementsByTagName('a:off')[0],ext=sp.getElementsByTagName('a:ext')[0];
            return {text:[...sp.getElementsByTagName('a:t')].map(t=>t.textContent).join(''),x:Number(off?.getAttribute('x'))/914400,y:Number(off?.getAttribute('y'))/914400,h:Number(ext?.getAttribute('cy'))/914400};
          }).filter(s=>s.text);
          slides.push({xml,shapes});
        }
        const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
        decks.push({age:studentAge,slides,data:btoa(binary)});
      }
      mount({lesson,request});
      return {decks,unchanged:JSON.stringify(lesson)===before};
    },fixture);
    assert.equal(result.unchanged,true);
    await fs.mkdir('.local-runtime/presentation-formatting-review',{recursive:true});
    for(const deck of result.decks){
      await fs.writeFile(`.local-runtime/presentation-formatting-review/${deck.age}.pptx`,Buffer.from(deck.data,'base64'));
      const intro=deck.slides[1],vocab=deck.slides[2];
      assert.ok(intro.shapes.some(s=>s.text==='Toys and Play'));
      assert.ok(vocab.shapes.some(s=>s.text==='Ball'));
      assert.ok(intro.shapes.some(s=>s.text==='Practice with your partner.'));
      assert.doesNotMatch(deck.slides.map(s=>s.xml).join(''),/Practise|practised/);
      assert.match(intro.xml,/algn="just"/);
      if(deck.age==='5-7'){
        const lines=intro.shapes.filter(s=>s.x===0.85&&s.y>=1.55&&s.y<4.2);
        assert.deepEqual(lines.map(s=>s.text),['Today we ask for a toy.','Look.','Listen.','Say the toy.']);
        for(let i=1;i<lines.length;i++)assert.ok(lines[i].y-lines[i-1].y>0.5);
        assert.ok(lines.every(s=>s.y+s.h<4.2));
        const example=vocab.shapes.find(s=>s.text==='I want a ball.');
        const definition=vocab.shapes.filter(s=>s.x===0.85&&s.y>=1.55&&s.y<example.y);
        assert.ok(example.y-definition.at(-1).y>0.5);
      }else {
        assert.match(intro.xml,/<a:spcAft><a:spcPts val="1200"\/><\/a:spcAft>/);
        assert.ok(deck.slides[3].shapes.some(s=>s.text==='Practice one short exchange with your partner. Include one follow-up question.'));
        assert.equal((deck.slides[3].xml.match(/<a:buChar/g)||[]).length,5);
      }
    }
    await page.getByRole('heading',{name:'Toys and Play',exact:true}).waitFor();
    assert.ok(await page.getByText('Ball',{exact:true}).count()>0);
    const gap=await page.getByText('Look.',{exact:true}).evaluate(el=>{
      const p=el.closest('p');return p.getBoundingClientRect().top-p.previousElementSibling.getBoundingClientRect().bottom;
    });
    assert.ok(gap>=19);
    await page.screenshot({path:'.local-runtime/presentation-formatting-review/preview.png',fullPage:true});
    assert.equal(aiRequests,0);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ages:result.decks.map(d=>d.age),capitalizedHeadings:true,paragraphGaps:true,americanSpelling:true,paidImageRequests:aiRequests,originalUnchanged:result.unchanged}));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
