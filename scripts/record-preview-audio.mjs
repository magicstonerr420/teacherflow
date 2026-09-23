// Run explicitly with --env-file=.env.local --experimental-transform-types.
// The checked-in media is reused by every visitor. Uncertain calls are never retried here.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {generateSpeech} from '../src/lib/speech.server.ts';
import {previews} from './preview-content.mjs';
const checkpoint=process.env.PREVIEW_AUDIO_CHECKPOINT;
if(!checkpoint)throw Error('Set PREVIEW_AUDIO_CHECKPOINT to a private working path.');
fs.mkdirSync(path.dirname(checkpoint),{recursive:true});
const records=fs.existsSync(checkpoint)?JSON.parse(fs.readFileSync(checkpoint,'utf8')):{};
for(const preview of previews){
 const script=preview.listening.script;
 const hash=createHash('sha256').update(script).digest('hex');
 const destination=path.resolve(`public/previews/v1/${preview.slug}.mp3`);
 const prior=records[preview.slug];
 if(prior?.status==='complete'&&prior.scriptHash===hash&&fs.existsSync(destination)){console.log('Reusing '+preview.slug);continue;}
 if(prior)throw Error('Recording already attempted or changed; inspect checkpoint before any new purchase: '+preview.slug);
 const words=script.split(/\s+/u).length;
 if(words<160||words>300||script.length>3500)throw Error('Invalid script length: '+preview.slug);
 records[preview.slug]={status:'attempted',scriptHash:hash,started:new Date().toISOString()};
 fs.writeFileSync(checkpoint,JSON.stringify(records,null,2));
 try{
  const result=await generateSpeech(script,'economy');
  fs.writeFileSync(destination,result.bytes);
  records[preview.slug]={...records[preview.slug],status:'complete',bytes:result.bytes.length,model:result.model,voice:result.voice,audioHash:createHash('sha256').update(result.bytes).digest('hex')};
  fs.writeFileSync(checkpoint,JSON.stringify(records,null,2));console.log('Recorded '+preview.slug+' ('+result.bytes.length+' bytes)');
 }catch(error){records[preview.slug].error=error.message;fs.writeFileSync(checkpoint,JSON.stringify(records,null,2));throw error;}
}
