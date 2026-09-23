import test from 'node:test';
import assert from 'node:assert/strict';
import {readBuilderSettings,writeBuilderSettings} from '../src/lib/builder-settings.ts';
const defaults={subject:'English',topic:'',studentAge:'',level:'',durationMinutes:60,mainSkill:'',secondarySkill:null,learningObjective:'',groupWorkEnabled:false,studentsPerGroup:null};
test('unfinished settings persist before validation and stay scoped to their account',()=>{
 const rows=new Map(),storage={getItem:key=>rows.get(key),setItem:(key,value)=>rows.set(key,value)};
 const incomplete={...defaults,topic:'Climate',level:'C2',studentsPerGroup:4};
 assert.equal(writeBuilderSettings(storage,'one',incomplete),true);
 assert.deepEqual(readBuilderSettings(storage,'one',defaults),incomplete);
 assert.deepEqual(readBuilderSettings(storage,'two',defaults),defaults);
 rows.set('teacherflow-builder-settings:v1:one','broken JSON');
 assert.deepEqual(readBuilderSettings(storage,'one',defaults),defaults);
 rows.set('teacherflow-builder-settings:v1:one',JSON.stringify({version:1,form:{topic:[],durationMinutes:-1,studentsPerGroup:'bad',groupWorkEnabled:'yes',arbitrary:'unknown'}}));
 assert.deepEqual(readBuilderSettings(storage,'one',defaults),defaults);
});
test('unavailable browser storage cannot prevent the builder from opening',()=>{
 const unavailable={getItem(){throw Error('Disabled');},setItem(){throw Error('Quota');}};
 assert.deepEqual(readBuilderSettings(unavailable,'one',defaults),defaults);
 assert.equal(writeBuilderSettings(unavailable,'one',defaults),false);
});
